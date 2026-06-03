# Sasa Coverage Gap Report — full, ordered by importance

## Headline
Sasa currently covers **45% of the portal** — she has a tool for **131 of 293** observed capabilities; **162 are missing**. Of those, **110 are real gaps** (the other ~52 are deliberate restrictions, e.g. donations read-only, team PII wall, which are correct, not gaps).

## What we were missing (summary)
- **3 safety/privacy holes** — sensitive docs filed with no access tier, thin PII intake.
- **5 reliability gaps** — recurring (tasks+calendar), live campaign rollups, compliance reminders.
- **21 major capability gaps** — social publishing, outreach blasts, bank reconciliation, donor/campaign writes, grant lifecycle, Drive import, receipt-to-payment, the unbuilt Content + Field/Data agents.
- **50 quick wins** — tools that simply wrap an existing portal button the bot cannot yet press.
- **31 polish** — deeper edits, batch ops, threads, merges.


## TIER 0 — SAFETY & PRIVACY (fix first) (3)

**Knowledge**
- (low) **/legal** — Team-tier search_documents has no sensitivity filter
  - *Fix:* In runRead, when tier==='team', exclude folder='legal' and doc_type in (contract) or restrict to a safe allowlist of folders.

**People**
- (high) **/beneficiaries** — Chat intake captures a thin slice of the PII profile
  - *Fix:* Route add_beneficiary through parseIntakeForm-style normalization or extend its schema (age/dob, gender, guardian_status, story, tags) and add a beneficiary photo-attach tool.

**Intake**
- (high) **/filing** — Filed sensitive documents (bank statements, IDs) have no PII redaction or access tier
  - *Fix:* Add a sensitivity tag at classify time (bank_statement/contract/registration) and gate search_documents/preview accordingly, or at minimum confirm only-owner can open finance docs; align with the privacy wall in lib/privacy.ts

## TIER 1 — RELIABILITY (core job) (5)

**Money**
- (medium) **/campaigns** — No campaign performance read (donations rolled up per campaign)
  - *Fix:* Add a campaign_performance read that sums succeeded donations by campaign_id (per currency) and compares to goal_amount, so Sasa reports live progress rather than a possibly-stale stored figure.

**Knowledge**
- (medium) **/legal** — Entity facts and obligations are page-hardcoded, not data the bot can read or remind on
  - *Fix:* Move the entity facts into agent_memory org_facts (or a compliance table) and the OBLIGATIONS into the calendar/payments-style recurring model so query_calendar surfaces them; add a compliance_status read tool.
- (medium) **/legal** — No reminders for recurring filings (990, TCC, CBO returns)
  - *Fix:* Seed dated obligation rows (recurring) and let the existing reminders cron + query_calendar pick them up; optionally a check_compliance tool.

**Work**
- (high) **/tasks** — No recurring tasks/reminders
  - *Fix:* Add a recurrence column (rrule or interval) to tasks plus a cron that re-spawns the next instance on completion, and a `recurrence` arg on create_task; a 'Work' agent owner cron regenerates
- (high) **/calendar** — No recurring calendar events
  - *Fix:* Add a recurrence/rrule column + a 'Work' agent cron that materializes upcoming instances (and mirrors them to Google via RRULE), plus a `recurrence` arg on create_event

## TIER 2 — MAJOR CAPABILITY GAPS (21)

**Money**
- (low) **/donations** — No way for Sasa to filter/report donations by campaign or channel
  - *Fix:* Extend query_donations input_schema with optional campaign (name match) and channel filters, applied as .eq/.ilike in runRead.
- (low) **/campaigns** — No add_campaign tool
  - *Fix:* Add an add_campaign tool (name, type, status, goal_amount, raised_amount, starts_on, ends_on) mirroring saveCampaign's insert branch, admin-only, never writing givebutter_id so syncs are not clobbered.
- (low) **/campaigns** — No update_campaign tool
  - *Fix:* Add update_campaign (match by name, change status/goal/raised/dates/type) reusing saveCampaign's update branch; enforce Currency law on goal/raised and keep raised_amount honest (no invented figures).
