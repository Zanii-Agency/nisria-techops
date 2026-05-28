# Workspace Module Rules

Governs /platform/app/workspace/ and related comms surfaces. Read before any change.

## Laws governing this surface

- **Law 4 (Browser-OS).** The shell is a browser. Tabs open, switch, keep state, close. No forced pinned strip.
- **Law 3 (Local-first).** Every artifact opens in-portal. Beneficiary photos, documents, grant applications.
- **Law 7 (One-brain).** Sasa sees all email and all WhatsApp. Smart mode accepts attachments and acts.
- **Law 6 (Real-action).** Send sends. Assign assigns. The send-button loading state is mandatory.

See /NISRIA-DOCTRINE.md and /docs/decisions/0003, 0004, 0006, 0007.

## The skills that apply

- `focus-sheet-pattern`. Mandatory for any "open this" affordance.
- `verification-protocol`. At end of every change.

## The Safari-style spec (the operating vision)

Workspace is where Nur works. The reference is browsing the web in Safari: open things, switch between them, return to where you were, never lose state.

Three surfaces in the Workspace:

1. **Conversations rail (left).** All messages grouped by contact, channel-badged (email blue, WhatsApp green, sms gold, voice peri). Filtered to humans only by default (the wahome/PayPal/I&M/Korean sender automated noise is hidden). Click a contact opens the chat in the center.

2. **Chat (center).** Bubbles in and out. Composer at the bottom with attach picker, signature auto-present per account. Sasa pre-drafts the reply when a new individual message arrives.

3. **Tasks plus open tabs (right).** Tasks assigned to or by the current contact. Below: thumbnails of the operator's currently open Workspace tabs. Click jumps. Drag to reorder. X to close.

## Hard rules specific to Workspace

1. **Automated senders never appear in Workspace.** The classifier marks them `sender_type='automated'` and they archive silently. The list is humans only.

2. **Account is always visible.** Every conversation shows whether it's via sasa@nisria.co or maisha@nisria.co. Replies send from the same account. Signatures match.

3. **Open profile.** From a conversation header, "Open profile" routes to /contacts/[id] as a Workspace tab. Not a popup. Work begins.

4. **Assign task.** From a conversation, "Assign task" opens an inline form. Created tasks land in Tasks (right column) and on the assignee's record.

5. **Sasa pre-draft.** New inbound from an individual triggers a draft reply from Sasa, grounded in the Brain. The operator edits or approves. Drafts never auto-send.

6. **Send shows state.** Loading spinner. Then green check. Then the message appears in the thread. If the channel is queued (WhatsApp until token is live), the message tags as "queued" with the reason.

## What violates this module's law

- A conversation that links a photo with `target="_blank"`
- A "Submit" or "Send" button with no loading state
- Automated email noise (wahome, PayPal, etc.) appearing as a human conversation
- A reply sent from sasa@ when the original was to maisha@ (account confusion)
- Sasa drafting without loading the Brain
- A Workspace tab that loses its scroll or composer state on switch

## Pass 1 work

The Browser-OS Law rework is Pass 1. Workspace surfaces gain proper tabs (state-preserving, route-backed, drag-reorderable). Launchpad becomes the new-tab page. The forced structure strip is removed.

The Workspace email-filter rework (the wahome/PayPal/I&M/Korean sender problem) is also Pass 1. The current filter is heuristic and misses common automated patterns. Pass 1 either rewrites the filter to catch them all or moves to a allowlist-by-default model where only known individuals appear in Workspace.

## Before commit checklist

1. Run local-first-enforcer scoped to changed files. Zero new Migrate or Remove hits.
2. Run doctrine-reviewer.
3. Test: open three conversations, switch between them, edits persist.
4. Test: send a message; loading → success → bubble in thread.
5. Fill proof template.

## When the operator says "Workspace feels broken"

The right question: is it a routing problem (Law 4 violation), a filter problem (automated noise), a state problem (key on remount), or a Sasa problem (Brain not loaded)? Localize before fixing.
