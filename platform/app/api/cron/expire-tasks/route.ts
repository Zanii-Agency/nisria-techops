// DATE-PASSED TASK EXPIRY (KT #316). Once a task's due date has passed, "assume
// closed": take it off the active board so the morning brief stops nagging, BUT
// (a) set status to "expired", NEVER "done" — we do not know it was actually done,
// claiming done would be the lie we have spent this whole effort killing; (b)
// archive the lapsed task to agent_memory with topic = the due date, so "what was
// due / lapsed on June 16" is retrievable forever via a tool, never guessed; and
// (c) for high-priority / important tasks, send Nur ONE heads-up so a real
// obligation never silently disappears. She can REOPEN any.
//
// Deterministic job (this is the "use tools / verified facts" half of the
// operator's tool-based-memory doctrine): the cron WRITES the real records; the
// bot later READS them through list_tasks(status=expired) / search_history.
//
// Vercel cron (GET, Bearer CRON_SECRET), scheduled before the morning brief.
import { NextRequest, NextResponse } from "next/server";
import { admin } from "../../../../lib/supabase-admin";
import { emit } from "../../../../lib/events";
import { sendTextAndLog } from "../../../../lib/whatsapp";
import { classifyExpiry } from "./_expire";

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

// Today's calendar date in Asia/Dubai (UTC+4), so a task does not expire a day
// early/late from a UTC drift (the timezone bug class).
function todayDubai(): string {
  return new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10);
}

async function tick({ force }: { force: boolean }): Promise<any> {
  const db = admin();
  const today = todayDubai();

  // Idempotency: one expiry pass per day (a tasks.expired event today) unless forced.
  if (!force) {
    const dayStart = today + "T00:00:00";
    const { data: ran } = await db.from("events").select("id").eq("type", "tasks.expired").gte("created_at", dayStart).limit(1);
    if (ran && ran.length) return { ok: true, skipped: "already ran today" };
  }

  const { data: rows } = await db
    .from("tasks")
    .select("id,title,due_on,status,priority,important,assignee_id")
    .lt("due_on", today)
    .not("due_on", "is", null)
    .in("status", ["todo", "in_progress"]);

  const { expirable, important, normal } = classifyExpiry((rows || []) as any[], today);

  for (const t of expirable) {
    // (a) assume closed, but EXPIRED, never done.
    await db.from("tasks").update({ status: "expired" }).eq("id", t.id);
    // (b) archive the lapsed fact to memory, tied to the due date for retrieval.
    await db.from("agent_memory").insert({
      kind: "task_lapsed",
      brand: null,
      title: `Lapsed task: ${t.title || "(untitled)"}`,
      content: `Task "${t.title || ""}" was due ${t.due_on} and lapsed without being marked done. It was assumed closed and taken off the active board on ${today}. NOT confirmed done; can be reopened.`,
      topic: String(t.due_on),
      source_type: "task",
      source_id: t.id,
      status: "active",
      metadata: { task_id: t.id, due_on: t.due_on, assignee_id: t.assignee_id || null, priority: t.priority || null, important: !!t.important, was: t.status },
    });
  }

  // (c) heads-up to Nur for the important ones — never let a real obligation
  // vanish silently. She can REOPEN any.
  let notified = 0;
  if (important.length) {
    const lines = important.map((t) => `• ${t.title} (was due ${t.due_on})`).join("\n");
    const msg = `A few important tasks passed their date, so I have moved them off the active list. I have NOT marked them done, just filed them by date. Reply with REOPEN and the name to bring any back:\n${lines}`;
    const nur = process.env.NUR_WHATSAPP;
    if (nur) { try { await sendTextAndLog(db, nur, msg, { handledBy: "sasa" }); notified = 1; } catch { /* never block */ } }
  }

  await emit({
    type: "tasks.expired",
    source: "cron:expire-tasks",
    actor: "system",
    subject_type: "task",
    subject_id: null,
    payload: { date: today, expired: expirable.length, important: important.length, normal: normal.length, notified },
  });

  return { ok: true, date: today, expired: expirable.length, important: important.length, normal: normal.length, notified };
}

async function handle(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const force = new URL(req.url).searchParams.get("force") === "1";
  try {
    return NextResponse.json(await tick({ force }));
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message || err).slice(0, 300) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
