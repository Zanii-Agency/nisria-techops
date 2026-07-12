// Expense-summary renderer — the deterministic "who logged what, which day, total"
// contract for a project's spend (2026-07-12, operator directive after repeated
// itemized-wall failures). Same discipline as task-board.ts: the MODEL output was
// non-deterministic and kept dumping every purchased item as a wall; this renderer
// does the aggregation in CODE and returns a clean pre-rendered string the model
// echoes verbatim. Grouped BY DAY (the operator asked for "which day"), each day
// showing that day's total and who the money went to, then a grand total. Plain
// lines only — no pipes, no bullets, no per-item breakdown — so the WhatsApp send
// formatter leaves it untouched. Pure + no imports -> unit-testable under plain node.

// Title-case a messy payee ("MARY KAFUA" / "bilha wairimu" -> "Mary Kafua"),
// drop receipt/group junk that leaked into the payee field, and cap length so a
// payee that is really a whole description ("Mama Njambi for food supplies for
// the crew...") does not blow out the line.
function tidyName(s) {
  let t = String(s || "").trim();
  if (!t) return "";
  // Junk payees (the group name or a bare "receipt" the parser couldn't attribute).
  if (/^(yalla\s+)?receipt\b/i.test(t) || /finances\s*[💵$]|nisria\s*•/i.test(t)) return "";
  t = t.replace(/\s+/g, " ").split(" ").map((w) =>
    /^[A-Za-z]/.test(w) ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w
  ).join(" ");
  // Cap a description-shaped payee to its first few words.
  if (t.length > 22) t = t.slice(0, 22).replace(/\s+\S*$/, "") + "…";
  return t;
}

// KES/USD grouped, thousands-separated, no decimals for whole numbers.
function money(n, ccy) {
  const v = Math.round(Number(n) || 0);
  return `${ccy} ${v.toLocaleString("en-US")}`;
}

// Short weekday+date label from an ISO date ("2026-07-11" -> "Jul 11").
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dayLabel(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return "Undated";
  return `${MONTHS[Number(m[2]) - 1] || "?"} ${Number(m[3])}`;
}

// Smart category from a receipt's purpose/payee text (operator: "learn to
// categorise, if it's a lot of food items say food"). Deterministic keyword map,
// so it never itemizes and never guesses a random label.
const EXPENSE_CATEGORIES = [
  ["Food & provisions", /meat|bread|milk|flour|peas|water|food|soap|hand ?wash|grocery|supermarket|butcher|lunch|snack|drink|fruit|veg|sugar|rice|cook|kitchen|provision|stuff|brook|gilani|pmg|supplies|misc|maize|ugali|tea/i],
  ["Transport", /safari|car|fuel|petrol|diesel|taxi|matatu|transport|travel|hire|vehicle|boda|fare|mileage/i],
  ["Crew & talent", /salary|wage|stipend|allowance|crew|cast|actor|talent|labou?r/i],
  ["Equipment", /camera|light|sound|gear|equipment|rental|prop|costume|drone|lens|tripod|mic/i],
  ["Accommodation", /hotel|lodge|accommodation|room|airbnb|guest ?house/i],
  ["Services & fees", /service|permit|licen|print|design|\bfee\b|charge|internet|airtime|\bdata\b/i],
];
export function categorizeExpense(purpose, payee) {
  const t = `${purpose || ""} ${payee || ""}`;
  for (const [label, re] of EXPENSE_CATEGORIES) if (re.test(t)) return label;
  return "Other";
}

// Who posted the receipt into the group. The autobook path records "posted by
// <email>" in the purpose; older backfilled rows recorded no sender -> "".
export function expenseLoggedBy(purpose) {
  const m = String(purpose || "").match(/posted by ([^;)]+)/i);
  if (!m) return "";
  let n = m[1].trim().replace(/@gmail[,.]com/i, "").split("@")[0].replace(/[._]+/g, " ");
  n = n.replace(/\d+\s*$/, "").trim();
  return n ? n.replace(/\b\w/g, (c) => c.toUpperCase()) : "";
}

const escHtml = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Render the FULL expense table as self-contained HTML for the branded PDF:
 * columns Date | Amount | Description(category) | Logged By | Reference, a subtotal
 * row per day, a category rollup, and a grand total. This is the document the bot
 * ATTACHES; the chat body is the short bubble below (never this, never a raw URL).
 */
