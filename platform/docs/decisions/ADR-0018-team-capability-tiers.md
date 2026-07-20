# ADR-0018 — Team capability tiers (coordinator as team+extra, not a third tier)

**Status:** Accepted · **Date:** 2026-07-14 · **Owner sign-off:** Taona
**Relates:** spec 003, ADR-0016 (honest spine), the team-wall audit 2026-07-14

## Context
Team members need to send files, update inventory, and (managers only) update
beneficiary/case records from WhatsApp. Today `team` tier is a flat allowlist and every
edit tool is admin-only. This reverses a deliberately-designed wall (sasa.ts:1186 states
the team line grants no sending/files/case edits without owner sign-off). Two live gates
enforce the wall and intersect: `TEAM_TOOL_NAMES` (engine `roleBase`) and
`getToolsForDomain`/`TEAM_SAFE_TOOLS` (mesh `allowedToolNames`).

## Decision
Introduce a per-member capability `bot_tier` ∈ {field, coordinator}. `coordinator` is
modeled as **`team` tier plus extra tools**, NOT a new third top-level tier.

## Alternatives considered
1. **New third tier `admin | coordinator | field`** (rejected). Every PII wall in
   smart-tools keys on `tier === "team"` (money/donor/pay grounding-strip, specialist
   walls, ~30 sites). A rename would force auditing every one of those and risk silently
   dropping a money wall for the new tier. High blast radius on the exact walls we must
   keep. Rejected as unsafe.
2. **Binary bot_access grants everything** (rejected by owner). A tailor with access could
   edit a child's case file. Fails the PII-minimization requirement.
3. **Role-text heuristic** (e.g. role contains "Coordinator") (rejected). Permission
   inferred from a free-text HR field is fragile and implicit; a rename of someone's role
   would silently change their powers. Security grants must be explicit.
4. **CHOSEN: `team` + cap flag, single `teamSafeTools(cap)` source consumed by both gates.**
   Coordinators stay `team` tier, so all money/donor/pay walls keep protecting them with
   zero new code; only the allowlist widens. Both gates read one function so they can't
   drift. Internal guards add defense-in-depth carve-outs (merge/delete/funding stay
   blocked even for coordinators).

## Consequences
- Smallest safe diff on the security walls: the money/donor/pay walls are untouched and
  still apply to coordinators.
- Two enforcement layers stay in sync via one function; a future tool is field/coordinator
  scoped in exactly one place.
- Cost: `bot_tier` must be threaded from `operatorOf` through worker + group ingress into
  the agent; a missed thread defaults to `field` (fail-closed — the safe direction).
- Reversibility: fully reversible. Drop the column reads / set every member to `field` and
  the system is back to the audited two-tier wall.

## Fail-closed invariant
Any path that cannot resolve a member's `bot_tier` treats them as `field`. A coordinator
power is never granted by default, only by an explicit `bot_tier='coordinator'` row.
