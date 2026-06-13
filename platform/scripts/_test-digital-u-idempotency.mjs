// KT #244 mirror verify (Sasa side). Same shape as the jensen-pa
// _test-ingest-idempotency.mjs that shipped with cfce4e0 today. The Sasa
// schema uses digital_u_meetings.status instead of jensen-pa's events.outcome
// so the terminal set is different: only 'captured' is acked-terminal.
// 'failed' is intentionally retry-able (waiting-room cases must be allowed
// to come back through after the human fixes the issue).
//
// Pure logic test, no DB. Pass: exit 0. Fail: exit 1.

import { isAckedMeetingStatus } from "../lib/digital-u-guard.ts";

let pass = 0;
let fail = 0;
const fails = [];

function check(name, cond, detail) {
  if (cond) { pass++; process.stdout.write(`[PASS] ${name}\n`); }
  else { fail++; fails.push({ name, detail }); process.stdout.write(`[FAIL] ${name}${detail ? " — " + detail : ""}\n`); }
}

// ─────────────────────────────────────────────────────────────────────
// TERMINAL — guard MUST short-circuit. 'captured' = we already shipped
// Nur the summary, no second WhatsApp.
// ─────────────────────────────────────────────────────────────────────
check("terminal: 'captured' gates the route", isAckedMeetingStatus("captured") === true);

// ─────────────────────────────────────────────────────────────────────
// NON-TERMINAL — guard MUST let the route proceed.
// ─────────────────────────────────────────────────────────────────────
check("non-terminal: null = first callback, proceed", isAckedMeetingStatus(null) === false);
check("non-terminal: undefined = first callback, proceed", isAckedMeetingStatus(undefined) === false);
check("non-terminal: empty string treated as null", isAckedMeetingStatus("") === false);
check(
  "non-terminal: 'failed' allows legit retry through",
  isAckedMeetingStatus("failed") === false,
  "waiting-room / host-kicked failures must be retry-able",
);
check(
  "non-terminal: 'queued' is in-progress, allows callback",
  isAckedMeetingStatus("queued") === false,
);
check(
  "non-terminal: 'transcribing' is in-progress, allows callback",
  isAckedMeetingStatus("transcribing") === false,
);

// ─────────────────────────────────────────────────────────────────────
// EDGE CASES — fail-open on unknown / coerced inputs.
// ─────────────────────────────────────────────────────────────────────
check("edge: unknown string is non-terminal", isAckedMeetingStatus("foo") === false);
check("edge: numeric coerced shape is non-terminal", isAckedMeetingStatus(0) === false);

// ─────────────────────────────────────────────────────────────────────
process.stdout.write(`\n${pass} passed, ${fail} failed.\n`);
if (fail > 0) {
  process.stdout.write("\nFailures:\n");
  for (const f of fails) process.stdout.write(`  - ${f.name}\n    ${f.detail || ""}\n`);
  process.exit(1);
}
process.stdout.write("ALL GREEN. KT #244 Sasa mirror verified.\n");
process.exit(0);
