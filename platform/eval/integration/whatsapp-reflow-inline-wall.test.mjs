// Inline-list reflow wall (2026-07-14). The model writes enumerations on one line
// ("Right now I can: 1. Search 2. Look up 3. Flag"); humanize preserves newlines but
// cannot invent the ones the model omitted, so an inline list ships as a run-on blob.
// reflowInlineLists (wired into formatWhatsApp at the send seam) breaks it apart —
// conservatively, so prices/dates are never shattered. This wall tests the REAL code.

import { formatWhatsApp, reflowInlineLists } from "../../lib/whatsapp-format.mjs";

let failed = 0;
const fail = (m) => { failed++; console.error("FAIL:", m); };
const ok = (m) => console.log("PASS:", m);
const lines = (s) => s.split("\n").length;

// R1: colon lead-in numbered list splits onto lines.
{
  const out = formatWhatsApp("Right now I can: 1. Search past messages 2. Look up contacts 3. Flag for you");
  lines(out) >= 4 && /\n1\. Search/.test("\n" + out) && /\n2\. Look up/.test(out) && /\n3\. Flag/.test(out)
    ? ok("R1 colon numbered list reflows") : fail(`R1 not reflowed: ${JSON.stringify(out)}`);
}
// R2: 3+ items with NO colon still reflows.
{
  const out = formatWhatsApp("1. wash 2. dry 3. fold");
  lines(out) === 3 ? ok("R2 3-item list reflows without colon") : fail(`R2: ${JSON.stringify(out)}`);
}
// R3: 2 items WITH colon reflows.
{
  const out = formatWhatsApp("Steps: 1. wash 2. dry");
  lines(out) >= 3 ? ok("R3 2-item list with colon reflows") : fail(`R3: ${JSON.stringify(out)}`);
}
// R4: inline unicode bullets split.
{
  const out = formatWhatsApp("Here you go: • Apples • Oranges • Pears");
  (out.match(/\n•/g) || []).length >= 2 ? ok("R4 inline bullets reflow") : fail(`R4: ${JSON.stringify(out)}`);
}

// --- NEGATIVES: must NOT introduce fake line breaks ---
// N1: currency/decimals untouched (no space after the dot).
{
  const inp = "The budget is $1.5 million and grew 2.3% last year";
  formatWhatsApp(inp) === inp ? ok("N1 prices/decimals untouched") : fail(`N1 mangled: ${JSON.stringify(formatWhatsApp(inp))}`);
}
// N2: "July 1. We met on Aug 2." — 2 markers, NO colon → must stay one line.
{
  const inp = "July 1. We met on Aug 2. It went well.";
  reflowInlineLists(inp) === inp ? ok("N2 date-sentences not shattered") : fail(`N2 shattered: ${JSON.stringify(reflowInlineLists(inp))}`);
}
// N3: "No. 1 priority" style (no dot after the digit) untouched.
{
  const inp = "Priorities: No. 1 backup, No. 2 restore";
  reflowInlineLists(inp) === inp ? ok("N3 'No. 1' untouched") : fail(`N3: ${JSON.stringify(reflowInlineLists(inp))}`);
}
// N4: a single "Step 1. do it." lone marker untouched.
{
  const inp = "Step 1. do the thing then relax.";
  reflowInlineLists(inp) === inp ? ok("N4 lone marker untouched") : fail(`N4: ${JSON.stringify(reflowInlineLists(inp))}`);
}

// --- IDEMPOTENCY: formatWhatsApp is idempotent (contract) ---
{
  const a = formatWhatsApp("Right now I can: 1. Search 2. Look up 3. Flag for you");
  const b = formatWhatsApp(a);
  a === b ? ok("I1 reflow is idempotent") : fail(`I1 not idempotent:\n a=${JSON.stringify(a)}\n b=${JSON.stringify(b)}`);
}
// I2: an already-multiline bullet menu (the capability answer) is unchanged.
{
  const menu = "Here is everything I can help you with:\n\n• Money: log payments\n• People: the roster";
  const out = reflowInlineLists(menu);
  out === menu ? ok("I2 multiline bullet menu untouched") : fail(`I2 changed menu: ${JSON.stringify(out)}`);
}

if (failed) { console.error(`\n${failed} reflow check(s) FAILED`); process.exit(1); }
console.log("\nwhatsapp-reflow-inline-wall: all green");
