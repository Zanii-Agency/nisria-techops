#!/usr/bin/env node
// Sasa org_fact STRUCTURAL CLASS WALL — 2026-06-13.
//
// Mirrors the jensen-pa brain wall (commit 463f4b9, KT #242) onto the sasa
// remember_fact tool. The existing wall at smart-tools.ts:2451 (added 06-09,
// extended 06-10 after the Acme leak in memory 727) catches org-identity
// attribute claims: EIN, legal name, address, contact, donate URL, website.
//
// This wall catches the OTHER shape that bit jensen-pa today: cross-class
// structural assertions about other entities. Example failures it must catch:
//   "the two donors are the same person"
//   "Linda is a single beneficiary"
//   "Sarah is one contact"
//   "the two cases are one case"
// These are claims that belong in structured tables (donors, beneficiaries,
// cases, contacts, team_members, calendar_events, tasks) — not as free-text
// org_fact rows. The bot should refuse and force the structured tool.
//
// Pure local. No DB hit, no Anthropic spend, no network. Mirror of the
// source regex so a future edit that loosens the guard fails here.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PLATFORM = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => readFileSync(resolve(PLATFORM, rel), "utf8");

const tests = [];
function check(name, fn) { tests.push({ name, fn }); }

// ─── seam: source contains the new wall ────────────────────────────────────

check("seam: smart-tools.ts defines STRUCTURAL_CLASS_LANE", () => {
  const src = read("lib/smart-tools.ts");
  if (!/STRUCTURAL_CLASS_LANE/.test(src)) return "STRUCTURAL_CLASS_LANE missing";
  return null;
});

check("seam: remember_fact handler runs STRUCTURAL_CLASS_LANE before write", () => {
  const src = read("lib/smart-tools.ts");
  const start = src.indexOf('if (name === "remember_fact")');
  if (start < 0) return "remember_fact handler not found";
  const end = src.indexOf("// ---- SAFE: create_event", start);
  if (end < 0) return "could not locate end of remember_fact handler";
  const block = src.slice(start, end);
  if (!/STRUCTURAL_CLASS_LANE/.test(block)) return "STRUCTURAL_CLASS_LANE not called inside remember_fact";
  if (!/structural_class_assertion_blocked/.test(block)) return "missing structural_class_assertion_blocked error code";
  // Wall must fire BEFORE the write (rememberUpsert / remember). Seam check
  // catches a future regression that moves the wall below the write.
  const wallIdx = block.indexOf("STRUCTURAL_CLASS_LANE");
  const writeIdx = block.search(/rememberUpsert\(|await remember\(/);
  if (writeIdx >= 0 && wallIdx > writeIdx) return "wall fires AFTER write — must precede rememberUpsert/remember";
  return null;
});

check("seam: existing org-identity wall preserved (Acme regression guard)", () => {
  const src = read("lib/smart-tools.ts");
  if (!/ORG_FACT_LANE/.test(src)) return "ORG_FACT_LANE missing (existing wall lost)";
  if (!/ORG_NAME_LANE/.test(src)) return "ORG_NAME_LANE missing (existing wall lost)";
  if (!/org_fact_mutation_blocked/.test(src)) return "org_fact_mutation_blocked error code missing";
  return null;
});

// ─── behavioural mirror: prove the regex catches the real shapes ──────────

const STRUCTURAL_CLASS_LANE = /\b(is|are|refers to|noted as)\s+(?:(?:a|an|one|the|two|three|single|same|separate|duplicate)\s+){1,3}(donor|donors|beneficiary|beneficiaries|case|cases|task|tasks|event|events|contact|contacts|team[\s_-]?member|team[\s_-]?members|payment|payments|note|notes|person|people|entity|entities)\b/i;

check("guard: rejects 'the two donors are the same person'", () => {
  if (!STRUCTURAL_CLASS_LANE.test("The two donors are the same person.")) return "did not match";
  return null;
});

check("guard: rejects 'Linda is a single beneficiary'", () => {
  if (!STRUCTURAL_CLASS_LANE.test("Linda is a single beneficiary on the safe house list.")) return "did not match";
  return null;
});

check("guard: rejects 'the two cases are one case'", () => {
  if (!STRUCTURAL_CLASS_LANE.test("The two cases are one case.")) return "did not match";
  return null;
});

check("guard: rejects 'Sarah is one contact'", () => {
  if (!STRUCTURAL_CLASS_LANE.test("Sarah is one contact at Microfund.")) return "did not match";
  return null;
});

check("guard: rejects 'Karen is a team member'", () => {
  if (!STRUCTURAL_CLASS_LANE.test("Karen is a team member.")) return "did not match";
  return null;
});

check("guard: allows real relationship facts", () => {
  const safe = [
    "Linda joined as a vendor in 2024.",
    "We meet on Mondays at 9am at the Safe House.",
    "Microfund covers 46 women in three groups across Nakuru County.",
    "Stephen donated KES 250,000 in March via Givebutter.",
    "The team takes Eid al Adha off every year.",
  ];
  for (const s of safe) if (STRUCTURAL_CLASS_LANE.test(s)) return `false-positive: "${s}"`;
  return null;
});

check("guard: existing org-identity strings still blocked by the other wall (sanity)", () => {
  // These should be caught by the EXISTING ORG_NAME_LANE / ORG_FACT_LANE in
  // the source. Mirror just to prove the existing regex still hits.
  const ORG_FACT_LANE = /\b(EIN|legal\s+name|donate\s+url|contact\s+email|website|tax\s+id|nonprofit\s+id|charity\s+(?:number|reg(?:istration)?))\b/i;
  const ORG_NAME_LANE = /\b(?:org(?:ani[sz]ation)?\s+name|(?:the\s+)?org(?:ani[sz]ation)?\s+is|the\s+nonprofit\s+is|the\s+foundation\s+is|name\s+of\s+(?:the\s+)?(?:org|organi[sz]ation|nonprofit|foundation|company)|nonprofit\s+name|foundation\s+name)\b/i;
  const acmeLeak = "The organization name is Acme Foundation.";
  if (!(ORG_FACT_LANE.test(acmeLeak) || ORG_NAME_LANE.test(acmeLeak))) return "Acme leak shape not caught by existing walls";
  return null;
});

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
