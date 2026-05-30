// OPERATOR REMINDERS (#7 reminders that fire). Once a day, the 727 pings the
// operator with what is due: her own reminders and any non-group task due today
// or overdue, plus the Needs-You count. The group bot handles team-group tasks
// (see /api/group/digest); this is the operator's personal brief.
//
// Triggered by Vercel cron (GET, Authorization: Bearer CRON_SECRET). Also runnable
// manually with x-agent-secret / x-group-secret / ?key=. Idempotent per day: a
// reminder.operator_brief event already today means a re-run is skipped (unless
// ?force=1). DELIVERY NOTE: sendText only reaches her inside WhatsApp's 24h window.
// She is usually inside it (she uses the bot daily); a guaranteed off-window brief
// needs a Meta-approved template (sendTemplate exists, just needs the template).
import { NextRequest, NextResponse } from "next/server";
import { admin } from "../../../../lib/supabase-admin";
import { emit } from "../../../../lib/events";
import { sendText } from "../../../../lib/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authed(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") || "";
  const cron = process.env.CRON_SECRET, agent = process.env.AGENT_TICK_SECRET, group = process.env.GROUP_BOT_SECRET;
  const qs = new URL(req.url).searchParams.get("key");
  if (cron && auth === `Bearer ${cron}`) return true;
  if (agent && (req.headers.get("x-agent-secret") === agent || qs === agent)) return true;
  if (group && (req.headers.get("x-group-secret") === group || qs === group)) return true;
  return false;
}

async function run(force: boolean) {
  const db = admin();
  const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); // Nairobi morning

  if (!force) {
    const { data: sent } = await db.from("events").select("id").eq("type", "reminder.operator_brief").gte("created_at", today + "T00:00:00Z").limit(1);
    if (sent?.[0]) return { ok: true, skipped: "already sent today", date: today };
  }

  // Operator reminders: non-group tasks due today or overdue (her own + general ops).
  const { data: rows } = await db
    .from("tasks").select("title,due_on,status")
    .neq("status", "done").is("source_group", null).not("due_on", "is", null).lte("due_on", today)
    .order("due_on", { ascending: true });
  const tasks = (rows || []) as any[];
  const dueToday = tasks.filter((t) => t.due_on === today);
  const overdue = tasks.filter((t) => t.due_on < today);
  const { count: needsYou } = await db.from("approvals").select("id", { count: "exact", head: true }).eq("status", "pending");

  if (!dueToday.length && !overdue.length && !needsYou) {
    await emit({ type: "reminder.operator_brief", source: "cron", actor: "system", subject_type: "contact", subject_id: null, payload: { date: today, nothing: true } });
    return { ok: true, date: today, nothing_due: true };
  }

  const blocks: string[] = [];
  if (dueToday.length) blocks.push(`Due today (${dueToday.length}):\n` + dueToday.map((t) => `• ${t.title}`).join("\n"));
  if (overdue.length) blocks.push(`Overdue (${overdue.length}):\n` + overdue.map((t) => `• ${t.title} (was due ${t.due_on})`).join("\n"));
  if (needsYou) blocks.push(`${needsYou} item${needsYou === 1 ? "" : "s"} waiting in Needs You.`);
  const text = `Your reminders for today:\n\n${blocks.join("\n\n")}\n\nReply "done" on anything you have handled, or "remove" to drop one.`;

  const nums = (process.env.WHATSAPP_OPERATORS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const results: any[] = [];
  for (const n of nums) {
    const r: any = await sendText(n, text);
    results.push({ to: n.slice(-4), ok: !!r?.id, error: r?.error || null });
  }
  await emit({ type: "reminder.operator_brief", source: "cron", actor: "system", subject_type: "contact", subject_id: null, payload: { date: today, dueToday: dueToday.length, overdue: overdue.length, needsYou, results } });
  return { ok: true, date: today, dueToday: dueToday.length, overdue: overdue.length, needsYou, sent: results };
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await run(new URL(req.url).searchParams.get("force") === "1"));
}
export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await run(new URL(req.url).searchParams.get("force") === "1"));
}
