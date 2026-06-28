// M5 command-vs-confirm homograph wall (2026-06-29). A confirm-gate verb that is ALSO a
// command prefix ("send it to Mark", "log it under rent") must NOT commit a stale staged
// action; it must fall through to the brain. Pure confirmations ("send it", "do it now")
// must still confirm. This wall extracts the ACTUAL `yes` and `strictYes` regex literals
// from worker/route.ts and runs them (zero-drift: it tests the deployed logic, not a copy).
// Pure offline, no API spend.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const W = fs.readFileSync(path.resolve(HERE, "..", "..", "app", "api", "whatsapp", "worker", "route.ts"), "utf8");
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);

const extract = (name) => {
  const m = W.match(new RegExp("const " + name + " = (/.+/)\\.test\\(t\\)"));
  if (!m) { fail(`could not extract the ${name} regex literal from worker/route.ts`); return null; }
  try { return eval(m[1]); } catch (e) { fail(`${name} regex literal did not eval: ${e.message}`); return null; }
};
const yes = extract("yes");
const strictYes = extract("strictYes");

// Inputs are lowercased exactly as the worker does (const t = command.trim().toLowerCase()).
const lc = (s) => s.toLowerCase();
const CONFIRM = ["yes", "yes please", "confirm", "verified", "do it", "do it now", "send it", "send it please", "send it now!", "go ahead", "approved", "correct", "ndio", "✅", "👍"];
const STRICT_FALL = ["send it to mark", "log it under rent", "do it for the school fund", "send it to him", "send the report to mark", "great", "sure", "perfect", "fine", "sounds good", "no", "later"];
const LOOSE_CONFIRM = [...CONFIRM, "great", "perfect", "sure", "fine", "sounds good", "absolutely", "poa"];
const LOOSE_FALL = ["send it to mark", "log it under rent", "post it to instagram", "save it as draft", "send the report to mark", "send a reminder to the team", "no", "later"];

if (strictYes) {
  for (const c of CONFIRM) if (!strictYes.test(lc(c))) fail(`strictYes must confirm ${JSON.stringify(c)}`);
  for (const c of STRICT_FALL) if (strictYes.test(lc(c))) fail(`strictYes must NOT commit on ${JSON.stringify(c)} (praise or a new command)`);
  if (!process.exitCode) ok("strictYes: bare confirmations commit; 'send it to X'/'log it under Y' + praise fall through");
}
if (yes) {
  for (const c of LOOSE_CONFIRM) if (!yes.test(lc(c))) fail(`loose yes must confirm ${JSON.stringify(c)}`);
  for (const c of LOOSE_FALL) if (yes.test(lc(c))) fail(`loose yes must NOT commit on ${JSON.stringify(c)} (a new command)`);
  if (!process.exitCode) ok("loose yes: praise + bare confirmations commit; command-with-object forms fall through");
}

if (process.exitCode) console.error("\nWALL RED.");
else console.log("\nWALL GREEN.");
