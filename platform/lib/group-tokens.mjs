// Pure, dependency-free GROUP-name tokenizer (2026-06-22 group-send amnesia fix).
// Imported by BOTH lib/agents/sasa.ts (the honesty guard) and the wall, so the
// rule the wall proves is the exact rule the code runs (zero drift).
//
// The DISTINCTIVE lower-case tokens of a GROUP name:
//   "Nisria • Finances 💵"     -> ["finances"]
//   "Maisha • Operations"      -> ["operations"]
//   "Nisria • Rescue & Rehab"  -> ["rescue", "rehab"]
// Strips the org prefix, bullet, emoji and punctuation, drops generic words.
// Lets a reply that names a group ("posted to the Finances group") be MATCHED
// against a successful post_to_group to that group, instead of treating
// "Finances" as an un-sent PERSON (the bug that fired HONEST_NO_SEND over a
// delivered group post).
export const GROUP_TOKEN_GENERIC = new Set(["nisria", "maisha", "group", "the", "and"]);

export function groupTokens(name) {
  const cleaned = String(name || "").replace(/[^\p{L}\s]/gu, " ").toLowerCase();
  return [...new Set(cleaned.split(/\s+/).filter((w) => w.length >= 3 && !GROUP_TOKEN_GENERIC.has(w)))];
}
