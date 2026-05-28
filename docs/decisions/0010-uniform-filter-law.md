# ADR 0010: Uniform-filter Law

**Status:** Adopted
**Date:** 2026-05-29
**Governs:** Law 10 of NISRIA-DOCTRINE.md

## Context

The platform shipped at least five different filter UIs across its list views: inline chips on one page, a sidebar select on another, a top-bar dropdown on a third, a free-text input on a fourth, a hardcoded category toggle on a fifth. Long lists (legal categories, beneficiary cohorts, grant tiers) used different patterns each.

The operator's reference was Bayut's "More Filters": one dropdown panel, dense, scannable, consistent across the entire site. Nur named this explicitly. The platform was further from that ideal in each new module.

## Decision

One commercial-grade filter component used everywhere. One dropdown panel pattern. Categories are dropdowns (not free text). Data is arranged sequentially (alphabetical, or chronological, or by frequency) within each filter group.

The component lives in /platform/components/Filter.tsx and is the only allowed filter UI. Existing inconsistent filters get replaced as their owning modules go through their pass.

## Consequences

Pass 3 includes the filter unification work. The component is built once with the Bayut-equivalent ergonomics: multi-select, search within filter, applied state visible, clear-all, persisted in URL params.

Existing filters get rewritten as they touch. No big-bang rewrite; module-by-module replacement during normal pass work. By the end of Pass 3, the filter audit (visit every list view, count distinct filter UIs) returns exactly one pattern.

## Rollback

None. Inconsistent filter UIs are the failure pattern this law eradicates.
