// Eval 04 — 727 emoji reaction → complete_task deterministic handler.
//
// The worker route detects a "completion" reaction on an outbound Sasa
// message and ticks the matching task without invoking the model. The reaction
// signal set: ✅ ✔ 👍 💯 🙌 👌 🎉. The handler looks up the source task by
// (a) the outbound message's source_message_id pointer, OR (b) a title
// substring match if the outbound body contains "logged for X" / "created X"
// / "assigned X to Y".

import assert from "node:assert/strict";

// The reaction set frozen in FROZEN-SPEC §9.
const COMPLETE_REACTIONS = new Set(["✅", "✔️", "✔", "👍", "💯", "🙌", "👌", "🎉"]);

function isCompleteReaction(emoji) {
  if (!emoji) return false;
  return COMPLETE_REACTIONS.has(String(emoji).trim());
}

// Extract a task title fragment from a Sasa outbound. Patterns we expect:
//   "Logged for Cynthia: <title>"
//   "Created the task \"<title>\""
//   "Marked \"<title>\" done"
// Returns the fragment or null.
function extractTitleFromOutbound(text) {
  if (!text) return null;
  let m = text.match(/created the task\s+"([^"]+)"/i);
  if (m) return m[1];
  m = text.match(/logged for\s+\w+(?:\s+\w+)*?:\s*(.+?)(?:\.|\s*$)/i);
  if (m) return m[1];
  m = text.match(/assigned\s+to\s+\w+(?:\s+\w+)*?:\s*(.+?)(?:\.|\s*$)/i);
  if (m) return m[1];
  return null;
}

let pass = 0, fail = 0;
console.log("\n  Eval 04 — reaction → complete_task shape\n");

function run(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); pass++; } catch (e) { console.log(`  ✗ ${name}\n      ${e.message}`); fail++; }
}

run("check_mark_is_complete_reaction", () => {
  assert.equal(isCompleteReaction("✅"), true);
  assert.equal(isCompleteReaction("👍"), true);
  assert.equal(isCompleteReaction("🎉"), true);
});

run("thumbs_down_is_not_complete_reaction", () => {
  assert.equal(isCompleteReaction("👎"), false);
  assert.equal(isCompleteReaction("😬"), false);
  assert.equal(isCompleteReaction(""), false);
  assert.equal(isCompleteReaction(null), false);
});

run("logged_for_pattern_extracts_title", () => {
  const t = extractTitleFromOutbound("Logged for Cynthia: move Drive ownership of Maisha folder. Want me to ping her?");
  assert.equal(t, "move Drive ownership of Maisha folder");
});

run("created_the_task_pattern_extracts_title", () => {
  const t = extractTitleFromOutbound('Created the task "Look into Google Grant vs Google Ads", assigned to Taona.');
  assert.equal(t, "Look into Google Grant vs Google Ads");
});

run("unrelated_outbound_returns_null", () => {
  assert.equal(extractTitleFromOutbound("Good morning, how can I help?"), null);
  assert.equal(extractTitleFromOutbound(""), null);
  assert.equal(extractTitleFromOutbound(null), null);
});

// Bonus: handler logic — given a reaction body, look up the outbound that was
// reacted to. Mock the messages table and verify the handler resolves the task.
function reactionHandlerSimulate({ reactionBody, targetExternalId, outbox }) {
  if (!isCompleteReaction(reactionBody)) return { acted: false, reason: "not_a_complete_reaction" };
  const target = outbox.find((m) => m.external_id === targetExternalId && m.direction === "out");
  if (!target) return { acted: false, reason: "no_target_message" };
  const titleFrag = extractTitleFromOutbound(target.body);
  if (!titleFrag) return { acted: false, reason: "no_title_in_outbound" };
  return { acted: true, target_id: target.id, title_fragment: titleFrag };
}

run("end_to_end_simulated_completion", () => {
  const outbox = [
    { id: "out-1", external_id: "wa-out-1", direction: "out", body: "Logged for Cynthia: print the packing list. Want me to ping her?" },
    { id: "out-2", external_id: "wa-out-2", direction: "out", body: "Good morning Nur" },
  ];
  const r = reactionHandlerSimulate({ reactionBody: "✅", targetExternalId: "wa-out-1", outbox });
  assert.ok(r.acted);
  assert.equal(r.title_fragment, "print the packing list");
});

run("reaction_on_unrelated_outbound_skipped", () => {
  const outbox = [{ id: "out-1", external_id: "wa-out-1", direction: "out", body: "Good morning Nur" }];
  const r = reactionHandlerSimulate({ reactionBody: "✅", targetExternalId: "wa-out-1", outbox });
  assert.equal(r.acted, false);
});

console.log(`\n  Results: ${pass} pass / ${fail} fail\n`);
process.exit(fail > 0 ? 1 : 0);
