# ADR 0009: Earn-your-place Law

**Status:** Adopted
**Date:** 2026-05-29
**Governs:** Law 9 of NISRIA-DOCTRINE.md

## Context

The platform accumulated surfaces faster than they earned their place. Outreach had nothing in it. Newsletter was broken (Givebutter campaigns weren't populating). Content was a placeholder. Library was unused. The "Agent activity" tab took space and showed "no activity." Home had a "Recent activity" card duplicating Workspace. Home had a "Fundraising" block when Finance is the home for money.

Each one was added with intent but operated as dead weight. Each one took nav real estate, attention, and maintenance cost. The operator's cognitive load grew faster than the operator's capability did.

## Decision

Every module, card, and section either holds real current value or it is removed. Money lives in one place (Finance), not duplicated on Home. Activity lives in one place (Workspace), not duplicated on Home. Outreach either gets real functionality or it leaves the nav.

Removal is not destruction. Removed modules archive their code under `_legacy/` or behind a flag. They can return when there's data and a workflow to justify them. They do not stay live as shells.

## Consequences

Pass 3 includes a "dead surfaces removed" task. The drill-to-core-checker plus a sister audit (the earn-your-place check, run manually for now) identifies surfaces with no real data and no recent operator use, and proposes removal. Each removal needs operator sign-off.

The Home page shrinks. The nav shrinks. The platform feels more empty and more useful at the same time.

## Rollback

A removed module can return when it has data to show and a workflow that uses it. Returning a module requires its own ADR justifying the new value, the data source, and the workflow.
