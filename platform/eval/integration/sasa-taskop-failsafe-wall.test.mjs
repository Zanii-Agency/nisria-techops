// Task-op fail-safe wall (2026-07-01). The greedy NL task-op parsers (state/comment/
// dependency/priority) fire on everyday speech ("the report is done", "the situation is
// urgent", "success depends on the team", "call me before you leave"). The fix is NOT
// more regex — it's making the HANDLERS fail safe: if no REAL task matches, return false
// and fall through to the brain SILENTLY, instead of a confusing "I don't see that task"
// / "which two tasks to link". A wrong guess then costs nothing. This wall pins that the
// handlers are boolean + no-match returns false + the dispatch gates opsHandled on it.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);
const SRC = readFileSync(resolve(HERE, "../../app/api/whatsapp/worker/route.ts"), "utf8");

// ---- G1: all four handlers are Promise<boolean> ----
for (const h of ["handleState", "handleComment", "handleDep", "handlePriority"]) {
  if (!new RegExp(`const ${h} = async \\([^)]*\\): Promise<boolean>`).test(SRC)) fail(`G1 ${h} must return Promise<boolean>`);
}
if (!process.exitCode) ok("G1 state/comment/dependency/priority handlers return a handled boolean");

// ---- G2: no-match falls through (returns false), does NOT reply "I don't see that task" ----
{
  // the old confusing no-match replies must be gone
  if (/I don't see an open task matching "\$\{st\.title_fragment\}"/.test(SRC)) fail("G2a state no-match must no longer reply 'I don't see that task'");
  else ok("G2a state no-match reply removed (silent fall-through)");
  if (/I don't see an open task matching "\$\{pt\.title_fragment\}"/.test(SRC)) fail("G2b priority no-match must no longer reply the open-tasks list");
  else ok("G2b priority no-match reply removed");
  // and each returns false on no-match
  if (!/const hits = fuzzyMatchTasks\(st\.title_fragment, openRows\);\s*\n\s*if \(hits\.length === 0\) return false;/.test(SRC)) fail("G2c state must return false on no-match");
  else ok("G2c state returns false on no-match (falls through to brain)");
}

// ---- G3: dependency — BOTH sides miss -> silent fall-through (no 'which two to link') ----
{
  if (!/if \(!blockerHits\.length && !blockedHits\.length\) return false;/.test(SRC)) fail("G3a dependency must fall through silently when BOTH sides miss (idiom/list)");
  else ok("G3a dependency both-sides-miss falls through silently");
  // one side matching still asks (real-ish dependency)
  if (!/if \(!blockerHits\.length \|\| !blockedHits\.length\) \{[\s\S]{0,200}two tasks you mean to link/.test(SRC)) fail("G3b dependency with one real side still asks");
  else ok("G3b dependency with one matched side still asks (real-ish)");
}

// ---- G4: dispatch gates opsHandled on the handler's return (fall-through works) ----
{
  for (const [p, h] of [["parseStateTransition", "handleState"], ["parseTaskComment", "handleComment"], ["parseTaskDependency", "handleDep"], ["parseTaskPriority", "handlePriority"]]) {
    if (!new RegExp(`opsHandled = await ${h}\\(`).test(SRC)) fail(`G4 single-op dispatch must set opsHandled = await ${h}(...)`);
  }
  if (!process.exitCode) ok("G4 dispatch only marks handled when the handler acted (else brain runs)");
}

if (process.exitCode) console.error("\nsasa-taskop-failsafe-wall: FAIL");
else console.log("\nsasa-taskop-failsafe-wall: ALL GREEN");
