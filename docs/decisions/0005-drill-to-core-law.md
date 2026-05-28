# ADR 0005: Drill-to-core Law

**Status:** Adopted
**Date:** 2026-05-29
**Governs:** Law 5 of NISRIA-DOCTRINE.md

## Context

Some entity types in the platform had rich profile pages (beneficiaries reached the bar with cohort, story, photos, funding, lifecycle, related guardians). Others had a card and nothing behind it. Click a campaign and you got a small peek with three fields. Contacts had no detail route at all. Documents linked to Drive instead of opening as records.

The operator's mental model is that every object on screen is a doorway. Click a row, get the full picture. The platform violated this for half its entities, creating dead ends and forcing the operator to remember which entities had depth and which didn't.

## Decision

Every list row opens a complete profile, to the beneficiary-profile standard. Campaigns, donors, contacts (as a new real section), team, grants, documents, and any future entity type. Each profile shows identity, history, related entities, and actions. From a profile you can act (assign a task, send a message, edit, advance state).

Peeks and FocusSheets exist for glances. Tabs exist for work. But there is always a full profile route behind any entity, reachable from any list view.

## Consequences

Pass 2 owns this work. New routes appear for /campaigns/[id], /donors/[id] (deepened), /contacts/[id] (new section), and any other entity currently lacking. The drill-to-core-checker sub-agent enforces by scanning the codebase for list views and verifying every one has a corresponding detail route.

Cost: more routes, more pages, more components. Benefit: predictable navigation, no dead ends, the operator's "everything is a doorway" mental model becomes true.

## Rollback

None contemplated. The law cannot be relaxed without re-introducing the dead-end pattern.
