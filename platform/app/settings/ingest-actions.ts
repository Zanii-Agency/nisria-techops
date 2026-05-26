"use server";
// R3-4 / P7,P8,P10: the server entry points for the ingestion pipeline, voice,
// multi-entry brain records, and logos. The heavy routing lives in lib/ingest.ts
// (called by the background worker); these are the thin "use server" actions the
// Settings UI invokes. Everything non-blocking returns fast.
import { admin } from "../../lib/supabase-admin";
import { emit } from "../../lib/events";
import { rememberUpsert } from "../../lib/memory";
import { humanize } from "../../lib/humanize";
import { BRAIN_SECTIONS, sectionSpec, type SectionKey } from "../../lib/brain";
import { listEntries, upsertEntry, deleteEntry } from "../../lib/brain-store";
import { saveLogo, deleteLogo } from "../../lib/logos";
import { createBatch, batchForReview, applyBatch, type Route } from "../../lib/ingest";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// SINGLE-SECTION APPEND (used by the ingest router). Appends a routed fact to a
// single-value org_profile section without clobbering what is there, then
// re-mirrors the section into agent_memory so recall stays current. NOT exported
// as a form action; called server-side by lib/ingest.ts.
// ---------------------------------------------------------------------------
export async function saveBrainFromIngest(
  section: SectionKey,
  content: string,
  title: string,
  channel: string,
  attribution: string,
): Promise<void> {
  const spec = BRAIN_SECTIONS.find((s) => s.key === section);
  if (!spec || !content.trim()) return;
  const db = admin();
  const { data: existing } = await db.from("org_profile").select("content").eq("section", section).maybeSingle();
  const prev = (existing?.content || "").trim();
  const addition = title && title.toLowerCase() !== "imported note" ? `${title}: ${content.trim()}` : content.trim();
  const merged = prev ? `${prev}\n\n${addition}` : addition;

  const memId = await rememberUpsert({
    kind: spec.memKind,
    brand: section === "voice" ? "nisria" : null,
    title: spec.memTitle,
    content: merged,
    source_type: "org_profile",
    slug: `org_profile:${section}`,
    metadata: { section },
  });
  await db.from("org_profile").upsert(
    { section, content: merged, data: {}, memory_id: memId, updated_by: attribution, updated_at: new Date().toISOString() },
    { onConflict: "section" },
  );
  await emit({ type: "brain.updated", source: "ingest", actor: attribution, subject_type: "org_profile", payload: { section, via: channel } });
}

// ---------------------------------------------------------------------------
// VOICE -> BRAIN (P7/177). A mic on a Brain section: the transcript is humanized
// and saved to that section. For a single section this appends; for a multi
// section it adds one entry. Returns fast.
// ---------------------------------------------------------------------------
export async function saveVoiceToSection(fd: FormData): Promise<void> {
  const section = String(fd.get("section") || "") as SectionKey;
  const transcript = String(fd.get("transcript") || "").trim();
  const spec = sectionSpec(section);
  if (!spec || !transcript) return;
  const clean = humanize(transcript, {});
  if (spec.multi) {
    const title = clean.split(/[.\n]/)[0].slice(0, 80) || (spec.entryLabel || "entry");
    await upsertEntry({ section, title, content: clean, source: "voice", actor: "Nur" });
  } else {
    await saveBrainFromIngest(section, clean, "", "voice", "Nur");
  }
  await emit({ type: "brain.voice_captured", source: "voice", actor: "Nur", subject_type: "org_profile", payload: { section } });
  revalidatePath("/settings");
}

// ---------------------------------------------------------------------------
// MULTI-ENTRY CRUD (P10). The "Programs" and "Programs and impact" sections hold
// a list. Add/edit/remove an entry; each is its own row + its own org_fact.
// ---------------------------------------------------------------------------
export async function addBrainEntry(fd: FormData): Promise<void> {
  const section = String(fd.get("section") || "") as SectionKey;
  const title = String(fd.get("title") || "");
  const content = String(fd.get("content") || "");
  const id = String(fd.get("id") || "") || null;
  await upsertEntry({ section, title, content, id, source: "manual", actor: "Nur" });
  revalidatePath("/settings");
}

export async function removeBrainEntry(fd: FormData): Promise<void> {
  const id = String(fd.get("id") || "");
  if (id) await deleteEntry(id);
  revalidatePath("/settings");
}