- (low) **/campaigns** — list_campaigns has no filters and cannot answer 'how is the X campaign doing' efficiently or 'which are live'
  - *Fix:* Extend list_campaigns input_schema with optional status, type, and name filters applied in runRead.
- (medium) **/donors** — No add_donor or update_donor tool
  - *Fix:* Add add_donor (name + optional email/phone/type/status) and update_donor (status, type, country, tags, notes, contact) tools, mirroring add_contact/update_contact but writing donors; keep lifetime_value/gift figures read-only.
- (medium) **/finance** — finance_summary is too thin (no per-currency net position, no payout/Kenya reconciliation, no per-category breakdown)
  - *Fix:* Extend finance_summary (or add a treasury_position read) to return per-currency in/out/net, the Givebutter-withdrawn vs Kenya-paid reconciliation, and a category breakdown, reusing the page's computations.
- (medium) **/finance** — No reads for team_payments (payroll) or bank_transactions (statement ledger)
  - *Fix:* Add read tools: list_payroll (team_payments by member/period) and list_bank_transactions (date-windowed, source-doc traceable), both admin-only and stripped from team.
- (high) **/finance** — Sasa cannot turn a shared M-Pesa/receipt image into a staged payment
  - *Fix:* Optional: a gated parse_receipt tool that runs the same vision extract and STAGES a record_payment for explicit 'yes', preserving the confirm-before-write money rule.

**Intake**
- (low) **/cases** — No add_case tool for the console/DM surface
  - *Fix:* Add an add_case tool (or an as_case flag on add_beneficiary) so an admin can intentionally create an intake_stage='under_review' record.
- (medium) **/cases** — Entire case lifecycle (stage/approve/decline/reopen) has no agent tools
  - *Fix:* Add admin-only, gated tools advance_case (stage), approve_case, decline_case(reason), reopen_case mirroring app/cases/actions.ts, each scoped to rows with intake_stage NOT NULL and emitting the existing events.
- (medium) **/filing** — 727 DM cannot run the cases (potential-beneficiary) intake; only the group bot can
  - *Fix:* Decide the desired 727 behavior and, if cases should be loggable from the DM, thread a casesIntake flag (or a distinct log_case tool) into runSasa from whatsapp/worker so an operator can forward a referral as a case for review

**Comms**
- (low) **/outreach** — No read into outreach audience size or blast history from chat
  - *Fix:* Add a read tool outreach_status returning deduped audience counts (donors/contacts) and the last N content_posts where channels contains 'outreach'.
- (high) **/outreach** — No Sasa tool for the outreach blast (compose/send/schedule a newsletter)
  - *Fix:* Add a gated draft_outreach tool that composes the blast body, resolves the audience via gatherRecipients, and queues a single bulk approval (new approvals kind='outreach_blast') the worker fans out through sendEmail with the SEND_CAP honored. Keep it admin-only and gated, since a 50-recipient auto-send is far higher-stakes than a 1:1 draft.

**People**
- (medium) **/beneficiaries** — No consent publish/withdraw tool
  - *Fix:* If desired, add a publish_beneficiary tool that queues a CONSENT approval (gated, never direct) rather than flipping consent_public outright; otherwise document it as intentionally portal-only.

**Knowledge**
- (medium) **/grants** — No tool to advance grant status or record an award
  - *Fix:* Add an update_grant_status tool (match by funder, status enum, optional amount_awarded with currency) wrapping advanceStatus, with Currency-law guard on amount_awarded.
- (medium) **/settings** — Brain/voice/accounts/ingest are all human-only Settings surfaces with no bot path
  - *Fix:* Add tools: edit_brain_section (org_profile), set_brand_voice (agent_memory brand_voice), and an ingest_intake tool to start/confirm a batch; gate to admin
- (high) **/library** — Google Drive import is a dead UI affordance
  - *Fix:* Build a Drive-folder import route reusing lib/drive.ts (service account already exists), feeding files through the same ingest + memory, and a connect_drive_folder tool.

**Orchestrator**
- (medium) **/smart** — No campaign create/update or donation create tool
  - *Fix:* Add create_campaign/update_campaign (goal/dates/status) tools; keep donations read-only or add a gated record_donation
