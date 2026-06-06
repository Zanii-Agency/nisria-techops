// PRIORITY 1 EVAL — task delegation from @-mentions + batch task creation.
//
// Tests the pure function `parseTasks({body, team_members, sender_contact_id,
// source_message_id})` exported from
// `app/api/whatsapp/worker/parseTasks.mjs`.
//
// Cases 1..10 are the golden parseTasks set (real + synthetic). Cases 11..13
// are the v1 negatives: shapes that look near-task-like but must NOT fire
// (comment shape, dependency-link shape, bare emoji reaction shape) — these
// belong to other handlers, not parseTasks. The integration tests for those
// handlers live in evals 02..05.

import assert from "node:assert/strict";

const TEAM = [
  { id: "n1", name: "Nur",            status: "active" },
  { id: "t1", name: "Taona",          status: "active" },
  { id: "v1", name: "Violet Otieno",  status: "active" },
  { id: "c1", name: "Cynthia",        status: "active" },
  { id: "m1", name: "Mark",           status: "active" },
  { id: "d1", name: "Dorcas",         status: "active" },
  { id: "e1", name: "Edith Wanjiru",  status: "active" },
];

let apiCallsMade = 0;
function noteApiCall() { apiCallsMade++; }

let parseTasks;
try {
  const mod = await import(
    new URL("../app/api/whatsapp/worker/parseTasks.mjs", import.meta.url)
  );
  parseTasks = mod.parseTasks;
} catch (e) {
  parseTasks = null;
}

const cases = [
  {
    name: "1. Explicit imperative single task → Cynthia Drive ownership",
    body: "Assign this task to Cynthia: move Drive ownership of Maisha folder",
    expect: { taskCount: 1, tasks: [{ assignee_name: "Cynthia", assignee_id: "c1", title_includes: "move Drive ownership of Maisha folder", recurrence: "none", source_pattern: "imperative" }] },
  },
  {
    name: "2. Bullet-list multi-task → 3 tasks for Cynthia",
    body: `Assign these tasks to Cynthia:
- move the ownership of the Drive folders to me
- share a database of suppliers
- put together the brand guide`,
    expect: { taskCount: 3, tasks: [
      { assignee_name: "Cynthia", assignee_id: "c1", title_includes: "move the ownership of the Drive folders", source_pattern: "bullet_item" },
      { assignee_name: "Cynthia", assignee_id: "c1", title_includes: "share a database of suppliers", source_pattern: "bullet_item" },
      { assignee_name: "Cynthia", assignee_id: "c1", title_includes: "put together the brand guide", source_pattern: "bullet_item" },
    ] },
  },
  {
    name: "3. @-mention in DM with verb → Violet task",
    body: "@Violet can you arrange with Mark to give you all the receipts this week. thanks 🙏🏽",
    expect: { taskCount: 1, tasks: [{ assignee_name: "Violet Otieno", assignee_id: "v1", title_includes: "arrange with Mark", source_pattern: "mention_in_dm" }] },
  },
  {
    name: "4. Explicit imperative for owner → Taona task",
    body: "Assign this task to Taona: Look into Google Grant vs Google Ads",
    expect: { taskCount: 1, tasks: [{ assignee_name: "Taona", assignee_id: "t1", title_includes: "Look into Google Grant vs Google Ads", source_pattern: "imperative" }] },
  },
  {
    name: "5. Self-reminder → Nur task with due date",
    body: "Remind me to do the 990 form next week",
    expect: { taskCount: 1, tasks: [{ assignee_name: "Nur", assignee_id: "n1", title_includes: "990 form", source_pattern: "reminder_self" }] },
  },
  {
    name: "6. @-mention WITHOUT verb shape → ZERO tasks, passes to model",
    body: "@Mark thanks for yesterday",
    expect: { taskCount: 0 },
  },
  {
    name: "7. Mixed-assignee bullet list → 2 tasks, different assignees",
    body: `Quick ones for the team:
- Cynthia handle the printer follow-up
- Mark check on Stephen's grandmother`,
    expect: { taskCount: 2, tasks: [
      { assignee_name: "Cynthia", assignee_id: "c1", title_includes: "printer follow-up" },
      { assignee_name: "Mark",    assignee_id: "m1", title_includes: "Stephen" },
    ] },
  },
  {
    name: "8. Recurring task → self, monthly",
    body: "Send a reminder on the 5th of every month to upload all bank statements",
    expect: { taskCount: 1, tasks: [{ assignee_name: "Nur", assignee_id: "n1", title_includes: "upload all bank statements", recurrence: "monthly", source_pattern: "reminder_self" }] },
  },
  {
    name: "9. Delete-shaped message → ZERO tasks",
    body: "Cancel the calls with Edith",
    expect: { taskCount: 0 },
  },
  {
    name: "10. Simple @-mention imperative → Cynthia pickup task",
    body: "@Cynthia please pick up the package from the printer",
    expect: { taskCount: 1, tasks: [{ assignee_name: "Cynthia", assignee_id: "c1", title_includes: "pick up the package from the printer", source_pattern: "mention_in_dm" }] },
  },
  // ── v1 additions: negative parseTasks cases that other handlers own ──
  {
    name: "11. Comment-shape message → ZERO tasks (smart-tools add_task_comment handles it)",
    body: "Great work on the printer pickup, Cynthia",
    expect: { taskCount: 0 },
  },
  {
    name: "12. Dependency-link phrasing → ZERO tasks (link_task_dependency handles it)",
    body: "the printer pickup blocks the receipts task",
    expect: { taskCount: 0 },
  },
  {
    name: "13. Bare emoji reaction body → ZERO tasks (worker reaction handler owns it)",
    body: "✅",
    expect: { taskCount: 0 },
  },
];

