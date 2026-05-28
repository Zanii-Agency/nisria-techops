# Components Rules

Governs /platform/components/. Shared UI primitives. Read before adding or modifying a primitive.

## Laws governing this surface

- **Law 4 (Browser-OS).** One overlay primitive (FocusSheet). One modal pattern.
- **Law 10 (Uniform-filter).** One filter component used everywhere.
- **Law 2 (Currency).** `<Money>` is the only render path for money values.

See /NISRIA-DOCTRINE.md and /docs/decisions/0002, 0004, 0010.

## The skills that apply

- `focus-sheet-pattern`. Mandatory.
- `currency-handling`. Mandatory for any Money-related work.

## The canonical primitives

These are the components other code reaches for. Do not duplicate. Do not fork without a new ADR.

1. **`<Money>`.** The only money renderer. Carries currency, value, hidden (for the per-card eye toggle). See currency-handling skill.

2. **`<FocusSheet>`.** The only overlay for in-portal "open this for a closer look." Centered, blurred backdrop, near-opaque surface. See focus-sheet-pattern skill.

3. **`<Modal>`.** The lighter cousin of FocusSheet for confirmations and one-shot dialogs (delete confirmation, etc.). Portaled to document.body. Same z-index ladder.

4. **`<Filter>`.** The uniform filter panel (Bayut-style "More Filters"). Multi-select, search-within, applied-state visible, clear-all, URL-persisted. One pattern across all list views. (Built in Pass 3; until then, modules use simpler inline filters but document them as legacy.)

5. **`<DocReader>`.** Native document viewer. Renders extracted text, tables, photos. The only path for opening a document in-portal.

6. **`<AskSasa>`.** Inline Sasa entry point for empty states and contextual prompts. Dispatches `sasa-ask` event.

7. **`<ApprovalCard>`.** Needs You queue card. Compact form by default; expands to FocusSheet for full review.

8. **`<AiComposer>`.** Reply/draft composer with Sasa pre-draft, Improve-with-AI button, attach picker, signature auto-append.

9. **`<MoneyHideToggle>`.** Per-card eye toggle. Lives next to the money it hides (not in the top bar). Persists per-key in localStorage but reads in useEffect to avoid FOUC (currently has a known FOUC issue, see backlog).

## The z-index ladder

In globals.css:
- `--z-nav: 50` (top navigation bar)
- `--z-dropdown: 200` (menus over content)
- `--z-dock: 300` (Sasa floating orb)
- `--z-cmdk: 400` (command palette)
- `--z-modal: 500` (FocusSheet and Modal)

Never freelance z-index values. Never use magic numbers (z-index: 80, z-index: 100). Always reference the variable.

## The material tokens

- `--canvas` (the page background)
- `--glass` (translucent surfaces, .48 alpha) for resting cards
- `--glass-2` (.66) for raised chrome (top nav, tab strip)
- `--surface-elevated` (.97, near-opaque) for floating overlays (FocusSheet, Modal, dropdowns)

Hard rule: anything that floats over content uses `--surface-elevated`. Never the glass tokens. Glass over content bleeds through and reads cheap.

## Hard rules specific to components

1. **No new modal patterns.** If you want a new overlay, extend FocusSheet's contentRef types. Do not roll a new `.peek-overlay` class.

2. **No new money renderers.** `<Money>` is it. No `{money(x)}` helpers. No `${total}` literals.

3. **No new filter UIs.** Once `<Filter>` exists (Pass 3), it's the only one. Existing inconsistent filters get replaced module by module.

4. **Focus visible everywhere.** Global `:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }` is set. Don't override it without an a11y review.

5. **Tap targets ≥ 24px.** WCAG 2.5.8 minimum. Icon buttons need this. The .tab .x close button must be 24px or larger; the money-eye toggle is 26px.

6. **Aria-labels on icon-only buttons.** Every iconbtn needs `aria-label`. No exceptions.

7. **No emojis in icons.** Lucide only. One set. Sizes 13-19.

## What violates this module's law

- A new modal component instead of extending FocusSheet
- A money value rendered without `<Money>`
- A z-index literal (`z-index: 80`) instead of `var(--z-dropdown)`
- A floating overlay using `.card` glass (bleeds through)
- An icon-only button with no aria-label
- A tap target smaller than 24px

## Before commit checklist

1. Run doctrine-reviewer.
2. If you added a primitive: document it in this file under canonical primitives.
3. If you forked a primitive: stop and write an ADR justifying the fork.
4. Test focus-visible by tabbing through the changed surface.
5. Fill proof template.
