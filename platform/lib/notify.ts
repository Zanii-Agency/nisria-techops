// PROACTIVE NOTIFICATIONS (Field-nervous-system law). The portal does not just
// wait to be asked: when something is urgent or broken, it reaches OUT to the
// right phone. This is the one place that decides WHO gets pinged and WHEN.
//
// Three rails, all via Meta-approved UTILITY templates (sendTemplate), because a
// proactive push is almost always OUTSIDE WhatsApp's 24h window where free-form
// text silently fails:
//   task_alert    — an urgent / overdue task, to the assignee + Nur
//   daily_brief   — the morning "you have N due" nudge (off-window recipients)
//   system_alert  — a backend incident, to the operators (the builder first)
//
// Dedup is by EVENTS, not new columns (extend-beside law): before a push we check
// for a recent matching event so a burst never spams. Every send is best-effort
// and NEVER throws into its caller — a failed ping must not break task creation.
import { admin } from "./supabase-admin";
import { sendTemplate, phoneKey } from "./whatsapp";
import { emit } from "./events";

// The operator allowlist as comparable wa_id keys (Nur + the builder).
function operatorKeys(): string[] {
  return (process.env.WHATSAPP_OPERATORS || "").split(",").map((x) => phoneKey(x)).filter(Boolean);
}

// Was an event of this type already emitted for this UUID subject within `mins`?
// This is the burst guard: one urgent task pings once, not once per retry.
// (subject_id is a uuid column, so this is only for real ids like task.id.)
async function pushedRecently(db: any, type: string, subjectId: string | null, mins: number): Promise<boolean> {
  if (!subjectId) return false;
  const since = new Date(Date.now() - mins * 60_000).toISOString();
  const { data } = await db.from("events").select("id").eq("type", type).eq("subject_id", subjectId).gte("created_at", since).limit(1);
  return Boolean(data?.[0]);
}

// Incident dedup keys on a non-uuid string (the component), so it lives in the
// payload, not subject_id (which is a uuid column). Same 30min burst guard.
async function incidentSentRecently(db: any, key: string, mins: number): Promise<boolean> {
  const since = new Date(Date.now() - mins * 60_000).toISOString();
  const { data } = await db.from("events").select("id").eq("type", "system.incident_sent").filter("payload->>key", "eq", key).gte("created_at", since).limit(1);
  return Boolean(data?.[0]);
}

type AlertKind = "new" | "escalation";

// Send the task_alert template to a task's assignee AND Nur. Used by the urgent
// gate on create_task (kind "new") and by the overdue escalation in the daily
// cron (kind "escalation"). Resolves recipients itself from the roster so callers
// only pass the task. Returns the list of wa_ids actually pinged.
export async function pushTaskAlert(
  db: any,
  task: { id: string | null; title: string; due_on?: string | null; priority?: string | null; assignee_id?: string | null },
  kind: AlertKind = "new",
): Promise<{ pinged: string[]; deduped?: boolean }> {
  try {
    if (await pushedRecently(db, "task.alert_sent", task.id, kind === "escalation" ? 20 * 60 : 6 * 60)) {
      return { pinged: [], deduped: true };
    }
    const ops = operatorKeys();
    const { data: members } = await db.from("team_members").select("id,name,phone,status").limit(400);
    const roster = (members || []) as any[];
    // 727 ONLY serves the two principals (Nur + the builder). Field staff get
    // their tasks via the GROUP bot, never an unsolicited 727 DM. So:
    //   - Nur (the operator on the roster) is always a recipient.
    //   - the assignee is added ONLY IF the assignee is also an operator.
    //   - a task assigned to a NON-operator staffer => no 727 push at all
    //     (return empty; the group bot @mentions them in their group instead).
    const nur = roster.find((m) => ops.includes(phoneKey(m.phone)));
    const nurWa = nur ? phoneKey(nur.phone) : (ops[0] || null);
    const assignee = task.assignee_id ? roster.find((m) => m.id === task.assignee_id) : null;
    const assigneeIsOperator = assignee ? ops.includes(phoneKey(assignee.phone)) : false;
    // Assigned to a staffer who does not use 727: this is not a 727 event.
    if (assignee && !assigneeIsOperator) return { pinged: [] };
    const assigneeWa = assigneeIsOperator ? phoneKey(assignee.phone) : null;

    // Recipients: the operator assignee + Nur, de-duplicated. (Nur's own or an
    // unassigned reminder pings just Nur; a task on the builder pings him + Nur.)
    const recipients = Array.from(new Set([assigneeWa, nurWa].filter(Boolean))) as string[];
    if (!recipients.length) return { pinged: [] };

    const adj = kind === "escalation" ? "an overdue" : task.priority === "high" ? "an urgent" : "a new";
    const due = task.due_on || "ASAP";
    const title = String(task.title || "a task").slice(0, 200);

    const pinged: string[] = [];
    for (const to of recipients) {
      const r = await sendTemplate(to, "task_alert", [adj, title, due]);
      if (r.id) pinged.push(to);
    }
    await emit({
      type: "task.alert_sent", source: "notify", actor: "system", subject_type: "task", subject_id: task.id,
      payload: { kind, title, priority: task.priority || null, due_on: task.due_on || null, to: pinged.map((p) => p.slice(-4)) },
    });
    return { pinged };
  } catch (err) {
    console.error("pushTaskAlert failed", err);
    return { pinged: [] };
  }
}

// Send the daily_brief template (count only) to one off-window recipient. The
// rich itemised list is what they get back when they reply LIST (in-window).
export async function pushDailyBrief(to: string, count: number): Promise<boolean> {
  try {
    const r = await sendTemplate(phoneKey(to), "daily_brief", [String(count)]);
    return Boolean(r.id);
  } catch (err) {
    console.error("pushDailyBrief failed", err);
    return false;
  }
}

// Send the system_alert template to every operator. `component` is the failing
// part ("WhatsApp worker"), `detail` is what happened. Deduped 30min per
// component so a flapping failure does not machine-gun the operators.
export async function pushIncident(component: string, detail: string): Promise<{ sent: number; deduped?: boolean }> {
  try {
    const db = admin();
    const key = component.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    if (await incidentSentRecently(db, key, 30)) return { sent: 0, deduped: true };
    const ops = operatorKeys();
    let sent = 0;
    for (const to of ops) {
      const r = await sendTemplate(to, "system_alert", [component.slice(0, 200), detail.slice(0, 400)]);
      if (r.id) sent++;
    }
    // The component key lives in the payload (subject_id is a uuid column); the
    // dedup window above reads it back, so the guard is per-component.
    await emit({ type: "system.incident_sent", source: "notify", actor: "system", subject_type: "incident", subject_id: null, payload: { key, component, detail: detail.slice(0, 200), sent } });
    return { sent };
  } catch (err) {
    console.error("pushIncident failed", err);
    return { sent: 0 };
  }
}
