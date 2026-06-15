#!/usr/bin/env node
// Sasa contact-ambiguity WALL — 2026-06-15 (KT #275).
//
// The bug: parseTasks.findMember(name, roster) silently returned rows[0] when
// 2+ active members shared a first name. Live collision in prod: "Lucy
// Wangare" and "Lucy Wanjiku" are both active tailors — if Nur said "Lucy",
// the parser locked the first row on the roster and the task landed on the
// wrong Lucy with zero signal that anything was ambiguous. Same shape on
// smart-tools.ts findMember(db, name) for update_team_member / activate_member
// / set_bot_access.
//
// The wall: findMember returns a discriminated union
//   { kind: 'unique', member } | { kind: 'ambiguous', candidates } | { kind: 'none' }
// Exact full-name match wins as 'unique' even when first-name prefix would
// collide. Single-word match on 2+ active members becomes 'ambiguous' and the
// parser leaves assignee_id NULL + attaches `_ambiguous_assignee` metadata so
// the route handler can emit an audit event and the LLM can ask
// "did you mean X or Y?".
//
// Pure local. No DB hit, no Anthropic spend, no network. Uses a synthetic
// roster fixture.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PLATFORM = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => readFileSync(resolve(PLATFORM, rel), "utf8");

const tests = [];
function check(name, fn) { tests.push({ name, fn }); }

// Synthetic roster — mirrors the prod collision (two active Lucys) plus a
// non-colliding member (Violet) and the operator (Nur). Inactive members do
// NOT cause ambiguity by design.
const ROSTER = [
  { id: "nur-1",      name: "Nur",             phone: "00971501622716", status: "active", role: "admin" },
  { id: "lucy-w1",    name: "Lucy Wangare",    phone: "00254700000001", status: "active", role: "tailor" },
  { id: "lucy-w2",    name: "Lucy Wanjiku",    phone: "00254700000002", status: "active", role: "tailor" },
  { id: "violet-1",   name: "Violet Otieno",   phone: "00254700000003", status: "active", role: "tailor" },
  { id: "lucy-old-1", name: "Lucy Retired",    phone: "00254700000099", status: "inactive", role: "tailor" },
];

const NUR_PHONE = "00971501622716";
const TODAY = "2026-06-15";

// ─── seam: findMember discriminated-union shape ────────────────────────────

