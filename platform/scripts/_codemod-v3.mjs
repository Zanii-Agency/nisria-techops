import { readFileSync, writeFileSync } from "node:fs";
const FILE = new URL("../lib/agents/sasa.ts", import.meta.url).pathname;
let src = readFileSync(FILE, "utf8");
const before = src.length;
const fail = (m) => { console.error("ABORT:", m); process.exit(1); };
const once = (s, l) => { const i = src.indexOf(s); if (i < 0) fail(`missing ${l}`); if (src.indexOf(s, i + 1) >= 0) fail(`dup ${l}`); return i; };
function cut(sa, ea, repl, label) {
  const a = once(sa, label + ":s"); const b = src.indexOf(ea, a); if (b < 0) fail(label + ":e");
  src = src.slice(0, a) + repl + src.slice(b); console.log(`cut ${label}: -${b - a - repl.length}`);
}
// block cuts (same anchors as before — they were correct)
cut("      // PHASE 3 PRIMARY PATH (job-3 fix):", "      } else if (sendStateTruth) {", "      if (sendStateTruth) {", "stagedConfirm");
cut("      } else if (!alreadySubstituted && (() => { const s = completedButOnlyStaged(reply, toolRuns);", "      } else if (claimsDeferredWithoutSubscription(reply, toolRuns)) {", "", "police-mid");
{
  const mi = once("// KT #274 (2026-06-15) PASSIVE-PLURAL MISMATCH check", "kt274");
  const start = src.lastIndexOf("      } else if ((() => {", mi); if (start < 0) fail("kt274 head");
  const end = src.indexOf("      } else if (isHedgeLoop(reply, opts.history", mi); if (end < 0) fail("hedge anchor");
  src = src.slice(0, start) + src.slice(end); console.log(`cut chain-tail: -${end - start}`);
}
cut("      // After all existing honesty checks, run post-tool-use verification.", "      // RELEVANCE GATE (KT #391", "", "toolResultMismatch");
{
  const i = once("      // KT #357 (skeptic #1) — HONEST-OFFER staging.", "offer");
  const block = `      // COMPOSER PRIMARY PATH (MASTER-LOOP Stage 2 full-send, 2026-07-11): action
      // confirmations are RENDERED from tool receipts, UNCONDITIONALLY. The model's
      // own action-claim prose is stripped; truth lines exist only where a receipt
      // exists, so a fabricated claim is structurally impossible rather than caught
      // after the fact. Deterministic overrides above (send-state-from-log, staging
      // backstop, deferred-promise, loop breaks) win when they fired; the composer
      // owns every other action turn. Old regex ladder: tag sasa-guards-pre-removal.
      if (!alreadySubstituted) {
        try {
          const assembled = assembleReply(reply, toolRuns);
          if (assembled.reply && assembled.reply !== reply) {
            reply = humanize(assembled.reply, { now: { long: n.long, today: n.today } });
          }
          try {
            const { emit } = await import("../events");
            await emit({
              type: "sasa.claims_composed", source: "agent:sasa", actor: opts.operatorName || "?",
              subject_type: "contact", subject_id: opts.contactId || null, correlation_id: opts.traceId || null,
              payload: { classes: assembled.composed.classes, claim_count: assembled.composed.claims.length, overrode_reply: assembled.reply !== reply, command: String(opts.command || "").slice(0, 160) },
            });
          } catch {}
        } catch { /* composer must never break the reply */ }
      }
`;
  src = src.slice(0, i) + block + src.slice(i); console.log("inserted composer");
}
cut("    // STAGE 2 (ADR-0017 -> full-send cutover, MASTER-LOOP Stage 2). FLAG-GATED DARK", "    return { reply, actions: serialize(actions), toolsRan: toolRuns.map((t) => t.name) };", "", "old-flag-block");

// __testing cleanup for names being removed
const NAMES = ["claimsCompletionWithoutSuccess","_SASA_COMPLETION_GUARD","claimsSingularEditWithoutSuccess","extractPluralClaimCount","claimsPluralCompletionMismatch","claimedPeople","deniedCompletedAction","deniesSendThatHappened","claimsSendWithoutSend","claimsUnverifiedSendState","recentlySentTo","extractPluralSendClaim","claimsPluralSendMismatch","claimsSequentialSendMismatch","claimsToolResultMismatch","deterministicStagedConfirm","completedButOnlyStaged","reconcileSendClaims","renderActionClaimsEnabled","extractClaimedRecipients","sentRecipientNames","postedGroupsThisTurn","readMatchesPerson","joinNames"];
for (const n of NAMES) src = src.replace(new RegExp(`^\\s*${n},\\n`, "m"), "");

// column-0 function removal: def line .. first line that is exactly "}" at col 0
const codeRefs = (name) => src.split("\n").filter((l) => {
  const c = l.replace(/\/\/.*$/, "");
  return new RegExp(`\\b${name}\\b`).test(c) && !new RegExp(`^(export )?(async )?function ${name}\\(`).test(c);
}).length;
function removeFn(name) {
  const re = new RegExp(`^(export )?(async )?function ${name}\\(`, "m");
  const m = src.match(re); if (!m) return "no-def";
  if (codeRefs(name) > 0) return `KEPT ${codeRefs(name)} refs`;
  const defIdx = src.indexOf(m[0]);
  const pre = src.slice(0, defIdx).split("\n");
  let k = pre.length - 1;
  while (k > 0 && /^\s*\/\//.test(pre[k - 1])) k--;
  const start = pre.slice(0, k).join("\n").length + (k > 0 ? 1 : 0);
  const endMatch = src.slice(defIdx).match(/^\}\n/m);
  if (!endMatch) return "no-end";
  let end = defIdx + endMatch.index + 2;
  src = src.slice(0, start) + src.slice(end);
  return "removed";
}
for (let p = 0; p < 6; p++) { let ch = false; for (const n of NAMES) { const r = removeFn(n); if (r === "removed") { console.log(`${n}: removed`); ch = true; } else if (!p && r !== "no-def") console.log(`${n}: ${r}`); } if (!ch) break; }
writeFileSync(FILE, src);
console.log(`DONE ${before} -> ${src.length} (-${before - src.length})`);
