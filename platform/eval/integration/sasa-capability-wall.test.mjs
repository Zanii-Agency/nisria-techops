// Capability-answer wall (2026-07-14). The General lane owns only cross-cutting
// tools, so when asked "what functions do you have?" the model listed ~7 and DENIED
// finance ("I do not have a finance tool") — and flattened the menu to one line.
// Fixed deterministically in lib/agents/capability.mjs: a capability question returns
// the fixed, pre-formatted catalog verbatim. This wall imports that REAL module.

import { CAPABILITY_CATALOG, isCapabilityQuestion, capabilityReply } from "../../lib/agents/capability.mjs";

let failed = 0;
const fail = (m) => { failed++; console.error("FAIL:", m); };
const ok = (m) => console.log("PASS:", m);

// C1: real capability questions are detected.
const YES = [
  "What functions do you have?",
  "what can you do",
  "What can you do for me?",
  "What are your capabilities?",
  "Hi, what can you help with?",
  "what features do you have",
  "list your functions",
  "what else can you do?",
];
for (const q of YES) isCapabilityQuestion(q) ? ok(`C1 detects: "${q}"`) : fail(`C1 missed: "${q}"`);

// C2: action questions / unrelated messages are NOT captured (no false menu).
const NO = [
  "what can you do about the generator?",
  "what can you do to fix the Yalla report",
  "can you pay Lucy 15000",
  "what functions does the new grant cover",
  "how do I add inventory",
  "hi",
  "what's the finance summary",
];
for (const q of NO) !isCapabilityQuestion(q) ? ok(`C2 ignores: "${q}"`) : fail(`C2 false-positive: "${q}"`);

// C3: the reply is COMPLETE — names money/finance and every area, never denies.
const r = capabilityReply();
r.toLowerCase().includes("money") && /payment|donation|financ/.test(r.toLowerCase())
  ? ok("C3 reply includes money/finance") : fail("C3 reply missing money/finance");
!/(do not|don't|can'?t|cannot|no) [a-z ]*(finance|payment) tool/i.test(r)
  ? ok("C3 reply denies nothing") : fail("C3 reply denies a capability");

// C4: the reply is MULTI-LINE (the flattening bug cannot recur — real \n between items).
(r.match(/\n/g) || []).length >= 8 ? ok("C4 reply is multi-line (>=8 newlines)") : fail(`C4 reply flattened: ${(r.match(/\n/g)||[]).length} newlines`);

// C5: catalog covers all eight capability areas.
const areas = ["Money", "People", "Tasks", "Programs", "Documents", "Messages", "Resources", "letterhead"];
const missing = areas.filter((a) => !CAPABILITY_CATALOG.includes(a));
missing.length === 0 ? ok("C5 catalog covers all areas") : fail(`C5 catalog missing: ${missing.join(", ")}`);

if (failed) { console.error(`\n${failed} capability check(s) FAILED`); process.exit(1); }
console.log("\nsasa-capability-wall: all green");
