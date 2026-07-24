// Project expense STATEMENT renderer — the branded, day-by-day document.
//
// Companion to expense-summary.mjs (which renders the short WhatsApp bubble and the
// plain PDF table). This one renders the full statement Nur signs off and sends to
// festivals: masthead, KPIs, category + logger split, then a DAILY LEDGER where every
// payment shows its amount, payee, category, logger, description and whether a receipt
// is on file.
//
// Two things this module deliberately does NOT do:
//  1. It never writes category or description back to the database. Those are computed
//     on read from the row the owner already has. Nur's account is master: if she has
//     set a category on a row, hers wins over anything computed here (KT #122 — owner
//     data is forever the owner's; the bot does not get to overwrite her opinion).
//  2. It never blends currencies. KES and AED are summed separately and a converted
//     total only appears when the caller passes an explicit fx rate to disclose.
//
// DESIGN IS A PARAMETER, not a constant. Nur can ask for a different look and it is a
// value change, not a code change. Add a variant to DESIGNS and it is instantly
// selectable from her Claude.
//
// Pure + no imports -> unit-testable under plain node.

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const DESIGNS = {
  // The statement Nur approved on 14 July: white paper, Nisria teal, serif masthead.
  ledger: {
    label: "Daily ledger (approved 14 Jul)",
    paper: "#FFFFFF", panel: "#FBFBFA", ink: "#16201F", muted: "#5A6664", faint: "#93A09D",
    line: "#E6E9E8", lineSoft: "#F0F2F1", accent: "#009C99", accentSoft: "#E3F5F4",
    amber: "#B4791F", amberSoft: "#F7EEDC", crew: "#9A6A22", vendor: "#0A7C7A",
    fixedTheme: true,
  },
  // The reconciliation statement built 20 July: deeper teal, theme-aware.
  statement: {
    label: "Reconciliation statement (20 Jul)",
    paper: "#FBFAF7", panel: "#F2F0EA", ink: "#0E2E2B", muted: "#48605D", faint: "#7C918E",
    line: "#DCE2E0", lineSoft: "#E6E9E6", accent: "#0B4F4A", accentSoft: "#E3F0EE",
    amber: "#9A6516", amberSoft: "#F4EADA", crew: "#9A6516", vendor: "#0B4F4A",
    fixedTheme: false,
  },
};

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function money(n, ccy) {
  const v = Number(n) || 0;
  const dp = ccy === "AED" ? 2 : 0;
  return `${ccy} ${v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: 2 })}`;
}

