// GROUP OUTBOX. The group userbot (Railway) polls this to pull messages the
// portal wants posted into a team group, delivers them with its WhatsApp
// session, and acks. The portal never touches WhatsApp directly: it only queues
// `group.send` jobs (via post_to_group or the profile follow-up action), and the
// bot is the sole sender because only it holds the group session.
//
// GET  -> claim up to N queued group.send jobs (marks them 'sending')
// POST -> ack one: { id, ok, error? } -> 'done' or re-queue (with attempt cap)
// Auth: x-group-secret must equal GROUP_BOT_SECRET (same as /api/group/ingest).
import { NextRequest, NextResponse } from "next/server";
import { admin } from "../../../../lib/supabase-admin";
import { emit } from "../../../../lib/events";
import { sendText } from "../../../../lib/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authed(req: NextRequest) {
  return (req.headers.get("x-group-secret") || "") === (process.env.GROUP_BOT_SECRET || "\0");
}

// OPERATOR-DIRECTED POSTS ALWAYS DELIVER. The group bot never chimes in on its own
// (autonomous replies are suppressed in /api/group/ingest), but a message the
// operator (Nur or Taona) explicitly tells the 727 Sasa to post to a group is queued
// here as a group.send job and the bot delivers it. This is the deliberate
// 727 -> group bot (Kenyan number) -> group path, separate from autonomous chatter.

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const db = admin();
  // HEARTBEAT (#10): the bot polls this every ~4s while it is alive, so a fresh poll
  // is proof the bot is running. /api/group/link reads it to report "connected",
  // which can't be clobbered by a stale or ghost-replica "waiting" QR flag. Throttled
  // so we only touch the row a couple times a minute.
  try {
    const { data: hb } = await db.from("bot_status").select("updated_at").eq("key", "group_poll").maybeSingle();
    const hbAge = hb?.updated_at ? Date.now() - new Date(hb.updated_at).getTime() : Infinity;
    if (hbAge > 25_000) {
      await db.from("bot_status").upsert({ key: "group_poll", value: { ts: new Date().toISOString() }, updated_at: new Date().toISOString() }, { onConflict: "key" });
    }
  } catch {}
  // self-heal: if the bot claimed sends ('sending') then died before acking, those
  // jobs would hang forever. Re-queue any 'sending' older than 5 minutes so the
  // next poll re-serves them. (Inbound dedupe at send time prevents real dupes.)
  const stale = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  await db.from("jobs").update({ status: "queued" })
    .eq("kind", "group.send").eq("status", "sending").lt("started_at", stale);
  const { data: jobs } = await db
    .from("jobs").select("id,payload")
    .eq("kind", "group.send").eq("status", "queued")
    .order("created_at", { ascending: true }).limit(20);
  const list = (jobs || []) as any[];
  if (list.length) {
    await db.from("jobs").update({ status: "sending", started_at: new Date().toISOString() }).in("id", list.map((j) => j.id));
  }
  return NextResponse.json({ ok: true, sends: list.map((j) => ({ id: j.id, group: j.payload?.group || "", text: j.payload?.text || "" })) });
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const id = String(b.id || "");
  if (!id) return NextResponse.json({ ok: false, error: "no id" }, { status: 400 });
  const db = admin();

  if (b.ok) {
    await db.from("jobs").update({ status: "done", finished_at: new Date().toISOString() }).eq("id", id);
    const { data: job } = await db.from("jobs").select("payload").eq("id", id).single();
    await emit({ type: "group.sent", source: "group-bot", actor: "group-bot", subject_type: "job", subject_id: id, payload: { group: job?.payload?.group } });
    return NextResponse.json({ ok: true });
  }
  // failed: re-queue TRANSIENT errors up to 5 attempts. An "unknown group" is
  // deterministic (retrying never resolves it), so park it at once. Either way, when
  // a send is permanently undeliverable, TELL Nur on the 727 instead of letting the
  // job die silently as 'error' (the old silent-failure trap that meant she only
  // found out by noticing nothing arrived in the group).
  const reason = String(b.error || "send failed").slice(0, 300);
  const unknownGroup = /unknown group/i.test(reason);
  const { data: job } = await db.from("jobs").select("attempts,payload").eq("id", id).single();
  const attempts = (job?.attempts || 0) + 1;
  const parked = unknownGroup || attempts >= 5;
  await db.from("jobs").update({
    status: parked ? "error" : "queued",
    attempts, error: reason,
  }).eq("id", id);
  if (parked) {
    const grp = job?.payload?.group || "a group";
    const txt = String(job?.payload?.text || "").slice(0, 140);
    const note = unknownGroup
      ? `I could not post to "${grp}": the group bot is not in that group. Add it there and I can post, or tell me which group to use. (message: "${txt}")`
      : `I could not deliver a message to the "${grp}" group after several tries (${reason}). (message: "${txt}")`;
    const nums = (process.env.WHATSAPP_OPERATORS || "").split(",").map((s) => s.trim()).filter(Boolean);
    for (const n of nums) { try { await sendText(n, note); } catch {} }
    await emit({ type: "group.send_failed", source: "group-bot", actor: "group-bot", subject_type: "job", subject_id: id, payload: { group: job?.payload?.group, reason, attempts } });
  }
  return NextResponse.json({ ok: true, requeued: !parked });
}