export function renderExpenseTableHTML({ projectLabel, rows }) {
  const list = Array.isArray(rows) ? rows : [];
  const primary = "KES";
  const days = new Map();
  for (const r of list) {
    if (String(r.currency || "KES").toUpperCase() !== primary) continue;
    const key = dayLabel(r.paid_at);
    const d = days.get(key) || { iso: String(r.paid_at || ""), rows: [] };
    if (String(r.paid_at || "") > d.iso) d.iso = String(r.paid_at || "");
    d.rows.push(r);
    days.set(key, d);
  }
  const ordered = [...days.entries()].sort((a, b) => (b[1].iso || "").localeCompare(a[1].iso || ""));
  const catTot = {};
  let grand = 0;
  const trs = [];
  for (const [label, info] of ordered) {
    let dayTot = 0;
    for (const r of info.rows) {
      const a = Math.round(Number(r.amount) || 0);
      dayTot += a; grand += a;
      const cat = categorizeExpense(r.purpose, r.payee);
      catTot[cat] = (catTot[cat] || 0) + a;
      const by = expenseLoggedBy(r.purpose) || "—";
      const ref = r.txn_ref ? escHtml(r.txn_ref) : "—";
      trs.push(`<tr><td class="d">${escHtml(label)}</td><td class="a">${a.toLocaleString("en-US")}</td><td>${escHtml(cat)}</td><td>${escHtml(by)}</td><td class="r">${ref}</td></tr>`);
    }
    trs.push(`<tr class="sub"><td class="d">${escHtml(label)} total</td><td class="a">${dayTot.toLocaleString("en-US")}</td><td colspan="3"></td></tr>`);
  }
  const chips = Object.entries(catTot).sort((a, b) => b[1] - a[1])
    .map(([c, t]) => `<div class="chip"><span>${escHtml(c)}</span><b>${t.toLocaleString("en-US")}</b></div>`).join("");
  const pending = list.filter((r) => r.needs_review === true).length;
  const period = ordered.length ? `${ordered[ordered.length - 1][0]} to ${ordered[0][0]}` : "";
  return `<style>
  .er h1{font-family:Georgia,serif;font-size:20px;margin:0 0 4px}
  .er .meta{color:#6b7178;font-size:12px;margin:0 0 14px}
  .er .chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 16px}
  .er .chip{border:1px solid #e5e2db;border-radius:6px;padding:6px 10px;min-width:110px}
  .er .chip span{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#6b7178}
  .er .chip b{font-family:Georgia,serif;font-size:15px}
  .er table{border-collapse:collapse;width:100%;font-size:12px}
  .er thead th{background:#2b3a67;color:#fff;text-align:left;font-size:10px;letter-spacing:.05em;text-transform:uppercase;padding:8px 10px}
  .er thead th.a{text-align:right}
  .er tbody td{padding:7px 10px;border-top:1px solid #e5e2db}
  .er td.a{text-align:right;white-space:nowrap}.er td.d{white-space:nowrap;color:#6b7178}
  .er td.r{font-family:monospace;font-size:10px;color:#6b7178}
  .er tr.sub td{background:#f0f3f8;font-weight:bold;color:#2b3a67}
  .er tfoot td{padding:10px;border-top:2px solid #2b3a67;font-family:Georgia,serif;font-size:15px;font-weight:bold}
  .er tfoot td.a{text-align:right}
  </style>
  <div class="er">
  <h1>${escHtml(projectLabel)} — Expense Report</h1>
  <p class="meta">Period ${escHtml(period)}, 2026 · Currency KES · ${list.length} entries${pending ? ` · ${pending} pending confirmation` : ""}</p>
  <div class="chips">${chips}</div>
  <table>
  <thead><tr><th>Date</th><th class="a">Amount (KES)</th><th>Description</th><th>Logged By</th><th>Reference</th></tr></thead>
  <tbody>${trs.join("")}</tbody>
  <tfoot><tr><td>Project total</td><td class="a">${grand.toLocaleString("en-US")}</td><td colspan="3">${list.length} entries</td></tr></tfoot>
  </table></div>`;
}

/**
 * The SHORT chat bubble that accompanies the attached PDF: total, period, a
 * category rollup, and the pending count. NO URL (a raw storage link is what
 * trips WhatsApp's "suspicious link" flag — the file is attached, not linked),
 * NO itemized rows. Plain lines so the send formatter leaves it clean.
 */
