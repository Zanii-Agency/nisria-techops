// parseTasks — pure regex pre-processor for task-shaped WhatsApp messages.
//
// Sasa 727 v1. The 727 worker and the group ingest route both call this BEFORE
// they wake the model, so a task lands in the database deterministically, never
// at the model's discretion. The model still gets the original body verbatim,
// plus a one-line context note describing what was parsed, so it can narrate
// what code has already made true. KT #110.
//
// Pure: no DB, no API, no I/O, no Date.now() reads beyond the optional `today`
// argument. Same input deterministically produces the same output. Tested by
// `platform/eval/01-priority-task-delegation.test.mjs` (10 golden cases) plus
// the new cases 11..16 in v1.
//
// Returns:
//   { tasks: ParsedTask[],
//     context_note: string,           // one-line summary for runSasa
//     raw_body_unchanged: string }    // exact input body
//
// See FROZEN-SPEC.md §4 and ADR-001 for the contract and the alternatives
// considered. See `data/_schemas.json` for the production tasks columns.

// ────────────────────────────────────────────────────────────────────────────
// VERBS — the words that turn a sentence into a task request.
// "thanks" / "hi" / "good" deliberately excluded. Order doesn't matter; this
// is checked as a word-boundary lookup, never substring.
// ────────────────────────────────────────────────────────────────────────────
const TASK_VERBS = new Set([
  "handle","arrange","pick","sort","prepare","message","call","send","get",
  "take","make","schedule","draft","write","build","create","fix","follow",
  "organize","organise","look","setup","check","find","share","finish",
  "complete","ship","deliver","file","save","post","upload","download",
  "transfer","deposit","withdraw","pay","log","do","action","review",
  "approve","decline","reach","contact","forward","update","add","remove",
  "set","cancel","reschedule","reassign","move","close","open","start",
  "stop","track","record","collect","gather","compile","clean","clear",
  "audit","prep","ping","email","escalate","resolve",
]);

// Phrases at the front of a sentence that signal a request even before a verb,
// e.g. "@Cynthia please pick up the package". Lowercased.
const REQUEST_PREFIXES = [
  "please","pls","can you","could you","would you","will you",
  "kindly","mind","mind if you","need you to","ineed you to",
  "i need you to","help me","help with","let's","lets",
];

// Words that DISQUALIFY an @-mention from being a task (acknowledgement shape).
const ACKNOWLEDGEMENT_PREFIXES = [
  "thanks","thank","thx","ty","ta","cheers","appreciate","appreciated",
  "good","great","nice","well done","welldone","awesome","amazing",
  "hi","hello","hey","yo","sup","morning","afternoon","evening","gm","gn",
];

// Words at the very start of a body that mean DELETE/CANCEL, not CREATE.
// Used to skip messages like "Cancel the calls with Edith".
const DELETE_PREFIXES = ["cancel","delete","remove","scratch","drop","undo","unassign"];

// Recurrence keywords. The migration adds these to the tasks.recurrence enum
// already; this set is what the regex looks for inside the body.
const RECURRENCE_KEYWORDS = {
  daily: ["every day","daily","each day"],
  weekdays: ["every weekday","weekdays","each weekday"],
  weekly: ["every week","weekly","each week"],
  biweekly: ["every two weeks","biweekly","every other week","fortnightly"],
  monthly: ["every month","monthly","each month","of every month","of each month"],
};

// Common bullet markers we strip from a list item.
const BULLET_RE = /^\s*(?:[-•*]\s+|\d+[.)]\s+)/;

// Default for sender_role / sender_rank. parseTasks defaults to admin/founder
// when not set so the eval (which passes only body + roster + message ids)
// gets the same answer the production caller would.
function defaultSenderRole(s) { return s === "team" ? "team" : "admin"; }

