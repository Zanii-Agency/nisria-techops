# ADR 0001: Source-of-truth Law

**Status:** Adopted
**Date:** 2026-05-29
**Governs:** Law 1 of NISRIA-DOCTRINE.md

## Context

The platform shipped surfaces populated from fabricated, half-extracted, or mistagged data. The most visible failure was a $129 sextillion USD total on the Finance dashboard, caused by the drive monthly history backfill reading bank reference numbers as dollar amounts and tagging Kenyan expenses as USD. 226 rows were poisoned.

This was not an isolated bug. It was symptomatic of a pattern: ship the surface, then claim done before the data is verified. Other instances included bank statements imported with credits only and zero debits (only 2021 to 2022), beneficiary records with placeholder stories, Word documents dumped as raw text losing tables and paragraph structure, photos imported but not allocated to records.

The agent at the time admitted the failure: "I have been building breadth instead of depth: 700 functions, 30 screens, many of them shells that are empty, stale, half wired, or filled with garbage data I imported and never verified."

## Decision

No surface ships until it is populated from the real source and verified by row count and spot check. Extracted documents preserve structure. No fabricated numbers. No half-imports. No empty shells called done.

The Currency Law (0002) and the Honesty Law (0011) exist as direct corollaries.

## Consequences

Every Finance surface now traces every displayed figure back to its query and through to its source document. Extracted data lands in extraction_staging with confidence scoring and a review gate before promotion to production tables. Pass 0 of the build sequence exists specifically to repair the violations that created this ADR.

The cost is slower shipping for any surface that depends on extracted data. The benefit is that surfaces stop lying to the operator, which was the through-line failure from CORTEX to here.

## Rollback

If this law is ever relaxed, the rollback is to permit fabricated or unverified data on surfaces marked clearly as "demo" or "preview." No such marking currently exists. Adding it would require a new ADR and a UI convention. Until then, the law holds absolutely.
