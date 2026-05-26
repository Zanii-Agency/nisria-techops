# Overnight extraction + build log

Started 2026-05-27. Mandate: extract documents/sheets/statements from the Google Drive
(connected via the claude.ai Google Drive connector), structure them onto the platform,
build new sections where the data recurs and earns one, fill the Brain. Skip pictures/
videos. No fabricated numbers. KES and USD kept separate. Idempotent. Never auto-send
WhatsApp/email during extraction. Flag anything uncertain for Nur.

Default applied (Nur to confirm): historical months load as PAID (dated to their month);
the current month stays as obligations until marked paid.

Task spine: #50 finance history · #51 bank statements/Banking · #52 grants→pipeline+Brain ·
#53 databases→beneficiaries/Microfund/Sponsored Students · #54 team contracts → pay/Brain ·
#55 fill Brain from narrative docs · #56 durable in-app Drive watcher (cred dependency).

Blocked, waiting on Nur (logged, not guessed):
- Bot SEND: needs WhatsApp permanent token + app secret (Phone Number ID + WABA ID already set).
  Nur sending tomorrow.

UNBLOCKED 2026-05-27:
- Durable Drive watcher credential IS IN. Service account
  nisria-drive-reader@crack-cogency-497521-r0.iam.gserviceaccount.com (project crack-cogency-497521-r0),
  stored as Vercel secret GOOGLE_SERVICE_ACCOUNT_B64; DRIVE_ROOT_FOLDERS env set to the two root ids.
  Verified server-side: SA authenticates + reads BOTH folders. The app can now read Drive on its own,
  which is the engine for the Filing system (#57) + the ongoing watcher (#56). Auth path: build a
  RS256 JWT from the SA key, exchange at oauth2.googleapis.com/token for a drive.readonly access token,
  then Drive v3 files.list/get with supportsAllDrives. (Proven working in /tmp test.)

---

## Project roadmap / pending (per Nur, 2026-05-27)
1. FB business verification — KEEPS FAILING (blocks WhatsApp full rollout + FB auto-post). Needs reason.
2. WhatsApp bot activation — pending token + app secret (Nur sending) + verification for team-wide.
3. FB auto-post — future (Pages/Graph API posting), gated on verification.
4. Google Grants — Google Ad Grants / Google for Nonprofits (free ads; needs 501(c)(3) validation via TechSoup).
5. Full population — IN PROGRESS here (Drive extraction → filing + categorisation + Brain + watcher).

## FB business verification pack (from Drive, read 2026-05-27)
- US 501(c)(3) — IRS determination letter (Drive id 1KX3UVRkl2lGqRVCkc3KioxQ9PB9rFXwS):
  Legal name BY NISRIA INC · EIN 92-2509133 · 18117 Biscayne Blvd #61652, Miami, FL 33160 ·
  public charity 170(b)(1)(A)(vi), effective 25 Dec 2023.
- Kenya CBO — certificate (Drive id 1fILpKj5Vmitf8KMjy4oNvLaJDPeQ-RVj):
  NISRIA COMMUNITY PROGRAMME (CBO) · Reg GIL/DSS/CBO/105 · Cert 51260 · Gilgil, Nakuru ·
  registered 13 July 2020. Also CBO KRA PIN docs + CBO Constitution in 09_Admin & Compliance/Legal Registration.
- **EIN DATA FIX:** platform/ORG_FACTS + Brain had EIN 88-3508268 which is WRONG; IRS letter says
  92-2509133. Brain org_fact corrected. STILL TO DO: fix hardcoded ein in lib/humanize.ts
  ORG_FACTS (88-3508268 -> 92-2509133) + deploy, so generated grant/docs cite the right EIN.
  Flagged to Nur to confirm.

## Progress

### #50 Finance history (in progress)
- Read historical monthly expense sheets from Drive: Nov 2025, Dec 2025, Jan 2026.
- Loaded each month's reconciled total into `payments` as PAID, dated to the 28th:
  Nov 2025 = 460,620 KES, Dec 2025 = 450,120 KES, Jan 2026 = 482,120 KES
  (batch `drive monthly history`, total 1,392,860 KES). This powers previous-months spend.
- DECISION/FLAG: the historical sheets are messy (revision columns, ambiguous alt totals,
  and old roster names no longer on the team, e.g. Mburu Paul, Sammy Wambui, Kevin Mburu,
  several interns). To avoid misattributing line items I recorded the reconciled MONTH TOTAL
  per month, not per-person lines. If you want full per-person history per month, say so and
  I will itemise (with each month's total validated against its sheet).
- STILL TO DO on #50: read Nisria 2026 Budget.xlsx → Budget-vs-Actuals card; read 202604 STP
  Expenses; build a "spend by month" view on /finance (this month vs previous months).
- Note: /finance was extended by another pass (salaries subsystem: team_payments,
  markSalaryPaid, computeSalaryReminders, Countdown). Will build the month view to fit it.

### #55 Fill the Brain (in progress, first batch)
- Confirmed write path: recall() always surfaces kind='org_fact' from agent_memory by kind
  (no embedding needed), so org facts ground every grant/report/reply immediately.
- Loaded 6 grounding org_fact entries (source_type 'drive-brain'): organization identity,
  team and structure (24 staff, departments), monthly finances (597k KES, due 28th, Nov/Dec/Jan
  history), STP + SANARA grant coverage, programs (Kwetu Haven, Education, Health, Food,
  Microfund, Sponsored Students, Maisha), banking and compliance (I&M + Stanbic, CBO, EIN).
- STILL TO DO on #55: deeper facts from narrative docs (TechOps System doc, Executive Summary,
  Concept Notes, business plans) once those are read in the program/grant passes.

### CORRECTION (Nur, 2026-05-27 ~01:55) — proper filing, not summaries
The point of extraction is MEANINGFUL, FILED, CATEGORISED population, not aggregate totals.
The platform must become the organised filing cabinet that mirrors the Drive. So:
- **Itemise, do not lump.** The 3 historical month lump totals (batch `drive monthly history`)
  must be REPLACED with per-line categorised expense records (payroll/rent/utilities/etc.),
  each linked to its source month sheet. Re-itemise on resume; the lump rows are a stopgap.
- **File the documents themselves.** Build a Filing/Documents system (task #57) that mirrors
  the Drive folders (Finance, Team & HR, Programs, Grants, Admin & Compliance, brands). Every
  doc filed with type + category + brand + date + drive link + stored copy, browsable + searchable.
  UI shape (explicit, Nur): a FOLDER CARD per Drive area you click into; inside, a CARD PER FILE
  showing type/brand/date; clicking a file card OPENS IT IN-APP in the centered FocusTab from a
  STORED COPY (not a bounce to Drive). Filter by type/brand, search across all. New nav section.
- **Categorise everything** (program, brand, expense category, doc type). Totals are computed
  FROM the filed items, never pasted as a summary.
- Money records LINK to their source document (this payroll line came from the May sheet;
  this transaction from the I&M statement).

### Resume point
Next: finish #50 (budget → Budget-vs-Actuals + 202604 STP sheet + per-month finance view),
then #51 bank statements, #52 grants, #53 beneficiary databases, #54 team contracts, deepen #55.
All data so far is committed to Supabase; new-section CODE builds will batch-deploy+commit.
