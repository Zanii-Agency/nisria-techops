// Send name-variant honesty wall (2026-06-22, KT #369). LIVE 22 Jun 10:26pm: Nur asked
// Sasa to "Send it to Malek as well." The bot DID send (Malek received it), but the
// contact resolved as "Malieng" while the model narrated "Messaged Malek" — the honesty
// guard matched recipients by EXACT token, so "malek" != "malieng" → it falsely corrected
// a DELIVERED send into HONEST_NO_SEND. Nur thought it failed; the bot re-sent 3× and
// spammed Malek ("Malek did receive the message whats this about lol aftr all that work").
//
// Fix: the COUNT of real person-sends is the truth, not the name spelling. A claimed name
// with no exact match is covered by an otherwise-unaccounted-for successful send this turn
// (a `pool`). This still catches the multi-send LIE ("Sent to Violet. Cynthia has it." with
// only Violet sent): Violet consumes the one send, Cynthia finds an empty pool → flagged.
//
// The behavioural verdicts here mirror the deployed claimsSendWithoutSend contract exactly;
// the prod /api/gym guardcheck proves the same on the live bundle.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SASA = fs.readFileSync(path.resolve(HERE, "..", "..", "lib", "agents", "sasa.ts"), "utf8");
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);

// Faithful local mirror of the guard's recipient-matching contract (exact ∪ pool).
// Kept identical to the code; the V-seam below pins the code to this shape, and the
// prod guardcheck proves the deployed function agrees.
const SEND_CLAIM = /\b(?:sent|messaged|texted|pinged|notified|told|let\b.*\bknow|reached out|shared it with|messaged)\b/i;
const SEND_HAS = /\b\w+\s+(?:has|have|received|got)\s+(?:the\s+(?:task|message|reminder|note)|it now)\b/i;
function flagged(reply, sentNames /* array of sent recipient tokens */) {
  const sentRecipients = new Set(sentNames.map((s) => s.toLowerCase()));
  let pool = sentNames.length;
  const sentences = String(reply).split(/[.!?]+\s+/).filter((s) => s.trim());
  for (const s of sentences) {
    if (!(SEND_CLAIM.test(s) || SEND_HAS.test(s))) continue;
    if (/\b(i will|i'?ll|want me to|haven'?t|have not|not yet)\b/i.test(s)) continue;
    const claimed = (s.match(/\b[A-Z][a-z]{2,}\b/g) || [])
      .map((w) => w.toLowerCase())
      .filter((w) => !["done","sent","messaged","told","whatsapp","with","the","link","and","context","also","hi"].includes(w));
    if (claimed.length === 0) { if (pool === 0) return true; continue; }
    for (const c of claimed) {
      if (sentRecipients.has(c)) { pool = Math.max(0, pool - 1); continue; }
      if (pool > 0) { pool -= 1; continue; }
      return true;
    }
  }
  return false;
}
const T = (got, want, m) => (got === want ? ok(m) : fail(`${m} (got ${got}, want ${want})`));

// ---- V1: the exact live bug — a real send to "Malieng" narrated as "Malek" ----
T(flagged("Done. Messaged Malek on WhatsApp with the link and context.", ["Malieng"]), false,
  "V1a 'Messaged Malek' over a real send to Malieng is NOT flagged (the live bug)");
T(flagged("Done. Messaged Malieng on WhatsApp with the link and context.", ["Malieng"]), false,
  "V1b exact-name match is fine");
T(flagged("I have shared it with them.", ["Malieng"]), false,
  "V1c an unnamed claim over a real send is fine");

// ---- V2: the multi-send LIE must STILL be caught (no over-suppression) ----
T(flagged("Sent it to Violet. Cynthia has the message.", ["Violet"]), true,
  "V2a 'Sent Violet, Cynthia has it' with ONLY Violet sent → still flagged (Cynthia lie)");
T(flagged("Messaged Mark and Grace.", []), true,
  "V2b a send claim with ZERO sends → flagged");
T(flagged("Messaged Mark and Grace.", ["Mark", "Grace"]), false,
  "V2c both named, both sent → not flagged");
T(flagged("Messaged Malek and Grace.", ["Malieng"]), true,
  "V2d variant Malek covered by the one send, Grace finds empty pool → flagged");

// ---- V3: the deployed guard carries the pool contract (seam) ----
{
  const i = SASA.indexOf("function claimsSendWithoutSend");
  const region = i >= 0 ? SASA.slice(i, i + 4400) : "";
  if (!/let personSendCount = 0;/.test(region)) fail("V3a must count successful person-sends");
  else ok("V3a counts successful person-sends");
  if (!/personSendCount\+\+;/.test(region)) fail("V3b must increment the count per person-send");
  else ok("V3b increments per person-send");
  if (!/let pool = personSendCount;/.test(region)) fail("V3c must seed the pool from the send count");
  else ok("V3c seeds the pool from the send count");
  if (!/if \(pool > 0\) \{ pool -= 1; continue; \}/.test(region)) fail("V3d an unmatched claim consumes a spare send (name-variant cover)");
  else ok("V3d an unmatched claim consumes a spare send");
}

if (process.exitCode) console.error("\nWALL RED.");
else console.log("\nWALL GREEN.");
