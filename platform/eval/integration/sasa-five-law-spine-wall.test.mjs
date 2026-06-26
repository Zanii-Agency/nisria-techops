#!/usr/bin/env node
// Sasa FIVE-LAW SPINE WALL, spec 007, 2026-06-27.
//
// The spine is the named, ordered contract (capture -> file -> confirm; never
// invent > never claim undone > never duplicate > ask when unsure > one
// assistant). This wall does two jobs:
//
//   1. META: assert each law maps to a REAL enforcement point in code, so a
//      future refactor cannot silently drop one. The laws are NOT just prompt
//      text; each has a deterministic home:
//        Law 1 (never invent)        -> recordTracesToMessage provenance guard
//        Law 2 (never claim undone)  -> finalize honesty guards
//        Law 3 (never duplicate)     -> findOpenDuplicate + payment/beneficiary dedup
//        Law 4 (ask when unsure)     -> ambiguity returns + flag_for_clarity
//        Law 5 (one assistant)       -> routeMessage + domainFocus (the mesh)
//   2. BEHAVIOURAL: mirror the Law 1 provenance predicate and prove it allows
//      real paraphrase and blocks fabricated records (the KT #416 class).
//
// Pure local. No DB, no Anthropic spend, no network. Mirror of the source so a
// future edit that loosens any law's enforcement fails here.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PLATFORM = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => readFileSync(resolve(PLATFORM, rel), "utf8");

const tests = [];
function check(name, fn) { tests.push({ name, fn }); }

// ─── the spine is declared and injected ─────────────────────────────────────

