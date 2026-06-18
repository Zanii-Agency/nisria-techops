// SEAM EVAL — enforce Sasa's deliberate brain-core drift.
//
// Sasa does NOT use brain-core's shouldProcess / webhook-guard dedup. It has
// its own atomic INSERT dedup on messages.external_id (partial UNIQUE INDEX).
// This test fails if anyone wires shouldProcess into the webhook route.
//
// Run with:
//   node eval/integration/seam-10-brain-core-drift.test.mjs
//
// Exit code is 0 only if all checks pass.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PLATFORM = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => readFileSync(resolve(PLATFORM, rel), "utf8");

const tests = [];
function check(name, fn) { tests.push({ name, fn }); }

check("seam.10.01 webhook ingress does NOT import shouldProcess", () => {
  const src = read("app/api/whatsapp/webhook/route.ts");
  if (/shouldProcess/.test(src)) return "shouldProcess imported in webhook route (would double-dedup)";
  return null;
});

check("seam.10.02 webhook ingress does NOT import webhook-guard", () => {
  const src = read("app/api/whatsapp/webhook/route.ts");
  if (/webhook-guard/.test(src)) return "webhook-guard module imported in webhook route";
  return null;
});

check("seam.10.03 webhook ingress uses atomic INSERT dedup (external_id unique index)", () => {
  const src = read("app/api/whatsapp/webhook/route.ts");
  // The critical pattern: insert messages row, then check for unique violation
  if (!/from\(["']messages["']\)\.insert/.test(src)) return "no messages.insert call in webhook (dedup not present)";
  if (!/duplicate key|unique/i.test(src)) return "no unique-violation check after insert (non-atomic dedup)";
  return null;
});

check("seam.10.04 BRAIN-CORE-DRIFT.md exists in lib/brain-core", () => {
  const src = read("lib/brain-core/BRAIN-CORE-DRIFT.md");
  if (!src || !src.includes("Sasa does NOT import")) return "drift doc missing or does not state the drift";
  return null;
});

check("seam.10.05 send-chokepoint.ts fail-closed on persist error (v0.9.1)", () => {
  const src = read("lib/brain-core/send-chokepoint.js");
  if (!/persist failed before send/.test(src)) return "send-chokepoint does not fail-closed on persist error (stale brain-core sync)";
  return null;
});

let pass = 0, fail = 0;
const results = [];
for (const t of tests) {
  let reason = null;
  try { reason = t.fn(); } catch (e) { reason = `threw: ${e?.message || e}`; }
  if (reason === null) { pass++; results.push({ name: t.name, ok: true }); }
  else { fail++; results.push({ name: t.name, ok: false, reason }); }
}

const W = Math.max(...results.map((r) => r.name.length)) + 2;
console.log("");
console.log("Sasa brain-core drift seam eval — " + new Date().toISOString());
console.log("=".repeat(W + 14));
for (const r of results) {
  const mark = r.ok ? "✓ PASS" : "✗ FAIL";
  console.log(`${mark}  ${r.name.padEnd(W)} ${r.ok ? "" : "  → " + r.reason}`);
}
console.log("=".repeat(W + 14));
console.log(`${pass}/${tests.length} pass${fail ? `, ${fail} fail` : ""}`);
process.exit(fail ? 1 : 0);
