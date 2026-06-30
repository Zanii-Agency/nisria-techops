// Read-vs-write intent classifier. Pure function, no side effects, no deps.
// Used by lib/agents/sasa.ts to pick which HONEST_NO_FIGURE / LOOP_BREAK
// rewrite fires. Lives in its own .mjs so the unit test
// (eval/unit/intent.test.mjs) can import without a TS toolchain.

// Read imperatives + interrogative openers. Question-shape always wins over
// any write-verb present inside the sentence ("Any payments logged?" hits
// 'logged' as a noun but is a READ because it opens with 'any' and ends in '?').
// v1.3.11.6: pull/get/fetch/grab/bring/give/share added as explicit READ
// imperatives so the classification doesn't rely on the WRITE_INTENT_RE miss.
// Note: `tell\s+me` matches READ ("tell me what Mark said"). "Tell <person>"
// without "me" is a SEND and is handled by SEND_INTENT_RE below.
export const QUESTION_SHAPE_RE = /^\s*(?:what|where|which|who|whose|when|how|why|any|show|list|find|tell\s+me|do\s+you|did\s+you|have\s+you|has\s+anyone|is\s+there|are\s+there|can\s+you|pull(?:\s+up)?|get\s+me|fetch|grab|bring\s+me|give\s+me|share)\b/i;
export const WRITE_INTENT_RE = /\b(?:log(?:ged)?|record(?:ed)?|stage|file|add|i\s+(?:paid|sent|owe|gave|made)|payment|register|book|enter)\b/i;

// v1.3.11.10 (2026-06-15 Nur incident): SEND-intent detector. The LOOP_BREAK_READ
// canned line fired three times today when Nur was asking Sasa to SEND a message
// (to Mark / Violet / Cynthia), and her input got mis-classified as a READ
// (because it carried no write-verb and no question-shape, so the default-read
// fallback won). The negative-list below treats outbound-comm verbs and
// confirmation replies to send-prompts as NOT a read, so the loop-break (which
// asks "tell me in one line what you're looking for") never offers to "pull"
// when the user wanted to send.
//
// Scope: outbound communication verbs directed at a third party. Excludes
// "tell me" and "remind me" via negative-lookahead so READ openers still win.
export const SEND_INTENT_RE = new RegExp(
  [
    // send / send to / re-send
    "\\b(?:re-?)?send(?:s|ing|\\s+(?:to|him|her|them|it|message|msg|email|reply|note|sms|whatsapp))?\\b",
    // message <person/them> / text <person/them> / whatsapp <person/them>
    "\\b(?:message|text|whatsapp|wa|sms|email|mail|dm|ping)(?:\\s+(?:him|her|them|to|back|now))?\\b",
    // tell <person> (NOT "tell me" — that's a READ via QUESTION_SHAPE_RE).
    // We negative-lookahead "me" so "tell me" still classifies as READ.
    "\\btell\\s+(?!me\\b)(?:him|her|them|[A-Z][a-z]+|nur|mark|violet|cynthia|dorcas|linda|stephen|jensen)\\b",
    // let <person> know
    "\\blet\\s+(?:him|her|them|nur|[A-Z][a-z]+)\\s+know\\b",
    // remind <person> (NOT "remind me" — caught earlier so "remind me" stays
    // outside the SEND lane and acts as task-create elsewhere).
    "\\bremind\\s+(?!me\\b)(?:him|her|them|nur|[A-Z][a-z]+)\\b",
    // forward / fwd
    "\\b(?:forward|fwd)(?:\\s+(?:to|him|her|them|it))?\\b",
    // reply / respond / reach out / write to / hit up / drop (them) a line
    "\\b(?:reply|respond|reach\\s+out|write\\s+(?:to|back)|hit\\s+up|drop\\s+(?:him|her|them)\\s+a\\s+line)\\b",
  ].join("|"),
  "i",
);

// Bare confirmation replies that, in the context of a prior SEND-prompt, are
// CONFIRMATIONS of a send (not reads). Kept tight: only the most common shapes
// in English / Swahili / emoji. The recent-turn context check below is what
// decides if these flip from read-default to send-confirmation.
const BARE_CONFIRM_RE = /^\s*(?:y|ya|ye|yes|yea|yeah|yep|yup|ok|okay|k|kk|sure|fine|cool|great|good|gd|do\s+it|go\s+ahead|please\s+do|do\s+so|send\s+it|send|👍|✅|✓|sawa|ndio|naam|aiwa)\s*[.!]?\s*$/i;

