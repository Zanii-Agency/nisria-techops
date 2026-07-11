// One-shot codemod: excise the action-claim guard chain from sasa.ts and make the
// receipt-composer the unconditional reply path. Anchor-verified: every cut asserts
// its anchors exist exactly once, else the script aborts with NO changes written.
// Recovery: git tag sasa-guards-pre-removal.
import { readFileSync, writeFileSync } from "node:fs";

const FILE = new URL("../lib/agents/sasa.ts", import.meta.url).pathname;
let src = readFileSync(FILE, "utf8");
const before = src.length;
const fail = (m) => { console.error("ABORT (no changes written):", m); process.exit(1); };
const once = (s, label) => {
  const i = src.indexOf(s);
  if (i < 0) fail(`anchor not found: ${label}`);
  if (src.indexOf(s, i + 1) >= 0) fail(`anchor not unique: ${label}`);
  return i;
};
// cut from startAnchor (inclusive) to endAnchor (exclusive), replacing with `repl`
function cut(startAnchor, endAnchor, repl, label) {
  const a = once(startAnchor, `${label}:start`);
  const b = src.indexOf(endAnchor, a);
  if (b < 0) fail(`${label}:end not found after start`);
  src = src.slice(0, a) + repl + src.slice(b);
  console.log(`cut ${label}: removed ${b - a - repl.length} chars`);
}

// CUT 1 — deterministicStagedConfirm primary path (composer renders staged receipts now)
cut(
  "      // PHASE 3 PRIMARY PATH (job-3 fix):",
  "      } else if (sendStateTruth) {",
  "      if (sendStateTruth) {",
  "stagedConfirm-primary"
);

// CUT 2 — completedButOnlyStaged .. claimsUnverifiedSendState (all this-turn claim police)
cut(
  "      } else if (!alreadySubstituted && (() => { const s = completedButOnlyStaged(reply, toolRuns);",
  "      } else if (claimsDeferredWithoutSubscription(reply, toolRuns)) {",
  "",
  "claim-police-mid"
);

// CUT 3 — plural-completion .. completion-without-success (chain tail)
{
  const marker = "// KT #274 (2026-06-15) PASSIVE-PLURAL MISMATCH check";
  const mi = once(marker, "KT274-marker");
  const start = src.lastIndexOf("      } else if ((() => {", mi);
  if (start < 0) fail("KT274 head not found");
  const end = src.indexOf("      } else if (isHedgeLoop(reply, opts.history", mi);
  if (end < 0) fail("isHedgeLoop anchor not found");
  src = src.slice(0, start) + src.slice(end);
  console.log(`cut chain-tail: removed ${end - start} chars`);
}

// CUT 4 — claimsToolResultMismatch backstop block
cut(
  "      // After all existing honesty checks, run post-tool-use verification.",
  "      // RELEVANCE GATE (KT #391",
  "",
  "toolResultMismatch"
);

// INSERT — unconditional composer, right before the KT#357 offer-staging block
{
  const anchor = "      // KT #357 (skeptic #1) — HONEST-OFFER staging.";
  const i = once(anchor, "offer-staging");
  const block = `      // COMPOSER PRIMARY PATH (MASTER-LOOP Stage 2 full-send, 2026-07-11): action
      // confirmations are RENDERED from tool receipts, UNCONDITIONALLY. The model's
      // own action-claim prose is stripped; truth lines exist only where a receipt
      // exists, so a fabricated claim is structurally impossible rather than caught.
      // Deterministic overrides above (send-state-from-log, staging backstop,
      // deferred-promise, loop breaks) win when they fired; the composer owns every
      // other action turn. Recovery of the old regex ladder: tag sasa-guards-pre-removal.
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
  src = src.slice(0, i) + block + src.slice(i);
  console.log("inserted unconditional composer block");
}

// CUT 5 — old flag-gated composer block at finalize tail
cut(
  "    // STAGE 2 (ADR-0017 -> full-send cutover, MASTER-LOOP Stage 2). FLAG-GATED DARK",
  "    return { reply, actions: serialize(actions), toolsRan: toolRuns.map((t) => t.name) };",
  "",
  "old-flag-block"
);

// ORPHAN FUNCTION SWEEP — remove listed top-level functions IF no references remain.
const CANDIDATES = [
  "claimsCompletionWithoutSuccess", "_SASA_COMPLETION_GUARD", "claimsSingularEditWithoutSuccess",
  "extractPluralClaimCount", "claimsPluralCompletionMismatch", "claimedPeople",
  "deniedCompletedAction", "deniesSendThatHappened", "claimsSendWithoutSend",
  "claimsUnverifiedSendState", "recentlySentTo", "extractPluralSendClaim",
  "claimsPluralSendMismatch", "claimsSequentialSendMismatch", "claimsToolResultMismatch",
  "deterministicStagedConfirm", "completedButOnlyStaged", "reconcileSendClaims",
  "renderActionClaimsEnabled", "extractClaimedRecipients", "sentRecipientNames",
  "postedGroupsThisTurn", "readMatchesPerson", "claimsRelayWithoutReceipt", "relaySpineOn",
  "joinNames",
];
// strip __testing entries for removed names first (so they don't count as refs)
for (const n of CANDIDATES) src = src.replace(new RegExp(`^\\s*${n},\\n`, "m"), "");

function removeFn(name) {
  const defRe = new RegExp(`^(export )?(async )?function ${name}\\(`, "m");
  const m = src.match(defRe);
  if (!m) return `no-def`;
  const defIdx = src.indexOf(m[0]);
  const refs = (src.match(new RegExp(`\\b${name}\\b`, "g")) || []).length;
  if (refs > 1) return `kept (${refs - 1} refs remain)`;
  // find the start of the comment block above (contiguous // lines)
  let start = defIdx;
  const lines = src.slice(0, defIdx).split("\n");
  let k = lines.length - 1;
  while (k > 0 && /^\s*\/\//.test(lines[k - 1])) k--;
  start = lines.slice(0, k).join("\n").length + (k > 0 ? 1 : 0);
  // brace-match from the function's opening brace
  const braceStart = src.indexOf("{", defIdx);
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) { i++; break; } }
  }
  while (src[i] === "\n") i++;
  src = src.slice(0, start) + src.slice(i);
  return "removed";
}
// iterate until stable (removing one fn can orphan another)
for (let pass = 0; pass < 5; pass++) {
  let changed = false;
  for (const n of CANDIDATES) {
    const r = removeFn(n);
    if (r === "removed") { console.log(`fn ${n}: removed (pass ${pass})`); changed = true; }
    else if (pass === 0) console.log(`fn ${n}: ${r}`);
  }
  if (!changed) break;
}

writeFileSync(FILE, src);
console.log(`\nDONE. ${before} -> ${src.length} chars (${before - src.length} removed)`);
