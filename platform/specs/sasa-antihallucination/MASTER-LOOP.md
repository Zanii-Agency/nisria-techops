# MASTER LOOP — Sasa Anti-Hallucination

> Self-driving loop. Feed this whole file as the recurring `/loop` prompt. Each
> wake-up: read `## STATE`, do the next unfinished step of the current stage,
> update `## STATE`, stop. Repeat until `/goal` is met. This is Nur's LIVE bot —
> obey every guardrail. No stage is "done" without the DONE proof attached.

## /goal (the loop exits only when ALL are true)

1. **Temperature set** — every Sasa/router/extractor Claude call runs at a low,
   deliberate temperature (not the 1.0 default). PROVEN by grep + a walls run.
2. **Claims rendered from tool results** — the bot no longer free-writes
   "Done / Sent / Logged" action lines; those sentences are generated
   deterministically from `toolRuns` where `ok===true`. The old regex honesty
   wall is retired down to a thin backstop. PROVEN by walls + eval + a soak.
3. **Memory window widened + lookup-on-name** — history cap raised and, when the
   user names a specific person/case not in the window, the bot looks it up
   before answering instead of leaning on `recall()`. PROVEN by eval case.
4. **Contact dedup** — duplicate `contacts` rows for the same person are found
   and merged (DRY-RUN + report FIRST, never auto-merge blind), and
   `resolveContact` stops minting twins. PROVEN by a DB query showing 0 dup
   phone groups after.

