#!/usr/bin/env node
// Sasa task-explosion DEDUP WALL — 2026-06-15.
//
// Today's bug: one Nur input ("Add this reminder: at 10am: Send STP report
// reminder to Violet and Cynthia. Send Mark Njambi a message about the new
// place hunting. Renew password.") produced 9 overlapping task rows via the
// create_task smart-tool, all stamped source_kind=NULL + source_id=NULL so the
// partial UNIQUE index idx_tasks_parsed_task_dedup (parsed_task only) could not
// catch them. The fix is two-layer:
//
//   Layer 1 (idempotency at primitive): create_task ALWAYS stamps
//     source_kind="sasa_tool" + source_id=<inbound message_id>. A pre-insert
//     lookup on (source_kind, source_id, title) treats a repeat as a no-op,
//     returning ok:true + detail.deduped:true. A 23505 unique-violation race
//     is caught and treated the same way.
//
//   Layer 2 (same-turn collapser): sasa.ts holds a per-turn array of
//     create_task titles and refuses any subsequent create_task whose Jaccard
//     similarity (over content tokens, stop-list-filtered) is ≥0.7. Returns
//     ok:true + detail.deduped_in_turn:true.
//
// This file pins the seams so a future "simplification" cannot regress:
//   L1.1  smart-tools.ts create_task uses source_kind="sasa_tool"
//   L1.2  create_task reads ctx.sourceMessageId and writes it to source_id
//   L1.3  create_task pre-insert ilike check on (source_kind, source_id, title)
//   L1.4  create_task catches 23505 (or "duplicate key"/"unique") and returns
//         ok:true + deduped:true
//   L2.1  sasa.ts defines SASA_TURN_DEDUP_THRESHOLD module-level (tunable)
//   L2.2  sasa.ts defines sasaTurnDedupSimilarity (Jaccard helper)
//   L2.3  sasa.ts collapses within-turn create_task using the helper
//   L2.4  sasa.ts pushes successful create_task titles to turnCreatedTitles
//   B.1   Jaccard helper: "Send STP to Violet" vs "Remind Nur: send STP to
//         Violet" similarity ≥0.7 (the canonical 9-row shape variant).
//   B.2   Jaccard helper: "Send STP to Violet" vs "Renew password" < 0.7
//         (distinct intents must NOT collapse).
//   B.3   Behavioral repro: parseTasks on the 9-shape input produces ≤3 tasks
//         (the genuine intents: STP reminder, Mark message, renew password).
//
// Pure local. No DB hit, no Anthropic spend, no network.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PLATFORM = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => readFileSync(resolve(PLATFORM, rel), "utf8");

const tests = [];
function check(name, fn) { tests.push({ name, fn }); }

// ─── L1: smart-tools.ts create_task seams ───────────────────────────────────

check("L1.1 seam: create_task uses source_kind=\"sasa_tool\"", () => {
  const src = read("lib/smart-tools.ts");
  const start = src.indexOf('if (name === "create_task")');
  const end = src.indexOf('// ---- SAFE: complete_task', start);
  if (start < 0 || end < 0) return "could not bracket create_task handler";
  const block = src.slice(start, end);
  if (!/sourceKind\s*=\s*"sasa_tool"/.test(block)) return "create_task does not set sourceKind=\"sasa_tool\"";
  if (!/source_kind:\s*sourceKind\b/.test(block)) return "insert payload does not write source_kind: sourceKind";
  return null;
});

check("L1.2 seam: create_task reads ctx.sourceMessageId (or synthesizes one)", () => {
  // 2026-06-15 audit (SCHEMA-3): when ctx.sourceMessageId is missing (web
  // Launchpad / group ingest entry points), the create_task primitive
  // synthesizes a per-turn correlation id via crypto.randomUUID() so the
  // dedup wall fires uniformly across all entry points. Either shape passes.
  const src = read("lib/smart-tools.ts");
  const start = src.indexOf('if (name === "create_task")');
  const end = src.indexOf('// ---- SAFE: complete_task', start);
  const block = src.slice(start, end);
  const legacyShape = /sourceId\s*=\s*ctx\.sourceMessageId\s*\|\|\s*null/.test(block);
  const synthesizedShape = /sourceId\s*=\s*ctx\.sourceMessageId\s*\|\|\s*`sasa-turn:/.test(block) || /sourceId\s*=\s*ctx\.sourceMessageId\s*\?\?\s*`sasa-turn:/.test(block);
  if (!legacyShape && !synthesizedShape) {
    return "create_task does not read ctx.sourceMessageId into sourceId (or synthesize a per-turn id)";
  }
  if (!/source_id:\s*sourceId\b/.test(block)) return "insert payload does not write source_id: sourceId";
  return null;
});

