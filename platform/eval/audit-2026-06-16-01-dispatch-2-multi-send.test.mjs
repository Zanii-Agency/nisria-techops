// WARNING: This file mirrors production logic from lib/agents/sasa.ts (claimsSendWithoutSend et al). Keep in lockstep.
// Audit 2026-06-16, finding DISPATCH-2.
// Replay-eval for: claimsSendWithoutSend short-circuits on any successful send,
// missing a single-sentence false claim among a multi-send turn.
//
// Bug shape (from prod traffic 2026-06-15 10:33 Dubai):
//   reply  = "Done, sent to Violet. Cynthia has the message."
//   tools  = [message_person -> ok:true (Violet)]   // Cynthia never called
//   Today: function returns FALSE -> lie ships to Nur.
//   Want:  function returns TRUE  -> finalize() rewrites to HONEST_NO_SEND.
//
// This file holds the failing assertion. When DISPATCH-2 is patched in
// lib/agents/sasa.ts, test #1 below flips green. Until then it stays RED.
//
// TODO (when patching): export claimsSendWithoutSend from sasa.ts and import
// from there instead of mirroring. Mirroring drifts. The mirror is acceptable
// only as a proof-of-pattern for the audit-2026-06-16 harness.

import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// MIRROR of sasa.ts (post-DISPATCH-2 patch). Keep in lockstep: any edit to
// claimsSendWithoutSend or its helpers in sasa.ts must reapply here.
// Architectural follow-up: extract these primitives into brain-core/honesty-guards
// so the eval can import the canonical source and the mirror goes away.
// ---------------------------------------------------------------------------

const SEND_TOOLS = new Set(["message_person", "post_to_group", "send_file_to_person", "transfer_drive_file"]);
const SEND_CLAIM = /\b(?:sent\s+(?:it|them|the\s+(?:task|message|reminder|note))?\s*(?:to|him|her|them)|i'?ve\s+sent|i\s+have\s+sent|message\s+sent|messaged|texted|pinged|notified|told\s+(?:him|her|them|\w+)|let\s+(?:him|her|them|\w+)\s+know|reached\s+out\s+to|posted\s+(?:it\s+)?(?:to|in)\b)/i;
const SEND_HAS = /\b(?:he|she|they)\s+(?:now\s+)?(?:has|have)\s+(?:it|them)\b|\b\w+\s+(?:has|have|received|got)\s+(?:the\s+(?:task|message|reminder|note)|it now)\b/i;

const SEND_NAME_STOPLIST = new Set([
  "Sent", "Messaged", "Texted", "Pinged", "Notified", "Told", "Emailed", "Reminded",
  "Informed", "Reached", "Posted", "Contacted", "Alerted", "Acknowledged", "Briefed",
  "Updated", "Copied", "Called", "Phoned", "Looped", "Followed", "Forwarded",
  "Done", "Logged", "Created", "Marked", "Added", "Removed", "Deleted", "Set",
  "Made", "Drafted", "Noted", "Tracked", "Closed", "Opened", "Replied",
  "Good", "Morning", "Afternoon", "Evening", "Hi", "Hello", "Hey",
  "Just", "Yes", "No", "OK", "Okay", "Sure", "Want",
  "Nisria", "Sasa", "Nur",
]);

function extractClaimedRecipients(sentence) {
  const names = [];
  const matches = sentence.matchAll(/\b([A-Z][a-z]{2,})\b/g);
  for (const m of matches) {
    if (!SEND_NAME_STOPLIST.has(m[1])) names.push(m[1].toLowerCase());
  }
  return Array.from(new Set(names));
}

function extractToolRecipient(result) {
  const to = result?.detail?.to;
  if (!to) return null;
  const first = String(to).trim().split(/\s+/)[0];
  return first ? first.toLowerCase() : null;
}

function claimsSendWithoutSend(reply, toolRuns) {
  if (!(SEND_CLAIM.test(reply) || SEND_HAS.test(reply))) return false;

  const sentRecipients = new Set();
  for (const t of toolRuns) {
    if (!SEND_TOOLS.has(t.name)) continue;
    if (t.result?.ok !== true) continue;
    const who = extractToolRecipient(t.result);
    if (who) sentRecipients.add(who);
  }

  const FUTURE_PER_SENTENCE = /\b(?:i will|i'?ll|let me|should i|shall i|do you want me|want me to|would you like me|can i|haven'?t|have not|not yet)\b/i;
  const sentences = String(reply || "").split(/[.!?]+\s+/).filter((s) => s.trim());

  for (const s of sentences) {
    if (!(SEND_CLAIM.test(s) || SEND_HAS.test(s))) continue;
    if (FUTURE_PER_SENTENCE.test(s)) continue;

    const claimed = extractClaimedRecipients(s);

    if (claimed.length === 0) {
      if (sentRecipients.size === 0) return true;
      continue;
    }

    for (const c of claimed) {
      if (!sentRecipients.has(c)) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Replay tests.
// ---------------------------------------------------------------------------

let pass = 0, fail = 0;
console.log("\n  Audit 2026-06-16, DISPATCH-2 -- multi-send false-negative\n");

function run(name, fn) {
  try { fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); fail++; }
}

// THE BUG. Today this FAILS. When DISPATCH-2 is patched, it PASSES.
run("multi_send_single_sentence_lie_among_real_sends_is_caught", () => {
  const reply = "Done, sent to Violet. Cynthia has the message.";
  const tools = [
    { name: "message_person", result: { ok: true, detail: { to: "Violet" } } },
    // Cynthia was never called. No second tool run.
  ];
  const got = claimsSendWithoutSend(reply, tools);
  assert.equal(got, true, "Cynthia's lie should be caught even though Violet's send succeeded");
});

// Honest multi-send: both sends happened. Must NOT false-positive.
run("honest_multi_send_passes_through", () => {
  const reply = "Sent to Violet and Cynthia.";
  const tools = [
    { name: "message_person", result: { ok: true, detail: { to: "Violet" } } },
    { name: "message_person", result: { ok: true, detail: { to: "Cynthia" } } },
  ];
  assert.equal(claimsSendWithoutSend(reply, tools), false);
});

// Future-tense exemption must survive the patch.
run("future_tense_claim_is_honest", () => {
  const reply = "I'll send to Violet next.";
  assert.equal(claimsSendWithoutSend(reply, []), false);
});

// Bare lie with no successful sends — already caught today, must stay caught.
run("bare_send_claim_no_tool_is_caught", () => {
  const reply = "Sent to Violet.";
  assert.equal(claimsSendWithoutSend(reply, []), true);
});

// Reply with no send claim at all — must NOT fire.
run("no_send_claim_does_not_fire", () => {
  const reply = "Good morning Nur.";
  assert.equal(claimsSendWithoutSend(reply, []), false);
});

// Reply matches SEND_HAS in the lie sentence; succeeded send unrelated person.
run("send_has_lie_in_second_sentence_is_caught", () => {
  const reply = "Logged it for Violet. Cynthia has the message now.";
  const tools = [
    { name: "post_to_group", result: { ok: true } },
  ];
  const got = claimsSendWithoutSend(reply, tools);
  assert.equal(got, true, "Cynthia 'has the message' is a SEND_HAS lie regardless of post_to_group success");
});

console.log(`\n  Results: ${pass} pass / ${fail} fail`);
console.log(`\n  DISPATCH-2 patch landed in sasa.ts: per-sentence recipient matching.`);
console.log(`  All 6 tests should be green. If any are red, the patch or this mirror is wrong.\n`);
process.exit(fail > 0 ? 1 : 0);
