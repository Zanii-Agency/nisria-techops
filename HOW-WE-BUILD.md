# How We Build

The operating method. Merges what was in NISRIA-BUILD-SPEC.md, RUN-PROTOCOL.md, and RUNBOOK.md into one document. Pairs with NISRIA-DOCTRINE.md (the laws) and STATE.md (where we are right now).

## Operating stance

When finalising or designing: think like a principal software architect. Simple, reliable, no ambiguity.

When building: act like a minimal-change engineer. Smallest reversible diffs. Build beside, not inside. Verify and commit each step. Blast radius of one module.

When verifying: reality checker. Nothing is "done" without proof. Live curl, database query, or rendered screenshot. Per the Honesty Law.

When extracting data: data-QA mindset. Confidence scoring plus a human review gate before financial or beneficiary data becomes truth. Never guess. Never silently lump.

## The principles

Do: extract content into structured native data. Put each thing in its natural home. Keep a small hidden source link per record. Build new beside old (new files plus feature flags). Small diffs. Build, typecheck, verify, commit each step. Calm by default, manage by exception. Completeness plus detail with safeguards.

Don't: make Nur open a file or hunt folders. Dump into a generic Filing folder. Strip beneficiary detail. Rewire the working FocusSheet popups. Ship lossy summaries where structured data is needed. Auto-commit financial or beneficiary extractions. Say "done" without proof. Em-dashes, AI placeholders, fabricated figures. Mix KES and USD.

## The four passes

Work flows through four passes. One pass at a time. Each pass finishes with proof before the next begins.

**Pass 0: Money truth.** Quarantine the 226 corrupt rows. Re-extract every Drive expense and worker payment correctly into KES. Re-OCR the bank statements for debits. Log every historical gift at market FX. Rebuild Finance: A to Z treasury summary in USD with KES shown separately, real ledger of actual spend, Givebutter split into its own tab, funding-in bars showing real amounts, pulse with all months and a talk-to-it box.

**Pass 1: The browser.** Make the shell a true browser. Launchpad becomes the new-tab page. Tabs keep state on switch. Remove the forced structure strip. Fold the email portal into a "Comms" app. Make every artifact open in-portal.

**Pass 2: Depth.** Full profiles for campaigns, donors, contacts (as a new real section), team, grants. Beneficiary photos render and open locally. Document extraction that preserves paragraphs, tables, numbers, and allocates every photo.

**Pass 3: AI and comms and life.** Sasa omniscient with attachments. WhatsApp bot with onboarding, language, escalation, inventory capture. Grants that truly submit by email with progress. Newsletter rethought around purpose. Givebutter campaigns populated. Uniform filter component. Dead surfaces removed. Drive shows connected. Loading-to-done feedback everywhere.

## The sub-agents

Four agents enforce the doctrine while passes run. All in /.claude/agents/.

**doctrine-reviewer.** Read-only on diffs. Reads NISRIA-DOCTRINE.md, reads the diff, returns violations by law number. Runs before every commit.

**money-truth-auditor.** Read-only on the database. Queries for currency law violations. Runs at the start and end of any Finance work.

**local-first-enforcer.** Read-only on the codebase. Greps for window.open, target="_blank", external links. Runs at the start of Pass 1 and before every Pass 1 commit.

**drill-to-core-checker.** Read-only on the codebase. Verifies every list opens a profile. Runs during Pass 2.

## The skills

Four skills in /.claude/skills/. Operational patterns, referenceable by name.

**currency-handling.** The Currency Law operationalized. Functions, queries, examples.

**drive-extraction.** How to extract Drive documents preserving structure. The staging-then-promote workflow.

**verification-protocol.** The Honesty Law operationalized. The proof template.

**focus-sheet-pattern.** The one centered modal primitive. How to use it. What never to roll yourself.

## The worktree pattern

Each pass runs in its own git worktree on its own branch.

```
git worktree add ../nisria-pass-0 pass-0-money-truth
cd ../nisria-pass-0
# do the work
# when proof template is filled and operator signs off:
git checkout main
git merge pass-0-money-truth
git worktree remove ../nisria-pass-0
git branch -d pass-0-money-truth
```

This is non-negotiable. Passes do not run on main. Passes do not run in parallel. Passes do not leak into each other.

## The proof discipline

