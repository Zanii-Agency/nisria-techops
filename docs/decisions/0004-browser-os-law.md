# ADR 0004: Browser-OS Law

**Status:** Adopted
**Date:** 2026-05-29
**Governs:** Law 4 of NISRIA-DOCTRINE.md

## Context

The platform shipped with a "structure tab strip" that auto-pinned pages as the operator navigated, creating a forced breadcrumb trail that didn't behave like any tab system anyone has used. Tabs lost state on switch. Tab titles sometimes showed raw UUIDs ("Fad65b6d 4ba4 49a6 A..."). The operator's expectation was a real browser: open something, switch away, come back, find it where you left it.

Nur was explicit: "Launchpad should be the new-tab page, not a separate disaster. Tabs must behave like Chrome or Safari: open, switch, keep their state, close. Not a forced breadcrumb trail that re-navigates and loses your place."

Underneath this was a deeper confusion: the platform had two competing navigation systems trying to be primary, and neither was a complete metaphor.

## Decision

The shell is a browser. One navigation metaphor. Launchpad is the new-tab page (the place you land when no tab is open, the place you go to find any app). Tabs open, switch, keep their full state, close. No forced pinned strip.

Two ways into anything: type (Spotlight ⌘K, the universal search-and-action palette) or see (Launchpad for apps, Mission Control for open tabs as thumbnails).

Glance versus work distinction: a popup (FocusSheet, centered, blurred backdrop) is for a glance; a tab is for actual work. Promoting a popup makes it a tab.

## Consequences

The existing tab strip becomes the Workspace strip and gets the route-backed, persistent, state-preserving treatment. The forced "structure" auto-pin is removed entirely. State is keyed by tab id so swapping a sibling triggers proper remount.

This is structural and risky. Pass 1 owns the rework and runs behind the NEXT_PUBLIC_WORKSPACE feature flag so the existing app continues to work while the new shell is built beside it. The flag flips only when the new shell passes the doctrine-reviewer and the operator's eye-verification.

## Rollback

If the new shell creates regressions, the flag flips back to off and the old shell is the fallback. The old shell stays in the codebase, marked deprecated, until two consecutive passes ship without the flag being toggled.
