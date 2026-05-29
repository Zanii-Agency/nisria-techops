// Pass 0 FINAL FIX — replace the fabricated/inflated 'drive monthly history' backfill with
// clean line items re-extracted from the real monthly expense sheets in Drive.
//
// The backfill misread PayBill/Account numbers as amounts (the 5e21 rows) and templated 34
// months that have no source sheet. Truth: the sheets state their own month total, and the
// "Amount (KES)" column reconciles to it. We parse that column, reconcile to the stated Total,
// and only write months that balance. Donations, Givebutter payouts, and bank_transactions are
// untouched. Reversible: full snapshot saved before any delete.
//
// Run DRY first:   DRY_RUN=1 node --dns-result-order=ipv4first scripts/reextract_expenses.mjs
// Then for real:   DRY_RUN=0 node --dns-result-order=ipv4first scripts/reextract_expenses.mjs
import fs from "node:fs";
import crypto from "node:crypto";

const DRY = process.env.DRY_RUN !== "0";
const SEED = "/Users/milaaj/Code/nisria-techops/platform/.env.seed";
const REF = "ptvhqudonvvszupzhcfl";

const seed = fs.readFileSync(SEED, "utf8");
const grab = (k) => { const m = seed.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim().replace(/^["']|["']$/g, "") : ""; };
const sa = JSON.parse(Buffer.from(grab("GOOGLE_SERVICE_ACCOUNT_B64"), "base64").toString("utf8"));
const SUPA_TOK = (await import("node:child_process")).execSync("security find-generic-password -s 'bu-supabase-token' -w").toString().trim();

async function fr(url, opts = {}, tries = 6) {
  for (let i = 0; i < tries; i++) {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 40000);
    try { const r = await fetch(url, { ...opts, signal: ac.signal }); clearTimeout(t); return r; }
    catch (e) { clearTimeout(t); if (i === tries - 1) throw e; await new Promise((r) => setTimeout(r, 2000 * (i + 1))); }
  }
}
// drive token
const now = Math.floor(Date.now() / 1000);
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const inp = `${b64u({ alg: "RS256", typ: "JWT" })}.${b64u({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/drive.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
const sig = crypto.sign("RSA-SHA256", Buffer.from(inp), sa.private_key).toString("base64url");
const DTOK = (await (await fr("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${inp}.${sig}` }) })).json()).access_token;
const find = async (q) => (await (await fr(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=50&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`, { headers: { authorization: `Bearer ${DTOK}` } })).json()).files || [];
const csvOf = async (id) => await (await fr(`https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=text/csv`, { headers: { authorization: `Bearer ${DTOK}` } })).text();
// supabase mgmt query
const sql = async (q) => {
  const r = await fr(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { authorization: `Bearer ${SUPA_TOK}`, "content-type": "application/json", "user-agent": "pass0-reextract" }, body: JSON.stringify({ query: q }) });
  const d = await r.json();
  if (d && d.error) throw new Error("SQL: " + JSON.stringify(d));
  return d;
};

// minimal CSV parser (handles quoted fields with commas + newlines)
function parseCSV(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const num = (s) => { const m = String(s || "").replace(/,/g, "").match(/-?\d+\.?\d*/); return m ? Number(m[0]) : null; };
const catOf = (expense) => {
  const e = (expense || "").toLowerCase();
  if (e.includes("payroll")) return "payroll";
  if (e.includes("petty")) return "petty cash";
  if (e.includes("rent")) return "rent";
  if (e.includes("utilit")) return "utilities";
  if (e.includes("upkeep")) return "upkeep";
  if (e.includes("food")) return "upkeep";
  return "other";
};

// the four real 2026 sheets -> month
const MONTHS = [
  { ym: "2026-02", q: "name contains '202602 - Monthly Expenses'" },
  { ym: "2026-03", q: "name contains '202603 - Monthly Expenses'" },
  { ym: "2026-04", q: "name contains '202604 - Monthly Expenses'" },
  { ym: "2026-05", q: "name contains '202605 - Monthly Expenses'" },
];

const esc = (s) => String(s == null ? "" : s).replace(/'/g, "''").slice(0, 200);
const parsed = [];
for (const m of MONTHS) {
  const f = (await find(`${m.q} and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`))[0];
  if (!f) { console.log(`${m.ym}: SHEET NOT FOUND, skipping`); continue; }
  const rows = parseCSV(await csvOf(f.id));
  const header = rows.find((r) => r.some((c) => /amount/i.test(c))) || rows[0];
  const idx = (re) => header.findIndex((c) => re.test(c));
  const iName = idx(/name/i), iExp = idx(/expense/i), iAmt = idx(/amount/i), iGrant = idx(/grant/i), iDesig = idx(/desig/i);
  let curName = "";
  const items = []; let stated = null;
  for (const r of rows) {
    if (r === header) continue;
    const name = (r[iName] || "").trim();
    if (name) curName = name;
    const isTotal = r.some((c) => /^total/i.test((c || "").trim()));
    const amt = num(r[iAmt]);
    if (isTotal) { stated = num(r[iAmt]) ?? Math.max(...r.map(num).filter((n) => n != null)); continue; }
    if (amt == null || amt === 0) continue;
    const grant = (r[iGrant] || "").trim();
    const expense = (r[iExp] || "").trim();
    const desig = iDesig >= 0 ? (r[iDesig] || "").trim() : "";
    items.push({
      payee: curName || expense || "Expense",
      purpose: [expense, desig, grant ? `[${grant}]` : ""].filter(Boolean).join(" ").trim(),
      category: catOf(expense),
      amount: amt,
      fund: grant || "core",
    });
  }
  const sum = items.reduce((s, x) => s + x.amount, 0);
  parsed.push({ ...m, file: f.name, items, stated, sum });
  const ok = stated != null && Math.abs(sum - stated) < 1;
  console.log(`${m.ym}  ${f.name.padEnd(34)} items=${String(items.length).padStart(2)}  sum=${sum.toLocaleString().padStart(9)}  stated=${stated ? stated.toLocaleString() : "?"}  ${ok ? "RECONCILES" : "*** MISMATCH ***"}`);
}

const allOk = parsed.length === MONTHS.length && parsed.every((p) => p.stated != null && Math.abs(p.sum - p.stated) < 1);
console.log(`\nreconcile: ${allOk ? "ALL MONTHS BALANCE" : "NOT ALL BALANCE"}  |  DRY_RUN=${DRY}`);
if (!allOk) { console.log("aborting: will not write unless every month reconciles to its stated total."); process.exit(allOk ? 0 : 2); }

if (DRY) { console.log("\nDRY RUN: no writes. Re-run with DRY_RUN=0 to snapshot, purge backfill, and load clean rows."); process.exit(0); }

// 1) snapshot
const snap = await sql("select id,payee,purpose,amount::text,currency,status,paid_at::text,ref,created_by,category from payments where created_by like 'drive monthly history%';");
const snapPath = `docs/baselines/pass-0-backfill-snapshot-${new Date().toISOString().slice(0,10)}.json`;
fs.writeFileSync(snapPath, JSON.stringify(snap, null, 2));
console.log(`snapshot: ${snap.length} backfill rows -> ${snapPath}`);

// 2) purge the fabricated/inflated backfill (donations, payouts, bank untouched)
const del = await sql("delete from payments where created_by like 'drive monthly history%' returning id;");
console.log(`deleted backfill rows: ${del.length}`);

// 3) insert clean rows
let inserted = 0;
for (const p of parsed) {
  const [y, mo] = p.ym.split("-");
  const paidAt = `${p.ym}-28`;
  const recurrence = p.ym === "2026-05" ? "monthly" : "none";
  const values = p.items.map((it, i) =>
    `('out','${esc(it.payee)}','${esc(it.purpose)}',${it.amount},'KES','mpesa','paid','${paidAt} 00:00:00+00','drive sheet ${y}${mo} #${i + 1}','drive sheet ${p.ym}','${it.category}','${recurrence}')`
  ).join(",\n");
  await sql(`insert into payments (direction,payee,purpose,amount,currency,method,status,paid_at,ref,created_by,category,recurrence) values\n${values};`);
  inserted += p.items.length;
  console.log(`inserted ${p.items.length} rows for ${p.ym} (sum ${p.sum.toLocaleString()} KES)`);
}
console.log(`\nDONE. inserted ${inserted} clean rows across ${parsed.length} months.`);
// 4) verify
const ver = await sql("select to_char(date_trunc('month',paid_at),'YYYY-MM') ym, round(sum(amount)::numeric,0) kes, count(*) n from payments where currency='KES' and status='paid' and created_by='drive sheet '||to_char(date_trunc('month',paid_at),'YYYY-MM') group by 1 order by 1;");
console.log("verify (clean months):", JSON.stringify(ver));
