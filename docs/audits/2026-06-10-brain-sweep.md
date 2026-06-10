# Brain Sweep — 2026-06-10

Cleanup of testing-period contamination in Sasa's brain layer, with the doctrine fixes that prevent regression.

## What we found

Eval / Tournament harness writes against PROD Supabase (no sandbox switch) left 13 rows of test residue in 4 tables. Sasa's hybrid recall (lib/memory.ts:152,165) would have grounded answers in them on the right prompt — Nur would have heard about "Acme Foundation" as her org name, "Tournament Test Member SwpZ7K9" as a teammate, "Twin Tournament Test" as a beneficiary.

### `agent_memory` — 6 rows superseded

| id | kind | leaked content |
|---|---|---|
| `1fcdf2fb` | `approved_reply` | "Reply: Test" → "This is a test" |
| `9a263922` | `owner_private` | "Tournament Test Member SwpZ7K9 is a tester on the team." |
| `e07c8e04` | `owner_private` | "Twin Tournament Test is a beneficiary in the nutrition program with ID NB-MQ4L3H" |
| `7700242b` | `owner_private` | "Twin Tournament Test … NB-MQ4*" (dup) |
| `3e827522` | `owner_private` | "Twin Tournament Test … NB-MQ4*" (dup) |
| `d2211886` | `owner_private` | "Twin Tournament Test … NB-MQ4*" (dup) |

Disposition: `UPDATE agent_memory SET status='superseded', review_note='auto-cleaned 2026-06-10: testing-period residue (eval/harness). Doctrine: source-of-truth + honesty.', curated_at=now() WHERE id = ANY($1)`. Recall filters by `status='active'` (`lib/memory.ts:123,169`) so superseded rows can no longer ground.

### `memory_entities` — 3 phantom entities deleted (with their 6 links)

| id | type | name |
|---|---|---|
| `e300b4ec` | org | "Acme Foundation" |
| `e72f2a04` | person | "Tournament Test Member SwpZ7K9" |
| `328fe909` | person | "Twin Tournament Test" |

The entity-graph table has no `status` column, so deletion is the right semantic. `memory_entity_links` rows referencing them were deleted first (FK safety).

### `contacts` — 3 test rows renamed

| id | original name | phone |
|---|---|---|
| `19437d20` | `Mute Test Bot` | `254700000999` |
| `4b9cdb0c` | `Mute Test V2` | `254700000888` |
| `67568c52` | `Diag Tester` | `254700000111` |

2 had `messages` FK-referencing them (diagnostic group-bot pings on 06-01). Couldn't delete. Renamed with `[ARCHIVED testing]` prefix so they no longer surface in contact searches.

## Tables that came out clean

`beneficiaries`, `payments`, `tasks`, `team_members`, `outreach`, `brands`, `ingest_items`, `calendar_events`, `pending_actions`, `action_intents`, `events`. The harness only mutated the brain / entity-graph / contacts paths.

## Doctrine fixes shipped same day

### 1. Extended `org_fact` mutation guard (`lib/smart-tools.ts:remember_fact`)

The Acme leak slipped past the existing guard (commit `5aefc24`, 2026-06-09) because the regex covered only `EIN | legal name | donate URL | contact email | website | tax id | nonprofit id` — not `name` / `org name` / `organization name` / `address`. The Tournament harness wrote `{topic: 'org_name', content: 'The organization name is Acme Foundation.'}` and the guard didn't fire.

The extended matcher now blocks the name lane (`ORG_NAME_LANE`, `ORG_NAME_TOPIC`) and the address lane (`ORG_ADDR_LANE`) and surfaces both the US (By Nisria Inc) and Kenya (Nisria Community Development Foundation) canonical names so Sasa can quote the right one.

### 2. Medic dispatch wrapped in `waitUntil()` (`lib/medic.ts`)

The medic detector matched 30+ fumbles in the 06-04 → 06-10 window but `medic_runs` stayed empty for the whole period. Root cause: Vercel serverless kills the worker the moment the Sasa send returns its response, so the bare fire-and-forget `fetch('/api/medic/audit', ...)` never lands. Wrapping with `@vercel/functions waitUntil()` keeps the worker alive ~50–200ms until the request hits the audit endpoint and `medic_runs` insert (`route.ts:262`) commits.

## Future work flagged (knowledge-tree node #195)

The root cause of the contamination is that the eval / Tournament harness writes go straight to PROD `agent_memory` because Sasa's `remember_fact` tool has no sandbox switch. Until that ships, sweep after every harness run.

Suggested: `SASA_SANDBOX_MODE=1` flag that routes brain writes (`remember_fact`, `add_beneficiary`, `add_team_member`, the auto-fact lane) to a `sandbox_` schema mirror.
