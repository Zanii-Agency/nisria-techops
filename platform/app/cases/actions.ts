"use server";
// Case lifecycle writes. A "case" is a potential beneficiary still in intake,
// stored on the beneficiaries table with intake_stage set and status='inactive'.
// These actions move a case along the pipeline. The gated AI intake that CREATES
// a case lives in ../beneficiaries/actions.ts (confirmCase) so all PII writes stay
// under the governed beneficiaries module. Service-role only, never a client path.
import { admin } from "../../lib/supabase-admin";
import { emit } from "../../lib/events";
import { remember } from "../../lib/memory";
import { pushApprovalRequest } from "../../lib/notify";
import { revalidatePath } from "next/cache";

const CASE_STAGES = ["prospect", "under_review", "pending_funds", "declined"];

// Fold a name into a case's "Dependents: a, b" line without duplicating it. Returns
// the new triage_notes text. The dependents list is the canonical home for family
// members who are NOT their own case (a child mentioned inside a parent's intake).
function addDependent(triage: string | null, depName: string): string {
  const name = depName.trim();
  const existing = String(triage || "");
  const m = existing.match(/Dependents:\s*(.*)/i);
  if (m) {
    const names = m[1].split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
    if (names.some((n) => n.toLowerCase() === name.toLowerCase())) return existing; // already there
    names.push(name);
    return existing.replace(/Dependents:\s*.*/i, `Dependents: ${names.join(", ")}`);
  }
  const line = `Dependents: ${name}`;
  return existing ? `${existing}\n${line}` : line;
}

// Move a case between non-terminal intake stages (e.g. under_review -> pending_funds).
// Does not graduate or reject. Use approveCase / declineCase for those.
export async function setCaseStage(fd: FormData) {
  const id = String(fd.get("id") || "");
  const stage = String(fd.get("stage") || "").toLowerCase();
  if (!id || !CASE_STAGES.includes(stage)) return;

  const db = admin();
  // Only act on rows that are actually cases, so this can never mutate an accepted
  // beneficiary by id.
  const { data: row } = await db
    .from("beneficiaries")
    .select("id,ref_code,intake_stage")
    .eq("id", id)
    .not("intake_stage", "is", null)
    .single();
  if (!row) return;

  await db.from("beneficiaries").update({ intake_stage: stage }).eq("id", id);

  await emit({
    type: "beneficiary.case_stage_changed",
    source: "cases",
    actor: "Nur",
    subject_type: "beneficiary",
    subject_id: id,
    payload: { ref: row.ref_code, from: row.intake_stage, to: stage },
  });

  revalidatePath("/cases");
  revalidatePath(`/beneficiaries/${id}`);
}

// APPROVE a case -> graduate it into a real, active beneficiary. Clears the intake
// stage and flips status to 'active' so it now counts as a beneficiary everywhere.
// Mirrors the grounding write that confirmBeneficiary does, since the person is now
// accepted: their private case context enters the service-role brain (never the
// public view, consent_public stays false until Nur publishes).
export async function approveCase(fd: FormData) {
  const id = String(fd.get("id") || "");
  if (!id) return;

  const db = admin();
  const { data: row } = await db
    .from("beneficiaries")
    .select("id,ref_code,program,gender,region,needs,intake_stage")
    .eq("id", id)
    .not("intake_stage", "is", null)
    .single();
  if (!row) return;

  await db
    .from("beneficiaries")
    .update({ intake_stage: null, status: "active" })
    .eq("id", id);

  await remember({
    kind: "org_fact",
    title: `Beneficiary intake: ${row.ref_code}`,
    content: `A child entered the ${row.program || "other"} program${row.gender ? `, ${row.gender}` : ""}${row.region ? `, from ${row.region}` : ""}.${row.needs ? ` Needs: ${row.needs}.` : ""}`,
    source_type: "beneficiary",
    source_id: id,
  });

  await emit({
    type: "beneficiary.case_approved",
    source: "cases",
    actor: "Nur",
    subject_type: "beneficiary",
    subject_id: id,
    payload: { ref: row.ref_code, program: row.program || null, from: row.intake_stage },
  });

  revalidatePath("/cases");
  revalidatePath("/beneficiaries");
  revalidatePath(`/beneficiaries/${id}`);
}

