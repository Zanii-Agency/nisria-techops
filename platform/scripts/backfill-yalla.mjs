// Backfill historical Yalla Kenya expenses from the Finances WhatsApp group into
// the payments ledger. These receipts were posted BEFORE auto-book was armed, so
// they are filed as documents/messages but not booked. Applies the SAME session
// model as the live ingest (a sender is "in a Yalla session" around any message
// where they name the project), books one payment per media receipt (vision for
// the amount), and books text expenses only when no same-sender/same-day/same-amount
// media already covers them. Idempotent per message id. DRY by default; --write commits.
//
//   node scripts/backfill-yalla.mjs           # dry run (no writes)
//   node scripts/backfill-yalla.mjs --write   # commit
import { readFileSync } from "node:fs";

const WRITE = process.argv.includes("--write");
const GROUP = "Nisria • Finances 💵";
const SINCE = "2026-06-30";
const SESSION_MS = 18 * 60 * 60 * 1000;

// --- env from platform/.env.local ---
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const SB = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_KEY, AKEY = env.ANTHROPIC_API_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const amtRe = /(?:kes|ksh|kshs|ksh\.|kes\.)\s*([\d][\d,]*)/i;
const parseAmt = (s) => { const m = amtRe.exec(String(s || "")); return m ? Number(m[1].replace(/,/g, "")) : null; };
const namesYalla = (s) => /yalla/i.test(String(s || ""));
const day = (iso) => String(iso).slice(0, 10);

