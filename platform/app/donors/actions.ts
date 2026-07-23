"use server";
import { admin } from "../../lib/supabase-admin";
import { emit } from "../../lib/events";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth";

const STATUSES = new Set(["prospect", "active", "lapsed", "major"]);

// MANUAL EDIT (2026-07-23). Owner data is forever the owner's to edit (KT #122): the founder
// can correct a donor's profile fields on the portal, not only via the bot (update_donor in
// smart-tools.ts). Lifetime value and gift history stay read-only here, they come from real
// rows in `donations`, never hand-typed. Nothing here is destructive: it updates in place.
export async function updateDonor(fd: FormData) {
  const id = String(fd.get("id") || "").trim();
  if (!id) return;
  const user = getCurrentUser();
  const db = admin();
  const { data: cur } = await db.from("donors").select("id,full_name").eq("id", id).single();
  if (!cur) return;

  const str = (k: string) => String(fd.get(k) ?? "").trim();
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  patch.full_name = str("full_name") || cur.full_name || "Donor"; // NOT NULL, never blank it
  patch.email = str("email") || null;
  patch.phone = str("phone") || null;
  const st = str("status");
  if (STATUSES.has(st)) patch.status = st;

  const { error } = await db.from("donors").update(patch).eq("id", id);
  if (error) {
    await emit({ type: "donor.edit_failed", source: "donors", actor: user?.name || "operator", subject_type: "donor", subject_id: id, payload: { error: error.message } });
    return;
  }
  await emit({ type: "donor.edited", source: "donors", actor: user?.name || "Nur", subject_type: "donor", subject_id: id, payload: { name: patch.full_name } });
  revalidatePath(`/donors/${id}`);
  revalidatePath("/donors");
  redirect(`/donors/${id}`);
}

// ARCHIVE, not delete (entity policy: a donor is a person with money history, so the record and
// its full gift ledger are always kept). The donors table is DDL-locked and has no archived/
// is_active column, only the existing `status` enum (prospect|active|lapsed|major). "lapsed"
// already IS the archive-equivalent state for a donor here: it is the value the bot's own
// update_donor tool writes to mean "no longer active", the record and every donation stay
// intact. Archiving reuses that existing column + existing value rather than inventing one.
export async function archiveDonor(fd: FormData) {
  const id = String(fd.get("id") || "").trim();
  if (!id) return;
  const user = getCurrentUser();
  const db = admin();
  const { data: cur } = await db.from("donors").select("id,full_name,status").eq("id", id).single();
  if (!cur) redirect("/donors");
  const { error } = await db.from("donors").update({ status: "lapsed", updated_at: new Date().toISOString() }).eq("id", id);
  if (error) {
    await emit({ type: "donor.archive_failed", source: "donors", actor: user?.name || "operator", subject_type: "donor", subject_id: id, payload: { error: error.message } });
    return;
  }
  await emit({ type: "donor.archived", source: "donors", actor: user?.name || "Nur", subject_type: "donor", subject_id: id, payload: { name: cur?.full_name, prior_status: cur?.status } });
  revalidatePath(`/donors/${id}`);
  revalidatePath("/donors");
  redirect(`/donors/${id}`);
}
