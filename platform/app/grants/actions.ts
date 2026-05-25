"use server";
import { admin } from "../../lib/supabase-admin";
import { emit } from "../../lib/events";
import { revalidatePath } from "next/cache";
import { buildApplication } from "../../lib/agents/grant";

export async function addGrant(fd: FormData) {
  const funder = String(fd.get("funder") || "").trim();
  if (!funder) return;
  const program = String(fd.get("program") || "").trim() || null;
  const amount_requested = fd.get("amount_requested") ? Number(fd.get("amount_requested")) : null;
  const deadline = String(fd.get("deadline") || "").trim() || null;

  const { data: grant } = await admin()
    .from("grant_applications")
    .insert({ funder, program, amount_requested, deadline, status: "researching", currency: "USD" })
    .select()
    .single();

  await emit({
    type: "grant.added",
    source: "grants",
    actor: "Nur",
    subject_type: "grant",
    subject_id: grant?.id,
    payload: { funder, program, amount_requested, deadline },
  });
  revalidatePath("/grants");
}

// Pursue a discovered opportunity (from the grant hunter) → create a pipeline application.
export async function pursueOpportunity(fd: FormData) {
  const id = String(fd.get("id"));
  if (!id) return;
  const db = admin();
  const { data: o } = await db.from("grant_opportunities").select("*").eq("id", id).single();
  if (!o) return;
  const { data: grant } = await db.from("grant_applications").insert({
    funder: o.funder || o.title, program: o.title,
    amount_requested: o.amount_floor || o.amount_ceiling || null,
    deadline: o.close_date || null, status: "researching",
    currency: o.currency || "USD", link: o.url || null,
    notes: o.description ? `Discovered via ${o.source} (relevance ${Math.round((o.relevance_score || 0) * 100)}%).\n${o.description}` : null,
  }).select().single();
  await db.from("grant_opportunities").update({ pursued: true }).eq("id", id);
  await emit({ type: "grant.added", source: "grant-hunter", actor: "Nur", subject_type: "grant", subject_id: grant?.id, payload: { funder: o.funder, source: o.source } });
  revalidatePath("/grants");
}

// Prepare a COMPLETE, submission-ready application package for a grant.
// The Grant agent (lib/agents/grant.ts) fetches the funder page (if a link is
// present) to infer priorities, then writes the full package grounded in the
// real org context + the RUNBOOK playbook. The package is saved into
// `notes` and the grant moves to `review` — only review + one-tap submit left.
//
// (Auto-fill / auto-submit to the funder's portal via a browser is the next
// phase; this v1 prepares 100% of the written package, nothing is submitted.)
export async function prepareGrant(fd: FormData) {
  const id = String(fd.get("id"));
  if (!id) return;
  const db = admin();
  const { data: g } = await db.from("grant_applications").select("*").eq("id", id).single();
  if (!g) return;

  const pkg = await buildApplication({
    funder: g.funder,
    program: g.program,
    amount_requested: g.amount_requested,
    currency: g.currency,
    deadline: g.deadline,
    link: g.link,
  });

  await db.from("grant_applications").update({ notes: pkg, status: "review" }).eq("id", id);

  await emit({
    type: "grant.prepared",
    source: "agent:grants",
    actor: "AI",
    subject_type: "grant",
    subject_id: id,
    payload: { funder: g.funder, program: g.program, funder_page: g.link ? "fetched" : "none" },
  });
  revalidatePath("/grants");
}

// Back-compat alias: anything still calling draftGrant now prepares the full
// package via the Grant agent.
export const draftGrant = prepareGrant;

// Move a grant along the pipeline: researching → drafting → submitted → won|lost.
export async function advanceStatus(fd: FormData) {
  const id = String(fd.get("id"));
  const status = String(fd.get("status"));
  if (!id || !status) return;
  const patch: any = { status };
  if (status === "submitted") patch.submitted_on = new Date().toISOString();
  if (status === "won" || status === "lost") patch.decision_on = new Date().toISOString();
  await admin().from("grant_applications").update(patch).eq("id", id);

  await emit({
    type: "grant.status_changed",
    source: "grants",
    actor: "Nur",
    subject_type: "grant",
    subject_id: id,
    payload: { status },
  });
  revalidatePath("/grants");
}
