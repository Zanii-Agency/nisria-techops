// RECEIPT CORE (Option-B honest spine, Slice 1: the relay). Pure, dependency-free
// logic shared by lib/receipts.ts (the DB wiring) and the wall (zero-drift, the
// agent-clock pattern). NO imports, NO side effects, so the .ts and the test can
// never diverge on the honesty rule.
//
// The rule (evidence binding, ADR-0016): Sasa may CLAIM a relay only if this turn
// a relay tool actually DELIVERED with a real provider receipt (a WhatsApp wamid),
// AND the receipt is bound to the recipient the claim names. No receipt, no claim.
//
// 2026-07-04 skeptic rework (BLOCK verdict on v1): per-sentence gating with a
// negation/offer/future guard (v1 stomped "Let me know if..." and honest denials),
// a much wider claim-shape set (v1 missed the tool's own "Sent to Mark."), proof
// bound to the claimed NAME (v1 let a receipt for Mark launder "I told Grace"),
// and the dedup carve-out excludes held/queued turns (v1 let `deduped` on a
// queued intent prove a "sent" lie).

// The tools that perform a 1:1 relay/send this turn.
export const RELAY_TOOLS = new Set(["relay_to_colleague", "message_person"]);

// Completed-relay claim shapes, tested PER SENTENCE (after NOT_A_CLAIM excludes
// questions/offers/negations/futures). Broad on purpose: with proof present a
// claim is never substituted, so the only cost of breadth is on unproven turns,
// exactly where breadth is the point.
export const CLAIM_SHAPES = [
  /\bpassed (?:it|that|this|them|the message|your message)\b/i,
  /\brelayed\b/i,
  /\bforwarded(?:\s+(?:it|that|this|the message|your message))?\s+to\b/i,
  /\bsent(?:\s+(?:it|that|this|him|her|them|the message|your message))?\s+to\s+\p{L}/iu, // "Sent to Mark", "sent it to Mark"
  /\b(?:[Ii]|[Ww]e)(?:'ve| have)?\s+(?:[Jj]ust\s+|[Aa]lso\s+)?sent\s+[A-Z][\p{L}'’-]*\s+(?:your|the|a|that|this|my|our)\b/u, // "I sent Mark your message" (no /i: the [A-Z] name must stay case-sensitive)
  /\bmessage (?:was |has been )?(?:sent|delivered|forwarded)\b/i,
  /\b(?:i|we)(?:'ve| have)?\s+(?:just\s+|also\s+)?(?:told|texted|messaged|pinged|notified|informed)\s+\p{L}/iu,
  /\blet\s+(?!me\b|us\b|you\b)\p{L}[\p{L} .'’-]{0,30}?\s+know\b/iu, // C1: never "let me/us/you know"
  /\b(?:has been|have been|was|were|got)\s+(?:notified|informed|told|messaged)\b/i,
  /\bdelivered(?:\s+(?:it|that|the message|your message))?\s+to\b/i,
  /\bgot your message\b/i,
];

// A sentence that is NOT a this-turn completion claim: questions, offers,
// negations, futures/capabilities, and prior-turn references ("yesterday",
// "already"). Bias: over-excluding lets a rare lie escape to the DOWNSTREAM
// guards (claimsSendWithoutSend still runs); under-excluding stomps honest
// replies, the misfire class this spine exists to kill. So bias to exclude.
export const NOT_A_CLAIM =
  // NB: the 'll contractions REQUIRE the apostrophe (straight or curly): an
  // optional one made \bwe'?ll\b match the word "well" and \bi'?ll\b match
  // "ill". Bare "I will"/"we will" are caught by \bwill\b already.
  /\?\s*$|\b(?:not|never|haven'?t|hasn'?t|didn'?t|don'?t|won'?t|cannot|can'?t|couldn'?t)\b|\b(?:will|would|can|could|shall|should|may|might|going to|about to|planning|want me|need me|do you want|if you(?:'d| would| want| like)?|once|ready to)\b|\b(?:i|we)(?:'|’)ll\b|\b(?:yesterday|earlier|last (?:week|month|night|time)|ago|already)\b/i;

// Names a claim sentence points at ("to Mark", "told Grace", "let Violet know").
// Capitalized tokens only; pronouns/articles excluded.
const NAME_AFTER = /\b(?:to|told|texted|messaged|pinged|notified|informed|let|sent)\s+([A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+)?)/gu;
const NOT_NAMES = /^(?:Me|Us|You|Him|Her|Them|It|The|A|An|My|Our|Your|Their|Everyone|Nobody)$/i;
const NAME_CHAIN = /^\s*(?:,\s*|and\s+|&\s*)([A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+)?)/u;
export function claimedNamesIn(sentence) {
  const s = String(sentence || "");
  const names = [];
  for (const m of s.matchAll(NAME_AFTER)) {
    const n = m[1].replace(/\s+know$/i, "").trim();
    if (n && !NOT_NAMES.test(n)) names.push(n);
    // Conjunction chain after the first name: "to Mark and Aisha", "told Mark,
    // Grace and Violet" — every listed recipient must be proof-covered.
    let rest = s.slice((m.index ?? 0) + m[0].length);
    let cm;
    while ((cm = NAME_CHAIN.exec(rest))) {
      const cn = cm[1].replace(/\s+know$/i, "").trim();
      if (cn && !NOT_NAMES.test(cn)) names.push(cn);
      rest = rest.slice(cm[0].length);
    }
  }
  return names;
}

// All delivery proofs this turn.
// kind:"wamid"    = a real provider message id (strict, re-checkable, stored).
// kind:"template" = operator off-window template delivery; real send (gated on
//   the template's own id upstream), receipt_id carried when surfaced.
// kind:"dedup"    = the handler refused to double-send because THIS message
//   already went out earlier (an honest reference to a prior receipt). H4: a
//   held/queued intent also sets `deduped` on conflict, so the dedup proof
//   requires delivered !== false (queued turns say delivered:false explicitly).
export function relayProofs(toolRuns) {
  const proofs = [];
  for (const t of toolRuns || []) {
    if (!t || !RELAY_TOOLS.has(t.name)) continue;
    const r = t.result || {};
    const d = r.detail || {};
    if (r.ok !== true) continue;
    if (d.delivered === true && d.receipt_id) proofs.push({ providerId: String(d.receipt_id), to: d.to || null, kind: "wamid" });
    else if (d.delivered === true && d.via === "template") proofs.push({ providerId: null, to: d.to || null, kind: "template" });
    else if (d.deduped === true && d.delivered !== false) proofs.push({ providerId: null, to: d.to || null, kind: "dedup" });
  }
  return proofs;
}
export function relayProof(toolRuns) {
  const p = relayProofs(toolRuns);
  return p.length ? p[0] : null;
}

// Strict wamid receipt only (what the diary / ledger persists).
export function verifyRelayReceipt(toolRuns) {
  const p = relayProofs(toolRuns).find((x) => x.kind === "wamid");
  return p ? { providerId: p.providerId, to: p.to } : null;
}

// Loose first-token name match ("Mark" ~ "Mark Njambi").
function nameMatchesProof(name, proofs) {
  const first = String(name || "").toLowerCase().split(/\s+/)[0];
  if (!first) return true; // no extractable name: turn-scoped proof suffices
  return proofs.some((p) => String(p.to || "").toLowerCase().split(/\s+/)[0] === first);
}

// THE GATE, per sentence: the reply asserts a relay happened, and either NO
// delivery proof exists this turn, or the claim names someone no proof covers
// (H3: a receipt for Mark must not launder "I told Grace"). Covers both lie
// shapes: the tool ran but did not deliver, and the model never ran the tool.
export function claimsRelayWithoutReceipt(reply, toolRuns) {
  const text = String(reply || "");
  if (!text.trim()) return false;
  const proofs = relayProofs(toolRuns);
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const s of sentences) {
    if (NOT_A_CLAIM.test(s)) continue;
    if (!CLAIM_SHAPES.some((re) => re.test(s))) continue;
    if (proofs.length === 0) return true;
    const names = claimedNamesIn(s);
    if (names.length && !names.every((n) => nameMatchesProof(n, proofs))) return true;
  }
  return false;
}

// Build a stored receipt from a relay tool result (for recordReceipt / the ledger).
// Returns null when there is no re-checkable provider id to record.
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
