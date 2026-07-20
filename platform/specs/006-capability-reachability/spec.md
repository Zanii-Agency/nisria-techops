# Spec 006 — Capability reachability: handoff, not de-scoping

Status: DRAFT · 2026-07-20 · supersedes the "drop domain tool-scoping" proposal, which was refuted

## Problem

A 91-phrase audit of real operator phrasings, routed through production `routeMessage`
(`routeOnly`, no side effects) and checked against the tools the winning lane actually holds,
found **32 dead-ends (35%)**. The request reached a lane that did not carry the tool needed to
answer, so Sasa deflected ("I'll flag this for Taona") while the tool sat one lane over.

Widening 13 read tools plus one router pattern took it to **14–15 (16%)**. The residual is
structural, not a tuning gap:

- **12 of the remaining 15 are at confidence ≥ 0.7.** The multi-intent decomposition safety net
  in `orchestrator.ts:75` only fires *below* 0.7, so it runs on ~4 of 91 messages. The recovery
  path is gated on the one signal that fails silently: confidently wrong looks exactly like
  confidently right.
- **There is no other recovery.** Grep found no handoff, reroute, or retry-with-another-domain.
  One classifier decision, made before the model reads anything, permanently determines
  capability for that turn.
- **Some messages have no single correct lane by construction** ("remind cynthia about the
  shipment and also whats our stock at").

A nonzero failure rate is therefore guaranteed by the design. Every fix so far, including
today's, made the classifier more accurate. Accuracy is the wrong lever.

## What was proposed, and why it was wrong

**Proposed:** drop domain tool-scoping for the admin tier, keep tier scoping, keep domain routing
for prompt focus only. Rationale: `compose-claims.mjs` renders action claims deterministically
from receipts, so a false claim is structurally impossible regardless of which tools are held —
making domain scoping insurance against an already-solved failure.

**Refuted, fatally.** Domain scoping is not hallucination insurance. It is the **dispatch-time
security wall**, and the code says so:

```
sasa.ts:1984   if (!allowedToolNameSet.has(block.name)) -> tool_not_in_scope
sasa.ts:1452   "HARD WALL (dispatch-time enforcement): the toolset is the security boundary,
                NOT the model's tool list"
sasa.ts:1979   "This is the real isolation boundary... an injection naming an out-of-scope or
                ungated tool is refused before runSmartTool ever sees it"
```

That set is built from `opts.allowedToolNames`, i.e. from the domain scope. It is the
**prompt-injection defense**. Drop it for admin and `base = SMART_TOOLS` (all 144) — the wall
stops rejecting anything.

**And the composer is on the wrong side of the damage.** Execution order, proven:

```
sasa.ts:2019   const out = await runSmartTool(...)   <- the write EXECUTES
sasa.ts:2030   receipt pushed to toolRuns            <- after the write
sasa.ts:1774   the composer runs, inside finalize()  <- after that
```

The composer only ever sees receipts of writes that already landed. It can make the sentence
honest ("Transferred ownership of the suppliers sheet to cynthia@nisria.co"). It cannot
un-transfer it. The proposal removed the only pre-write gate and offered a post-write narrator
as the replacement. Different seams; the narrator is downstream of the harm.

**Only 10 tools are confirm-gated** (`DELETE_TOOLS` at `smart-tools.ts:1870`, `MERGE_TOOLS` at
1893, plus `record_payment` and `log_payout`). `delete_task`, `delete_beneficiary`,
`transfer_drive_file`, `set_bot_access` are **not** — they execute on model judgment alone.
~33 tools exist where the call itself is the damage.

## Decision

**Keep the wall. Build the missing recovery path at the wall.**

Today a scope rejection returns a deflection. Instead, on `tool_not_in_scope`, re-dispatch the
turn to the lane that owns the tool. `TOOL_TO_DOMAIN` already holds the map; the rejection site
already knows the tool name. This converts a dead-end into a handoff at the seam that already
detects the problem, and it is a smaller change than de-scoping.

### Scope

1. **Handoff on rejection.** At `sasa.ts:1985`, instead of returning the deflection string:
   look up `TOOL_TO_DOMAIN[block.name]`; if it resolves to a different domain the caller's tier
   is permitted, re-run the turn once in that lane. **Capped at one hop** — no chains, no loops.
   Emit `mesh.handoff` with `{from, to, tool, trace_id}` so hop rate is observable.

2. **Tier is checked at the destination, not inherited.** The handoff re-enters
   `getToolsForDomain(newDomain, tier, cap)`. A team member handed off into `money` still gets
   the team-safe slice. The handoff must never widen a tier — only relocate a domain.

3. **Reads stay cross-cutting** (already shipped). `get_credential` stays excluded.

4. **Writes stay domain-scoped.** The dispatch wall at `sasa.ts:1984` is unchanged and remains
   the injection defense.

### Non-goals

- Removing or weakening domain scoping. Explicitly rejected above.
- Multi-hop routing or an agent-picks-its-own-lane loop. One hop, then answer or deflect.
- Touching tier walls. They are orthogonal and proven so: no team security wall keys on domain
  (`manifests/index.ts:270-279`, `sasa.ts:1443-1450`, `smart-tools.ts:894-932` are all tier-keyed).

## Blocking prerequisites

The audit surfaced live honesty bugs. These ship **before** the handoff, because a handoff that
doubles tool execution amplifies any mis-reported outcome.

- **`compose-claims.mjs:91-95` renders a QUEUED group post as "Posted."** Gate on a real
  `posted` field (which `smart-tools.ts` must emit) and on `wasDeduped`.
- **`sasa.ts:1777` PURE-LIE branch conflates "no receipt" with "receipt with an empty summary,"**
  so a successful write is reported as a failure.
- **`isCommitting` misclassifies reads** (`read_email`, `search_inbox`, `show_draft`,
  `project_expense_report`, `send_resource`, `save_resource`) as action claims.
- `compose-claims.test.mjs:101` must use the production predicate, not a local copy.

## The walls this needs (the existing suite is blind here)

The stress test found the current suite would stay green through a change of this shape, which
makes it worse than no coverage:

- `specialist-isolation` S1–S3 assert on `getToolsForDomain` **data**, never on what
  `runSpecialist` actually passes to `runSasa`. Any change at the call site passes unnoticed.
- Reachability wall **R4** ("cross-cutting stays read-only") and **R5** (`get_credential` not
  widened) are set-membership checks on `CROSS_CUTTING_TOOLS`. An unscoped admin toolset would
  reverse both intentions while both assertions still printed PASS.

New walls required:

- **H1** a `tool_not_in_scope` rejection produces a handoff, not a deflection.
- **H2** handoff is capped at one hop (assert on the runtime path, not the data).
- **H3** a team-tier handoff lands on the team-safe slice of the destination lane — tier never widens.
- **H4** assert on what `runSpecialist` passes to `runSasa`, closing the S1–S3 blind spot.
- **H5** `get_credential` remains reachable from exactly one lane, asserted against the **effective
  admin toolset**, not against set membership.

## Success criteria

Measured by `scripts/sasa-fitness.mjs`, which already runs this corpus against production:

- `reachability: zero dead-ends` — **0 / 91** (currently 14–15)
- `reachability: no all-tier dead-ends` — 0 (already green)
- handoff rate observable via `mesh.handoff`; no turn exceeds one hop
- `123 + 5` walls green, `tsc` clean
- No regression in the 59+ phrasings that already route correctly

## Open questions

1. **Cost of a hop.** A handoff re-runs the specialist, roughly doubling tokens for that turn.
   At a ~16% dead-end rate that is ~16% of turns costing 2×. Acceptable, but it should be
   measured, not assumed.
2. **What if the destination also lacks the tool?** Should not happen (`TOOL_TO_DOMAIN` is
   derived from the manifests) but the failure must be a clean deflection, never a second hop.
3. **Does the handoff re-run the router or reuse the model's own tool choice?** Reusing the tool
   choice is cheaper and more accurate — the model already told us what it wanted. Prefer that.
