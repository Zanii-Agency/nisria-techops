# Nisria Command Center, Design System (derived from the live app + added rules)

The visual + interaction contract. Every new module and primitive must obey this so the platform
stays one coherent system as it grows. Derived from the current globals.css tokens (not invented),
extended with the rules that tonight's bugs and the Mac direction taught us. Pairs with
NISRIA-BUILD-SPEC.md and ~/.claude/refs/design-laws.md.

## 1. Foundations (the real tokens, do not redefine)
- Brand: teal `#00C4C2` (Nisria, primary), periwinkle `#5B6BF0` (feature/secondary), coral `#F0746B`
  (Maisha), indigo `#5B5BD6` (AHADI). Kepenzi: reuse teal until a brand colour is set.
- Ink scale: `--ink #0E1A1A`, `--ink-2 #38504F`, `--muted #5F7574`, `--faint #6A7E7D` (already
  darkened to pass AA, never lighten it).
- Status: success `#16A34A`, warning `#D97706`, danger `#E5484D`, info `#2563EB`.
- Radius: `--radius 22`, `--radius-sm 14`, `--radius-lg 28`, pill `999`. Blur `--blur 26px`.
- Shadows: sm `0 2px 10px /.06`, md `0 14px 36px /.10`, lg `0 30px 70px /.18`, nav `0 10px 30px /.10`.
- Motion: one easing `--ease cubic-bezier(0.22,1,0.36,1)`; durations 150-300ms; animate transform +
  opacity only.
- Type: display `--font-display` (SF Pro Display / Inter), body `--font-body`; headings weight 700,
  letter-spacing -0.03em; tabular-nums for figures (`.num`, `.money`).
- Ambient backdrop: the fixed soft mesh of teal/peri/coral radials behind glass. Everything floats over it.

## 2. Material hierarchy (the glass system, Apple-derived, with the hard-won rule)
Four defined materials, in depth order. NEVER invent a fifth.
- `--canvas #E9EEF1` + the ambient mesh = the base everything floats on.
- `--glass rgba(255,255,255,.48)` (+ blur 26 saturate ~160) = standard surface (cards).
- `--glass-2 .66` = raised chrome (top nav, tab strip).
- `--surface-elevated .97` (near-opaque) = ANYTHING THAT FLOATS OVER CONTENT (modals, FocusTab,
  menus, popovers, Launchpad, Mission Control). HARD RULE, learned the hard way: floating layers use
  the near-opaque elevated material, never see-through glass, or content bleeds through and it reads cheap.
- Depth = focus: the active/elevated thing is crisp; everything behind it dims and blurs
  (`.sheet-overlay`/`.modal-overlay`: scrim rgba(20,40,40,.40) + backdrop-blur 8px). Apply everywhere
  a layer takes focus.

## 3. Spacing + layout
8px grid for all spacing. Card padding 22 (`--card-pad`), section gaps 16-24. Max content width ~1360.
Radius: cards 22, inputs/sm 14, pills 999. z-index ladder is fixed, never freelance: nav 50, dropdown
200, dock 300, cmdk 400, modal 500. Bottom safe-area `--orb-safe 112px` so content clears the Sasa orb.

## 4. Canonical components (REUSE these, never re-roll)
- `card` / `card-pad` / `card-h` (+ `.hover`): the glass card. `position:relative; isolation:isolate`.
- FOCUSTAB (FocusSheet): the ONE overlay for "open into a big view". Centered (grid place-items),
  blurred backdrop, large (min(920px,92vw) x 88vh), header with minimise + close, prev/next siblings,
  minimises to the tab strip. Body is keyed by sheet id (remount on sibling swap). No second overlay.
- MODAL: portaled to document.body (escapes backdrop-filter containing blocks), centered, elevated
  material, the same blur/scrim as FocusTab. Used by the lighter peeks.
