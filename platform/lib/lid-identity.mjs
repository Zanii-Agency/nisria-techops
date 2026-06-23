// LID-phantom identity decision (KT #380, 727 failure-surface cartography).
// A WhatsApp LID (alternate account id) shares NO digits with the person's real MSISDN, so
// phone-matching cannot link them. The only signal is the NAME — and name-only attach is
// forbidden (two real people can share a name, KT #375). These pure helpers encode the
// identity-SAFE decision, imported by BOTH lib/whatsapp.ts resolveContact AND the wall
// (zero-drift). No DB, no side effects.

// A plausible org MSISDN starts with one of the org country codes and is <= 13 digits.
// A LID (e.g. "53631290212404", 14 digits, no org CC prefix) is NOT one.
export function isOrgMsisdn(digits, ccs) {
  const d = String(digits || "");
  return d.length <= 13 && (ccs || []).some((cc) => d.startsWith(String(cc)));
}

export function normName(n) {
  return String(n || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Given the loosely name-matched candidate contacts ({name, phone, id}), the incoming
// normalized name, and the org country codes, decide:
//   {action:"attach", id} — EXACTLY ONE candidate is an exact-name match holding a real org
//                            number → the LID is that same account, attach to it.
//   {action:"flag",   id} — MORE THAN ONE exact-name+MSISDN match → ambiguous, do NOT
//                            auto-attach (would mis-route); create fresh + flag for merge.
//   {action:"create"}     — no exact-name+MSISDN match → ordinary new contact.
export function resolveLid(candidates, nmKey, ccs) {
  const exact = (candidates || []).filter((c) =>
    normName(c && c.name) === nmKey &&
    (ccs || []).some((cc) => String((c && c.phone) || "").replace(/\D/g, "").replace(/^00/, "").startsWith(String(cc))));
  if (exact.length === 1) return { action: "attach", id: exact[0].id };
  if (exact.length > 1) return { action: "flag", id: exact[0].id };
  return { action: "create" };
}