// DECLINE a case -> terminal intake_stage='declined'. The record is kept (audit
// trail of who we could not take on, and why) but never surfaces as a beneficiary.
export async function declineCase(fd: FormData) {
  const id = String(fd.get("id") || "");
  if (!id) return;
  const reason = String(fd.get("reason") || "").trim() || null;

  const db = admin();
  const { data: row } = await db
    .from("beneficiaries")
    .select("id,ref_code,intake_stage,triage_notes")
    .eq("id", id)
    .not("intake_stage", "is", null)
    .single();
  if (!row) return;

  const triage_notes = reason
    ? [row.triage_notes, `Declined: ${reason}`].filter(Boolean).join("\n\n")
    : row.triage_notes;

  await db
    .from("beneficiaries")
    .update({ intake_stage: "declined", triage_notes })
    .eq("id", id);

  await emit({
    type: "beneficiary.case_declined",
    source: "cases",
    actor: "Nur",
    subject_type: "beneficiary",
    subject_id: id,
    payload: { ref: row.ref_code, reason },
  });

  revalidatePath("/cases");
  revalidatePath(`/beneficiaries/${id}`);
}

// EDIT a case (owner power). Nur can fix the name, the needs, the dependents line,
// the region, or the program on a case the bot logged. Only fields she sends are
// changed; only ever touches a row that is still a case (intake_stage not null), so
// it can never silently rewrite an accepted beneficiary.
export async function editCase(fd: FormData) {
  const id = String(fd.get("id") || "");
  if (!id) return;
  const db = admin();
  const { data: row } = await db
    .from("beneficiaries").select("id,ref_code,intake_stage,triage_notes")
    .eq("id", id).not("intake_stage", "is", null).single();
  if (!row) return;

  const patch: any = {};
  const full_name = String(fd.get("full_name") || "").trim();
  if (full_name) patch.full_name = full_name.slice(0, 200);
  if (fd.has("needs")) patch.needs = String(fd.get("needs") || "").trim().slice(0, 600) || null;
  if (fd.has("dependents")) {
    const deps = String(fd.get("dependents") || "").split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
    const base = String(row.triage_notes || "").replace(/\n?Dependents:\s*.*/i, "").trim();
    patch.triage_notes = deps.length ? `${base ? base + "\n" : ""}Dependents: ${deps.join(", ")}` : (base || null);
  }
  if (fd.has("region")) { const r = String(fd.get("region") || "").trim().slice(0, 120); patch.region = r || null; patch.location = r || null; }
  if (fd.has("program")) { const p = String(fd.get("program") || "").trim(); if (["safe_house", "education", "rescue", "nutrition", "other"].includes(p)) patch.program = p; }
  if (!Object.keys(patch).length) return;

  await db.from("beneficiaries").update(patch).eq("id", id);
  await emit({ type: "beneficiary.case_edited", source: "cases", actor: "Nur", subject_type: "beneficiary", subject_id: id, payload: { ref: row.ref_code, fields: Object.keys(patch) } });
  revalidatePath("/cases");
  revalidatePath(`/beneficiaries/${id}`);
}

