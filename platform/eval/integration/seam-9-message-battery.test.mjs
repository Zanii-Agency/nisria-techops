// SEAM EVAL — v1.1 architectural-promise contract.
//
// One test case per prod test message. Each case exercises the parseTasks
// surface that v1 promises, and asserts the END-STATE the worker would
// produce. Two surfaces:
//
//   A. parseTasks behavior: rows produced, assignee, source_pattern,
//      recurrence, due_on. Catches reminder_self hardcoded-to-Nur bug
//      (#1'), bullet regex robustness (#2), @-mention resolution (#3),
//      and the negative control (#8).
//
//   B. Static-code assertions: presence of the worker tool-strip after
//      parseTasks fires (defect #1), presence of in_review/abandoned
//      in update_task enum (defect #9), presence of reaction.message_id
//      extraction in the webhook normalizer (defect #5).
//
// Run with:
//   node platform/eval/integration/seam-9-message-battery.test.mjs
//
// Exit code is 0 only if all checks pass.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLATFORM = resolve(__dirname, "../..");

// ───────────────────────────────────────────────────────────────────────────
// Fixtures: real ids from prod team_members
// ───────────────────────────────────────────────────────────────────────────
const SENDER_TAONA_CONTACT_ID = "c16ff282-10ae-437a-a741-1e4ae8ec0e02";
const TAONA = { id: "09943585-0ad9-4e07-a6cf-32f49ecfaa8c", name: "Taona", status: "active" };
const NUR   = { id: "ea33c975-b6df-47b4-8f29-c22ef9d42534", name: "Nur M'nasria", status: "active" };
const ROSTER = [
  NUR, TAONA,
  { id: "v_test_violet", name: "Violet Otieno", status: "active" },
  { id: "c_test_cynthia", name: "Cynthia", status: "active" },
  { id: "m_test_mark", name: "Mark Njambi", status: "active" },
];

// ───────────────────────────────────────────────────────────────────────────
// Load parseTasks pure function
// ───────────────────────────────────────────────────────────────────────────
const { parseTasks } = await import(
  new URL("../../app/api/whatsapp/worker/parseTasks.mjs", import.meta.url)
);

