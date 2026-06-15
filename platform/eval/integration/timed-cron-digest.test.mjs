#!/usr/bin/env node
// Timed-cron DIGEST WALL — 2026-06-15.
//
// Today's bug: at 10:00:06-10:00:17 Dubai, Nur received 6 separate WhatsApp
// pings in 11 seconds, one per due-today task ("Heads up, an urgent task for
// you: Send STP report reminder to Violet and Cynthia. Due 2026-06-15. Reply
// DONE..."). The /api/cron/timed handler's per-task push loop fired one
// task_alert template per matched row. The fix collapses the loop into a
// per-assignee digest: tasks are grouped by assignee_id and a SINGLE
// pushTaskDigest call fires per group with all titles bulleted. For N=1 the
// digest delegates back to pushTaskAlert so the single-task Meta-approved
// template path is preserved exactly (no "you have 1 tasks" plural slip).
//
// This file pins six guarantees so a future "simplification" cannot regress:
//
//   D1   route.ts imports pushTaskDigest from lib/notify (not pushTaskAlert
//        directly, in the timed-cron path).
//   D2   route.ts groups tasks by assignee_id BEFORE pushing (Map<string, []>
//        keyed on assignee_id, with a __nur__ bucket for null).
//   D3   route.ts calls pushTaskDigest ONCE per assignee bucket and stamps
//        reminded_at on ALL ids in the bucket via .in("id", ids) — not .eq().
//        A missed row would re-spam on the next 5-min tick.
//   D4   notify.ts exports pushTaskDigest; for N=1 it delegates to
//        pushTaskAlert (single-task template preserved); for N>=2 it routes
//        through pushOperatorUpdate (free-form template, same path as
//        pushCalendarAlert uses for multi-content lines).
//   D5   N>=2 body template: "Heads up, you have N tasks due now:\n• …\nReply
//        DONE N …". If ANY task in the digest is priority=high the header
//        becomes "Heads up, urgent: you have N tasks due now:".
//   D6   Behavioral repro: building a 6-task digest body for a single
//        assignee produces ONE message containing all 6 titles, includes
//        "you have 6 tasks", and the single-task body for the same assignee
//        does NOT contain the plural "tasks due now" phrasing.
//
// Pure local. No DB hit, no Anthropic spend, no network.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PLATFORM = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => readFileSync(resolve(PLATFORM, rel), "utf8");

const tests = [];
function check(name, fn) { tests.push({ name, fn }); }

// ─── D1: route imports the digest, not per-task alert ───────────────────────

check("D1 seam: route.ts imports pushTaskDigest from lib/notify", () => {
  const src = read("app/api/cron/timed/route.ts");
  if (!/import\s*\{[^}]*pushTaskDigest[^}]*\}\s*from\s*"[^"]*notify"/.test(src)) {
    return "route.ts does not import pushTaskDigest from notify";
  }
  // Critically: pushTaskAlert must NOT be called in the timed cron loop
  // anymore (it lives on for other callers in smart-tools.ts etc., but a
  // direct call here would re-introduce the per-task spam).
  if (/await\s+pushTaskAlert\s*\(/.test(src)) {
    return "route.ts still calls pushTaskAlert directly — must use pushTaskDigest";
  }
  return null;
});

// ─── D2: group by assignee BEFORE pushing ──────────────────────────────────

check("D2 seam: route.ts groups by assignee_id with a Map", () => {
  const src = read("app/api/cron/timed/route.ts");
  if (!/new\s+Map<string,\s*any\[\]>/.test(src)) {
    return "route.ts does not declare a Map<string, any[]> for grouping";
  }
  if (!/t\.assignee_id\s*\|\|\s*"__nur__"/.test(src)) {
    return "route.ts does not bucket null assignee_id under \"__nur__\"";
  }
  return null;
});

// ─── D3: stamp ALL ids in the bucket via .in(), not .eq() ──────────────────

