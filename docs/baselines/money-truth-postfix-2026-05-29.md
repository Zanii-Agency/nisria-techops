# Money Truth Audit

Date: 2026-05-29
Run by: money-truth-auditor (scripts/money_truth_audit.py)
Database: Supabase project ptvhqudonvvszupzhcfl
Mode: read-only (no writes, no deletes, no mutations)

## Law 2 violations (Currency)

- KES rows as USD (donations, amount > 1,000,000): **0**
- KES rows as USD (payments, amount > 1,000,000): **0**
- Untagged currency (donations): **0**
- Untagged currency (payments): **0**

## Law 1 violations (Source-of-truth)

- Drive monthly history poisoned rows (created_by='drive monthly history', currency='USD'): **0**  _(target after Pass 0: 0)_
- Donations with no source (external_id null and channel != 'manual'): **0**
- Bank accounts missing debits: **none**

### Bank transactions by account
| account | credits | debits | first | last |
| --- | --- | --- | --- | --- |
| Absa 2043066008 · Nisria CBO (UWEZO KES) | 13 | 116 | 2021-10-01 | 2022-11-11 |
| LHSH · Absa Bank Kenya - 2031538133 | 44 | 155 | 2021-10-01 | 2022-11-11 |

### Extraction staging health
| status | confidence | n |
| --- | --- | --- |
| committed | high | 3 |

## The damage in one figure

- USD payments-out total as stored: **27652** (this is the poisoned, impossible number)
- USD payments-out total of only the sane rows (amount <= 1,000,000): **27651.66**
- The gap between those two is the corruption.

## The trustworthy side (for reference, not a clean total)

- Donations USD (succeeded): **$26482.61**
- Donations KES (succeeded): **14827776 KES**
- Payments out KES (paid): **2014591 KES**
- Note: these are NOT summed across currencies. Per the Currency Law, a blended total requires market FX and is built in Pass 0.

## Spot check: 10 random USD donations
| amount | currency | donated_at | external_id | campaign |
| --- | --- | --- | --- | --- |
| 50.00 | USD | 2025-11-01 | RHILQaE22sfHDYbs | One of 500 |
| 50.00 | USD | 2026-01-01 | 2VR0kwUlMmgOu7In | One of 500 |
| 100.00 | USD | 2025-09-01 | pPvVA6ckXjx2zs4f | One of 500 |
| 300.00 | USD | 2026-03-20 | eBa3JOfWyAaG9SJu | One of 500 |
| 100.00 | USD | 2025-03-14 | NrDCCsZhzH31I7Wz | One of 500 |
| 100.00 | USD | 2025-11-01 | B53b406cTX4vCe56 | One of 500 |
| 100.00 | USD | 2026-02-01 | WPGOKSl2IOKB8hEe | One of 500 |
| 100.00 | USD | 2026-03-24 | iztvAwL3bPUDI4JE | One of 500 |
| 1800.00 | USD | 2025-01-28 | jSdZPvwQia6Wx0jh | One of 500 |
| 15.00 | USD | 2026-03-12 | FtuCzAIxUHCMxfUj | One of 500 |

## Spot check: 10 random KES payments
| payee | amount | currency | paid_at | created_by | ref |
| --- | --- | --- | --- | --- | --- |
| Violet Otieno | 7500 | KES | 2026-05-28 | drive sheet 2026-05 | drive sheet 202605 #10 |
| Linda Ojuok | 40000 | KES | 2026-02-28 | drive sheet 2026-02 | drive sheet 202602 #1 |
| Violet Otieno | 12500 | KES | 2026-03-28 | drive sheet 2026-03 | drive sheet 202603 #9 |
| Linda Ojuok | 20000 | KES | 2026-04-28 | drive sheet 2026-04 | drive sheet 202604 #3 |
| Electricity | 3000 | KES | 2026-03-28 | drive sheet 2026-03 | drive sheet 202603 #27 |
| Garbage Collection | 2000 | KES | 2026-05-28 | drive sheet 2026-05 | drive sheet 202605 #39 |
| Violet Otieno | 7500 | KES | 2026-04-28 | drive sheet 2026-04 | drive sheet 202604 #10 |
| Elizabeth Kariuki | 30000 | KES | 2026-04-28 | drive sheet 2026-04 | drive sheet 202604 #14 |
| Jackline Agutu | 5000 | KES | 2026-03-28 | drive sheet 2026-03 | drive sheet 202603 #20 |
| Eston Mundia | 30000 | KES | 2026-03-28 | drive sheet 2026-03 | drive sheet 202603 #12 |

## Verdict

**PASS**

Next action: run Pass 0 (quarantine the 0 poisoned rows, re-extract the Drive
monthly expenses correctly into KES, re-OCR bank debits, log historical gifts at market
FX, then rebuild the Finance surface). Do not start until the operator confirms this
baseline matches their understanding.
