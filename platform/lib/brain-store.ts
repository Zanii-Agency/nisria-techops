// R3-4 / P10: the multi-entry brain store. A handful of Brain sections (Programs,
// and the grant "Programs and impact") are naturally a LIST of distinct projects,
// not one textarea. Those live as rows in `brain_entries` (one row per project),
// each mirrored into agent_memory as its own org_fact so recall() can surface a
// single project, and each openable in a FocusTab to view/edit.
//
// Single-value sections keep using org_profile (see app/settings/actions.ts).
// This module is the ONE place multi-entry rows are written, so the memory
// grounding + events never drift. Server-only.
import { admin } from "./supabase-admin";
import { emit } from "./events";
import { remember, rememberUpsert } from "./memory";
import { BRAIN_SECTIONS, sectionSpec, type SectionKey } from "./brain";

export type BrainEntry = {
  id: string;
  section: string;
  brand: string | null;
  title: string;
  content: string;
  source: string | null;
  sort: number;
  created_at: string;
};

// All entries for a multi-entry section, oldest first (stable list order).
export async function listEntries(section: SectionKey): Promise<BrainEntry[]> {
  const { data } = await admin()
    .from("brain_entries")
    .select("id,section,brand,title,content,source,sort,created_at")
    .eq("section", section)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true });
  return (data || []) as BrainEntry[];
}

// Counts per multi-entry section (for the panel's "N captured" + completeness).
export async function entryCounts(sections: SectionKey[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (!sections.length) return out;
  const { data } = await admin().from("brain_entries").select("section").in("section", sections);
  for (const r of (data || []) as { section: string }[]) out[r.section] = (out[r.section] || 0) + 1;
  return out;
}

// Add (or update) one entry. Each entry becomes its OWN org_fact memory so an
// agent can recall a single project. The memory is upserted on the entry id, so
// editing an entry overwrites its grounding in place instead of piling up.
export async function upsertEntry(args: {
  section: SectionKey;
  title: string;
  content: string;
  id?: string | null;
  source?: string;
  brand?: string | null;
  actor?: string;
}): Promise<{ id: string | null }> {
  const spec = sectionSpec(args.section);
  if (!spec || !spec.multi) return { id: null };
  const title = (args.title || "").trim().slice(0, 200) || `${spec.entryLabel || "entry"}`;
  const content = (args.content || "").trim();
  if (!content && !args.id) return { id: null };
  const db = admin();
  const actor = args.actor || "Nur";

  // mirror THIS entry as its own org_fact so recall can surface one project
  const memText = `${title}\n${content}`.trim();
  const memId = content
    ? await rememberEntry(args.id || null, args.section, spec.memTitle, title, memText, args.brand ?? null)
    : null;

  if (args.id) {
    await db
      .from("brain_entries")
      .update({ title, content, memory_id: memId, updated_at: new Date().toISOString() })
      .eq("id", args.id);
    await emit({ type: "brain.entry_updated", source: "settings", actor, subject_type: "brain_entry", subject_id: args.id, payload: { section: args.section, title } });
    return { id: args.id };
  }

  const { data } = await db
    .from("brain_entries")
    .insert({ section: args.section, brand: args.brand ?? null, title, content, source: args.source || "manual", created_by: actor })
    .select("id")
    .single();
  const id = (data?.id as string) ?? null;
  if (id && memId) await db.from("brain_entries").update({ memory_id: memId }).eq("id", id);
  await emit({ type: "brain.entry_added", source: args.source || "settings", actor, subject_type: "brain_entry", subject_id: id, payload: { section: args.section, title, channel: args.source || "manual" } });
  return { id };
}

// SINGLE-SECTION APPEND (used by the ingest router). Appends a routed fact to a
// single-value org_profile section without clobbering what is there, then
// re-mirrors the section into agent_memory so recall stays current. Lives here
// (a pure server lib) so lib/ingest.ts can call it without a cycle through the
// "use server" actions file.
export async function appendToSection(
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

export async function deleteEntry(id: string): Promise<void> {
  const db = admin();
  const { data: row } = await db.from("brain_entries").select("memory_id,section").eq("id", id).maybeSingle();
  if (row?.memory_id) await db.from("agent_memory").delete().eq("id", row.memory_id);
  await db.from("brain_entries").delete().eq("id", id);
  await emit({ type: "brain.entry_deleted", source: "settings", actor: "Nur", subject_type: "brain_entry", subject_id: id, payload: { section: row?.section } });
}

// Write a per-entry org_fact, deduped on the entry id via metadata.slug so an
// edit overwrites in place. New entries (no id yet) just insert; the caller links
// memory_id back onto the row. Returns the memory row id.
async function rememberEntry(
  entryId: string | null,
  section: string,
  memTitle: string,
  title: string,
  content: string,
  brand: string | null,
): Promise<string | null> {
  const db = admin();
  const slug = entryId ? `brain_entry:${entryId}` : null;
  try {
    if (slug) {
      const { data: existing } = await db
        .from("agent_memory")
        .select("id")
        .eq("kind", "org_fact")
        .eq("metadata->>slug", slug)
        .maybeSingle();
      const row = { kind: "org_fact", brand, title: `${memTitle}: ${title}`, content, source_type: "brain_entry", metadata: { slug, section } };
      if (existing?.id) {
        await db.from("agent_memory").update(row).eq("id", existing.id);
        return existing.id as string;
      }
      const { data: ins } = await db.from("agent_memory").insert(row).select("id").single();
      return (ins?.id as string) ?? null;
    }
    // no id yet: plain insert, slug stamped later via update would over-engineer;
    // use remember() so it is still recallable, then link it.
    const { data: ins } = await db
      .from("agent_memory")
      .insert({ kind: "org_fact", brand, title: `${memTitle}: ${title}`, content, source_type: "brain_entry", metadata: { section } })
      .select("id")
      .single();
    return (ins?.id as string) ?? null;
  } catch {
    return null;
  }
}
