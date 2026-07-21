// Close-the-open-loops wall (spec 007 §3–§6, 2026-07-21).
//
// Pins the three feedback edges added after the open-loop audit, each tied to a live bug:
//   §3 subject binds to the speaker  (Nur shown everyone's 171 tasks)
//   §4 DB mutations verify the row changed  (false "Marked done" from a silent 0-row update)
//   §5 calendar completion is a real column every read honors  (event stayed on the board)
//   §6 no false promise for an action the bot cannot perform  ("I'll take care of it" x3)
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
let failed = 0;
const ok = (m) => console.log(`PASS: ${m}`);
const fail = (m) => { failed++; console.log(`FAIL: ${m}`); };

const st = readFileSync(resolve(HERE, "../../lib/smart-tools.ts"), "utf8");
const cal = readFileSync(resolve(HERE, "../../lib/calendar.ts"), "utf8");
const spec = readFileSync(resolve(HERE, "../../lib/agents/specialists/index.ts"), "utf8");
const mig = readFileSync(resolve(HERE, "../../db/migrations/20260721_calendar_completed_at.sql"), "utf8");

// ── §3 self-pronoun ──────────────────────────────────────────────────────────
// list_tasks must resolve "my" to the speaker, not a fuzzy name match. It routes
// through resolveAssignee (self-pronoun -> phone) with the threaded senderPhone.
if (/if \(input\.assignee_name\) \{ const m = await resolveAssignee\(db, senderPhone, input\.assignee_name\)/.test(st))
  ok("§3 list_tasks resolves assignee via resolveAssignee(senderPhone) — 'my' = the speaker");
else fail("§3 list_tasks must resolve assignee through resolveAssignee with the threaded senderPhone");
if (/async function runRead\(db: any, name: string, input: any,[^)]*senderPhone: string \| null = null\)/.test(st))
  ok("§3 senderPhone is threaded into runRead");
else fail("§3 runRead must receive senderPhone (or list_tasks cannot bind 'my' to the caller)");

// ── §4 verified DB mutations ──────────────────────────────────────────────────
// A silent 0-row update must render a failure, never "done". Assert the .select()
// + row-count gate on the tools that render an action claim.
{
  const checks = [
    ["complete_task", /completeRows[\s\S]*?\.update\(completeUpdate\)\.eq\("id", task\.id\)\.select\("id"\)[\s\S]{0,900}?if \(!completeRows \|\| !completeRows\.length\) return \{ ok: false/],
    ["mark_payment_paid", /mppRows[\s\S]*?\.update\(\{ status: "paid"[\s\S]{0,220}?\.select\("id"\)[\s\S]{0,900}?if \(!mppRows \|\| !mppRows\.length\) return \{ ok: false/],
  ];
  for (const [tool, re] of checks) {
    if (re.test(st)) ok(`§4 ${tool} verifies the write changed a row before claiming success`);
    else fail(`§4 ${tool} must gate its success claim on rows actually changed (.select() + length)`);
  }
}

// ── §5 calendar completion is real state ──────────────────────────────────────
if (/ADD COLUMN IF NOT EXISTS completed_at timestamptz/.test(mig) && /notes LIKE '\[completed %'/.test(mig))
  ok("§5 migration adds completed_at AND backfills the legacy notes-prefix rows");
else fail("§5 migration must add completed_at and backfill historical '[completed ' notes rows");
if (/\.update\(\{ completed_at: nowIso, notes: newNotes[\s\S]{0,120}?\.select\("id"\)/.test(st))
  ok("§5 complete_calendar_event sets the real completed_at column (verified write)");
else fail("§5 complete_calendar_event must set completed_at, not only the notes prefix");
if (/\.from\("calendar_events"\)\.select\("\*"\)\.is\("completed_at", null\)/.test(cal))
  ok("§5 getCalendar (the unified read path) hides completed events");
else fail("§5 getCalendar must filter .is('completed_at', null) so a completed event leaves every view");
// the tool's own idempotency re-read must honor completed_at (else it re-completes)
if (/hits\.filter\(\(e\) => !e\.completed_at && !String\(e\.notes/.test(st))
  ok("§5 the 'already completed' guard reads completed_at (with legacy notes fallback)");
else fail("§5 the idempotency guard must check completed_at, or a done event reads as open and re-completes");

// ── §6 no fabricated promise ─────────────────────────────────────────────────
// The instruction that manufactured "I'll take care of it" is gone; an honest
// limit replaces it. The no-internal-leak rule is retained.
if (!/say you will take care of it, with no explanation/.test(spec) && !/take care of it right after this, with no explanation/.test(spec))
  ok("§6 the 'say you'll take care of it' false-promise instruction is removed");
else fail("§6 the empty-promise instruction must be removed (it manufactured the false promises)");
if (/never promise to "take care of it"[\s\S]{0,80}?you have no way to actually perform/.test(spec) || /never promise to "take care of it right after this" for an action you have no way to perform/.test(spec))
  ok("§6 the model is told never to promise an action it cannot perform");
else fail("§6 the prompt must forbid promising an action the bot cannot actually do");
if (/NEVER describe how you are organized internally/.test(spec))
  ok("§6 the no-internal-leak rule is retained (§6 replaced only the empty promise)");
else fail("§6 must keep the no-internal-scope-leak rule");

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
