// RECEIPT CORE (Option-B honest spine, Slice 1: the relay). Pure, dependency-free
// logic shared by lib/receipts.ts (the DB wiring) and the wall (zero-drift, the
// agent-clock pattern). NO imports, NO side effects, so the .ts and the test can
// never diverge on the honesty rule.
//
// The rule (evidence binding, ADR-0016): Sasa may CLAIM a relay only if this turn
// a relay tool actually DELIVERED with a real provider receipt (a WhatsApp wamid).
// Not a free-floating boolean, the wamid. No receipt, no claim.

// The tools that perform a 1:1 relay/send this turn.
export const RELAY_TOOLS = new Set(["relay_to_colleague", "message_person"]);

// A completed-relay claim in the bot's reply. Conservative: only phrasings that
// assert the relay HAPPENED (past tense / done), never a question or an offer.
// This only ever TRIGGERS the check; a real relay (proof present) is never
// substituted no matter the wording (so the innocent-word misfire class dies).
export const RELAY_CLAIM_RE =
  /\b(passed (?:it|that|this|them|your message)\b|relayed\b|forwarded (?:it|that|your message)\b|sent (?:it|that|the message|your message) to\b|i(?:'ve| have)? (?:told|messaged|pinged)\s+\p{L}|let\s+\p{L}[\p{L} .'’-]{0,30}?\s+know\b)/iu;

// The verifier. Returns proof that a relay was delivered this turn, or null.
// kind:"wamid"   = a real WhatsApp message id (the strict, re-checkable receipt).
// kind:"template"= Phase-1 CARVE-OUT: the operator off-window operator_update
//   template. It is a REAL send (delivered:true is set only on the template's
//   own ok), but pushOperatorUpdate does not yet surface the template's wamid, so
//   Slice 1 cannot capture it as a stored receipt. Documented limit, NOT a faked
//   receipt (providerId stays null). Hardening = surface the template wamid.
export function relayProof(toolRuns) {
  for (const t of toolRuns || []) {
    if (!t || !RELAY_TOOLS.has(t.name)) continue;
    const r = t.result || {};
    const d = r.detail || {};
    if (r.ok === true && d.delivered === true && d.receipt_id) {
      return { providerId: String(d.receipt_id), to: d.to || null, kind: "wamid" };
    }
    if (r.ok === true && d.delivered === true && d.via === "template") {
      return { providerId: null, to: d.to || null, kind: "template" };
    }
    // Dedup: the relay was ALREADY sent on an earlier turn (the handler refused to
    // double-send). "Already sent that to X" is an honest reference to a prior
    // receipt, not a fresh unproven claim, so it must not be substituted.
    if (r.ok === true && d.deduped === true) {
      return { providerId: null, to: d.to || null, kind: "dedup" };
    }
  }
  return null;
}

// Strict wamid receipt only (what the diary / ledger persists). Null for the
// template carve-out (nothing re-checkable to store yet).
export function verifyRelayReceipt(toolRuns) {
  const p = relayProof(toolRuns);
  return p && p.kind === "wamid" ? { providerId: p.providerId, to: p.to } : null;
}

// THE GATE: the reply asserts a relay happened, but NO delivery proof backs it this
// turn. Covers both lie shapes: (a) a relay tool ran but did NOT deliver (send
// failed / off-window / no wamid), and (b) no relay tool ran at all (the model
// "forgot" to call it and still claimed success). Either way: unproven, must not
// ship as a done claim.
export function claimsRelayWithoutReceipt(reply, toolRuns) {
  if (!reply || !RELAY_CLAIM_RE.test(String(reply))) return false;
  return relayProof(toolRuns) === null;
}

// Build a stored receipt from a relay tool result (for recordReceipt / the ledger).
// Returns null when there is no re-checkable wamid to record.
export function receiptFromRelay({ turnId, toolName, result, recipientId }) {
  const d = (result && result.detail) || {};
  if (!(result && result.ok === true && d.delivered === true && d.receipt_id)) return null;
  return {
    turn_id: turnId || null,
    action: "relay",
    tool: toolName || null,
    recipient_id: recipientId || null,
    recipient_last4: d.to_last4 || null,
    provider: "whatsapp",
    provider_id: String(d.receipt_id),
  };
}
