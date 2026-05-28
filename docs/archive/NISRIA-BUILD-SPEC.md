# Nisria Command Center, Build Spec (v2, final build contract)

This is the contract I build from, autonomously, when Nur gives the signal. No further
conversation assumed. Companion to OVERNIGHT-LOG.md (run state) and ~/.claude/refs/design-laws.md.

## 0. Operating stance (who I am while building)
- Finalising/designing: think like a principal SOFTWARE ARCHITECT, simple, reliable, no ambiguity.
- Building: act like the MINIMAL CHANGE ENGINEER, smallest reversible diffs, build beside not inside,
  verify + commit each step, blast radius of one module.
- Verifying: REALITY CHECKER, nothing is "done" without proof (live curl / DB / rendered).
- Extraction: DATA-QA mindset, confidence scoring + a human review gate before financial or
  beneficiary data becomes truth. Never guess, never silently lump.

## 1. North star
Nisria's private operating brain. The whole org as live, structured, queryable data in one command
center operated only by Nur (+ dev). Documents dissolve into data in their natural homes and become
invisible sources. Sasa knows it all, in order, deeply enough to answer, regenerate working
documents, and help grow the org.

## 2. Principles, do's and don'ts
DO: extract CONTENT into structured native data; put each thing in its natural home; keep a small
hidden source link per record; build NEW beside OLD (new files + feature flags); small diffs,
build+typecheck+verify+commit each; calm by default, manage by exception; for a private single
operator, completeness + detail (with safeguards, section 7).
DON'T: make Nur open a file or hunt folders; dump into a generic Filing folder; strip beneficiary
detail; rewire the working FocusTab popups or existing pages beyond the intended upgrade; ship lossy
summaries where structured data is needed; auto-commit financial/beneficiary extractions; say "done"
without proof; em-dashes, AI placeholders, fabricated figures; mix KES and USD.

## 3. Architecture
- TWO SPACES, slide between them. Space 1 = Command Center (calm cockpit). Space 2 = Workspace.
  GATEWAY: the LAUNCHPAD (every function as a flat, alphabetical, searchable icon grid). Flow:
  Command Center -(swipe)-> Launchpad -(click app)-> Workspace tab. LANDING RULE: swiping back lands
  on your last active tab; Launchpad is one tap away (button); you land on Launchpad only when no
  tabs are open. Swipe = two-finger horizontal (browser cannot hook the OS 4-finger), plus dots, a
  button, and cmd-arrow. Whole shell layer behind FEATURE FLAG NEXT_PUBLIC_WORKSPACE; off = exactly today.
- ONE TAB MODEL (no convolution): a POPUP (FocusTab, centered/blurred, unchanged) is an ephemeral
  glance. A WORKSPACE TAB is a route-backed, persistent thing you work in (open / switch / minimise /
  close / pin / reorder, saved across refresh). The existing route-tab strip becomes the Workspace
  strip. Promoting a popup makes it a tab. That is the entire model: glance = popup, work = tab.
- MISSION CONTROL: zoom out to all open tabs as thumbnails. SPOTLIGHT: cmd-K finds any record/action
  across the system. DATA MODULES use a three-pane Finder layout (sidebar categories, list, detail).

## 4. Data model + routing
Documents = silent source registry (drive_file_id, title, hidden source link). Content extracted into
domain tables; each domain record carries a source ref + extraction confidence + approver + timestamp.
DOC SPLIT:
- SOURCE OF RECORD (registrations, signed contracts, bank statements, audits, IRS/CBO certs):
  preserved as originals + indexed + fed to the Brain. NEVER "recreated", only referenced.
- WORKING DOCS (reports, cover letters, invoices, proposals): facts extracted; Sasa CAN regenerate these.
ROUTING: bank statements/expense sheets/budgets/payments -> FINANCE. proposals/funder contracts/
concept notes/applications/funder reports -> GRANTS. audits/annual/M&E reports -> REPORTS. registration/
CBO/KRA/mandates/constitution/policies/MOUs/board -> LEGAL & COMPLIANCE. Kwetu children (present+past)/
microfund/sponsored students -> BENEFICIARIES. contracts/directory -> TEAM. program docs -> PROGRAMS.
New nav family "Records" holds Legal & Compliance + Reports + Sources (confirm name).

## 5. Extraction pipeline with review gate (the critical, riskiest part)
NOTHING financial or beneficiary-related is written straight to a live table. Pipeline:
1. STAGE: every extracted record lands in `extraction_staging` (source_doc_id, domain, raw_json,
   normalized fields, confidence, status=pending, signature for idempotency). Live tables untouched.
2. SCORE: confidence per record from validation, do line items sum to the stated total (the 597,000
   reconciliation pattern)? dates parseable? amounts numeric? structure matches the expected template?
   HIGH = clean + reconciled; MEDIUM = parsed but unreconciled; LOW = ambiguous/OCR/total mismatch.
