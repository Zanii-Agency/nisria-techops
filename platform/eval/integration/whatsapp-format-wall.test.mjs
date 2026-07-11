// WhatsApp outbound format wall (2026-06-21, KT #360). Two real bugs in the send
// path: (1) the model emits Markdown and WhatsApp renders the literal symbols
// (**stars**, ### hashes, [label](url) brackets, pipe tables), and (2) sendText
// hard-sliced at 4096 chars, SILENTLY dropping the rest of a long reply. Fix: a
// deterministic normalizer at the one text chokepoint (sendText) that converts
// Markdown to WhatsApp formatting and splits long text into ordered bubbles, never
// silent loss. Pure functions live in lib/whatsapp-format.mjs so this wall tests
// the REAL code (imported, not a drifting mirror).
//
// Seams:
//   F1  formatWhatsApp converts every Markdown construct WhatsApp can't render
//   F2  formatWhatsApp is idempotent and never invents emphasis
//   F3  splitForWhatsApp never exceeds 4096, never breaks mid-word, marks order
//   F4  splitForWhatsApp never silently drops content (honest cap, all text kept)
//   F5  the send seam (sendText) actually calls format + split before send()

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatWhatsApp, splitForWhatsApp, formatAndSplit } from "../../lib/whatsapp-format.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const W = fs.readFileSync(path.resolve(HERE, "..", "..", "lib", "whatsapp.ts"), "utf8");
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);
const eq = (label, got, want) => { if (got !== want) fail(`${label}\n   got:  ${JSON.stringify(got)}\n   want: ${JSON.stringify(want)}`); else ok(label); };

// ---- F1: Markdown -> WhatsApp conversion ----
eq("F1 bold ** -> *", formatWhatsApp("hello **world**"), "hello *world*");
eq("F1 bold __ -> *", formatWhatsApp("a __b__ c"), "a *b* c");
eq("F1 single-char bold", formatWhatsApp("**x**"), "*x*");
eq("F1 heading -> bold line", formatWhatsApp("## Weekly Report"), "*Weekly Report*");
eq("F1 heading strips inner stars", formatWhatsApp("### **Donors**"), "*Donors*");
eq("F1 bullets - -> bullet dot", formatWhatsApp("- one\n- two"), "• one\n• two");
eq("F1 star bullet -> dot", formatWhatsApp("* item"), "• item");
eq("F1 link -> label (url)", formatWhatsApp("see [Nisria](https://nisria.co)"), "see Nisria (https://nisria.co)");
eq("F1 image -> alt (url)", formatWhatsApp("![logo](https://x.co/a.png)"), "logo (https://x.co/a.png)");
eq("F1 strike ~~ -> ~", formatWhatsApp("~~gone~~"), "~gone~");
eq("F1 inline code ticks stripped", formatWhatsApp("run `npm test` now"), "run npm test now");
eq("F1 horizontal rule dropped", formatWhatsApp("a\n\n---\n\nb"), "a\n\nb");
eq("F1 blank lines collapsed", formatWhatsApp("a\n\n\n\nb"), "a\n\nb");
// table: separator row dropped, pipes made readable
{
  const got = formatWhatsApp("| Name | Age |\n|------|-----|\n| Grace | 12 |");
  if (/\|---/.test(got) || /^\s*\|/.test(got)) fail("F1 table separator/leading pipes must be gone");
  else if (!/Name/.test(got) || !/Grace/.test(got) || !/12/.test(got)) fail("F1 table content must survive");
  else ok("F1 table flattened (separator dropped, content kept, no leading pipe)");
}
// code fence preserved (WhatsApp supports ```), language hint stripped
{
  const got = formatWhatsApp("```js\nconst x = 1;\n```");
  if (!/```/.test(got)) fail("F1 code fence must be preserved (WhatsApp monospace)");
  else if (/```js/.test(got)) fail("F1 code fence language hint must be stripped");
  else if (!/const x = 1;/.test(got)) fail("F1 code inside fence must be untouched");
  else ok("F1 code fence kept, language hint stripped, inner code intact");
}