export function longDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return "Undated";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${DAYS[d.getUTCDay()]} ${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`;
}

// A payment with no stated purpose still deserves a description. Falling back to the
// payee ("Payment to Moses Gatu") beats a blank cell, which reads as missing data when
// it is really an un-narrated transfer. 18 rows on Yalla are in exactly this state.
export function describe(row, expenseDescription) {
  const raw = String(row.purpose || "").trim();
  if (raw && expenseDescription) {
    const d = expenseDescription(raw, row.payee);
    if (d && d.trim()) return d.trim();
  }
  if (raw) return raw.split(/\.\s|;|\bAuto-logged/i)[0].trim().slice(0, 90);
  const payee = String(row.payee || "").trim();
  if (payee) return `Payment to ${payee}`;
  return "Payment, no description recorded";
}

/**
 * Filter rows. Every filter is optional; omitted means "no constraint".
 * This is what makes the tool queryable day by day, by category, or by payee.
 */
export function filterRows(rows, q = {}) {
  const from = q.from || null, to = q.to || null;
  const day = q.day || null;
  const cat = q.category ? String(q.category).toLowerCase() : null;
  const payee = q.payee ? String(q.payee).toLowerCase() : null;
  const logger = q.logger ? String(q.logger).toLowerCase() : null;
  const min = q.min_amount != null ? Number(q.min_amount) : null;
  const max = q.max_amount != null ? Number(q.max_amount) : null;
  return (rows || []).filter((r) => {
    const d = String(r.paid_at || "").slice(0, 10);
    if (day && d !== day) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (cat && !String(r._cat || "").toLowerCase().includes(cat)) return false;
    if (payee && !String(r.payee || "").toLowerCase().includes(payee)) return false;
    if (logger && !String(r._by || "").toLowerCase().includes(logger)) return false;
    // The evidence gap Nur has to close before a festival submission: which payments
    // have no receipt stored against them.
    if (q.no_receipt && (r.source_ref || r.screenshot_path)) return false;
    if (q.needs_review && !r.needs_review) return false;
    const amt = Number(r.amount) || 0;
    if (min != null && amt < min) return false;
    if (max != null && amt > max) return false;
    return true;
  });
}

// Category labels that are INGEST ARTEFACTS, not the owner's judgement. The app enum
// ("kenya", "vendor", "other") is set by the autobook path, and "Payment" was a machine
// label from an earlier reconciliation pass. These are re-derived. Anything else in the
// column is treated as the owner's own choice and is never overridden (KT #122).
const MACHINE_LABELS = new Set([
  "", "kenya", "vendor", "other", "payment", "subscription", "salary", "misc",
]);

const COMPANY = /\b(ltd|limited|plc|inc\b|co\b|company|sacco|bank|enterprises?|supermarket|spmkt|stores?|shops?|station|paybill|services?|agenc|holdings|group|centre|center|clinic|pharmacy|college|school|mall|hardware)\b/i;
// A bare transfer body: no item is named, only the mechanism.
const NO_ITEM = /send money|payment to|transfer|m-?pesa|no (stated )?purpose|purpose (not |un)specified|no context|unclear|without clear/i;
// Paid at a till or paybill, so the counterparty is a MERCHANT even when the name reads
// like a person ("DANIEL KIARIE, Till 9083579"). Without this a shop purchase lands in
// crew, which is both wrong and flattering to the crew line.
const MERCHANT = /buy goods|till\b|pay ?bill|merchant/i;

// Film-production vocabulary the generic keyword map does not carry. Runs before the
// person heuristic, otherwise "Kikopey Beach Camp" reads as a three-word human name and
// a KES 165,000 accommodation payment is filed as crew.
const PROJECT_TERMS = [
  ["Accommodation", /\bcamp\b|campsite|lodge|resort|homestay|banda|cottage|guest ?house|hotel/i],
  ["Transport", /flight|air ?ticket|\bticket\b|airline|emirates|wego|shuttle|safari car|fuel|petrol|station|boat|matatu|car ?hire/i],
  ["Permits & location", /sanctuary|game ?(reserve|park)|conservancy|county|permit|licen[cs]e|visa|film ?board|location fee/i],
];

// Labels that mean the same bucket. Earlier passes wrote "Catering" and "Crew & talent";
// the current taxonomy calls those "Food & provisions" and "Crew & payments". Folding
// them at DISPLAY keeps one coherent set of categories on the statement without
// discarding whatever label is stored on the row.
const SYNONYMS = {
  "catering": "Food & provisions",
  "food": "Food & provisions",
  "crew & talent": "Crew & payments",
  "crew/talent": "Crew & payments",
  "crew": "Crew & payments",
  "permits": "Permits & location",
  "permits/fees": "Permits & location",
  "transport/vehicle": "Transport",
  "supplies": "Food & provisions",
  "vendor payment": "Services & fees",
  "utilities": "Services & fees",
};
function synonym(label) {
  return SYNONYMS[String(label || "").trim().toLowerCase()] || label;
}

/**
 * Resolve a display category.
 *
 * The keyword map runs first. When it cannot place a row, apply the rule prod's own
 * categorizer prompt already states but the deterministic map never implemented: a bare
 * payment to a named person, with no item named, is crew and talent. On Yalla that is
 * 98 of 149 rows, which is the difference between a statement that says something and
 * one that says "Other" a hundred times.
 */
export function resolveCategory(row, categorizeExpense) {
  const own = String(row.category || "").trim();
  if (own && !MACHINE_LABELS.has(own.toLowerCase())) return synonym(own);  // owner's call wins

  const payee = String(row.payee || "").trim();
  const blob = `${row.purpose || ""} ${payee}`;

  // The film-specific map runs FIRST and on the whole row. The shared keyword map is
  // written for general NGO spend and mis-fires on production vocabulary: it files
  // "AED 2,289 flight ticket for Bashir" as Equipment. Where the two disagree, the
  // production terms are the higher-confidence signal. Running on the whole row also
  // means a receipt with a good description and no payee still gets placed.
  for (const [label, re] of PROJECT_TERMS) if (re.test(blob)) return synonym(label);

  const mapped = categorizeExpense ? categorizeExpense(row.purpose, row.payee) : "Other";
  if (mapped && mapped !== "Other") return synonym(mapped);

  if (!payee) return "Other";
  if (COMPANY.test(payee)) return "Services & fees";
  // A till or paybill counterparty is a shop, whatever the name looks like. What was
  // bought is genuinely unknown, and "Other" with a truthful description beats an
  // invented category.
  if (MERCHANT.test(blob)) return "Other";

  const words = payee.split(/\s+/).filter(Boolean);
  const personLike = words.length >= 2 && words.length <= 4 &&
    /^[A-Za-z][A-Za-z'’.\- ]+$/.test(payee);
  // Prod's own categorizer states the rule; the label matches it. "Crew & payments",
  // not "Crew & talent", because a bare transfer does not prove the payee is crew.
  if (personLike && NO_ITEM.test(blob)) return "Crew & payments";
  return "Other";
}

function tagClass(cat) {
  const c = String(cat || "").toLowerCase();
  if (/crew|talent|payment/.test(c)) return "tag tag-crew";
  if (/vendor|service/.test(c)) return "tag tag-vendor";
  return "tag";
}

/**
 * Render the day-by-day answer for CHAT (WhatsApp or the Claude connector).
 *
 * Plain lines only, blank line between days, no pipes and no bullet glyphs. The
 * WhatsApp send formatter flattens richer markup, which is how a digest once arrived
 * as an unreadable wall. Aggregation happens here in code so the model echoes a
 * finished string rather than improvising a table.
 */
export function renderStatementText({ projectLabel = "Project", rows = [], filters = {},
  fx = null, maxDays = 40, expenseDescription = null } = {}) {
  const list = [...rows].sort((a, b) => String(a.paid_at || "").localeCompare(String(b.paid_at || "")));
  if (!list.length) {
    const w = [filters.day && `on ${filters.day}`, filters.category && `in ${filters.category}`,
      filters.payee && `to ${filters.payee}`].filter(Boolean).join(" ");
    return `No ${projectLabel} payments recorded ${w || "in that range"}.`;
  }
  const totals = {};
  for (const r of list) {
    const c = String(r.currency || "KES").toUpperCase();
    totals[c] = (totals[c] || 0) + (Number(r.amount) || 0);
  }
  const days = new Map();
  for (const r of list) {
    const k = String(r.paid_at || "").slice(0, 10);
    if (!days.has(k)) days.set(k, []);
    days.get(k).push(r);
  }
  const keys = [...days.keys()].sort();
  const head = [`${projectLabel}`, Object.entries(totals).map(([c, v]) => money(v, c)).join(" + ") +
    ` across ${list.length} payment${list.length === 1 ? "" : "s"}, ${keys.length} day${keys.length === 1 ? "" : "s"}`];
  const filt = [filters.day && `Day: ${filters.day}`, filters.from && `From: ${filters.from}`,
    filters.to && `To: ${filters.to}`, filters.category && `Category: ${filters.category}`,
    filters.payee && `Payee: ${filters.payee}`].filter(Boolean);
  if (filt.length) head.push(filt.join(", "));

  const shown = keys.slice(-maxDays);
  const blocks = shown.map((k) => {
    const rs = days.get(k).sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0));
    const t = {};
    for (const r of rs) {
      const c = String(r.currency || "KES").toUpperCase();
      t[c] = (t[c] || 0) + (Number(r.amount) || 0);
    }
    const lines = rs.map((r) => {
      const cur = String(r.currency || "KES").toUpperCase();
      const who = r.payee ? ` to ${r.payee}` : "";
      const cat = r._cat ? ` (${r._cat})` : "";
      const ref = r.txn_ref ? `, Ref ${r.txn_ref}` : "";
      return `  ${money(r.amount, cur)}${who}${cat}, ${describe(r, expenseDescription)}${ref}`;
    });
    return `${longDate(k)}, ${Object.entries(t).map(([c, v]) => money(v, c)).join(" + ")}\n${lines.join("\n")}`;
  });
  const tail = keys.length > shown.length
    ? `\n(showing the last ${shown.length} of ${keys.length} days, ask for a narrower range to see the rest)` : "";
  const fxLine = fx && Object.keys(totals).length > 1
    ? `\n\n${fx.base} converted at 1 ${fx.base} = ${fx.rate} ${fx.quote} (${fx.src}, ${fx.asOf}) only where a combined figure is shown. Each line above is the currency actually paid.` : "";
  return `${head.join("\n")}\n\n${blocks.join("\n\n")}${tail}${fxLine}`;
}

/**
 * Render the statement.
 *
 * rows      payments, each already carrying _cat (category) and _by (logger)
 * opts      { projectLabel, design, fx: {rate, base, quote, asOf, src}, notes: [], filters }
 */
export function renderStatementHTML({ projectLabel = "Project", rows = [], design = "ledger",
  fx = null, notes = [], filters = {}, logoUri = null, expenseDescription = null } = {}) {
  const D = DESIGNS[design] || DESIGNS.ledger;
  const list = [...rows].sort((a, b) =>
    String(a.paid_at || "").localeCompare(String(b.paid_at || "")));

  // --- aggregates, per currency, never blended -------------------------------------
  const totals = {}, byCat = {}, byLogger = {}, days = new Map();
  let withProof = 0;
  for (const r of list) {
    const c = String(r.currency || "KES").toUpperCase();
    const a = Number(r.amount) || 0;
    totals[c] = (totals[c] || 0) + a;
    const cat = r._cat || "Other";
    (byCat[cat] ||= {})[c] = (byCat[cat][c] || 0) + a;
    const lg = r._by || "unattributed";
    (byLogger[lg] ||= { n: 0 })[c] = (byLogger[lg][c] || 0) + a;
    byLogger[lg].n++;
    if (r.source_ref || r.screenshot_path) withProof++;
    const key = String(r.paid_at || "").slice(0, 10);
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(r);
  }
  const currencies = Object.keys(totals).sort();
  const primary = currencies.includes("KES") ? "KES" : currencies[0] || "KES";
  const inPrimary = (r) => {
    const c = String(r.currency || "KES").toUpperCase();
    const a = Number(r.amount) || 0;
    if (c === primary) return a;
    return fx && fx.rate && c === fx.base ? a * fx.rate : 0;
  };
  const grand = list.reduce((s, r) => s + inPrimary(r), 0);

  const catRows = Object.entries(byCat)
    .map(([name, t]) => [name, Object.entries(t).reduce((s, [c, v]) =>
      s + (c === primary ? v : (fx && fx.rate && c === fx.base ? v * fx.rate : 0)), 0), t])
    .sort((a, b) => b[1] - a[1]);
  const catMax = catRows.length ? catRows[0][1] : 1;

  const dayKeys = [...days.keys()].sort();
  let running = 0;
  const dayBlocks = dayKeys.map((k) => {
    const rs = days.get(k);
    const dayTot = rs.reduce((s, r) => s + inPrimary(r), 0);
    running += dayTot;
    const proof = rs.filter((r) => r.source_ref || r.screenshot_path).length;
    const lines = rs
      .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))
      .map((r) => {
        const on = !!(r.source_ref || r.screenshot_path);
        const cur = String(r.currency || "KES").toUpperCase();
        return `<tr>
    <td class="ev-c"><span class="ev ${on ? "on" : "off"}" title="${on ? "Receipt on file" : "Recorded from the message only"}">${on ? "●" : "○"}</span></td>
    <td class="num amt">${esc(money(r.amount, cur))}</td>
    <td class="payee">${esc(r.payee || "not recorded")}</td>
    <td><span class="${tagClass(r._cat)}">${esc(r._cat || "Other")}</span></td>
    <td class="logger">${esc(r._by || "")}</td>
    <td class="purpose">${esc(describe(r, expenseDescription))}</td>
  </tr>`;
      }).join("\n");
    return `<section class="day">
  <header class="day-h">
    <div><h3>${esc(longDate(k))}</h3><span class="day-meta">${rs.length} payment${rs.length === 1 ? "" : "s"} · ${proof}/${rs.length} with receipt</span></div>
    <div class="day-tot"><span class="dt-amt">${esc(money(Math.round(dayTot), primary))}</span><span class="dt-cum">running · ${esc(money(Math.round(running), primary))}</span></div>
  </header>
  <table class="ledger"><tbody>
${lines}
  </tbody></table>
</section>`;
  }).join("\n");

  const themeBlock = D.fixedTheme
    ? `:root,:root[data-theme="dark"],:root[data-theme="light"]{`
    : `:root{`;

  const filterLine = [
    filters.day ? `day ${filters.day}` : null,
    filters.from || filters.to ? `${filters.from || "start"} to ${filters.to || "end"}` : null,
    filters.category ? `category “${filters.category}”` : null,
    filters.payee ? `payee “${filters.payee}”` : null,
  ].filter(Boolean).join(" · ");

  const period = dayKeys.length ? `${longDate(dayKeys[0])} – ${longDate(dayKeys[dayKeys.length - 1])}` : "no payments in range";

  return `<style>
${themeBlock}
 --paper:${D.paper}; --panel:${D.panel}; --ink:${D.ink}; --muted:${D.muted}; --faint:${D.faint};
 --line:${D.line}; --line-soft:${D.lineSoft}; --accent:${D.accent}; --accent-soft:${D.accentSoft};
 --amber:${D.amber}; --amber-soft:${D.amberSoft}; --crew:${D.crew}; --vendor:${D.vendor};
}
*{box-sizing:border-box}
body{margin:0;background:var(--paper)}
.doc{max-width:880px;margin:0 auto;padding:48px 40px 72px;background:var(--paper);color:var(--ink);
 font-family:ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.5;
 -webkit-font-smoothing:antialiased}
.serif{font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif}
.num{font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
.eyebrow{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);font-weight:600}
.mast{border-bottom:2px solid var(--ink);padding-bottom:22px;margin-bottom:8px}
.logo{height:38px;width:auto;display:block;margin-bottom:18px}
.mast h1{font-size:34px;line-height:1.05;margin:.28em 0 .1em;font-weight:600;text-wrap:balance}
.mast .period{color:var(--muted);font-size:13px}
.mast .filt{color:var(--accent);font-size:12px;margin-top:6px;font-weight:600}
.mast .grand{margin-top:20px;display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap}
.grand .g-amt{font-size:30px;font-weight:600;font-variant-numeric:tabular-nums}
.grand .g-lbl{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border:1px solid var(--line);margin:26px 0 34px}
.kpi{background:var(--panel);padding:16px 18px}
.kpi .k-v{font-size:20px;font-weight:600;font-variant-numeric:tabular-nums}
.kpi .k-l{font-size:11px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-top:3px}
.split{display:grid;grid-template-columns:1.7fr 1fr;gap:34px;margin-bottom:40px}
h2.sec{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-weight:600;
 border-bottom:1px solid var(--line);padding-bottom:7px;margin:0 0 12px}
table{width:100%;border-collapse:collapse}
.cat td{padding:7px 0;border-bottom:1px solid var(--line-soft);font-size:13px}
.cat .c-name{width:36%}.cat .c-bar span{display:block;height:7px;background:var(--accent);border-radius:2px;opacity:.85}
.cat .num{width:26%}.cat .pct{width:12%;color:var(--muted);font-size:12px}
.lg td{padding:7px 0;border-bottom:1px solid var(--line-soft);font-size:13px}
.day{margin-bottom:26px;break-inside:avoid}
.day-h{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;
 border-bottom:1.5px solid var(--ink);padding-bottom:6px;margin-bottom:2px}
.day-h h3{margin:0;font-size:16px;font-weight:600}
.day-meta{font-size:11.5px;color:var(--faint)}
.day-tot{text-align:right}
.dt-amt{display:block;font-weight:600;font-variant-numeric:tabular-nums;font-size:15px}
.dt-cum{display:block;font-size:10.5px;color:var(--faint);letter-spacing:.03em}
.ledger td{padding:6px 8px;border-bottom:1px solid var(--line-soft);vertical-align:top;font-size:12.5px}
.ledger tr:last-child td{border-bottom:none}
.ev-c{width:20px;text-align:center;padding-left:0}
.ev.on{color:var(--accent)}.ev.off{color:var(--faint)}
.amt{width:104px;font-weight:600}
.payee{width:170px;font-weight:500}
.logger{width:96px;color:var(--muted);font-size:12px}
.purpose{color:var(--muted);font-size:12px}
.tag{display:inline-block;font-size:10.5px;padding:1px 7px;border-radius:3px;background:var(--accent-soft);color:var(--accent);white-space:nowrap}
.tag-crew{background:var(--amber-soft);color:var(--crew)}
.tag-vendor{background:var(--accent-soft);color:var(--vendor)}
.notes{margin-top:40px;border-top:2px solid var(--ink);padding-top:20px;font-size:12.5px;color:var(--muted)}
.notes ul{margin:0;padding-left:18px}.notes li{margin:5px 0}
.legend{display:flex;gap:22px;margin:10px 0 16px;flex-wrap:wrap;font-size:12px}
.legend span{display:inline-flex;align-items:center;gap:6px}
.foot{margin-top:26px;font-size:11px;color:var(--faint)}
@media (max-width:680px){.doc{padding:28px 18px}.kpis{grid-template-columns:repeat(2,1fr)}
 .split{grid-template-columns:1fr;gap:24px}.mast h1{font-size:27px}.payee{width:auto}.logger{display:none}}
@media print{body{background:#fff}.doc{padding:0;max-width:100%}.day{break-inside:avoid}}
</style>
<div class="doc">
 <div class="mast">
   ${logoUri ? `<img class="logo" src="${logoUri}" alt="Nisria" />` : ""}
   <div class="eyebrow">${esc(projectLabel)}</div>
   <h1 class="serif">Expense Statement</h1>
   <div class="period">Period: ${esc(period)}</div>
   ${filterLine ? `<div class="filt">Filtered: ${esc(filterLine)}</div>` : ""}
   <div class="grand">
     <span class="g-amt">${esc(currencies.map((c) => money(totals[c], c)).join("  +  "))}</span>
     <span class="g-lbl">${list.length} payment${list.length === 1 ? "" : "s"}${currencies.length > 1 && fx ? ` · combined ${money(Math.round(grand), primary)}` : ""}</span>
   </div>
 </div>

 <div class="kpis">
   <div class="kpi"><div class="k-v">${esc(
       currencies.length === 1 ? money(Math.round(grand), primary)
       : fx ? money(Math.round(grand), primary)
       : currencies.map((c) => money(totals[c], c)).join("  +  ")
     )}</div><div class="k-l">${
       currencies.length === 1 ? "Total"
       : fx ? `Total, converted at ${fx.rate}`
       : "Total, per currency"
     }</div></div>
   <div class="kpi"><div class="k-v">${list.length}</div><div class="k-l">Payments</div></div>
   <div class="kpi"><div class="k-v">${dayKeys.length}</div><div class="k-l">Active days</div></div>
   <div class="kpi"><div class="k-v">${withProof}/${list.length}</div><div class="k-l">With receipt on file</div></div>
 </div>

 <div class="split">
   <div>
     <h2 class="sec">Expenditure by category</h2>
     <table class="cat"><tbody>
${catRows.map(([name, v, t]) => `      <tr><td class="c-name">${esc(name)}</td><td class="c-bar"><span style="width:${(v / catMax * 100).toFixed(1)}%"></span></td><td class="num">${esc(Object.entries(t).map(([c, a]) => money(a, c)).join(" + "))}</td><td class="num pct">${grand ? (v / grand * 100).toFixed(0) : 0}%</td></tr>`).join("\n")}
     </tbody></table>
   </div>
   <div>
     <h2 class="sec">Recorded by</h2>
     <table class="lg"><tbody>
${Object.entries(byLogger).sort((a, b) => b[1].n - a[1].n).map(([n, v]) => `      <tr><td>${esc(n)}</td><td class="num">${v.n}</td></tr>`).join("\n")}
     </tbody></table>
   </div>
 </div>

 <h2 class="sec">Daily ledger</h2>
 <div class="legend">
   <span><span class="ev on">●</span> receipt on file</span>
   <span><span class="ev off">○</span> recorded from the message only</span>
 </div>
${dayBlocks}

 <div class="notes">
   <h2 class="sec">Notes</h2>
   <ul>
${notes.map((n) => `     <li>${esc(n)}</li>`).join("\n")}
${fx ? `     <li>${esc(`${fx.base} converted at 1 ${fx.base} = ${fx.rate} ${fx.quote} (${fx.src}, ${fx.asOf}). Every line above is shown in the currency actually paid.`)}</li>` : ""}
   </ul>
   <div class="foot">Nisria · ${esc(projectLabel)} · prepared from the production finance record. Supporting receipts retained and available on request.</div>
 </div>
</div>`;
}

// ---- self-check -------------------------------------------------------------------
// Run: node lib/format/yalla-statement.mjs
if (process.argv[1] && process.argv[1].endsWith("yalla-statement.mjs")) {
  const rows = [
    { paid_at: "2026-07-14", amount: 165000, currency: "KES", payee: "KIKOPEY BEACH", _cat: "Accommodation", _by: "Nur", purpose: "camp for crew", source_ref: "x" },
    { paid_at: "2026-07-14", amount: 2859.75, currency: "AED", payee: "Wego", _cat: "Transport", _by: "Nur", purpose: null },
    { paid_at: "2026-07-15", amount: 500, currency: "KES", payee: "MOSES GATU", _cat: "Crew & talent", _by: "Dorcas", purpose: null },
  ];
  const fx = { rate: 35.2076, base: "AED", quote: "KES", asOf: "14 July 2026", src: "xe" };
  const html = renderStatementHTML({ projectLabel: "Yalla Kenya Film", rows, fx, design: "ledger" });

  // Currency law: the headline shows each currency on its own, never one summed number.
  // 165000 KES + 500 KES = KES 165,500 and AED 2,859.75 must appear as separate figures;
  // a naive sum would print KES 167,859.75 or AED 168,359.75.
  if (!html.includes("KES 165,500")) throw new Error("native KES total missing");
  if (!html.includes("AED 2,859.75")) throw new Error("native AED total missing");
  if (/KES 167,859|AED 168,359/.test(html)) throw new Error("currencies were blended");
  // the converted combined figure IS allowed, but only alongside, and only with an fx rate
  if (!html.includes("combined KES 266,185")) throw new Error("converted total wrong or missing");
  // a null-purpose row still gets a description, never a blank cell
  if (!html.includes("Payment to MOSES GATU")) throw new Error("null purpose produced a blank description");
  // both days rendered, with a running total
  if (!html.includes("running")) throw new Error("running total missing");
  if ((html.match(/class="day"/g) || []).length !== 2) throw new Error("expected 2 day blocks");
  // filters actually filter
  const oneDay = filterRows(rows, { day: "2026-07-15" });
  if (oneDay.length !== 1 || oneDay[0].payee !== "MOSES GATU") throw new Error("day filter broken");
  const byCat = filterRows(rows, { category: "transport" });
  if (byCat.length !== 1 || byCat[0].currency !== "AED") throw new Error("category filter broken");
  const byPayee = filterRows(rows, { payee: "kikopey" });
  if (byPayee.length !== 1) throw new Error("payee filter broken");
  if (filterRows(rows, { logger: "dorcas" }).length !== 1) throw new Error("logger filter broken");
  if (filterRows(rows, { no_receipt: true }).length !== 2) throw new Error("no_receipt filter broken");
  if (filterRows(rows, { min_amount: 1000 }).length !== 2) throw new Error("min_amount filter broken");
  if (filterRows(rows, { max_amount: 600 }).length !== 1) throw new Error("max_amount filter broken");
  if (filterRows([{ paid_at: "2026-07-01", amount: 1, needs_review: true }, { paid_at: "2026-07-01", amount: 2 }], { needs_review: true }).length !== 1) throw new Error("needs_review filter broken");
  // category resolution: owner's own label wins, machine labels get re-derived,
  // and a bare transfer to a named person lands in crew rather than "Other"
  const cat = (r) => resolveCategory(r, (p, py) => {
    if (/milk|bread|food/i.test(`${p} ${py}`)) return "Food & provisions";
    return "Other";
  });
  if (cat({ category: "Location fees", payee: "X" }) !== "Location fees") throw new Error("owner category was overridden");
  if (cat({ category: "Catering", payee: "X" }) !== "Food & provisions") throw new Error("synonym not folded");
  if (cat({ category: "Crew & talent", payee: "X" }) !== "Crew & payments") throw new Error("crew synonym not folded");
  if (cat({ category: "kenya", payee: "Brook", purpose: "milk" }) !== "Food & provisions") throw new Error("machine label not re-derived");
  if (cat({ category: "Payment", payee: "MOSES GATU", purpose: "Send Money, purpose not specified" }) !== "Crew & payments") throw new Error("bare person transfer not placed in crew");
  if (cat({ category: "vendor", payee: "Kikopey Beach Camp", purpose: "M-Pesa payment" }) !== "Accommodation") throw new Error("camp not placed in accommodation");
  // the shared map really does return Equipment for a flight; production terms must win
  const catEquip = (r) => resolveCategory(r, () => "Equipment");
  if (catEquip({ category: "kenya", payee: "", purpose: "AED 2,289 flight ticket for Bashir" }) !== "Transport") throw new Error("flight not placed in transport");
  if (catEquip({ category: "kenya", payee: "K&F Concept", purpose: "ND filter for the shoot" }) !== "Equipment") throw new Error("genuine equipment lost to the term map");
  if (cat({ category: "other", payee: "DANIEL KIARIE", purpose: "Buy Goods payment (Till 9083579)" }) !== "Other") throw new Error("till purchase wrongly placed in crew");
  if (cat({ category: "other", payee: "CRESCENT ISLAND GAME SANCTUARY", purpose: "entry" }) !== "Permits & location") throw new Error("sanctuary not placed in permits");
  if (cat({ category: "other", payee: "UNAITAS SACCO Limited", purpose: "Paybill payment" }) !== "Services & fees") throw new Error("company payee not placed in services");
  if (cat({ category: "other", payee: "", purpose: "" }) !== "Other") throw new Error("empty payee should stay Other");

  // designs are selectable and actually differ
  const alt = renderStatementHTML({ projectLabel: "X", rows, design: "statement" });
  if (alt === html) throw new Error("design parameter had no effect");
  if (!alt.includes(DESIGNS.statement.accent)) throw new Error("statement palette not applied");
  console.log("yalla-statement selftest OK");
}