- Money: the `<Money>` primitive for all amounts (tabular-nums, KES/USD kept separate, hide toggle).
- Badge (tones: teal/peri/green/gold/red/gray/blue) + `statusTone()`; pill; chip + brand `bdot`.
- `.feature` (hero stat block), `.aico` (rounded icon chip, colour classes), `.empty` (empty state).
- Table / Col; buttons `btn` (`teal`/`ghost`/`sm`); inputs/textarea/select.
- Icons: Lucide only, one set, ~size 13-19, never emojis.
- Dock orb (Sasa), command palette (cmdk), the tab strip.

## 5. New primitives (build them in THIS language)
- TWO-SPACE SLIDER: a horizontal track of two full-viewport panels (Command Center, Workspace);
  translateX to slide; spring snap past ~1/3 or a flick; behind flag NEXT_PUBLIC_WORKSPACE.
- LAUNCHPAD: full-space grid of labeled function icons (`.aico`-style), flat + alphabetical, a search
  field on top; elevated material; click zooms the icon open into a Workspace tab.
- WORKSPACE TAB + STRIP: route-backed tabs in the raised chrome strip; active crisp, others quiet;
  drag-reorder, pin (left), close x; persisted. Reuses the existing `.tab`/`.tabbar` look.
- MISSION CONTROL: overlay grid of open-tab thumbnails over a dimmed/blurred backdrop; click to jump.
- SPOTLIGHT: the cmdk palette as universal search+action; elevated material, centered (child of a
  centered overlay, never a portaled sibling that falls to a corner).
- THREE-PANE MODULE: sidebar (categories) + list + detail, the Finder/Mail pattern, for Finance,
  Beneficiaries, Sources, Grants. Each pane its own scroll owner.
- WIDGET (cockpit): a compact glass card, one-glance + one launch, quiet unless it has something for you.
- REVIEW-QUEUE CARD: staged record + source preview side by side, confidence badge, Approve/Edit/Reject.

## 6. Added key rules (the laws this platform holds, beyond the tokens)
1. ONE overlay primitive (FocusTab); Modal portaled; popups always centered + blurred. Never a new modal pattern.
2. Keyed remount: any host that swaps items at the same tree position keys the body by item id.
3. Text never clips: titles wrap (2-line clamp + break-word), never nowrap+ellipsis under space pressure;
   card text needs min-width:0 on the flex chain + clamp + break-word; selects width:auto + comfortable
   min-width; badges hold short tokens only, sentences go as muted wrapping text.
4. Checkboxes/radios get the explicit reset (auto width, accent teal), never the full-width text-input rule.
5. No em-dashes/en-dashes in prose (comma/period/colon). The `—` glyph is allowed ONLY as a no-value cell.
   Legit brackets like `[STP 10th Cohort]` are preserved; cleaners are dash-only where brackets may be real.
6. Content leads, chrome recedes. Depth tells you what's active. Motion is short, spring, purposeful, never decorative.
7. Calm by exception: a widget shows an item only when it needs the operator; otherwise quiet.
8. Glance = popup, work = tab. Two ways in: type (Spotlight) or see (Launchpad / Mission Control).
9. Every record carries a small hidden source link; the document itself is never the interface.
10. Brand consistency: per-brand dot/colour, branded SVG favicon always, per-brand letterhead on docs.
11. Premium default is light editorial-luxury, not dark; no AI slop (no purple/cyan gradients,
    glassmorphism-as-reflex, generic card grids, motion for its own sake).
12. Build new beside old; flag structural changes; one module per change; verify the rendered thing.

## 7. Accessibility (non-negotiable)
AA contrast (4.5:1 body; `--faint` is already tuned, do not lighten); 44px min touch targets; visible
focus ring (teal glow `0 0 0 3px rgba(0,196,194,.15)`); honor `prefers-reduced-motion` (kill slides/
zooms); icon-only buttons get aria-labels; tab order matches visual order; sensitive data never in any
anon/public/client-exposed path.

## 8. How this gets used while building
Before any new screen: pick the layout (three-pane for data, widget board for the cockpit, tab for a
work view, popup for a glance), reuse section 4 primitives, obey section 6 rules, check section 7. If a
new pattern seems needed, it is almost always one of the existing primitives, confirm before inventing.
Append any new design lesson here AND to ~/.claude/refs/design-laws.md.
