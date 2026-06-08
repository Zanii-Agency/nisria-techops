// Read-vs-write intent classifier. Pure function, no side effects, no deps.
// Used by lib/agents/sasa.ts to pick which HONEST_NO_FIGURE rewrite fires.
// Lives in its own .mjs so the unit test (eval/unit/intent.test.mjs) can
// import without a TS toolchain.

// Read imperatives + interrogative openers. Question-shape always wins over
// any write-verb present inside the sentence ("Any payments logged?" hits
// 'logged' as a noun but is a READ because it opens with 'any' and ends in '?').
// v1.3.11.6: pull/get/fetch/grab/bring/give/share added as explicit READ
// imperatives so the classification doesn't rely on the WRITE_INTENT_RE miss.
export const QUESTION_SHAPE_RE = /^\s*(?:what|where|which|who|whose|when|how|why|any|show|list|find|tell\s+me|do\s+you|did\s+you|have\s+you|has\s+anyone|is\s+there|are\s+there|can\s+you|pull(?:\s+up)?|get\s+me|fetch|grab|bring\s+me|give\s+me|share)\b/i;
export const WRITE_INTENT_RE = /\b(?:log(?:ged)?|record(?:ed)?|stage|file|add|i\s+(?:paid|sent|owe|gave|made)|payment|register|book|enter)\b/i;

export function isReadIntent(command) {
  const c = String(command || "").trim();
  if (!c) return true;
  if (/\?\s*$/.test(c)) return true;
  if (QUESTION_SHAPE_RE.test(c)) return true;
  return !WRITE_INTENT_RE.test(c);
}
