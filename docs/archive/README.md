# Archive

Documents preserved for historical reference. Not loaded by agents. Not part of the operational doctrine.

## What's here and why

**Feedback rounds.** DESIGN-LOGIC-AUDIT.md, FEEDBACK-ROUND-2026-05-26.md, QA-SWEEP-2026-05-26.md and the round-by-round feedback files. These captured the 31 corrections and the post-build reviews that drove the doctrine. The corrections are now expressed as the eleven laws in NISRIA-DOCTRINE.md. The original files are kept here so the historical reasoning is recoverable.

**Superseded specs.** NISRIA-IA-AUDIT.md (merged into NISRIA-DESIGN-SYSTEM.md), LOGIC.md (state machines merged into NISRIA-DATA-MAP.md). The originals stay here for reference if a future ADR needs to re-examine a decision.

**Merged operating docs.** The original NISRIA-BUILD-SPEC.md, RUN-PROTOCOL.md, and RUNBOOK.md were merged into HOW-WE-BUILD.md. Originals here.

**OVERNIGHT-LOG.md.** The 19 RUN GO journal entries from the autonomous build phase. Replaced as the live state by STATE.md. Kept here as the historical record of how the platform was built before the doctrine.

**Legacy planning docs.** The content/, fundraising/, operations/, comms/, automation/ folders from the original techops planning predate the platform. They were the spec for what to build; the platform itself replaces what they were planning. Moved here to /docs/archive/legacy-planning/.

**Original README.md.** The 5-pillar planning doc from before the platform existed. Kept here because the historical framing (Nur-only vs delegatable vs automatable) still informs how Sasa autonomy lanes get tuned.

**Legacy SQL.** The fragmented schema files (schema.sql, schema-spine.sql, schema-v2.sql, schema-brain.sql, schema-corrections.sql, schema-team-enrich.sql, schema-beneficiaries-enrich.sql, schema-email-signatures.sql, schema-brain-match.sql, rls-policies.sql, purge-automated.sql, reclassify.sql, reset-comms.sql) were consolidated into /platform/db/schema.sql and /platform/db/policies.sql regenerated from the live Supabase database. Originals here as the migration history.

## How to use this folder

For reading only. Agents should not load files from here as part of their normal context. If a question arises about why a decision was made, the answer is in the ADRs (/docs/decisions/); the archive is the deeper historical record if the ADR is insufficient.

If something here needs to come back into operational use, write an ADR justifying its return and move it back to the appropriate location.
