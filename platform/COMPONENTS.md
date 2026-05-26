# Canonical Primitives

> The founder's core rule: a fix in one place must NOT recur elsewhere. Every
> shared behavior routes through ONE component. Before adding a new overlay,
> money render, tooltip, or dock, use the primitive below. Do not fork a copy.
> If you change a primitive, every consumer listed here inherits the fix.

Last reconciled: R3-5 (2026-05-26).

---

## 12. Branded printable document shell — `lib/brand-doc.ts`

The ONE branded printable-document shell (P8 + #43). EVERY self-contained,
branded, printable document the platform produces is wrapped by the SAME
`brandWrap({ brandKey, title, bodyHtml, dateStr, logoUri?, footNote? })`, so the
letterhead, brand colours (`BRANDS`), the logo data-URI, the print CSS
(`break-inside: avoid`, `@page letter`), and the headless-Chrome PDF path are
identical everywhere. This was EXTRACTED out of `app/studio/actions.ts` (where it
was a private helper) so nothing forks a copy. `BRANDS` / `ALLOWED_BRANDS` /
`brandKeyOf` / `escapeHtml` live here too.

**Consumers (every branded doc routes through this — one shell):**
- `app/studio/actions.ts` (`generateDocument`, `generateGrantReadyDoc`) — imports
  `BRANDS`, `ALLOWED_BRANDS`, `brandWrap`; no local copy anymore.
- `lib/report-builder.ts` (`buildReportHtml`) — the configurable report.
- `lib/invoice.ts` (`createInvoice`) — the invoice.
- All of the above persist as a `studio_documents` row so the ONE PDF route
  (`/api/studio/pdf?id=`, `lib/pdf.ts`) renders any of them with no new path.

## 13. Report builder + invoice builder — `lib/report-builder.ts` + `lib/invoice.ts` (R3-5 / P11)

The ONE way a report or invoice is produced (img 170: "I should be able to
determine what report gets made and how it looks, and sometimes we want to issue
invoices to other companies"). `/reports` is no longer fixed packages: a light
client tab switcher (`components/ReportsTabs.tsx`) holds three panels.

- **Report builder** (`components/ReportBuilder.tsx` → `generateReport` in
  `app/reports/actions.ts` → `lib/report-builder.ts`): the founder CHOOSES the
  type (financial summary / funder / board / Givebutter→Kenya flow / custom), the
  date window (presets or custom), which sections to include, and the brand
  letterhead. `computeFigures()` derives EVERY number from real `donations` +
  `payments` rows for that window (nothing invented); the optional cover note is
  grounded in `lib/brain` via `recall` and gated through `humanize` + `now`
  (the same contract as the old narrative). Output is `brandWrap` HTML, previewed
  in the FocusTab (primitive #1), printable, and exported to a real PDF.
- **Invoice builder** (`components/InvoiceBuilder.tsx` → `issueInvoice` in
  `app/reports/actions.ts` → `lib/invoice.ts`): issue an invoice TO another
  company. Bill-to fields, line items (qty × unit price, computed server-side),
  subtotal/tax/total, an auto-sequenced number (`NIS-YYYY-NNNN`, unique index),
  issue date (`now()`) + due date, notes/terms. On screen totals render through
  `<Money>` (primitive #2); the saved invoice is `brandWrap` HTML, saved to the
  `invoices` table (source of truth) + a `studio_documents` mirror (so the PDF
  route works) + the Library. `listInvoices()` feeds the "Recent invoices" list.
- **Schema:** `invoices` (line_items jsonb, computed subtotal/tax/total, html,
  doc_id, asset_id, unique invoice_number).

## 14. Integrations / Zanii stub — `lib/integrations.ts` + `components/IntegrationsCard.tsx` (R3-5 / P12)

The ONE integration store (img 171: "this is where Zanii should be integrated,
at least the key details, code coming later, for now it can just be the shape").
Integrations live on the EXISTING `connector_registry` table (the platform
already uses it for Gmail/Givebutter); the integration shape is its `config`
jsonb. `getIntegration(key)` / `listIntegrations()` read it; `saveIntegrationConfig`
merge-saves (a blank secret never clobbers a stored key) and keeps `health="stub"`
while it is a stub. The Settings card renders the Zanii entry with the fields it
will need (API key masked, workspace id, account id, base URL, what it syncs) and
an honest "not connected · code coming" status. Dropping in the real Zanii code
later is reading these fields + flipping `enabled`, NOT a redesign. We do NOT fake
a running sync. `app/settings/actions.ts saveZaniiConfig` is the form action; the
Zanii row is seeded once via the Management API.

---

## 7. Ingestion pipeline — `lib/ingest.ts` (+ `app/api/ingest/process/route.ts` worker)

The ONE intake path (P7). EVERY input the founder gives the Brain routes through
here: a bulk file drop, a voice transcript, pasted text, and (future) a WhatsApp
message. There is no second classify-and-file path. `createBatch({ source,
attribution, inputs })` does one fast insert (an `ingest_batches` row + an
`ingest_items` row per input) and a detached `triggerWorker("/api/ingest/process")`,
then returns instantly (non-blocking, the founder's hard rule: dropping 20 files
returns at once). The worker claims `ingest.process` jobs and calls
`processBatch()`, which asks Claude to CLASSIFY + ROUTE each item to one target:
`brain` (a section / `agent_memory` org_fact), `record` (donor/beneficiary/team/
inventory), `finance` (invoice/receipt flagged), `library` (filed asset + caption),
or `skip`. Routes are PROPOSED, never applied silently: `applyBatch(batchId,
overrides)` is the ONLY place ingestion mutates the platform, called after the
founder confirms the review. Every item carries `attribution` (who/what channel),
so the future WhatsApp bot is just another `createBatch()` caller with a team
member's name.

- **UI:** `components/IngestDock.tsx` (Settings, top of the grid). Three inputs
  (bulk file drop / Web-Speech voice / paste), a live "Sasa is reading N items…"
  status while the worker classifies (polls `reviewBatch`), then the review step
  ("Sasa filed these 6: 3 to the Brain, 2 to Library, 1 to Finance. Confirm or
  adjust") with a per-item destination `<select>` override, then `confirmBatch`.
- **Server actions:** `app/settings/ingest-actions.ts` — `ingestFiles`,
  `ingestText`, `reviewBatch`, `confirmBatch` (+ voice/multi-entry/logo actions).
- **Schema:** `ingest_batches` + `ingest_items` (proposed `route` jsonb per item).
  New `JobKind` `"ingest.process"` in `lib/jobs.ts`.
- Reuses the jobs spine (`lib/jobs.ts`), `humanize`, `now`, and `captionImage`
  vision (`lib/anthropic.ts`) for images. WhatsApp = future caller, not a fork.

## 8. Multi-entry Brain sections — `components/MultiEntrySection.tsx` (+ `lib/brain-store.ts`)

The ONE way a Brain section holds a LIST (P10). Sections flagged `multi: true`
in `lib/brain.ts` ("Programs" + the grant "Programs and impact") render as a
visible list with an add-entry form and a voice mic, NOT a single textarea. Each
entry is its own `brain_entries` row AND its own `org_fact` memory (so recall can
surface one project), and each opens in the FocusTab (primitive #1) to view/edit.
Single-value sections keep using `org_profile` unchanged (graceful coexistence).
`lib/brain-store.ts` is the ONE writer (`upsertEntry`/`deleteEntry`/`listEntries`
+ `appendToSection` for the ingest router); `app/settings/ingest-actions.ts`
exposes the form actions (`addBrainEntry`, `removeBrainEntry`, `saveVoiceToSection`).

## 9. Brand logos — `lib/logos.ts` (+ `components/LogoUploader.tsx`)

The ONE logo store (P8: render, never code). A logo per brand (Nisria/Maisha/
AHADI) is stored as a data URI on `brand_logos` (the canonical render, the only
image source that survives an external inbox + a printed doc with no signed-URL
expiry) plus a Library copy. Read it with `getLogo(brand)` / `getLogos()`; embed
it with `logoImgTag()`. `LogoUploader.tsx` shows the logo as a LIVE `<img>`
preview (never a URL string / HTML). Consumers: the email signature
(`lib/email.ts` prepends `logoImgTag` to every send), generated documents
(`brandWrap` letterhead in `app/studio/actions.ts`), and the `SignatureEditor`
preview. The voice mic on Brain sections reuses the Web Speech pattern from
`VoiceDock.tsx` (primitive #5).

---

## 0. AI-output contract — `lib/humanize.ts` + clock — `lib/now.ts`

The ONE place generated text is made human, and the ONE clock. A fix here is a
fix everywhere: no feature may post-process AI output or compute "now" on its own.

### `humanize(text, { org?, now?, keepMergeTokens?, mergeValues? })` — `lib/humanize.ts`

EVERY string a model generates passes through `humanize()` right before it is
stored, shown, or sent. After the gate the text: has no em/en dashes or `----`
runs (rewritten to commas/periods, legitimate hyphens like "mid-term" kept), has
no surviving `[bracket placeholder]` (filled from real org facts: date → `now`,
contact/org/name → `ORG_FACTS`, donate link → the real give URL, else the line is
removed cleanly), has no raw `{{merge_token}}` (resolved from `mergeValues` or
hidden as plain words, e.g. "Hi there,") EXCEPT when `keepMergeTokens` is set
(the newsletter compose template, the one allowed place), and never reveals an AI
author. The companion `SYSTEM_HUMAN` clause (+ `withHumanSystem(base)`) is
appended to EVERY generation system prompt so the model writes clean up front.
`assertNoPlaceholders(text)` is the dev/build assertion. `stripDashes` is folded
in here and re-exported from `lib/anthropic.ts` for back-compat (one cleaner).

**Consumers (every generation exit routes through this — one gate):**
- `lib/agents/grant.ts` (`buildApplication`) — package body humanized; the cover
  date + contact line are real, never `[Current Date]`/`[Organization maintains...]`.
- `app/studio/actions.ts` (`generateDocument`, `generateGrantReadyDoc`) and the
  prompts in `lib/grant-docs.ts` (no longer instruct placeholders).
- `app/reports/actions.ts` (`generateNarrative`).
- `app/newsletter/actions.ts` (`draftNewsletter` keeps the template token,
  `sendNewsletter` resolves `{{first_name}}` to the real name per recipient).
- `app/api/improve/route.ts`, `app/api/donor-draft/route.ts`, `app/api/smart/route.ts`.
- `lib/agents/steward.ts` (`draftThankYou`), `lib/agents/comms.ts` (`draftReply`).
- `app/inbox/actions.ts` (auto-reply), `app/content/actions.ts` (`aiDraft`).

### `now(tz?)` / `today(tz)` / `formatLong(value, tz)` — `lib/now.ts`

The ONE clock. Timezone resolves from the request: the `x-tz` header / `nis.tz`
cookie the client sets from `Intl…resolvedOptions().timeZone` (see
`components/ClockProbe.tsx`, mounted once in `app/layout.tsx`), then the org tz
(`org_profile` section `timezone`), then UTC. `now()` is the server resolver
(lazy-imports `next/headers` so the pure formatters stay client-safe). Dates are
computed at view/send time, never frozen into stored text: the grant package
stores a `GRANT_DATE_TOKEN` (`lib/agents/grant.ts`) that `components/GrantPeek.tsx`
renders as today's date, so a prepared grant's date rolls day by day until
`app/grants/actions.ts advanceStatus` stamps the real submit date on submit.

**Consumers:** every `humanize` consumer above passes `now().long`; plus
`GrantPeek.tsx` (live date) and `grants/actions.ts` (freeze-on-submit).

### From-account display (P14)

Every send/draft surface shows which mailbox it goes from and that the branded
signature is auto-appended (`lib/email.ts` always appends one). Shown in
`components/AiComposer.tsx` (donor composer), `components/ApprovalCard.tsx`
(Needs-You reply), `components/GrantPeek.tsx` (grant submit).

---

## 1. FocusTab — `components/FocusSheet.tsx` (host) + `components/tabs-context.tsx` (state)

The ONE "open into a tab" primitive. A large, truly centered overlay over a
BLURRED backdrop, minimizable into the tab strip, with prev/next arrows across
sibling items and the full action set living inside it. There is no second
"open big" overlay. Behaviour is identical every time because it is literally
one code path.

- **Open it:** `const { openSheet } = useTabs(); openSheet({ id, title, icon, render, footer, titleExtra, brand?, width?, group?, siblings? })`
- **Siblings (prev/next):** pass `siblings: Sibling[]` where each `Sibling = { id, build: () => OpenSheet }`. Arrows + Left/Right keys step through the set without closing. `group` labels the set.
- **Host:** `FocusSheetHost` is mounted once in `components/AppFrame.tsx` (`Chrome`). It renders the single non-minimized tab. Esc minimizes, backdrop-click minimizes, the X closes.
- **CSS:** `.sheet-overlay` (fixed inset:0, grid place-items center, consistent backdrop blur), `.sheet-panel` (default `min(920px, 92vw)` wide, up to 88vh tall), `.sheet-head` / `.sheet-body` (single scroll owner) / `.sheet-foot`, `.sheet-nav` (the prev/next stepper). `--z-modal`.

**Consumers (every openable thing routes through this — one path):**
- `components/GrantPeek.tsx` — grants "Review · accept or decline" / "Open application"; siblings = the column's prepared grants. (`app/grants/page.tsx` passes `siblings`.)
- `components/OpportunityView.tsx` — opportunities "View"; siblings = the hunter's live opportunities. (`app/grants/page.tsx`.)
- `components/ApprovalCard.tsx` — Needs-You "expand"; full reply editor (Approve & send, Improve, Attach, Decline) lives inside; siblings = the pending set. (`app/page.tsx` builds the serializable sibling set.)
- `components/DonorPeek.tsx` — donor profile + conversation, opened with the SAME structure as the Needs-You tab; the thread loads lazily from `app/api/donor-thread/route.ts`. (`app/donors/page.tsx`.)
- `components/StudioDocCard.tsx` — a saved Studio document; live sandboxed iframe preview (never raw HTML).
- `components/StudioConsole.tsx` — the freshly generated Studio document opens reactively in a FocusTab (live preview).
- `components/ReportBuilder.tsx` — the generated report opens in a FocusTab (live iframe preview + Download PDF + Print).
- `components/InvoiceBuilder.tsx` — the issued invoice opens in a FocusTab (live iframe preview + Download PDF + Print).

**Compact vs maximized rule:** list cards stay minimal (primary action + an
expand affordance only). The full action set appears ONLY inside the FocusTab.
Enforced today in `ApprovalCard` (no Attach/Decline on the compact Needs-You
card) and the grant cards (Submit/Decline on the card, full package + re-prepare
inside the tab).

---

## 2. Money — `components/Money.tsx`

The ONE currency render. `<Money amount currency? prefix? />` wraps the value in
`<span class="money">` so the privacy blur (`.hide-money .money`) can never be
forgotten on a new amount. `MoneyHideToggle` is the per-card eye.

**Consumers:** `app/page.tsx`, `app/donations/page.tsx`, `app/finance/page.tsx`,
`app/reports/page.tsx`, `app/campaigns/page.tsx`, `app/team/[id]/page.tsx`,
`components/ExpenseIntake.tsx`, `components/TeamPayHistory.tsx`,
`components/TeamPeek.tsx`, `components/InvoiceBuilder.tsx` (live line-item +
totals). (The Peek components also render money inside a
`.money` span via a local helper for the at-a-glance figure; new money in app
pages should use `<Money>`.)

---

## 3. Modal — `components/Modal.tsx`

The ONE lightweight overlay for at-a-glance QUICK-LOOK peeks and short
intakes/forms. NOT for "open into a tab" work surfaces (those use the FocusTab).
Fixed + grid-centered, near-opaque `--surface-elevated`, single inner scroll,
Esc + backdrop close, focus trap. Close button uses the Tooltip primitive
(`tip-host tip-below`).

**Consumers (quick-look peeks):** `components/CampaignPeek.tsx`,
`components/DonationPeek.tsx`, `components/BeneficiaryPeek.tsx`,
`components/TeamPeek.tsx`.
**Consumers (intakes / pickers):** `components/AddGrantButton.tsx`,
`components/GrantReadiness.tsx`, `components/KenyaReceiptUpload.tsx`,
`components/ExpenseIntake.tsx`, `components/AttachPicker.tsx`,
`components/TeamAdd.tsx`, `components/BeneficiaryIntake.tsx`,
`components/TeamQuickActions.tsx`.

> Note: `DonorPeek` was MOVED off Modal onto the FocusTab in R3-1 because donor
> messages must open like the Needs-You tab. Donation/Campaign/Beneficiary/Team
> peeks remain quick-looks (no message thread) and stay on Modal.

---

## 4. Tooltip — `.tip-host` (+ `data-tip`) in `app/globals.css`

The ONE readable hover/focus tooltip. Add `class="tip-host" data-tip="…"` to any
icon button. The ink chip sits above the host (or below with `.tip-below` for
controls at a panel's top edge, where an upward tip would be clipped). High
z-index so it is never hidden behind an overlay. Replaces native `title=`.

**Consumers:** `components/FocusSheet.tsx` (Minimize, Close, prev/next — all
`tip-below`), `components/Modal.tsx` (Close, `tip-below`),
`components/ApprovalCard.tsx` (expand affordance). Use it for every new
icon-only button.

---

## 5. Sasa orb / dock — `components/VoiceDock.tsx` (+ `.dock` in `app/globals.css`)

The ONE floating assistant. `position: fixed` bottom-right with `env()` safe-area
spacing. It must never overlap cards on ANY route: the global clearance is
`--orb-safe` (set once in `:root`), applied as `.pagewrap` bottom padding, so the
last row of cards on every page reflows clear of the orb. Mounted once in
`AppFrame.tsx`. Open via the orb or the `open-sasa` / `sasa-ask` window events.

---

## 6. Command palette — `components/CommandPalette.tsx` (+ `.cmdk-*` in `app/globals.css`)

The ONE ⌘K palette. Mounted once in `AppFrame.tsx`. Opens on ⌘K/Ctrl+K or the
`open-cmdk` window event. Renders CRISP: a plain dim scrim (no backdrop blur) and
a fully OPAQUE solid panel at `--z-cmdk` (above the dock, below modals). The
top-nav search button dispatches `open-cmdk`.

---

## Z-index ladder (`app/globals.css` `:root`)

`--z-nav: 50` < `--z-dropdown: 200` < `--z-dock: 300` < `--z-cmdk: 400` <
`--z-modal: 500` (FocusTab + Modal). Tooltips ride above all at `z-index: 999`
so they are never clipped. Use these tokens, never raw numbers.
