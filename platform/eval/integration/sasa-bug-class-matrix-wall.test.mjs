// BUG-CLASS → DEFENSE MATRIX (2026-07-11). Every failure class Sasa has recorded
// across 11 months (each was a real incident; KT numbers preserved), pinned to the
// defense that now owns it. If a defense is deleted/renamed without a successor,
// this wall goes red. Behavioral proofs live in sasa-composer-incidents-wall +
// eval/unit/compose-claims.test.mjs; this is the coverage LEDGER.
//
// Run: node eval/integration/sasa-bug-class-matrix-wall.test.mjs

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SASA = readFileSync(resolve(HERE, "../../lib/agents/sasa.ts"), "utf8");
const CC = readFileSync(resolve(HERE, "../../lib/agents/compose-claims.mjs"), "utf8");
const ORCH = readFileSync(resolve(HERE, "../../lib/agents/orchestrator.ts"), "utf8");
const SPEC = readFileSync(resolve(HERE, "../../lib/agents/specialists/index.ts"), "utf8");

let pass = 0, fail = 0;
const pin = (cls, cond, defense) => {
  console.log(`${cond ? "PASS" : "FAIL"}  [${cls}] → ${defense}`);
  cond ? pass++ : fail++;
};

// ── the composer family (claims about THIS turn's actions) ──────────────────
pin("false-send claim (KT #206547)", /COMPOSER PRIMARY PATH/.test(SASA) && /stripModelActionClaims/.test(CC), "composer strip + receipt render");
pin("false denial of real send (2026-06-22)", /Sent to \$\{to\}\./.test(CC), "receipt truth line supersedes denial");
pin("plural/sequential send inflation (KT #274/#287)", /filter\(\(l\) => l && !conversational\.includes/.test(CC), "per-receipt lines only; stripped lie can't block truth");
pin("staged-as-done money (honesty-cluster #9)", /d\.staged === true \|\| d\.awaiting_confirm === true/.test(CC), "staged renders receipt's own confirm summary");
pin("wrong-recipient name variant (2026-07-01)", /d\.to \|\| "them"/.test(CC), "recipient name comes from the receipt, never prose");
pin("singular fabricated edit (KT #342/#347)", /(?:is\|are) now \(\?:set/.test(CC) || /is\|are\) now/.test(CC), "third-person edit-claim verbs in strip net");
pin("mute-bot on unlisted committing tools (2026-07-11)", /GENERIC COMMITTING RECEIPT/.test(CC), "generic receipt rendering, isCommitting-gated");
pin("pure-lie turn shipping original prose (2026-07-11)", /PURE-LIE TURN/.test(SASA), "honest fallback w/ tool's own reason, read-exempt (KT #235)");

// ── deterministic DB-truth organs (past turns; composer can't see them) ─────
pin("unverified send-state answer (KT #313/#206549)", /sendStateTruth = await answerSendStateFromLog/.test(SASA), "head override answers from outbound log");
pin("cross-turn double-send (KT #372/#373)", /recentlySentTo\(db, named/.test(SASA), "8-min proactive-record rescue before strip");

// ── money + figures ──────────────────────────────────────────────────────────
pin("fabricated amounts (2026-06-07 Nur audit)", /findFabricatedAmounts\(reply, opts\.command, toolRuns\)/.test(SASA), "kept money-figure guard, replace not caveat");
pin("fake staging claim (v1.3.9)", /claimsStagingWithoutTool\(reply, toolRuns\)/.test(SASA), "kept backstop: parse + really stage, or honest hedge");

// ── conversation-shape failures ──────────────────────────────────────────────
pin("canned-guard parroting (KT #391)", /RELEVANCE GATE \(KT #391/.test(SASA), "relevance gate kept");
pin("question/hedge loops (KT #235/#317)", /isHedgeLoop\(reply, opts\.history/.test(SASA) && /repeatsLastQuestion/.test(SASA), "loop breaks kept");
pin("hollow deferred promise (KT #206542)", /claimsDeferredWithoutSubscription\(reply, toolRuns\)/.test(SASA), "kept: promise requires a subscription receipt");
pin("repeated sympathy cascade (Nur audit)", /apologyExceeded\(opts\.history\)/.test(SASA), "sympathy caps kept");
pin("scope/meta leak (honesty #2/#12)", /META_SCOPE_LEAK\.test\(reply\)/.test(SASA) && /NEVER describe how you are organized internally/.test(SPEC), "strip + NO_SCOPE_LEAK in every lane");

// ── targeting + duplication ──────────────────────────────────────────────────
pin("wrong-referent mutation (spec 006)", /SWIPE-REPLY ANCHOR \(HARD WALL\)/.test(SASA) && /sasa\.referent_set/.test(SASA), "anchor walls + referent capture kept");
pin("task duplication blowup (9-row incident)", /sasaTurnDedupSimilarity/.test(SASA) && /parseTasks_already_wrote/.test(SASA), "turn dedup + stripSet kept");
pin("fabricated holiday dates", /Movable holidays/.test(SPEC) && /HOLIDAY DATES YOU DO NOT KNOW BY HEART/.test(SASA), "rule in BOTH brains (specialist + monolith/group)");

// ── mesh-structure failures ──────────────────────────────────────────────────
pin("PII leak to team tier (KT #367)", /TEAM TIER WALLS \(hard\)/.test(SPEC), "tier walls in the specialist brain + manifest tool scoping");
pin("cross-lane tool escape", /tool_not_in_scope/.test(SASA), "dispatch-time hard wall rejects out-of-scope tool_use");
pin("cross-domain knowledge leakage", /checkDomainLeakage/.test(ORCH), "post-turn leakage guard + mesh.domain_leakage event");
pin("synthesizer re-lie on multi-step (2026-07-11)", /SYNTHESIS HONESTY/.test(ORCH) && /stripModelActionClaims/.test(ORCH), "lead-in-only synthesis, step replies verbatim");
pin("mesh blind spots in prod", /correlation_id: traceId/.test(ORCH) && /sasa\.claims_composed/.test(SASA), "trace rail: every span on one traceId");
pin("gym grading the wrong brain (2026-07-11)", /GYM AIMS AT THE LIVE BRAIN/.test(SASA), "evalSasaMulti runs the specialist prompt when domain given");

console.log(`\nbug-class matrix: ${pass} pinned, ${fail} unguarded`);
process.exit(fail === 0 ? 0 : 1);
