// Pure task resolver — "which task does this refer to?" — extracted so it is dep-free and unit
// testable (2026-07-23, the Sikka duplicate-delete loop). Used by BOTH the delete stage-interceptor
// and the tool handlers in smart-tools. Resolving to a concrete task ID (never a re-matched title)
// is what stops the loop: two tasks sharing a 40-char title prefix were unresolvable by fragment, so
// a STAGED delete stored the title and re-asked "which one?" on every "yes" forever. Same class as
// the Maisha self-match bug: commit a resolved id, never a re-matched title.
import { pickFromMatches, normalizeKey } from "./match-dedup.mjs";

export const TASK_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Resolution order: explicit id > exact full-title match > fuzzy fragment + duplicate-pick.
// Returns { task, cands, frag, byId }. task is null when 0 match or genuinely ambiguous (>1 distinct
// title); the caller then surfaces cands (WITH ids) so it can re-target, and computes wasDuplicate.
export async function findTaskToActOn(db, input) {
  const taskKey = (c) => `${c.title}|${c.assignee_id || ""}`;
  if (input.id && TASK_ID_RE.test(String(input.id).trim())) {
    const { data } = await db.from("tasks").select("id,title,status,assignee_id").eq("id", String(input.id).trim()).limit(1);
    const t = (data || [])[0] || null;
    return { task: t, cands: t ? [t] : [], frag: "", byId: true };
  }
  // Scrub LIKE wildcards so a title carrying %/_ cannot over-match.
  const frag = String(input.title || "").trim().replace(/[%_]/g, "").slice(0, 60);
  if (!frag) return { task: null, cands: [], frag, byId: false };
  const { data } = await db.from("tasks").select("id,title,status,assignee_id").ilike("title", `%${frag}%`).order("created_at", { ascending: false }).limit(12);
  const cands = data || [];
  // An exact full-title match uniquely resolves even near-duplicate prefixes.
  const exact = cands.filter((c) => normalizeKey(c.title) === normalizeKey(input.title));
  if (exact.length === 1) return { task: exact[0], cands, frag, byId: false };
  return { task: pickFromMatches(cands, taskKey), cands, frag, byId: false };
}
