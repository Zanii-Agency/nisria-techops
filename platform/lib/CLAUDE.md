# Lib Rules

Governs /platform/lib/. Shared utilities, gateway, integrations. Read before adding or modifying.

## Laws governing this surface

- **Law 1 (Source-of-truth).** Utilities that fetch or transform data must preserve source traceability.
- **Law 6 (Real-action).** Gateway and intent code: actions truly execute, idempotency keys honored, failure modes explicit.
- **Law 7 (One-brain).** Sasa-related utilities (recall, brain, anthropic) load org_facts on every call.

See /NISRIA-DOCTRINE.md and /docs/decisions/0001, 0006, 0007.

## The skills that apply

- `currency-handling`. For any code touching money.
- `drive-extraction`. For any code reading Drive.
- `verification-protocol`. End of every change.

## The canonical utilities

These are what other code reaches for. Do not duplicate.

1. **`gateway.ts`.** The action gateway. Every outbound effect (send email, send WhatsApp, create campaign, post to social) goes through here. Honors idempotency keys. Enforces autonomy lanes. Logs to action_intents and events. Returns structured success or failure.

2. **`intents.ts`.** `createIntent({ connector, action, params, idempotency_key, lane })` — the entry point for queuing an action. Returns the intent record. If the idempotency key collides, returns the existing intent (no duplicate).

3. **`anthropic.ts`.** The Claude client. System prompt scaffolding: `NO_DASHES` (strips em/en dashes from output), `NO_PLACEHOLDERS` (refuses `[Current Date]` and similar), `LOAD_BRAIN` (calls recall() and prepends org_facts). Every call goes through this.

4. **`brain.ts`.** Memory primitives. `remember()`, `recall()`, `match_memory()`. recall() always returns kind='org_fact' rows in addition to query matches. The brain is loaded for every Sasa interaction.

5. **`drive.ts`.** Service-account Drive engine. JWT signing, token exchange, list/walk/fetch, export Google-native to PDF or text. Used by extraction, filing, watcher.

6. **`extract-text.ts`.** Per-mime-type text extraction. Google-native → text/CSV. PDF → unpdf. Word → mammoth. Sheets → SheetJS. Preserves structure (paragraphs, tables, headings).

7. **`email-render.ts`.** Email body cleaner. `cleanEmail()` and `snippet()`. Strips truncated styles, MJML, doctype, bare CSS. The only allowed render path for `m.body` anywhere.

8. **`humanize.ts`.** Post-process pass on AI output. Strips dashes, resolves placeholders, inserts current date from the now() service, applies ORG_FACTS substitutions (EIN 92-2509133, never the old wrong 88-3508268).

9. **`email.ts`.** SMTP send. `signatureFor(account)` selects branded signature. From display name per account.

10. **`counts.ts`.** Single source of truth for dashboard counts. `getCounts()` returns `{ needsReply, openTasks, needsYou, donors }` from one place. Dashboard, inbox, and bell read it.

11. **`now.ts`.** Single source for "now." Returns current date in the operator's timezone (derived from login IP). Used for cover-letter dates, deadlines, the daily brief.

## Hard rules specific to lib

1. **Idempotency on every external action.** Every gateway call has an idempotency key derived from (action, subject, time-window). Duplicate calls return the existing intent, never create a new one.

2. **createIntent guards duplicates everywhere.** The queueApproval helper checks for pending approvals on the same message_id, donation_id, or correlation_id before inserting. The thank-you path had this; the email-reply path didn't, and that bug created the duplicate Needs You cards. Fixed; do not regress.

3. **Humanize at render time, not just generation.** Stored rows can contain old dashes or placeholders from before humanize was wired. Every render path (DocReader, ReplyEditor, ApprovalCard, brief) runs humanize on display. Generation-time humanize alone is insufficient.

4. **recall() always loads org_facts.** Even on the simplest Sasa query. Brain grounding is non-negotiable. The agent that doesn't know the org doesn't represent the org.

5. **clean email at extraction, not at display.** `email-render.ts` is the single render path. The conversation thread uses `cleanEmail()`; the timeline meta uses `snippet()`. Never render `m.body` raw.

6. **Service-role server-side only.** No client code holds the service key. All sensitive reads go through API routes that use the service key server-side.

7. **Drive credentials in env, not in code.** The service account JSON is `GOOGLE_SERVICE_ACCOUNT_B64` env. Never in repo. Never logged.

## What violates this module's law

- A new gateway path that skips intent creation
- A duplicate-approvals bug (missing the queueApproval guard)
- An email body rendered without `cleanEmail` or `snippet`
- A money-touching utility that doesn't carry currency
- A Sasa call that doesn't load the Brain
- A hardcoded EIN, address, or org fact that should come from ORG_FACTS or the Brain
- A Drive credential committed to the repo

## Before commit checklist

1. Run doctrine-reviewer.
2. If you touched gateway or intents: trace one full action through the new code (e.g., a test email send) and verify idempotency.
3. If you touched humanize: re-clean a sample of stored rows to confirm display-time cleaning works.
4. If you touched brain or anthropic: spot-check a Sasa interaction and verify org_facts appear in the grounding.
5. Fill proof template.

## The historical context

This module is where the platform's "plumbing" lives. The audit found that the plumbing was more sophisticated than the surface truthfulness: event bus, gated action_intents, autonomy dials, memory table all existed and worked, yet the user-facing counts were wrong because consumers built their own queries. The lesson: utilities here must be the single source of truth, and the rest of the platform must use them. Counts.ts is the model. Apply the pattern wherever multiple consumers compute the same thing.
