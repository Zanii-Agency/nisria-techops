// Resolve "attach a document" selections into real email attachments (R2-5 #43).
//
// The composer/reply UIs pass a list of opaque attachment refs:
//   "doc:<studio_documents.id>"   -> a Studio / grant-ready document (HTML in DB)
//   "asset:<assets.id>"           -> a Library asset (a file in the `assets` bucket)
//
// For Studio docs we render the branded HTML to PDF (headless Chrome) and attach
// that; if PDF is unavailable we attach the .html and label it clearly. For
// Library assets we download the stored bytes from the private bucket via the
// service client and attach them as-is. Everything runs server-side; nothing is
// fetched from the browser, and the bucket stays private.

import { admin } from "./supabase-admin";
import { htmlToPdf } from "./pdf";
import type { SendAttachment } from "./email";

export type ResolvedAttachments = {
  attachments: SendAttachment[];
  // human labels of what got attached, and in which format (for the log/thread)
  labels: { name: string; format: "pdf" | "html" | "file" }[];
};

function slugName(s: string, ext: string): string {
  const base = (s || "document").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 60) || "document";
  return `${base}.${ext}`;
}

// Parse the selected refs the form submitted (comma or newline separated, or a
// JSON array). Tolerant: drops anything that is not a known ref shape.
export function parseAttachRefs(raw: string | null | undefined): string[] {
  if (!raw) return [];
  let parts: string[] = [];
  const s = String(raw).trim();
  if (s.startsWith("[")) {
    try { parts = JSON.parse(s); } catch { parts = []; }
  } else {
    parts = s.split(/[\n,]+/);
  }
  return parts
    .map((p) => String(p).trim())
    .filter((p) => /^(doc|asset):[0-9a-f-]{8,}$/i.test(p))
    .slice(0, 5); // cap attachments per email
}

export async function resolveAttachments(refs: string[]): Promise<ResolvedAttachments> {
  const out: ResolvedAttachments = { attachments: [], labels: [] };
  if (!refs.length) return out;
  const db = admin();

  for (const ref of refs) {
    const [kind, id] = ref.split(":");
    try {
      if (kind === "doc") {
        const { data: doc } = await db
          .from("studio_documents")
          .select("title,html")
          .eq("id", id)
          .maybeSingle();
        if (!doc?.html) continue;
        const pdf = await htmlToPdf(String(doc.html));
        if (pdf) {
          out.attachments.push({ filename: slugName(doc.title, "pdf"), content: pdf, contentType: "application/pdf" });
          out.labels.push({ name: doc.title, format: "pdf" });
        } else {
          out.attachments.push({ filename: slugName(doc.title, "html"), content: Buffer.from(String(doc.html), "utf-8"), contentType: "text/html" });
          out.labels.push({ name: doc.title, format: "html" });
        }
      } else if (kind === "asset") {
        const { data: asset } = await db
          .from("assets")
          .select("title,storage_path,mime,type")
          .eq("id", id)
          .maybeSingle();
        if (!asset?.storage_path) continue;
        const { data: blob, error } = await db.storage.from("assets").download(asset.storage_path);
        if (error || !blob) continue;
        const buf = Buffer.from(await blob.arrayBuffer());
        const mime = asset.mime || "application/octet-stream";
        // A stored Studio HTML doc in the Library -> try to render to PDF too.
        if (mime === "text/html") {
          const pdf = await htmlToPdf(buf.toString("utf-8"));
          if (pdf) {
            out.attachments.push({ filename: slugName(asset.title, "pdf"), content: pdf, contentType: "application/pdf" });
            out.labels.push({ name: asset.title, format: "pdf" });
            continue;
          }
        }
        const ext = (asset.storage_path.split(".").pop() || "").toLowerCase();
        const filename = ext && ext.length <= 5 ? slugName(asset.title.replace(/\.[a-z0-9]+$/i, ""), ext) : (asset.title || "attachment");
        out.attachments.push({ filename, content: buf, contentType: mime });
        out.labels.push({ name: asset.title, format: "file" });
      }
    } catch {
      // skip a single bad attachment; never block the rest of the send
      continue;
    }
  }
  return out;
}
