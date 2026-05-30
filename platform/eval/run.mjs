// Eval runner: hits /api/_eval with the secret and prints pass/fail.
// Usage: node eval/run.mjs [baseUrl]   (default https://command.nisria.co)
// Run this before trusting any change to the bot.
import { readFileSync } from "node:fs";
const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const base = process.argv[2] || "https://command.nisria.co";
const secret = env.GROUP_BOT_SECRET || "";
const r = await fetch(base + "/api/_eval", { headers: { "x-eval-secret": secret } });
const j = await r.json();
if (j.error) { console.error("ERROR:", j.error, "(http " + r.status + ")"); process.exit(1); }
console.log(`\nEVAL @ ${base}: ${j.passed}/${j.total} cases passed  ${j.allPass ? "ALL PASS" : "FAILURES"}\n`);
for (const c of j.results) {
  console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}`);
  for (const ck of c.checks || []) console.log(`      ${ck.pass ? "ok " : "XX "} ${ck.label}`);
  if (!c.pass) {
    console.log(`      text: ${c.got?.text || c.error || ""}`);
    console.log(`      tools: ${JSON.stringify(c.got?.tools || [])}`);
  }
}
process.exit(j.allPass ? 0 : 1);
