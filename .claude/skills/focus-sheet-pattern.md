# Skill: FocusSheet Pattern

Operational pattern for the Browser-OS Law (Law 4) and Local-first Law (Law 3). Reference whenever code needs to open something for a glance or for work.

## The contract

One overlay primitive: FocusSheet. Centered, blurred backdrop, large (min(920px, 92vw) by 88vh), minimizable, single internal scroll, near-opaque surface (never see-through glass).

Glance versus work distinction:
- **Popup (FocusSheet, ephemeral).** A quick look at one thing. Closes by ESC, click outside, or X.
- **Tab (Workspace, persistent).** Actual work. Opens to a route, keeps state across navigation, survives refresh. Promote a popup to a tab when work begins.

## What FocusSheet replaces

The codebase historically had six hand-rolled `.peek-overlay` copies (ApprovalCard, DonorPeek, DonationPeek, CampaignPeek, GrantPeek, BeneficiaryPeek). Each set its own width, padding, scroll behavior, surface opacity. Inconsistencies followed: some centered, some not; some opaque, some see-through; some had double-scroll, some clipped helper text.

FocusSheet is the one true overlay. Every "open this for a closer look" path goes through it.

## How to use it

```tsx
// /platform/components/FocusSheet.tsx is the host
// /platform/lib/sheets.ts exposes openSheet, closeSheet, useTabs

import { openSheet } from '@/lib/sheets';

// Open a beneficiary
<button onClick={() => openSheet({
  id: `beneficiary-${b.id}`,
  type: 'beneficiary',
  title: b.public_name || 'Beneficiary',
  contentRef: { kind: 'beneficiary', id: b.id },
})}>
  View
</button>
```

The host component reads the `contentRef` and routes to the right renderer (BeneficiaryPeek, DonorPeek, DocReader, etc.). The renderers are the body; the host is the chrome.

## Minimize to tab

When the operator clicks minimize on a sheet, it becomes a tab in the Workspace strip. The sheet body remounts in tab form (more space, route-backed, persistent). The operator can switch away and return.

When the operator clicks "promote to tab" explicitly, same behavior. Glance becomes work.

## Keyed remount on sibling swap

If a sheet hosts a list with prev/next navigation (e.g., stepping through Needs You replies), the body is keyed by sheet id so each sibling triggers a full remount:

```tsx
<div className="sheet-body" key={open.id}>
  {renderForRef(open.contentRef)}
</div>
```

Without this key, state from the previous sibling leaks into the next one. The Vrundaa/Havar/Global reply bug from RUN GO 5 was exactly this: ReplyEditor kept subject and body in useState; switching siblings reused the React tree position and state never re-initialised. The key fixes the class.

## Material and z-index

FocusSheet uses `--surface-elevated` (rgba(255,255,255,0.97), near-opaque). Never the `.card` glass token. Cheap see-through bleeds through and the operator sees content behind, which looks cheap.

The z-index ladder (in globals.css):
- nav: 50
- dropdown: 200
- dock: 300
- cmdk: 400
- modal/focus-sheet: 500

FocusSheet is at the top of the stack. Nothing renders over it except the cmdk palette when triggered from within a sheet.

## Backdrop blur

```css
.sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(20, 40, 40, 0.40);
  backdrop-filter: blur(8px);
  display: grid;
  place-items: center;
  z-index: 500;
}
```

The blur is the depth signal. The active sheet is crisp; everything behind it dims and blurs. This is what tells the operator where focus is.

## Common mistakes

**Mistake.** Rolling your own modal because "this case is special."
**Fix.** It isn't. FocusSheet is the primitive. Extend it with new contentRef types instead of forking.

**Mistake.** Using `.card` glass for the sheet surface.
**Fix.** Use `--surface-elevated`. The card token is for content cards, not overlays.

**Mistake.** Forgetting the key on sheet-body.
**Fix.** The keyed remount is non-negotiable for siblings. Without it, state leaks.

**Mistake.** Putting the FocusSheet inside a parent with `transform` or `filter` (these create stacking contexts that break backdrop-filter).
**Fix.** Portal to document.body. The current FocusSheet implementation does this; respect it.

**Mistake.** Building an inline expand-in-place pattern as an alternative.
**Fix.** Don't. One overlay primitive. Inline expand-in-place is a different problem (accordion within a list) and uses a different component.

## When this skill applies

Any time code needs to:
- Open a record for a closer look
- Show a document inline
- Display an image at larger size
- Render a long-form draft for review (Needs You)
- Show a grant application body
- Preview an attachment

If the answer is "yes, open something," this skill applies.
