// TASK-DELETE RESOLUTION EVAL — the Sikka duplicate-delete loop (2026-07-23).
//
// Two tasks shared a 40-char title prefix. delete_task resolved by a truncated title fragment, and
// the stage-then-confirm stored that title and re-matched it on every "yes" — so the delete could
// NEVER pick one and looped "which one?" forever. Fix: resolve to a concrete task id (id > exact
// title > fuzzy), and the stage stores the resolved id so the commit is deterministic. This test
// locks the resolver behaviour AND the structural invariants in smart-tools that wire it up.
//
// Run with:  node eval/integration/task-delete-resolution.test.mjs
// Exit code is 0 only if all checks pass.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { findTaskToActOn } from "../../lib/task-resolve.mjs";

const PLATFORM = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => readFileSync(resolve(PLATFORM, rel), "utf8");

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

// --- the two real Sikka tasks: same first 40 chars, different full titles ---
const T2 = { id: "11111111-1111-4111-8111-111111111111", title: "Sikka 2027 Open Call - Maisha Art Installation proposal", status: "todo", assignee_id: null };
const T3 = { id: "22222222-2222-4222-8222-222222222222", title: "Sikka 2027 Open Call - Maisha Art Installation Proposal (deadline August 17) https://dubaiculture.gov.ae/en/events/, 2027", status: "todo", assignee_id: null };

// minimal chainable Supabase stub (select/eq/ilike/neq/order → limit resolves {data})
function makeDb(rows) {
  return {
    from() {
      let r = [...rows];
      const q = {
        select() { return q; },
        eq(col, val) { r = r.filter((x) => String(x[col]) === String(val)); return q; },
        neq(col, val) { r = r.filter((x) => String(x[col]) !== String(val)); return q; },
        ilike(col, pat) { const n = String(pat).replace(/%/g, "").toLowerCase(); r = r.filter((x) => String(x[col] || "").toLowerCase().includes(n)); return q; },
        order() { return q; },
        limit(n) { return Promise.resolve({ data: r.slice(0, n) }); },
      };
      return q;
    },
  };
}
const db = makeDb([T3, T2]);

// 1. explicit id resolves deterministically (the commit path)
const byId = await findTaskToActOn(db, { id: T3.id });
ok(byId.task && byId.task.id === T3.id, `by id: expected T3, got ${JSON.stringify(byId.task && byId.task.id)}`);
ok(byId.byId === true, "by id: byId flag should be true");

// 2. the FULL exact title resolves uniquely even though the fragment matches both
const byExact2 = await findTaskToActOn(db, { title: T2.title });
ok(byExact2.task && byExact2.task.id === T2.id, `exact title T2: expected T2, got ${JSON.stringify(byExact2.task && byExact2.task.id)}`);
const byExact3 = await findTaskToActOn(db, { title: T3.title });
ok(byExact3.task && byExact3.task.id === T3.id, `exact title T3: expected T3, got ${JSON.stringify(byExact3.task && byExact3.task.id)}`);

// 3. THE LOOP CONDITION: a shared 40-char fragment matches BOTH → task null, but cands carry both
//    (WITH ids) so the caller surfaces a resolvable choice and stages NOTHING. Pre-fix this looped.
const amb = await findTaskToActOn(db, { title: "Sikka 2027 Open Call - Maisha Art Inst" });
ok(amb.task === null, "ambiguous fragment: task must be null (not a wrong silent pick)");
ok(amb.cands.length === 2, `ambiguous fragment: expected 2 candidates, got ${amb.cands.length}`);
ok(amb.cands.every((c) => c.id), "ambiguous candidates must carry ids so the model can re-target");

// 4. no match → empty, never a blind delete
const none = await findTaskToActOn(db, { title: "totally different task zzz" });
ok(none.cands.length === 0 && none.task === null, "no match: must return nothing");

// --- STRUCTURAL INVARIANTS in smart-tools (the wiring that closes the loop) ---
const src = read("lib/smart-tools.ts");
ok(src.includes('id: { type: "string", description: "the exact task id to delete'), "delete_task schema must expose an `id` property");
ok(src.includes("stageArgs = { id: task.id"), "the delete stage-interceptor must stage a resolved id, not the raw title");
ok((src.match(/findTaskToActOn\(db, input\)/g) || []).length >= 2, "both the interceptor and the delete_task handler must resolve via findTaskToActOn");

if (fails.length) {
  console.error("FAIL task-delete-resolution:\n  " + fails.join("\n  "));
  process.exit(1);
}
console.log("PASS task-delete-resolution: all checks green");