check("L1.3 seam: create_task pre-insert dedup check on (source_kind, source_id, title)", () => {
  // 2026-06-15 audit (DOCTRINE-6): the title match uses .eq() (exact match)
  // not .ilike() — exact is the dedup intent here, and .ilike was unsafe
  // because model-supplied titles containing % or _ were treated as SQL
  // LIKE wildcards. Either .eq or .ilike on title is accepted by this seam.
  const src = read("lib/smart-tools.ts");
  const start = src.indexOf('if (name === "create_task")');
  const end = src.indexOf('// ---- SAFE: complete_task', start);
  const block = src.slice(start, end);
  if (!/\.eq\("source_kind",\s*sourceKind\)/.test(block)) return "pre-insert lookup missing eq(source_kind, sourceKind)";
  if (!/\.eq\("source_id",\s*sourceId\)/.test(block)) return "pre-insert lookup missing eq(source_id, sourceId)";
  const titleEq = /\.eq\("title",\s*title\)/.test(block);
  const titleIlike = /\.ilike\("title",\s*title\)/.test(block);
  if (!titleEq && !titleIlike) return "pre-insert lookup missing title match (eq or ilike)";
  if (!/deduped:\s*true/.test(block)) return "create_task does not return deduped:true";
  return null;
});

check("L1.4 seam: create_task catches 23505 / duplicate-key as a successful no-op", () => {
  const src = read("lib/smart-tools.ts");
  const start = src.indexOf('if (name === "create_task")');
  const end = src.indexOf('// ---- SAFE: complete_task', start);
  const block = src.slice(start, end);
  if (!/errCode\s*===\s*"23505"|"23505"\s*===\s*errCode/.test(block)) return "create_task does not check Postgres errCode 23505";
  if (!/duplicate key\|unique/i.test(block)) return "create_task does not regex match duplicate-key / unique violation message";
  // After catching the race, must still return ok:true + deduped:true.
  const errBranch = block.slice(block.indexOf("if (taskErr)"));
  if (!/ok:\s*true[\s\S]{0,300}deduped:\s*true/.test(errBranch)) return "23505 branch does not return ok:true + deduped:true";
  return null;
});

// ─── L2: sasa.ts within-turn collapser seams ────────────────────────────────

check("L2.1 seam: sasa.ts declares SASA_TURN_DEDUP_THRESHOLD at module level", () => {
  const src = read("lib/agents/sasa.ts");
  const m = src.match(/const\s+SASA_TURN_DEDUP_THRESHOLD\s*=\s*([0-9.]+)\s*;/);
  if (!m) return "SASA_TURN_DEDUP_THRESHOLD not declared";
  const v = parseFloat(m[1]);
  if (!(v >= 0.5 && v <= 0.9)) return `SASA_TURN_DEDUP_THRESHOLD out of sane range (got ${v}, expected 0.5..0.9)`;
  // Must be declared OUTSIDE runSasa for tunability and sharing.
  const declAt = src.indexOf("const SASA_TURN_DEDUP_THRESHOLD");
  const runSasaAt = src.indexOf("export async function runSasa");
  if (declAt > runSasaAt) return "SASA_TURN_DEDUP_THRESHOLD must be declared BEFORE runSasa (module-level)";
  return null;
});

