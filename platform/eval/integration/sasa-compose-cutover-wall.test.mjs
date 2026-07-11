// sasa-compose-cutover-wall — STATIC pins for the UNCONDITIONAL composer era
// (2026-07-11 full-send). Fails if the swamp creeps back or the composer unwires.
// Run: node eval/integration/sasa-compose-cutover-wall.test.mjs
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const SA = readFileSync(resolve(HERE, "../../lib/agents/sasa.ts"), "utf8");
const CC = readFileSync(resolve(HERE, "../../lib/agents/compose-claims.mjs"), "utf8");
let pass = 0, fail = 0;
const want = (c, n) => { console.log(`${c ? "PASS" : "FAIL"}  ${n}`); c ? pass++ : fail++; };
want(/import \{ assembleReply \} from "\.\/compose-claims\.mjs"/.test(SA), "composer imported");
want(/COMPOSER PRIMARY PATH/.test(SA) && /assembleReply\(reply, toolRuns, \{ isCommitting/.test(SA), "composer wired as PRIMARY path");
want(!/renderActionClaimsEnabled|SASA_RENDER_ACTION_CLAIMS/.test(SA), "NO flag gate: composer is unconditional");
want(/PURE-LIE TURN/.test(SA) && /toolAsk\?\.result as any\)\?\.summary/.test(SA), "pure-lie fallback present, prefers tool's own reason");
// 2026-07-11 22:50 rebuild: the exemption now requires isReadIntent AND real
// substance (hasSubstance) together — a bare "Done." never survives on any
// turn, closing the live incident this same night. KT #235 still protected:
// a read-shaped claim that NAMES something ("the Gilgil task is done") passes.
want(/isReadIntent\(opts\.command \|\| "", opts\.history\)\s*&&\s*hasSubstance/.test(SA), "pure-lie fallback exempts read-shaped turns WITH real substance (KT #235 + KT #206669)");
want(/type: "sasa\.claims_composed"/.test(SA), "claims_composed trace event emitted");
// the swamp must STAY gone
for (const g of ["claimsSendWithoutSend","claimsCompletionWithoutSuccess","deniesSendThatHappened","reconcileSendClaims","claimsToolResultMismatch","deterministicStagedConfirm","completedButOnlyStaged","claimsPluralSendMismatch","claimsSequentialSendMismatch","claimsUnverifiedSendState","claimsSingularEditWithoutSuccess","claimsPluralCompletionMismatch"]) {
  want(!new RegExp(`function ${g}\\(`).test(SA), `swamp stays gone: ${g}`);
}
want(/const isOk = \(t\) => t\?\.result\?\.ok === true/.test(CC), "composer gates every claim on ok===true");
console.log(`\ncutover wall: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