// ---- F2: idempotent + never invents emphasis ----
{
  const once = formatWhatsApp("## Hi\n- **x** and __y__ and ~~z~~\nsee [a](http://b.co)");
  const twice = formatWhatsApp(once);
  if (once !== twice) fail(`F2 must be idempotent\n   once:  ${JSON.stringify(once)}\n   twice: ${JSON.stringify(twice)}`);
  else ok("F2 idempotent (running twice is a no-op)");
}
eq("F2 empty bold not invented", formatWhatsApp("** **"), "** **");
eq("F2 plain text untouched", formatWhatsApp("just a normal sentence."), "just a normal sentence.");

// ---- F3: split never exceeds 4096, never mid-word, marks order ----
{
  const long = Array.from({ length: 300 }, (_, i) => `Paragraph ${i} carries a handful of words to take up real space here.`).join("\n\n");
  const chunks = splitForWhatsApp(long);
  if (chunks.length < 2) fail("F3 a long message must split into multiple bubbles");
  else if (!chunks.every((c) => c.length <= 4096)) fail("F3 every chunk must be <= 4096 (WhatsApp hard limit)");
  else if (!/\(1\/\d+\)\s*$/.test(chunks[0])) fail("F3 multi-bubble chunks must carry an (i/n) order marker");
  else if (!/\(\d+\/\d+\)\s*$/.test(chunks[chunks.length - 1])) fail("F3 last chunk must also carry the marker");
  else ok(`F3 long text split into ${chunks.length} ordered bubbles, all <= 4096`);
}
eq("F3 short text stays one chunk", splitForWhatsApp("hi").length, 1);
eq("F3 short text gets no marker", splitForWhatsApp("hi")[0], "hi");
{
  // a single enormous word (no spaces) must still chunk under the limit (hard split)
  const huge = "x".repeat(9000);
  const chunks = splitForWhatsApp(huge);
  if (!chunks.every((c) => c.length <= 4096)) fail("F3 a no-space giant must hard-split under 4096");
  else ok("F3 no-space giant hard-splits under the limit");
}

