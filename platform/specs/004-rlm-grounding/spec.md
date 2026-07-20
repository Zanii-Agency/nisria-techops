# Spec 004 — RLM-on-grounding (bounded always-on core, fetch the rest by relevance)

**Status:** draft (spec first, no code yet) · **Owner:** Taona · **Date:** 2026-07-14
**Tier:** 1 (touches every turn's system prompt; correctness-sensitive). ADR to follow.
**Relates:** recall scaling fix KT #206692 (query-relevance arm, already shipped), RLM doctrine (refs/rlm.md), [[project_sasa_team_capability_tiers]].

## Problem
Every Sasa turn inlines two data piles that grow linearly with Nisria's data:
1. **org_facts** — `recall()` wholesale arm loads up to 300 facts (92 today) into the system prompt, every turn.
2. **contactsRoster** — `sasa.ts:1367` inlines up to 80 alphabetically-ordered lines of team + contacts (43 team + 116 contacts today), every admin DM turn.
Both pick an **arbitrary slice** (oldest-first / alphabetical), not relevance. As facts and contacts grow, the prompt grows, cost rises, latency rises, and the slice increasingly misses the row the turn actually needs. This is the exact RLM violation: "if a prompt grows with the data it serves, the design is wrong." Baseline always-on grounding is ~3.5k tokens and climbing.

## Outcome (measurable)
- Always-on grounding (org core + people core) is **bounded to a fixed ceiling (target ≤ ~1.2k tokens)** regardless of how many facts or contacts exist. Simulate 500 facts + 1000 contacts → grounding size stays flat.
- **No regression in recall:** a fact NOT in the shrunk core is still recalled when asked (via the query-relevance arm shipped in KT #206692).
- **No regression in name resolution:** a core person (team member) still resolves with zero tool calls; a long-tail contact resolves in ONE `lookup_contact` call, never a "who is X?" dead-end.
- Money/donor/pay and owner-private walls unchanged.

## Design
Split grounding into a small ALWAYS-ON CORE plus ON-DEMAND FETCH (the RLM shape).

### A. org_facts — shrink the wholesale core, lean on the query arm
The query-relevance arm now matches org_facts (KT #206692), so the wholesale arm no longer needs to carry all of them.
- Introduce a small always-on **core set**: org-identity facts that must ground every answer (EIN 92-2509133, registration, key policies, brand voice). Marked explicitly, not inferred.
  - Mechanism (pick in ADR): a `pinned boolean` (or `priority int`) column on `agent_memory`, OR a distinct `kind = "org_core"`. Pinned/core facts load always; the rest are `org_fact` and reached only by the query arm.
- Shrink the wholesale cap from 300 to the core only (expected ~20-40 rows). The 300 was a stopgap from KT #206692; this spec is what makes it safe to lower.

### B. contactsRoster — core people always-on, long tail on demand
- Always-on: the **active team roster only** (bounded, stable, ~43). Drop the 116-and-growing contacts long-tail from the prompt.
- On-demand: a non-team contact resolves via `lookup_contact` (already exists, already team-safe). The system prompt keeps the "never ask who is X" instruction but points the model at `lookup_contact` for anyone outside the core roster.
- Optional refinement: include the top-N *most-recently-interacted* contacts in the core (recency beats alphabetical) so frequent names still resolve tool-free.

### C. Budget guard (make the ceiling real, not aspirational)
- A single helper assembles the always-on core and enforces a hard character/token ceiling; if the core ever exceeds it, it truncates the lowest-priority rows and logs `grounding.core_truncated` to `events` (no silent bloat, per RLM + the no-silent-caps rule).

## Full DB awareness (owner directive 2026-07-14: "WhatsApp is the channel; the bot must have full awareness of the entire DB")
Full awareness done the RLM way = the bot ALWAYS knows the whole *map* and can *fetch any row on demand*; it never inlines the whole DB. Three parts:
- **A0. Pin the org dossier.** `org_profile` already holds the real org knowledge (legal/KRA/constitution, mission overview, monthly goal, timezone) but it is buried in the 92 press-heavy facts and unpinned. Make the org_profile sections the SEED of the pinned core (A above). This is the "what the bot doesn't know about the org" answer: it knows it, it just doesn't reliably surface it.
- **A1. Entity map (the awareness layer).** A compact, always-on index of WHAT EXISTS and how to reach it: "you can see and act on tasks, beneficiaries & cases, donations & donors, campaigns, payments & payroll, bank, inventory & wishlist, documents, grants, contacts & team, resources, press, calendar, groups." One short block so the bot never dead-ends with "I can't see that." Generated from the manifest, not hand-maintained.
- **A2. Nisria-table scoping (isolation).** This Supabase is shared: `minal_*`, `cortex_*`, `prism_*`, `digital_u_*`, `agentify_*` are OTHER projects. Awareness + every fetch tool stays scoped to Nisria's ~40 tables; the map never references another project's data.
- **A3. Coverage audit (one-time).** Most Nisria tables have tools; confirm no operational table with real data is unreachable. Known thin spots to check: `finance_insights` (surface via finance reads), `daily_summaries` (via read_brief), `invoices`/`outreach` (empty now, add a fetch path when first populated). Log the map so gaps are visible, not silent.

## Scope
IN: the org-core mechanism + wholesale-cap shrink; org_profile as the pinned dossier seed (A0); the entity-map awareness block (A1); Nisria-table scoping (A2); the coverage audit (A3); contactsRoster → team-core + on-demand lookup; the budget-guard helper + its telemetry.
OUT (non-goals, separate levers): history summarization into dossiers; the planner/todo tool; the query-relevance arm (already shipped); any change to the specialist tool scoping; building tools for currently-empty tables (invoices/outreach) until they hold data.

## Risks / refutations to answer before build
- **R1:** shrinking org core drops a fact the model needed and the query arm misses it (embedder off + tsv gap). Mitigation: verify both arms retrieve a non-core fact on real data BEFORE lowering the cap; keep the cap lowering as the LAST step behind a flag.
- **R2:** dropping long-tail contacts makes the bot ask "who is X?" for a known contact. Mitigation: golden test 3; keep the lookup_contact instruction explicit.
- **R3:** "core" selection is wrong (pins the wrong facts). Mitigation: seed the pinned set explicitly with Nur, do not auto-infer.

## Golden tests (EVAL)
1. **Bounded:** with 500 synthetic org_facts + 1000 contacts (sandbox rows), assembled always-on grounding stays under the token ceiling (assert char length ≤ budget). Flat vs today.
2. **Recall survives shrink:** save a fact, remove it from core, ask about it → still recalled via the query arm (extends the KT #206692 roundtrip).
3. **Core person tool-free:** ask about a team member → resolved with zero tool calls. **Long-tail contact:** ask about a non-core contact → exactly one `lookup_contact` call, correct number returned, never "who is X?".
4. **Walls intact:** team tier sees no money/donor/pay; owner-private still owner-only in both arms.
5. **Telemetry:** force core over budget → `grounding.core_truncated` event emitted (no silent drop).

## Decisions (owner, 2026-07-14 — locked)
- **Core facts = explicit `pinned boolean` on `agent_memory`.** You/Nur mark the ~30 must-always-ground facts; everything else is `org_fact` reached only by the query arm. No auto-recency/frequency guessing (core must be predictable and not drift). A `pin_fact`/`unpin_fact` admin tool + a seed of the current org-identity facts (EIN, registration, key policies, brand voice) is part of the build.
- **Core people = active team roster only** (~43, bounded). Non-team contacts resolve via one `lookup_contact` call; the prompt keeps the "never ask who is X, use lookup_contact" instruction. No recency-ranked contacts in v1.
- **Core token ceiling = ~1.2k tokens (~4.8k chars)**, enforced by the budget-guard helper; overflow truncates lowest-priority pins and emits `grounding.core_truncated`.

## Build order (fail-safe sequencing, per R1)
1. Add `pinned` column + seed org-identity pins + `pin_fact`/`unpin_fact` tool.
2. contactsRoster → team-core + lookup_contact instruction.
3. Budget-guard helper + telemetry.
4. EVAL golden tests 1-5 green on real + synthetic data.
5. ONLY THEN lower the org wholesale cap 300 → core (behind a flag), re-run test 2 (non-core fact still recalled) before and after. This is the last, reversible step.
