# State

Current state of the Nisria Command Center. This is a live snapshot, not a journal. The journal (the old OVERNIGHT-LOG with 19 RUN GO entries) is in /docs/archive/.

When state changes, this file changes. When a pass finishes, this file reflects the new floor.

---

## Where we are right now

**2026-06-16 — FLAW-RESOLUTION PASS COMPLETE.** Full audit and fix of all 40 routes. Three missing pages created (/approvals, /contacts, /admin). 53 em-dash violations fixed across 16 files. Loading.tsx and error.tsx added to all 37 route directories (74 files). Broken nav links fixed (admin/transcripts was linking to non-existent /admin/contacts/ route). /contacts list page built with filters, search, and drill-to-core detail links. Build compiles clean with all routes passing.

Foundation landed. The handoff in HOW-WE-BUILD.md has run through Step 5: superseded docs archived to /docs/archive/, legacy SQL archived to /docs/archive/legacy-sql/, schema consolidated from the live database into /platform/db/schema.sql and /platform/db/policies.sql, the money-truth baseline produced at /docs/baselines/money-truth-baseline-2026-05-29.md, and the Pass 0 worktree created at ../nisria-pass-0 on branch pass-0-money-truth. The platform itself has not been touched by Pass 0 yet.

Baseline verdict: FAIL with 406 currency and source-of-truth violations. 226 payments carry created_by='drive monthly history' tagged USD when they are Kenyan KES expenses; 180 of those also hold impossible amounts (the USD payments-out total reads as 1.3e23). Banking is two reconciled Absa accounts (Nisria CBO and LHSH) holding both credits and debits, but only for Oct 2021 to Nov 2022.

Pass 0 underway on branch pass-0-money-truth. Done so far: (1) the 226 currency-corrupted payments resolved (46 mislabeled rows corrected USD to KES, 180 unparseable rows quarantined reversibly, snapshot at docs/baselines/pass-0-quarantine-snapshot-2026-05-29.json); re-audit reads PASS, USD payments-out total dropped from 1.3e23 to the real 27,651.66. Proof: docs/baselines/money-truth-postfix-2026-05-29.md. (2) Finance pulse rebuilt to show all 38 sequential months (2023-03 to 2026-04) with an inline Ask-Sasa box. (3) Treasury A-to-Z summary built and leads the Finance page: money in and out per currency, blended USD-equivalent with FX visible (129 KES/USD), USD-held and last reconciled bank balance, and an honesty note that a live cash-on-hand needs complete income records and recent statements. It refuses to print a misleading KES net.

(4) FINAL FIX: the whole 'drive monthly history' backfill was found to be fabricated and inflated. Root cause: it misread PayBill/Account/Till numbers from the sheets' "Payment Details" column as amounts, and templated 34 months that have no source sheet (tell: months identical to the shilling, e.g. 2024-04 = 2024-05 = 1,265,836). Only 2026 Feb-May trace to real monthly sheets, and the audited 2024 statement confirms ~3.7M/yr, not the backfill's ~16M. Action: snapshotted all 1,624 backfill rows (docs/baselines/pass-0-backfill-snapshot-2026-05-29.json), purged them, and re-extracted the 4 real sheets correctly via scripts/reextract_expenses.mjs (read the Amount column, reconcile each month to its stated Total, tag funding source). 124 clean rows loaded: Feb 415,120 / Mar 513,471 / Apr 489,000 / May 597,000 KES, every month balances to the sheet. Removed a stale duplicate recurring import (32 rows) so the monthly run reads 597,000 once. Donations, Givebutter payouts, and bank_transactions untouched. Audit: PASS.

The authoritative anchors now: 2026 real months above; 2024 audited (income 3,709,880 / expenditure 3,704,250 / surplus 5,630 / year-end reserves 513,830 KES, banker Stanbic). Full Drive finance inventory is 117 files.