// Run a parseTasks case with sender plumbed through. Tolerates the v1.1
// shape (sender_team_member arg) and falls back if the running build
// doesn't support it yet (so the eval can grade both v1 and v1.1).
function runParse(body, sourceId) {
  const baseInput = {
    body,
    team_members: ROSTER,
    sender_contact_id: SENDER_TAONA_CONTACT_ID,
    source_message_id: sourceId,
    today: "2026-06-07",
  };
  try {
    return parseTasks({ ...baseInput, sender_team_member: TAONA });
  } catch {
    return parseTasks(baseInput);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 9 cases
// ───────────────────────────────────────────────────────────────────────────
const cases = [
  {
    id: "test_1_imperative_reminder_self",
    body: "Remind me to send the Anthropic grant follow-up at 2pm tomorrow",
    expect: {
      taskCount: 1,
      assigneeName: "Taona",
      sourcePattern: "reminder_self",
      titleIncludes: "anthropic grant",
    },
  },
  {
    id: "test_2_bullet_three_items",
    body: "Today's punch list:\n- Pay Mark Njambi 30k KES for the food packages\n- Draft the Java proposal\n- Send Eunice the venue brief by Friday",
    expect: {
      taskCount: 3,
      sourcePattern: "bullet_item",
    },
  },
  {
    id: "test_3_mention_in_dm_nur",
    body: "@Nur can you confirm the Mina Zayed Maan Event by EOD",
    expect: {
      taskCount: 1,
      assigneeName: "Nur M'nasria",
      sourcePattern: "mention_in_dm",
    },
  },
  {
    id: "test_4_recurrence_weekdays_self",
    body: "Remind me every weekday at 9am to check the soak watchdog",
    expect: {
      taskCount: 1,
      assigneeName: "Taona",
      sourcePattern: "reminder_self",
      recurrence: "weekdays",
    },
  },
  {
    id: "test_5_reaction_webhook_plumbing",
    staticCheck: "webhook_extracts_reaction",
  },
  {
    id: "test_6_comments_smart_tool",
    staticCheck: "task_comments_author_id_column",
  },
  {
    id: "test_7_dependencies_smart_tool",
    skip: true,
    reason: "not exercised in prod test battery",
  },
  {
    id: "test_8_negative_control_query",
    body: "hey what's the soak status looking like",
    expect: {
      taskCount: 0,
    },
  },
  {
    id: "test_9a_mark_in_review",
    body: "Mark the Anthropic grant task as in review",
    staticCheck: "update_task_enum_includes_in_review",
  },
  {
    id: "test_9b_abandon_task",
    body: "Abandon the Mark Njambi reimbursement, he refused it",
    staticCheck: "update_task_enum_includes_abandoned",
  },
];

// ───────────────────────────────────────────────────────────────────────────
// Static-code assertion helpers
// ───────────────────────────────────────────────────────────────────────────
function readSrc(rel) {
  return readFileSync(resolve(PLATFORM, rel), "utf8");
}

const staticChecks = {
  webhook_extracts_reaction() {
    const src = readSrc("app/api/whatsapp/webhook/route.ts");
    const hasReactionBranch = /m\.reaction\b|m\.type\s*===?\s*["']reaction["']/.test(src);
    const passesTargetId = /reaction_target_id|reaction\.message_id/.test(src);
    return {
      pass: hasReactionBranch && passesTargetId,
      detail: `reaction branch=${hasReactionBranch}, target id passed=${passesTargetId}`,
    };
  },
  task_comments_author_id_column() {
    const src = readSrc("lib/smart-tools.ts");
    const insertsAuthorId = /from\(["']task_comments["']\)[\s\S]{0,200}author_id/.test(src);
    return {
      pass: insertsAuthorId,
      detail: `add_task_comment writes author_id=${insertsAuthorId} (the migration column)`,
    };
  },
  update_task_enum_includes_in_review() {
    const src = readSrc("lib/smart-tools.ts");
    const inEnum = /update_task[\s\S]{0,2000}enum:\s*\[[^\]]*"in_review"/.test(src);
    const inGuard = /\[\s*"todo"[^\]]*"in_review"/.test(src);
    return {
      pass: inEnum || inGuard,
      detail: `update_task enum or guard accepts in_review = ${inEnum || inGuard}`,
    };
  },
  update_task_enum_includes_abandoned() {
    const src = readSrc("lib/smart-tools.ts");
    const inEnum = /update_task[\s\S]{0,2000}enum:\s*\[[^\]]*"abandoned"/.test(src);
    const inGuard = /\[\s*"todo"[^\]]*"abandoned"/.test(src);
    const hasAbandonTool = /name:\s*"(?:abandon_task|mark_abandoned)"|"abandon_task"\s*:/i.test(src);
    return {
      pass: inEnum || inGuard || hasAbandonTool,
      detail: `update_task accepts abandoned=${inEnum || inGuard}, dedicated abandon_task tool=${hasAbandonTool}`,
    };
  },
  worker_strips_create_task_when_parseTasks_fired() {
    const workerSrc = readSrc("app/api/whatsapp/worker/route.ts");
    const sasaSrc = readSrc("lib/agents/sasa.ts");
    const hasPlumbing = /parsed_task_already_written|parsedContextNote/.test(workerSrc);
    const passesFlag = /parseTasksFired|parsedTasksWritten|stripCreateTask|toolset.*strip|excludeTools/.test(workerSrc) ||
                       /parseTasksFired|parsedTasksWritten|stripCreateTask|excludeTools/.test(sasaSrc);
    return {
      pass: passesFlag,
      detail: `parsed-note plumbing=${hasPlumbing}, tool-strip flag wired=${passesFlag}`,
    };
  },
};

// ───────────────────────────────────────────────────────────────────────────
// Runner
// ───────────────────────────────────────────────────────────────────────────
const results = [];

for (const c of cases) {
  if (c.skip) {
    results.push({ id: c.id, status: "SKIPPED", reason: c.reason });
    continue;
  }

  if (c.staticCheck) {
    const fn = staticChecks[c.staticCheck];
    if (!fn) {
      results.push({ id: c.id, status: "FAIL", error: `unknown static check ${c.staticCheck}` });
      continue;
    }
    try {
      const r = fn();
      results.push({ id: c.id, status: r.pass ? "PASS" : "FAIL", detail: r.detail, kind: "static" });
    } catch (e) {
      results.push({ id: c.id, status: "FAIL", error: String(e.message), kind: "static" });
    }
    continue;
  }

  // parseTasks-level case
  try {
    const r = runParse(c.body, c.id);
    const checks = [];
    if (c.expect.taskCount !== undefined) {
      checks.push({ label: `task_count == ${c.expect.taskCount}`, pass: r.tasks.length === c.expect.taskCount, got: r.tasks.length });
    }
    if (c.expect.taskCount > 0 && c.expect.assigneeName) {
      const got = r.tasks[0]?.assignee_name;
      checks.push({ label: `assignee_name == "${c.expect.assigneeName}"`, pass: got === c.expect.assigneeName, got });
    }
    if (c.expect.taskCount > 0 && c.expect.sourcePattern) {
      const got = r.tasks[0]?.source_pattern;
      checks.push({ label: `source_pattern == "${c.expect.sourcePattern}"`, pass: got === c.expect.sourcePattern, got });
    }
    if (c.expect.recurrence) {
      const got = r.tasks[0]?.recurrence;
      checks.push({ label: `recurrence == "${c.expect.recurrence}"`, pass: got === c.expect.recurrence, got });
    }
    if (c.expect.titleIncludes) {
      const got = String(r.tasks[0]?.title || "").toLowerCase();
      const ok = got.includes(c.expect.titleIncludes.toLowerCase());
      checks.push({ label: `title includes "${c.expect.titleIncludes}"`, pass: ok, got: r.tasks[0]?.title });
    }
    const allPass = checks.every((ch) => ch.pass);
    results.push({ id: c.id, status: allPass ? "PASS" : "FAIL", checks, kind: "parseTasks" });
  } catch (e) {
    results.push({ id: c.id, status: "FAIL", error: String(e.message), kind: "parseTasks" });
  }
}

// One extra static check: the architectural-promise tool-strip
{
  const fn = staticChecks.worker_strips_create_task_when_parseTasks_fired;
  const r = fn();
  results.push({ id: "PROMISE_tool_strip_after_parseTasks", status: r.pass ? "PASS" : "FAIL", detail: r.detail, kind: "static" });
}

// ───────────────────────────────────────────────────────────────────────────
// Report
// ───────────────────────────────────────────────────────────────────────────
const passed  = results.filter((r) => r.status === "PASS").length;
const failed  = results.filter((r) => r.status === "FAIL").length;
const skipped = results.filter((r) => r.status === "SKIPPED").length;

console.log("\n=== SEAM EVAL RESULTS ===\n");
for (const r of results) {
  const marker = r.status === "PASS" ? "PASS" : r.status === "FAIL" ? "FAIL" : "SKIP";
  console.log(`[${marker}] ${r.id}`);
  if (r.error) console.log(`        error: ${r.error}`);
  if (r.detail) console.log(`        ${r.detail}`);
  if (r.checks) {
    for (const ch of r.checks) {
      console.log(`        ${ch.pass ? "+" : "-"} ${ch.label} (got: ${JSON.stringify(ch.got)})`);
    }
  }
  if (r.reason) console.log(`        skip reason: ${r.reason}`);
}
console.log(`\nSummary: ${passed} pass, ${failed} fail, ${skipped} skip\n`);

process.exit(failed === 0 ? 0 : 1);
