// LHSH banking: the statement is a 36MB scan, too big for one Claude PDF request.
// Split it into sub-limit page batches, OCR/extract each, merge in page order, then
// apply the SAME hard gate as the main account: the running BALANCE CHAIN must be
// unbroken and end at the stated closing balance. Nothing is written otherwise.
// Usage: node scripts/ocr-bank-split.mjs
import fs from "node:fs";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { PDFDocument } from "pdf-lib";

const env = fs.readFileSync(new URL("../.env.seed", import.meta.url), "utf8");
const g = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim().replace(/^"|"$/g, "") || "";
const URL_ = g("SUPABASE_URL").replace(/\/$/, ""), KEY = g("SUPABASE_SERVICE_KEY");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "User-Agent": "Mozilla/5.0", "Content-Type": "application/json" };
const SA = JSON.parse(Buffer.from(g("GOOGLE_SERVICE_ACCOUNT_B64"), "base64").toString());
const ANTHROPIC = execSync("security find-generic-password -s rinq-anthropic-key -w", { encoding: "utf8" }).trim();

const DOC = "19feeeec-5026-4f6d-9d79-5493f12170ef";
const FILE = "1VOWfcwqcM2_t4rHB_UPy96whckuIDBx4";
// Big batches preserve continuity (the small 4-page batches lost it). Each Claude
// request allows up to 32MB; we size batches so each stays comfortably under, and
// carry the running balance forward across the stitch so the chain never breaks.

async function driveToken() {
  const now = Math.floor(Date.now() / 1000);
  const h = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const c = Buffer.from(JSON.stringify({ iss: SA.client_email, scope: "https://www.googleapis.com/auth/drive.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })).toString("base64url");
  const sig = crypto.sign("RSA-SHA256", Buffer.from(`${h}.${c}`), SA.private_key).toString("base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${h}.${c}.${sig}` }) });
  return (await r.json()).access_token;
}

const promptFor = (carry) => `This is a consecutive run of pages from a scanned Kenyan bank statement. Extract EVERY transaction row, IN ORDER, into JSON. Return ONLY JSON:
{"account":"bank + account number if visible","opening":number_or_null,"closing":number_or_null,"transactions":[{"date":"YYYY-MM-DD","description":"...","debit":0,"credit":0,"balance":0}]}
Rules: each row has EITHER a debit (money out) OR a credit (money in); the THIRD money column is the running BALANCE (never put a balance figure into debit/credit). The running balance DECREASES by the debit and INCREASES by the credit, so for every row: previous_balance - debit + credit = this row's balance. Use that identity to self-check each row and fix misread digits.${carry != null ? `\nThe balance carried forward INTO the first transaction on these pages is ${carry}. Your first row must satisfy: ${carry} - debit + credit = balance.` : ""}
Keep rows in the exact order they appear top-to-bottom, page by page. Set opening only if an OPENING BALANCE row appears; set closing only if a CLOSING/Available Balance summary appears. Be meticulous with digits. Return ONLY the JSON.`;

console.log("downloading LHSH statement…");
const tok = await driveToken();
const dl = await fetch(`https://www.googleapis.com/drive/v3/files/${FILE}?alt=media&supportsAllDrives=true`, { headers: { authorization: `Bearer ${tok}` } });
const bytes = Buffer.from(await dl.arrayBuffer());
const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
const pages = src.getPageCount();
console.log(`  ${(bytes.length / 1e6).toFixed(1)}MB, ${pages} pages`);

async function claudeBatch(b64, idx, carry) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-opus-4-7", max_tokens: 32000, messages: [{ role: "user", content: [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
      { type: "text", text: promptFor(carry) },
    ] }] }),
  });
  const j = await r.json();
  if (!j.content) { console.log(`  batch ${idx} ERR`, JSON.stringify(j).slice(0, 200)); return null; }
  let raw = j.content.map((c) => c.text || "").join("").replace(/^```json?/i, "").replace(/```$/i, "").trim();
  const m = raw.match(/\{[\s\S]*\}/);
  try { return JSON.parse(m ? m[0] : raw); } catch { console.log(`  batch ${idx} JSON parse fail`); return null; }
}

// size batches so each PDF stays well under the 32MB request cap (~22MB raw -> ~30MB b64)
const TARGET_RAW = 16 * 1024 * 1024;
const numBatches = Math.max(1, Math.ceil(bytes.length / TARGET_RAW));
const BATCH = Math.ceil(pages / numBatches);
console.log(`  batching ${pages} pages into ${numBatches} of ~${BATCH}`);