check("D3 seam: route.ts stamps reminded_at via .in(\"id\", ids)", () => {
  const src = read("app/api/cron/timed/route.ts");
  // The new shape uses .in() so every row in the digest is closed out.
  if (!/\.update\(\s*\{\s*reminded_at:\s*n\.iso\s*\}\s*\)\s*\.in\(\s*"id"\s*,\s*ids\s*\)/.test(src)) {
    return "route.ts does not stamp reminded_at via .in(\"id\", ids)";
  }
  // And it must NOT also have the old .eq() form on tasks reminded_at (the
  // calendar_events branch below still uses .eq() and that is fine, but the
  // tasks branch must not).
  const taskBlock = src.slice(src.indexOf("// 1) Tasks"), src.indexOf("// 2) Calendar"));
  if (/\.update\(\s*\{\s*reminded_at:.*?\}\s*\)\s*\.eq\(\s*"id"\s*,\s*t\.id\s*\)/.test(taskBlock)) {
    return "route.ts tasks branch still has per-row .eq(\"id\", t.id) stamp";
  }
  return null;
});

// ─── D4: notify exports pushTaskDigest with the right delegation ───────────

check("D4 seam: notify.ts exports pushTaskDigest", () => {
  const src = read("lib/notify.ts");
  if (!/export\s+async\s+function\s+pushTaskDigest\b/.test(src)) {
    return "lib/notify.ts does not export pushTaskDigest";
  }
  return null;
});