Every pass ends with the proof template from Law 11 filled in. The operator reviews the proof before approving the merge. If the proof is incomplete, the pass is incomplete, regardless of how much code was written.

## Handoff to Claude Code

When Claude Code picks up this work for the first time, it executes these steps in order before doing anything else. Each step has its own proof.

**Step 1: Verify the foundation files exist.**

Check that the following are present at the repo root or correct subdirectories:
- /CLAUDE.md (root pointer)
- /NISRIA-DOCTRINE.md (the eleven laws)
- /NISRIA-DESIGN-SYSTEM.md (existing)
- /NISRIA-DATA-MAP.md (existing)
- /HOW-WE-BUILD.md (this file)
- /STATE.md (current state)
- /docs/decisions/0001 through 0011 (the ADRs)
- /.claude/agents/{doctrine-reviewer,money-truth-auditor,local-first-enforcer,drill-to-core-checker}.md
- /.claude/skills/{currency-handling,drive-extraction,verification-protocol,focus-sheet-pattern}.md
- /platform/app/finance/CLAUDE.md
- /platform/app/workspace/CLAUDE.md
- /platform/app/beneficiaries/CLAUDE.md
- /platform/components/CLAUDE.md
- /platform/lib/CLAUDE.md

If any are missing, stop and report to the operator.

**Step 2: Archive the superseded documents.**

Move the following into /docs/archive/ and add a small README explaining what they were:
- DESIGN-LOGIC-AUDIT.md
- FEEDBACK-ROUND-2026-05-26.md
- QA-SWEEP-2026-05-26.md
- NISRIA-IA-AUDIT.md
- LOGIC.md
- The original NISRIA-BUILD-SPEC.md, RUN-PROTOCOL.md, RUNBOOK.md (now merged into HOW-WE-BUILD.md)
- OVERNIGHT-LOG.md (replaced by STATE.md, preserved as historical journal)
- The folders content/, fundraising/, operations/, comms/, automation/ from the legacy techops planning
- The original top-level README.md (the 5-pillar planning doc)

Use `git mv` so history is preserved. Commit with message: "archive: move superseded docs to /docs/archive/ per HOW-WE-BUILD handoff step 2".

**Step 3: Regenerate the SQL schema from the live database.**

The schema is currently fragmented across ten SQL files. Consolidate by querying the live Supabase project (ptvhqudonvvszupzhcfl) for the current schema and writing two files:
- /platform/db/schema.sql (full DDL, regenerated from live)
- /platform/db/policies.sql (RLS policies only, regenerated from live)

Archive the old fragmented SQL files into /docs/archive/legacy-sql/. Commit with message: "db: consolidate schema and policies from live database".

**Step 4: Run the money-truth-auditor baseline.**

Invoke the money-truth-auditor sub-agent against the live database. The auditor outputs a baseline report saved to /docs/baselines/money-truth-baseline.md. The report must include:
- Count of donations with currency='USD' and amount > 1,000,000 (likely KES read as USD)
- Count of donations with null or empty currency
- Count of payments tagged USD that were originally KES expenses
- The corrupt-row count for the drive monthly history batch (target: identify the 226)
- Sample of ten suspect rows with their source documents

Present the baseline to the operator. Do not start Pass 0 until the operator confirms the baseline matches their understanding.

**Step 5: Create the Pass 0 worktree.**

```
git worktree add ../nisria-pass-0 pass-0-money-truth
```

Confirm the worktree exists. Confirm the branch is fresh. Report to the operator.

**Step 6: Wait for the operator's "go" on Pass 0.**

Do not start the actual money-truth work until the operator says go. The handoff is complete when steps 1 through 5 are verified and the baseline report is on the operator's screen.

## After Pass 0 lands

Same pattern. Worktree, work, proof template, sign-off, merge, next pass. Pass 1 begins only after Pass 0's worktree is merged and archived. Each pass adds its own ADR if new decisions were made that the doctrine should record.

## The end state

When all four passes have merged and their proofs are filed, STATE.md updates to reflect: every module shows real data, every action executes truly, every artifact opens in-portal, Sasa is omniscient, the WhatsApp bot is the field nervous system, the design system holds. At that point, the next phase of work is whatever Nur asks for next, not what the doctrine dictates. The doctrine exists to get the platform to honest. Honest is the floor, not the ceiling.