// ────────────────────────────────────────────────────────────────────────────
// MATCH a name to a team_members row. Exact case-insensitive, then first-word
// match for multi-word names (Violet matches Violet Otieno). Returns the member
// row or null. Never throws.
// ────────────────────────────────────────────────────────────────────────────
function findMember(name, roster) {
  if (!name) return null;
  const want = String(name).trim().toLowerCase();
  if (!want) return null;
  // 1. exact full-name match (case-insensitive)
  for (const m of roster) {
    if (String(m.name || "").toLowerCase() === want) return m;
  }
  // 2. member's first word matches the single-word search (Violet matches
  // "Violet Otieno"). Single-word search only, so we don't bleed into the
  // mixed-bullet two-word probe case where "Cynthia handle" must NOT match.
  if (!want.includes(" ")) {
    for (const m of roster) {
      const first = String(m.name || "").trim().split(/\s+/)[0]?.toLowerCase();
      if (first && first === want) return m;
    }
  }
  // 3. multi-word search where the member's name STARTS WITH the search
  // (so "Violet Otieno" matches member "Violet Otieno-Smith"). Strict
  // prefix so "Cynthia handle" never wins against member "Cynthia".
  if (want.includes(" ")) {
    for (const m of roster) {
      const n = String(m.name || "").toLowerCase();
      if (n.startsWith(want + " ")) return m;
    }
  }
  return null;
}

// Filter the roster so the eval / production agree on who's targetable.
// Team-tier senders cannot target Taona (CORRECTIONS §7.1). Inactive members
// are dropped silently. Other roles see the full active roster.
function visibleRoster(roster, senderRole) {
  const active = (roster || []).filter((m) => (m.status || "active") === "active");
  if (senderRole === "team") {
    return active.filter((m) => String(m.name || "").trim().toLowerCase() !== "taona");
  }
  return active;
}

// ────────────────────────────────────────────────────────────────────────────
// TEXT helpers.
// ────────────────────────────────────────────────────────────────────────────
function stripBullet(line) {
  return String(line || "").replace(BULLET_RE, "").trim();
}