// ---- F1b: tables never survive in chat (live incident 2026-07-11→12) ----
// Unified collapseChatTables owns ALL table shapes: a big table (>2 data rows,
// per-line OR inline run-on) collapses to any total it names + an honest note,
// never a pipe wall and never an itemized cell dump; surrounding prose is kept.
{
  // THE REAL NUR CASE: a well-formed per-line markdown table, 12 rows. The old
  // per-line converter turned each row into "a | b | c" — still an unreadable
  // pipe wall, which is exactly what shipped to the operator. Must now collapse.
  const perLine = "Here is what I have: **Yalla Kenya Film**\n| # | Item | Amount | Person |\n|---|---|---|---|\n| 1 | Wheat flour | 360 | |\n| 2 | Milk | 200 | Dorcas |\n| 3 | Water | 100 | Dorcas |\n| 11 | Mary Kafua | 3,000 | Mary |\n| | Today total | 6,714 | |\n\n32 items await confirmation. Want it on letterhead?";
  const out = formatWhatsApp(perLine);
  if (/\|/.test(out)) fail(`F1b per-line table still has raw pipes on the wire: ${JSON.stringify(out.slice(0, 140))}`);
  else if (/Wheat flour|Milk|Water|Mary Kafua/.test(out)) fail("F1b per-line big table: itemized rows must be collapsed, not shipped");
  else if (!/6,714/.test(out)) fail("F1b per-line big table: the total must survive the collapse");
  else if (!/Here is what I have:/.test(out) || !/Want it on letterhead\?/.test(out)) fail("F1b collapse ate the surrounding prose");
  else if (!/omitted/i.test(out)) fail("F1b big table must leave an honest omitted-note, not vanish silently");
  else ok("F1b per-line 12-row table collapses to total + note, prose kept, zero pipes (the real Nur case)");
}
{
  // inline run-on shape: the whole table crammed onto one line.
  const inline = "Here is what I have: | # | Item | Amount | | 1 | Wheat | 360 | | 2 | Milk | 200 | | 3 | Water | 100 | Today total is 6,714. Want the letterhead version?";
  const out = formatWhatsApp(inline);
  if (/\|/.test(out)) fail(`F1b inline run-on still has raw pipes: ${JSON.stringify(out.slice(0, 140))}`);
  else if (/Wheat|Milk|Water/.test(out)) fail("F1b inline run-on: itemized cells must be collapsed");
  else if (!/6,714/.test(out) || !/Want the letterhead version\?/.test(out)) fail("F1b inline run-on: total + prose must survive");
  else if (!/omitted/i.test(out)) fail("F1b inline run-on must leave an honest note");
  else ok("F1b inline run-on table collapses to total + note, prose kept, zero pipes");
}
{
  // a SMALL table (<=2 data rows) is readable: render as plain "cell — cell" lines,
  // no pipes, data kept — do NOT collapse a 2-line table to a note.
  const small = "Two entries today:\n| Wahome | KES 3000 |\n| Mary | KES 200 |\nThat's all.";
  const out = formatWhatsApp(small);
  if (/\|/.test(out)) fail("F1b small table still has raw pipes");
  else if (!/Wahome/.test(out) || !/3000/.test(out) || !/Mary/.test(out)) fail("F1b small table lost its (few, readable) rows");
  else if (/omitted/i.test(out)) fail("F1b a 2-row table must NOT be collapsed to a note — it is short enough to show");
  else ok("F1b small (<=2 row) table renders as clean plain lines, no pipes, data kept");
}
// ---- F1c: fragment-dump cap (live incident 2026-07-11, operator said STOP) ----
{
  const dump = "Here's the picture:\n- Description\n- Amount\n- Person\n- 1\n- Wheat flour\n- 360\n- 2\n- Milk\n- 200\n- Dorcas Njambi\nTwo questions: include all 32 or just today's 12?";
  const out = formatWhatsApp(dump);
  if (/• (Description|Amount|Person|Wheat flour|Milk|Dorcas Njambi)$/m.test(out)) fail("F1c fragment dump not collapsed — item-level bullets still present");
  else if (!/Here's the picture:/.test(out) || !/Two questions: include all 32/.test(out)) fail("F1c collapse ate the real surrounding prose");
  else if (!/details omitted/i.test(out)) fail("F1c must leave an honest note that detail was omitted, not vanish silently");
  else ok("F1c fragment-dump cap collapses a wall of short bullets, keeps prose + an honest note");
}
{
  // a normal short list (real content per line, not fragments) must be untouched.
  const normal = "3 tasks are open:\n- Fix the generator by Friday\n- Call the bank about the loan\n- Review the Sikka proposal draft";
  if (formatWhatsApp(normal) !== formatWhatsApp(normal).replace(/details omitted/i, "") || /details omitted/i.test(formatWhatsApp(normal)))
    fail("F1c false-positive: a normal 3-item task list got collapsed");
  else ok("F1c a normal short list with real content per line is never collapsed");
}
{
  // a genuine per-line markdown table must be completely unaffected (existing
  // per-line converter owns this shape; the new inline pass must defer to it).
  const clean = "Summary.\n\n| Date | Amount |\n|---|---|\n| Jul 7 | 360 |\n| Jul 8 | 200 |\n\nTotal: 560";
  const before = formatWhatsApp(clean);
  if (/•/.test(before)) fail("F1b regression: a well-formed per-line table got bullet-flattened instead of using the existing row converter");
  else ok("F1b well-formed per-line tables are untouched by the new inline-pipe pass");
}
{
  // one incidental pipe in normal prose (a path, a shrug) must never be touched.
  const prose = "The path is /usr | bin, not a real table.";
  if (formatWhatsApp(prose) !== prose) fail("F1b touched normal prose with a single incidental pipe");
  else ok("F1b leaves normal prose with an incidental single pipe untouched");
}

// ---- F1d: payment-line itemization cap (live incident 2026-07-11, receipt echo) ----
{
  // substantive (non-fragment) bullets that are each individually well-formed,
  // e.g. the model echoing a receipt's payments back one by one — the fragment
  // cap (F1c) does not catch this since each line is real content, not a fragment.
  const receipt = "I recorded the receipt.\n- Wahome, KES 3000, airtime, Jul 11\n- Mama Njambi, KES 50000, food supplies, Jul 7\n- Dorcas, KES 200, milk, Jul 10\n- Dorcas, KES 100, water, Jul 10\nTotal KES 53,300. All logged, awaiting your confirm.";
  const out = formatWhatsApp(receipt);
  if (/Wahome|Mama Njambi|milk|water/.test(out)) fail("F1d itemized payment lines were not collapsed");
  else if (!/Total KES 53,300/.test(out) || !/awaiting your confirm/.test(out)) fail("F1d collapse ate the real total/prose");
  else if (!/omitted/i.test(out)) fail("F1d must leave an honest note, not vanish silently");
  else ok("F1d 4 itemized payment lines collapse to the total + an honest note");
}
{
  // a normal short list with no money content must be untouched (shared guard,
  // re-asserted here since this is a separate pass from F1c).
  const normal = "3 tasks open:\n- Fix the generator by Friday\n- Call the bank about the loan\n- Review the Sikka proposal draft";
  if (formatWhatsApp(normal) !== formatWhatsApp(normal).replace(/omitted/i, ""))
    fail("F1d false-positive: a normal task list with no money content got collapsed");
  else ok("F1d a normal task list with no currency content is never touched by the payment-line cap");
}
{
  // exactly 2 payment mentions is a normal short answer, not a dump — must NOT collapse.
  const two = "Two payments today:\n- Wahome KES 3000\n- Mary KES 200";
  if (formatWhatsApp(two) !== "Two payments today:\n• Wahome KES 3000\n• Mary KES 200")
    fail("F1d false-positive: 2 payment lines (below the 3-line dump threshold) got collapsed");
  else ok("F1d 2 payment lines stays as a normal short answer, not treated as a dump");
}

// ---- F4: never silently drops content ----
{
  // reconstruct: strip the (i/n) markers and the bullet/format noise is N/A here
  // (plain paragraphs in, plain paragraphs out), so all source words must survive.
  const paras = Array.from({ length: 120 }, (_, i) => `Unique token ZZ${i} sits inside paragraph number ${i} with filler words around it.`);
  const long = paras.join("\n\n");
  const chunks = splitForWhatsApp(long);
  const joined = chunks.map((c) => c.replace(/\n\n\(\d+\/\d+\)\s*$/, "")).join("\n\n");
  const missing = paras.filter((_, i) => !joined.includes(`ZZ${i}`));
  if (missing.length) fail(`F4 split dropped ${missing.length} paragraphs silently (e.g. ZZ${paras.findIndex((_, i) => !joined.includes("ZZ" + i))})`);
  else ok("F4 every paragraph survives the split (no silent loss)");
}
{
  // pathological flood: enough content to blow past the safety cap must end with an
  // honest "ask me to continue", never a silent truncation.
  const flood = Array.from({ length: 4000 }, (_, i) => `Sentence ${i} with several words here to force many chunks.`).join("\n\n");
  const chunks = splitForWhatsApp(flood);
  if (chunks.length > 12) fail("F4 the safety cap must bound the bubble count");
  else if (chunks.length === 12 && !/too long to send in full/i.test(chunks[chunks.length - 1])) fail("F4 a capped flood must say so honestly, not drop silently");
  else ok(`F4 flood bounded to ${chunks.length} bubbles with an honest tail (no silent drop)`);
}

// ---- F5: the send seam actually wires format + split ----
{
  if (!/import \{ formatWhatsApp, splitForWhatsApp \} from "\.\/whatsapp-format\.mjs"/.test(W)) fail("F5 whatsapp.ts must import the formatter");
  const i = W.indexOf("export async function sendText");
  const region = i >= 0 ? W.slice(i, i + 2200) : "";
  if (!region) fail("F5 sendText must exist");
  else if (!/splitForWhatsApp\(formatWhatsApp\(String\(body\)\)\)/.test(region)) fail("F5 sendText must format THEN split the body before send()");
  else if (!/chunks\.length <= 1/.test(region)) fail("F5 sendText must single-send when one chunk, loop when many");
  else if (!/partial_send:/.test(region)) fail("F5 a mid-sequence chunk failure must return an honest partial_send error, never report chunk-1 as full success");
  else if (!/sasa\.partial_chunk_send/.test(region)) fail("F5 a partial send must emit an observable event for the soak watch");
  else if (!/\.slice\(0, 4096\)/.test(region)) fail("F5 each sent body must keep the 4096 hard floor as belt-and-suspenders");
  else ok("F5 send seam: sendText formats + splits, single-or-loop, partial-send is honest, 4096 floor");
}

// sanity: formatAndSplit is the composed transform
eq("F5 formatAndSplit composes", formatAndSplit("**hi**")[0], "*hi*");

if (process.exitCode) console.error("\nWALL RED.");
else console.log("\nWALL GREEN.");
