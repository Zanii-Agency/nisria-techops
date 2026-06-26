# Spec 007: The Five-Law Spine

Status: DRAFT
Author: Sasa (Claude Code) for Nur
Date: 2026-06-27
Tier: 1 (governs every write the bot makes: tasks, cases, payments)

## 1. Problem

The bot's correctness rules exist but are scattered point-defenses, discovered bug-by-bug, with no named contract. A clustering of Nur's 804 real messages (KT #416) shows the failures in her own words: fabricated tasks she never asked for ("the pay Mark task is a false task that you created"; "where did you come up with these numbers, I didn't say any of the above"), false completion claims ("it's still showing as a task"; "this is not done but you marked it as done"), and duplication ("you added it 10 times"; "remove Mark's 9 duplicates"). Because the rules are not a contract, a new tool or specialist can reopen a hole an old fix already closed, and nobody can see which guarantee is missing where.

## 2. Outcome

The bot behaves as one assistant whose job is capture, file, confirm, governed by five ordered laws where never-invent and never-claim-undone outrank being helpful. Each law has a named, tested enforcement point.

- Primary metric: a created task or beneficiary whose core content does not trace to Nur's message this turn is REFUSED (Law 1 provenance), proven by a wall with real fabrication examples from KT #416. Target: 100 percent of the fabricated-record golden cases blocked, 100 percent of the legitimate-paraphrase cases allowed.
- Secondary metric (regression catch): every existing wall stays green, and a new spine meta-wall asserts each of the five laws maps to a real enforcement point in code. The specialist mesh (router plus domainFocus) is unchanged.

## 3. Scope

In scope:
- Declare the five ordered laws as the top block of buildSystem (all specialists inherit it).
- A spine meta-wall mapping each law to its enforcement point: Law 1 -> provenance guard, Law 2 -> finalize honesty guards, Law 3 -> dedup guards, Law 4 -> ambiguity/flag_for_clarity, Law 5 -> router plus domainFocus.
- Law 1 fill: a record-provenance guard at the tool boundary for create_task and add_beneficiary. The record's core content (title or name) must share enough tokens with Nur's inbound message this turn, else refuse and ask.
- Law 3 fill: pre-insert dedup for add_beneficiary and record_payment (tasks are already deduped).
- Law 4 fill: close the known update_payment silent newest-pick (KT #381) so a 2-or-more-candidate match asks instead of silently choosing.

Out of scope (explicitly excluded):
- The specialist mesh and router logic. Law 5 is already realized there; this spec only names it and asserts it via the meta-wall. No routing change.
- Law 2 reimplementation. The finalize honesty guards already enforce it; the meta-wall only asserts they exist.
- Provenance on every write tool. Only create_task and add_beneficiary this slice; update/edit tools, calendar, library, inventory deferred.
- The A/B eval (current prompt vs spine prompt). Blocked on Anthropic credits; tracked separately.
- Any change to deployed runtime behavior while the bot is maintenance-locked beyond what ships gated.

## 4. User flow

Happy path (provenance allows a real paraphrase):
1. Nur: "remind me to call the auditor Friday."
2. create_task is called with title "Call the auditor".
3. Provenance guard: "call" and "auditor" appear in her message, overlap passes. Task is created.
4. "Added: Call the auditor, Friday."

Failure path A (Law 1 blocks a fabrication):
1. The model, over-helpfully, tries to create_task "Pay Mark for transport" when Nur's message never mentioned it.
2. Provenance guard: no token support in her inbound. Refuse. The reply asks "I do not see that in your message, did you want me to add it?" Nothing is written.

Failure path B (Law 4 blocks a silent pick):
1. Nur: "update that payment to 5000."
2. Two recent payments match. update_payment returns ambiguous rather than editing the newest.
3. "Two payments could match, which one: the 3,000 to Mark or the 1,000 to Ian?" Nothing changes until she says.

## 5. Non-goals

- Not trying to make the model a better guesser. The spine makes it ask and refuse more, not resolve more.
- Not trying to replace any specialist or the mesh. The spine wraps the specialists; capture-file-confirm runs inside whichever lane the router chose.
- Not trying to prove the prompt beats production this slice. That needs the A/B eval and credits.

## 6. Open questions

- Q: What token-overlap threshold for provenance avoids false refusals on heavy paraphrase? A: Start with the same similarity helper used for task dedup at a conservative threshold, tune from the wall's legitimate-paraphrase cases. Logged, not blocking.
- Q: Should provenance apply to add_case as well as add_beneficiary? A: Cases come through a different intake path; include if it shares the same handler, else defer. Resolve while wiring.
- Q: Does record_payment dedup risk dropping two genuine same-amount same-payee payments in one day? A: Dedup only flags and asks, never silently drops; the false-negative cost (a real second payment lost) is worse than a confirm prompt.

## 7. Test cases (golden set)

| # | Input / scenario | Expected outcome |
|---|------------------|------------------|
| 1 | "remind me to call the auditor Friday" then create_task "Call the auditor" | provenance passes (tokens overlap); task created |
| 2 | model tries create_task "Pay Mark for transport" with no such text in the message | Law 1 refuses; nothing written; asks |
| 3 | "where did you come up with these numbers, I didn't say any of the above" style: model invents a task title absent from input | Law 1 refuses |
| 4 | "assign these to me: A, B, C" then 3 tasks each tracing to a list item | all 3 pass provenance |
| 5 | add_beneficiary with a name present in Nur's message | provenance passes |
| 6 | add_beneficiary with a name absent from the message | Law 1 refuses; asks |
| 7 | add_beneficiary for a name that already exists as a recent beneficiary | Law 3 dedup flags; asks before second insert |
| 8 | record_payment identical to one staged seconds ago (same payee, amount, currency) | Law 3 dedup flags; asks |
| 9 | "update that payment to 5000" with two candidate payments | Law 4: ambiguous, asks which; no silent newest-pick |
| 10 | "update the Mark payment to 5000" with exactly one Mark payment | proceeds, single unambiguous match |
| 11 | meta-wall: each of the five laws maps to a named enforcement point in code | all five present; wall green |
| 12 | meta-wall: Law 5 enforcement is the router plus domainFocus (specialists intact) | present; no routing change |
| 13 | full regression: all existing walls | green (no regression) |
| 14 | legitimate heavy paraphrase: "ring the accountant end of week" then create_task "Call the auditor" | borderline; provenance threshold tuned so this is allowed or asks, never silently mis-creates |
