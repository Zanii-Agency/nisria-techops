# ADR-0017 — Render action-claims from tool results, not from model prose

- Status: **Proposed** (Stage-2 slice shipped DARK behind `SASA_RENDER_ACTION_CLAIMS`)
- Date: 2026-07-06
- Related: [[project_nisria_sasa_active_state]], ADR-0016 (relay honest spine), KT #206540 (deterministic route for actions + grounded LLM for understanding), Honesty law, Real-action law.

## Context

Sasa's hallucination problem is dominated by ACTION-CLAIM fabrication: the model
free-writes "Done, I messaged Mark" / "Sent to Cynthia" as prose, decoupled from
whether the tool actually ran. The defence to date is ~600 lines of post-hoc
regex "honesty guards" in `lib/agents/sasa.ts` that CATCH the lie after the fact
and rewrite it. This is reactive whack-a-mole: 11 months of incident-driven
regexes, documented misfires, and several INVERSIONS where a guard falsely
rewrote a TRUE action as failed (KT #342/#344/#347/#390, Dorcas + SANARA + Fargo
incidents). Regex can never close the novel-phrasing gap.

## Decision

Move action-claims from "authored by the model, caught by regex" toward
"rendered deterministically from tool results." The finalize() choke-point
(`return { reply, ... }`) is the single seam every reply passes through and is
where the render belongs.

Shipped now (slice 1, DARK): the SEND/POST class — the exact "said it sent but
didn't / named the wrong person" failure Nur repeatedly caught. `reconcileSendClaims`
uses the delivery ground truth (`sentRecipientNames` = delivered===true,
`postedGroupsThisTurn` = ok post_to_group) and, when the reply names a recipient
set that differs from what actually delivered, appends one precise corrective
line. It is conservative and over-fire-safe: it engages ONLY on turns where a
send/post actually delivered, only when the model's named set diverges from
truth, and it APPENDS (never deletes the prose — the false-claim/false-denial
cases stay with the existing guards).

Gated behind `SASA_RENDER_ACTION_CLAIMS` (default OFF): flag off = byte-identical
to today = zero regression (proven: all walls green with the flag unset, and the
6 critical honesty walls are guard-direct / source-seam so they are insulated
from the finalize output anyway).

## Alternatives rejected

- **Rip out the 600-line guard wall and rewrite to a full compose_reply contract
  in one change.** Rejected: highest-regression path on Nur's LIVE bot; the walls
  do not cover finalize end-to-end, so "walls green" would not prove no over-fire.
  Needs a soak. This ADR keeps the guards and adds the renderer beside them.
- **Broaden the regex triggers to catch novel phrasings.** Rejected: re-introduces
  the over-fire problem the 600 lines exist to suppress (a broad "I did X" trigger
  clobbers read-descriptions, quoted titles, "you completed X").
- **Do nothing (temperature fix alone).** Rejected: temperature (Stage 1) lowers
  variance but does not make a fabricated claim structurally impossible.

## Consequences

- The send/post recipient truth is now renderable from delivery records — the
  seam where a future compose_reply contract (model emits `claimed_actions` as
  data, code renders every category) plugs in.
- Nothing changes in production until the flag is flipped; enabling requires a
  soak watching `sasa.send_claim_reconciled` for over-fire before it is trusted.
- Reversibility: unset the env var. Fully reversible.

## Follow-ups

1. Soak with flag ON on the owner line (971501168462); watch `sasa.send_claim_reconciled`.
2. Extend the renderer to completion/edit classes once the send slice is proven.
3. Then, and only then, retire the overlapping regex guards to a thin backstop.
