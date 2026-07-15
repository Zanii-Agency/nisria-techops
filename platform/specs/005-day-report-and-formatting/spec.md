# Spec 005 — Detailed day report + "every message formatted right"

**Status:** building · **Owner:** Taona · **Date:** 2026-07-14 · **Tier:** 2 (internal feature + formatter hardening on settled arch)
**Relates:** FT_TOOLS verbatim-render (sasa.ts:1510), whatsapp-format.mjs seam, KT #206694 (grounding), the "sent != received well" ledger.

## Problem
1. "What happened today" has no generator — the model improvises from a few read tools, so the summary is shallow (no "who did what") and flattens (model prose, not a rendered report). Live test 2026-07-14: the org logged 114 human-actor events today (Nur ~44, Dorcas 6, Taona 7, 10 payments) and NONE of the per-person activity reached the summary; headers + bullets arrived on one line.
2. Broader: any model-freeform reply with inline section headers ("Finance - X Documents - Y") flattens, because the send-seam reflow deliberately won't auto-break ambiguous ASCII hyphens.

## Outcome (measurable)
- A `day_report` tool returns a WHOLE-TEAM, per-person "who did what today" report from real data, as a server-rendered multi-line `formatted_text`, added to FT_TOOLS so it ships verbatim and never flattens. Proven: renders >=8 newlines, groups by person, on today's real data.
- The send seam gains a conservative reflow for the inline-section-header pattern that flattened, so freeform replies of that shape also break onto lines — without false-breaking normal prose (wall-tested both ways).
- The model is instructed to structure multi-section replies with newlines.

## Design
### A. `day_report` tool (the core)
Reads TODAY (operator tz) and aggregates:
- **Money:** today's payments in/out per currency (never blended), count.
- **Who did what (whole team):** today's `events` with a human actor (exclude system/meta), mapped type->verb (receipt booked, fact saved, payment staged, task assigned, inventory drafted, case worked, message sent, pin changed...), grouped by normalized person name. Plus tasks created/completed today by assignee.
- **Coming up:** tomorrow's calendar events.
Returns `{ formatted_text, ...raw }`. `formatted_text` is server-rendered: `*Daily report — <date>*`, then `*Money*`, `*Who did what*` with a `*Name*` line per person and their actions, then `*Coming up*`. Headers on own lines, blank-line spacing, WhatsApp `*bold*`, no em-dashes. Added to FT_TOOLS -> sent verbatim.
Admin-only (org-wide activity + money). Routed on "day summary / what happened today / the rundown".

### B. Formatter hardening (whatsapp-format.mjs)
Extend `reflowInlineLists` with ONE conservative rule: an inline SECTION HEADER = an emoji OR a short Capitalized label immediately followed by a colon, occurring 2+ times on a line, breaks before each. Mirrors the existing "2+ • bullets" rule (a clear repeated signal, not a lone occurrence). Leaves single occurrences and normal prose untouched. Pure + idempotent.

### C. Model nudge
One line in the specialist system: multi-part answers (a summary, several sections, a list) put each section/item on its own line; never run sections together with " - ".

## Non-goals
- Perfectly formatting ARBITRARY prose (impossible; that is why structured content goes through server-render). B is a safety net, not a guarantee.
- A daily-push cron (this is the on-demand tool; a scheduled version is a later lever).
- Historical/date-ranged reports (today only in v1).

## Golden tests
1. `day_report` on real data: `formatted_text` has >=8 newlines, contains a `*Who did what*` header and >=1 `*Name*` line, no markdown table, no em-dash.
2. Money never blended (KES and USD on separate lines).
3. Admin-only: tier team -> refused.
4. FT_TOOLS: day_report result ships verbatim (finalize override fires).
5. reflow: "📋 Report 💰 Money: X 📅 Coming: Y" (2+ emoji-section headers) -> breaks onto lines.
6. reflow SAFETY: "I met John - it went well - see you at 3" (ambiguous hyphens, no repeated header signal) -> UNCHANGED.
