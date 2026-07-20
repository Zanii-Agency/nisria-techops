// Expense-summary renderer wall (2026-07-12, KT #206673). The operator asked,
// repeatedly, for "total expense and who logged it on which day" and kept getting
// itemized pipe/bullet walls instead. Fix = a deterministic renderer (same pattern
// as task-board.ts formatted_text) that aggregates in code so the model can only
// echo the correct shape. This wall pins that shape and its safety properties.
import { renderExpenseSummary, renderExpenseBubble, renderExpenseTableHTML, categorizeExpense, expenseLoggedBy } from "../../lib/format/expense-summary.mjs";
import { formatWhatsApp } from "../../lib/whatsapp-format.mjs";

let failed = 0;
const ok = (m) => console.log(`PASS: ${m}`);
const fail = (m) => { failed++; console.log(`FAIL: ${m}`); };

const rows = [
  { payee: "Dorcas Njambi", amount: 200, currency: "KES", paid_at: "2026-07-10", needs_review: true },
  { payee: "Dorcas Njambi", amount: 100, currency: "KES", paid_at: "2026-07-10", needs_review: true },
  { payee: "MARY KAFUA", amount: 3000, currency: "KES", paid_at: "2026-07-10", needs_review: true },
  { payee: "HENRY MITIRAH", amount: 150, currency: "KES", paid_at: "2026-07-09", needs_review: true },
  { payee: "Yalla receipt", amount: 360, currency: "KES", paid_at: "2026-07-09", needs_review: true },
];
const out = renderExpenseSummary({ projectLabel: "Yalla Kenya Film", rows });

// E1: grouped by day, each day present.
if (/Jul 10/.test(out) && /Jul 9/.test(out)) ok("E1 groups by day (which day)");
else fail("E1 missing per-day grouping");

// E2: shows who (payee names, title-cased).
if (/Dorcas Njambi/.test(out) && /Mary Kafua/.test(out)) ok("E2 shows who (title-cased payees)");
else fail("E2 missing/mis-cased payee names");

// E3: per-day total present and correct (Jul 10 = 200+100+3000 = 3,300).
if (/Jul 10: KES 3,300/.test(out)) ok("E3 per-day total is correct (3,300 on Jul 10)");
else fail(`E3 per-day total wrong: ${JSON.stringify(out)}`);

// E4: grand total present and correct (3810).
if (/Total: KES 3,810/.test(out)) ok("E4 grand total correct (3,810)");
else fail(`E4 grand total wrong: ${JSON.stringify(out)}`);

// E5: NO itemized purchases, NO pipes, NO bullets — never a wall.
if (/\|/.test(out)) fail("E5 output has raw pipes");
else if (/^\s*•/m.test(out)) fail("E5 output has bullets");
else ok("E5 no pipes, no bullets, no itemized purchases");

// E6: receipt-junk payee ("Yalla receipt") is dropped, not shown as a name.
if (/Yalla Receipt/i.test(out)) fail("E6 receipt-junk payee leaked as a name");
else ok("E6 receipt-junk payee dropped (shows 'unnamed' for that entry)");

// E7: pending-confirm count surfaced honestly.
if (/pending your confirm/.test(out)) ok("E7 surfaces the still-pending-confirm count");
else fail("E7 missing pending-confirm note");

// E8: the WhatsApp send formatter leaves it byte-identical (no collapse/mangle).
if (formatWhatsApp(out) === out) ok("E8 whatsapp formatter passes it through untouched (no collapse)");
else fail(`E8 formatter changed the summary:\n${formatWhatsApp(out)}`);

// E9: empty project -> honest, not a crash or a fake zero.
const empty = renderExpenseSummary({ projectLabel: "Nova", rows: [] });
if (/No expenses logged for Nova/.test(empty)) ok("E9 empty project says so plainly");
else fail("E9 empty project not handled honestly");

// E10: categorizer buckets food-ish and transport-ish, defaults to Other.
if (categorizeExpense("meat and bread for the crew", "Brook Supermarket") === "Food & provisions"
  && categorizeExpense("safari car hire", "") === "Transport"
  && categorizeExpense("UG7EJA9HF7 Confirmed", "Mary Kafua") === "Other")
  ok("E10 categorizer: food->Food, safari->Transport, bare code->Other");
else fail("E10 categorizer mis-buckets");

// E11: logged-by pulls the group sender from 'posted by', blank when absent.
if (/dorcas/i.test(expenseLoggedBy("meat. Auto-logged (posted by dorcasnjambi74@gmail,com); needs confirm"))
  && expenseLoggedBy("bread, backfilled from Finances group") === "")
  ok("E11 logged-by extracts the group sender, blank on backfilled rows");
else fail("E11 logged-by extraction wrong");

// E12: the chat bubble carries total + category rollup + NO url + NO itemization.
const bubble = renderExpenseBubble({ projectLabel: "Yalla Kenya Film", rows });
if (/https?:\/\//.test(bubble)) fail("E12 bubble contains a URL (would trip WhatsApp suspicious-link)");
else if (/\|/.test(bubble) || /wheat flour|milk|bread/i.test(bubble)) fail("E12 bubble itemizes purchases");
else if (!/Total: KES/.test(bubble) || !/attached PDF/i.test(bubble)) fail("E12 bubble missing total or PDF pointer");
else ok("E12 chat bubble: total + rollup + points to PDF, no URL, no itemization");

// E13: the PDF HTML table has the 5 columns, per-day subtotals, grand total, no pipes.
const html = renderExpenseTableHTML({ projectLabel: "Yalla Kenya Film", rows });
if (!/Date/.test(html) || !/Amount/.test(html) || !/Description/.test(html) || !/Logged By/.test(html) || !/Reference/.test(html)) fail("E13 PDF table missing one of the 5 columns");
else if (!/Project total/.test(html)) fail("E13 PDF table missing grand total");
else if (/[^<]\|[^<]/.test(html.replace(/<[^>]+>/g, ""))) fail("E13 PDF table text has raw pipes");
else ok("E13 PDF table: 5 columns, grand total, real HTML (no pipe walls)");

console.log(failed ? "WALL RED." : "expense-summary-wall: ALL GREEN");
process.exit(failed ? 1 : 0);
