// WALL: a statement of money is rendered from the rows, never written by a model.
//
// 2026-07-20, live. Nur asked for the Yalla expense report. The model composed one BY
// HAND and put it through create_letterhead_doc. What reached her: a raw markdown table
// printed as "| Category | Amount (KES) |", 56% of spend under "Other", AED 17,816 left
// out of a figure headed "Total Expenses", a pending count of 50 when the ledger said 67,
// an invented paragraph about how Nur pays the crew, and the signature "Prepared by Sasa".
// Every one of those is impossible through project_expense_report. The tool was simply
// not the one used, and nothing stopped it.
import { readFileSync } from "fs";
import { docBodyToHtml } from "../../lib/doc-format.mjs";
import { renderStatementHTML, resolveCategory } from "../../lib/format/yalla-statement.mjs";

let failed = 0;
const ok = (n) => console.log(`PASS: ${n}`);
const bad = (n, d) => { console.log(`FAIL: ${n}${d ? " — " + d : ""}`); failed++; };
const check = (n, c, d) => (c ? ok(n) : bad(n, d));

const smart = readFileSync(new URL("../../lib/smart-tools.ts", import.meta.url), "utf8");
const region = (marker, span = 3000) => {
  const i = smart.indexOf(marker);
  return i < 0 ? "" : smart.slice(i, i + span);
};

// E1 the letterhead tool must refuse to hand-author a financial document
const lh = region('name === "create_letterhead_doc"');
check("E1 create_letterhead_doc refuses financial documents",
  /looksFinancial/.test(lh) && /financial document must be rendered, not authored/.test(lh));

// E2 it must name the tool that does it properly, or the model just rephrases and retries
check("E2 the refusal points at project_expense_report", /project_expense_report/.test(lh));

// E3 the report PDF is the deterministic statement, not the old summary table
const per = region('name === "project_expense_report"', 5000);
check("E3 report renders via renderStatementHTML", /renderStatementHTML/.test(per));
check("E4 report no longer uses the currency-dropping summary renderer",
  !/renderExpenseTableHTML\(/.test(per),
  "renderExpenseTableHTML skips every row whose currency is not the primary one");

// E5 categories are deterministic, not a model call
check("E5 categories come from resolveCategory", /resolveCategory\(r, categorizeExpense\)/.test(per));
check("E6 no model categorisation pass remains in the report path",
  !/claudeJSON[\s\S]{0,200}Categorize/.test(per));

// E7 markdown tables must never reach a PDF as raw pipes
const t = docBodyToHtml("| Category | Amount |\n|---|---|\n| Other | 892,814 |");
check("E7 markdown tables render as HTML", /<table>/.test(t) && !/\|/.test(t), t.slice(0, 60));

// E8 currency law: with two currencies and no disclosed rate, never print one number
// labelled as the total. This is the exact defect that made the live report wrong.
const rows = [
  { paid_at: "2026-07-01", amount: 100, currency: "KES", payee: "A", _cat: "Other" },
  { paid_at: "2026-07-01", amount: 50, currency: "AED", payee: "B", _cat: "Other" },
];
const noFx = renderStatementHTML({ projectLabel: "P", rows });
check("E8 no single 'total' is claimed without a conversion rate",
  !/Total \(converted\)/i.test(noFx) && /per currency/i.test(noFx));
check("E9 both currencies appear natively", /KES 100/.test(noFx) && /AED 50/.test(noFx));
check("E10 a converted total appears only when a rate is disclosed",
  /converted at 35/.test(renderStatementHTML({
    projectLabel: "P", rows,
    fx: { rate: 35, base: "AED", quote: "KES", asOf: "x", src: "y" },
  })));

// E11 the owner's own category still wins over anything computed
check("E11 owner category is never overridden",
  resolveCategory({ category: "Location fees", payee: "X" }, () => "Other") === "Location fees");

if (failed) { console.log(`\nexpense-report-integrity: ${failed} check(s) failed.`); process.exit(1); }
console.log("\nexpense-report-integrity: all checks passed.");
