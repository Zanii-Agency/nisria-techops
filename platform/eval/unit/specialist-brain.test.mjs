// Independent-specialist-brain wall. Proves each mesh lane runs on its OWN compact
// prompt (buildSpecialistSystem) instead of the 56KB buildSystem monolith, that the
// wiring passes it to runSasa, and that the compact brain keeps the non-negotiables
// (tier walls, no-fabrication, brain grounding + cache-split marker).
// Run: node eval/unit/specialist-brain.test.mjs
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SPEC = readFileSync(resolve(HERE, "../../lib/agents/specialists/index.ts"), "utf8");
const SASA = readFileSync(resolve(HERE, "../../lib/agents/sasa.ts"), "utf8");

let pass = 0, fail = 0;
const check = (c, n) => { console.log(`${c ? "PASS" : "FAIL"}  ${n}`); c ? pass++ : fail++; };

// wiring
check(/systemBuilder: buildSpecialistSystem/.test(SPEC), "runSpecialist passes the independent brain to the engine");
check(/opts\.systemBuilder\s*\?\s*opts\.systemBuilder\(/.test(SASA), "runSasa honors systemBuilder over the monolith");
check(/export function buildSpecialistSystem/.test(SPEC), "buildSpecialistSystem exported for tests/introspection");

// the compact brain keeps the non-negotiables
check(/What you know about Nisria \(your standing knowledge from the Brain/.test(SPEC), "compact brain keeps the Brain grounding + cache-split marker");
check(/TEAM TIER WALLS \(hard\)/.test(SPEC), "compact brain keeps the team PII wall");
check(/NEVER invent figures, dates, names, or URLs/.test(SPEC), "compact brain keeps the no-fabrication law");
check(/Movable holidays/.test(SPEC), "compact brain keeps the movable-holiday rule");
check(/never ask permission you do not need/.test(SPEC), "compact brain keeps decisiveness");
// independence: the compact brain must NOT drag in the monolith's incident tomes
check(!/ACT, THEN CONFIRM for TASKS/.test(SPEC), "no mega-prompt task tome in the specialist brain");
check(!/LOGGING IS NOT TELLING/.test(SPEC), "no mega-prompt logging tome (composer owns claims now)");
// rough size sanity: builder template must be a fraction of buildSystem
const tpl = SPEC.slice(SPEC.indexOf("return `You are Sasa"), SPEC.indexOf("Right now: ${snapshot}`"));
check(tpl.length > 0 && tpl.length < 4000, `specialist brain is compact (~${tpl.length} chars of template vs 56KB monolith)`);

console.log(`\nspecialist-brain wall: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
