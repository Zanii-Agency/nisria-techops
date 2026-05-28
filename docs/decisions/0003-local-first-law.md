# ADR 0003: Local-first Law

**Status:** Adopted
**Date:** 2026-05-29
**Governs:** Law 3 of NISRIA-DOCTRINE.md

## Context

Work was leaking out of the portal. Beneficiary photos opened in a new browser tab, breaking the operator's flow and exposing signed URLs in browser history. Grant cards had "Open application" buttons that bounced to grants.gov. Document cards linked to Drive. Attachments downloaded instead of previewing.

Each of these felt like a small convenience individually. Cumulatively, they meant the operator was constantly being yanked out of the workspace, losing context, losing tabs, and reaching for back buttons.

Nur's complaint was specific: "Everything (photos, documents, applications, profiles) must open inside the portal. Fix this pattern everywhere, not just one spot." The pattern needed to be eradicated at the layer where it occurs, not patched per-surface.

## Decision

Every artifact opens inside the portal, in the FocusSheet primitive. Photos render in a native image viewer. Documents render in DocReader. Grant applications render natively in their FocusSheet. Attachments preview, with a separate explicit "download" affordance only when the operator requests it.

External links exist only when the artifact genuinely lives outside (a funder's submission portal at the moment of actual submission, a verified third-party page). Such links are clearly marked as leaving the portal and never trigger automatically.

## Consequences

The local-first-enforcer sub-agent greps the codebase for `window.open`, `target="_blank"`, and external href patterns. Every hit must be justified or removed.

DocReader becomes the single render path for documents. The FocusSheet becomes the single host for any in-portal artifact view. The cost is that we cannot lean on browser-native behaviors (right-click "open in new tab" on links is gone for most artifacts); the gain is operator focus and a coherent mental model.

## Rollback

If a partner integration requires linking out (the funder's submission portal is the canonical case), the link is explicit and labeled. No quiet exception. No "we'll fix it later" external link.