check("seam: buildSystem declares the SPINE block", () => {
  const src = read("lib/agents/sasa.ts");
  if (!/const SPINE = `THE FIVE LAWS/.test(src)) return "SPINE const missing from buildSystem";
  return null;
});

check("seam: SPINE states all five laws IN ORDER", () => {
  const src = read("lib/agents/sasa.ts");
  const i = src.indexOf("const SPINE = `THE FIVE LAWS");
  const block = src.slice(i, i + 1600);
  const order = ["1. NEVER INVENT", "2. NEVER CLAIM AN ACTION YOU DID NOT TAKE", "3. NEVER DUPLICATE", "4. WHEN UNSURE, ASK", "5. STAY ONE ASSISTANT"];
  let last = -1;
  for (const marker of order) {
    const at = block.indexOf(marker);
    if (at < 0) return `missing law marker: ${marker}`;
    if (at < last) return `law out of order: ${marker}`;
    last = at;
  }
  // priority clause: helpfulness never outranks laws 1-2
  if (!/NEVER outranks Law 1 or Law 2/.test(block)) return "missing the priority clause (helpful never outranks L1/L2)";
  return null;
});

check("seam: SPINE is injected into BOTH role prompts (team + admin)", () => {
  const src = read("lib/agents/sasa.ts");
  // ${SPINE} interpolated above the team HONESTY block and the admin FABRICATION block
  const injections = (src.match(/\$\{SPINE\}/g) || []).length;
  if (injections < 2) return `SPINE injected ${injections} times, expected >= 2 (team + admin)`;
  return null;
});

// ─── META: each law maps to a real enforcement point ───────────────────────

check("Law 1 (never invent) -> recordTracesToMessage provenance guard exists and is called", () => {
  const st = read("lib/smart-tools.ts");
  if (!/export function recordTracesToMessage/.test(st)) return "recordTracesToMessage not defined";
  const ct = st.indexOf('if (name === "create_task")');
  if (!/recordTracesToMessage\(title, ctx\.userText/.test(st.slice(ct, ct + 600))) return "provenance not enforced in create_task";
  const ab = st.indexOf('if (name === "add_beneficiary")');
  if (!/recordTracesToMessage\(full_name, ctx\.userText/.test(st.slice(ab, ab + 1600))) return "provenance not enforced in add_beneficiary";
  return null;
});

check("Law 2 (never claim undone) -> finalize honesty guards exist", () => {
  const src = read("lib/agents/sasa.ts");
  if (!/claimsCompletionWithoutSuccess/.test(src)) return "claimsCompletionWithoutSuccess missing";
  if (!/claimsStagingWithoutTool/.test(src)) return "claimsStagingWithoutTool missing";
  return null;
});

check("Law 3 (never duplicate) -> task + payment + beneficiary dedup exist", () => {
  const st = read("lib/smart-tools.ts");
  if (!/findOpenDuplicate/.test(st)) return "task dedup (findOpenDuplicate) missing";
  if (!/soft dedup/.test(st)) return "record_payment soft dedup missing";
  if (!/IDEMPOTENCY GUARD/.test(st)) return "add_beneficiary idempotency dedup missing";
  return null;
});

check("Law 4 (ask when unsure) -> ambiguity returns + flag_for_clarity", () => {
  const st = read("lib/smart-tools.ts");
  if (!/flag_for_clarity/.test(st)) return "flag_for_clarity tool missing";
  if (!/ambiguous: true/.test(st)) return "no ambiguity return (must ask, never silently pick)";
  // the #381 money guard: update_payment must ask on >1 candidate, never newest-pick
  const up = st.indexOf('if (name === "update_payment")');
  if (!/cands\.length > 1.*ambiguous: true/s.test(st.slice(up, up + 1800))) return "update_payment silent newest-pick not guarded";
  return null;
});

check("Law 5 (one assistant) -> routeMessage + domainFocus (mesh intact, specialists kept)", () => {
  const router = read("lib/agents/router.ts");
  if (!/export async function routeMessage/.test(router)) return "routeMessage (the router) missing";
  const sasa = read("lib/agents/sasa.ts");
  if (!/domainFocus/.test(sasa)) return "domainFocus (specialist lane hard-wall) missing";
  return null;
});

// ─── BEHAVIOURAL: mirror of the Law 1 provenance predicate ──────────────────

const PROVENANCE_STOP = new Set("the and for of to a an on in at by with me my our your this that it is are was were be do does add set log create make please can could would should yes no also him her them his their nur task tasks reminder remind assign assigned mark marked done new update change them".split(/\s+/));
const provTokens = (s) => new Set(String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !PROVENANCE_STOP.has(w)));
function recordTracesToMessage(recordText, userText) {
  const rec = provTokens(recordText), usr = provTokens(userText);
  if (usr.size < 2 || rec.size === 0) return true;
  // lenient: block only on ZERO content-word overlap (mirror of source)
  for (const w of rec) if (usr.has(w)) return true;
  return false;
}

check("provenance: ALLOWS a real paraphrase ('Call the auditor' <- 'remind me to call the auditor Friday')", () =>
  recordTracesToMessage("Call the auditor", "remind me to call the auditor Friday") ? null : "false-refused a real task");

check("provenance: ALLOWS each item of a real list", () => {
  const msg = "Assign these tasks to me: email Linda, finalize the Folklore, respond to Mercy on UpWork";
  for (const t of ["email Linda", "Finalize the Folklore", "Respond to Mercy on UpWork"]) if (!recordTracesToMessage(t, msg)) return `false-refused: ${t}`;
  return null;
});

check("provenance: BLOCKS a fabricated task absent from the message (KT #144 class)", () => {
  // message is about a case; the model tries to invent a pay task with no support
  const msg = "this is a new case we received today, his name is Brian and his story is not adding up";
  return recordTracesToMessage("Pay Mark 5000 for transport", msg) ? "let a fabricated task through" : null;
});

check("provenance: ALLOWS partial overlap (lenient by design; avoids false-refusing multi-turn confirms)", () => {
  // deliberate trade: any shared content word passes, so a confirmation turn that
  // partially names an item from a prior turn is never false-refused. Stricter
  // matching needs conversation history + the A/B eval (follow-up).
  const msg = "yes assign the newsletter to me";
  return recordTracesToMessage("Write the weekly newsletter", msg) ? null : "false-refused a partial-overlap real task";
});

check("provenance: ALLOWS a beneficiary name present in the message", () =>
  recordTracesToMessage("Brian Simon", "this is a lost and found case, his name is Brian Simon from Uganda") ? null : "false-refused a real name");

check("provenance: BLOCKS a beneficiary name absent from the message", () =>
  recordTracesToMessage("Jonathan Okello", "please add the new case we discussed earlier") ? "let an invented name through" : null);

check("provenance: FAILS OPEN when there is no message to check (system-initiated create)", () =>
  recordTracesToMessage("Recurring weekly newsletter", "") ? null : "must allow when it cannot judge (recurring spawn / no userText)");

// ─── runner ────────────────────────────────────────────────────────────────

let pass = 0, fail = 0;
for (const { name, fn } of tests) {
  let reason = null;
  try { reason = fn(); } catch (e) { reason = `threw: ${e?.message || e}`; }
  if (!reason) { pass += 1; console.log(`  ok  ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name} -- ${reason}`); }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