// does a batch's rows chain internally AND connect to the carry-in balance?
function batchChains(txns, carryIn) {
  let prev = carryIn;
  for (const t of txns) {
    if (t.balance == null) continue;
    const deb = Number(t.debit) || 0, cred = Number(t.credit) || 0, bal = Number(t.balance);
    if (prev != null && Math.abs((prev - deb + cred) - bal) > 1.0) return false;
    prev = bal;
  }
  return true;
}

let all = [], account = "LHSH account", opening = null, closing = null, carry = null;
for (let start = 0, idx = 1; start < pages; start += BATCH, idx++) {
  const sub = await PDFDocument.create();
  const idxs = Array.from({ length: Math.min(BATCH, pages - start) }, (_, k) => start + k);
  const copied = await sub.copyPages(src, idxs);
  copied.forEach((p) => sub.addPage(p));
  const b64 = Buffer.from(await sub.save()).toString("base64");
  const mb = (b64.length / 1e6).toFixed(1);

  // extract this batch; if its chain doesn't hold (skipped/misread rows), retry up to 3x
  let out = null, tries = 0;
  while (tries < 4) {
    tries++;
    out = await claudeBatch(b64, idx, carry);
    if (out && batchChains(out.transactions || [], carry)) break;
    console.log(`    batch ${idx} try ${tries}: chain not clean, retrying…`);
  }
  const n = out?.transactions?.length || 0;
  const clean = out && batchChains(out.transactions || [], carry);
  if (out) {
    if (out.account && account === "LHSH account") account = `LHSH · ${out.account}`;
    if (out.opening != null && opening == null) opening = Number(out.opening);
    if (out.closing != null) closing = Number(out.closing);
    all.push(...out.transactions);
    const withBal = out.transactions.filter((t) => t.balance != null);
    if (withBal.length) carry = Number(withBal[withBal.length - 1].balance);
  }
  console.log(`  batch ${idx}/${numBatches} (pp ${start + 1}-${start + idxs.length}, ${mb}MB b64): +${n} txns  ${clean ? "chain✓" : "chain✗"}  carry->${carry}`);
}

console.log(`\nmerged ${all.length} transactions; opening=${opening} closing=${closing}`);
fs.writeFileSync("/tmp/bank-lhsh.json", JSON.stringify({ account, opening, closing, transactions: all }, null, 2));

// ---- gate: unbroken balance chain + ends at stated closing ----
let okChain = true, breaks = 0;
for (let i = 1; i < all.length; i++) {
  const pb = all[i - 1].balance, cb = all[i].balance;
  if (pb == null || cb == null) continue;
  const deb = Number(all[i].debit) || 0, cred = Number(all[i].credit) || 0;
  if (Math.abs((Number(pb) - deb + cred) - Number(cb)) > 1.0) { okChain = false; breaks++; }
}
const lastBal = Number(all[all.length - 1]?.balance);
const okClose = closing != null && Math.abs(lastBal - closing) <= 1.0;
console.log(`balance chain ${okChain ? "UNBROKEN" : `BROKEN (${breaks} breaks)`} · last balance ${lastBal} vs closing ${closing} ${okClose ? "OK" : "MISMATCH"}`);

if (!(okChain && okClose)) {
  console.log("\nGATE FAILED — not writing. Parsed rows saved to /tmp/bank-lhsh.json for inspection.");
  process.exit(2);
}

// ---- commit ----
const del = await fetch(`${URL_}/rest/v1/bank_transactions?source_doc_id=eq.${DOC}`, { method: "DELETE", headers: H });
const rows = all.map((t, i) => ({
  account, txn_date: t.date, description: String(t.description || "").slice(0, 300),
  amount: (Number(t.debit) || 0) > 0 ? Number(t.debit) : Number(t.credit) || 0,
  currency: "KES", direction: (Number(t.debit) || 0) > 0 ? "out" : "in",
  balance: t.balance != null ? Number(t.balance) : null, source_doc_id: DOC, confidence: "high", signature: `${DOC}#${i}`,
}));
for (let i = 0; i < rows.length; i += 200) {
  const r = await fetch(`${URL_}/rest/v1/bank_transactions`, { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(rows.slice(i, i + 200)) });
  if (!r.ok) { console.log("INSERT FAIL", r.status, (await r.text()).slice(0, 200)); process.exit(1); }
}
console.log(`\nRECONCILED ✓ — wrote ${rows.length} transactions for ${account}`);