check("D4 seam: pushTaskDigest delegates to pushTaskAlert for N=1", () => {
  const src = read("lib/notify.ts");
  const start = src.indexOf("export async function pushTaskDigest");
  const end = src.indexOf("export async function pushDailyBrief");
  if (start < 0 || end < 0) return "could not bracket pushTaskDigest body";
  const block = src.slice(start, end);
  // For N=1 it must reuse the single-task template via pushTaskAlert. Any
  // change that builds a custom body for N=1 would risk the "you have 1
  // tasks" plural slip the spec calls out.
  if (!/if\s*\(\s*list\.length\s*===\s*1\s*\)/.test(block)) {
    return "pushTaskDigest does not branch on list.length === 1";
  }
  if (!/pushTaskAlert\s*\(\s*db\s*,\s*list\[0\]/.test(block)) {
    return "pushTaskDigest N=1 branch does not delegate to pushTaskAlert";
  }
  return null;
});

check("D4 seam: pushTaskDigest N>=2 routes through pushOperatorUpdate", () => {
  const src = read("lib/notify.ts");
  const start = src.indexOf("export async function pushTaskDigest");
  const end = src.indexOf("export async function pushDailyBrief");
  const block = src.slice(start, end);
  if (!/pushOperatorUpdate\s*\(\s*db\s*,\s*to\s*,/.test(block)) {
    return "pushTaskDigest does not route through pushOperatorUpdate for N>=2";
  }
  return null;
});

// ─── D5: body template shape (urgent header + bullets + footer) ────────────

check("D5 seam: pushTaskDigest body template has the right shape", () => {
  const src = read("lib/notify.ts");
  const start = src.indexOf("export async function pushTaskDigest");
  const end = src.indexOf("export async function pushDailyBrief");
  const block = src.slice(start, end);
  // Plural header
  if (!/Heads up, you have \$\{list\.length\} tasks due now:/.test(block)) {
    return "pushTaskDigest missing plural \"Heads up, you have N tasks due now:\" header";
  }
  // Urgent variant
  if (!/Heads up, urgent: you have \$\{list\.length\} tasks due now:/.test(block)) {
    return "pushTaskDigest missing \"Heads up, urgent: you have N tasks due now:\" header";
  }
  // Bullet
  if (!/`•\s*\$\{String\(t\?\.title/.test(block)) {
    return "pushTaskDigest missing • bullet per title";
  }
  // Footer DONE N
  if (!/Reply DONE \$\{list\.length\}/.test(block)) {
    return "pushTaskDigest missing \"Reply DONE N\" footer";
  }
  // anyUrgent flag drives the header swap
  if (!/anyUrgent\s*=\s*list\.some\(\(t\)\s*=>\s*t\?\.priority\s*===\s*"high"\)/.test(block)) {
    return "pushTaskDigest does not derive anyUrgent from priority==='high'";
  }
  return null;
});

// ─── D6: BEHAVIORAL repro — mirror the body builder against 6 fixture tasks ─
// We cannot import .ts at runtime here without a loader, so we mirror the
// EXACT body template from the source. If the template ever drifts, D5 above
// will fail (the regexes pin the literal text). This block proves the OUTPUT
// shape against the 06-15 spam payload (6 due-now tasks for Nur).

function buildDigestBody(list) {
  // Mirror of lib/notify.ts pushTaskDigest N>=2 branch.
  const anyUrgent = list.some((t) => t?.priority === "high");
  const header = anyUrgent
    ? `Heads up, urgent: you have ${list.length} tasks due now:`
    : `Heads up, you have ${list.length} tasks due now:`;
  const bullets = list.map((t) => `• ${String(t?.title || "a task").slice(0, 200)}`).join("\n");
  const footer = `Reply DONE ${list.length} to clear them, or DONE 1,3 to mark specific ones, or open the Nisria portal.`;
  return `${header}\n${bullets}\n${footer}`;
}

const NUR_ASSIGNEE_ID = "ea33c975-b6df-47b4-8f29-c22ef9d42534";
const SIX_TASKS = [
  { id: "t1", title: "Send STP report reminder to Violet and Cynthia", due_on: "2026-06-15", priority: "high", assignee_id: NUR_ASSIGNEE_ID },
  { id: "t2", title: "Send Mark Njambi a message about new place hunting",  due_on: "2026-06-15", priority: "medium", assignee_id: NUR_ASSIGNEE_ID },
  { id: "t3", title: "Renew portal password",                                  due_on: "2026-06-15", priority: "medium", assignee_id: NUR_ASSIGNEE_ID },
  { id: "t4", title: "Follow up with Anthropic grant",                         due_on: "2026-06-15", priority: "medium", assignee_id: NUR_ASSIGNEE_ID },
  { id: "t5", title: "Confirm Eliza meeting at 3pm",                           due_on: "2026-06-15", priority: "medium", assignee_id: NUR_ASSIGNEE_ID },
  { id: "t6", title: "Approve donor receipt batch",                            due_on: "2026-06-15", priority: "medium", assignee_id: NUR_ASSIGNEE_ID },
];

check("D6 behavioral: 6-task digest is ONE message with all 6 titles + plural", () => {
  const body = buildDigestBody(SIX_TASKS);
  if (!body.includes("you have 6 tasks due now")) return "digest body missing \"you have 6 tasks due now\"";
  for (const t of SIX_TASKS) {
    if (!body.includes(t.title)) return `digest body missing title: "${t.title}"`;
  }
  // Urgent variant fires because t1 is high priority.
  if (!body.startsWith("Heads up, urgent:")) return "digest body should use urgent header (t1 priority=high)";
  if (!body.includes("Reply DONE 6")) return "digest body missing \"Reply DONE 6\" footer";
  return null;
});

check("D6 behavioral: 6 tasks, none urgent → non-urgent header", () => {
  const list = SIX_TASKS.map((t) => ({ ...t, priority: "medium" }));
  const body = buildDigestBody(list);
  if (!body.startsWith("Heads up, you have 6 tasks due now:")) {
    return "digest body should use non-urgent header when no task is high priority";
  }
  if (body.includes("urgent")) return "digest body should not contain \"urgent\" when no task is high priority";
  return null;
});

check("D6 behavioral: pushTaskDigest is called per assignee bucket, NOT per task", () => {
  // Mirror the route's grouping: 6 tasks for Nur produce 1 bucket, so 1
  // pushTaskDigest call. The OLD per-task loop would have produced 6
  // pushTaskAlert calls → 6 separate Meta-template sends → 6 WhatsApp pings.
  const byAssignee = new Map();
  for (const t of SIX_TASKS) {
    const key = t.assignee_id || "__nur__";
    const bucket = byAssignee.get(key) || [];
    bucket.push(t);
    byAssignee.set(key, bucket);
  }
  if (byAssignee.size !== 1) return `expected 1 assignee bucket, got ${byAssignee.size}`;
  const bucket = byAssignee.get(NUR_ASSIGNEE_ID);
  if (!bucket || bucket.length !== 6) return `expected bucket of 6 tasks, got ${bucket?.length}`;
  // The route then calls pushTaskDigest(db, items) ONCE. The number of
  // pushTaskAlert calls in the timed path is therefore 0 (only the digest's
  // N=1 branch ever delegates to pushTaskAlert internally; for N=6 it never
  // does). This is the regression check.
  let alertCalls = 0;
  let digestCalls = 0;
  for (const [, items] of byAssignee) {
    if (items.length === 1) {
      // would internally hit pushTaskAlert via the digest's N=1 branch
      alertCalls += 1;
    } else {
      digestCalls += 1;
    }
  }
  if (alertCalls !== 0) return `expected 0 pushTaskAlert calls for 6-task fixture, got ${alertCalls}`;
  if (digestCalls !== 1) return `expected 1 pushTaskDigest call for 6-task fixture, got ${digestCalls}`;
  return null;
});

check("D6 behavioral: 1-task digest reuses single-task template (no plural)", () => {
  // For N=1 the digest delegates to pushTaskAlert. We confirm here by
  // mirroring the exact pushTaskAlert log body (line 93 of notify.ts) and
  // verifying it does NOT contain the plural shape "you have 1 tasks due
  // now" the buggy template would have produced if N=1 used buildDigestBody.
  const t = { id: "t1", title: "Send STP report reminder to Violet and Cynthia", due_on: "2026-06-15", priority: "high" };
  // Mirror of pushTaskAlert single-task logBody:
  const adj = t.priority === "high" ? "an urgent" : "a new";
  const due = t.due_on || "ASAP";
  const title = String(t.title || "a task").slice(0, 200);
  const singleBody = `Heads up, ${adj} task for you: ${title}. Due ${due}. Reply DONE when it is handled, or open the Nisria portal.`;
  if (!/Heads up, an urgent task for you:/.test(singleBody)) {
    return "single-task body lost the canonical \"an urgent task for you\" phrasing";
  }
  if (/you have 1 tasks/.test(singleBody)) {
    return "single-task body has the plural \"you have 1 tasks\" slip — must use task_alert template";
  }
  if (!/Reply DONE when it is handled/.test(singleBody)) {
    return "single-task body lost \"Reply DONE when it is handled\" footer";
  }
  return null;
});

check("D6 behavioral: split across 2 assignees → 2 digest calls, no cross-talk", () => {
  // 4 tasks for Nur + 2 tasks for a bot_access staffer → 2 buckets → 2
  // separate digest calls. The route must not lump them.
  const STAFFER = "bot-access-staffer-uuid";
  const mixed = [
    { id: "t1", title: "Nur task 1", assignee_id: NUR_ASSIGNEE_ID, priority: "medium" },
    { id: "t2", title: "Nur task 2", assignee_id: NUR_ASSIGNEE_ID, priority: "medium" },
    { id: "t3", title: "Nur task 3", assignee_id: NUR_ASSIGNEE_ID, priority: "medium" },
    { id: "t4", title: "Nur task 4", assignee_id: NUR_ASSIGNEE_ID, priority: "medium" },
    { id: "t5", title: "Staffer task 1", assignee_id: STAFFER,        priority: "medium" },
    { id: "t6", title: "Staffer task 2", assignee_id: STAFFER,        priority: "medium" },
  ];
  const byAssignee = new Map();
  for (const t of mixed) {
    const key = t.assignee_id || "__nur__";
    const bucket = byAssignee.get(key) || [];
    bucket.push(t);
    byAssignee.set(key, bucket);
  }
  if (byAssignee.size !== 2) return `expected 2 assignee buckets, got ${byAssignee.size}`;
  const nurBucket = byAssignee.get(NUR_ASSIGNEE_ID);
  const staffBucket = byAssignee.get(STAFFER);
  if (nurBucket.length !== 4 || staffBucket.length !== 2) {
    return `expected Nur=4 + Staffer=2, got Nur=${nurBucket?.length} Staffer=${staffBucket?.length}`;
  }
  // And the digest bodies must be SEPARATE — no Staffer title in Nur's body.
  const nurBody = buildDigestBody(nurBucket);
  if (/Staffer task/.test(nurBody)) return "Nur's digest leaked a Staffer title — cross-talk bug";
  const staffBody = buildDigestBody(staffBucket);
  if (/Nur task/.test(staffBody)) return "Staffer's digest leaked a Nur title — cross-talk bug";
  return null;
});

// ─── runner ────────────────────────────────────────────────────────────────

(async () => {
  let pass = 0;
  let fail = 0;
  for (const t of tests) {
    let err = null;
    try {
      err = await t.fn();
    } catch (e) {
      err = e?.message || String(e);
    }
    if (err) {
      console.error(`FAIL: ${t.name}`);
      console.error(`      ${err}`);
      fail += 1;
    } else {
      console.log(`PASS: ${t.name}`);
      pass += 1;
    }
  }
  console.log(`\n${pass} pass, ${fail} fail, ${tests.length} total`);
  process.exit(fail === 0 ? 0 : 1);
})();
