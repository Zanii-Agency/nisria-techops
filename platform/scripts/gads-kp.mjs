#!/usr/bin/env node
// Keyword Planner historical metrics for Nisria keywords — proves CPC vs the $2 Ad Grants cap.
// Reuses the SAME SA + DWD auth as gads.mjs.
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://googleads.googleapis.com/v22";
const SCOPE = "https://www.googleapis.com/auth/adwords";
const SUBJECT = process.env.NISRIA_ADS_IMPERSONATE || "sasa@nisria.co";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  const b64 = loadEnvVar("GOOGLE_SERVICE_ACCOUNT_B64");
  const j = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  return { client_email: j.client_email, private_key: j.private_key, client_id: j.client_id };
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

const cid = process.argv[2] || "2028365929";
const m = ($) => ($ == null ? null : Number($) / 1e6);

const keywords = [
  // broad head demand pools — where are people actually searching?
  "sponsor a child", "child sponsorship", "sponsor a child africa", "sponsor an orphan",
  "donate to charity", "charity donation", "children's charity", "childrens charity",
  "donate to children", "help children in africa", "orphanage donation", "sponsor a child online",
  "compassion sponsor a child", "world vision sponsor a child", "sponsor a child charity",
  "donate now", "child charity", "african children charity", "donate clothes", "give to charity",
  "monthly donation charity", "education charity", "feed the children", "save the children donate",
];

const tok = await token();
const body = {
  keywords,
  geoTargetConstants: ["geoTargetConstants/2840", "geoTargetConstants/2826"], // US + UK
  language: "languageConstants/1000", // English
  keywordPlanNetwork: "GOOGLE_SEARCH",
};
const r = await fetch(`${API}/customers/${cid}:generateKeywordHistoricalMetrics`, {
  method: "POST",
  headers: { authorization: `Bearer ${tok}`, "developer-token": devToken(), "content-type": "application/json" },
  body: JSON.stringify(body),
});
const text = await r.text();
let j; try { j = JSON.parse(text); } catch { console.error("non-JSON:", text.slice(0, 500)); process.exit(1); }
if (!r.ok) { console.error("HTTP", r.status, JSON.stringify(j, null, 2).slice(0, 1200)); process.exit(1); }

const rows = (j.results || []).map((x) => {
  const km = x.keywordMetrics || {};
  return {
    kw: x.text,
    searches: km.avgMonthlySearches ? Number(km.avgMonthlySearches) : 0,
    comp: km.competition || "-",
    lowBid: m(km.lowTopOfPageBidMicros),
    hiBid: m(km.highTopOfPageBidMicros),
  };
});
rows.sort((a, b) => (a.hiBid || 0) - (b.hiBid || 0));
console.log("kw".padEnd(42), "vol".padStart(7), "comp".padStart(7), "lowBid".padStart(8), "hiBid".padStart(8), "  under$2?");
for (const x of rows) {
  const under = x.hiBid != null && x.hiBid <= 2.0 ? "✅ CHEAP" : (x.lowBid != null && x.lowBid <= 2.0 ? "~ maybe" : "❌ >$2");
  console.log(
    x.kw.padEnd(42),
    String(x.searches).padStart(7),
    String(x.comp).padStart(7),
    (x.lowBid != null ? "$" + x.lowBid.toFixed(2) : "-").padStart(8),
    (x.hiBid != null ? "$" + x.hiBid.toFixed(2) : "-").padStart(8),
    "  " + under
  );
}
