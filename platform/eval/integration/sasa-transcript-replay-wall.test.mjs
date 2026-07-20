// Transcript-replay wall (2026-07-01). Replays the REAL messages from the live
// incident threads through the deterministic detectors, OFFLINE (no API spend), and
// asserts none of them mis-route into a side effect. Also pins the send-state name
// extractor so a question word ("What did you send?!!!") is never read as a person.
// This is the regression net for the whole "loose trigger -> wrong action" class.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTasks } from "../../app/api/whatsapp/worker/parseTasks.mjs";
import { parseStateTransition, parseTaskPriority, parseTaskComment, parseTaskDependency } from "../../app/api/whatsapp/worker/parseTaskOps.mjs";
import { parsePaymentAll } from "../../app/api/whatsapp/worker/parsePayment.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);

const ROSTER = [{ id: "nur", name: "Nur M’nasria", phone: "00971501622716", status: "active" }, { id: "mark", name: "Mark Njambi", status: "active" }];
const opt = (body) => ({ body, team_members: ROSTER, sender_contact_id: "c", source_message_id: "m", sender_rank: "founder", sender_role: "admin", sender_team_member: ROSTER[0] });
const nTasks = (body) => (parseTasks(opt(body)).tasks || []).length;
const nPay = (body) => (parsePaymentAll(body) || []).filter((p) => p && p.intent === "stage_payment").length;
const anyOp = (body) => [parseStateTransition(body), parseTaskPriority(body), parseTaskComment(body), parseTaskDependency(body)].some(Boolean);
// mirror of the email-send + relay predicates (kept in step with worker/route.ts)
const explicitSend = (c) => /\b(?:send it|send the email|send that email|send this email|fire it|email it|go ahead and send(?: it)?|send the draft|send it now)\b/i.test(c || "");
const otherIntent = (c) => /\b(?:task|reminder|beneficiary|case|payment|invoice|meeting|event|appointment|note to self)\b/i.test(c || "") || /\bsend (?:it|this|that|the letter|the report|them|him|her)\s+to\s+[A-Z]?[a-z]+/i.test(c || "");
const wc = (c) => String(c || "").trim().split(/\s+/).filter(Boolean).length;
const emailFires = (c) => explicitSend(c) && !otherIntent(c) && wc(c) <= 8;

// ---- T1: the incident task-create makes exactly 1 task and NOTHING else fires ----
{
  const NUR = "Add this task to me as urgent for today:\n•⁠  ⁠Prepare letter for Juvenile Center and send it to Mark.";
  if (nTasks(NUR) !== 1) fail(`T1a must create exactly 1 task, got ${nTasks(NUR)}`); else ok("T1a task-create makes 1 task (parsedContextNote will gate the rest)");
  if (emailFires(NUR)) fail("T1b the task-create must NOT fire an email send"); else ok("T1b no email send fires on the task-create");
  if (nPay(NUR) !== 0) fail("T1c the task-create must NOT stage a payment"); else ok("T1c no payment staged");
  // note: in the worker, parsedContextNote (task created) additionally gates payment/ops/email/relay/calendar/intake.
}

// ---- T2: the follow-up question + complaint fire NO side effect ----
{
  for (const [label, body] of [["What did you send?!!!", "What did you send?!!!"], ["complaint", "No said email sent? I didn’t request anything emails to be sent."]]) {
    if (nTasks(body) !== 0) fail(`T2 "${label}" must not create a task`);
    else if (nPay(body) !== 0) fail(`T2 "${label}" must not stage a payment`);
    else if (anyOp(body)) fail(`T2 "${label}" must not fire a task op`);
    else if (emailFires(body)) fail(`T2 "${label}" must not fire an email send`);
    else ok(`T2 "${label}" routes to the brain (no side effect)`);
  }
}

// ---- T3: prior-thread messages still route correctly (no regression) ----
{
  const setToday = "Set these tasks for today to me:\n•⁠  ⁠Java proposal, this is urgent\n•⁠  ⁠⁠BHF proposal, this is urgent";
  if (nTasks(setToday) !== 2) fail(`T3a 'Set these tasks for today to me' must make 2 tasks, got ${nTasks(setToday)}`); else ok("T3a prior 'Set these tasks' still makes 2 tasks");
  // a bulleted group-post message is NOT a task/payment
  const groupPost = "Send to the admin group following up on the opening of the ABSA bank account";
  if (nTasks(groupPost) !== 0 || nPay(groupPost) !== 0) fail("T3b a group-post request must not create a task or stage a payment"); else ok("T3b group-post request creates no task/payment");
}

// ---- T4: send-state name extractor never treats a question word as a person ----
{
  const SRC = readFileSync(resolve(HERE, "../../lib/agents/sasa.ts"), "utf8");
  const setBody = (SRC.match(/SEND_NAME_STOPLIST = new Set\(\[([\s\S]*?)\]\)/) || [, ""])[1];
  if (!setBody) fail("T4 could not locate the SEND_NAME_STOPLIST Set literal");
  for (const w of ["What", "Who", "When", "Where", "Why", "How", "Which"])
    if (!new RegExp(`"${w}"`).test(setBody)) fail(`T4 SEND_NAME_STOPLIST must contain the question word "${w}"`);
  ok("T4 question words (What/Who/When/...) are stoplisted from send-state name extraction");
  // real team names must NOT be stoplisted (would break legit send-state answers)
  for (const name of ["Faith", "Grace", "Hope", "Joy", "Mark"])
    if (new RegExp(`"${name}"`).test(setBody)) fail(`T4b real name "${name}" must NOT be in the stoplist`);
  ok("T4b real team names are not stoplisted");
}

if (process.exitCode) console.error("\nsasa-transcript-replay-wall: FAIL");
else console.log("\nsasa-transcript-replay-wall: ALL GREEN");