// MERGE a case INTO another (owner power). The classic fix for "the bot logged a
// child as their own case when they belong to a parent's family": fold this case's
// name into the parent's Dependents line, hand any photo to the parent if it has
// none, then remove the now-duplicate fragment. Both must be cases.
export async function mergeCase(fd: FormData) {
  const id = String(fd.get("id") || "");          // the fragment to fold in + remove
  const into = String(fd.get("into") || "");      // the parent case it belongs to
  if (!id || !into || id === into) return;
  const db = admin();
  const { data: frag } = await db.from("beneficiaries").select("id,ref_code,full_name,photo_asset_id,intake_stage").eq("id", id).not("intake_stage", "is", null).single();
  const { data: parent } = await db.from("beneficiaries").select("id,ref_code,full_name,triage_notes,photo_asset_id,intake_stage").eq("id", into).not("intake_stage", "is", null).single();
  if (!frag || !parent) return;

  const triage_notes = addDependent(parent.triage_notes, frag.full_name || "");
  const patch: any = { triage_notes };
  if (!parent.photo_asset_id && frag.photo_asset_id) patch.photo_asset_id = frag.photo_asset_id;
  await db.from("beneficiaries").update(patch).eq("id", into);

  // remove the fragment (it is now a dependent on the parent, not its own case)
  await db.from("beneficiaries").delete().eq("id", id).not("intake_stage", "is", null);

  await emit({ type: "beneficiary.case_merged", source: "cases", actor: "Nur", subject_type: "beneficiary", subject_id: into, payload: { merged_ref: frag.ref_code, merged_name: frag.full_name, into_ref: parent.ref_code, into_name: parent.full_name } });
  revalidatePath("/cases");
  revalidatePath(`/beneficiaries/${into}`);
}

// DELETE a case (owner power). Hard-removes the row. Guarded to intake_stage not
// null so it can NEVER delete an accepted, active beneficiary by id, only a case.
export async function deleteCase(fd: FormData) {
  const id = String(fd.get("id") || "");
  if (!id) return;
  const db = admin();
  const { data: row } = await db.from("beneficiaries").select("id,ref_code,full_name,intake_stage").eq("id", id).not("intake_stage", "is", null).single();
  if (!row) return;
  await db.from("beneficiaries").delete().eq("id", id).not("intake_stage", "is", null);
  await emit({ type: "beneficiary.case_deleted", source: "cases", actor: "Nur", subject_type: "beneficiary", subject_id: id, payload: { ref: row.ref_code, name: row.full_name } });
  revalidatePath("/cases");
}

// ASK NUR (owner-in-the-loop). When a case is ambiguous (e.g. a bare name the bot
// logged that might belong to a family), send Nur a WhatsApp asking her to decide,
// via the approval_request rail (goes to Nur only, logged, deduped 6h). She then
// merges, edits, or declines it in the portal. This is the bot asking the owner
// instead of guessing on a real person's record.
export async function askOwnerAboutCase(fd: FormData) {
  const id = String(fd.get("id") || "");
  if (!id) return;
  const db = admin();
  const { data: row } = await db
    .from("beneficiaries").select("id,ref_code,full_name,intake_stage").eq("id", id).not("intake_stage", "is", null).single();
  if (!row) return;
  const hint = String(fd.get("hint") || "").trim();
  const title = hint
    ? `Case "${row.full_name}": ${hint}`.slice(0, 150)
    : `Case "${row.full_name}" needs your decision: keep, merge, or remove?`.slice(0, 150);
  await pushApprovalRequest(db, { id: `case:${id}`, title, kind: "case_decision" });
  await emit({ type: "case.owner_asked", source: "cases", actor: "system", subject_type: "beneficiary", subject_id: id, payload: { ref: row.ref_code, title } });
  revalidatePath("/cases");
}

// REOPEN a declined case back to under_review (mistakes happen, funds free up).
export async function reopenCase(fd: FormData) {
  const id = String(fd.get("id") || "");
  if (!id) return;

  const db = admin();
  const { data: row } = await db
    .from("beneficiaries")
    .select("id,ref_code,intake_stage")
    .eq("id", id)
    .eq("intake_stage", "declined")
    .single();
  if (!row) return;

  await db.from("beneficiaries").update({ intake_stage: "under_review" }).eq("id", id);

  await emit({
    type: "beneficiary.case_stage_changed",
    source: "cases",
    actor: "Nur",
    subject_type: "beneficiary",
    subject_id: id,
    payload: { ref: row.ref_code, from: "declined", to: "under_review" },
  });

  revalidatePath("/cases");
  revalidatePath(`/beneficiaries/${id}`);
}