3. AMBIGUITY: never guess. Extract what is clear, attach a note for the rest ("3 candidate totals:
   460,620 / 387,620 / 20,000, which is authoritative?"), route to review. No silent lumping.
4. REVIEW QUEUE (in-app): the OPERATOR sees staged records grouped by source doc, beside the source
   preview, with confidence badges and Approve / Edit / Reject per row or per batch. Approve -> live
   table with audit trail. NOTE: during the build phase the approver is the DEV (Nur has no access
   yet); the role transfers to Nur on handover. Financial + beneficiary ALWAYS require approval;
   clearly non-sensitive high-confidence may auto-commit (configurable).
5. IDEMPOTENT + TRACEABLE: keyed by (source_doc, signature) so re-extraction updates not duplicates;
   committed rows keep source ref + confidence + who/when approved.
6. RECONCILIATION VIEW: extracted total vs the sheet's stated total side by side before approval.
AI layers: backfill by dev on the MAX plan into staging (free to Nisria); ongoing watcher uses Haiku
into staging. Both -> review queue -> Nur confirm -> live. Cost low, accuracy gated.

## 6. Modules + acceptance criteria (definition of done)
- FINANCE (the MVP): three-pane ledger (every transaction, dated, categorised) + summary views
  (this month vs prior, by category, by program, budget vs actuals, Givebutter->Kenya flow). EXTENDS
  the existing /finance + its salaries subsystem, does not replace it. DONE WHEN: May reconciles to
  597,000 KES; historical months show real per-line data (not lumps); a wrong category is fixed in one
  click; every figure traces to a source; nothing was auto-committed without review.
- BENEFICIARIES: detailed profiles (name, ID, photos before/after/follow-up, case, full story, intake/
  exit, guardian, county, health, support, status incl past children). DONE WHEN: every imported record
  has a profile; private (anon returns []); photos/IDs visible only to the authed operator; past children
  carry their full journey.
- GRANTS: applications + funder docs + deadlines, fed by real history; Sasa drafts grounded in the Brain.
  DONE WHEN: each live grant shows real terms + a right-sized ask + source.
- LEGAL & COMPLIANCE: registrations, certs, KRA PIN, mandates, policies, board, as native records with
  the original one tap away. DONE WHEN: every legal doc is a record with key fields extracted + source.
- REPORTS / AUDIT: audits + annual/M&E reports as native, scrollable records. DONE WHEN: each shows its
  figures/sections natively + source.
- TEAM, PROGRAMS, MICROFUND, SPONSORED STUDENTS: list + profile, populated from the databases.
- SOURCES: demoted Filing, a quiet registry of originals for verify/reference.
- COMMAND CENTER (cockpit): widget board, calm by exception. Widgets: Sasa daily brief; Needs-You queue;
  Ask-Sasa bar; money pulse; impact pulse; grants radar; team daily status; what-Sasa-did; risk strip.
  EXCEPTION RULE: a widget shows an item only if it needs Nur (overdue, due <=7d, awaiting decision,
  threshold breached); otherwise it stays quiet/collapsed. DONE WHEN: an empty day reads calm; every
  block is one glance + a launch; no detail-work happens here.

## 7. Beneficiary + sensitive-data safeguarding
Single-operator does not mean unprotected. RLS enforced (anon/unauthed returns []); sensitive tables
never in any public or client-exposed path; access only via the session; an access/audit note on
sensitive views; service-role only server-side. Children's IDs/photos/case data are stored (private
institutional memory) but gated, logged, and never world-readable. This is the deliberate, defensible stance.

## 8. Cost model (honest defaults)
- One-time backfill: dev on the MAX plan into staging. Free to Nisria's key, but it is manual dev labor,
  not a durable auto-process.
- Live + ongoing watcher: Nisria's ANTHROPIC_API_KEY. Defaults to keep it cheap: Haiku for extraction +
  summaries; SUMMARISE-ON-DEMAND (when a doc is opened/queried) + cache, NOT all 463 at once; heavy
  pre-extraction so the live app rarely parses.

## 9. Reliability rules
Build against THIS doc. Flag the shell (instant revert). Extend, never rewire. One module per change,
build+typecheck+verify+commit each. Preview/flag before live. Thin type/test gate on critical paths
(reconciliation math, RLS). Report honestly, surface uncertainty, never "done" without proof.

## 10. Build order (data and value first, chrome last)
1. Extraction pipeline + staging + REVIEW QUEUE (the gate). 
2. FINANCE module extracted, reconciled, reviewable = THE MVP. If we stopped here, Nisria gained the books.
3. Beneficiaries (detail + safeguards), then Grants, Legal & Compliance, Reports.
4. Navigation chrome as a parallel additive flagged track: shell wrapper + empty two-space slide first
   (zero risk), then Workspace tabs + Launchpad + Spotlight + Mission Control, wrapping the now-real modules.
5. Command Center -> widget cockpit. Demote Filing to Sources.
6. Wire all into Sasa recall; watcher auto-stages new files.
Each phase flagged, verified, reversible. Chrome never blocks data.

## 11. Locked decisions
- Swipe-back lands on last active tab; Launchpad one tap away; Launchpad on entry only when no tabs open.
- Financial + beneficiary extractions ALWAYS go through the review queue before becoming truth.
- Source-of-record docs are preserved + referenced, never recreated; working docs can be regenerated.
- MVP = Finance extracted + reconciled + reviewable behind the flag.
- Build order: data first, navigation chrome last (parallel, flagged, additive).

## 12. Still open (Nur, answer anytime; sensible defaults assumed if silent)
- "Records" as the new nav family name? (default: yes)
- Default pinned tabs (default: Home, Finance, Inbox, Beneficiaries).
- Which Mac feature first once chrome starts (default: Launchpad).
- Top 3-4 cockpit widgets for the morning (default: Needs-You, money pulse, risk strip, Sasa brief).
