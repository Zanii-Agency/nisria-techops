// Silent-miss money net wall (2026-07-01 stale-ingest audit). When the deterministic
// payment regex finds nothing but a message is clearly money-shaped (spend verb + an
// amount) it used to fall to the brain and vanish (5+ lost expenses). Net: a scoped
// Haiku extracts + STAGES a record_payment behind the confirm gate. This wall pins the
// GATE (which messages qualify) and that the net is wired + confirm-gated + income-safe.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);

// mirror of the gate in route.ts (keep in step)
const spend = /\b(?:log(?:ged)?|record(?:ed)?|paid|pay|expense|spent|spend|bought|buy|cost|costs?|bill|fee|charged|sent|disburse[d]?|reimburse[d]?)\b/i;
const shaped = (c) => spend.test(c) && /\b(?:kes|ksh|usd|\$)?\s*\d{2,}(?:[.,]\d+)?\s*(?:kes|ksh|usd|bob|k|\/-|shillings)?\b/i.test(c);
const q = (c) => /\?\s*$/.test(c) || /^\s*(?:what|how\s+much|how\s+many|did|do|does|is|are|was|were|when|where|who|why|which|can|could|should)\b/i.test(c);
const net = (c) => shaped(c) && !q(c);

// ---- S1: money-shaped spend messages the regex misses now hit the net ----
{
  for (const c of ["we spent 5000 on the generator", "paid the landlord 20000", "reimbursed Mark 2000 for data bundles", "bought fuel for 3000"]) {
    if (!net(c)) fail(`S1 "${c}" must reach the silent-miss net`);
  }
  ok("S1 clear spend + amount messages reach the net (incl. the audit reimbursement case)");
}

// ---- S2: questions / statements / greetings do NOT (Haiku cost + no false stage) ----
{
  for (const c of ["how much did we spend on rent?", "what was the fuel cost", "good morning team", "the meeting is at 5", "lets budget 5000 for the trip"]) {
    if (net(c)) fail(`S2 "${c}" must NOT reach the net`);
  }
  ok("S2 questions / statements / greetings / budgeting do not reach the net");
}

// ---- S3: the net is wired, confirm-gated, income-safe (anti-drift) ----
{
  const SRC = readFileSync(resolve(HERE, "../../app/api/whatsapp/worker/route.ts"), "utf8");
  if (!/SILENT-MISS NET — MONEY/.test(SRC)) fail("S3a silent-miss net block missing");
  else ok("S3a silent-miss money net present");
  if (!/ex\.is_income !== true/.test(SRC)) fail("S3b net must exclude income (money received)");
  else ok("S3b net excludes income");
  if (!/kind: "record_payment", status: "awaiting_confirm"/.test(SRC)) fail("S3c net must STAGE behind the confirm gate, never auto-commit");
  else ok("S3c net stages (awaiting_confirm) — commit still needs a strict yes");
  if (!/sasa\.payment_silent_miss_staged/.test(SRC)) fail("S3d net staging must be observable");
  else ok("S3d net emits an observable event");
  if (!/opRank === "owner" \|\| opRank === "founder"/.test(SRC.split("SILENT-MISS NET")[1] || "")) fail("S3e net must be owner/founder only");
  else ok("S3e net is owner/founder only");
}

if (process.exitCode) console.error("\nsasa-silent-miss-net-wall: FAIL");
else console.log("\nsasa-silent-miss-net-wall: ALL GREEN");