async function rest(path, opts = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  const txt = await r.text();          // return=minimal / 204 send no body
  return txt ? JSON.parse(txt) : null;
}
async function downloadAsset(path) {
  const r = await fetch(`${SB}/storage/v1/object/assets/${path.split("/").map(encodeURIComponent).join("/")}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`asset ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
async function vision(buf, mime) {
  const isPdf = mime === "application/pdf";
  if (buf.length >= 6_000_000) return null;
  const block = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") } }
    : { type: "image", source: { type: "base64", media_type: mime, data: buf.toString("base64") } };
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "x-api-key": AKEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 300, messages: [{ role: "user", content: [block,
      { type: "text", text: "This is an M-Pesa / bank payment receipt for a nonprofit expense. Respond ONLY with JSON: {\"amount\": <number or null>, \"payee\": <string or null>, \"date\": \"<YYYY-MM-DD or null>\"}. amount is a plain number, no symbol or commas." }] }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || "vision failed");
  try {
    const t = (j?.content?.[0]?.text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const p = JSON.parse(t);
    return { amount: p.amount == null ? null : Number(String(p.amount).replace(/[^0-9.]/g, "")) || null, payee: p.payee || null, date: p.date || null };
  } catch { return null; }
}

const rows = await rest(`messages?account=eq.${encodeURIComponent(GROUP)}&created_at=gte.${SINCE}&order=created_at.asc&select=id,created_at,body,media_path,media_mime,contact_id,contacts(name)`);
console.log(`Loaded ${rows.length} messages from "${GROUP}" since ${SINCE}. Mode: ${WRITE ? "WRITE" : "DRY"}\n`);

// Session model: group a sender's yalla-mention timestamps; a message is yalla if
// the sender named yalla within 18h of it (before or after), or it names yalla.
const yallaTimesBySender = {};
for (const m of rows) {
  if (namesYalla(m.body)) (yallaTimesBySender[m.contact_id] ||= []).push(+new Date(m.created_at));
}
const isYalla = (m) => {
  if (namesYalla(m.body)) return true;
  const ts = yallaTimesBySender[m.contact_id] || [];
  const t = +new Date(m.created_at);
  return ts.some((y) => Math.abs(y - t) <= SESSION_MS);
};

// Dedup key = sender|day|amount. One expense per key across BOTH media and text
// AND across runs (seeded from already-booked backfill rows), so an M-Pesa SMS +
// its caption + its PDF receipt collapse to ONE payment, and a later funded PDF
// pass never double-books what a text pass already booked.
const seen = new Set();
const prior = await rest(`payments?created_by=like.backfill:yalla*&select=amount,paid_at,created_by`);
for (const p of prior) { const cid = String(p.created_by).split(":")[2] || ""; seen.add(`${cid}|${day(p.paid_at)}|${Number(p.amount)}`); }
console.log(`Seeded ${seen.size} already-booked keys.\n`);

const plan = [];
let skipNonYalla = 0, skipNoAmount = 0, skipDup = 0, skipExists = 0;

const consider = async (m, amount, payee, date, kind) => {
  const key = `${m.contact_id}|${day(date || m.created_at)}|${amount}`;
  if (seen.has(key)) { skipDup++; return; }
  const ref = `BACKFILL-YALLA-${m.id}`;
  const exists = await rest(`payments?ref=eq.${ref}&select=id&limit=1`);
  if (exists.length) { skipExists++; seen.add(key); return; }
  seen.add(key);
  // Human-readable description from the caption (strip the "[image]/[document]"
  // tag and any leading amount), so the ledger line reads like Nur wrote it.
  const desc = String(m.body || "").replace(/^\[(?:image|document)\][^\S\n]*/i, "").replace(/^[^A-Za-z]*(?:kes|ksh)[\s.]*[\d,]+\s*/i, "").trim().slice(0, 140) || null;
  // Better payee: "to/for <Name>" from the caption, else the SMS payee, else poster.
  const forTo = /(?:sent to|paid to|to|for)\s+([A-Z][A-Za-z .'-]{2,40})/.exec(m.body || "");
  plan.push({ ref, contact: m.contact_id, kind, amount, currency: "KES",
    payee: payee || (forTo ? forTo[1].trim() : (m.contacts?.name ? `Receipt (${m.contacts.name})` : "Yalla receipt")),
    desc, paid_at: date ? `${date}T12:00:00Z` : m.created_at, source_ref: kind === "text" ? null : m.media_path,
    uploaded_at: m.created_at, who: m.contacts?.name || "?", body: (m.body || "").slice(0, 50) });
};

// PASS 1: media receipts (canonical). Amount from caption if present, else vision.
for (const m of rows) {
  if (!m.media_path || !isYalla(m)) { if (m.media_path) skipNonYalla++; continue; }
  let amount = parseAmt(m.body), payee = null, date = null;
  if (amount == null) {
    try { const buf = await downloadAsset(m.media_path); const v = await vision(buf, m.media_mime || "image/jpeg"); if (v) { amount = v.amount; payee = v.payee; date = v.date; } }
    catch (e) { console.log(`  vision fail ${m.media_path}: ${e.message}`); }
  }
  if (amount == null) { skipNoAmount++; continue; }
  await consider(m, amount, payee, date, m.media_mime === "application/pdf" ? "pdf" : "image");
}

// PASS 2: text expenses (SMS + captions). Deduped against media + each other.
for (const m of rows) {
  if (m.media_path) continue;
  if (!isYalla(m)) { skipNonYalla++; continue; }
  const amount = parseAmt(m.body);
  if (amount == null) continue; // pure labels / chatter
  const payeeM = /(?:sent to|paid to)\s+([A-Za-z][A-Za-z .'-]{2,40})/i.exec(m.body);
  await consider(m, amount, payeeM ? payeeM[1].trim() : (m.contacts?.name || "Yalla expense"), null, "text");
}

// Report
const total = plan.reduce((s, p) => s + p.amount, 0);
console.log(`\nPLAN: ${plan.length} expenses to book, total KES ${total.toLocaleString()}`);
console.log(`Skipped: non-yalla=${skipNonYalla}, no-amount/vision-blocked=${skipNoAmount}, dedup(sms+caption+receipt)=${skipDup}, already-booked=${skipExists}\n`);
for (const p of plan) console.log(`  ${p.kind.padEnd(5)} KES ${String(p.amount).padStart(7)} | ${p.who.slice(0,12).padEnd(12)} | ${p.payee.slice(0,24).padEnd(24)} | ${p.body}`);

if (!WRITE) { console.log(`\nDRY RUN — no writes. Re-run with --write to book these.`); process.exit(0); }

let booked = 0;
for (const p of plan) {
  try {
    await rest("payments", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({
      direction: "out", payee: p.payee, purpose: (p.desc ? `${p.desc} ` : "") + "(Yalla, backfilled from Finances group; needs confirm)",
      amount: p.amount, currency: p.currency, method: "mpesa", status: "paid", paid_at: p.paid_at,
      category: "other", recurrence: "none", vendor_country: "Kenya", project: "yalla",
      source_type: p.kind === "text" ? "whatsapp" : p.kind, source_ref: p.source_ref, screenshot_path: p.source_ref,
      source_uploaded_at: p.uploaded_at, needs_review: true, ref: p.ref, created_by: `backfill:yalla:${p.contact}`,
    }) });
    booked++;
  } catch (e) { console.log(`  WRITE FAIL ${p.ref}: ${e.message}`); }
}
console.log(`\nBOOKED ${booked}/${plan.length} into the ledger (project=yalla, needs_review).`);
