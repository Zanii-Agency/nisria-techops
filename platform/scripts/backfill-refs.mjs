// One-off: stamp txn_ref onto existing Yalla ledger rows so the identity-first
// dedup protects history too. SMS-sourced rows carry the ref in their purpose
// text; PDF rows get a vision read of the stored receipt (ref + amount only).
// Idempotent: rows that already have txn_ref are skipped. DRY unless --write.
import { readFileSync } from "node:fs";
const WRITE = process.argv.includes("--write");
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8")
  .split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const SB = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_KEY, AKEY = env.ANTHROPIC_API_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const refRe = (s) => { const m = /\b([A-Z0-9]{10})\s+Confirmed/i.exec(String(s || "")) || /\b(?=[A-Z0-9]*\d)([A-Z]{2}[A-Z0-9]{8})\b/.exec(String(s || "")); return m ? m[1].toUpperCase() : null; };
async function rest(p, o = {}) { const r = await fetch(`${SB}/rest/v1/${p}`, { ...o, headers: { ...H, ...(o.headers || {}) } }); if (!r.ok) throw new Error(`${r.status} ${await r.text()}`); const t = await r.text(); return t ? JSON.parse(t) : null; }
async function visionRef(path, mime) {
  const r = await fetch(`${SB}/storage/v1/object/assets/${path.split("/").map(encodeURIComponent).join("/")}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length >= 6_000_000) return null;
  const block = mime === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") } }
    : { type: "image", source: { type: "base64", media_type: mime || "image/jpeg", data: buf.toString("base64") } };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "x-api-key": AKEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 100, messages: [{ role: "user", content: [block, { type: "text", text: 'Payment receipt. Respond ONLY with JSON: {"ref": "<the transaction/receipt reference code, or null>"}' }] }] }),
  });
  const j = await res.json();
  if (!res.ok) return null;
  try { const p = JSON.parse((j?.content?.[0]?.text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()); return p.ref ? String(p.ref).toUpperCase().slice(0, 24) : null; } catch { return null; }
}

const rows = await rest(`payments?project=eq.yalla&txn_ref=is.null&select=id,purpose,source_type,source_ref&limit=200`);
console.log(`${rows.length} yalla rows without txn_ref. Mode: ${WRITE ? "WRITE" : "DRY"}`);
let fromText = 0, fromVision = 0, none = 0;
for (const row of rows) {
  let ref = refRe(row.purpose);
  if (!ref && (row.source_type === "pdf" || row.source_type === "image") && row.source_ref) {
    ref = await visionRef(row.source_ref, row.source_type === "pdf" ? "application/pdf" : "image/jpeg");
    if (ref) fromVision++;
  } else if (ref) fromText++;
  if (!ref) { none++; continue; }
  console.log(`  ${row.id.slice(0, 8)} -> ${ref}`);
  if (WRITE) await rest(`payments?id=eq.${row.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ txn_ref: ref }) });
}
console.log(`refs: ${fromText} from text, ${fromVision} from receipts, ${none} have none (captioned photos without a printed ref).`);
