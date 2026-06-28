// M1 + M2 wall (2026-06-29).
// M1: the MAIN brain reply must go through the single chokepoint sendTextAndLog with the
//     Law-12 dev gate (harness reroutes to the dev phone, never persists), not raw sendText
//     + a manual messages insert that bypassed dev-reroute, sanitize, mirror, and medic.
// M2: a ✅ reaction whose target task can't be identified must ASK when several open tasks
//     came from the reactor's recent inbound, instead of silently completing the newest.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const W = fs.readFileSync(path.resolve(HERE, "..", "..", "app", "api", "whatsapp", "worker", "route.ts"), "utf8");
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);

// ---- M1: main reply through the chokepoint + dev gate + sandboxed emit ----
{
  if (/const res = await sendText\(from, reply\);/.test(W)) fail("M1a the main reply must NOT use raw sendText(from, reply) (bypasses Law-12 + sanitize)");
  else ok("M1a main reply no longer uses raw sendText");
  if (!/const res = await sendTextAndLog\(db, from, reply, \{ contactId, handledBy: "sasa", dev: devTurn \? true : undefined/.test(W))
    fail("M1b the main reply must route through sendTextAndLog with the dev gate");
  else ok("M1b main reply routes through sendTextAndLog with dev gate");
  if (!/if \(devTurn\) await withSandbox\(emitOut\); else await emitOut\(\);/.test(W))
    fail("M1c the message_out emit must be sandboxed on harness turns (no audit-log pollution)");
  else ok("M1c message_out emit sandboxed on harness turns");
}

// ---- M2: reaction ambiguity ask ----
{
  const i = W.indexOf("Fallback: tasks created from this contact's recent inbound");
  const region = i >= 0 ? W.slice(i, i + 1800) : "";
  if (!region) fail("M2 the reaction fallback region must exist");
  else if (!/\.limit\(4\)/.test(region)) fail("M2a the fallback must fetch more than one candidate (limit 4), not limit(1)");
  else if (!/if \(cands\.length === 1\) pickedTask = cands\[0\]/.test(region)) fail("M2b exactly one recent task is unambiguous -> complete it");
  else if (!/else if \(cands\.length > 1\) ambiguousRecent = cands/.test(region)) fail("M2c several recent tasks -> mark ambiguous, do not auto-pick the newest");
  else ok("M2a-c fallback distinguishes the single-task (complete) from the many-task (ambiguous) case");
  // the ambiguous branch must ASK and return WITHOUT marking any task done
  const ai = W.indexOf("if (!pickedTask && ambiguousRecent.length > 1)");
  // bound the branch exactly at the start of the following `if (pickedTask)` block,
  // so the success block's own tasks.update is never counted against the ambiguous one.
  const pj = ai >= 0 ? W.indexOf("if (pickedTask) {", ai) : -1;
  const abranch = ai >= 0 && pj > ai ? W.slice(ai, pj) : "";
  if (!abranch) fail("M2d the ambiguous branch must exist");
  else if (/from\("tasks"\)\.update/.test(abranch)) fail("M2e the ambiguous branch must NOT mark any task done");
  else if (!/reaction_complete\.ambiguous/.test(abranch)) fail("M2f the ambiguous branch must emit reaction_complete.ambiguous");
  else if (!/markJobDone\(job\.id\);\s*\n\s*return;/.test(abranch)) fail("M2g the ambiguous branch must ask then return (no silent completion)");
  else ok("M2d-g ambiguous reaction asks which task and completes nothing");
}

if (process.exitCode) console.error("\nWALL RED.");
else console.log("\nWALL GREEN.");
