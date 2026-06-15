#!/usr/bin/env node
// Sasa READ-INTENT context wall — 2026-06-15 (Nur 10:13 / 10:22 / 10:28 incident).
//
// LOOP_BREAK_READ ("Let me just pull it. Tell me in one line what you're
// looking for...") fired three times today when Nur was asking Sasa to SEND
// a message (to Mark / Violet / Cynthia). Two root causes:
//
//   (1) isReadIntent in lib/intent.mjs had no SEND-verb negative-list, so
//       any input without WRITE_INTENT_RE keywords and without "?"
//       defaulted to READ (line 19: `return !WRITE_INTENT_RE.test(c)`).
//   (2) The classifier was string-only — it could not see that the prior
//       Sasa turn was a send-prompt, so a bare "Yes" after "Want me to
//       text them?" still classified as READ.
//
// This test pins FIVE seam guarantees so a future "tighten the regex" or
// "drop the second arg" can't silently re-open the failure.
//
//   F1  lib/intent.mjs exports SEND_INTENT_RE (module-level constant).
//   F2  isReadIntent accepts a second arg (history) and uses it.
//   F3  sasa.ts:LOOP_BREAK callsite passes opts.history to isReadIntent.
//   F4  sasa.ts:HONEST_NO_FIGURE callsite passes opts.history to isReadIntent.
//   B   Behavioral repro: the three Nur misfires + the negative case classify
//       correctly when isReadIntent runs against their real prior turns.
//
// Pure local. No DB, no Anthropic, no network. Mirror of the source so a
// future loosening of the guard fails here.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isReadIntent, SEND_INTENT_RE } from "../../lib/intent.mjs";

const PLATFORM = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => readFileSync(resolve(PLATFORM, rel), "utf8");

const tests = [];
function check(name, fn) { tests.push({ name, fn }); }

// ─── F1: SEND_INTENT_RE exists module-level in intent.mjs ──────────────────

check("F1 seam: lib/intent.mjs exports SEND_INTENT_RE", () => {
  const src = read("lib/intent.mjs");
  if (!/export\s+const\s+SEND_INTENT_RE\s*=/.test(src)) {
    return "SEND_INTENT_RE export missing — the negative-list disappeared";
  }
  if (!SEND_INTENT_RE || !(SEND_INTENT_RE instanceof RegExp)) {
    return "SEND_INTENT_RE is not a RegExp at runtime";
  }
  // Behavioral coverage: the regex MUST match each outbound-comm verb shape
  // that fired the Nur misfires. We exercise the actual regex, not the
  // source text — copy-edits to the comments will not break this.
  const must = [
    "Send Mark the file",
    "Message Violet",
    "Text them now",
    "WhatsApp Cynthia",
    "DM him the file",
    "Ping Mark",
    "Tell Mark the news",
    "Let Violet know",
    "Remind Cynthia",
    "Forward the email",
    "Reply to him",
  ];
  for (const s of must) {
    if (!SEND_INTENT_RE.test(s)) return `SEND_INTENT_RE does not match "${s}"`;
  }
  return null;
});

check("F1 seam: SEND_INTENT_RE does NOT eat 'tell me' or 'remind me'", () => {
  // The "tell <person>" arm must negative-lookahead on "me", otherwise
  // "Tell me what Mark said" misclassifies as SEND.
  if (SEND_INTENT_RE.test("Tell me what Mark said")) {
    return "'Tell me what Mark said' wrongly matched SEND_INTENT_RE — negative-lookahead missing or wrong";
  }
  if (SEND_INTENT_RE.test("Remind me to call Mark")) {
    return "'Remind me to call Mark' wrongly matched SEND_INTENT_RE";
  }
  return null;
});

// ─── F2: isReadIntent signature accepts history ────────────────────────────

check("F2 seam: isReadIntent declares a second (history) parameter", () => {
  const src = read("lib/intent.mjs");
  const sig = src.match(/export\s+function\s+isReadIntent\s*\(([^)]*)\)/);
  if (!sig) return "isReadIntent function declaration not found";
  const params = sig[1].split(",").map((s) => s.trim()).filter(Boolean);
  if (params.length < 2) return `isReadIntent has ${params.length} params — needs 2 (command, history)`;
  return null;
});

// ─── F3 + F4: sasa.ts callsites pass opts.history ──────────────────────────

