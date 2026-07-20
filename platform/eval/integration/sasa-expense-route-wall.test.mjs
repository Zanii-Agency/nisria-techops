// Payee-less expense route wall (2026-07-01 stale-ingest audit). parsePayment was
// entirely PAYEE-centric: "Log a payment of KES 5000 for office rent" / "paid 3000 for
// fuel" matched NOTHING, fell to the brain, which missed them, and the expense silently
// vanished (5 lost "office rent" messages in the audit). Now an expense keyed by PURPOSE
// stages a record_payment (payee = the purpose label) as a FALLBACK after the payee
// patterns yield nothing — so a named payee ("Pay Mark 2000") never double-stages.
// Uses the REAL parsePaymentAll (zero-drift).
import { parsePaymentAll } from "../../app/api/whatsapp/worker/parsePayment.mjs";
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);
const stages = (s) => (parsePaymentAll(s) || []).filter((p) => p && p.intent === "stage_payment");

// ---- E1: payee-less expenses now stage (the lost class) ----
{
  for (const [s, amt] of [["Log a payment of KES 5000 for office rent", 5000], ["paid 3000 for fuel", 3000], ["record 5000 for airtime", 5000]]) {
    const r = stages(s);
    if (r.length !== 1 || r[0].payload.amount !== amt) fail(`E1 "${s}" must stage one expense of ${amt}, got ${JSON.stringify(r.map((x) => x.payload.amount))}`);
  }
  ok("E1 payee-less expenses (rent/fuel/airtime) now stage a payment");
  // the purpose is captured
  if (stages("Log a payment of KES 5000 for office rent")[0].payload.purpose !== "office rent") fail("E1b the purpose must be captured");
  else ok("E1b expense purpose captured");
}

// ---- E2: a NAMED payee must NOT double-stage (payee pattern wins, no expense fallback) ----
{
  const r = stages("Pay Mark 2000 for transport");
  if (r.length !== 1 || r[0].payload.payee !== "Mark") fail(`E2 "Pay Mark 2000 for transport" must stage exactly once to Mark, got ${JSON.stringify(r.map((x) => x.payload.payee))}`);
  else ok("E2 a named payee stages once (no expense double-stage)");
  const r2 = stages("paid Lucy 5000 ksh for transport");
  if (r2.length !== 1 || r2[0].payload.payee !== "Lucy") fail("E2b 'paid Lucy 5000 for transport' must stage once to Lucy");
  else ok("E2b named-payee verb-first still stages once");
}

// ---- E3: non-expenses do NOT stage (no false positives) ----
{
  for (const s of ["good morning everyone", "what did we pay for rent", "the rent is due next week", "can you check the office rent amount"]) {
    if (stages(s).length) fail(`E3 "${s}" must NOT stage a payment`);
  }
  ok("E3 greetings / questions / statements do not stage");
}

if (process.exitCode) console.error("\nsasa-expense-route-wall: FAIL");
else console.log("\nsasa-expense-route-wall: ALL GREEN");
