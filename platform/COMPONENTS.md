# Canonical Primitives

> The founder's core rule: a fix in one place must NOT recur elsewhere. Every
> shared behavior routes through ONE component. Before adding a new overlay,
> money render, tooltip, or dock, use the primitive below. Do not fork a copy.
> If you change a primitive, every consumer listed here inherits the fix.

Last reconciled: R3-1 (2026-05-26).

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
`components/TeamPeek.tsx`. (The Peek components also render money inside a
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