check("F3 seam: sasa.ts LOOP_BREAK callsite passes opts.history", () => {
  const src = read("lib/agents/sasa.ts");
  // Find the LOOP_BREAK_READ callsite block. The isReadIntent call must
  // include opts.history as second arg.
  const block = src.match(/isReadIntent\(opts\.command[^)]*\)[^\n]*\n[^\n]*LOOP_BREAK_READ/);
  if (!block) return "could not locate LOOP_BREAK_READ callsite";
  if (!/isReadIntent\(opts\.command\s*\|\|\s*""\s*,\s*opts\.history\s*\)/.test(block[0])) {
    return "LOOP_BREAK_READ callsite is NOT passing opts.history to isReadIntent";
  }
  return null;
});

check("F4 seam: sasa.ts HONEST_NO_FIGURE callsite passes opts.history", () => {
  const src = read("lib/agents/sasa.ts");
  const block = src.match(/isReadIntent\(opts\.command[^)]*\)[^\n]*\n[^\n]*HONEST_NO_FIGURE_READ/);
  if (!block) return "could not locate HONEST_NO_FIGURE_READ callsite";
  if (!/isReadIntent\(opts\.command\s*\|\|\s*""\s*,\s*opts\.history\s*\)/.test(block[0])) {
    return "HONEST_NO_FIGURE_READ callsite is NOT passing opts.history to isReadIntent";
  }
  return null;
});

// ─── B: behavioral repro of the three Nur misfires + negatives ────────────

const BEHAVIORAL = [
  {
    label: "B1: 10:13 'About the new place hunting' after 'What would you like me to send Mark?' → NOT read",
    history: [
      { role: "user", content: "Tell Mark something" },
      { role: "assistant", content: "What would you like me to send Mark?" },
    ],
    cmd: "About the new place hunting",
    want: false,
  },
  {
    label: "B2: 10:22 'STP report' after target-elicitation → NOT read",
    history: [
      { role: "assistant", content: "Want me to text them both now?" },
      { role: "user", content: "Yes" },
      { role: "assistant", content: "What would you like me to send them?" },
    ],
    cmd: "STP report",
    want: false,
  },
  {
    label: "B3: 10:28 bare 'Yes' after 'Want me to send him a message now?' → NOT read",
    history: [
      { role: "user", content: "Tell Cynthia about the rent" },
      { role: "assistant", content: "Want me to send him a message now?" },
    ],
    cmd: "Yes",
    want: false,
  },
  {
    label: "B4 negative: 'What did Mark say last week?' after send-prompt → IS read",
    history: [
      { role: "assistant", content: "Want me to text Mark now?" },
    ],
    cmd: "What did Mark say last week?",
    want: true,
  },
  {
    label: "B5 negative: 'Pull up the STP document' after send-prompt → IS read",
    history: [
      { role: "assistant", content: "Want me to text Mark now?" },
    ],
    cmd: "Pull up the STP document",
    want: true,
  },
  {
    label: "B6 negative: 'Send Mark the STP report' on its own → NOT read",
    history: [],
    cmd: "Send Mark the STP report",
    want: false,
  },
  {
    label: "B7 backward-compat: bare 'Yes' with NO history → READ (existing default)",
    history: undefined,
    cmd: "Yes",
    want: true,
  },
];

for (const c of BEHAVIORAL) {
  check(c.label, () => {
    const got = isReadIntent(c.cmd, c.history);
    if (got !== c.want) {
      return `expected ${c.want ? "READ" : "WRITE/SEND"} but got ${got ? "READ" : "WRITE/SEND"} for ${JSON.stringify(c.cmd)}`;
    }
    return null;
  });
}

// ─── Run ───────────────────────────────────────────────────────────────────

let pass = 0, fail = 0;
const fails = [];
for (const t of tests) {
  const err = t.fn();
  if (err) { fail++; fails.push({ name: t.name, err }); }
  else pass++;
}
console.log(`\n=== sasa READ-INTENT context wall ===`);
console.log(`  PASS: ${pass} / ${tests.length}`);
console.log(`  FAIL: ${fail}`);
if (fails.length) {
  console.log(`\nfailed:`);
  for (const f of fails) {
    console.log(`  ✗ ${f.name}`);
    console.log(`     ${f.err}`);
  }
  process.exit(1);
}
process.exit(0);
