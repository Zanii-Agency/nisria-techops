# Action-claim guard ladder — removed 2026-07-11, recoverable

The ~10 reactive action-claim guards (claimsSendWithoutSend, deniesSendThatHappened,
claimsCompletionWithoutSuccess, plural/sequential mismatch, staged-as-done, relay gate,
claimsToolResultMismatch, reconcileSendClaims + helpers) were removed from
`lib/agents/sasa.ts` after the receipt-composer (`lib/agents/compose-claims.mjs`)
became the unconditional reply path. Kept: conversational safety (fabricated-amount,
sympathy caps, scope-leak strip, loop breaks), deterministic send-state-from-log,
fake-staging money backstop, offer staging.

## Bring it back
    git show sasa-guards-pre-removal:platform/lib/agents/sasa.ts > /tmp/sasa-with-guards.ts
    # or fully revert: git checkout sasa-guards-pre-removal -- platform/lib/agents/sasa.ts
