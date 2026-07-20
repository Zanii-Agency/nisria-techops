// Unit wall for composeActionClaims (lib/agents/compose-claims.mjs). Pure function,
// no network — runs in milliseconds. This is the correct-by-construction spine:
// a confirmation line exists IFF a receipt says the action happened. Pin every
// class so a future edit can't silently let a claim outrun its receipt.
//
// Run: node eval/unit/compose-claims.test.mjs

import { composeActionClaims, stripModelActionClaims, assembleReply } from "../../lib/agents/compose-claims.mjs";

let pass = 0, fail = 0;
const eq = (got, want, note) => {
  const okk = got === want;
  console.log(`${okk ? "PASS" : "FAIL"}  ${note}`);
  if (!okk) { console.log(`      got:  ${JSON.stringify(got)}`); console.log(`      want: ${JSON.stringify(want)}`); fail++; } else pass++;
};
const has = (got, sub, note) => {
  const okk = typeof got === "string" && got.includes(sub);
  console.log(`${okk ? "PASS" : "FAIL"}  ${note}`);
  if (!okk) { console.log(`      got:  ${JSON.stringify(got)}`); console.log(`      want substring: ${JSON.stringify(sub)}`); fail++; } else pass++;
};

const ok = (name, detail, summary = "") => ({ name, result: { ok: true, summary, detail } });
const failRun = (name) => ({ name, result: { ok: false, error: "boom" } });

// ---- THE CORE INVARIANT: no receipt -> no line ------------------------------
eq(composeActionClaims([]).text, "", "empty toolRuns -> empty (nothing to claim)");
eq(composeActionClaims([failRun("message_person")]).text, "", "FAILED send -> NO 'sent' line (the 700-patch bug, killed structurally)");
eq(composeActionClaims([{ name: "message_person", result: { ok: false } }]).text, "", "ok:false send -> no line");
// A read tool that ran but committed nothing must never manufacture a claim.
eq(composeActionClaims([ok("search_history", {})]).text, "", "read tool -> no action claim");

// ---- SEND ------------------------------------------------------------------
eq(composeActionClaims([ok("message_person", { delivered: true, to: "Mark", via: "whatsapp" })]).text, "Sent to Mark.", "delivered send -> 'Sent to Mark.'");
has(composeActionClaims([ok("message_person", { delivered: true, to: "Grace", via: "template" })]).text, "off-window update", "template send -> off-window note");
has(composeActionClaims([ok("message_person", { delivered: false, queued: true, to: "Violet" })]).text, "the moment they next message in", "queued send -> honest hold, not 'sent'");
eq(composeActionClaims([ok("message_person", { deduped: true, to: "Mark" })]).text, "Mark already had that.", "deduped send -> quiet ack, not a fresh 'sent'");

// ---- POST ------------------------------------------------------------------
eq(composeActionClaims([ok("post_to_group", { posted: true, group: "Finances" })]).text, "Posted to the Finances group.", "group post from detail.group");
eq(composeActionClaims([ok("post_to_group", {}, 'Posted to the "Field Team" group.')]).text, "Posted to the Field Team group.", "group post title recovered from summary");

// ---- TASK ------------------------------------------------------------------
eq(composeActionClaims([ok("create_task", { task_id: "t1" }, 'Created the task "Send STP to Violet", Nur.')]).text, 'Logged the task "Send STP to Violet".', "create_task -> logged w/ title, no assignee note for Nur");
has(composeActionClaims([ok("create_task", { task_id: "t2", assignee: "Cynthia" }, 'Created the task "Move Drive".')]).text, "for Cynthia", "create_task w/ assignee -> names them");
eq(composeActionClaims([ok("create_task", { deduped: true })]).text, "Already on the task board.", "deduped task -> quiet ack");
eq(composeActionClaims([ok("complete_task", { task_id: "t1" }, 'Marked "Call the bank" done.')]).text, 'Marked "Call the bank" done.', "complete_task -> done w/ title");

// ---- CALENDAR --------------------------------------------------------------
eq(composeActionClaims([ok("create_event", { event_id: "e1" }, 'Added "Board call" on Friday.')]).text, 'Added "Board call" to the calendar.', "create_event -> added w/ title");
eq(composeActionClaims([ok("move_event", { event_id: "e1" }, 'Moved "Board call" to Monday.')]).text, 'Moved "Board call".', "move_event -> moved w/ title");

