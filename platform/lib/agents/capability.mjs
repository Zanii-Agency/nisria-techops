// Capability catalog + question detector (pure, no I/O, no deps) — the ONE source
// imported by BOTH the specialist runtime (specialists/index.ts) and its wall, so
// the tested logic never drifts from the shipped logic (same pattern as
// compose-claims.mjs / whatsapp-format.mjs).
//
// WHY THIS EXISTS (2026-07-14 incident): "What functions do you have?" routes to the
// General lane, which owns only cross-cutting tools. Left to the model it (1) listed
// just those ~7 and DENIED finance ("I do not have a finance tool"), because no lane
// can see another lane's tools, and (2) flattened the multi-line menu into one run-on
// line. Both are cured deterministically: on a capability question, the General lane
// returns this fixed, pre-formatted catalog verbatim — complete content, real line
// breaks that survive the send seam, no model call to under-list or flatten it.

// Operator-facing menu of EVERYTHING Sasa can do across every lane. Plain language
// only: never a tool name, never a lane name. Keep in sync with the domain manifests.
export const CAPABILITY_CATALOG = `• Money: log and confirm payments, record donations, financial summaries, payroll, and Maisha shop sales and costs.
• People: the team roster, contacts, beneficiaries and their cases, and funding status.
• Tasks and calendar: create, update, complete and remind on tasks, and manage scheduling.
• Programs: Maisha inventory (stock, quantities, Folklore listings) and the donor wishlist.
• Documents and knowledge: find and summarise documents, org facts, grants, and past history.
• Messages: send a WhatsApp to a person, post to a team group, draft emails, newsletters, and thank-yous.
• Resources: save and recall links, articles and clips, the resources vault, and the press library.
• Official documents: put a document on Nisria letterhead as a PDF.`;

// True only for a genuine "what can you do" meta-question. Tight ^...$ anchors plus a
// length cap keep a real ACTION question ("what can you do about the generator?")
// from matching — that must still route to a specialist, not get the menu.
export function isCapabilityQuestion(raw) {
  const t = String(raw || "").trim().toLowerCase().replace(/[?.!]+$/g, "").replace(/\s+/g, " ");
  if (!t || t.length > 70) return false;
  const lead = "(?:hi|hey|hello|so|ok|okay|sasa)?[, ]*";
  const pats = [
    `^${lead}what (?:functions?|features?|capabilit(?:y|ies)|abilities|things) (?:do|can) you (?:have|do|offer|help(?: me)? with)$`,
    `^${lead}what (?:else )?(?:can|do) you do(?: for me| here)?$`,
    `^${lead}what are your (?:capabilities|abilities|functions?|features?)$`,
    `^${lead}what are you (?:capable of|able to do)$`,
    `^${lead}what (?:can|could) you help(?: me)? with$`,
    `^(?:list|show me|tell me)(?: me)? (?:your |all )?(?:functions?|features?|capabilit(?:y|ies)|abilities|what you can do)$`,
  ];
  return pats.some((p) => new RegExp(p).test(t));
}

export function capabilityReply() {
  return `Here is everything I can help you with:\n\n${CAPABILITY_CATALOG}\n\nJust tell me what you need.`;
}