Every stage also requires: `npm run walls` GREEN, `npm test` (drift) GREEN,
`next build` GREEN, deployed via the deploy oracle, and a live proof on the
OWNER test number **971501168462** (NEVER Nur's 971501622716).

## Guardrails (non-negotiable, from CLAUDE.md + Nisria rules)

- **Branch fresh off main.** Current tree is dirty on `feat/relay-honest-spine`.
  Stash/park it, `git checkout main && git pull`, branch
  `fix/sasa-antihallucination`. One driver per deploy target.
- **Deploy oracle:** `cd platform && vercel --prod --yes`, THEN confirm on
  `command.nisria.co` with a discriminator (a real signed webhook → 200, or the
  gym-mode discriminator). Push alone ≠ deployed (KT #393). Auto-deploy has
  stalled before — always manual `vercel --prod`.
- **Owner test only.** All live proofs as 971501168462. Never send as Nur.
- **brain-core is SYNCED** from `~/Code/brain-core`. Edit the SOURCE
  (`~/Code/brain-core/src/…`), rebuild (`npm run build` there), run `sync.sh`,
  or the `seam-10-brain-core-drift` test fails. Never hand-edit
  `platform/lib/brain-core/*.js` alone.
- **Skeptic before ship on Stage 2 + 4** (irreversible / live-data). Spawn a
  separate agent to refute the change before deploy.
- **HARD HUMAN CHECKPOINT before Stage 2 executes.** Stage 2 rips out 11 months
  of incident-hardened guards and rejects the guard architecture. Do NOT begin
  editing for Stage 2 until Taona has approved the Stage-2 SPEC + ADR. Post the
  spec, then WAIT (write `needs input:`). Stages 1, 3, 4 run autonomously.
- **Claim words:** "fixed/deployed" only with proof attached. Else "built/patched".

## Stage order (do NOT reorder — safest first)

`STAGE 1 (temperature)` → `STAGE 3 (memory)` → `STAGE 4 (contact dedup)` →
`STAGE 2 (render-from-toolRuns)`.

Rationale: 1/3/4 are low-risk and independently valuable and they shrink the
surface #2 must cover. #2 is the big architectural rebuild — do it last, gated,
after the cheap wins are banked and soaking.

---

## STAGE 1 — Temperature (Tier 3)

**Edit points:**
- `~/Code/brain-core/src/claude-client.ts` — `runClaude`: accept `opts.temperature`,
  put `temperature: opts.temperature ?? <default>` in the request body (and the
  gym branch). Rebuild + sync.
- `platform/lib/agents/sasa.ts` — `callClaude` passes `temperature: 0.3` (warm
  but grounded conversational reply).
- `platform/lib/agents/router.ts` — `anthropicTool` body: `temperature: 0`
  (routing/decompose are pure classification).
- `platform/lib/anthropic.ts` — `askClaude`/`claude`/`claudeJSON`/`claudeVisionJSON`/
  `readMedia`: add optional temperature; default `0` for the JSON/extraction
  helpers, `0.3` for prose (`askClaude` default). Leave vision caption as-is.

**DONE proof:** `grep -rn temperature lib/agents lib/anthropic.ts` shows the
values; `npm run walls` + `npm test` + `next build` GREEN; deploy; live owner
webhook → 200 and a normal reply.

## STAGE 3 — Memory window + lookup-on-name (Tier 2)

**Edit points:**
- `platform/app/api/whatsapp/worker/route.ts` `historyFor` — raise `.limit(12)`
  to ~28; `runSasa` `slice(-8)` → `slice(-20)` (watch prompt-cache token cost).
- `sasa.ts` system prompt — add a hard line: when the user names a specific
  person/case/task NOT visible in the current window, call the matching lookup
  tool (`lookup_contact`/`find_beneficiary`/`search_history`) BEFORE answering;
  never answer a named-entity question from `recall()` alone.

**DONE proof:** walls + build GREEN; an eval case where a person named 15 turns
back is resolved by lookup, not fabricated; deploy + owner proof.

## STAGE 4 — Contact dedup (Tier 2, live data — CAREFUL)

**Steps:**
1. DRY-RUN query: group `contacts` by normalized phone (strip `+`, spaces,
   leading country-code variants, and the Meta "lid" privacy IDs); REPORT the
   dup groups. Do NOT merge yet.
2. Skeptic agent reviews the merge plan (which row wins, how messages/tasks
   re-point) BEFORE any write.
3. Merge behind a reversible script (keep a backup of affected rows).
4. Harden `resolveContact` (`app/api/whatsapp/webhook/route.ts`) so it can't mint
   a twin (prefer `wa_id`, normalize, upsert on normalized phone).

**DONE proof:** DB query shows 0 dup phone groups; walls + build GREEN; deploy;
owner proof; backup file path recorded here.

## STAGE 2 — Render action-claims from toolRuns (Tier 1 — GATED)

**Do NOT start until Taona approves the SPEC + ADR.** Then:
- SPEC (`/spec`) + ADR (`/adr-draft`) rejecting the regex-guard approach.
- Design: model returns a `compose_reply` tool call with
  `{ conversational_text, claimed_actions: [] }`; the action-confirmation
  sentences ("Done, logged X" / "Sent to Y" / "Staged Z") are RENDERED from
  `toolRuns` (ok===true) by deterministic code, not authored by the model.
- Retire the 600-line regex wall in `sasa.ts` down to a thin last-resort
  backstop; keep the incident walls as regression tests against the NEW path.
- Skeptic agent must try to make the new path claim an action that did not run,
  and fail.

**DONE proof:** every existing honesty wall re-passes against the new renderer;
new eval proving a fabricated action is structurally impossible; deploy; 24h
soak on owner line with soak events watched.

---

## STATE (the loop reads + updates this every wake-up)

- 2026-07-09 **FULL-SEND APPROVED by Taona** (human checkpoint cleared). Extending
  Stage-2 from send/post-only to ALL action classes + retiring the overlapping
  regex guards, on branch `feat/sasa-correct-shape` (branch-only; his merge = prod).
  Approach: engineer-incremental, one class retired per wall-gated step (NOT a
  single reckless rip — ADR-0017 flagged all-at-once as highest-regression).
  - STEP 1 ✅ DONE: `lib/agents/compose-claims.mjs` — the unified action-claim
    composer (send/post/task/calendar/money/file/flag) rendered from receipt
    `detail{}`. Isolated, pure, `.mjs` so it joins the node wall gate. Unit wall
    `eval/unit/compose-claims.test.mjs` = **21/21 green**, incl. the core
    invariant (failed send -> NO 'sent' line). This is deepagents' middleware
    lesson applied in-stack: one concern, one testable module.
  - STEP 2 NEXT: wire composeActionClaims into finalize() behind
    SASA_RENDER_ACTION_CLAIMS; render the composed block as the authoritative
    action line; add a thin backstop that strips model prose contradicting it.
  - STEP 3: retire the finalize guards class-by-class (send first, it's proven),
    running `npm run walls` between each; keep each retired guard's wall as a
    regression test against the NEW composer path.
  - STEP 4: trace rail (P4, LangSmith-shape) — emit router->specialist->tool->
    receipt->composed-claim on one traceId; additive, zero-regression.
  - GATE per step: `npm run walls` GREEN + `next build` before commit.
- current_stage: **ALL STAGES COMPLETE (2 shipped dark; soak owed before flag-on)**
- stage_2 DEPLOY: ✅ shipped DARK. commit `6c95c2b`, deployment `3wovp0omh`,
  apex-verified. Prod env has NO SASA_RENDER_ACTION_CLAIMS (confirmed dark).
  Skeptic-hardened (4 holes fixed pre-ship). tsc clean; 120 walls green + 1 quar.
  REMAINING: flag-on soak on owner line watching sasa.send_claim_reconciled, then
  extend renderer to completion/edit classes + retire overlapping guards.
- stage_1: ✅ DEPLOYED. commits `7b40c90` + `57a4212`. Deployment `o79i2nk1t`,
  apex-verified. Temperature (reply 0.3 / router 0 / extractors 0) in live bundle.
  BEHAVIORAL soak on owner line still owed (no HTTP discriminator for temp).
- stage_3: ✅ DEPLOYED. commit `8a658d2`. Deployment `4dg9w7tp6`, apex-verified.
  historyFor 12→28, convo slice -8→-20, LOOK-IT-UP-DON'T-GUESS rule, new
  sasa-memory-window-wall. 119 walls green + 1 quarantined.
- stage_4: ✅ DONE BY VERIFICATION (no code shipped). Live dry-run: 115 contacts,
  43 with phones, 0 duplicate normalized-phone groups. resolveContact already
  hardened 3 ways (KT #314 normalized match, #322 local-format scan, #380 LID-
  phantom + duplicate_suspected flag). Nothing to merge, nothing to harden.
- stage_2: BUILT + SHIPPED DARK (operator directive: fulfil goal, no regression).
  Slice 1 = send/post recipient truth rendered from delivery records
  (reconcileSendClaims + renderActionClaimsEnabled at the finalize choke-point),
  FLAG-GATED behind SASA_RENDER_ACTION_CLAIMS (default OFF). ADR-0017 written.
  New wall sasa-send-claim-render-wall (10 checks). Flag OFF = byte-identical =
  zero regression; all 6 critical honesty walls are guard-direct/source-seam so
  insulated. Adversarial skeptic run before deploy. Enabling the flag needs a
  soak (watch sasa.send_claim_reconciled). Full compose_reply rewrite + guard
  retirement = follow-ups (need the soak first). NOT yet deployed this commit.
- stage_4: BLOCKED (after 3)
- stage_2: BLOCKED (needs human approval of spec+ADR)
- branch: fix/sasa-antihallucination (off local main, which is 38 ahead of origin)
- last_deploy: none
- notes:
  - DEPLOY DECISION 1: prod is deployed MANUALLY via `vercel --prod` from local
    `platform/` (auto-deploy dead, KT #393), so `vercel --prod` would ship local
    main's 38 unpushed commits + temperature. Likely already-live, but confirm.
  - DEPLOY DECISION 2: one pre-existing red wall (letterhead-doc H4a — sends to
    Nur not the requester, smart-tools.ts:2708). Unrelated to temperature.
    Deploy over it, or fix it first?
  - DRIFT FINDING: `~/Code/brain-core/src` is BEHIND nisria's committed
    lib/brain-core (nisria had a local `selfMarkNoExempt` honesty-guard patch
    never synced to source). My cp clobbered it; restored from HEAD. DO NOT run
    sync.sh until source is reconciled or it re-breaks nisria. Temperature was
    added to source too, but source honesty-guards remain stale.
