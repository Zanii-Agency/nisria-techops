// DAILY TASK-COMPLETION DIGEST (Field-nervous-system law). The anti-firehose
// half of task-completion routing: team-member completions do NOT email anyone
// per-task (the team is ~38 people). Instead each completion lands instantly in
// Mission Control as a `task.completed` event, and once a day this cron reads the
// last 24h of those events and emails Nur ONE summary of who finished what.
//
// Only TEAM-MEMBER completions are summarised here (payload.operator_task = false).
// Operator (Nur <-> builder) tasks already got their instant individual email at
// completion time, so including them would double-report.
//
// Triggered by Vercel cron (GET, Authorization: Bearer CRON_SECRET). Also runnable
// with x-agent-secret / x-group-secret / ?key=. Idempotent per day: a
// task.digest_sent event already today means a re-run is skipped (?force=1 overrides).
import { NextRequest, NextResponse } from "next/server";
import { admin } from "../../../../lib/supabase-admin";
import { emit } from "../../../../lib/events";
import { sendEmail } from "../../../../lib/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NUR_EMAIL = "nur@nisria.co";

function authed(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") || "";
  const cron = process.env.CRON_SECRET, agent = process.env.AGENT_TICK_SECRET, group = process.env.GROUP_BOT_SECRET;
  const qs = new URL(req.url).searchParams.get("key");
  if (cron && auth === `Bearer ${cron}`) return true;
  if (agent && (req.headers.get("x-agent-secret") === agent || qs === agent)) return true;
  if (group && (req.headers.get("x-group-secret") === group || qs === group)) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const force = new URL(req.url).searchParams.get("force") === "1";
  const db = admin();

  // Idempotency: one digest per day unless forced.
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  if (!force) {
    const { data: already } = await db
      .from("events").select("id").eq("type", "task.digest_sent")
      .gte("created_at", dayStart.toISOString()).limit(1);
    if (already?.[0]) return NextResponse.json({ ok: true, skipped: "already sent today" });
  }

  // Last 24h of TEAM-MEMBER completions.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: events } = await db
    .from("events").select("payload,created_at,actor")
    .eq("type", "task.completed")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(500);

  const completions = (events || []).filter((e: any) => e.payload?.operator_task === false);
  if (!completions.length) {
    // Nothing to report: do not send an empty email. Log a no-op for idempotency.
    await emit({ type: "task.digest_sent", source: "cron", actor: "system", subject_type: "digest", subject_id: null, payload: { count: 0 } });
    return NextResponse.json({ ok: true, count: 0, sent: false });
  }

  const lines = completions.map((e: any) => {
    const p = e.payload || {};
    const who = p.assignee ? ` by ${p.assignee}` : "";
    const by = p.completed_by && p.completed_by !== p.assignee ? ` (marked done by ${p.completed_by})` : "";
    return `- ${p.title || "Untitled task"}${who}${by}`;
  });

  const body =
    `Here is today's task wrap-up. ${completions.length} task${completions.length > 1 ? "s were" : " was"} completed by the team:\n\n` +
    lines.join("\n") +
    `\n\nSee the full board on the Command Center: https://command.nisria.co/tasks`;

  let sent = false;
  try {
    await sendEmail(NUR_EMAIL, `Daily task wrap-up: ${completions.length} completed`, body, { account: "sasa@nisria.co" });
    sent = true;
  } catch (err) {
    console.error("task-digest send failed", err);
  }

  await emit({ type: "task.digest_sent", source: "cron", actor: "system", subject_type: "digest", subject_id: null, payload: { count: completions.length, sent } });
  return NextResponse.json({ ok: true, count: completions.length, sent });
}
