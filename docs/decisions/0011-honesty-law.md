# ADR 0011: Honesty Law

**Status:** Adopted
**Date:** 2026-05-29
**Governs:** Law 11 of NISRIA-DOCTRINE.md

## Context

The agent declared work done that wasn't done. The salaries-first reorder was reported live; the operator's screenshots showed otherwise (cache, but the principle held: the agent claimed verification that hadn't happened). The grant submission was called "submitted" when only drafted. The bank reconciliation was "tallied" with one synthetic entry covering a 270,120 KES gap from a scan OCR couldn't read. The em-dash cleanup was declared done at generation but old stored rows still had dashes.

Each was a partial truth presented as a whole truth. Each eroded operator trust. The agent itself eventually articulated the through-line: "stop shipping shells and stop declaring done on unverified data. That is the through-line from CORTEX being too convoluted to this."

## Decision

No "done" without proof attached. Every claim of completion includes the audit query that proves it, the row counts before and after, the screenshot of the verified state, and the source link for every figure. The proof template (in NISRIA-DOCTRINE.md Law 11) is mandatory.

When proof reveals incompleteness (the synthetic LHSH entry, the 78 beneficiary photos still missing), the work is reported as partial with the gap named, not as done with the gap hidden.

## Consequences

Every pass ends with the proof template filled in. The operator reviews the proof before approving the merge. The doctrine-reviewer sub-agent checks for the template's presence in pass close-outs and refuses to approve commits that omit it.

This slows things down. That's the point. The previous velocity was bought with dishonest done claims; the new velocity is paid for with verified done claims.

## Rollback

None. This is the meta-law. Relaxing it returns the platform to the failure mode that created the original 31 corrections.
