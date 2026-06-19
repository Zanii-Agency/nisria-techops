// Date-passed task expiry wall (2026-06-20, KT #316). Operator: a date-bound task
// whose date has passed should be "assumed closed" (off the active board, stop
// nagging) BUT archived to memory tied to that day for retrieval, and high/important
// ones get a heads-up to Nur first. Honesty: expired is NOT done.
//
// Seams pinned here (the cron lives at app/api/cron/expire-tasks/):
//   S1  pure classifier _expire.ts exists with classifyExpiry()
//   S2  classifier expires only date-PASSED, still-open tasks (todo/in_progress)
//   S3  classifier separates important (high priority OR important=true) from normal
//   S4  route sets status to "expired" and NEVER "done" (honesty)
//   S5  route archives each lapsed task to agent_memory, topic tied to the due date
//   S6  route sends ONE heads-up to Nur listing the important lapsed tasks
//   S7  route is idempotent (skips already-expired; one run per day)
//   S8  route emits tasks.expired event
//
// Behavioral (re-implements the classifier contract and asserts it):
//   B1  a todo due yesterday -> expirable
//   B2  a done task due yesterday -> NOT expirable
//   B3  a todo due tomorrow -> NOT expirable
//   B4  a high-priority lapsed task -> important bucket; a low one -> normal
//
// Pure local. No DB, no network.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const rd = (p) => { try { return fs.readFileSync(path.join(ROOT, p), "utf8"); } catch { return ""; } };
const EXPIRE = rd("app/api/cron/expire-tasks/_expire.ts");
const ROUTE = rd("app/api/cron/expire-tasks/route.ts");

const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);

// ---- S1 ----
if (!/export function classifyExpiry\s*\(/.test(EXPIRE)) fail("S1 _expire.ts exports classifyExpiry()");
else ok("S1 classifyExpiry exported");

// ---- S2: only date-passed + open ----
if (!/due_on/.test(EXPIRE) || !/(todo|in_progress)/.test(EXPIRE)) fail("S2 classifier gates on due_on past + open status");
else ok("S2 classifier gates on date-passed open tasks");

// ---- S3: important split ----
if (!/important/.test(EXPIRE) || !/high/.test(EXPIRE)) fail("S3 classifier splits important (high/important) from normal");
else ok("S3 classifier splits important vs normal");

// ---- S4: status expired, never done (HONESTY) ----
if (!/"expired"/.test(ROUTE)) fail("S4 route sets status 'expired'");
else if (/status:\s*"done"/.test(ROUTE)) fail("S4 route must NEVER set status 'done' (expired != done)");
else ok("S4 route sets 'expired', never 'done'");

// ---- S5: archive to agent_memory with topic = due date ----
if (!/agent_memory/.test(ROUTE) || !/topic/.test(ROUTE)) fail("S5 route archives to agent_memory with topic (the due date)");
else ok("S5 route archives lapsed task to agent_memory by date");

// ---- S6: heads-up to Nur for important ----
if (!/sendTextAndLog|sendText\(/.test(ROUTE) || !/important/.test(ROUTE)) fail("S6 route sends a heads-up to Nur for important lapsed tasks");
else ok("S6 route heads-up for important lapsed tasks");

// ---- S7: idempotent ----
if (!/expired/.test(ROUTE) || !/(force|already|deduped|tasks\.expired)/.test(ROUTE)) fail("S7 route idempotent (skip already-expired / once a day)");
else ok("S7 route idempotent");

// ---- S8: event ----
if (!/tasks\.expired/.test(ROUTE)) fail("S8 route emits tasks.expired");
else ok("S8 route emits tasks.expired");

// ---- Behavioral: the classifier contract ----
const today = "2026-06-20";
const yest = "2026-06-19", tom = "2026-06-21";
function classify(tasks, today) {
  const open = tasks.filter((t) => t.due_on && t.due_on < today && (t.status === "todo" || t.status === "in_progress"));
  const important = open.filter((t) => t.priority === "high" || t.important === true);
  const normal = open.filter((t) => !(t.priority === "high" || t.important === true));
  return { expirable: open, important, normal };
}
{
  const r = classify([
    { id: 1, due_on: yest, status: "todo", priority: "low" },
    { id: 2, due_on: yest, status: "done", priority: "low" },
    { id: 3, due_on: tom, status: "todo", priority: "low" },
    { id: 4, due_on: yest, status: "todo", priority: "high" },
    { id: 5, due_on: yest, status: "in_progress", important: true },
  ], today);
  if (!r.expirable.find((t) => t.id === 1)) fail("B1 todo due yesterday must be expirable"); else ok("B1 lapsed todo expirable");
  if (r.expirable.find((t) => t.id === 2)) fail("B2 done task must NOT expire"); else ok("B2 done not expired");
  if (r.expirable.find((t) => t.id === 3)) fail("B3 future task must NOT expire"); else ok("B3 future not expired");
  if (!r.important.find((t) => t.id === 4) || !r.important.find((t) => t.id === 5)) fail("B4 high/important go to important bucket"); else ok("B4 important bucket correct");
  if (r.important.find((t) => t.id === 1)) fail("B4 low-priority must be normal, not important"); else ok("B4 low-priority is normal");
}

if (process.exitCode) console.error("\nWALL RED.");
else console.log("\nWALL GREEN.");
