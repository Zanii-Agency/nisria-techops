// flag_for_clarity wall (2026-06-20, KT #320). The deterministic "when unsure,
// ASK — never guess or silently act" rail, in the operator's tool-verified
// doctrine. When the bot would otherwise guess (possible duplicate records, an
// ambiguous reference it can't resolve, a task with no clear owner, an
// irreversible merge/delete it's unsure about), it calls flag_for_clarity with a
// clear question + the options, instead of picking blindly. The request is logged
// so we can see how often it's unsure.
//
// Seams:
//   S1  tool flag_for_clarity defined in the tool list
//   S2  in the READ_TOOLS allowlist (safe; asks, does not mutate domain data)
//   S3  impl logs a sasa.clarity_requested event
//   S4  impl returns the question (ok:true with the question as summary)
//   S5  prompt instructs: when UNSURE call flag_for_clarity, never guess/silently act
//
// Pure local.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const SMART = fs.readFileSync(path.join(ROOT, "lib", "smart-tools.ts"), "utf8");
const SASA = fs.readFileSync(path.join(ROOT, "lib", "agents", "sasa.ts"), "utf8");
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);

// ---- S1 ----
if (!/name:\s*"flag_for_clarity"/.test(SMART)) fail("S1 flag_for_clarity tool defined");
else ok("S1 flag_for_clarity tool defined");

// ---- S2 ----
if (!/"flag_for_clarity"/.test(SMART.slice(SMART.indexOf("READ_TOOLS"), SMART.indexOf("READ_TOOLS") + 600))) fail("S2 flag_for_clarity in READ_TOOLS allowlist");
else ok("S2 flag_for_clarity in READ_TOOLS");

// ---- S3 + S4: impl logs event + returns the question ----
{
  const i = SMART.indexOf('name === "flag_for_clarity"');
  const block = i >= 0 ? SMART.slice(i, i + 1500) : "";
  if (i < 0) fail("S3/S4 flag_for_clarity impl not found");
  else {
    if (!/sasa\.clarity_requested/.test(block)) fail("S3 impl must log sasa.clarity_requested");
    else ok("S3 impl logs sasa.clarity_requested");
    if (!/ok:\s*true/.test(block) || !/summary/.test(block)) fail("S4 impl returns ok:true with the question as summary");
    else ok("S4 impl returns the question");
  }
}

// ---- S5: prompt rule ----
if (!/flag_for_clarity/.test(SASA)) fail("S5 prompt must tell the bot to call flag_for_clarity when unsure");
else if (!/(unsure|not sure|uncertain)[\s\S]{0,200}flag_for_clarity|flag_for_clarity[\s\S]{0,200}(unsure|guess|silently)/i.test(SASA)) fail("S5 prompt must tie flag_for_clarity to being unsure / not guessing");
else ok("S5 prompt: unsure -> flag_for_clarity, never guess");

if (process.exitCode) console.error("\nWALL RED.");
else console.log("\nWALL GREEN.");
