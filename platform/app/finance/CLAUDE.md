# Finance Module Rules

This file governs all code in /platform/app/finance/ and the finance-touching parts of /platform/lib/. Read it before any change.

## Laws governing this surface

- **Law 1 (Source-of-truth).** Every figure on every finance surface traces back to a query that traces back to a source document. No fabricated numbers.
- **Law 2 (Currency).** KES and USD never sum. `<Money currency={c}>` is the only render path.
- **Law 6 (Real-action).** Approve, send, log, mark-paid: each shows loading → success → confirmation. Labels match effects.
- **Law 11 (Honesty).** Every change here ends with the proof template filled in, including a money-truth-auditor run.

See /NISRIA-DOCTRINE.md for full law text. See /docs/decisions/0001, 0002, 0006, 0011 for historical reasoning.

## The skills that apply

- `currency-handling`. Mandatory. Reference before any code that displays, sums, or stores money.
- `drive-extraction`. For any code that ingests finance data from Drive.
- `verification-protocol`. At end of every change.

## The schema you're working in

Tables: `donations`, `payments`, `team_payments`, `bank_transactions`, `campaigns`, `grant_applications`, `extraction_staging`, `finance_insights`.

Key relations:
- `donations.donor_id → donors.id`, `donations.campaign_id → campaigns.id`
- `payments.team_member_id` for payroll; `payments.source_doc_id` for traceability
- `bank_transactions.source_doc_id` ties every row to the statement it came from
- `extraction_staging` is the review gate. Nothing financial promotes to production without passing through it.

## Hard rules specific to finance

1. **Every figure has a query.** No `const total = 26400` literals. Even seed data is loaded from a query against extraction_staging or production tables.

2. **Every figure has a currency tag.** Either the table column carries it or the component prop carries it. Never inferred.

3. **The drive monthly history batch is poisoned.** Until Pass 0 cleans it, treat any row with `created_by = 'drive monthly history' AND currency = 'USD'` as suspect. The money-truth-auditor counts these; the target after Pass 0 is zero.

4. **Givebutter payouts get their own tab.** They are not "paid history" in the operating sense; they are the bridge between USD donations and KES operating spend. Show them as their own stream.

5. **Pulse bars show real amounts.** Not decorative. Each bar is a query result. If a month has no data, the bar is absent or labeled "no data," not faked.

6. **The ledger is real spend.** Derived from bank statements (debits) and invoices, not from Givebutter payouts. Givebutter payouts are inflow to Kenya, not outflow from the org.

7. **A to Z treasury summary.** The Finance home shows: total in (per currency), total out (per currency), net position (per currency, plus blended USD with FX rate visible). Every figure clickable to its source.

## What violates this module's law

- A USD total that includes KES rows
- A KES figure displayed as `$X`
- A "submitted" label on an action that only drafts
- A pulse bar whose value isn't a query result
- A figure with no clickable drill to source
- A ledger row sourced from Givebutter payouts (those are the bridge, not spend)

## Before commit checklist

1. Run money-truth-auditor. Attach output.
2. Run doctrine-reviewer. Attach output.
3. Spot check three random figures on the changed surface against their source documents.
4. Fill proof template (see verification-protocol skill).
5. Operator reviews and approves the merge.

## When the operator says "the money is wrong"

Default response: do not patch the surface. Trace back through the query to the source. Find which law was violated. Fix at the layer of the violation, not at the layer where it became visible.
