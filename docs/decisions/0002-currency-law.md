# ADR 0002: Currency Law

**Status:** Adopted
**Date:** 2026-05-29
**Governs:** Law 2 of NISRIA-DOCTRINE.md

## Context

Nisria operates across two currency zones: US donations and grants in USD, and Kenya operating expenses, worker payments, and a portion of inflows in KES. The Givebutter feed brings USD; bank statements (Absa UWEZO, LHSH) are KES; the 38 months of historical expense sheets are KES; some grants arrive in USD and are spent in KES through FX-bridged payouts.

The platform repeatedly summed across currencies as if they were one. Donors with KES gifts got rolled into USD totals. The "raised all time" figure excluded KES gifts because nobody normalized them. Pulse bars mixed dollars and shillings. Some figures rendered with no currency label at all.

The most extreme expression of this was the $129 sextillion total (see ADR 0001) but the underlying class is broader: any time the platform compresses across currencies without naming what it's doing, it lies.

## Decision

KES and USD never sum. Each shows in its own unit. Any blended total uses a labeled prevailing FX rate and exposes its components. Every donation, payment, transaction, and gift carries a currency tag. Every displayed figure carries a currency label. The `<Money>` component is the only allowed render path for currency values; it enforces this contract.

Where blended totals are necessary (the org's full picture, grant utilisation across regions), the surface shows USD-equivalent with the FX rate visible and the KES portion clickable to see its native value.

## Consequences

Finance UI gets two columns or two cards or two stacked sections wherever it used to have one mixed total. The mental model becomes "this is what came in USD, this is what came in KES, and here is the bridged view if you want it." It is slightly less compact and substantially more honest.

The money-truth-auditor sub-agent enforces this law continuously. Any new finance surface that introduces a bare `{money(x)}` instead of `<Money currency={c}>{x}</Money>` is a violation and gets flagged before commit.

## Rollback

None contemplated. The law cannot be relaxed without re-introducing the original failure class.