// ---- MONEY (stage-then-confirm: staged != logged) --------------------------
has(composeActionClaims([ok("record_payment", { staged: true })]).text, "nothing is recorded yet", "staged payment -> honest 'not recorded yet'");
eq(composeActionClaims([ok("record_payment", { payment_id: "p1" })]).text, "Logged the payment.", "recorded payment -> logged");
eq(composeActionClaims([ok("record_payment", {})]).text, "", "record_payment w/ neither staged nor id -> no claim");

// ---- MULTI-ACTION ordering + classes ---------------------------------------
const multi = composeActionClaims([
  ok("complete_task", { task_id: "t1" }, 'Marked "Foo" done.'),
  ok("message_person", { delivered: true, to: "Mark", via: "whatsapp" }),
]);
eq(multi.text, 'Marked "Foo" done. Sent to Mark.', "multi-action -> both lines, source order");
eq(multi.classes.join(","), "task_complete,send", "classes tracked for trace rail");

// ---- stripModelActionClaims: remove the model's OWN action assertions --------
eq(stripModelActionClaims("Done, sent to Mark."), "", "strip a bare completed-send assertion");
eq(stripModelActionClaims("I've logged the payment and marked the task done."), "", "strip completion assertions");
eq(stripModelActionClaims("Hey Nur. Sent to Grace."), "Hey Nur.", "keep greeting, strip the send claim");
eq(stripModelActionClaims("Want me to message Grace?"), "Want me to message Grace?", "keep an OFFER (future, not a claim)");
eq(stripModelActionClaims("I'll message her shortly."), "I'll message her shortly.", "keep a FUTURE intent");
eq(stripModelActionClaims("Who did you mean by them?"), "Who did you mean by them?", "keep a question");
eq(stripModelActionClaims("You have 3 open tasks."), "You have 3 open tasks.", "keep a read-answer (no action verb)");

// ---- assembleReply: conversation + composed truth (THE cutover contract) -----
{
  // Model LIES ("sent to Mark") but NO send receipt -> the lie is stripped and
  // nothing is re-added. The 700-patch bug, killed at the assembly seam.
  const a = assembleReply("Done, sent to Mark.", [failRun("message_person")]);
  eq(a.reply, "", "model false-send + no receipt -> empty (no lie survives)");
}
{
  // Model is vague, receipt is real -> the truth is rendered regardless.
  const a = assembleReply("Okay.", [ok("message_person", { delivered: true, to: "Mark", via: "whatsapp" })]);
  eq(a.reply, "Okay. Sent to Mark.", "vague model + real receipt -> truth appended");
}
{
  // Model names the WRONG recipient; receipt says Grace. Model claim stripped,
  // composed truth (Grace) wins.
  const a = assembleReply("Sent to Mark.", [ok("message_person", { delivered: true, to: "Grace", via: "whatsapp" })]);
  eq(a.reply, "Sent to Grace.", "wrong-recipient claim replaced by receipt truth");
}
{
  const a = assembleReply("Hey Nur, on it. Marked it done.", [ok("complete_task", { task_id: "t1" }, 'Marked "Call bank" done.')]);
  eq(a.reply, 'Hey Nur, on it. Marked "Call bank" done.', "keep greeting, replace vague completion w/ titled truth");
}



// ---- generic committing receipt (the other ~125 tools) ------------------------
{
  const opts = { isCommitting: (n) => n !== "list_tasks" };
  const a = assembleReply("Added Amani to the nutrition program.", [
    { name: "add_beneficiary", result: { ok: true, summary: "Added Amani to the nutrition program, Nur." } },
  ], opts);
  eq(a.reply, "Added Amani to the nutrition program, Nur.", "unknown committing tool -> receipt summary renders (no mute bot)");
  const r = assembleReply("You have 3 open tasks.", [
    { name: "list_tasks", result: { ok: true, summary: "3 open tasks." } },
  ], opts);
  eq(r.reply, "You have 3 open tasks.", "read receipt never renders as an action claim");
}

// ---- widened claim-verb net (2026-07-11) --------------------------------------
eq(stripModelActionClaims("I archived the case and merged the duplicates."), "", "archived/merged claims stripped");
eq(stripModelActionClaims("Transferred ownership and assigned it to Grace."), "", "transferred/assigned stripped");
eq(stripModelActionClaims("I relayed your message and queued the newsletter."), "", "relayed/queued stripped");
eq(stripModelActionClaims("Saved it to the Library."), "", "saved-it stripped");
eq(stripModelActionClaims("Shall I archive the old cases?"), "Shall I archive the old cases?", "offer to archive kept (question)");

console.log(`\ncompose-claims wall: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
