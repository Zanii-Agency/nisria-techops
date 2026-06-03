#!/usr/bin/env node
// FIX: Nisria Ad Grants zero-impression deadlock.
// Root cause (proven via Keyword Planner): (1) existing keywords have ~0 search volume,
// (2) real-demand terms cost $6-$30 CPC but Max-Clicks caps bids at $2 → 0 impressions.
// Fix: switch to MAXIMIZE_CONVERSIONS (exempt from $2 cap) + add real-volume keywords.
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://googleads.googleapis.com/v22";
const SCOPE = "https://www.googleapis.com/auth/adwords";
const SUBJECT = process.env.NISRIA_ADS_IMPERSONATE || "sasa@nisria.co";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cid = process.argv[2] || "2028365929";
const DRY = process.argv.includes("--dry");

function loadEnvVar(name) {
  if (process.env[name]) return process.env[name];
  for (const f of [".env.local", ".env.seed", ".env"]) {
    const p = path.join(__dirname, "..", f);
    if (!fs.existsSync(p)) continue;
    const line = fs.readFileSync(p, "utf8").split(/\r?\n/).find((l) => l.startsWith(name + "="));
    if (line) return line.slice(name.length + 1).replace(/^["']|["']$/g, "");
  }
  return null;
}
function devToken() {
  if (process.env.GOOGLE_ADS_DEVELOPER_TOKEN) return process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  return execSync('security find-generic-password -a "nisria-google-ads-dev-token" -w', { encoding: "utf8" }).trim();
}
function sa() {
  const j = JSON.parse(Buffer.from(loadEnvVar("GOOGLE_SERVICE_ACCOUNT_B64"), "base64").toString("utf8"));
  return { client_email: j.client_email, private_key: j.private_key };
}
async function token() {
  const s = sa();
  const nowS = Math.floor(Date.now() / 1000);
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const claim = { iss: s.client_email, sub: SUBJECT, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: nowS, exp: nowS + 3600 };
  const input = `${b64u({ alg: "RS256", typ: "JWT" })}.${b64u(claim)}`;
  const sig = crypto.sign("RSA-SHA256", Buffer.from(input), s.private_key).toString("base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${input}.${sig}` }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`token mint failed: ${j.error} ${j.error_description}`);
  return j.access_token;
}
const tok = await token();
const H = { authorization: `Bearer ${tok}`, "developer-token": devToken(), "content-type": "application/json" };
async function mutate(endpoint, operations, label) {
  if (DRY) { console.log(`  [dry] ${label}: ${operations.length} op(s)`); return; }
  const r = await fetch(`${API}/customers/${cid}/${endpoint}:mutate`, {
    method: "POST", headers: H, body: JSON.stringify({ operations, partialFailure: true }),
  });
  const text = await r.text(); let j; try { j = JSON.parse(text); } catch { j = null; }
  if (!r.ok) { console.error(`  ❌ ${label}: HTTP ${r.status}\n${(text || "").slice(0, 800)}`); return; }
  const results = (j.results || []).filter((x) => x && x.resourceName).length;
  const pf = j.partialFailureError;
  console.log(`  ✅ ${label}: ${results} succeeded${pf ? ` (some skipped: ${(pf.message || "").slice(0,120)})` : ""}`);
}

// ---- 1. Switch all 3 ENABLED campaigns to MAXIMIZE_CONVERSIONS (escapes $2 cap) ----
const CAMPAIGNS = ["23904343810", "23904343813", "23904343816"]; // Brand, Sponsor, Donate
console.log("STEP 1 — switch bidding → Maximize Conversions (no $2 cap):");
await mutate("campaigns",
  CAMPAIGNS.map((id) => ({
    update: { resourceName: `customers/${cid}/campaigns/${id}`, maximizeConversions: {} },
    updateMask: "maximize_conversions",
  })),
  "bidding strategy");

// ---- 2. Add real-demand keywords to the right ad groups ----
// AG ids: Brand 197974518678 | Sponsor: Kenya 197974518718, Monthly 197974518878,
//   General 197974518918, EduSpon 197974518958 | Donate: Charity 197974519118,
//   KenyaAfrica 197974519158, EduDon 197974519198
const P = "PHRASE", B = "BROAD";
const KW = [
  // Sponsor a Child — real volume: "sponsor a child" 5,400 ; "sponsor an orphan" 1,300
  ["197974518918", "sponsor a child", B], ["197974518918", "sponsor a child", P],
  ["197974518918", "sponsor a child online", P], ["197974518918", "sponsor a child charity", P],
  ["197974518718", "sponsor an orphan", B], ["197974518718", "sponsor an orphan", P],
  ["197974518878", "child sponsorship", P], ["197974518878", "monthly child sponsorship", P],
  ["197974518958", "sponsor a child education", P],
  // Donate — "donate to charity" 5,400 ; "charity donation" 12,100 ; "feed the children" 8,100
  ["197974519118", "donate to charity", B], ["197974519118", "donate to charity", P],
  ["197974519118", "charity donation", P], ["197974519118", "childrens charity donation", P],
  ["197974519158", "feed the children", P], ["197974519158", "orphanage donation", P],
  ["197974519158", "help children in africa", P], ["197974519158", "donate to children", P],
  // Education Donation — "education charity" 1,000 ($2 low entry) ; "donate now" 880
  ["197974519198", "education charity", P], ["197974519198", "donate now", P],
  ["197974519198", "give to charity", P],
];
console.log("\nSTEP 2 — add real-demand keywords (real search volume, vs the dead ones):");
await mutate("adGroupCriteria",
  KW.map(([ag, text, matchType]) => ({
    create: { adGroup: `customers/${cid}/adGroups/${ag}`, status: "ENABLED", keyword: { text, matchType } },
  })),
  `${KW.length} keywords`);

console.log("\nDone. Next: verify bidding + new keywords serving status.");
