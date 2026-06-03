// TIMED REMINDER FIRING (Field-nervous-system law, the at-the-time path).
//
// create_task time=HH:MM and a timed create_event store a time-of-day, but a
// once-a-day cron can never fire AT that time. This route is hit every 5 minutes
// by Supabase pg_cron (the same managed path as the worker drain, because Vercel
// Hobby only allows DAILY crons). On each tick it finds anything due NOW in the
// operator's timezone that has not yet been pinged, fires the WhatsApp reminder,
// and stamps reminded_at so it fires exactly once (idempotent, Real-action law).
//
// "due now" = scheduled for today, time-of-day <= the current time, and not yet
// reminded. The <= (not ==) catches a tick that lands a few minutes late, while
// reminded_at guarantees a single ping. Past times earlier today still fire once
// on the first tick after this route goes live, which is the honest behaviour
// (better a late ping than a silent miss); reminded_at then closes them out.

import { NextRequest, NextResponse } from "next/server";
import { admin } from "../../../../lib/supabase-admin";
import { now } from "../../../../lib/now";
import { pushTaskAlert, pushCalendarAlert } from "../../../../lib/notify";

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

// Current HH:MM in a given IANA timezone.
function hhmmIn(tz: string, d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const h = parts.find((p) => p.type === "hour")?.value || "00";
  const m = parts.find((p) => p.type === "minute")?.value || "00";
  return `${h}:${m}`;
}

async function run(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const db = admin();
  const n = await now();
  const today = n.today;
  const nowHHMM = hhmmIn(n.tz, n.date);

  // 1) Tasks with a due_time, due today, time has arrived, not yet pinged.
  const { data: taskRows } = await db
    .from("tasks")
    .select("id,title,due_on,due_time,priority,assignee_id")
    .neq("status", "done")
    .eq("due_on", today)
    .not("due_time", "is", null)
    .is("reminded_at", null)
    .limit(100);
  let tasksFired = 0;
  for (const t of (taskRows || []) as any[]) {
    if (String(t.due_time).slice(0, 5) > nowHHMM) continue; // not yet time today
    const r = await pushTaskAlert(db, { id: t.id, title: t.title, due_on: t.due_on, priority: t.priority, assignee_id: t.assignee_id }, "new");
    // Stamp regardless of whether a 727 push went out (a non-operator assignee
    // gets no DM, but we must not re-evaluate it every tick). Fired once, honestly.
    await db.from("tasks").update({ reminded_at: n.iso }).eq("id", t.id);
    if (r.pinged.length) tasksFired++;
  }

  // 2) Calendar events with a start_time, today, time arrived, not yet pinged.
  const { data: evRows } = await db
    .from("calendar_events")
    .select("id,title,starts_on,start_time,location,kind")
    .eq("starts_on", today)
    .not("start_time", "is", null)
    .is("reminded_at", null)
    .limit(100);
  let eventsFired = 0;
  for (const e of (evRows || []) as any[]) {
    if (String(e.start_time).slice(0, 5) > nowHHMM) continue;
    const when = `${e.starts_on} at ${String(e.start_time).slice(0, 5)}`;
    const r = await pushCalendarAlert(db, { id: e.id, title: e.title, when, location: e.location, kind: e.kind }, "now");
    await db.from("calendar_events").update({ reminded_at: n.iso }).eq("id", e.id);
    if (r.pinged.length) eventsFired++;
  }

  return NextResponse.json({ ok: true, now: nowHHMM, tz: n.tz, tasks_fired: tasksFired, events_fired: eventsFired });
}

export async function GET(req: NextRequest) { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
