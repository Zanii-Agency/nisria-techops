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