export async function getSectionEntries(section: SectionKey) {
  return listEntries(section);
}

// ---------------------------------------------------------------------------
// LOGO upload + remove (P8). Reads the file server-side, stores the data URI +
// a Library copy, used by the signature + generated docs. Returns the data URI
// for an instant live preview.
// ---------------------------------------------------------------------------
export async function uploadLogo(fd: FormData): Promise<{ ok: boolean; data_uri?: string; error?: string }> {
  const brand = String(fd.get("brand") || "nisria").toLowerCase();
  const file = fd.get("logo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "no file" };
  const buf = Buffer.from(await file.arrayBuffer());
  const res = await saveLogo({ brand, buf, mime: file.type || "image/png", filename: file.name, actor: "Nur" });
  revalidatePath("/settings");
  return res;
}

export async function removeLogo(fd: FormData): Promise<void> {
  const brand = String(fd.get("brand") || "").toLowerCase();
  if (brand) await deleteLogo(brand);
  revalidatePath("/settings");
}

// ---------------------------------------------------------------------------
// INGESTION ENTRY POINTS (P7). Bulk file upload + voice/text drops create a
// batch and return its id; the worker classifies in the background. The UI then
// polls the review and confirms.
// ---------------------------------------------------------------------------

function classifyMime(mime: string): "image" | "pdf" | "document" | "video" | "other" {
  if (mime.startsWith("image/")) return "image";
  if (mime.includes("pdf")) return "pdf";
  if (mime.startsWith("video/")) return "video";
  if (mime.includes("word") || mime.includes("document") || mime.includes("text")) return "document";
  return "other";
}

// BULK FILE UPLOAD. Uploads every dropped file to the assets bucket, then makes
// one ingest batch over them. Returns the batch id for the review poll.
export async function ingestFiles(fd: FormData): Promise<{ batchId: string | null; count: number }> {
  const source = String(fd.get("source") || "upload");
  const attribution = String(fd.get("attribution") || "Nur");
  const files = fd.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { batchId: null, count: 0 };
  const db = admin();
  const inputs = [];
  for (const file of files) {
    const buf = Buffer.from(await file.arrayBuffer());
    const safe = file.name.replace(/[^a-z0-9._-]/gi, "_");
    const storage_path = `ingest/${Date.now()}-${safe}`;
    const { error } = await db.storage.from("assets").upload(storage_path, buf, { contentType: file.type || "application/octet-stream", upsert: false });
    if (error) continue;
    inputs.push({ channel: "file" as const, attribution, filename: file.name, mime: file.type || "application/octet-stream", storage_path });
  }
  const { batchId } = await createBatch({ source, attribution, inputs });
  revalidatePath("/settings");
  return { batchId, count: inputs.length };
}

// TEXT / VOICE-TRANSCRIPT DROP into the pipeline (used by "Drop everything",
// voice-to-pipeline, and the WhatsApp caller). One snippet -> one batch.
export async function ingestText(fd: FormData): Promise<{ batchId: string | null }> {
  const source = String(fd.get("source") || "text");
  const attribution = String(fd.get("attribution") || "Nur");
  const channelRaw = String(fd.get("channel") || "text");
  const channel = (["file", "voice", "text", "whatsapp"].includes(channelRaw) ? channelRaw : "text") as "voice" | "text" | "whatsapp";
  const text = String(fd.get("text") || "").trim();
  if (!text) return { batchId: null };
  const { batchId } = await createBatch({ source, attribution, inputs: [{ channel, attribution, text }] });
  revalidatePath("/settings");
  return { batchId };
}

// Poll the review for a batch (status + per-item proposed routes).
export async function reviewBatch(batchId: string) {
  if (!batchId) return { batch: null, items: [] };
  return batchForReview(batchId);
}

// CONFIRM the review. `adjustments` maps item id -> a partial Route the founder
// changed (e.g. moved an item from Library to the Brain). Applies everything.
export async function confirmBatch(batchId: string, adjustments: Record<string, Partial<Route>> = {}): Promise<{ applied: number }> {
  if (!batchId) return { applied: 0 };
  const res = await applyBatch(batchId, adjustments || {});
  revalidatePath("/settings");
  revalidatePath("/library");
  return res;
}
