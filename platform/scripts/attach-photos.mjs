// Attach rescue-children portraits from the Drive archive to their beneficiary
// records. Bytes are pulled server-side via the service account (never through
// chat context) and stored in the PRIVATE Supabase 'assets' bucket, then linked
// via photo_asset_id. Exact + fuzzy name matches, Kwetu cohort only. Idempotent
// (re-runnable: upserts storage, replaces the drive asset row per file).
import fs from "node:fs";
import crypto from "node:crypto";

const env = fs.readFileSync(new URL("../.env.seed", import.meta.url), "utf8");
const g = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim().replace(/^"|"$/g, "") || "";
const URL_ = g("SUPABASE_URL").replace(/\/$/, ""), KEY = g("SUPABASE_SERVICE_KEY");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "User-Agent": "Mozilla/5.0" };
const sa = JSON.parse(Buffer.from(g("GOOGLE_SERVICE_ACCOUNT_B64"), "base64").toString());

// fileId -> the child name to match in the beneficiaries table (exact + fuzzy)
const PHOTOS = [
  ["1qLR_tp9p4AkYQa1sntGUPKOXzny90d_m", "Vicking Kamau"],
  ["1WAw5cFtsJIlPnnXt2CA2T66OIy6zkMhi", "Stephen Ngugi"],
  ["1_SScPvXw8EniMboRZJangdYzzDFn7jZe", "John Macharia"],
  ["114pRq0BT1cFDAIwXqO4B8xcNGtskRgoW", "Walter Gichuhi Wambui"],
  ["1zBLpD00aMSzhlM2-MXlyuYl41nx4XPvi", "Brian Fadhili"],
  ["11h4GSzeNpV6rwwtMFTQjW8KWSh_SxWKc", "Maxwell Ndiritu"],
  ["1P92fPmCpdGL8zOf1bDa2nCfuIN4n0MDP", "Deborah Naliaka"],
  ["1CVlR4ZLHjYvZooNHVFFVtIb6oVBJnZcT", "Mike Kimeu"],
  ["1Zgm_Krb3LCNdLkJWNqE_2jCjyEQCh9Iz", "John Maina"],
  ["1P3z6RYiKwcV3JUvBmdHPPMkSVSruIiNA", "Brian Makori"],
  ["15w_mhknCuAagAaBvslxZRJrI5Ia5FXhe", "Peter Kinyanjui"],
  ["1ikt8a8iQyFH3lRni9FvvaslqMZZzHNyU", "Francis Mwai"],
  ["1db7UJhrOWmfrNprGDpPsVfWaMtrWGxto", "Josphat Mukandu"],
  ["1Inf8kdWx5iJ7HDLJkASWXjvlA-FuvPxa", "Phillip Bundi"],
  ["12isk115n3dIiAggiiqL7vuTUmI-EK-M-", "Paul Okech"],
];

async function driveToken() {
  const now = Math.floor(Date.now() / 1000);
  const hdr = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const clm = Buffer.from(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/drive.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })).toString("base64url");
  const sig = crypto.sign("RSA-SHA256", Buffer.from(`${hdr}.${clm}`), sa.private_key).toString("base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${hdr}.${clm}.${sig}` }) });
  return (await r.json()).access_token;
}
const norm = (s) => (s || "").toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();

const bens = await (await fetch(`${URL_}/rest/v1/beneficiaries?select=id,full_name,category,photo_asset_id&category=ilike.*kwetu*&limit=200`, { headers: H })).json();
const tok = await driveToken();
let ok = 0, skip = 0;
const used = new Set();

for (const [fileId, name] of PHOTOS) {
  // best name match in the Kwetu cohort
  const nn = norm(name);
  let best = null, bestSc = 0;
  for (const b of bens) {
    if (used.has(b.id)) continue;
    const bn = norm(b.full_name);
    let sc = 0;
    const a = new Set(nn.split(" ")), c = new Set(bn.split(" "));
    for (const w of a) if (c.has(w)) sc += 1;
    sc = sc / Math.max(a.size, c.size);
    if (sc > bestSc) { bestSc = sc; best = b; }
  }
  if (!best || bestSc < 0.5) { console.log(`no match: ${name} (${bestSc.toFixed(2)})`); skip++; continue; }
  used.add(best.id);

  // download bytes via service account
  const dl = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, { headers: { authorization: `Bearer ${tok}` } });
  if (!dl.ok) { console.log(`download fail ${name}: ${dl.status}`); skip++; continue; }
  const buf = Buffer.from(await dl.arrayBuffer());
  const path = `beneficiaries/${best.id}.jpg`;

  // upload to private 'assets' bucket (upsert)
  const up = await fetch(`${URL_}/storage/v1/object/assets/${path}`, { method: "POST", headers: { ...H, "Content-Type": "image/jpeg", "x-upsert": "true" }, body: buf });
  if (!up.ok) { console.log(`upload fail ${name}: ${up.status} ${(await up.text()).slice(0, 120)}`); skip++; continue; }

  // replace any prior asset row for this file, then insert fresh
  await fetch(`${URL_}/rest/v1/assets?source_ref=eq.${fileId}`, { method: "DELETE", headers: { ...H, "Content-Type": "application/json" } });
  const ins = await fetch(`${URL_}/rest/v1/assets`, { method: "POST", headers: { ...H, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ type: "photo", title: `${best.full_name} portrait`, storage_path: path, mime: "image/jpeg", source: "drive", source_ref: fileId, consent_required: true, consent_on_file: false, created_by: "drive child photo", brand: "nisria" }) });
  const asset = (await ins.json())[0];
  if (!asset?.id) { console.log(`asset insert fail ${name}`); skip++; continue; }

  await fetch(`${URL_}/rest/v1/beneficiaries?id=eq.${best.id}`, { method: "PATCH", headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ photo_asset_id: asset.id, photo_source: fileId }) });
  console.log(`✓ ${name} -> ${best.full_name} (${(buf.length / 1024).toFixed(0)}KB)`);
  ok++;
}
console.log(`\nattached ${ok}, skipped ${skip}`);
