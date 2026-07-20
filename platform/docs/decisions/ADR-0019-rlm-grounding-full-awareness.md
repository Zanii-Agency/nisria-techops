# ADR-0019 — RLM grounding + full Nisria-DB awareness

**Status:** Accepted · **Date:** 2026-07-14 · **Owner sign-off:** Taona
**Relates:** spec 004, recall scaling fix KT #206692, RLM doctrine, full-awareness KT #206693.

## Context
Every Sasa turn inlined an arbitrary slice of two growing piles (92 org_facts oldest-first, ~80 alphabetical contacts) = ~3.5k tokens rising with the data (RLM violation). Separately, the owner directive: "WhatsApp is the channel; the bot must have full awareness of the entire DB." The org knowledge already exists in `org_profile` (legal/constitution/mission/goal) but is buried among press-heavy facts and unpinned. The DB is shared across 5 projects (minal/cortex/prism/digital_u/agentify), so "entire DB" must mean Nisria's ~40 tables (isolation).

## Decision
Grounding = a bounded ALWAYS-ON CORE + fetch-the-rest-by-relevance. Full awareness = the bot always knows the MAP and can fetch any Nisria row on demand; it never inlines the DB.

1. **Pinned core (explicit).** New `agent_memory.pinned` boolean. `recall()` always loads non-fact grounding kinds + `pinned` org_facts; non-pinned org_facts are reached only by the query-relevance arm (already shipped, KT #206692). Seed = the org_profile dossier rows (legal, overview, narrative, assets). Admin `pin_fact`/`unpin_fact` tools manage it.
2. **People core = team roster only.** contactsRoster stops inlining the 116-and-growing contacts; keeps the ~43 team. Non-team names resolve via one `lookup_contact` call (prompt keeps the "never ask who is X, use lookup_contact" instruction).
3. **Entity-map awareness block.** A compact, manifest-generated index of what the bot can see/act on, in the system prompt, so it never dead-ends with "I can't see that."
4. **Nisria scoping.** The map and every fetch tool stay on Nisria tables; other projects' tables are never referenced.
5. **Budget guard.** The assembled core is capped (~1.2k tokens); overflow truncates lowest-priority pins and emits `grounding.core_truncated` (no silent bloat).

## Alternatives considered
- **Auto-core by recency/frequency** (rejected by owner). Core would drift; a foundational fact could silently fall out; frequency needs new tracking and cold-starts badly. Explicit pins are predictable.
- **Keep loading all facts, just raise the cap** (rejected). Re-breaks at the next threshold and inlines the pile every turn — the RLM anti-pattern.
- **Inline the whole DB for "full awareness"** (rejected, unsafe). Impossible on tokens, and cross-tenant on a shared Supabase. Awareness = map + fetch coverage, not payload.

## Consequences
- Always-on grounding becomes bounded and constant regardless of data growth; recall of a specific fact is by relevance (both arms viable: 90/92 embedded, 92/92 tsv).
- The org dossier now grounds every turn (pinned), fixing "the bot doesn't know the org."
- Reversible: unset the pinned filter / re-raise the cap and behavior returns to the prior wholesale load.
- Fail-safe sequencing: pins + tests land first; the wholesale-load shrink is the last, proven step (a non-pinned fact must still recall before the cap drops).

## Fail-closed invariant
If pin state can't be resolved, load more (not less) grounding — never silently starve the prompt. The privacy wall (owner-private for non-owner) is untouched in both arms.
