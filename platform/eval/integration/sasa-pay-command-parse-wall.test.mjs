// VERB-FIRST PAYMENT PARSE wall (2026-06-26). End-to-end on prod proved the gap: a clear
// "pay Lucy 5000 ksh" never staged — the model narrated "ready to log" without calling
// record_payment, and the backstop parser (built for pasted M-Pesa/Sendwave receipts)
// did not understand a conversational command. Fix: a verb-first pattern in parseChatLogAll
// so the deterministic backstop stages a clear payment command even when the model skips
// the tool (rails: don't depend on the model to call its own tool). Pure-logic wall.
import { parseChatLogAll } from "../../app/api/whatsapp/worker/parsePayment.mjs";
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);
const one = (t) => { const r = parseChatLogAll(t); return Array.isArray(r) && r.length ? r[0] : null; };

// ---- P1: conversational payment commands now parse ----
{
  const cases = [
    ["pay Lucy 5000 ksh for transport", "Lucy", 5000, "KES"],
    ["paid Mark 15000", "Mark", 15000, "KES"],
    ["pay Mark KES 15000 salary", "Mark", 15000, "KES"],
    ["transfer Mary Kafua 180000 for sheep", "Mary Kafua", 180000, "KES"],
    ["pay Dorcas USD 200", "Dorcas", 200, "USD"],
  ];
  for (const [text, payee, amount, cur] of cases) {
    const p = one(text);
    if (!p) { fail(`P1 "${text}" must parse`); continue; }
    const okPayee = (p.payload.payee || "").toLowerCase().includes(payee.toLowerCase());
    if (p.payload.amount === amount && okPayee && p.payload.currency === cur) ok(`P1 "${text}" -> ${p.summary}`);
    else fail(`P1 "${text}" wrong: ${JSON.stringify(p.payload)} (want ${payee}/${amount}/${cur})`);
  }
}

// ---- P2: currency token is never absorbed into the payee ----
{
  const p = one("pay Mark KES 15000 salary");
  if (p && !/kes/i.test(p.payload.payee)) ok("P2 currency not eaten into payee");
  else fail(`P2 currency leaked into payee: ${p && p.payload.payee}`);
}

// ---- P3: non-payments must NOT parse (no false money rows) ----
{
  const negs = ["send Mark the report", "give me 5 forms to fill", "remind me to pay rent", "pay attention to this"];
  for (const t of negs) {
    if (!one(t)) ok(`P3 "${t}" correctly ignored`);
    else fail(`P3 "${t}" must NOT parse as a payment`);
  }
}

// ---- P4: the parsed shape is the staging contract the backstop expects ----
{
  const p = one("pay Lucy 5000");
  if (p && p.intent === "stage_payment" && p.payload && typeof p.summary === "string") ok("P4 parsed shape matches the staging contract");
  else fail("P4 parsed shape missing intent/payload/summary");
}
