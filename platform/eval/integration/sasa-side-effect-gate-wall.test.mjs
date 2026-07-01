// Side-effect gate wall (2026-07-01, real-action incident class). The root class: a
// deterministic route detects an intent with a LOOSE trigger that can match inside a
// message whose PRIMARY intent is different, then performs a REAL side effect (send email,
// stage/commit payment, stage a WhatsApp send, create a calendar event, create a
// beneficiary). Exemplar: "Add this task ... and send it to Mark" sent a stale email.
//
// Root defense: once parseTasks has CREATED task(s) from a message (parsedContextNote set),
// NO other create-side-effect route may fire on that same message. This wall asserts every
// such route's condition carries `!parsedContextNote`, so a task-create can never also fire
// a payment / email-send / relay-send / intake / calendar-create. Source-level anti-drift.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);
const SRC = readFileSync(resolve(HERE, "../../app/api/whatsapp/worker/route.ts"), "utf8");

// ---- G1: payment pre-parser gated on !parsedContextNote ----
if (!/PARSE_TASKS_ENABLED === "1" && command && contactId && !parsedContextNote\)/.test(SRC))
  fail("G1 payment pre-parser must be gated on !parsedContextNote (a number in a task must not stage a payment)");
else ok("G1 payment route gated on !parsedContextNote");

// ---- G2: email send-on-confirm gated on !parsedContextNote ----
if (!/if \(contactId && !parsedContextNote && \(opRank === "owner" \|\| opRank === "founder"\) && \(sendEmailConfirm/.test(SRC))
  fail("G2 email send-on-confirm must be gated on !parsedContextNote");
else ok("G2 email send-on-confirm gated on !parsedContextNote");

// ---- G3: deterministic relay/send-stager gated on !parsedContextNote ----
// (the send-stager is the block that inserts a kind:'send_message' pending action)
if (!/if \(contactId && command && !parsedContextNote && \(opRank === "owner" \|\| opRank === "founder"\)\) \{/.test(SRC) || !/kind: "send_message"/.test(SRC))
  fail("G3 send-stager must be gated on !parsedContextNote (a task-create must not stage a WhatsApp send)");
else ok("G3 relay/send-stager gated on !parsedContextNote");

// ---- G4: beneficiary/case intake gated on !parsedContextNote ----
if (!/if \(contactId && command && !parsedContextNote && canIntake\)/.test(SRC))
  fail("G4 beneficiary/case intake must be gated on !parsedContextNote");
else ok("G4 intake gated on !parsedContextNote");

// ---- G5: calendar-create gated on !parsedContextNote ----
if (!/if \(contactId && command && !parsedContextNote && \(isAdminIntake/.test(SRC))
  fail("G5 calendar-create must be gated on !parsedContextNote");
else ok("G5 calendar-create gated on !parsedContextNote");

// ---- G6: intake excludes incidental non-intake contexts (campaign/event/etc) ----
if (!/campaign\|sponsorship\|program\|programme\|event\|drive\|report\|meeting\|donor/.test(SRC))
  fail("G6 intake exclusion list must cover campaign/event/program/etc (incidental 'child/family' words)");
else ok("G6 intake excludes campaign/event/program/report/etc");

if (process.exitCode) console.error("\nsasa-side-effect-gate-wall: FAIL");
else console.log("\nsasa-side-effect-gate-wall: ALL GREEN");
