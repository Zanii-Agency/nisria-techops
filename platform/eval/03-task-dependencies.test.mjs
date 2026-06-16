// WARNING: This file contains an inline mirror of production logic from lib/smart-tools.ts. If you change the source, update this test too.
// Eval 03 — link_task_dependency + cycle prevention shape test.
//
// task_dependencies has UNIQUE(task_id, blocks_task_id) and CHECK
// (task_id <> blocks_task_id). The link_task_dependency tool must additionally
// refuse a request that would introduce a cycle (A blocks B, B blocks A).
// Replicates the tool contract; integration with the live DB tested in soak.

import assert from "node:assert/strict";

function makeMockDb() {
  const tables = { task_dependencies: [], tasks: [{ id: "A" }, { id: "B" }, { id: "C" }] };
  function chain(name) {
    let rows = tables[name] ? [...tables[name]] : [];
    const ctx = { _insert: null, _filters: [] };
    const api = {
      select() { return api; },
      insert(row) { ctx._insert = Array.isArray(row) ? row : [row]; return api; },
      eq(col, val) { ctx._filters.push({ col, val }); rows = rows.filter((r) => r[col] === val); return api; },
      maybeSingle() { return Promise.resolve({ data: rows[0] || null, error: null }); },
      single() { return Promise.resolve({ data: rows[0] || null, error: null }); },
      then(cb) {
        if (ctx._insert) {
          for (const r of ctx._insert) {
            tables[name].push({ id: `dep-${tables[name].length}`, ...r });
          }
          return Promise.resolve(cb({ data: tables[name][tables[name].length - 1], error: null }));
        }
        return Promise.resolve(cb({ data: rows, error: null }));
      },
    };
    return api;
  }
  return { from: (name) => chain(name), tables };
}

// Cycle detection: walk forwards from blocks_task_id following blocks_task_id
// edges. If we hit task_id, this insert would create a cycle.
async function hasCycle(db, task_id, blocks_task_id) {
  if (task_id === blocks_task_id) return true;
  const visited = new Set();
  const stack = [blocks_task_id];
  while (stack.length) {
    const cur = stack.pop();
    if (cur === task_id) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const row of db.tables.task_dependencies) {
      if (row.task_id === cur) stack.push(row.blocks_task_id);
    }
  }
  return false;
}

async function link_task_dependency_impl(db, args, ctx) {
  if (!args.task_id || !args.blocks_task_id) return { ok: false, error: "missing ids" };
  if (args.task_id === args.blocks_task_id) return { ok: false, error: "self_block_disallowed" };
  if (await hasCycle(db, args.task_id, args.blocks_task_id)) return { ok: false, error: "cycle_disallowed" };
  // dedupe at the app layer too (UNIQUE in DB is the backstop)
  const existing = db.tables.task_dependencies.find((r) => r.task_id === args.task_id && r.blocks_task_id === args.blocks_task_id);
  if (existing) return { ok: true, dependency_id: existing.id, deduped: true };
  await db.from("task_dependencies").insert({
    task_id: args.task_id,
    blocks_task_id: args.blocks_task_id,
    created_by_id: ctx?.actorId || null,
  });
  const last = db.tables.task_dependencies[db.tables.task_dependencies.length - 1];
  return { ok: true, dependency_id: last.id };
}

async function list_task_dependencies_impl(db, args) {
  if (!args.task_id) return { ok: false, error: "missing task_id" };
  const upstream = db.tables.task_dependencies.filter((r) => r.task_id === args.task_id);
  return { ok: true, blocks: upstream };
}

let pass = 0, fail = 0;
console.log("\n  Eval 03 — task_dependencies tool shape\n");

async function run(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); pass++; } catch (e) { console.log(`  ✗ ${name}\n      ${e.message}`); fail++; }
}

await run("simple_link_persists", async () => {
  const db = makeMockDb();
  const r = await link_task_dependency_impl(db, { task_id: "A", blocks_task_id: "B" }, {});
  assert.ok(r.ok);
  assert.equal(db.tables.task_dependencies.length, 1);
});

await run("self_block_refused", async () => {
  const db = makeMockDb();
  const r = await link_task_dependency_impl(db, { task_id: "A", blocks_task_id: "A" }, {});
  assert.equal(r.ok, false);
  assert.equal(r.error, "self_block_disallowed");
});

await run("direct_cycle_refused", async () => {
  const db = makeMockDb();
  await link_task_dependency_impl(db, { task_id: "A", blocks_task_id: "B" }, {});
  const r = await link_task_dependency_impl(db, { task_id: "B", blocks_task_id: "A" }, {});
  assert.equal(r.ok, false);
  assert.equal(r.error, "cycle_disallowed");
});

await run("transitive_cycle_refused", async () => {
  const db = makeMockDb();
  await link_task_dependency_impl(db, { task_id: "A", blocks_task_id: "B" }, {});
  await link_task_dependency_impl(db, { task_id: "B", blocks_task_id: "C" }, {});
  const r = await link_task_dependency_impl(db, { task_id: "C", blocks_task_id: "A" }, {});
  assert.equal(r.ok, false);
  assert.equal(r.error, "cycle_disallowed");
});

await run("duplicate_link_deduped", async () => {
  const db = makeMockDb();
  await link_task_dependency_impl(db, { task_id: "A", blocks_task_id: "B" }, {});
  const r = await link_task_dependency_impl(db, { task_id: "A", blocks_task_id: "B" }, {});
  assert.ok(r.ok);
  assert.equal(r.deduped, true);
  assert.equal(db.tables.task_dependencies.length, 1);
});

await run("list_returns_upstream_blockers", async () => {
  const db = makeMockDb();
  await link_task_dependency_impl(db, { task_id: "A", blocks_task_id: "B" }, {});
  await link_task_dependency_impl(db, { task_id: "A", blocks_task_id: "C" }, {});
  const r = await list_task_dependencies_impl(db, { task_id: "A" });
  assert.ok(r.ok);
  assert.equal(r.blocks.length, 2);
});

console.log(`\n  Results: ${pass} pass / ${fail} fail\n`);
process.exit(fail > 0 ? 1 : 0);
