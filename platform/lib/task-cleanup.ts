// Task cleanup batch flow.
//
// Walks Nur through every open task 10 at a time. Sasa lists them numbered;
// Nur replies with shorthand ("done 1,3,7; drop 2; edit 4: new title");
// Sasa updates the rows and asks for "next". Cleared in batches until the
// whole open list is fresh.
//
// State lives in pending_actions(kind='task_cleanup'). One row per contact.
// payload shape:
//   { state: 'awaiting_consent' | 'in_batch' | 'done',
//     cursor: 0,              // index into the ordered open-tasks list
//     total: 87,              // snapshotted on consent
//     batch_ids: [uuid,...]   // current displayed batch, position = number-1
//     stats: { done: 0, dropped: 0, edited: 0, kept: 0 } }
//
// The flow is Layer-0-routed: when this pending_action exists in awaiting_consent
// or in_batch state, the worker hands the inbound to handleCleanupReply BEFORE
// parseTasks, intent classifier, or runSasa wake.

import type { SupabaseClient } from "@supabase/supabase-js";

const BATCH_SIZE = 10;
const PENDING_KIND = "task_cleanup";

type Stats = { done: number; dropped: number; edited: number; kept: number };
type Payload = {
  state: "awaiting_consent" | "in_batch" | "done";
  cursor: number;
  total: number;
  batch_ids: string[];
  stats: Stats;
};

const emptyStats = (): Stats => ({ done: 0, dropped: 0, edited: 0, kept: 0 });

async function fetchOpenTasksOrdered(db: SupabaseClient): Promise<{ id: string; title: string; status: string }[]> {
  const { data } = await db
    .from("tasks")
    .select("id,title,status,created_at")
    .in("status", ["todo", "in_progress", "in_review"])
    .order("created_at", { ascending: true })
    .limit(500);
  return (data || []) as any[];
}

async function getPending(db: SupabaseClient, contactId: string) {
  const { data } = await db
    .from("pending_actions")
    .select("id,kind,payload,status")
    .eq("contact_id", contactId)
    .eq("kind", PENDING_KIND)
    .in("status", ["awaiting_confirm", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(1);
  return (data && data[0]) || null;
}

async function setPending(db: SupabaseClient, id: string, payload: Payload, status: "awaiting_confirm" | "in_progress" | "committed" | "cancelled") {
  await db
    .from("pending_actions")
    .update({ payload, status, ...(status === "committed" || status === "cancelled" ? { resolved_at: new Date().toISOString() } : {}) })
    .eq("id", id);
}

function formatBatch(batchNumber: number, totalBatches: number, tasks: { id: string; title: string }[]): string {
  const header =
    `Task cleanup, batch ${batchNumber} of ${totalBatches} (${tasks.length} tasks).\n` +
    `Reply with any mix:\n` +
    `  done 1,3,7      mark complete\n` +
    `  drop 2,5        delete (no longer relevant)\n` +
    `  edit 4: <title> change title, keep open\n` +
    `Unmentioned numbers stay open. Reply "next" for the next batch, "stop" to pause.\n`;
  const lines = tasks.map((t, i) => `${i + 1}. ${t.title || "(untitled)"}`);
  return header + "\n" + lines.join("\n");
}

function parseBatchReply(text: string): {
  done: number[];
  dropped: number[];
  edits: { n: number; title: string }[];
  next: boolean;
  stop: boolean;
  unrecognised: boolean;
} {
  const t = (text || "").trim();
  if (!t) return { done: [], dropped: [], edits: [], next: false, stop: false, unrecognised: true };
  const lower = t.toLowerCase();
  if (/^(stop|cancel|pause|quit|exit|halt)\b/.test(lower)) {
    return { done: [], dropped: [], edits: [], next: false, stop: true, unrecognised: false };
  }
  if (/^(next|continue|more|go|keep going)\b/.test(lower)) {
    return { done: [], dropped: [], edits: [], next: true, stop: false, unrecognised: false };
  }
  const done: number[] = [];
  const dropped: number[] = [];
  const edits: { n: number; title: string }[] = [];

  // edits FIRST (they consume "edit N: ..." spans through to end of segment or next command)
  // Split on semicolons or newlines so multiple commands can co-occur.
  const segments = t.split(/[;\n]+/).map((s) => s.trim()).filter(Boolean);
  for (const seg of segments) {
    const editMatch = seg.match(/^edit\s+(\d+)\s*[:\-]\s*(.+)$/i);
    if (editMatch) {
      edits.push({ n: parseInt(editMatch[1], 10), title: editMatch[2].trim() });
      continue;
    }
    const doneMatch = seg.match(/^(?:done|did|complete[d]?|finished?|mark\s+done)\s+([0-9,\s\-and]+)$/i);
    if (doneMatch) {
      done.push(...expandNumberList(doneMatch[1]));
      continue;
    }
    const dropMatch = seg.match(/^(?:drop|delete|remove|cancel|kill)\s+([0-9,\s\-and]+)$/i);
    if (dropMatch) {
      dropped.push(...expandNumberList(dropMatch[1]));
      continue;
    }
  }
  const unrecognised = !done.length && !dropped.length && !edits.length;
  return { done, dropped, edits, next: false, stop: false, unrecognised };
}

function expandNumberList(s: string): number[] {
  const out: number[] = [];
  const cleaned = s.replace(/\band\b/gi, ",");
  for (const token of cleaned.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean)) {
    const range = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const a = parseInt(range[1], 10);
      const b = parseInt(range[2], 10);
      if (a <= b && a > 0 && b <= 50) for (let i = a; i <= b; i++) out.push(i);
      continue;
    }
    const n = parseInt(token, 10);
    if (!isNaN(n) && n > 0 && n <= 50) out.push(n);
  }
  return out;
}

