// COMPOSER INCIDENTS WALL — every retired guard-era wall's core incident, re-proven
// against the NEW path (assembleReply). Pure, no network, no DB. If any of these
// regress, a real past failure (each dated, each caught by Nur live) is back.
// Retired originals: eval/legacy/. Old guard code: tag sasa-guards-pre-removal.
//
// Run: node eval/integration/sasa-composer-incidents-wall.test.mjs

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assembleReply } from "../../lib/agents/compose-claims.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SASA = readFileSync(resolve(HERE, "../../lib/agents/sasa.ts"), "utf8");

let pass = 0, fail = 0;
const check = (cond, note) => { console.log(`${cond ? "PASS" : "FAIL"}  ${note}`); cond ? pass++ : fail++; };
const sent = (to) => ({ name: "message_person", result: { ok: true, detail: { delivered: true, to, via: "whatsapp" } } });

// ── fab-send (KT #287, 2026-06-15): "Both messages are sent. Violet and Cynthia have
//    been reminded" while ONLY Violet delivered → Cynthia must not survive as sent.
{
  const a = assembleReply("Done. Both messages are sent. Violet and Cynthia have been reminded that the STP report is due today.", [sent("Violet")]);
  check(/Sent to Violet\./.test(a.reply), "fab-send: delivered recipient rendered");
  check(!/Cynthia/.test(a.reply), "fab-send: undelivered recipient cannot be claimed");
}
// ── sequential narration (HONESTY-2): "Sent to Violet. Sent to Cynthia." partial.
{
  const a = assembleReply("Sent to Violet. Sent to Cynthia.", [sent("Violet")]);
  check(/Sent to Violet\./.test(a.reply) && !/Cynthia/.test(a.reply), "sequential partial: only the real send survives");
}
// ── false-no-send (Nur 2026-06-22): send DID land, model denied it.
{
  const a = assembleReply("I logged that, but I have not actually messaged Mark yet. Want me to?", [sent("Mark")]);
  check(/Sent to Mark\./.test(a.reply), "false denial: truth line rendered from receipt");
  check(!/not actually messaged/.test(a.reply), "false denial: the denial is stripped");
}
// ── group-send honesty (Dorcas 2026-07-01): claims posted with no receipt / real post renders.
{
  const lie = assembleReply("Posted the update to the Finances group.", []);
  check(lie.reply === "", "group: unbacked post claim stripped to nothing");
  const real = assembleReply("Okay.", [{ name: "post_to_group", result: { ok: true, summary: 'Queued to the "Finances" group.', detail: { group: "Finances" } } }]);
  check(/Posted to the Finances group\./.test(real.reply), "group: real post receipt renders");
}
// ── relay-colleague (KT #368): relay claim needs a receipt; queued never reads delivered.
{
  const lie = assembleReply("Passed it to Grace. I told them it's from you.", []);
  check(lie.reply === "", "relay: unbacked relay claim stripped");
  const real = assembleReply("", [{ name: "relay_to_colleague", result: { ok: true, detail: { delivered: true, to: "Grace" } } }]);
  check(/Passed it to Grace/.test(real.reply), "relay: delivered relay renders");
  const held = assembleReply("", [{ name: "relay_to_colleague", result: { ok: true, detail: { delivered: false, queued: true, to: "Grace" } } }]);
  check(!/Passed it/.test(held.reply) && /moment they next message in/.test(held.reply), "relay: queued renders as held, never delivered");
}
// ── send-name-variant ("What did you send?!!!" 2026-07-01): wrong name in claim.
{
  const a = assembleReply("Sent to Marc.", [sent("Mark")]);
  check(/Sent to Mark\./.test(a.reply) && !/Marc\b/.test(a.reply), "name-variant: receipt name wins over model's variant");
}
// ── singular fabricated edit (KT #342, SANARA date): no receipt, no edit claim.
{
  const a = assembleReply("The SANARA graduation task is now set to July 10.", []);
  check(a.reply === "", "singular-edit: fabricated third-person edit stripped");
}
// ── task-frag: one real create + one dedup must not read as two fresh tasks.
{
  const a = assembleReply("Logged three tasks for you.", [
    { name: "create_task", result: { ok: true, summary: 'Created the task "Send STP", Nur.', detail: { task_id: "t1" } } },
    { name: "create_task", result: { ok: true, summary: "Task already on the board.", detail: { task_id: "t1", deduped: true } } },
  ]);
  check(/Logged the task "Send STP"\./.test(a.reply), "task-frag: real create renders once");
  check(/Already on the task board\./.test(a.reply), "task-frag: dedup renders as already-there");
  check(!/three tasks/.test(a.reply), "task-frag: the inflated plural claim is stripped");
}
// ── staged-is-not-done (honesty-cluster #9): staged money renders its receipt summary.
{
  const a = assembleReply("Logged the payment.", [{ name: "record_payment", result: { ok: true, summary: "Ready to log KES 4,000 to Dorcas. Reply yes to confirm.", detail: { staged: true } } }]);
  check(/Ready to log KES 4,000/.test(a.reply) && /Reply yes/.test(a.reply), "staged: receipt's own confirm summary renders");
  check(!/^Logged the payment/.test(a.reply), "staged: the false 'Logged' does not lead the reply");
}
// ── KEPT-ORGAN PINS (from retired unverified-send-state wall): the deterministic
//    send-state answer from the outbound LOG must stay wired at the finalize head.
check(/SEND_STATE_QUESTION\.test\(String\(opts\.command/.test(SASA), "kept: head override keys on SEND_STATE_QUESTION");
check(/sendStateTruth = await answerSendStateFromLog\(db, opts, reply, n\)/.test(SASA), "kept: answerSendStateFromLog wired at head");
check(/sasa\.send_state_answered_from_log/.test(SASA), "kept: send-state answer emits its event");
// ── money-figure + conversational guards must have survived the swamp removal.
check(/findFabricatedAmounts\(reply, opts\.command, toolRuns\)/.test(SASA), "kept: fabricated-amount money guard");
check(/META_SCOPE_LEAK\.test\(reply\)/.test(SASA), "kept: scope-leak strip");
check(/alreadySympathized\(opts\.history\)/.test(SASA), "kept: sympathy cap");
check(/claimsStagingWithoutTool\(reply, toolRuns\)/.test(SASA), "kept: fake-staging money backstop");
check(/claimsDeferredWithoutSubscription\(reply, toolRuns\)/.test(SASA), "kept: hollow deferred-promise guard");

// ── pins ported from the second retirement batch (2026-07-11) ──
const CC = readFileSync(resolve(HERE, "../../lib/agents/compose-claims.mjs"), "utf8");
check(/GENERIC COMMITTING RECEIPT/.test(CC), "kept: generic committing receipts render (beneficiary-add never eaten/mute)");
check(/recentlySentTo\(db, named, opts\.command \|\| "", String\(reply \|\| ""\), 8\)/.test(SASA), "kept: cross-turn send rescue, tight 8-min window (KT #372/#373)");
check(/PURE-LIE TURN/.test(SASA) && /Tell me exactly what you want done and I will do it now\./.test(SASA), "kept: pure-lie fallback gives a concrete next step (no dead-end snag)");
check(/!inGroup && \(opts\.operatorRank === "owner" \|\| opts\.operatorRank === "founder"\)/.test(SASA), "kept: send-state head override tier-gated owner/founder private");
check(/d\.staged === true \|\| d\.awaiting_confirm === true/.test(CC), "kept: staged rendering keys on receipt ground truth (staged-not-done)");
check(/passed it/.test(CC), "kept: strip regex covers relay verbs (honest-spine H1)");

console.log(`\ncomposer-incidents wall: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
