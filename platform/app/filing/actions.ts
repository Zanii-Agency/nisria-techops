"use server";
import { admin } from "../../lib/supabase-admin";
import { emit } from "../../lib/events";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth";

// OWNER CRUD for Filing (2026-07-23). documents rows are auto-filed from Drive by the
// extractor; the classifier can mislabel title/folder/type/brand, or the AI summary can
// miss the mark. Nur corrects any of that here — this only touches the DESCRIBING
// metadata. drive_file_id, mime, size_bytes, drive_url, doc_date, extracted_text and
// source stay Drive-sourced and are never hand-edited from the portal.
//
// ARCHIVE was preferred per doctrine but the documents table (db/schema.sql) has no
// status/archived column and none was invented (DDL-locked). No table has an FK into
// documents(id) either, so a real delete is schema-safe: it un-files the record from
// the portal's index. The original file in Drive is never touched by this action.

const BRANDS = new Set(["nisria", "maisha", "ahadi"]);

export async function updateDocument(fd: FormData) {
  const id = String(fd.get("id") || "").trim();
  if (!id) return;
  const user = getCurrentUser();
  const db = admin();
  const { data: cur } = await db.from("documents").select("id,title,folder").eq("id", id).single();
  if (!cur) return;

  const str = (k: string) => String(fd.get(k) ?? "").trim();
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  patch.title = str("title") || cur.title || "Untitled document"; // title stays populated
  for (const f of ["folder", "subfolder", "doc_type"]) patch[f] = str(f) || null;
  const b = str("brand");
  patch.brand = BRANDS.has(b) ? b : null;
  patch.summary = str("summary") || null;

  const { error } = await db.from("documents").update(patch).eq("id", id);
  if (error) {
    await emit({ type: "document.edit_failed", source: "filing", actor: user?.name || "operator", subject_type: "document", subject_id: id, payload: { error: error.message } });
    return;
  }
  await emit({ type: "document.edited", source: "filing", actor: user?.name || "Nur", subject_type: "document", subject_id: id, payload: { title: patch.title, folder: patch.folder } });
  revalidatePath(`/filing/${id}/edit`);
  revalidatePath("/filing");
  redirect(`/filing?folder=${encodeURIComponent(patch.folder || "General")}`);
}

// DELETE = "remove from Filing" (see header note: no status/archived column exists to
// archive into, so this is the considered fallback). Un-files the row; the source file
// in Drive is untouched.
export async function deleteDocument(fd: FormData) {
  const id = String(fd.get("id") || "").trim();
  if (!id) return;
  const user = getCurrentUser();
  const db = admin();
  const { data: cur } = await db.from("documents").select("id,title").eq("id", id).single();
  if (!cur) redirect("/filing");

  const { error } = await db.from("documents").delete().eq("id", id);
  if (error) {
    await emit({ type: "document.delete_failed", source: "filing", actor: user?.name || "operator", subject_type: "document", subject_id: id, payload: { error: error.message } });
    return;
  }
  await emit({ type: "document.deleted", source: "filing", actor: user?.name || "Nur", subject_type: "document", subject_id: id, payload: { title: cur?.title } });
  revalidatePath("/filing");
  redirect("/filing");
}
