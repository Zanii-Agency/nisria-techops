// Log the donations that came in OUTSIDE Givebutter — the international wires and
// transfers sitting in the bank statements (INWARD TT / RTGS IN). Creates a donor
// record per payer and a KES donation linked to it. Excludes internal account
// transfers, fees and cash deposits (ambiguous). Idempotent via external_id = the
// bank-transaction signature. These are historical (2021-22) so they enrich the
// donor CRM without touching this-month figures.
import fs from "node:fs";
const env = fs.readFileSync(new URL("../.env.seed", import.meta.url), "utf8");
const g = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim().replace(/^"|"$/g, "") || "";
const URL_ = g("SUPABASE_URL").replace(/\/$/, ""), KEY = g("SUPABASE_SERVICE_KEY");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "User-Agent": "Mozilla/5.0", "Content-Type": "application/json" };
const NISRIA = "6260def0-e6e6-46ab-b256-1ba7ed19fe5a";
const get = (p) => fetch(`${URL_}/rest/v1/${p}`, { headers: H }).then((r) => r.json());
const post = (p, b, prefer = "return=representation") => fetch(`${URL_}/rest/v1/${p}`, { method: "POST", headers: { ...H, Prefer: prefer }, body: JSON.stringify(b) });

const PURPOSE = /\b(EDUCATIONAL|CHARITABLE|CONTRIBUTION|SUPPORT|DONATION|SEWING|SURGERY|OPERATION|PROJECT|SETUP|MAINTENANCE|SCHOOL|FELIX|JOSHUA|BILAL|GH|ISN|MDC|TRIKE\w*|C\d+|M\d+)\b/i;
const tc = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
// Returns { key, display }. key = first given+family token (lowercased) so the same
// person collapses to ONE donor regardless of how the wire spelled the rest; display
// = the cleaned first 3 tokens (keeps org names like "Play For Smiles" readable).
function donorName(desc) {
  let s = String(desc || "").replace(/^(RTGS IN|INWARD TT|PESALINK)\s*[;:]?\s*/i, "").trim();
  s = s.replace(/^(MS|MR|MRS|DR|MISS)\.?\s+/i, "");
  const out = [];
  for (const t of s.split(/\s+/)) {
    if (PURPOSE.test(t) || /^\d|[;]/.test(t)) break;
    if (/^FOR$/i.test(t) && out.length >= 2) break;
    const clean = t.replace(/[^A-Za-z\-']/g, "");
    if (clean) out.push(clean);
    if (out.length >= 4) break;
  }
  if (out.length < 2) return null;
  return { key: out.slice(0, 2).join(" ").toLowerCase(), display: tc(out.slice(0, 3).join(" ")) };
}

// clean re-run: drop the prior bank donations + the donors they created
await fetch(`${URL_}/rest/v1/donations?channel=eq.bank`, { method: "DELETE", headers: H });
await fetch(`${URL_}/rest/v1/donors?source=eq.${encodeURIComponent("bank statement")}`, { method: "DELETE", headers: H });

const txns = await get(`bank_transactions?select=txn_date,description,amount,signature&direction=eq.in&order=txn_date.asc`);
const donations = txns.filter((t) => /(INWARD TT|RTGS IN)/i.test(t.description) && !/(FUNDS TRANSFER|EXCISE|CHARGES|REVERSAL|2031538133|2043066008)/i.test(t.description));
console.log(`candidate external donations: ${donations.length}`);

const donorByKey = new Map(); // key -> id
let added = 0, byDonor = {};
for (const t of donations) {
  const nm = donorName(t.description);
  if (!nm) { console.log("  no-name:", t.description.slice(0, 50)); continue; }
  let donorId = donorByKey.get(nm.key);
  if (!donorId) {
    const r = await post("donors", [{ full_name: nm.display, type: "individual", source: "bank statement", status: "active", country: "International", tags: ["non-givebutter", "bank-wire"] }]);
    donorId = (await r.json())[0]?.id;
    donorByKey.set(nm.key, donorId);
  }
  const r = await post("donations", [{ donor_id: donorId, brand_id: NISRIA, amount: Number(t.amount), currency: "KES", channel: "bank", is_recurring: false, status: "succeeded", donated_at: `${t.txn_date}T00:00:00Z`, external_id: `bank:${t.signature}` }], "return=minimal");
  if (r.ok) { added++; byDonor[nm.display] = (byDonor[nm.display] || 0) + Number(t.amount); }
  else console.log("  fail", (await r.text()).slice(0, 120));
}
console.log(`\nlogged ${added} bank donations across ${donorByKey.size} donors:`);
for (const [n, v] of Object.entries(byDonor).sort((a, b) => b[1] - a[1])) console.log(`  ${n}: KES ${Math.round(v).toLocaleString()}`);