function looksLikeConsent(text: string): "yes" | "no" | "unclear" {
  const t = (text || "").trim().toLowerCase();
  if (!t) return "unclear";
  if (/^(y|yes|ya|yeah|yep|sure|ok|okay|go|start|lets go|let'?s go|do it|sounds good|👍|✅)\b/.test(t)) return "yes";
  if (/^(n|no|nope|not now|later|stop|cancel|skip)\b/.test(t)) return "no";
  return "unclear";
}

// PUBLIC ENTRYPOINTS ─────────────────────────────────────────────────────

export async function proposeTaskCleanup(
  db: SupabaseClient,
  contactId: string,
): Promise<{ message: string; pendingId: string; total: number } | { error: string }> {
  const tasks = await fetchOpenTasksOrdered(db);
  const total = tasks.length;
  if (total === 0) {
    return { error: "No open tasks to clean up." };
  }
  const totalBatches = Math.ceil(total / BATCH_SIZE);
  const payload: Payload = {
    state: "awaiting_consent",
    cursor: 0,
    total,
    batch_ids: [],
    stats: emptyStats(),
  };
  const { data: ins, error } = await db
    .from("pending_actions")
    .insert({
      contact_id: contactId,
      kind: PENDING_KIND,
      payload,
      summary: `Task cleanup proposal (${total} open tasks, ${totalBatches} batches).`,
      status: "awaiting_confirm",
    })
    .select("id")
    .single();
  if (error || !ins) return { error: `Failed to create pending_action: ${error?.message || "unknown"}` };
  const message =
    `Your task list has ${total} open items. The oldest go back to late May. ` +
    `Want to walk through them with me to clear what's done and drop what's no longer relevant? ` +
    `I'll send 10 at a time, you tell me what to do with each. Reply "yes" to start, "no" to skip for now.`;
  return { message, pendingId: ins.id, total };
}

export async function handleCleanupReply(
  db: SupabaseClient,
  contactId: string,
  command: string,
): Promise<{ ok: boolean; reply?: string; final?: boolean; reason: string }> {
  const pending = await getPending(db, contactId);
  if (!pending) return { ok: false, reason: "no_pending" };
  const payload = (pending.payload || {}) as Payload;

  if (payload.state === "awaiting_consent") {
    const consent = looksLikeConsent(command);
    if (consent === "no") {
      await setPending(db, pending.id, payload, "cancelled");
      return { ok: true, reply: "Got it, skipping the cleanup for now. Tell me whenever you want to revisit.", reason: "consent_no", final: true };
    }
    if (consent === "yes") {
      return await sendNextBatch(db, contactId, pending.id, payload);
    }
    return { ok: false, reason: "consent_unclear" };
  }

  if (payload.state === "in_batch") {
    const parsed = parseBatchReply(command);
    if (parsed.stop) {
      await setPending(db, pending.id, { ...payload, state: "done" }, "cancelled");
      const { done, dropped, edited } = payload.stats;
      return {
        ok: true,
        reply: `Paused. So far: ${done} done, ${dropped} dropped, ${edited} edited. Tell me when you want to pick it back up.`,
        reason: "stop",
        final: true,
      };
    }
    if (parsed.next) {
      return await sendNextBatch(db, contactId, pending.id, payload);
    }
    if (parsed.unrecognised) return { ok: false, reason: "batch_unrecognised" };
    return await applyBatchOps(db, pending.id, payload, parsed);
  }

  return { ok: false, reason: "bad_state" };
}

async function sendNextBatch(
  db: SupabaseClient,
  _contactId: string,
  pendingId: string,
  payload: Payload,
): Promise<{ ok: true; reply: string; final?: boolean; reason: string }> {
  const all = await fetchOpenTasksOrdered(db);
  const cursor = payload.cursor;
  if (cursor >= all.length) {
    await setPending(db, pendingId, { ...payload, state: "done" }, "committed");
    const { done, dropped, edited } = payload.stats;
    const remaining = all.length;
    return {
      ok: true,
      reply: `All caught up. Total: ${done} done, ${dropped} dropped, ${edited} edited. ${remaining} still open.`,
      reason: "finished",
      final: true,
    };
  }
  const batch = all.slice(cursor, cursor + BATCH_SIZE);
  const batchIds = batch.map((t) => t.id);
  const batchNumber = Math.floor(cursor / BATCH_SIZE) + 1;
  const totalBatches = Math.ceil(all.length / BATCH_SIZE);
  const message = formatBatch(batchNumber, totalBatches, batch);
  const newPayload: Payload = {
    ...payload,
    state: "in_batch",
    cursor,
    batch_ids: batchIds,
    total: all.length,
  };
  await setPending(db, pendingId, newPayload, "in_progress");
  return { ok: true, reply: message, reason: "batch_sent" };
}

async function applyBatchOps(
  db: SupabaseClient,
  pendingId: string,
  payload: Payload,
  parsed: ReturnType<typeof parseBatchReply>,
): Promise<{ ok: true; reply: string; reason: string }> {
  const ids = payload.batch_ids || [];
  const summary = { done: 0, dropped: 0, edited: 0, invalid: [] as number[] };

  const dedupe = (arr: number[]) => Array.from(new Set(arr)).filter((n) => n >= 1 && n <= ids.length);

  const doneNs = dedupe(parsed.done);
  const dropNs = dedupe(parsed.dropped).filter((n) => !doneNs.includes(n));
  const editPairs = parsed.edits.filter((e) => e.n >= 1 && e.n <= ids.length && !doneNs.includes(e.n) && !dropNs.includes(e.n));

  for (const n of doneNs) {
    const id = ids[n - 1];
    if (!id) continue;
    await db.from("tasks").update({ status: "done", updated_at: new Date().toISOString() }).eq("id", id);
    summary.done++;
  }
  for (const n of dropNs) {
    const id = ids[n - 1];
    if (!id) continue;
    await db.from("tasks").delete().eq("id", id);
    summary.dropped++;
  }
  for (const { n, title } of editPairs) {
    const id = ids[n - 1];
    if (!id) continue;
    await db.from("tasks").update({ title, updated_at: new Date().toISOString() }).eq("id", id);
    summary.edited++;
  }

  const stats: Stats = {
    done: payload.stats.done + summary.done,
    dropped: payload.stats.dropped + summary.dropped,
    edited: payload.stats.edited + summary.edited,
    kept: payload.stats.kept + (ids.length - summary.done - summary.dropped - summary.edited),
  };

  const cursor = payload.cursor + BATCH_SIZE;
  const newPayload: Payload = { ...payload, cursor, stats, batch_ids: [] };
  await setPending(db, pendingId, newPayload, "in_progress");

  const parts: string[] = [];
  if (summary.done) parts.push(`${summary.done} done`);
  if (summary.dropped) parts.push(`${summary.dropped} dropped`);
  if (summary.edited) parts.push(`${summary.edited} edited`);
  const summaryLine = parts.length ? `Cleared. ${parts.join(", ")}.` : "Got it, nothing changed in this batch.";

  return {
    ok: true,
    reply: `${summaryLine} Reply "next" for the next batch, or "stop" to pause.`,
    reason: "batch_applied",
  };
}