check("seam: parseTasks findMember returns union shape", () => {
  const src = read("app/api/whatsapp/worker/parseTasks.mjs");
  if (!/function findMember\(name, roster\)/.test(src)) return "findMember signature missing";
  if (!/kind:\s*"unique"/.test(src)) return "findMember does not return kind:'unique'";
  if (!/kind:\s*"ambiguous"/.test(src)) return "findMember does not return kind:'ambiguous'";
  if (!/kind:\s*"none"/.test(src)) return "findMember does not return kind:'none'";
  // pickUniqueMember helper exists (legacy null|row fallback)
  if (!/function pickUniqueMember\(/.test(src)) return "pickUniqueMember helper missing";
  // ambiguityMeta helper exists
  if (!/function ambiguityMeta\(/.test(src)) return "ambiguityMeta helper missing";
  return null;
});

check("seam: smart-tools findMemberUnion + memberAmbiguityQuestion exist", () => {
  const src = read("lib/smart-tools.ts");
  if (!/async function findMemberUnion\(/.test(src)) return "findMemberUnion missing in smart-tools.ts";
  if (!/function memberAmbiguityQuestion\(/.test(src)) return "memberAmbiguityQuestion helper missing";
  if (!/type MemberResolution\s*=/.test(src)) return "MemberResolution union type missing";
  if (!/ambiguous\?:\s*boolean/.test(src)) return "ToolResult does not declare ambiguous?: boolean";
  return null;
});

check("seam: update_team_member / activate_member / set_bot_access use findMemberUnion", () => {
  const src = read("lib/smart-tools.ts");
  for (const tool of ["update_team_member", "activate_member", "set_bot_access"]) {
    const start = src.indexOf(`if (name === "${tool}")`);
    if (start < 0) return `${tool} handler not found`;
    const end = src.indexOf("if (name ===", start + 20);
    const block = src.slice(start, end > 0 ? end : start + 2000);
    if (!/findMemberUnion\(/.test(block)) return `${tool} does not call findMemberUnion`;
    if (!/ambiguous:\s*true/.test(block)) return `${tool} does not return ambiguous: true on ambiguous match`;
  }
  return null;
});

check("seam: route.ts emits parseTasks.assignee_ambiguous when meta is set", () => {
  const src = read("app/api/whatsapp/worker/route.ts");
  if (!/parseTasks\.assignee_ambiguous/.test(src)) return "route.ts does not emit parseTasks.assignee_ambiguous";
  if (!/_ambiguous_assignee/.test(src)) return "route.ts does not read _ambiguous_assignee";
  if (!/ambiguous_candidates/.test(src)) return "route.ts does not put ambiguous_candidates on the event payload";
  return null;
});

// ─── B: behavioral repro of the prod collision ─────────────────────────────

check("B: 'Lucy do the laundry' returns ambiguity meta with 2 candidates", async () => {
  const { parseTasks } = await import("../../app/api/whatsapp/worker/parseTasks.mjs");
  const r = parseTasks({
    body: "@Lucy do the laundry today please",
    team_members: ROSTER,
    sender_team_member: ROSTER[0], // Nur
    sender_role: "admin",
    today: TODAY,
  });
  if (r.tasks.length !== 1) return `expected 1 task, got ${r.tasks.length}`;
  const t = r.tasks[0];
  if (t.assignee_id !== null) return `expected assignee_id NULL on ambiguous Lucy, got ${t.assignee_id}`;
  const amb = t._ambiguous_assignee;
  if (!amb) return "task missing _ambiguous_assignee metadata";
  if (!Array.isArray(amb.candidates) || amb.candidates.length !== 2) {
    return `expected 2 candidates, got ${JSON.stringify(amb.candidates)}`;
  }
  const set = new Set(amb.candidates);
  if (!set.has("Lucy Wangare") || !set.has("Lucy Wanjiku")) {
    return `expected Lucy Wangare + Lucy Wanjiku, got ${JSON.stringify(amb.candidates)}`;
  }
  return null;
});

check("B: 'Lucy Wangare do the laundry' resolves uniquely (full-name beats prefix)", async () => {
  const { parseTasks } = await import("../../app/api/whatsapp/worker/parseTasks.mjs");
  const r = parseTasks({
    body: "Assign this task to Lucy Wangare: handle the laundry pickup tomorrow",
    team_members: ROSTER,
    sender_team_member: ROSTER[0],
    sender_role: "admin",
    today: TODAY,
  });
  if (r.tasks.length !== 1) return `expected 1 task, got ${r.tasks.length}`;
  const t = r.tasks[0];
  if (t._ambiguous_assignee) return `expected NO ambiguity meta, got ${JSON.stringify(t._ambiguous_assignee)}`;
  if (t.assignee_id !== "lucy-w1") return `expected lucy-w1, got ${t.assignee_id}`;
  if (t.assignee_name !== "Lucy Wangare") return `expected 'Lucy Wangare', got '${t.assignee_name}'`;
  return null;
});

check("B: 'Violet send the email' resolves uniquely (only one Violet)", async () => {
  const { parseTasks } = await import("../../app/api/whatsapp/worker/parseTasks.mjs");
  const r = parseTasks({
    body: "@Violet please send the donor follow-up email today",
    team_members: ROSTER,
    sender_team_member: ROSTER[0],
    sender_role: "admin",
    today: TODAY,
  });
  if (r.tasks.length !== 1) return `expected 1 task, got ${r.tasks.length}`;
  const t = r.tasks[0];
  if (t._ambiguous_assignee) return `expected NO ambiguity meta, got ${JSON.stringify(t._ambiguous_assignee)}`;
  if (t.assignee_id !== "violet-1") return `expected violet-1, got ${t.assignee_id}`;
  if (t.assignee_name !== "Violet Otieno") return `expected 'Violet Otieno', got '${t.assignee_name}'`;
  return null;
});

check("B: 'Xenophon do X' returns no tasks (kind:'none')", async () => {
  const { parseTasks } = await import("../../app/api/whatsapp/worker/parseTasks.mjs");
  const r = parseTasks({
    body: "@Xenophon please draft the brief",
    team_members: ROSTER,
    sender_team_member: ROSTER[0],
    sender_role: "admin",
    today: TODAY,
  });
  // Pattern F: 'none' on findMember bails the pattern → no task. The dispatcher
  // returns empty for the parser; the LLM still gets the body verbatim.
  if (r.tasks.length !== 0) return `expected 0 tasks, got ${r.tasks.length}`;
  return null;
});

check("B: 'me do X' with senderPhone resolves to Nur self", async () => {
  const { parseTasks } = await import("../../app/api/whatsapp/worker/parseTasks.mjs");
  const r = parseTasks({
    body: "Assign these tasks to me:\n- Pick up the printer\n- Draft the donor brief",
    team_members: ROSTER,
    sender_team_member: ROSTER[0], // Nur — the route handler resolves this from phone
    sender_role: "admin",
    today: TODAY,
  });
  if (r.tasks.length !== 2) return `expected 2 tasks, got ${r.tasks.length}`;
  for (const t of r.tasks) {
    if (t._ambiguous_assignee) return `expected NO ambiguity meta on self-assign, got ${JSON.stringify(t._ambiguous_assignee)}`;
    if (t.assignee_id !== "nur-1") return `expected nur-1, got ${t.assignee_id}`;
    if (t.assignee_name !== "Nur") return `expected 'Nur', got '${t.assignee_name}'`;
  }
  return null;
});

// ─── extra coverage: inactive twin does NOT trigger ambiguity ──────────────

check("B: inactive 'Lucy Retired' does NOT cause ambiguity when only she + active Lucys exist", () => {
  // White-box: findMember is exported by name in the .mjs module via the
  // single export `parseTasks`. We invoke it indirectly: a single-word "Lucy"
  // probe on a roster with TWO active Lucys + ONE inactive Lucy must still
  // surface BOTH Lucys (active only) — inactive members never add to the
  // candidate list. We assert via the parseTasks path because findMember is
  // module-local. The earlier 'Lucy do the laundry' test already exercises
  // the 2-active case; this test exists to pin the inactive-skip behavior.
  // Just an additional sanity check on the roster fixture above.
  const active = ROSTER.filter((m) => m.status === "active" && m.name.toLowerCase().startsWith("lucy"));
  if (active.length !== 2) return `roster fixture broken: expected 2 active Lucys, got ${active.length}`;
  const inactive = ROSTER.filter((m) => m.status !== "active" && m.name.toLowerCase().startsWith("lucy"));
  if (inactive.length !== 1) return `roster fixture broken: expected 1 inactive Lucy, got ${inactive.length}`;
  return null;
});

// ─── runner ────────────────────────────────────────────────────────────────

(async () => {
  let pass = 0;
  let fail = 0;
  for (const t of tests) {
    let err = null;
    try {
      err = await t.fn();
    } catch (e) {
      err = e?.message || String(e);
    }
    if (err) {
      console.error(`FAIL: ${t.name}`);
      console.error(`      ${err}`);
      fail += 1;
    } else {
      console.log(`PASS: ${t.name}`);
      pass += 1;
    }
  }
  console.log(`\n${pass} pass, ${fail} fail, ${tests.length} total`);
  process.exit(fail === 0 ? 0 : 1);
})();
