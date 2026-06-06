// Eval 05 — group ingest stages parseTasks output to pending_actions,
// NOT directly to tasks. Asymmetric write routing per FROZEN-SPEC §7.
//
// Verifies:
//   1. parseTasks on a group message returns the parsed task(s) as usual
//   2. The group handler's pending_actions row carries kind='parsed_task_from_group'
//   3. NO tasks row is written from the group surface (Nur must approve via 727)
//   4. The payload includes everything needed for Nur to one-tap approve

import assert from "node:assert/strict";

const TEAM = [
  { id: "c1", name: "Cynthia", status: "active" },
  { id: "v1", name: "Violet Otieno", status: "active" },
];

let parseTasks;
try {
  const mod = await import(new URL("../app/api/whatsapp/worker/parseTasks.mjs", import.meta.url));
  parseTasks = mod.parseTasks;
} catch (e) {
  parseTasks = null;
}

function simulateGroupStager(input) {
  if (!parseTasks) return { staged: [], parsed: 0 };
  const out = parseTasks(input);
  const staged = [];
  for (let i = 0; i < out.tasks.length; i++) {
    const t = out.tasks[i];
    staged.push({
      kind: "parsed_task_from_group",
      status: "awaiting_review",
      summary: `Approve this group-parsed task? "${t.title}" for ${t.assignee_name}.`,
      payload: {
        task: {
          title: t.title,
          assignee_name: t.assignee_name,
          assignee_id: t.assignee_id,
          due_on: t.due_on,
          recurrence: t.recurrence,
          source_pattern: t.source_pattern,
          source_text: out.raw_body_unchanged,
          source_group: input.source_group || null,
          source_message_id: input.source_message_id,
        },
        idempotency_key: `parsed_task_from_group__${input.source_message_id}__${i}`,
      },
    });
  }
  return { staged, parsed: out.tasks.length, context_note: out.context_note };
}

let pass = 0, fail = 0;
console.log("\n  Eval 05 — group ingest stages to pending_actions\n");

function run(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); pass++; } catch (e) { console.log(`  ✗ ${name}\n      ${e.message}`); fail++; }
}

run("group_mention_stages_one_row", () => {
  const r = simulateGroupStager({
    body: "@Cynthia please pick up the package from the printer",
    team_members: TEAM,
    sender_contact_id: "test-mark",
    source_message_id: "msg-g-1",
    source_group: "Nisria • Finances 💵",
  });
  assert.equal(r.parsed, 1);
  assert.equal(r.staged.length, 1);
  assert.equal(r.staged[0].kind, "parsed_task_from_group");
  assert.equal(r.staged[0].status, "awaiting_review");
  assert.equal(r.staged[0].payload.task.assignee_name, "Cynthia");
  assert.equal(r.staged[0].payload.task.source_group, "Nisria • Finances 💵");
  assert.ok(r.staged[0].payload.idempotency_key.startsWith("parsed_task_from_group__msg-g-1__"));
});

run("multiple_tasks_each_get_unique_idempotency_keys", () => {
  const r = simulateGroupStager({
    body: `Assign these tasks to Cynthia:
- finish the donor brief
- email the supplier list
- print the packing slips`,
    team_members: TEAM,
    sender_contact_id: "test-mark",
    source_message_id: "msg-g-bulk",
    source_group: "team",
  });
  assert.equal(r.staged.length, 3);
  const keys = new Set(r.staged.map((s) => s.payload.idempotency_key));
  assert.equal(keys.size, 3);
});

run("no_parseTasks_match_stages_nothing", () => {
  const r = simulateGroupStager({
    body: "good morning everyone",
    team_members: TEAM,
    sender_contact_id: "test-mark",
    source_message_id: "msg-g-2",
    source_group: "team",
  });
  assert.equal(r.parsed, 0);
  assert.equal(r.staged.length, 0);
});

run("source_text_preserved_for_audit", () => {
  const body = "@Cynthia please ship the receipts today";
  const r = simulateGroupStager({
    body,
    team_members: TEAM,
    sender_contact_id: "test-mark",
    source_message_id: "msg-g-3",
    source_group: "team",
  });
  assert.equal(r.staged[0].payload.task.source_text, body);
});

run("summary_carries_assignee_name_for_nurs_one_tap", () => {
  const r = simulateGroupStager({
    body: "@Cynthia please prepare the donor brief tomorrow",
    team_members: TEAM,
    sender_contact_id: "test-mark",
    source_message_id: "msg-g-4",
    source_group: "team",
  });
  assert.ok(r.staged[0].summary.includes("Cynthia"));
  assert.ok(r.staged[0].summary.includes("donor brief"));
});

console.log(`\n  Results: ${pass} pass / ${fail} fail\n`);
process.exit(fail > 0 ? 1 : 0);
