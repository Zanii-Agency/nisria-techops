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
- Payments out KES (paid): **12654463 KES**
- Note: these are NOT summed across currencies. Per the Currency Law, a blended total requires market FX and is built in Pass 0.

## Spot check: 10 random USD donations
| amount | currency | donated_at | external_id | campaign |
| --- | --- | --- | --- | --- |
| 10.00 | USD | 2025-10-17 | ggS9EukX8V96jd4f | One of 500 |
| 77.50 | USD | 2025-09-27 | gCtGEWeyjHpU5IO7 | One of 500 |
| 300.00 | USD | 2026-03-24 | hEAq5Q3cb5Gjs36c | One of 500 |
| 1800.00 | USD | 2025-01-28 | jSdZPvwQia6Wx0jh | One of 500 |
| 100.00 | USD | 2025-10-01 | mRhcyxpQHSq7WlwC | One of 500 |
| 10.00 | USD | 2025-12-17 | l5GuEXyjoyYvRkYc | One of 500 |
| 100.00 | USD | 2025-12-01 | G8dwsv9Q51NnsQAn | One of 500 |
| 500.00 | USD | 2026-05-22 | UVbRnoZ2Bo8rJW4c | One of 500 |
| 116.11 | USD | 2025-03-16 | dAuSJLV1irvN6qsG | One of 500 |
| 50.00 | USD | 2025-12-01 | FV95VxbrPPvNDSIY | One of 500 |

## Spot check: 10 random KES payments
| payee | amount | currency | paid_at | created_by | ref |
| --- | --- | --- | --- | --- | --- |
| Cynthia Shinamote | 5000 | KES | 2025-03-28 | drive sheet 2025-03 | drive sheet 202503 #26 |
| Kevin Mburu | 20000 | KES | 2025-02-28 | drive sheet 2025-02 | drive sheet 202502 #10 |
| Maisha Wifi | 3500 | KES | 2025-09-28 | drive sheet 2025-09 | drive sheet 202509 #25 |
| Monicah Wanjira | 20000 | KES | 2026-04-28 | drive sheet 2026-04 | drive sheet 202604 #13 |
| Geoffrey Wainaina | 5000 | KES | 2025-01-28 | drive sheet 2025-01 | drive sheet 202501 #26 |
| Eric | 5000 | KES | 2025-01-28 | drive sheet 2025-01 | drive sheet 202501 #28 |
| Electricity | 3000 | KES | 2026-05-28 | drive sheet 2026-05 | drive sheet 202605 #35 |
| Simon Ngigi | 7200 | KES | 2024-09-28 | drive sheet 2024-09 | drive sheet 202409 #24 |
| Water | 3500 | KES | 2026-02-28 | drive sheet 2026-02 | drive sheet 202602 #20 |
| Cecilia Wambui | 11142.06 | KES | 2026-03-28 | drive sheet 2026-03 | drive sheet 202603 #18 |

## Verdict

**PASS**

Next action: run Pass 0 (quarantine the 0 poisoned rows, re-extract the Drive
monthly expenses correctly into KES, re-OCR bank debits, log historical gifts at market
FX, then rebuild the Finance surface). Do not start until the operator confirms this
baseline matches their understanding.
