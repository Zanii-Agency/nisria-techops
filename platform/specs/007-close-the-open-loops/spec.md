# Spec 007 — Close the open loops (the false-claim class)

Status: DRAFT · 2026-07-21 · Tier-1 · supersedes the "3 uniform edges" proposal, which was refuted

## The class

The Sasa turn pipeline is **open-loop**: it resolves rich context (speaker, rank, tools), routes
to one lane, executes once, and narrates from the tool's own summary — **checking no assumption
against reality at any downstream stage.** "Done comes from receipts" closed exactly one loop
(model→tool) and left the rest open. A 33-loop audit against the code confirmed the class is
systemic, not four bugs.

Every live failure is one missing feedback edge:

| Live bug | Unchecked assumption | Loop |
|---|---|---|
| "my tasks" → all 171 | the model would scope to the speaker | subject |
| deleted Malek's tasks | position "1.3" pointed at what Nur meant | continuity + consent |
| "marked done" → still there | the write produced the state the reader sees | verify |
| "I'll take care of it" → never | a lane with no tool could still serve the ask | fabrication |

## What was proposed, and why it was refuted

Proposed three uniform edges: (A) default every subject to the speaker, (B) read-after-write on
every committing tool, (C) composer owns the whole reply "by construction." Adversarial review
returned **`survives: False`** on all three. The clean version was wrong the same way "done from
receipts" was wrong — it assumed one uniform rule per loop. Each loop is shape-dependent.

- **A defaulted subject-less queries to the speaker** — which *hides the team board from the
  person who runs the team.* Nur asks "what's overdue?" and gets her three personal tasks, not the
  org. A hidden narrowing is as damaging as the wrong widening it was meant to fix.
- **B forced `verified` on every committing tool** — but `message_person` legitimately *queues*
  when the 24h window is closed, and gcal sync is best-effort. Forcing verify reports a correctly
  queued send as *failed*.
- **Read-after-write on `complete_calendar_event` verifies a FICTION** — it confirms the
  `[completed]` notes-prefix landed on a column no reader honors. The edge turns green while the
  bug stays open. (This is the trap flagged before the workflow ran.)
- **C is a denylist regex, not "construction."** A fabricated claim phrased outside the regex
  ("Bashir is on the guest list now") survives, and a naive future-promise rewrite would clobber
  *legitimate backed* promises ("I'll flag this to Nur" with a real `flag_to_nur` receipt).

## Decision — the corrected fix (shape-aware, and mostly smaller)

The unifying principle holds — *no stage acts on an assumption it hasn't checked* — but each loop
closes with the right-shaped mechanism, reusing what exists.

### 1. Irreversible task delete → confirm, like its five siblings already do
`delete_event, delete_contact, delete_case, delete_document, delete_payment` are ALL staged for
"reply yes" unconditionally on WhatsApp (`smart-tools.ts:1870-1871`). **`delete_task` is not.**
Add it to `DELETE_TOOLS`. This is the root-cause fix for the Malek incident and the smallest diff
in the spec. Consent, not row-identity, is the safety.

### 2. Positional references resolve against the shown list (continuity)
"drop 1.3" today triggers a fresh global title search — the number is meaningless. Thread the
last numbered list Sasa showed this contact into ctx so a positional follow-up binds to that exact
set. Snapshot proves the right row was *shown*; the confirm in (1) is what proves it was *consented*.

### 3. Self-pronouns bind to the speaker — subject-less does NOT
Route `list_tasks` (and siblings) through the existing `resolveAssignee`/`isSelfPronoun` helpers
(`smart-tools.ts:290-296`), so "my tasks" = the speaker (also fixes the latent `findMember('me')`
fuzzy-match). **Do not default subject-less queries.** If an omitted-subject default is wanted, it
is **rank-aware**: owner/founder → whole board, team → self.

### 4. Verify DB mutations only — leave async on its real receipt
For DB-mutation tools, append `.select()` and gate `ok` on `rows.length > 0` (same round trip, no
added latency — pattern already at `app/api/cron/timed/route.ts:146`). A silent 0-row
update/delete/complete becomes an honest failure. **Send/queue/mirror tools keep their existing
delivered/queued/failed receipts** (`compose-claims.mjs:78,86-88`); never force `verified=false`
on a legitimately queued success.

### 5. Calendar completion is a schema split, not a verify
`calendar_events` has no `completed_at` (confirmed: columns are id,title,starts_on,…,notes — no
status column). Marking done writes a `notes` prefix no reader honors. Fix the data model:
add `completed_at`; patch **every** read path (`getCalendar` `calendar.ts:79`, the tool's own
idempotency re-read `smart-tools.ts:5171`, `query_calendar`); **backfill** historical
`[completed ]` notes rows so they don't reappear as open. Only when read and write agree on one
column does verify (4) become meaningful for calendar.

### 6. Fabrication guard is a maintained denylist + narrow promise-rewrite
Keep the `ACTION_ASSERTION` denylist (`compose-claims.mjs:172`) and treat it as maintained
coverage, not "construction." Rewrite a surviving "I'll \<verb\>" promise **only when** no
handoff/flag receipt exists this turn AND the ask genuinely has no wired tool — so
`flag_to_nur`-backed promises survive. Retire the `NO_SCOPE_LEAK` "say you'll take care of it"
instruction for uncovered capabilities: an honest "I can't do that from here" replaces the false
promise.

## Migration order (live bot, Nur uses it hourly)

Safety-critical first, each shippable and verifiable alone:
1. **(1) delete_task confirm** — stops the only irreversible failure. Hours.
2. **(5) calendar schema** — DDL + read-path + backfill. The most-complained bug.
3. **(4) verify DB mutations** — one wrapper, honest failures.
4. **(2)+(3) continuity + self-pronoun** — the "wrong list" root.
5. **(6) fabrication** — retire the false-promise instruction.

## The walls that must exist (current suite tests wiring, not the guarantee)

- delete_task cannot execute on WhatsApp without a staged confirm.
- a 0-row DB mutation renders "couldn't" — never "done" (behavioural, real DB).
- a calendar event marked done disappears from every read path.
- a subject-less owner query returns the whole board; "my" returns only the speaker's.
- a promise with no backing receipt and no wired tool is rewritten to an honest "I can't."

## Non-goals
- Blanket subject-defaulting (refuted — hides the board).
- Uniform read-after-write across all tools (refuted — breaks async sends).
- Claiming any of this is "structurally impossible" until a wall proves the guarantee.