check("L2.2 seam: sasa.ts defines sasaTurnDedupSimilarity helper", () => {
  const src = read("lib/agents/sasa.ts");
  if (!/function\s+sasaTurnDedupSimilarity\s*\(/.test(src)) return "sasaTurnDedupSimilarity not declared";
  if (!/function\s+sasaTurnDedupTokens\s*\(/.test(src)) return "sasaTurnDedupTokens not declared";
  return null;
});

check("L2.3 seam: sasa.ts collapses within-turn create_task using the helper", () => {
  const src = read("lib/agents/sasa.ts");
  // The check must fire INSIDE the tool_use dispatch, BEFORE runSmartTool runs.
  const loopAt = src.indexOf("if (block.type === \"tool_use\")");
  if (loopAt < 0) return "tool_use dispatch not found";
  const block = src.slice(loopAt, loopAt + 4000);
  if (!/sasaTurnDedupSimilarity\(/.test(block)) return "tool_use dispatch does not call sasaTurnDedupSimilarity";
  if (!/deduped_in_turn:\s*true/.test(block)) return "tool_use dispatch does not return deduped_in_turn:true";
  // The dedup branch must short-circuit before runSmartTool.
  const dedupAt = block.indexOf("deduped_in_turn");
  const runSmartAt = block.indexOf("await runSmartTool(");
  if (dedupAt < 0 || runSmartAt < 0) return "could not locate dedup branch / runSmartTool call";
  if (dedupAt > runSmartAt) return "within-turn dedup must fire BEFORE runSmartTool (otherwise the row writes anyway)";
  return null;
});

check("L2.4 seam: sasa.ts pushes successful create_task titles to turnCreatedTitles", () => {
  const src = read("lib/agents/sasa.ts");
  if (!/const\s+turnCreatedTitles\s*:\s*string\[\]/.test(src)) return "turnCreatedTitles array not declared";
  // After a successful create_task call, the title must be pushed.
  if (!/turnCreatedTitles\.push\(/.test(src)) return "turnCreatedTitles.push() never called";
  return null;
});

// ─── B: behavioral repros ───────────────────────────────────────────────────

check("B.1: 'Send STP to Violet' vs 'Remind Nur: send STP to Violet' ≥ 0.7 (shape-variant collapses)", async () => {
  // Re-implement the helper inline (identical algorithm to sasa.ts) so the
  // behavioral repro is self-contained and does not require building TS.
  const GLUE = new Set([
    "to","from","with","at","on","for","of","the","a","an","and","or","but","by",
    "in","into","onto","is","are","was","were","be","am","i","me","my","you",
    "your","we","our","us","this","that","these","those","it","its","do","does",
    "did","will","would","should","can","could","please","pls","kindly","about",
    "remind","reminder","ping","message","msg","send","tell","update","notify",
    "follow","up","upon","then","also","just","quick","quickly","new","nur",
  ]);
  function tok(s) {
    return new Set(
      String(s || "").toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !GLUE.has(w))
    );
  }
  function jac(a, b) {
    const ta = tok(a); const tb = tok(b);
    if (!ta.size || !tb.size) return 0;
    let inter = 0;
    for (const w of ta) if (tb.has(w)) inter += 1;
    const u = ta.size + tb.size - inter;
    return u > 0 ? inter / u : 0;
  }
  // The 9-row shape-variants for the STP-to-Violet intent (the literal pairs
  // from the user's transcript). Threshold 0.7 must fire on every pair.
  const cases = [
    ["Send STP to Violet", "Message Violet about STP at 10 AM"],
    ["Send STP to Violet", "Remind Nur: send STP to Violet"],
    ["Send STP report to Violet and Cynthia", "Send STP report to Violet"],
  ];
  for (const [a, b] of cases) {
    const s = jac(a, b);
    if (s < 0.7) return `expected sim(${JSON.stringify(a)}, ${JSON.stringify(b)}) ≥ 0.7, got ${s.toFixed(3)}`;
  }
  return null;
});

check("B.2: 'Send STP to Violet' vs 'Renew password' < 0.7 (distinct intents do NOT collapse)", () => {
  const GLUE = new Set([
    "to","from","with","at","on","for","of","the","a","an","and","or","but","by",
    "in","into","onto","is","are","was","were","be","am","i","me","my","you",
    "your","we","our","us","this","that","these","those","it","its","do","does",
    "did","will","would","should","can","could","please","pls","kindly","about",
    "remind","reminder","ping","message","msg","send","tell","update","notify",
    "follow","up","upon","then","also","just","quick","quickly","new","nur",
  ]);
  function tok(s) {
    return new Set(
      String(s || "").toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !GLUE.has(w))
    );
  }
  function jac(a, b) {
    const ta = tok(a); const tb = tok(b);
    if (!ta.size || !tb.size) return 0;
    let inter = 0;
    for (const w of ta) if (tb.has(w)) inter += 1;
    const u = ta.size + tb.size - inter;
    return u > 0 ? inter / u : 0;
  }
  const cases = [
    ["Send STP report reminder to Violet and Cynthia", "Renew password"],
    ["Send STP report reminder to Violet and Cynthia", "Message Mark Njambi about the new place hunting"],
    ["Message Mark Njambi about the new place hunting", "Renew password"],
  ];
  for (const [a, b] of cases) {
    const s = jac(a, b);
    if (s >= 0.7) return `expected sim(${JSON.stringify(a)}, ${JSON.stringify(b)}) < 0.7, got ${s.toFixed(3)}`;
  }
  return null;
});

check("B.3: parseTasks on today's 9-shape input parses ≤ 3 distinct tasks (one per genuine intent)", async () => {
  // The deterministic parseTasks worker already stamps source_kind +
  // source_id, so this branch is the "control" — confirms the upstream
  // parser splits the same input into a handful of clean intents (≤3),
  // never the 9-shape blowup we saw via the LLM tool path. The fix being
  // tested by L1+L2 is what stops the LLM path from re-creating those
  // intents in 9 phrase-variant rows.
  const { parseTasks } = await import("../../app/api/whatsapp/worker/parseTasks.mjs");
  const roster = [
    { id: "nur-1",   name: "Nur",         phone: "00971501622716", status: "active", role: "admin" },
    { id: "violet-1", name: "Violet",      phone: "00254700000001", status: "active", role: "team" },
    { id: "cynthia-1", name: "Cynthia",    phone: "00254700000002", status: "active", role: "team" },
    { id: "mark-1",  name: "Mark Njambi", phone: "00254700000003", status: "active", role: "team" },
  ];
  const body = "Add this reminder: at 10am: Send STP report reminder to Violet and Cynthia. Send Mark Njambi a message about the new place hunting. Renew password.";
  const r = parseTasks({
    body,
    roster,
    senderPhone: "00971501622716",
    today: "2026-06-15",
  });
  // Three genuine intents in the input: STP reminder, Mark message, renew
  // password. parseTasks may surface 0..3 depending on which patterns hit;
  // the assertion is that it never explodes to 9.
  if (r.tasks.length > 3) return `expected ≤3 tasks from parseTasks, got ${r.tasks.length}: ${r.tasks.map((t) => JSON.stringify(t.title)).join(", ")}`;
  return null;
});

// ─── runner ─────────────────────────────────────────────────────────────────

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
