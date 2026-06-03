# Sasa Agentification — Full Spec (A-Z plan + agent roster)

_Planning doc. Nothing here is built or deployed yet. All current work is staged on PR #1 (branch `gym/auto-heal-20260602`); the live bot is still the old monolith on the gpt-4o fallback until you merge + deploy. Prod-on-Taona's-Anthropic-key is pending your go._

---

## PART 1 — A-Z: what we are doing, in order

**A. Coverage sweep (FIRST).** Enumerate every portal capability from three sources: every API route, every UI page/action, every DB table + its operations. Map each to a tool + an owning agent. Output: a capability matrix where every row has an owner, and the GAPS (portal things the bot can't do yet) are explicit. This also locks the final agent count. Nothing is "linked to the whole portal" until this exists.

**B. Prompt-fix the 3 gaps (quick win, monolith, on your Claude key).** Multi-step decomposition instruction; recurring "set the next single date NOW, then state the limit" (not "offer"); external-system honesty ("calendar hold placed; you add the Zoom link"). ~15 lines in `buildSystem`. Gym-tested.

**C. Build the Orchestrator + wire the specialists, behind a feature flag.** The monolith stays the live default. The mesh runs only when the flag is on. Reuse the existing `steward`/`grant`/`comms`/`conductor` agents.

**D. Carry the safety contract into EVERY specialist.** One-brain grounding, first-person Sasa voice, the PII wall (children + finance hidden from team), the honesty guard, and the Guard/verifier pass. No specialist may bypass these.

**E. Tiered models (cost control without self-hosting).** Haiku for the router + read/lookup specialists; Sonnet for money/PII/outbound specialists + final synthesis; Opus only for the most delicate replies. Likely CHEAPER than today's monolith (short focused prompts on a cheap model vs one 6k-token Sonnet loop re-sent 6x).

**F. Gym-validate the mesh vs the monolith.** Must hold safety 8/8 (hallucination / false-done / PII), show multi-step jump, and prove the cost delta. Uses the gym already built.

**G. Flip the flag (your merge + deploy).** Mesh becomes default only after F passes. Never auto-deployed.

**H. Self-improve loop (with a human gate).** Scheduled gym run → cluster failures by agent → auto-draft the fix (a prompt rule/example, or training data) → open a PR with before/after gym scores → YOU merge. Regression-guarded (whole suite re-runs, not just the fixed case). It self-*improves*, it does not self-*deploy*.

**I. Optional, later: train + self-host.** Fine-tune a persistently-weak specialist on the gym's data (T4/DGX = the "school"), redeploy the adapter. Optionally serve the trained small experts on the always-on T4 to cut API spend toward zero. GPU is used ONLY for training, never in the live request path.

---

## PART 2 — The channels (so routing is never ambiguous)

- **727 line = the one official WhatsApp Cloud API number.** Everyone DMs it; software gates by phone → role. Sends all DMs including team delegation pings (via approved templates).
- **Each team member's DM** = their own role-gated (team-tier) chat with that same official number.
- **Team group** = the separate group-bot (Baileys) number; group coordination + silent task capture only. Never used for DMs.
- **Privacy wall:** the 727 *conversation context* is private — owner (Taona) private from founder (Nur), one-way. Team never sees either's threads.

---

## PART 3 — The agent roster (who / what portal / permissions / cron / model)

**1 Orchestrator + 6 specialists + 1 Guard.** (Final set confirmed by the coverage sweep.)

### Orchestrator (the manager)
- **Does:** reads the inbound message, identifies the sender's role at the door, decomposes multi-step requests into a checklist, routes each piece to a specialist, assembles ONE first-person Sasa reply.
- **Portal:** none directly (it delegates). Reads role from `team_members` / operator allowlist.
- **Permissions:** sees role; enforces tier on every downstream call. Does not call data tools itself.
- **Cron:** owns `/api/agents/tick` (the daily conductor) and the message-drain trigger.
- **Model:** Haiku (routing is cheap + fast).

### Money agent
- **Does:** donations, donors, finances, logging/correcting payments (stage-then-confirm), campaign money.
- **Portal:** Finance + Donations pages. Tables: `donations`, `donors`, `payments`, `campaigns`.
- **Tools:** query_donations, lookup_donor, newest_donor, finance_summary, latest_gift, record_payment, update_payment, delete_payment, list_campaigns.
- **Permissions:** admin/founder/owner only. **Blocked entirely for team tier.** record_payment is STAGED (confirm before commit); donations/grants are read-only.
- **Cron:** none (event-driven). Reads bank reconciliation from `bank_transactions` (read-only).
- **Model:** Sonnet (money = high stakes).

### Work agent (tasks + calendar)
- **Does:** create/complete/reopen/update/delete tasks; create/move/delete events; reminders; the recurring rule; conflict + holiday checks.
- **Portal:** Tasks + Calendar pages. Tables: `tasks`, `calendar_events` (+ Google Calendar mirror), holiday source.
- **Tools:** create_task, complete_task, reopen_task, update_task, delete_task, create_event, move_event, delete_event, query_calendar, check_conflicts.
- **Permissions:** team tier CAN create/complete its own tasks + team events; team CANNOT touch payroll/grant calendar rows or see money on the calendar (stripped).
- **Cron:** `/api/cron/reminders` (per-assignee task pings) + `/api/cron/task-digest`.
- **Model:** Haiku (Sonnet for ambiguous multi-step).

### People agent (team + contacts + beneficiaries)
- **Does:** roster, contacts, beneficiary records + intake. **The PII wall is hard-wired here** (children confidential; no pay/PII to team).
- **Portal:** Team + Beneficiaries pages. Tables: `team_members`, `contacts`, `beneficiaries`.
- **Tools:** team_detail, lookup_contact, find_beneficiary, add/update_team_member, add_contact, update_contact, add_beneficiary, update_beneficiary, add_inventory_item.
- **Permissions:** find_beneficiary + pay fields = admin only, HARD-refused for team. team_detail strips pay for team. Cases intake routes to review, not auto-accept.
- **Cron:** none.
- **Model:** Sonnet (PII = high stakes).

### Comms agent (outbound)
- **Does:** picks the channel and sends — team DM pings (delegation), group posts, email + thank-you drafts (always gated to approvals).
- **Portal:** Inbox + Needs You (approvals). Tables: `messages`, `approvals`, `action_intents`, `jobs` (group queue).
- **Tools:** message_person (official-number DM), post_to_group (group bot), draft_email, draft_thank_you, inbox_status.
- **Permissions:** delegation DM uses the approved `task_alert` template; email/thank-you NEVER auto-send (queue to approvals); respects 24h-window rule. Channel gate: DM=official 727 number, group=group bot.
- **Cron:** `/api/group/digest`, `/api/group/outbox` drain.
- **Model:** Sonnet (outbound to real people = high stakes).

### Knowledge agent (documents + memory + grants)
- **Does:** search/file documents, the Brain (durable facts + recall), grant opportunities + applications + prepare.
- **Portal:** Library + Grants + Brain. Tables: `documents`, `assets`, `agent_memory`, `grant_opportunities`, `grant_applications`.
- **Tools:** search_documents, file_document, remember_fact, list_learned, list_grants, prepare_grants, search_history.
- **Permissions:** grants read-only by chat; prepare_grants enqueues background jobs; remember_fact owner can mark private.
- **Cron:** `/api/grants/refresh` (hunt) + `/api/grants/prepare` (package).
- **Model:** Haiku for reads/search; Sonnet for grant-package generation.

### Intake agent (the mailroom — NEW)
- **Does:** everything arriving via the 727 (PDFs, invoices, images, voice notes, links): receive → extract/OCR/transcribe → classify → file → route to the right specialist (invoice→Money, grant doc→Knowledge, beneficiary photo→People PII-walled).
- **Portal:** Library + the Brain; writes to `assets`, `documents`, `messages`. Reads Drive.
- **Tools:** the ingest/extract pipeline (extract-text, transcribe, unpdf), file_document; hands off to specialists.
- **Permissions:** read-only on external links (fetch + summarize, never execute); files into library + Brain; routes, doesn't itself move money.
- **Cron:** `/api/ingest/process`, `/api/drive/extract`.
- **Model:** Haiku for classify/route; extraction is non-LLM code.

### Guard (cross-cutting, not a domain agent)
- **Does:** the grounding + honesty check every reply passes before it reaches Nur — catches invented figures, false "done", PII leaks. Already exists (verifier + deterministic honesty backstop).
- **Portal:** none (a gate on outbound text).
- **Permissions:** can rewrite/neutralize a reply; cannot be bypassed by any specialist.
- **Cron:** none.
- **Model:** a different family from the generator (independent failure modes).

---

## PART 4 — What's already in the code (so this is wiring, not inventing)
- Specialists partly exist: `lib/agents/steward.ts` (thank-yous), `grant.ts`, `comms.ts`, `conductor.ts` (briefs).
- Tiering/permissions exist: admin vs team tiers, owner/founder ranks, PII walls, gated approvals.
- Channels exist: official Cloud API (message_person/templates), group bot (Baileys), notify.ts (task_alert/daily_brief/system_alert templates).
- Safety exists: verifier + honesty guard + (new) blind-mode figure caveat.
- The gym exists: brain-swap, multi-turn, doctrine judge — the validation + self-improve engine.

So agentifying = put an Orchestrator in front, split the one prompt into focused specialist prompts, and route, on top of machinery that already works.
