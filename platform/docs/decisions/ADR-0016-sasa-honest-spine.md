# ADR-0016: Sasa Honest Spine (Option B) as the core architecture

## Status

proposed

Drafted 2026-07-03. Do not flip to `accepted` in the same session. Second-pass review by Taona required (this is a foundational, medium-to-expensive-to-reverse decision).

## Context

Sasa exists to run a 20+ person NGO on WhatsApp: move information between the team and Nur, save data and files, keep her eligible and stable. Once reliable, the same platform is sellable to other NGOs.

After many build sessions it is still unreliable: it forgets org context, takes the wrong action, does nothing (the model does not always call its tool), and sometimes claims it did something it did not. The current design makes the LLM the brain, the hands, and the memory in one prompt, then guards its output with 11 months of accreted regex (KT #206607). That has a reliability ceiling no amount of patching crosses. The specialist/orchestrator refactor split the work by TOPIC, not by JOB, so each specialist is still an LLM doing all three jobs with regex guards. The ceiling was copied eight times, not raised.

Separately, Zanii is building ledger.zanii.agency (a gate + diary that makes AI agents accountable, almost done, a distinct product not in this repo). The honesty layer Sasa needs is the same idea as that ledger. This is the evidence-binding doctrine: an agent may only claim what a re-checkable receipt proves.

We need a core architecture that is reliable enough for Nisria to depend on daily and to sell, and that becomes the ledger's first proof integration, without blocking on the ledger's timeline or big-bang-rewriting the live bot.

## Decision

We adopt the "honest spine" (Option B) as Sasa's core loop, and migrate onto it one action at a time (strangler pattern), starting with the relay (spec 002).

The loop separates the three jobs:

1. **The AI proposes.** The model's only job is to understand the human message and emit a structured ticket (e.g. `{intent:"relay", recipient, message, source}`). It does not execute, and it is not the memory.
2. **Code disposes.** A deterministic executor runs the ticket through specialist stations (the existing manifests become deterministic skill-modules, not mini-LLMs). Same input, same action, every time. The model cannot silently skip a step.
3. **Postgres remembers.** The org state (team, cases, tasks, files, money) is the source of truth, read and written deterministically, not recalled from a prompt.
4. **Receipts prove.** Every action writes a receipt behind a clean `recordReceipt()` / `verifyClaim()` seam, backed by Sasa's own Postgres now. A claim ("sent", "logged", "done") ships only if `verifyClaim()` finds a matching receipt for that turn. No receipt, no claim: the claim is rewritten to the honest truth.

The external ledger.zanii.agency plugs in later as a thin adapter behind the `recordReceipt()` / `verifyClaim()` seam (Phase 4). Sasa is the ledger's reference consumer and helps define its contract. We do not block Sasa's reliability on the ledger shipping.

Rollout is a strangler: the new loop runs beside the old one, behind a flag, on one intent at a time. The live bot never goes dark.

## Consequences

What becomes easier:
- Honesty becomes structural, not linguistic. The gate compares a claim to a receipt with plain logic, so the regex-guessing class dies (both the misfires and the misses).
- Real org awareness: the bot looks up state instead of recalling a prompt.
- Reliability: execution is deterministic, so "the model forgot to call the tool" stops silently producing a fake success.
- Sasa becomes the ledger's first live integration with near-zero extra work.
- Each slice is independently testable and shippable; progress compounds instead of fragmenting.

What becomes harder / the ongoing tax:
- More upfront design per action: a ticket schema, an executor, and receipt wiring, versus "add a tool and prompt the model."
- Two loops coexist during migration (old + new), which is more surface to hold until Phase 3 retires the old guards.
- The model loses freedom: anything not expressible as a ticket + station is not doable until we add that station. This is the point, but it is a real constraint.
- A receipt store to maintain, and later a ledger adapter to keep in sync.

What is now locked in:
- The LLM is demoted to understand + draft, permanently. It is never the source of truth or the executor.
- Every future capability must be modeled as ticket + deterministic station + receipt.

## Alternatives

- **Keep patching the model-centric arch + regex guards.** Rejected: this is the exact loop that produced years of "worked on it many times, still breaks." Patches compound into fragility, not reliability. It never reaches sellable-grade.
- **LLM-grades-LLM honesty checker (the taona-bot verify.ts style).** Rejected: a model vouching for a model, fail-open, judges booleans not receipts (KT #206605). It cannot be the trust layer.
- **Big-bang full rewrite of Sasa.** Rejected: the live bot Nisria depends on would go dark and risk a worse regression. The strangler gets the same endpoint without the outage.
- **Block on the external ledger before fixing Sasa.** Rejected: couples the critical rebuild to another product's timeline. The local receipt seam gives the gate + diary now and makes the ledger a later adapter.
- **Do nothing / accept current reliability.** Rejected: it fails the core product purpose (Nur cannot trust it) and the company thesis (reliable AI, sellable).

## Reversibility

Medium overall. Per-slice it is Cheap: each migrated action sits behind a flag, so any single slice reverts to the old path in a day with no data migration. The architectural direction (LLM demoted, deterministic executor, receipts) is Medium-to-Expensive to fully unwind once many slices and the receipt store are in place: a rollback would mean re-centralizing logic in the model and abandoning the receipt gate, a week-plus of refactor. Because the full commitment is not Cheap, Status stays `proposed` until a second-pass review.

## References

- spec 002 — Relay on the Honest Spine (Slice 1): `specs/002-relay-honest-spine/spec.md`
- Evidence-binding doctrine (honesty of claim = receipt-bound)
- KT #206540 (deterministic route for actions + grounded LLM for understanding)
- KT #206605 (taona-bot 6-gate honesty audit, the LLM-grades-LLM anti-pattern)
- KT #206606 (727 identity collision, honesty of ingest)
- KT #206607 (Sasa honesty layer = regex-guessing + boolean-trust; specialists split topic not job)
- ADR-0012 (pending intents), ADR-0013/0014/0015 (MCP bridge lineage)
- External: ledger.zanii.agency (gate + diary product, future adapter target)