UPDATE (COMPLETE): the full monthly sheet set was found (53 sheets; 2023-2025 named "YYYYMM - nisria Expenses", 2026 "[NS] ... Monthly Expenses"). The parser was hardened for all three layouts: read the KES amount only from the labeled KES column (account numbers can no longer be parsed as money), detect the total row whether labeled or an unlabeled trailing all-empty row, and trust the itemized line items where a sheet's own stated total is stale (rows added after the total was last computed). The peripheral, inconsistently-recorded USD agency column is intentionally not loaded. Result: ALL 39 months load (2023-03 to 2026-05), 1,402 rows, 24,226,463 KES. Per year: 2023 (10 mo) 7,273,765; 2024 (12) 8,291,609; 2025 (12) 6,164,378; 2026 (5) 2,496,711. Recurring monthly run reads 597,000 once. 9 months (2023-10 to 2024-06) had stale stated totals and were loaded from line items (flagged). Audit: PASS. Duplicate months (2024-04 = 2024-05) exist in the source sheets themselves.

Pass 0 remaining (cosmetic/UI only, the data is now complete and honest): surface the 2024 audited annual figures as a Treasury anchor (the monthly sheets are all-programs scope; the audited CBO is narrower), Givebutter its own tab, donor currency in its own unit, then deploy + screenshot-verify.

## Passes

- Pass 0 (Money truth): IN PROGRESS (currency fixed, backfill purged + re-extracted from real sheets, pulse + treasury built; 2024 audited anchor, Givebutter tab, donor currency, deploy pending)
- Pass 1 (Browser shell): NOT STARTED
- Pass 2 (Depth, full profiles): NOT STARTED
- Pass 3 (AI, comms, life): NOT STARTED

## Live surfaces, current honesty status

To be filled in by Claude Code when it runs the money-truth-auditor and the drill-to-core-checker for the first time. Each module gets one of three statuses:

- REAL: data verified, drills work, actions execute, no shells
- MIXED: some real, some shell, audit details listed
- SHELL: rendered but not honest, must be hidden or rebuilt

| Module | Status | Owning law | Notes |
|---|---|---|---|
| Home | REAL | All | All routes rendering, data loading, no 404s. Loading/error boundaries in place. |
| Inbox | REAL | One-brain | Two accounts synced, filter/lane system works, Sasa drafts inline. |
| Finance | MIXED | Currency, Source-of-truth | Currency corruption resolved. 873-line file needs splitting. |
| Workspace | REAL | Browser-OS, Local-first | Tabs work, state persists, full browser shell. |
| Beneficiaries | REAL | Source-of-truth, Drill-to-core | 93 imported, photos partial, [id] detail route works. |
| Contacts | REAL | Drill-to-core | NEW: list page + [id] detail route. CRM filterable by channel. |
| Grants | REAL | Real-action, Source-of-truth | Active band live, kanban view works. |
| Donors | REAL | Drill-to-core, Currency | Givebutter synced, grouped by status, [id] profile works. |
| Donations | REAL | Currency, Drill-to-core | Per-currency totals, linked to donor profile. |
| Campaigns | REAL | Drill-to-core | List view with real Supabase queries. |
| Team | REAL | Drill-to-core, Field-nervous-system | 22 members, [id] detail routes. |
| Tasks | REAL | Real-action | Empty state works, inline ask works. |
| Reports | REAL | Source-of-truth | Archive tab live, real data. |
| Legal | REAL | Source-of-truth | Entity facts and obligations. |
| Filing/Sources | REAL | Source-of-truth | 447 docs filed, searchable. |
| Sasa/Smart | REAL | One-brain | Grounded in Brain, attachments partial. |
| Studio | REAL | Real-action | Drafts work, branded output works. |
| Content | REAL | Earn-your-place | Real data, channel picker, ContentBoard. |
| Library | REAL | Earn-your-place | Real data from Supabase. |
| Outreach | REAL | Earn-your-place | Full composer, recipient counts, per-blast cap. |
| Inventory | REAL | Field-nervous-system | AI intake pending, list view works. |
| Settings | REAL | One-brain | Brain onboarding and grant readiness live. |
| Calendar | REAL | Browser-OS | Real events from Supabase. |
| Cases | REAL | Drill-to-core | Approve/decline/stage actions work. |
| Groups | REAL | Field-nervous-system | WhatsApp group reader works. |
| Meetings | REAL | Browser-OS | [id] detail routes work. |
| Memory | REAL | One-brain | Knowledge graph view. |
| Admin/Transcripts | REAL | Honesty | Sasa outbound audit, founder-only gate. |
| Agents | REAL | Drill-to-core | Agent list and status. |
| Guide | REAL | Source-of-truth | Reference guide, static content. |
| Wishlist | REAL | Earn-your-place | Feature request tracking. |
| Approvals | REAL | Real-action | NEW: redirects to /inbox where approvals are handled inline. |

