// Backfill extracted_text for the whole document corpus so every file is readable
// + searchable natively in-app (not just lazily on first open). Mirrors
// lib/extract-text: Google-native via export, PDF via unpdf, Word via mammoth,
// sheets via SheetJS. Idempotent: only fills rows whose text is empty. Skips
// shortcuts / images / vector files (nothing to read). Run in the background.
import fs from "node:fs";
import crypto from "node:crypto";

const env = fs.readFileSync(new URL("../.env.seed", import.meta.url), "utf8");
const g = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim().replace(/^"|"$/g, "") || "";
const URL_ = g("SUPABASE_URL").replace(/\/$/, ""), KEY = g("SUPABASE_SERVICE_KEY");
const SA = JSON.parse(Buffer.from(g("GOOGLE_SERVICE_ACCOUNT_B64"), "base64").toString());
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "User-Agent": "Mozilla/5.0" };
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSXM = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const TEXT_EXPORT = { "application/vnd.google-apps.document": "text/plain", "application/vnd.google-apps.presentation": "text/plain", "application/vnd.google-apps.spreadsheet": "text/csv" };
const MAX = 200_000;

let _tok = null, _exp = 0;
async function tok() {
  if (_tok && Date.now() < _exp - 60000) return _tok;
  const now = Math.floor(Date.now() / 1000);
  const h = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const c = Buffer.from(JSON.stringify({ iss: SA.client_email, scope: "https://www.googleapis.com/auth/drive.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })).toString("base64url");
  const sig = crypto.sign("RSA-SHA256", Buffer.from(`${h}.${c}`), SA.private_key).toString("base64url");
  const r = await (await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${h}.${c}.${sig}` }) })).json();
  _tok = r.access_token; _exp = now * 1000 + 3600000; return _tok;
}
const clean = (s) => { const t = (s || "").replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(); return t.length > MAX ? t.slice(0, MAX) + "\n\n[…truncated]" : t; };
async function bytes(id, mime) {
  const exp = { "application/vnd.google-apps.document": "application/pdf", "application/vnd.google-apps.presentation": "application/pdf" }[mime];
  const url = exp ? `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent(exp)}` : `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const r = await fetch(url, { headers: { authorization: `Bearer ${await tok()}` } });
  if (!r.ok) throw new Error("dl " + r.status);
  return Buffer.from(await r.arrayBuffer());
}
async function extract(id, mime) {
  try {
    if (TEXT_EXPORT[mime]) {
      const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent(TEXT_EXPORT[mime])}`, { headers: { authorization: `Bearer ${await tok()}` } });
      return r.ok ? clean(await r.text()) : null;
    }
    if (mime === "application/pdf") {
      const buf = await bytes(id, mime);
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const { text } = await extractText(pdf, { mergePages: true });
      return clean(Array.isArray(text) ? text.join("\n") : text);
    }
    if (mime === DOCX || mime === "application/msword") {
      const buf = await bytes(id, mime);
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer: buf });
      return clean(value);
    }
    if (mime === XLSXM || mime === "text/csv") {
      const buf = await bytes(id, mime);
      const XLSX = await import("xlsx");
      const wb = XLSX.read(buf, { type: "buffer" });
      return clean(wb.SheetNames.map((n) => `# ${n}\n` + XLSX.utils.sheet_to_csv(wb.Sheets[n])).join("\n\n"));
    }
    return null;
  } catch (e) { return null; }
}

const SKIP = /shortcut|image\/|postscript|illustrator|x-iwork/;
const docs = await (await fetch(`${URL_}/rest/v1/documents?select=id,title,mime,drive_file_id,extracted_text&limit=2000`, { headers: H })).json();
const todo = docs.filter((d) => d.drive_file_id && !SKIP.test(d.mime || "") && (!(d.extracted_text || "").trim() || (d.extracted_text || "").trim().length < 40));
console.log(`corpus ${docs.length}, to extract ${todo.length}`);
let ok = 0, empty = 0, fail = 0;
for (let i = 0; i < todo.length; i++) {
  const d = todo[i];
  const text = await extract(d.drive_file_id, d.mime);
  if (text && text.length >= 40) {
    await fetch(`${URL_}/rest/v1/documents?id=eq.${d.id}`, { method: "PATCH", headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ extracted_text: text }) });
    ok++;
  } else empty++;
  if ((i + 1) % 20 === 0) console.log(`  ${i + 1}/${todo.length}  ok=${ok} empty=${empty} fail=${fail}`);
}
console.log(`DONE: extracted ${ok}, no-text ${empty}, of ${todo.length}`);