export function renderExpenseBubble({ projectLabel, rows }) {
  const list = (Array.isArray(rows) ? rows : []).filter((r) => String(r.currency || "KES").toUpperCase() === "KES");
  if (!list.length) return `No expenses logged for ${projectLabel} yet.`;
  const catTot = {};
  let grand = 0;
  let minIso = "", maxIso = "";
  for (const r of list) {
    const a = Math.round(Number(r.amount) || 0);
    grand += a;
    const c = categorizeExpense(r.purpose, r.payee);
    catTot[c] = (catTot[c] || 0) + a;
    const iso = String(r.paid_at || "");
    if (!minIso || iso < minIso) minIso = iso;
    if (!maxIso || iso > maxIso) maxIso = iso;
  }
  const pending = list.filter((r) => r.needs_review === true).length;
  const lines = [`${projectLabel} — expense report`];
  lines.push(`Total: KES ${grand.toLocaleString("en-US")} · ${list.length} entries${pending ? ` · ${pending} pending your confirm` : ""}`);
  if (minIso && maxIso) lines.push(`${dayLabel(minIso)} to ${dayLabel(maxIso)}`);
  lines.push("");
  for (const [c, t] of Object.entries(catTot).sort((a, b) => b[1] - a[1])) lines.push(`${c}: KES ${t.toLocaleString("en-US")}`);
  lines.push("");
  lines.push("Full day-by-day breakdown is in the attached PDF.");
  return lines.join("\n");
}

/**
 * Render a project's expense summary as a clean, echo-ready string.
 * @param {object} opts
 * @param {string} opts.projectLabel  human label, e.g. "Yalla Kenya Film"
 * @param {{payee?:string, amount?:number, currency?:string, paid_at?:string, needs_review?:boolean}[]} opts.rows
 * @param {number} [opts.maxNames]  max payee names listed per day before "+N more"
 * @returns {string}
 */
export function renderExpenseSummary({ projectLabel, rows, maxNames = 4 }) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return `No expenses logged for ${projectLabel} yet.`;

  // Currency law: never blend. If mixed, report the dominant currency's rows and
  // note the other separately rather than summing across.
  const byCcy = {};
  for (const r of list) {
    const c = String(r.currency || "KES").toUpperCase();
    (byCcy[c] = byCcy[c] || []).push(r);
  }
  const currencies = Object.keys(byCcy).sort((a, b) => byCcy[b].length - byCcy[a].length);
  const primary = currencies[0];
  const primaryRows = byCcy[primary];

  // Group the primary-currency rows by day.
  const days = new Map(); // dayLabel -> { total, names[], iso }
  for (const r of primaryRows) {
    const key = dayLabel(r.paid_at);
    const iso = String(r.paid_at || "");
    const d = days.get(key) || { total: 0, names: [], iso };
    d.total += Number(r.amount || 0);
    const name = tidyName(r.payee);
    if (name) d.names.push(name);
    if (iso > d.iso) d.iso = iso;
    days.set(key, d);
  }

  // Sort days newest-first by ISO.
  const ordered = [...days.entries()].sort((a, b) => (b[1].iso || "").localeCompare(a[1].iso || ""));

  const lines = [`${projectLabel} expenses`, ""];
  let grand = 0;
  let count = 0;
  for (const [label, d] of ordered) {
    grand += d.total;
    // dedupe names, keep first maxNames, tail as "+N more"
    const uniq = [...new Set(d.names)];
    let who = uniq.slice(0, maxNames).join(", ");
    if (uniq.length > maxNames) who += ` +${uniq.length - maxNames} more`;
    // Parens (not a dash) around the who-list: reads cleanly AND survives the
    // no-dashes humanize pass, which would otherwise turn " — " into a stray comma.
    lines.push(who ? `${label}: ${money(d.total, primary)} (${who})` : `${label}: ${money(d.total, primary)}`);
  }
  count = primaryRows.length;

  lines.push("");
  const pending = primaryRows.filter((r) => r.needs_review === true).length;
  const pendNote = pending > 0 ? ` (${pending} still pending your confirm)` : "";
  lines.push(`Total: ${money(grand, primary)} across ${count} ${count === 1 ? "entry" : "entries"}${pendNote}`);

  // If a second currency exists, note it plainly (never summed into the total).
  for (const c of currencies.slice(1)) {
    const other = byCcy[c];
    const otherTotal = other.reduce((s, r) => s + Number(r.amount || 0), 0);
    lines.push(`Plus ${money(otherTotal, c)} in ${c} (${other.length} ${other.length === 1 ? "entry" : "entries"}, kept separate).`);
  }

  return lines.join("\n");
}