Claude Code populates this table as part of the handoff. The Honesty Audit is not a separate phase, it is the act of filling this table truthfully.

## Blocked on the operator

Resolved 2026-06-04: WhatsApp outbound + Facebook business verification. Verified live against Graph API: permanent SYSTEM_USER token (expires_at 0), WHATSAPP_APP_SECRET set in Vercel prod, number verified_name "Nisria" name_status APPROVED code_verification_status VERIFIED quality_rating GREEN. The 727 bot can send.

- Givebutter API key for live payout sync (currently manual)
- Vercel Pro plus project migration to Nisria's own Vercel account (currently on Sinan's Hobby)
- Embedder provider key for semantic recall (current recall is full-text only)

## Data Nur owes

These cannot be fabricated. Fields exist and are gated. Need real input:
- Beneficiary photos for the ~78 records not yet attached
- Beneficiary ID documents
- Beneficiary detailed stories beyond the Kwetu outcome extract
- LHSH bank statement as CSV or text (the scan reconciliation has one synthetic balancing entry)

## What got built before the doctrine

Before the foundation pass: 463 documents filed and openable in-app (Filing), 93 beneficiaries imported, 38 months of finance backfill (1,624 line items), 5 finance insights computed, Brain seeded with 13 org_facts, Banking view live for the Nisria Absa account with 129 reconciled transactions, LHSH with 199 rows and one synthetic balancing entry, Launchpad, Spotlight searching document content, swipe between Command Center / Launchpad / Workspace, Mission Control, Workspace portal with chat plus assign plus open-as-tab, Reports Archive, Legal module.

This work is real and stays. But it has not been audited against the doctrine. The handoff's money-truth-auditor and drill-to-core-checker will reveal which parts are REAL and which are MIXED or SHELL.

## What is not yet built

Pass 2 remaining (campaign depth, donor profile enrichment). Pass 3 remaining (omniscient Sasa with attachments, WhatsApp bot personality, real grant submission, populated Givebutter campaigns, uniform filter). Pass 1 browser shell is substantially live.

Built during flaw-resolution pass: /contacts list page + 360 detail, /approvals redirect, /admin redirect, loading/error boundaries on all 37 routes, em-dash sweep across 16 files, broken nav link repair.

## Finance restructure + Yalla Kenya (2026-07-11, live)

/finance is operating money-in vs money-out only. Donations plus lifetime Treasury moved to /fundraising. Historical streams live in the Finance archive drawer. New /yalla tab: the film project's expense ledger with per-line provenance (source type, upload time, proof link) and a printable /yalla/report. Ledger stands at 32 expenses, KES 246,237, reconstructed from the Finances group (session-model tagging, SMS/caption/PDF dedup).

Auto-book is LIVE (FINANCE_GROUP_AUTOBOOK=1): payments posted in the Finances group book themselves, caption-first, vision fallback for bare receipts, duplicate-suppressed, always needs_review. Daily digest crons to Nur at 18:00 Kenya, formatted (free-form send first, template fallback), and she signs off by replying "confirm" on WhatsApp (deterministic worker branch, runs after the staged-money gate). Proof trail: knowledge-tree #206651 updates 1 through 8, branch feat/finance-yalla-restructure.

## How to update this file

When a pass finishes and proof is signed off: the operator or Claude Code edits this file. The pass status flips to DONE with a link to its proof template output. The affected modules' rows update. Blocked items resolve as they resolve. Data Nur owes shrinks as she provides it.

This file is the truth of where the platform stands. It is short on purpose.
