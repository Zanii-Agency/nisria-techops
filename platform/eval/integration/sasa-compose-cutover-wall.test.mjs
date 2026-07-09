// sasa-compose-cutover-wall — STATIC source wall (no model, free). Pins the
// flag-gated compose-claims cutover into finalize() so a future edit can't
// silently unwire the correct-by-construction path or flip its default on.
//
// Run: node eval/integration/sasa-compose-cutover-wall.test.mjs

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SA = readFileSync(resolve(HERE, "../../lib/agents/sasa.ts"), "utf8");
const CC = readFileSync(resolve(HERE, "../../lib/agents/compose-claims.mjs"), "utf8");

let pass = 0, fail = 0;
const ok = (n) => { console.log(`PASS  ${n}`); pass++; };
const bad = (n) => { console.log(`FAIL  ${n}`); fail++; };
const want = (cond, n) => (cond ? ok(n) : bad(n));

// 1. The composer is imported and called on rawText (source truth), not the
//    guard-mutated `reply`.
want(/import \{ assembleReply \} from "\.\/compose-claims\.mjs"/.test(SA), "composer imported into sasa.ts");
want(/assembleReply\(rawText, toolRuns\)/.test(SA), "cutover assembles from rawText + toolRuns (source truth)");

// 2. It is flag-gated behind renderActionClaimsEnabled() — DARK by default.
want(/renderActionClaimsEnabled\(\)\s*\)\s*\{[\s\S]{0,400}assembleReply\(rawText, toolRuns\)/.test(SA),
  "cutover is gated behind renderActionClaimsEnabled() (dark default)");

// 3. The flag reads the env var and defaults OFF (no truthy default).
want(/SASA_RENDER_ACTION_CLAIMS === "1" \|\| process\.env\.SASA_RENDER_ACTION_CLAIMS === "true"/.test(SA),
  "flag defaults OFF (env must be explicitly 1/true)");

// 4. The trace-rail seed event is emitted for soak observability.
want(/type: "sasa\.claims_composed"/.test(SA), "emits sasa.claims_composed trace event");

// 5. The core invariant lives in the composer: a claim needs ok===true.
want(/const isOk = \(t\) => t\?\.result\?\.ok === true/.test(CC), "composer gates every claim on receipt ok===true");
want(/no receipt/.test(CC) || /structurally impossible/.test(CC), "composer documents the no-receipt-no-line invariant");

// 6. reconcileSendClaims is still defined (STEP-3 retirement target; its own wall
//    must keep passing until the soak lets us delete it).
want(/function reconcileSendClaims\(/.test(SA), "reconcileSendClaims still defined (retire only post-soak)");

console.log(`\nsasa-compose-cutover-wall: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