let pass = 0, fail = 0;
console.log("\n  Priority 1 — task delegation eval (cases 1..13)\n");

for (const c of cases) {
  if (!parseTasks) {
    console.log(`  ✗ ${c.name}`);
    console.log(`      reason: parseTasks does NOT EXIST yet.`);
    fail++;
    continue;
  }
  apiCallsMade = 0;
  try {
    const input = {
      body: c.body,
      team_members: TEAM,
      sender_contact_id: "test-nur",
      source_message_id: `test-msg-${pass + fail}`,
      today: "2026-06-07",
    };
    const result = parseTasks(input);
    assert.equal(apiCallsMade, 0, "parseTasks must be pure — no API calls allowed");
    assert.ok(Array.isArray(result.tasks), "tasks must be an array");
    assert.equal(typeof result.context_note, "string", "context_note must be a string");
    assert.equal(result.raw_body_unchanged, input.body, "raw_body_unchanged must equal input body");
    assert.equal(result.tasks.length, c.expect.taskCount, `expected ${c.expect.taskCount} tasks, got ${result.tasks.length}`);
    if (c.expect.tasks) {
      for (let i = 0; i < c.expect.tasks.length; i++) {
        const want = c.expect.tasks[i];
        const got = result.tasks[i];
        assert.ok(got, `task[${i}] missing`);
        if (want.assignee_name) assert.equal(got.assignee_name, want.assignee_name, `task[${i}] assignee_name mismatch`);
        if (want.assignee_id) assert.equal(got.assignee_id, want.assignee_id, `task[${i}] assignee_id mismatch`);
        if (want.title_includes) assert.ok(got.title.toLowerCase().includes(want.title_includes.toLowerCase()), `task[${i}] title "${got.title}" does not include "${want.title_includes}"`);
        if (want.recurrence) assert.equal(got.recurrence, want.recurrence, `task[${i}] recurrence mismatch`);
        if (want.source_pattern) assert.equal(got.source_pattern, want.source_pattern, `task[${i}] source_pattern mismatch`);
      }
    }
    console.log(`  ✓ ${c.name}`);
    pass++;
  } catch (e) {
    console.log(`  ✗ ${c.name}`);
    console.log(`      error:  ${e.message}`);
    fail++;
  }
}

console.log(`\n  Results: ${pass} pass / ${fail} fail / ${cases.length} total\n`);
process.exit(fail > 0 ? 1 : 0);