function sanitizeTitle(text) {
  let t = String(text || "").trim();
  // strip leading/trailing quotes and full-stops; collapse internal whitespace
  t = t.replace(/^['"`“”‘’]+|['"`“”‘’]+$/g, "").trim();
  t = t.replace(/\s*[.!?]+\s*$/g, "").trim();
  // strip trailing courtesy phrases (". thanks", ". thx", ". please")
  t = t.replace(/\s*[,.;:]?\s*(?:thanks?(?:\s+you)?|thx|ty|please|pls)\s*[!.?]?\s*[^\w]*$/i, "").trim();
  // collapse runs of whitespace, including bare emojis at the tail
  t = t.replace(/\s+[\p{Emoji_Presentation}\p{Extended_Pictographic}]+\s*$/u, "").trim();
  return t.slice(0, 200);
}

function hasVerbShape(phrase) {
  const p = String(phrase || "").trim().toLowerCase();
  if (!p) return false;
  // acknowledgement prefix → not a task
  for (const ack of ACKNOWLEDGEMENT_PREFIXES) {
    if (p.startsWith(ack + " ") || p === ack) return false;
  }
  // explicit request prefix → task
  for (const pref of REQUEST_PREFIXES) {
    if (p.startsWith(pref + " ") || p === pref) return true;
  }
  // imperative verb at the start
  const firstWord = p.split(/[\s,.!?]+/)[0] || "";
  if (TASK_VERBS.has(firstWord)) return true;
  // first two words of a slightly-conjugated imperative
  // (e.g. "set up", "look into") — already captured because we test the first word
  return false;
}

function startsWithDelete(body) {
  const p = String(body || "").trim().toLowerCase();
  if (!p) return false;
  // pattern matchers below only trigger on @ / assign / remind, so a bare
  // "cancel" survives this check; we use this guard to skip explicitly.
  for (const w of DELETE_PREFIXES) {
    if (p.startsWith(w + " ")) return true;
  }
  return false;
}

// ────────────────────────────────────────────────────────────────────────────
// DUE-DATE extraction. We handle the small set of phrases that show up in
// Nur's actual delegations, never more. Anything past this returns null and
// the model can refine later.
//
// today is an ISO date string the caller passes in (defaults to today via
// Date(NOW), but the eval always passes its own to keep determinism).
// ────────────────────────────────────────────────────────────────────────────
function isoDate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function parseTodayArg(today) {
  if (typeof today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(today)) return new Date(`${today}T00:00:00Z`);
  return new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
}

function nextMonday(today) {
  // ISO weekday: Mon=1..Sun=7. JS getUTCDay: Sun=0..Sat=6.
  const day = today.getUTCDay(); // 0..6
  const delta = day === 0 ? 1 : (8 - day); // Sun->Mon = 1, Mon->Mon = 7, Tue->Mon = 6...
  const d = new Date(today.getTime() + delta * 86400000);
  return isoDate(d);
}

function nextDayOfMonth(today, dayOfMonth) {
  const t = today;
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth();
  const candidate = new Date(Date.UTC(y, m, dayOfMonth));
  if (candidate.getTime() > t.getTime()) return isoDate(candidate);
  return isoDate(new Date(Date.UTC(y, m + 1, dayOfMonth)));
}

function extractDueAndRecurrence(text, today) {
  const t = String(text || "").toLowerCase();
  let due_on = null;
  let recurrence = "none";

  // recurrence — must come before the once-off phrases because "every X" can
  // overlap with "on the X" otherwise.
  for (const [rule, phrases] of Object.entries(RECURRENCE_KEYWORDS)) {
    for (const p of phrases) {
      if (t.includes(p)) { recurrence = rule; break; }
    }
    if (recurrence !== "none") break;
  }

  // "on the Nth (of every month)" → recurring monthly, due_on=next Nth
  const dom = t.match(/on\s+the\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+of\s+(?:every|each)\s+month)?/);
  if (dom) {
    const n = parseInt(dom[1], 10);
    if (n >= 1 && n <= 31) {
      due_on = nextDayOfMonth(today, n);
      if (/of\s+(?:every|each)\s+month/.test(t)) recurrence = "monthly";
    }
  }
  // "next week" → next Monday
  if (/\bnext\s+week\b/.test(t)) due_on = nextMonday(today);
  // "tomorrow"
  if (/\btomorrow\b/.test(t)) { const d = new Date(today.getTime() + 86400000); due_on = isoDate(d); }
  // "next Monday" / "next Friday"
  const weekdayMatch = t.match(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (weekdayMatch) {
    const map = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
    const want = map[weekdayMatch[1]];
    const day = today.getUTCDay();
    let delta = (want - day + 7) % 7;
    if (delta === 0) delta = 7;
    due_on = isoDate(new Date(today.getTime() + delta * 86400000));
  }
  // "by Friday" / "this Friday" / "on Friday" → next occurrence of that weekday
  const onWeekday = t.match(/\b(?:on|by|this)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (onWeekday && !due_on) {
    const map = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
    const want = map[onWeekday[1]];
    const day = today.getUTCDay();
    let delta = (want - day + 7) % 7;
    if (delta === 0) delta = 7;
    due_on = isoDate(new Date(today.getTime() + delta * 86400000));
  }
  return { due_on, recurrence };
}

// Self-reminder phrasing strips "to", trailing date phrases, and a few
// "this/next" suffixes so the title ends up describing the action.
function cleanReminderTitle(raw) {
  let t = String(raw || "").trim();
  t = t.replace(/^\s*to\s+/i, "");
  t = t.replace(/\s+(?:next\s+(?:week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|month)|by\s+\w+|on\s+the\s+\d+(?:st|nd|rd|th)?(?:\s+of\s+(?:every|each)\s+month)?|every\s+\w+|tomorrow|this\s+week)\s*[.!?]?\s*$/i, "");
  return sanitizeTitle(t);
}

// ────────────────────────────────────────────────────────────────────────────
// PATTERNS
//
// Each pattern function takes (input, roster, today) and returns an array of
// ParsedTask objects (possibly empty). The dispatcher runs them in priority
// order and returns the first non-empty result.
// ────────────────────────────────────────────────────────────────────────────

// Pattern A: "Assign these tasks to X: - a - b - c"
function matchAssignedBulletList(body, roster, today) {
  const re = /^assign\s+(?:these|those)\s+tasks?\s+to\s+(\w+(?:\s+\w+)*?)\s*:\s*\n((?:.+\n?)+?)$/im;
  const m = body.match(re);
  if (!m) return [];
  const member = findMember(m[1], roster);
  const lines = m[2].split(/\n/).map(stripBullet).filter((s) => s.length >= 3);
  const offset = m.index || 0;
  return lines.map((title, i) => ({
    assignee_name: member?.name || m[1].trim(),
    assignee_id: member?.id || null,
    title: sanitizeTitle(title),
    due_on: extractDueAndRecurrence(title, today).due_on,
    recurrence: extractDueAndRecurrence(title, today).recurrence,
    source_pattern: "bullet_item",
    source_offset: offset + i,
  })).filter((t) => t.title.length >= 5);
}

// Pattern B: mixed-assignee bullet list. The intro line is anything ending
// with ':' and we then look at each bullet: if its FIRST WORD is a team member
// name AND followed by a verb-shape, it becomes a task assigned to that name.
// At least 2 bullets must match before we accept the pattern (one is too easy
// to misfire on a header like "Notes:" with one stray bullet underneath).
function matchMixedBulletList(body, roster, today) {
  const re = /^([^\n]{1,120}):\s*\n((?:\s*[-•*]\s+[^\n]+\n?){2,})/im;
  const m = body.match(re);
  if (!m) return [];
  // skip if the header is the "Assign these tasks to X" shape; pattern A owns it
  if (/^\s*assign\s+(?:these|those)\s+tasks?\s+to/i.test(m[1])) return [];
  const lines = m[2].split(/\n/).map((l) => l.replace(BULLET_RE, "").trim()).filter((s) => s.length >= 3);
  const offset = m.index || 0;
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // first word(s) is/are a team_member name
    const tokens = line.split(/\s+/);
    let nameMatched = null;
    let rest = "";
    // try two-word match first (Violet Otieno), then single-word
    if (tokens.length >= 2) {
      const two = `${tokens[0]} ${tokens[1]}`;
      const mm = findMember(two, roster);
      if (mm) { nameMatched = mm; rest = tokens.slice(2).join(" "); }
    }
    if (!nameMatched && tokens.length >= 1) {
      const mm = findMember(tokens[0], roster);
      if (mm) { nameMatched = mm; rest = tokens.slice(1).join(" "); }
    }
    if (!nameMatched) continue;
    if (!hasVerbShape(rest)) continue;
    const dueRec = extractDueAndRecurrence(rest, today);
    out.push({
      assignee_name: nameMatched.name,
      assignee_id: nameMatched.id,
      title: sanitizeTitle(rest),
      due_on: dueRec.due_on,
      recurrence: dueRec.recurrence,
      source_pattern: "bullet_item",
      source_offset: offset + i,
    });
  }
  // require at least 2 bullets to lock the pattern, else it's noise
  return out.length >= 2 ? out : [];
}

// Pattern C: "Assign this task to X: Y"
function matchImperative(body, roster, today) {
  const re = /^assign\s+(?:this|the)\s+task\s+to\s+(\w+(?:\s+\w+)*?)\s*:\s*(.+?)$/im;
  const m = body.match(re);
  if (!m) return [];
  const member = findMember(m[1], roster);
  const title = sanitizeTitle(m[2]);
  if (title.length < 5) return [];
  const dueRec = extractDueAndRecurrence(m[2], today);
  return [{
    assignee_name: member?.name || m[1].trim(),
    assignee_id: member?.id || null,
    title,
    due_on: dueRec.due_on,
    recurrence: dueRec.recurrence,
    source_pattern: "imperative",
    source_offset: m.index || 0,
  }];
}

// Pattern D: "Send a reminder on the 5th of every month to upload all bank
// statements". The sender becomes the assignee (Nur in production).
function matchRecurringSelfReminder(body, roster, today) {
  const re = /(?:^|\s)send\s+(?:a\s+|me\s+a\s+)?reminder\s+(.+?)\s+to\s+(.+?)(?:[.!?]|$)/i;
  const m = body.match(re);
  if (!m) return [];
  const sched = m[1];
  const titleRaw = m[2];
  const title = sanitizeTitle(titleRaw);
  if (title.length < 5) return [];
  // Recurrence + due_on extracted from the schedule phrase (e.g. "on the 5th
  // of every month") — the title fragment itself is just the action verb.
  const dueRec = extractDueAndRecurrence(sched, today);
  const nur = findMember("Nur", roster) || roster[0];
  return [{
    assignee_name: nur?.name || "Nur",
    assignee_id: nur?.id || null,
    title,
    due_on: dueRec.due_on,
    recurrence: dueRec.recurrence,
    source_pattern: "reminder_self",
    source_offset: m.index || 0,
  }];
}

// Pattern E: "Remind me to X (next week / on Friday / by Tuesday)"
function matchSelfReminder(body, roster, today) {
  const re = /^remind\s+me\s+(?:to\s+)?(.+?)\s*$/im;
  const m = body.match(re);
  if (!m) return [];
  // Avoid double-firing with pattern D ("send me a reminder ...").
  if (/^\s*send\s+(?:a\s+|me\s+a\s+)?reminder/i.test(body)) return [];
  const titleRaw = cleanReminderTitle(m[1]);
  if (titleRaw.length < 5) return [];
  const dueRec = extractDueAndRecurrence(m[1], today);
  const nur = findMember("Nur", roster) || roster[0];
  return [{
    assignee_name: nur?.name || "Nur",
    assignee_id: nur?.id || null,
    title: titleRaw,
    due_on: dueRec.due_on,
    recurrence: dueRec.recurrence,
    source_pattern: "reminder_self",
    source_offset: m.index || 0,
  }];
}

// Pattern F: "@X verb-phrase" in a DM. The body must start with the @-mention
// (after optional whitespace) so we don't misfire on a quoted "@X" deep in a
// long message — the eval cases all front-load the mention.
function matchAtMentionDm(body, roster, today) {
  const re = /^\s*@(\w+)\s+(.+?)\s*$/im;
  const m = body.match(re);
  if (!m) return [];
  const member = findMember(m[1], roster);
  if (!member) return [];
  if (!hasVerbShape(m[2])) return [];
  // strip the verb-phrase prefix from the title so the action verb survives
  // ("@Cynthia please pick up the package" → "pick up the package").
  let rest = m[2].trim();
  for (const pref of REQUEST_PREFIXES) {
    const re2 = new RegExp(`^${pref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i");
    if (re2.test(rest)) { rest = rest.replace(re2, ""); break; }
  }
  const title = sanitizeTitle(rest);
  if (title.length < 5) return [];
  const dueRec = extractDueAndRecurrence(rest, today);
  return [{
    assignee_name: member.name,
    assignee_id: member.id,
    title,
    due_on: dueRec.due_on,
    recurrence: dueRec.recurrence,
    source_pattern: "mention_in_dm",
    source_offset: m.index || 0,
  }];
}

// ────────────────────────────────────────────────────────────────────────────
// DISPATCHER
// ────────────────────────────────────────────────────────────────────────────
export function parseTasks(input) {
  const body = String(input?.body || "");
  const team_members = Array.isArray(input?.team_members) ? input.team_members : [];
  const senderRole = defaultSenderRole(input?.sender_role);
  const today = parseTodayArg(input?.today);
  const roster = visibleRoster(team_members, senderRole);

  const empty = { tasks: [], context_note: "", raw_body_unchanged: body };

  if (!body || body.trim().length < 3) return empty;

  // Delete-shape blocker: a body that opens with "cancel/delete/remove" and
  // contains no @-mention shouldn't fire any of the create patterns. The eval
  // exercises this with "Cancel the calls with Edith".
  if (startsWithDelete(body) && !/^\s*@/m.test(body)) return empty;

  // Run patterns in priority order. First non-empty wins.
  const dispatchers = [
    matchAssignedBulletList,   // A
    matchMixedBulletList,      // B
    matchImperative,           // C
    matchRecurringSelfReminder,// D
    matchSelfReminder,         // E
    matchAtMentionDm,          // F
  ];

  for (const fn of dispatchers) {
    const tasks = fn(body, roster, today);
    if (tasks && tasks.length > 0) {
      const valid = tasks.filter((t) => t.title && t.title.length >= 5);
      if (valid.length === 0) continue;
      const context_note = describeForContextNote(valid);
      return { tasks: valid, context_note, raw_body_unchanged: body };
    }
  }

  return empty;
}

function describeForContextNote(tasks) {
  if (tasks.length === 0) return "";
  if (tasks.length === 1) {
    const t = tasks[0];
    const due = t.due_on ? ` due ${t.due_on}` : "";
    const rec = t.recurrence && t.recurrence !== "none" ? ` (${t.recurrence})` : "";
    return `parsed_task: "${t.title}" for ${t.assignee_name}${due}${rec}`;
  }
  const owner = tasks.every((t) => t.assignee_name === tasks[0].assignee_name) ? `for ${tasks[0].assignee_name}` : "split by assignee";
  return `parsed_tasks (${tasks.length}) ${owner}: ${tasks.map((t) => `"${t.title}"`).join(", ")}`;
}

// Default export for ergonomic import sugar; some consumers prefer it.
export default parseTasks;