// What the assistant says to PROPOSE a send-action. If the most recent assistant
// turn matches this, treat the next user reply (especially a short or bare
// confirmation) as inheriting SEND-intent — not a fresh READ.
// v1.3.11.11 (2026-06-15 Nur test 2): "say" was missing from the send-prompt
// verb list. Sasa replied "What would you like me to SAY to Mark?" and the
// next "About the project update" fell through to the default-read fallback,
// shipping LOOP_BREAK_READ again. Added "say" + "ask" + "write to" + the
// passive forms to both prompt and ask patterns.
const PRIOR_SEND_PROMPT_RE = /\b(?:(?:want\s+me\s+to|should\s+i|shall\s+i|do\s+you\s+want\s+me\s+to|would\s+you\s+like\s+me\s+to|can\s+i|shall\s+we|how\s+would\s+you\s+like\s+me\s+to|what\s+(?:would|do|should)\s+you\s+(?:like\s+me\s+to|want\s+me\s+to))\s+(?:send|message|text|whatsapp|sms|email|mail|dm|ping|tell|say|ask|let\s+(?:him|her|them|\w+)\s+know|remind|forward|fwd|reply|respond|reach\s+out|write\s+to|write))\b/i;

// What the assistant says to PROPOSE / ASK ABOUT a send-target (e.g.
// "What would you like me to send Mark?" or "What would you like me to say
// to Mark?"). A short reply after this should inherit SEND-intent, not be
// classified as a read.
const PRIOR_SEND_ASK_RE = /\b(?:send|message|text|whatsapp|sms|email|mail|dm|ping|tell|say|ask|let\s+(?:him|her|them|\w+)\s+know|remind|forward|fwd|reply|reach\s+out|write\s+to)\b/i;
const PRIOR_SEND_ASK_PROMPT_RE = /^\s*(?:what(?:'s| is| would| do)|how|which)\b/i;

function lastAssistantContent(history) {
  if (!Array.isArray(history)) return "";
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m && m.role === "assistant") return String(m.content || "");
  }
  return "";
}

// Detects whether the most recent assistant turn was a send-prompt: either a
// direct "want me to text them now?" question, or a target-elicitation
// ("What would you like me to send Mark?"). Returns true on either shape.
function priorTurnIsSendPrompt(history) {
  const prior = lastAssistantContent(history);
  if (!prior) return false;
  if (PRIOR_SEND_PROMPT_RE.test(prior)) return true;
  // target-elicitation shape: question opener AND a send-verb in the same turn.
  if (PRIOR_SEND_ASK_PROMPT_RE.test(prior) && PRIOR_SEND_ASK_RE.test(prior)) return true;
  return false;
}

// Public API. `history` is optional and backward-compatible — existing callers
// (no second arg) keep the old string-only behavior. New callers pass the
// recent conversation so a bare "Yes" after "Want me to text them?" classifies
// as SEND-confirmation, not a fresh READ.
export function isReadIntent(command, history) {
  const c = String(command || "").trim();
  if (!c) return true;

  // 1) Hard negative-list: if the input contains outbound-comm verbs directed
  //    at a third party, it's an ACTION/SEND, not a read. This wins over
  //    question-shape so "Can you send Mark the STP report?" classifies WRITE.
  if (SEND_INTENT_RE.test(c)) return false;

  // 2) Recent-turn context (new): if the prior assistant turn proposed a SEND
  //    (e.g. "Want me to text them both now?" or "What would you like me to
  //    send Mark?"), then a short / bare-confirmation reply inherits SEND.
  //    "Short" = 6 words or fewer with no question shape. The 6-word ceiling
  //    catches "STP report", "About the new place hunting", "Yes do it now",
  //    "the lease and the receipt", "send him the lease asap" — without
  //    swallowing a fresh long question that happens to come after a send-
  //    prompt.
  if (history && history.length && priorTurnIsSendPrompt(history)) {
    const wordCount = c.split(/\s+/).length;
    if (BARE_CONFIRM_RE.test(c)) return false;
    if (wordCount <= 6 && !/\?\s*$/.test(c) && !QUESTION_SHAPE_RE.test(c)) return false;
  }

  // 3) Existing rules.
  if (/\?\s*$/.test(c)) return true;
  if (QUESTION_SHAPE_RE.test(c)) return true;
  return !WRITE_INTENT_RE.test(c);
}

// Outbound-comm / group-post verbs not already in SEND_INTENT_RE (which is tuned
// for person-directed sends). A group post reads as "post / announce to the group".
const GROUP_POST_RE = /\b(?:post(?:\s+(?:to|in|on))?|announce|broadcast|put\s+(?:it\s+)?(?:in|on)\s+the\s+group)\b/i;

// Is this turn a SEND or group-POST (as opposed to a record-mutation like a
// payment/task/case)? Mirrors the SEND path inside isReadIntent so the loop-break
// can offer "what should I send / post" wording instead of the payment/task/case
// script (2026-06-30 Nur ABSA group-post incident, KT #206540 family). A bare
// confirm or short reply after a send-prompt inherits SEND, same as isReadIntent.
export function isSendIntent(command, history) {
  const c = String(command || "").trim();
  if (!c) return false;
  if (SEND_INTENT_RE.test(c) || GROUP_POST_RE.test(c)) return true;
  if (history && history.length && priorTurnIsSendPrompt(history)) {
    const wordCount = c.split(/\s+/).length;
    if (BARE_CONFIRM_RE.test(c)) return true;
    if (wordCount <= 6 && !/\?\s*$/.test(c) && !QUESTION_SHAPE_RE.test(c)) return true;
  }
  return false;
}