- (high) **/smart** — No bank reconciliation tool over bank_transactions
  - *Fix:* Add query_bank_transactions (read) and a gated reconcile_payment tool that links a statement line to a payment
- (high) **/agents** — Content and Field/Data agents are status:soon (not built)
  - *Fix:* Build the Content agent (content_posts drafting) and Field/Data agent (beneficiary/inventory hygiene from the WhatsApp feed) and wire matching tools

**Content**
- (high) **/content** — No real social-publishing pipeline (Instagram/Facebook)
  - *Fix:* Add an 'instagram'/'facebook' (or 'meta') connector case in lib/gateway.ts dispatch() that calls the Meta Graph publishing API, plus a cron/worker that picks up scheduled content_posts, routes through createIntent (gated lane), sets posted_at or status='failed'. Then a publish smart-tool can ride the gateway.

## TIER 3 — QUICK WINS (low effort, broad coverage) (50)

**Money**
- (low) **/donations** — No batch thank-you tool (one-shot 'thank everyone we haven't thanked')
  - *Fix:* Add a draft_all_thank_yous tool that reuses queueThankYouGated over recent un-thanked succeeded gifts (cap ~10), gated into approvals like the UI button.
- (low) **/finance** — No log_payout tool for the Givebutter USD->Kenya bridge
  - *Fix:* Add a log_payout tool (USD, method=givebutter, category=payout, ref GB-PAYOUT-*) so Sasa can capture a payout reported in chat; keep it out of the operating-spend ledger view per doctrine.

**Work**
- (low) **/tasks** — No way to move a task into in_progress or blocked via the assistant
  - *Fix:* Add a `status` argument to update_task (enum todo|in_progress|blocked|done) and route 'start the X task' / 'X is blocked' to it, reusing update_task's matcher
- (low) **/tasks** — Cannot set or change a task description or brand from chat
  - *Fix:* Add optional `description` and `brand` fields to create_task and update_task and write them (brand resolved against brands like the calendar's brand enum)
- (low) **/calendar** — Cannot fully edit an existing event (title/location/notes/end) from chat
  - *Fix:* Add an `update_event` tool that wraps updateCalendarEvent (title, location, notes, end_date, end_time, kind, brand, attendees), matched by title fragment like move_event
- (low) **/calendar** — No attendees or brand on events created by Sasa
  - *Fix:* Add optional `attendees` (resolve names -> team_members.id) and `brand` to create_event's input_schema and pass them into the insert
- (low) **/inventory** — add_inventory_item writes an invalid status:'draft'
  - *Fix:* Change the inserted status to 'in_stock' to match the portal addItem and the DB constraint.
- (low) **/inventory** — No inventory read tool
  - *Fix:* Add a list_inventory / inventory_status tool (counts, low/out-of-stock, listed-on-Folklore) for both tiers.

**People**
- (low) **/team** — No tool writes the per-member pay ledger (team_payments)
  - *Fix:* Add a log_team_payment tool mirroring the logPayment server action (resolve member by name, require KES/USD, write team_payments + emit team.payment_logged).
- (low) **/team** — No activate_member tool
  - *Fix:* Add an activate_member tool calling the same path as activateMember (flip activated/status, best-effort activation email).
- (low) **/team** — update_team_member status enum is wrong/incomplete
  - *Fix:* Align the tool's status enum to the team_members_status_check values; remove 'departed'.
- (low) **/team/[id]** — No read of team_payments pay history
  - *Fix:* Add a read_team_pay_history tool (or extend member_activity with a pay-history block, admin-only).
- (low) **/team/[id]** — No in_progress/blocked task transitions
  - *Fix:* Add a set_task_status tool with the full todo/in_progress/blocked/done enum.
- (low) **/team/[id]** — No task-aware group follow-up
  - *Fix:* Add a follow_up_task tool resolving the task's source_group + assignee first name, mirroring followUpTask.
- (low) **/beneficiaries** — update_beneficiary status is unvalidated free text
  - *Fix:* Constrain status to the DB enum (active/graduated/transitioned/paused/exited/inactive) and reject others.
- (low) **/beneficiaries/[id]** — No per-id beneficiary read with the full identity set
  - *Fix:* Add a beneficiary_detail tool (admin-only) returning the fuller record the 360 shows, with the same team-tier hard refusal.
- (low) **/beneficiaries/[id]** — Validated lifecycle transitions missing
  - *Fix:* Validate status against beneficiaries_status_check; consider a dedicated set_beneficiary_status mirroring the portal action.
- (low) **/profile** — No created_by task view in member_activity
  - *Fix:* Extend member_activity to include created_by counts

**Comms**
- (low) **/contacts/[id]** — No tool reads a contact's message thread
  - *Fix:* Add a read_contact_thread tool (messages by contact_id, owner-line walled like search_history) so Sasa can answer 'what did we last say to X'.
- (low) **/inbox** — draft_email cannot attach a document
  - *Fix:* Extend draft_email schema with an attach hint (doc title fragment) and resolve via resolveAttachments before queueing the approval, mirroring sendReply.
- (low) **/groups** — No tool to read a full group thread or list groups from chat
  - *Fix:* Add list_groups (distinct account where sender_type='group') and group_thread(group, limit) read tools, admin only, reusing the groups/messages query.
- (low) **/groups** — Cannot trigger or preview the daily group digest conversationally
  - *Fix:* Add a run_group_digest action tool (admin only) that calls the digest runner for one group or all, returning what was queued.
- (low) **/groups** — Bot-bound: portal cannot deliver to a group if the Railway userbot is offline
  - *Fix:* This is the deliberate one-way architecture; resolution is operational (re-link via QR). Surface queue depth + bot heartbeat (bot_status group_poll) in a read tool so Sasa can tell Nur a post is stuck rather than silently queuing.
- (low) **/workspace** — sasaDraft pre-draft not reachable from the brain
  - *Fix:* Expose draft_thread_reply(contactId) as a read-style tool returning suggested text

**Intake**
- (low) **/cases** — No read/write of triage_notes, referred_by, case_channel
  - *Fix:* Extend a case_detail read and a case-update tool to cover triage_notes/referred_by/case_channel.
- (low) **/filing** — No tool to trigger Drive extraction or report ingest review status from chat
  - *Fix:* Add a sync_drive read/action tool (POSTs /api/drive/extract with the agent secret) and an ingest_status read tool wrapping latestOpenBatch/batchForReview so Sasa can say 'I pulled in 12 new files, 3 are waiting for your review'
- (low) **/filing** — No delete/unfile capability for documents
  - *Fix:* Add a delete_document tool (soft-delete or hard-delete with an event) + a route, mirroring delete_payment's recoverable pattern; expose a remove action on FileCard
- (low) **/filing** — No get_document_text tool to quote a filed document in chat
  - *Fix:* Add a read_document tool that returns extracted_text (capped) for a matched title, lazily extracting via lib/extract-text if empty, so the 727 can answer 'what does the constitution say about X'
- (low) **/filing** — No tool to fix a document's title/summary
  - *Fix:* Extend file_document (or add rename_document) to optionally set title/summary, humanized, emitting document.filed

**Knowledge**
- (low) **/grants** — No tool to pursue a single opportunity into the pipeline
  - *Fix:* Add a pursue_opportunity SMART_TOOL (input: opportunity id or funder/title match) calling the existing pursueOpportunity logic; admin-tier only.
- (low) **/grants** — No tool to add a grant application from chat
  - *Fix:* Add an add_grant tool (funder, program, amount_requested, deadline) reusing app/grants/actions.ts addGrant.
- (low) **/grants** — Bot cannot read a prepared package body
  - *Fix:* Add a read_grant tool (or a kind to list_grants) returning the notes package for one matched grant, admin-tier.
- (low) **/grants** — No interactive opportunity-hunt trigger
  - *Fix:* Add a refresh_grants tool that internal-fires /api/grants/refresh with the agent secret, or a UI button; surface counts back.
- (low) **/library** — No way to list/search the asset library from chat
  - *Fix:* Add a list_assets/search_assets tool (filter by brand, type, tag/shelf) returning titles + signed URLs; respect consent_required by withholding private images from team tier.
- (low) **/legal** — Bot cannot read a legal document's full text
  - *Fix:* Add a read_document tool that calls the documents/content logic (lazy-extract + return text) for one matched doc, admin-tier.
- (low) **/legal** — No tool to correct a document's classification (doc_type/doc_date/summary)
  - *Fix:* Extend file_document or add an edit_document tool to set doc_type/doc_date, admin-tier.
- (low) **/reports** — Bot cannot surface the Givebutter→Kenya flow figures
  - *Fix:* Add a flow_statement read tool (or extend finance_summary) computing withdrawn USD vs KES/USD paid out from payments, keeping currencies unmixed.
- (low) **/reports** — No on-demand PDF export tool
  - *Fix:* Add an export_pdf tool that, given a matched studio_documents/report title, returns the /api/studio/pdf href as an affordance.
- (low) **/reports** — No tool to trigger the grant-ready document set
  - *Fix:* Add a generate_grant_docs tool that enqueues studio.generate jobs for the four GrantDocKinds and fires the worker, admin-tier.
- (low) **/settings** — Standard grant document generation not bot-triggerable
  - *Fix:* Add generate_grant_doc(kind) tool wrapping queueGrantDoc

**Content**
- (low) **/content** — No Sasa tool to draft/create a content post
  - *Fix:* Add a 'draft_post' / 'schedule_post' smart-tool that inserts into content_posts (brand, channels, body, scheduled_for, status) reusing the aiDraft caption path; add 'list_content' read tool over content_posts.
- (low) **/studio** — No read tool over studio_documents
  - *Fix:* Add a 'find_studio_doc' read tool (or extend search_documents to union studio_documents) returning title, doc_type, kind, created_at, and the pdf href.
- (low) **/studio** — No tool to enqueue a grant-ready regeneration
  - *Fix:* Wrap queueGrantDoc in a 'regenerate_grant_doc' smart-tool keyed by kind, admin-only, with an affordance to the settings panel.
- (low) **/studio** — Grant-ready docs limited to Nisria
  - *Fix:* Parameterize brandKey on generateGrantReadyDoc and the grant-doc job payload if Maisha/AHADI need their own funder packets.

**Orchestrator**
- (low) **/smart** — No autonomy/connector control tool
  - *Fix:* Add set_autonomy_lane and toggle_connector tools (owner/founder gated) wrapping the existing setLane/toggleConnector logic
- (low) **/assistant** — Two near-duplicate chat front-ends (/assistant and /smart) on one route
  - *Fix:* Consolidate to one console or have /assistant import SmartConsole so action affordances and identity handling stay in sync
- (low) **/dashboard (app/page.tsx)** — No tool to read/refresh the daily brief or set the monthly goal
  - *Fix:* Add read_brief and set_monthly_goal tools (owner/founder gated for the goal)
- (low) **/agents** — Autonomy and connector controls have no bot path (orphan-ish tables)
  - *Fix:* Add owner/founder-gated set_autonomy_lane and toggle_connector tools; emit autonomy.changed/connector.toggled as the actions already do
- (low) **/agents** — agent_runs decision log is invisible to Sasa
  - *Fix:* Add a read tool agent_activity(agent?, since?) over agent_runs so Sasa can answer 'what did the comms agent do today'
- (low) **/launchpad** — No bot-driven navigation/launch capability
  - *Fix:* Optional: add a navigate affordance type so Sasa can deep-link the operator to a section; low priority

## TIER 4 — POLISH (31)

**Money**
- (medium) **/donations** — Sasa cannot answer 'has X been thanked yet?' or advance/cancel a queued thank-you
  - *Fix:* Add a read that joins action_intents (thankyou: keys) to report per-donor thank-you status; optionally a gated tool to cancel a pending thank-you approval.
- (medium) **/donors** — Sasa cannot retrieve a donor's conversation thread or activity timeline on request
  - *Fix:* Add a donor_thread/donor_activity read tool that resolves donor->contact(email)->messages+events, returning the cleaned thread and recent agent events.
- (medium) **/donors** — No grounded check-in draft for lapsed/prospect donors (no recent gift)
  - *Fix:* Add a draft_donor_note tool that reuses the donor-draft route logic (thank-you if recent gift, else grounded check-in), queued gated into approvals.
- (medium) **/finance** — No schedule_payment / add_obligation tool (upcoming + recurrence + due_on)
  - *Fix:* Add a schedule_payment tool writing payments status=upcoming with due_on, category, recurrence, vendor_country, emitting payment.scheduled (mirror addPayment); honor Currency law.
- (medium) **/finance** — No mark_payment_paid tool for an existing scheduled obligation (with recurrence roll-forward)
  - *Fix:* Add mark_payment_paid (match an upcoming payment by payee/amount/due window) that flips to paid and rolls the next recurrence forward like markPaid.

**Work**
- (medium) **/tasks** — No parameterized task query/search tool
  - *Fix:* Extend list_tasks with optional assignee_name / status / due_before / priority filters so 'what is overdue for Grace' resolves without member_activity
- (medium) **/tasks** — Multi-task dispatch only exists in the web DispatchBox, not in the brain
  - *Fix:* Let create_task accept an array, or add a create_tasks batch tool, so the WhatsApp/Smart path can split one instruction into many assigned tasks like the console does
- (medium) **/calendar** — Overlay items (task/payment/grant/content dates) are read-only on the calendar
  - *Fix:* Acceptable as-is; if inline rescheduling is wanted, have query results' overlay items carry an action hint so Sasa proactively calls update_task/update_payment when asked to move a due date from the calendar context
- (medium) **/calendar** — No drag-to-reschedule and no id-addressable event ops
  - *Fix:* Add drag handlers on the grid calling updateCalendarEvent by id, and let move/delete_event accept an event id when query_calendar already surfaced one
- (medium) **/inventory** — No update_inventory_item tool
  - *Fix:* Add update_inventory_item (quantity delta, status, price, location, sku, folklore_url) with the DB status enum validated.
- (medium) **/inventory** — No generate_listing tool
  - *Fix:* Add a generate_folklore_listing tool mirroring generateListing (resolve item by name, draft copy, save asset, flip folklore_listed).

**People**
- (medium) **/team** — add/update omit member_type-on-update, pay_type, engagement fields, notes, tags, photo
  - *Fix:* Extend add_team_member/update_team_member input schema to cover pay_type, engagement_start/type, notes, tags, and member_type-on-update; add a set_member_photo tool.
- (medium) **/beneficiaries** — No funding write path anywhere
  - *Fix:* Add an admin-only, currency-explicit set_beneficiary_funding tool (or a portal action) under the Money agent, gated.
- (medium) **/profile** — Auth-identity to team_members linkage is name-matched and unmanaged
  - *Fix:* Add a team_members.auth_user_id column and a link_profile tool/Settings action; expose a read tool for the current operator's own stats

**Comms**
- (medium) **/contacts/[id]** — draft_email cannot attach documents or be sent inline by the operator
  - *Fix:* Extend draft_email to accept attachment refs (reuse resolveAttachments) and surface the chosen sending account on the approval card.
- (medium) **/contacts/[id]** — No contact delete/merge
  - *Fix:* Add a merge_contacts / delete_contact tool with a confirm gate; add an owner/created_by column for safe scoping.
- (medium) **/inbox** — No tool to reply to / close a specific inbound conversation from chat
  - *Fix:* Add a gated reply_to_message tool (input: contact_id/message_id, body) that drafts a reply and queues it via the existing email_reply approval path (reuse queueApproval + createIntent send_email), plus a mark_handled tool that flips messages.status to replied/closed. Owner/admin only.
- (medium) **/outreach** — public.outreach CSR/partner pipeline is unmanaged
  - *Fix:* If this pipeline is still in use, add list/advance tools (e.g. list_outreach, advance_outreach_stage) mapped to the outreach table; otherwise document it as deprecated.
- (medium) **/groups** — No structured @mention / target-a-person-in-group tool
  - *Fix:* Add a mention-aware variant or a target param to post_to_group that resolves a name to a team_members phone and emits a proper WA mention payload in the group.send job for the userbot to render.
- (medium) **/workspace** — No Sasa tool to reply-in-thread or change message status
  - *Fix:* Add a reply_in_thread tool (channel-aware, email actually sends gated, WhatsApp via message_person) and a mark_message tool wrapping the status updates

**Knowledge**
- (medium) **/library** — No asset upload/ingest tool
  - *Fix:* Add an ingest_asset tool that accepts an already-stored storage_path or a WhatsApp media id and runs the uploadAsset ingest path (classify, caption, remember, consent flag).
- (medium) **/library** — No consent management tool
  - *Fix:* Add a set_consent tool (mark consent_on_file true with usage_rights) gated to admin, so beneficiary media can be cleared for use; surfaces the safeguarding wall to the agent.
- (medium) **/reports** — No tool to generate a report from chat
  - *Fix:* Add a generate_report tool (type, brand, window, sections) that enqueues/calls generateReport and returns the studio_documents id + a PDF affordance; admin-tier, money-walled.
- (medium) **/reports** — No tool to draft/issue or list invoices
  - *Fix:* Add draft_invoice (wraps draftInvoiceFromText), issue_invoice (wraps createInvoice), and list_invoices (reads invoices table) tools, admin-tier.

**Intake**
- (medium) **/filing** — doc_date is never populated
  - *Fix:* In lib/ingest.classifyItem, have the Haiku router also return doc_date (it already reads the text) and write it in indexDocument; backfill existing rows from extracted_text on lazy open
- (medium) **/filing** — No link/URL ingest channel
  - *Fix:* Add a 'link' channel to IngestInput that fetches the URL (or resolves a Drive file id) before classify; reuse extract-text/drive fetchers

**Content**
- (medium) **/content** — Graphic generation never wired
  - *Fix:* Wire generateGraphic to Canva autofill (or an image model), upload result to assets, set content_posts.image_url; optionally expose as a tool.
- (medium) **/studio** — No Sasa tool to generate a free-form Studio document
  - *Fix:* Add a 'create_document' smart-tool (admin-only) that enqueues a studio.generate-style job (or calls generateDocument server-side for text-only prompts), returns the doc id + a /api/studio/pdf affordance. Long generations should ride the existing jobs worker, not block the chat turn.

**Orchestrator**
- (medium) **/smart** — No approve/reject tool for the Needs You queue
  - *Fix:* Add a resolve_approval tool (approve|reject by id/title) that calls the gateway execute path, guarded to admin only
- (medium) **/assistant** — Caption/post drafting returns ephemeral text with no persistence
  - *Fix:* Add a draft_content_post tool that writes to content_posts in a draft/gated state
- (medium) **/dashboard (app/page.tsx)** — No resolve_approval tool to action the central Needs You list
  - *Fix:* Shared with /smart: add resolve_approval

## Proposed path (ordered)
1. **Phase 0 — close the 3 safety holes** (sensitive-doc tiering, team search filter, PII intake). Risk, not features.
2. **Phase 1 — the 50 quick wins.** Mostly wrapping existing UI actions as tools. Biggest coverage jump for least risk.
3. **Phase 2 — reliability (recurring engine + multi-step).** Recurrence column + cron; multi-step handled by the orchestrator.
4. **Phase 3 — the orchestrator + specialist mesh** (so multi-step + model tiering land; reuses steward/grant/comms/conductor).
5. **Phase 4 — the high-value builds:** social publishing, outreach blast, bank reconciliation, Drive import, build Content + Field/Data agents.
6. **Phase 5 — polish (31).**

## How much it helps (coverage math)
- Now: **45%** (131/293).
- After quick wins (+50): **62%**.
- After major capabilities (+21): **69%**.
- After reliability + safety (+8): **72%**.
- After polish (+31): **82%** — the remaining ~18% are deliberate restrictions (read-only donations, PII walls), i.e. effectively full coverage of what SHOULD be reachable, with safety closed and reliability fixed.
