// Read-answer guard wall (spec 007 §7, 2026-07-21 open-loop READ incident).
//
// Nur asked "where do I confirm the pending payments?" The turn ran ZERO tools and Sasa answered
// "in the Needs You queue, you have 25 items, tap each to approve or reject" — invented count
// (real: 15), invented location, invented action. She replied "I don't see them". A count or a
// screen location stated from memory is the read-side of the same open loop as a fabricated
// "done". The guard: never state a count/screen/button from memory; only if a tool returned it.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
let failed = 0;
const ok = (m) => console.log(`PASS: ${m}`);
const fail = (m) => { failed++; console.log(`FAIL: ${m}`); };
const spec = readFileSync(resolve(HERE, "../../lib/agents/specialists/index.ts"), "utf8");

if (/NEVER state a specific count[\s\S]{0,120}?from memory/.test(spec))
  ok("G1 the guard forbids stating a count/screen/button from memory");
else fail("G1 NO_SCOPE_LEAK must forbid stating a count/screen/button from memory");

if (/State a number or a place ONLY if a tool THIS turn returned it/.test(spec))
  ok("G2 a number or location may be stated ONLY if a tool returned it this turn");
else fail("G2 the guard must require a tool result before stating a number/location");

if (/never invent a figure or a UI location/.test(spec))
  ok("G3 the guard explicitly bans inventing a figure or UI location");
else fail("G3 the guard must explicitly ban inventing a figure or UI location");

// applies to EVERY lane (NO_SCOPE_LEAK is appended to every domainFocus)
if (/DOMAIN_FOCUS\[domain\]\s*\|\|\s*DOMAIN_FOCUS\.general\)\s*\+\s*NO_SCOPE_LEAK/.test(spec))
  ok("G4 the guard rides NO_SCOPE_LEAK, so it applies to every lane");
else fail("G4 the guard must be part of NO_SCOPE_LEAK (every-lane coverage)");

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
