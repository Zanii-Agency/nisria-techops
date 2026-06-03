# Sasa Coverage Matrix (from the code sweep)

_31 portal sections, 110 gaps. Grounded in real routes/tables/tools. Effort: gaps to resolve when we build the agents._


## MONEY AGENT
**Owns:** /donations, /donors, /finance, /campaigns

### /donations
- **DB tables:** donations, donors, campaigns, action_intents, approvals
- **Tools:** query_donations [R], latest_gift [R], draft_thank_you [C-gated]
- **Permissions:** Admin/founder/owner only. query_donations, latest_gift, draft_thank_you are NOT in TEAM_TOOL_NAMES (lib/agents/sasa.ts:37), so a team-tier or group caller cannot reach them. The team/group system prompts hard-forbid sharing donor information or donation figures, and carriesMoney()/FINANCE_GROUNDING (sasa.ts:46-56) strip any donation/donor vocabulary or material money figure from team grounding. draft_thank_you is doubly gated: it only ever queues into approvals (manage-by-exception) and never sends. record_payment-style staging does not apply here. Web console caller passes no role and gets full admin visibility (runSmartTool viewerIsOwner default true).
- **CAN do:**
  - Total, count, and list donations for any date window and status (succeeded/failed/refunded) via query_donations
  - Filter donations to recurring-only via query_donations recurring_only flag
  - Return the most recent succeeded gift and its donor name/email via latest_gift
  - Draft a personalized donor thank-you for the latest gift, or for a named donor's most recent succeeded gift, and queue it gated into Needs You via draft_thank_you (requires donor email on file)
  - Report donations in plain language grounded in live rows (per-currency, never blending KES and USD)
- **CANNOT do (why):**
  - Create, edit, refund, or delete a donation row — _Donations are read-only by design (synced from Givebutter via external_id). No write tool targets the donations table; query_donations is R-only and the page exposes no donation-mutation action._
  - Bulk draft thank-yous for ALL un-thanked recent gifts in one command (the page's 'Draft thank-yous for all' button, draftAllThankYous) — _draftAllThankYous is a server action wired only to the /donations UI button; no Sasa tool batches thank-yous. draft_thank_you handles one donor/gift per call._
  - Change a donation's thank-you state from chat (mark sent, re-queue, cancel a queued thank-you) — _The thank-you status column is derived from action_intents; Sasa can only create a draft, not advance or cancel an existing approval/intent._
  - Filter or report donations by campaign or by channel — _query_donations input_schema only accepts from/to/status/recurring_only. Campaign and channel are selected/displayed but not filterable parameters._
  - Surface donations in a team/group context — _query_donations and latest_gift are admin-only reads, excluded from TEAM_TOOL_NAMES, and FINANCE_GROUNDING strips donation figures from team prompts._
- **GAPS → resolve:**
  - [low] No batch thank-you tool (one-shot 'thank everyone we haven't thanked') → Add a draft_all_thank_yous tool that reuses queueThankYouGated over recent un-thanked succeeded gifts (cap ~10), gated into approvals like the UI button.
  - [low] No way for Sasa to filter/report donations by campaign or channel → Extend query_donations input_schema with optional campaign (name match) and channel filters, applied as .eq/.ilike in runRead.
  - [medium] Sasa cannot answer 'has X been thanked yet?' or advance/cancel a queued thank-you → Add a read that joins action_intents (thankyou: keys) to report per-donor thank-you status; optionally a gated tool to cancel a pending thank-you approval.

### /donors
- **DB tables:** donors, donations, contacts, messages, events
- **Tools:** lookup_donor [R], newest_donor [R], draft_thank_you [C-gated], draft_email [C-gated]
- **Permissions:** Admin/founder/owner only. lookup_donor, newest_donor, draft_thank_you, draft_email are excluded from TEAM_TOOL_NAMES, so team/group callers cannot resolve donors at all; lookup_contact in team tier is restricted to colleagues (team_members), never donors or beneficiaries (smart-tools runRead lookup_contact tier==='team' branch). draft_email is always gated into approvals regardless of autonomy dial. Owner/founder rank only changes the privacy-wall behavior (Taona's 727 line) and does not widen donor access beyond admin.
- **CAN do:**
  - Find a donor by name or email and return profile, status/type, lifetime value, and first/last gift dates via lookup_donor
  - Resolve 'our newest donor' via lookup_donor('newest') or newest_donor
  - Draft a gated thank-you to a named donor (their most recent succeeded gift) via draft_thank_you
  - Draft a gated outbound email to a donor (resolveRecipient matches contacts -> donors -> team by name to find an email) via draft_email
  - Quote a donor's lifetime value and gift history in plain language (admin only)
- **CANNOT do (why):**
  - Create a new donor record — _No add_donor tool exists. Donors are seeded via Givebutter sync / donations; the only person-add tools are add_team_member, add_contact, add_beneficiary — none write the donors table._
  - Edit a donor (status, type, country, tags, notes, email/phone) — _No update_donor tool. update_beneficiary/update_team_member/update_contact exist but none target donors. The donors table supports status (prospect/active/lapsed/major), tags[], notes, country — all unreachable from chat._
  - Read or pull the donor's conversation thread / message history from chat — _The /donors/[id] thread (donor-thread route, messages joined via shared contact email) has no Sasa tool. search_history searches messages by keyword but does not scope to a donor, and lookup_contact returns details not threads._
  - AI-draft a warm check-in (not a thank-you) for a lapsed/prospect donor with no recent gift — _The donor-draft route produces a grounded check-in for donors without a recent gift, but Sasa's draft_thank_you returns an error ('no gift') when there is no recent succeeded gift; draft_email is generic and not donor-history-grounded._
  - Send an email or message to a donor without approval — _By design: draft_email forces lane='approve' (sasa.ts smart-tools line ~986); money/PII/outbound never auto-fire from Smart Mode._
- **GAPS → resolve:**
  - [medium] No add_donor or update_donor tool → Add add_donor (name + optional email/phone/type/status) and update_donor (status, type, country, tags, notes, contact) tools, mirroring add_contact/update_contact but writing donors; keep lifetime_value/gift figures read-only.
  - [medium] Sasa cannot retrieve a donor's conversation thread or activity timeline on request → Add a donor_thread/donor_activity read tool that resolves donor->contact(email)->messages+events, returning the cleaned thread and recent agent events.
  - [medium] No grounded check-in draft for lapsed/prospect donors (no recent gift) → Add a draft_donor_note tool that reuses the donor-draft route logic (thank-you if recent gift, else grounded check-in), queued gated into approvals.

### /finance
- **DB tables:** payments, donations, team_members, team_payments, bank_transactions, extraction_staging, finance_insights, pending_actions
- **Tools:** finance_summary [R], record_payment [C-staged], update_payment [U-own-only], delete_payment [D-own-only]
- **Permissions:** Admin/founder/owner ONLY. None of finance_summary, record_payment, update_payment, delete_payment are in TEAM_TOOL_NAMES — a team-tier or group caller cannot read or write any finance data. The team/group prompts forbid any money/donation/salary figure, FINANCE_GROUNDING + MONEY_FIGURE strip material amounts from team grounding, and query_calendar shows payroll/payment days to team WITHOUT amounts. record_payment over WhatsApp (confirmWrites) STAGES into pending_actions and requires an explicit 'yes' before commitPaymentRow writes; the web console (no confirmWrites) commits directly because the human already clicked. update_payment/delete_payment only ever touch AI-WA-* rows, never verified bank/Givebutter history (money read-only doctrine). Currency law enforced throughout (KES/USD never mixed, currency stated back).
- **CAN do:**
  - Report money-in vs money-out for a month plus the count of upcoming/due/overdue payments via finance_summary
  - Log a payment Nur already made (payee, amount, currency KES/USD never mixed, category, method, purpose, date) via record_payment — STAGED for a 'yes' over WhatsApp, committed directly on the web console
  - Correct a chat-logged payment's amount/currency/category/payee/purpose via update_payment
  - Delete a chat-logged payment via delete_payment
  - Default method to mpesa for KES, soft-dedup same payee+amount+currency+day, and enforce the Currency law (asks/states currency back)
- **CANNOT do (why):**
  - Schedule a future payment / obligation (status=upcoming with due_on, recurrence monthly/yearly) — _The addPayment server action on /finance creates upcoming obligations with recurrence; record_payment only ever writes status=paid. No tool sets a due_on obligation or a recurrence._
  - Mark an existing scheduled payment as paid (and roll a recurring one forward) — _markPaid is a /finance UI server action that flips upcoming->paid and inserts the next recurrence; there is no Sasa tool to mark an existing pre-scheduled payment paid by reference._
  - Log a Givebutter payout (method=givebutter, category=payout) — the USD->Kenya bridge — _logPayout is a /finance-only server action; record_payment's category enum has no 'payout' bridge handling and its currency default/logic is operating-spend oriented._
  - Read or reconcile the Givebutter->Kenya reconciliation (withdrawn USD vs KES paid out) — _The reconciliation is computed in app/finance/page.tsx from payments; finance_summary only returns month in/out/upcoming-count, exposing none of the payout/Kenya streams._
  - Read or write team_payments (payroll ledger) or bank_transactions (statement ledger) — _No tool reads or writes team_payments or bank_transactions. Payroll is surfaced via the payments table by payee name (see memory: salaries live as recurring payments), and bank rows are import-only — neither table has a tool._
  - Parse an M-Pesa screenshot / receipt into a payment from chat — _logMpesa, extractExpenseFromImage, and visionExtractExpense are /finance server actions. Sasa receives extracted text as context but record_payment requires Nur to dictate the explicit amount/payee in words (Fabrication Rule); it never reads figures off an image._
  - Edit or delete a payment that came from the bank statement / Givebutter sync — _By design: update_payment and delete_payment filter ilike ref 'AI-WA-%' only, protecting verified history._
- **GAPS → resolve:**
  - [medium] No schedule_payment / add_obligation tool (upcoming + recurrence + due_on) → Add a schedule_payment tool writing payments status=upcoming with due_on, category, recurrence, vendor_country, emitting payment.scheduled (mirror addPayment); honor Currency law.
  - [medium] No mark_payment_paid tool for an existing scheduled obligation (with recurrence roll-forward) → Add mark_payment_paid (match an upcoming payment by payee/amount/due window) that flips to paid and rolls the next recurrence forward like markPaid.
  - [low] No log_payout tool for the Givebutter USD->Kenya bridge → Add a log_payout tool (USD, method=givebutter, category=payout, ref GB-PAYOUT-*) so Sasa can capture a payout reported in chat; keep it out of the operating-spend ledger view per doctrine.
  - [medium] finance_summary is too thin (no per-currency net position, no payout/Kenya reconciliation, no per-category breakdown) → Extend finance_summary (or add a treasury_position read) to return per-currency in/out/net, the Givebutter-withdrawn vs Kenya-paid reconciliation, and a category breakdown, reusing the page's computations.
  - [medium] No reads for team_payments (payroll) or bank_transactions (statement ledger) → Add read tools: list_payroll (team_payments by member/period) and list_bank_transactions (date-windowed, source-doc traceable), both admin-only and stripped from team.
  - [high] Sasa cannot turn a shared M-Pesa/receipt image into a staged payment → Optional: a gated parse_receipt tool that runs the same vision extract and STAGES a record_payment for explicit 'yes', preserving the confirm-before-write money rule.

### /campaigns
- **DB tables:** campaigns, donations
- **Tools:** list_campaigns [R]
- **Permissions:** list_campaigns is the ONE money-section read present in TEAM_TOOL_NAMES, but it is PII/finance-walled inside runRead: for tier==='team' the goal and raised amounts are dropped (showMoney = tier !== 'team', smart-tools.ts list_campaigns), so the team learns campaign names/status/dates only. Admin/founder/owner (web console, or WhatsApp admin) see full money figures. The group prompt further limits any reply to one short sentence, names-only, never figures. No write path exists, so there is no approval/staging gate to discuss for campaigns.
- **CAN do:**
  - List all fundraising campaigns with type, status, start/end dates via list_campaigns
  - Report each campaign's goal and amount raised (admin/founder/owner only) via list_campaigns
  - Tell the team WHICH campaigns are running by name (team tier), with goal/raised figures stripped
- **CANNOT do (why):**
  - Create a campaign — _saveCampaign (insert branch) is a /campaigns server action only; no add_campaign tool exists in SMART_TOOLS. The page note (img 210) explicitly added manual create via the UI, not via Sasa._
  - Edit a campaign (rename, change goal_amount/raised_amount, status, type, dates) — _saveCampaign (update branch) handles edits from the /campaigns form; there is no update_campaign tool, and the campaigns table (status, goal, raised, dates) is unreachable from chat._
  - Filter campaigns by status/type or report only live campaigns — _list_campaigns input_schema is empty ({}) — it returns the latest 20 unconditionally; no parameters for status, type, or 'how much has X raised' beyond reading the full list._
  - Attribute donations to a campaign or report a single campaign's gift breakdown — _No tool joins donations.campaign_id to a campaign; query_donations cannot filter by campaign and list_campaigns reads only the campaigns table's stored raised_amount._
- **GAPS → resolve:**
  - [low] No add_campaign tool → Add an add_campaign tool (name, type, status, goal_amount, raised_amount, starts_on, ends_on) mirroring saveCampaign's insert branch, admin-only, never writing givebutter_id so syncs are not clobbered.
  - [low] No update_campaign tool → Add update_campaign (match by name, change status/goal/raised/dates/type) reusing saveCampaign's update branch; enforce Currency law on goal/raised and keep raised_amount honest (no invented figures).
  - [low] list_campaigns has no filters and cannot answer 'how is the X campaign doing' efficiently or 'which are live' → Extend list_campaigns input_schema with optional status, type, and name filters applied in runRead.
  - [medium] No campaign performance read (donations rolled up per campaign) → Add a campaign_performance read that sums succeeded donations by campaign_id (per currency) and compares to goal_amount, so Sasa reports live progress rather than a possibly-stale stored figure.


## WORK AGENT
**Owns:** /tasks, /calendar, /inventory

### /tasks
- **DB tables:** tasks, team_members, events
- **Tools:** create_task [C], complete_task [U], reopen_task [U], update_task [U], delete_task [D], list_tasks [R]
- **Permissions:** Web console caller passes no role -> full admin tier (Nur), every task tool available. Over WhatsApp, lib/agents/sasa.ts gates by TEAM_TOOL_NAMES: a 'team' member gets list_tasks, create_task, complete_task, reopen_task only. update_task and delete_task are NOT in the team set, so a team member cannot reassign, re-date, rename, or delete a task (admin-only). Tasks carry no PII wall (titles are not money/donor data), so no figure-stripping applies here. complete_task/reopen_task default the actor to the speaker (phone-exact in groups). The deterministic HONESTY GUARD (claimsCompletionWithoutSuccess) and COMPLETION_TOOLS set forbid Sasa claiming a task done/created/updated unless the matching tool returned ok=true this turn.
- **CAN do:**
  - Create a task with title, assignee (resolved by name->team_members), priority, and a single due date; dedups an identical open title
  - Auto-ping the assignee and Nur on WhatsApp immediately when the new task is high priority or due today/overdue (urgent gate)
  - Flag in the same reply when a task's due date lands on a Kenya public holiday
  - Mark a task done by fuzzy title and/or speaker, against the same open board the UI shows; honestly lists open tasks when nothing matches
  - Reopen a completed task (done -> todo)
  - Reassign a task, change its due date, change its priority, or rename it (update_task)
  - Delete a task created in error
  - List all open tasks across the team (read)
  - On completion, credit the assignee's own /team timeline (team.task_done event) and feed the daily digest cron
  - From the founder DispatchBox: turn one free-text instruction into multiple assigned tasks at once and email each assignee (dispatchTasks server action)
  - From the board UI: move a card todo->in_progress->done and reopen via the Start/Done/Reopen button (setTaskStatus server action)
- **CANNOT do (why):**
  - Move a task to in_progress (or to blocked) via Sasa — _complete_task only writes status='done' and reopen_task only writes 'todo'. The tasks table and the board support in_progress and blocked, and the UI button cycles into in_progress, but no tool sets those states. update_task has no status field._
  - Set or edit a task's description via Sasa — _tasks.description exists and dispatchTasks writes it, but neither create_task nor update_task exposes a description argument (create_task input_schema has only title/assignee_name/priority/due_on; update_task has no description)._
  - Assign a task to a brand (brand_id) — _tasks.brand_id FK to brands exists in schema but no task tool ever sets it; create_task/update_task have no brand field._
  - Bulk-dispatch many tasks from one instruction over WhatsApp — _The multi-task LLM split lives only in the dispatchTasks server action behind the web DispatchBox; Sasa's create_task makes one task per call and has no batch path._
  - Filter / query tasks by assignee, due window, priority, or 'mine' — _list_tasks returns the open set with no parameters; the personal lens (?mine=1) and column filters exist only in the page UI, not as a tool. member_activity is the closest but is a People-side per-person summary, not a task query._
  - Reassign/edit a task by id rather than title — _All task action tools (complete/reopen/update/delete) match on a fuzzy title fragment only; there is no id-addressable path, so two similarly-titled tasks force a 'which one?' ask._
- **GAPS → resolve:**
  - [low] No way to move a task into in_progress or blocked via the assistant → Add a `status` argument to update_task (enum todo|in_progress|blocked|done) and route 'start the X task' / 'X is blocked' to it, reusing update_task's matcher
  - [low] Cannot set or change a task description or brand from chat → Add optional `description` and `brand` fields to create_task and update_task and write them (brand resolved against brands like the calendar's brand enum)
  - [high] No recurring tasks/reminders → Add a recurrence column (rrule or interval) to tasks plus a cron that re-spawns the next instance on completion, and a `recurrence` arg on create_task; a 'Work' agent owner cron regenerates
  - [medium] No parameterized task query/search tool → Extend list_tasks with optional assignee_name / status / due_before / priority filters so 'what is overdue for Grace' resolves without member_activity
  - [medium] Multi-task dispatch only exists in the web DispatchBox, not in the brain → Let create_task accept an array, or add a create_tasks batch tool, so the WhatsApp/Smart path can split one instruction into many assigned tasks like the console does

### /calendar
- **DB tables:** calendar_events, tasks, payments, grant_applications, content_posts, Google Calendar via lib/gcal.ts, events
- **Tools:** query_calendar [R], check_conflicts [R], create_event [C], move_event [U], delete_event [D]
- **Permissions:** Web console + app/api/calendar GET run at tier:'admin' (Nur) -> full money-aware view, all event tools. Over WhatsApp, TEAM_TOOL_NAMES includes query_calendar, check_conflicts, create_event, move_event, delete_event, so a team member gets full back-and-forth on NATIVE events. The money wall is enforced in lib/calendar.ts getCalendar(): for tier:'team' a payment shows as a dateless '<category> day' with NO amount, payment/grant links are dropped, and grant/payment items are non-editable (editable=admin_); a team member can neither read a figure nor move/remove a financial or grant item. query_calendar strips e.amount for team tier. Native calendar_events are team-editable; a gcal-sourced row Sasa minted from a finance context is admin-only (editable = admin_ || source!=='gcal'). Same deterministic honesty guard covers create/move/delete_event in COMPLETION_TOOLS.
- **CAN do:**
  - Read the unified calendar for any window: task due dates, payment/payroll days, grant deadlines, scheduled content, native meetings/travel/visits/reminders, Google meetings, and Kenya public holidays incl. Eid
  - Check one date for a Kenya public holiday (team is off) and for same-day load before scheduling
  - Create a native calendar event (meeting/travel/visit/reminder/event) with title, single or multi-day dates, a start and end time or all-day, and a location/notes
  - Mirror every native create/move/delete to Nur's Google Calendar (sasa@nisria.co) when the link is live, storing gcal_event_id for two-way sync, best-effort if the link is down
  - Flag in the same reply when an event lands on a public holiday
  - Reschedule a native event's date and/or time (move_event)
  - Cancel/delete a native event (delete_event), removing it from Google too
  - From the web Calendar UI: month/week navigation, source toggles, day sheet, an inline compose form (title, date, kind, all-day/time, location), a trash button on native events, and an 'Ask Sasa' quick-prompt that hands the question to the same brain
- **CANNOT do (why):**
  - Recurring events ('every Monday', 'the 2nd of each month') — _calendar_events holds one starts_on/ends_on; create_event has no recurrence field and the prompt explicitly tells Sasa recurring is unsupported and to set the next single date._
  - Add attendees to an event — _calendar_events.attendee_ids uuid[] (team_members) exists and the EventInput type carries attendee_ids, but create_event's input_schema has no attendees field and never sets it; the compose UI also omits it._
  - Set an event's brand (nisria/maisha/ahadi) — _calendar_events.brand and clean()'s brand whitelist exist, but create_event's tool schema has no brand argument; only the server-action path could carry it and the UI form does not._
  - Edit an event's title, location, notes, end date, or end time after creation — _move_event only writes starts_on/start_time/all_day; it cannot change title, location, notes, ends_on, or end_time. updateCalendarEvent (server action) can, but there is NO Sasa tool wired to it — only move/delete are exposed._
  - Edit a task due date, payment date, grant deadline, or content schedule from the calendar — _Those are read-only overlays in lib/calendar.ts; the prompt routes due-date changes to create_task/update_task, payment dates to update_payment, grant deadlines to the record. No calendar tool mutates them, and the Calendar UI trash button is gated to source==='event' only._
  - Move/delete an event by id, or move an all-day event to multi-day — _move_event/delete_event match on a fuzzy title fragment only (forces 'which one?' on duplicates) and move_event has no end_date/end_time inputs, so it cannot extend a one-day event into a range._
  - Drag-to-reschedule on the grid — _Calendar.tsx wires onClick open/delete and a compose form, but no drag handler; rescheduling is text-only via move_event or delete+recreate._
- **GAPS → resolve:**
  - [high] No recurring calendar events → Add a recurrence/rrule column + a 'Work' agent cron that materializes upcoming instances (and mirrors them to Google via RRULE), plus a `recurrence` arg on create_event
  - [low] Cannot fully edit an existing event (title/location/notes/end) from chat → Add an `update_event` tool that wraps updateCalendarEvent (title, location, notes, end_date, end_time, kind, brand, attendees), matched by title fragment like move_event
  - [low] No attendees or brand on events created by Sasa → Add optional `attendees` (resolve names -> team_members.id) and `brand` to create_event's input_schema and pass them into the insert
  - [medium] Overlay items (task/payment/grant/content dates) are read-only on the calendar → Acceptable as-is; if inline rescheduling is wanted, have query results' overlay items carry an action hint so Sasa proactively calls update_task/update_payment when asked to move a due date from the calendar context
  - [medium] No drag-to-reschedule and no id-addressable event ops → Add drag handlers on the grid calling updateCalendarEvent by id, and let move/delete_event accept an event id when query_calendar already surfaced one

### /inventory
- **DB tables:** inventory, assets
- **Tools:** add_inventory_item [C]
- **Permissions:** add_inventory_item IS in TEAM_TOOL_NAMES, so a team member (e.g. a tailor in a Maisha group) can add stock — this is intentional (handmade-goods intake from the field). No PII concern on inventory. Everything else (read, update, listing generation) is unavailable to BOTH tiers via chat; it is portal-only. No money wall applies (item prices are product prices, not org finances), though no read tool exposes them anyway.
- **CAN do:**
  - Add a Maisha inventory item with name, quantity, category, collection, and unit_price (add_inventory_item)
- **CANNOT do (why):**
  - Add an item with a VALID status — _add_inventory_item inserts status:'draft', but the inventory_status_check constraint only permits in_stock/low/out/archived. 'draft' is NOT a valid value, so this insert would fail the check constraint — a real bug. The portal addItem correctly uses status 'in_stock'._
  - Read / list inventory items or stock levels — _There is NO inventory read tool. /inventory renders the full catalogue (select * from inventory) but Sasa cannot answer 'how many necklaces do we have', 'what's low/out of stock', or 'what's listed on Folklore'._
  - Update an item: quantity adjustments, status (in_stock/low/out/archived), price, location, sku, folklore_url, photos — _No update_inventory_item tool exists; the inventory table's stock/lifecycle columns are write-once via the agent. The portal can edit via generateListing (sets folklore_listed) but even it has no general item editor._
  - Generate a Folklore marketplace listing for an item — _generateListing is a portal action (Claude-drafts the copy, saves it to assets, flips folklore_listed); no Sasa tool triggers listing generation from chat._
  - Set unit_cost or sku on create — _add_inventory_item accepts unit_price but not unit_cost or sku, which the inventory table carries (sku is UNIQUE)._
  - Delete / archive an item — _No delete tool and no archive transition reachable from chat._
- **GAPS → resolve:**
  - [low] add_inventory_item writes an invalid status:'draft' → Change the inserted status to 'in_stock' to match the portal addItem and the DB constraint.
  - [low] No inventory read tool → Add a list_inventory / inventory_status tool (counts, low/out-of-stock, listed-on-Folklore) for both tiers.
  - [medium] No update_inventory_item tool → Add update_inventory_item (quantity delta, status, price, location, sku, folklore_url) with the DB status enum validated.
  - [medium] No generate_listing tool → Add a generate_folklore_listing tool mirroring generateListing (resolve item by name, draft copy, save asset, flip folklore_listed).


## PEOPLE AGENT
**Owns:** /team, /team/[id], /beneficiaries, /beneficiaries/[id], /profile

### /team
- **DB tables:** team_members, tasks
- **Tools:** list_team [R], team_detail [R], add_team_member [C], update_team_member [U], member_activity [R], lookup_contact [R]
- **Permissions:** Web console (Smart Mode /api/smart) always runs admin tier (runSasa called without operatorRole, defaults role='admin'); operatorRank derived from auth cookie: builder=>owner (Taona), founder=>founder (Nur). WhatsApp DM is admin tier; any group is forced team tier. TEAM_TOOL_NAMES grants team members: team_detail, lookup_contact (plus list_tasks/create_task/complete_task/reopen_task and calendar tools). PII wall inside runRead for tier 'team': team_detail returns pay as undefined (showPay=false); lookup_contact restricts a team member to active colleagues only (no donors/beneficiaries). add_team_member / update_team_member are NOT in TEAM_TOOL_NAMES, so only admin (Nur/Taona) can create or edit members. update_team_member enforces Currency law (refuses pay without explicit KES/USD).
- **CAN do:**
  - List the active roster with names and roles (list_team)
  - Read the full roster with each person's role, phone, pay, responsibilities, location, status (team_detail); pay is hidden when the caller is team tier
  - Add a new team member by name with optional role/email/member_type (add_team_member) — lands active, not activated, pay_currency USD
  - Update an existing member's role, phone, responsibilities, location, status (active/inactive/departed), or pay (update_team_member; pay requires explicit KES/USD)
  - Report what a member has been doing: open, overdue, recently completed tasks and recent group messages (member_activity)
  - Resolve a member's phone/email by name (lookup_contact)
  - Indirectly assign work to a member via create_task with assignee_name, and credit task completions to a member's timeline (team.task_done event read by /team/[id])
- **CANNOT do (why):**
  - Set member_type on update (only on create), and set pay_type (monthly/piece/stipend/hourly/none) — _update_team_member has no member_type or pay_type field; portal updateMember + the team_members.pay_type column support both. Sasa can set a pay amount+currency but cannot say whether it is monthly vs piece vs stipend._
  - Set engagement_start, engagement_type, notes, tags, email on update — _add_team_member accepts only name/role/email/member_type; update_team_member accepts no email, engagement_*, notes, or tags. The portal addMember/updateMember server actions write all of these columns._
  - Activate a member (flip activated=true and send the activation email) — _activateMember server action exists in the portal; there is no activate_member Sasa tool. add_team_member hardcodes activated=false and nothing can flip it via chat._
  - Log a team payroll payment into team_payments (the per-member pay ledger) — _The logPayment portal action writes team_payments; Sasa's record_payment writes the global payments ledger instead (keyed by payee NAME), never team_payments linked by team_member_id. No tool inserts a team_payments row._
  - Attach or set a member photo (photo_asset_id) — _team_members.photo_asset_id exists and /team/[id] renders it, but no Sasa tool uploads or links a member photo._
  - Set member status to 'paused', 'exited', or 'invited' — _update_team_member's status enum only allows active/inactive/departed, but the team_members_status_check constraint and setMemberStatus portal action allow paused/exited/invited. 'departed' is not even a valid DB status value (constraint allows active/paused/exited/invited/inactive), so update_team_member status='departed' would fail the check constraint._
  - Delete / remove a team member — _No delete tool and no portal delete action; lifecycle is status-only by design, so this is intentional but worth noting._
- **GAPS → resolve:**
  - [low] No tool writes the per-member pay ledger (team_payments) → Add a log_team_payment tool mirroring the logPayment server action (resolve member by name, require KES/USD, write team_payments + emit team.payment_logged).
  - [low] No activate_member tool → Add an activate_member tool calling the same path as activateMember (flip activated/status, best-effort activation email).
  - [low] update_team_member status enum is wrong/incomplete → Align the tool's status enum to the team_members_status_check values; remove 'departed'.
  - [medium] add/update omit member_type-on-update, pay_type, engagement fields, notes, tags, photo → Extend add_team_member/update_team_member input schema to cover pay_type, engagement_start/type, notes, tags, and member_type-on-update; add a set_member_photo tool.

### /team/[id]
- **DB tables:** team_members, tasks, team_payments, events, contacts + messages
- **Tools:** team_detail [R], member_activity [R], update_team_member [U], lookup_contact [R]
- **Permissions:** Same gating as /team. Profile reads (team_detail, member_activity) are admin-only for the activity view: member_activity hard-returns 'not available here' for tier 'team'; team_detail is team-allowed but strips pay. Editing (update_team_member) is admin-only (not in TEAM_TOOL_NAMES). Pay edits enforce Currency law.
- **CAN do:**
  - Read a single member's role, phone, pay, responsibilities, location, status by filtering team_detail by name
  - Summarise a member's task load and recent group activity (member_activity) — mirrors the timeline this profile renders
  - Edit the member's profile fields exposed by update_team_member (role, phone, responsibilities, location, status, pay)
  - Assign a task to this member (create_task assignee_name), reassign/retitle/repri their tasks (update_task), and mark their tasks done/reopened (complete_task/reopen_task), which credit the team_member timeline
- **CANNOT do (why):**
  - Read the member's pay HISTORY (team_payments rows) — _team_detail returns only the current pay_amount/pay_currency; no tool reads the team_payments ledger that the 360 page shows._
  - Advance a task through todo->in_progress->blocked->done on this member — _complete_task only sets done and reopen_task only sets todo; the setTaskStatus portal action supports in_progress and blocked, which no Sasa tool can set._
  - Follow up on a task into its origin group from the profile — _followUpTask is a portal action that posts an @mention into the task's source_group; Sasa has post_to_group (free text) but no task-aware follow-up tool that auto-composes the mention and resolves source_group._
  - Read/set the member photo shown on the 360 — _photo_asset_id has no agent read or write path (same as /team)._
- **GAPS → resolve:**
  - [low] No read of team_payments pay history → Add a read_team_pay_history tool (or extend member_activity with a pay-history block, admin-only).
  - [low] No in_progress/blocked task transitions → Add a set_task_status tool with the full todo/in_progress/blocked/done enum.
  - [low] No task-aware group follow-up → Add a follow_up_task tool resolving the task's source_group + assignee first name, mirroring followUpTask.

### /beneficiaries
- **DB tables:** beneficiaries, assets, public_beneficiary_profiles
- **Tools:** find_beneficiary [R], add_beneficiary [C], update_beneficiary [U], lookup_contact [R]
- **Permissions:** HARD PII WALL: find_beneficiary returns {error:'not available'} for tier 'team' (child-safeguarding data). lookup_contact never resolves a beneficiary for tier 'team'. add_beneficiary IS in TEAM_TOOL_NAMES, but in a group (always team tier) the casesIntake context forces the record into /cases as a not-yet-accepted case (status inactive, intake_stage under_review), never an accepted beneficiary — enforcing the never-auto-accept rule. update_beneficiary is admin-only (not in TEAM_TOOL_NAMES) and refuses all money fields. New beneficiaries always land consent_public=false; nothing donor-facing without an explicit human publish. RLS: base table has no anon policy; only public_beneficiary_profiles is exposed.
- **CAN do:**
  - Search and read beneficiary records by name, program, region (find_beneficiary), including needs, a story excerpt, phone, age, and funding progress (admin only)
  - Intake a new child/family into a program (add_beneficiary) — always private (consent_public=false), never donor-facing until published
  - Update a beneficiary's status, needs, program, region, or contact phone (update_beneficiary)
  - Resolve a beneficiary's contact phone via lookup_contact (admin tier only)
- **CANNOT do (why):**
  - Publish / unpublish a beneficiary's public donor-facing profile (toggle consent_public) — _The toggleConsent portal action flips consent_public (+ consent_date) into public_beneficiary_profiles; no Sasa tool can publish or withdraw consent. update_beneficiary deliberately omits consent._
  - Set or change funding (goal_amount, funded_amount) — _By design — update_beneficiary explicitly refuses money fields ('You CANNOT change funding or any money figure here'); find_beneficiary can READ funding but nothing writes it. The portal also has no funding writer here, so this is a true gap for both surfaces._
  - Capture rich intake fields: age/date_of_birth, gender, guardian_status, national_id, case_number, case_type, story, tags, photo — _add_beneficiary accepts only full_name/program/region/needs. The portal confirmBeneficiary (via parseIntakeForm) writes age->DOB, gender, guardian_status, story_private, tags, photo_asset_id from a vision/voice/text extraction; Sasa's chat intake captures none of these._
  - Attach a photo to a beneficiary — _extractBeneficiaryFromImages + parseIntakeForm register a private assets row and set photo_asset_id; no Sasa tool uploads or links a beneficiary photo._
  - Set status to graduated/transitioned (full lifecycle) — _update_beneficiary passes status as free text sliced to 40 chars, so it CAN write 'graduated', but the tool description only suggests active/graduated/exited/paused and there is no validation against the beneficiaries_status_check enum (active/graduated/transitioned/paused/exited/inactive) — a typo would be written verbatim and could violate the constraint._
  - Update full_name or public_name — _update_beneficiary matches by name but cannot rename; public_name (the alias used in the public view) is unreachable from chat._
- **GAPS → resolve:**
  - [medium] No consent publish/withdraw tool → If desired, add a publish_beneficiary tool that queues a CONSENT approval (gated, never direct) rather than flipping consent_public outright; otherwise document it as intentionally portal-only.
  - [high] Chat intake captures a thin slice of the PII profile → Route add_beneficiary through parseIntakeForm-style normalization or extend its schema (age/dob, gender, guardian_status, story, tags) and add a beneficiary photo-attach tool.
  - [low] update_beneficiary status is unvalidated free text → Constrain status to the DB enum (active/graduated/transitioned/paused/exited/inactive) and reject others.
  - [medium] No funding write path anywhere → Add an admin-only, currency-explicit set_beneficiary_funding tool (or a portal action) under the Money agent, gated.

### /beneficiaries/[id]
- **DB tables:** beneficiaries, assets, public_beneficiary_profiles
- **Tools:** find_beneficiary [R], update_beneficiary [U]
- **Permissions:** Identical PII wall to /beneficiaries: all beneficiary reads/edits are admin-only over chat (find_beneficiary and lookup_contact hard-refuse team tier; update_beneficiary is not a team tool). Photos served via short-lived signed URLs scoped to the operator session; consent_public must be true (+ signed consent on file) before anything reaches the public view.
- **CAN do:**
  - Read the core facts the 360 shows by searching find_beneficiary by name (story excerpt capped at 220 chars, funding string, phone, age)
  - Edit the lifecycle/needs/program/region/contact fields the profile exposes (update_beneficiary), matched by name with disambiguation
- **CANNOT do (why):**
  - Advance the program lifecycle to graduated/transitioned/paused/exited via a validated control — _The setStatus portal action validates against the full STATUSES enum; update_beneficiary writes status as unvalidated free text and its description omits transitioned, so a clean lifecycle advance from chat is unreliable._
  - Read/attach the beneficiary photo, national_id, case_number, DOB, guardian_status, public_story — _find_beneficiary's projection omits national_id, date_of_birth, guardian_status, public_name, public_story, and the photo; these PII/identity fields the 360 renders are not exposed to or writable by any tool._
  - Toggle consent for this specific child — _Same as /beneficiaries — toggleConsent is portal-only._
- **GAPS → resolve:**
  - [low] No per-id beneficiary read with the full identity set → Add a beneficiary_detail tool (admin-only) returning the fuller record the 360 shows, with the same team-tier hard refusal.
  - [low] Validated lifecycle transitions missing → Validate status against beneficiaries_status_check; consider a dedicated set_beneficiary_status mirroring the portal action.

### /profile
- **DB tables:** team_members, tasks
- **Tools:** team_detail [R], member_activity [R], update_team_member [U]
- **Permissions:** /profile renders only the logged-in user's own row (getCurrentUser + getCurrentTeamMember), role label founder/builder. Sasa's team_detail/member_activity pay and activity reads are admin-only (tier==='team' hides pay and refuses member_activity). update_team_member pay edits enforce Currency law (explicit KES/USD, stated back).
- **CAN do:**
  - Sasa can read a member's roster detail and pay (team_detail, admin only), read what a member has been doing (member_activity: open/overdue/recently-done tasks + group messages), and update a team member's profile fields including pay (currency required)
  - The /profile PAGE reads the logged-in user's linked team_members row (getCurrentTeamMember) and their task stats (assigned open/done, created-by-me)
- **CANNOT do (why):**
  - Read or set the current login's own profile linkage (auth user <-> team_members) — _getCurrentTeamMember bridges the signed cookie to a team_members row by name; no Sasa tool exposes or repairs this linkage, so the 'no profile linked' state cannot be fixed by the bot_
  - Report 'created by me' task stats for the logged-in operator — _createdMine counts tasks by created_by=user.name on the page; Sasa's member_activity is assignee-based and has no created_by view_
  - Change a member's auth role (founder/builder) — _Auth roles live in lib/auth.ts hardcoded users, not team_members; no tool and no DB field for it_
- **GAPS → resolve:**
  - [medium] Auth-identity to team_members linkage is name-matched and unmanaged → Add a team_members.auth_user_id column and a link_profile tool/Settings action; expose a read tool for the current operator's own stats
  - [low] No created_by task view in member_activity → Extend member_activity to include created_by counts


## COMMS AGENT
**Owns:** /contacts/[id], /inbox, /outreach, /groups, /workspace

### /contacts/[id]
- **DB tables:** contacts, messages, events, donors + donations
- **Tools:** lookup_contact [R], add_contact [CU], update_contact [U], draft_email [C-gated], message_person [C-action]
- **Permissions:** add_contact/update_contact are admin-only (not in TEAM_TOOL_NAMES). lookup_contact is team-allowed but for a team member it resolves ONLY active team colleagues (donors and beneficiaries are excluded as PII). draft_email and message_person are admin-only and never auto-fire to a real person at email (draft_email forces lane 'approve' regardless of dial); message_person sends WhatsApp directly only on an explicit operator command. Contacts table has NO RLS-sensitive PII wall beyond the team-tier lookup restriction.
- **CAN do:**
  - Look up a contact's phone and email by name (lookup_contact)
  - Save a new contact or update an existing one's phone/email/channel (add_contact, upsert by name)
  - Correct an existing contact's phone or email (update_contact)
  - Draft an outbound email to a contact that lands in Needs You for Nur's approval (draft_email; resolves the recipient email via contacts->donors->team)
  - Send a WhatsApp message to a contact directly when explicitly told (message_person), with a fallback to the operator_update template for operators outside the 24h window
- **CANNOT do (why):**
  - Read a contact's conversation thread / message history — _No tool reads the messages table for a contact. search_history searches message BODIES globally by keyword (and walls the owner's line) but cannot pull a named contact's thread; the /contacts/[id] page renders the full thread the agent cannot see._
  - Send an inline email from the contact 360 with a chosen sending account + attachments — _The emailContact portal action sends immediately (Nur-driven, status replied/failed) with account selection + Library/Studio attachments; Sasa's draft_email is always gated and cannot attach documents._
  - Set/correct a contact's channel via update_contact — _update_contact only patches phone and email; channel can only be set on add_contact, not corrected later._
  - Delete or merge a duplicate contact — _No delete tool and no portal delete action exist for contacts; the contacts table also has no created_by/owner column to scope a safe delete._
  - Link a contact to its donor record — _The 360 cross-links contact email to a donor; no tool exposes or creates that linkage from chat._
- **GAPS → resolve:**
  - [low] No tool reads a contact's message thread → Add a read_contact_thread tool (messages by contact_id, owner-line walled like search_history) so Sasa can answer 'what did we last say to X'.
  - [medium] draft_email cannot attach documents or be sent inline by the operator → Extend draft_email to accept attachment refs (reuse resolveAttachments) and surface the chosen sending account on the approval card.
  - [medium] No contact delete/merge → Add a merge_contacts / delete_contact tool with a confirm gate; add an owner/created_by column for safe scoping.

### /inbox
- **DB tables:** messages, contacts, approvals, action_intents
- **Tools:** inbox_status [R], draft_email [CR-gated], draft_thank_you [CR-gated]
- **Permissions:** Admin/owner/founder only for every Comms read+draft tool: inbox_status, draft_email, draft_thank_you are NOT in TEAM_TOOL_NAMES (lib/agents/sasa.ts line 37-38), so a team member in a group never reaches them. PII WALL on inbox_status (runRead): when viewerIsOwner is false (any non-owner: Nur, group, unknown), the query excludes ownerContactIds(db) so Taona's private 727 line never surfaces as 'needs reply'. Same asymmetric wall is re-enforced in the inbox PAGE: viewerIsOwner = getCurrentUser().role==='builder'; Nur's view filters out owner contact ids entirely. draft_email and draft_thank_you are HARD-GATED to the approvals lane (lane='approve' forced regardless of autonomy dial) so no outbound ever auto-fires from Smart Mode.
- **CAN do:**
  - Read which 1:1 conversations need a reply, per account, with sender name + subject (inbox_status), excluding the owner's private 727 line for non-owner callers
  - Compose an outbound email and queue it for Nur's approval (draft_email), with recipient resolved from contacts/donors/team; nothing auto-sends
  - The PAGE (not the bot) lets Nur manually send an email reply (sendReply server action -> lib/email.sendEmail from the thread's account, with Studio/Library attachments), send an AI-drafted reply that for email channel actually sends from sasa@nisria.co (aiReply server action), close a thread, and pre-fill a donor draft via /api/donor-draft
  - View the original source message behind any record via /api/message?id=
- **CANNOT do (why):**
  - Bot-driven reply to an inbound 1:1 email/WhatsApp message (answer a specific conversation in the inbox) — _There is no reply_to_message / answer_inbox tool in SMART_TOOLS. The only reply paths are the page's sendReply and aiReply server actions (human-clicked in /inbox), and the WhatsApp worker (lib/agents/sasa via /api/whatsapp/worker) for inbound DMs. The Smart-Mode bot can only draft_email to a fresh recipient, it cannot pull up and reply to a thread by message id._
  - Mark an inbox conversation as replied / closed / read from chat — _closeThread and the status='replied' update live only in app/inbox/actions.ts as page server actions. No close_thread / mark_handled tool exists in SMART_TOOLS, so the bot cannot triage the inbox status column it can read via inbox_status._
  - Send a WhatsApp reply to a 1:1 inbound conversation by thread — _message_person sends a fresh WhatsApp to a resolved name/number (24h-window-aware) but is keyed by person, not by an inbound message/thread; it cannot be told 'reply to this conversation'. The messages.channel CHECK allows 'whatsapp' and the inbox renders WhatsApp threads, but no tool closes the loop from a specific inbound message._
  - Add a Studio/Library attachment to a bot-drafted email — _sendReply (page) resolves attachments via lib/email-attachments, but draft_email composes body text only and queues to approvals with no attachment field. No attach capability in the tool schema._
- **GAPS → resolve:**
  - [medium] No tool to reply to / close a specific inbound conversation from chat → Add a gated reply_to_message tool (input: contact_id/message_id, body) that drafts a reply and queues it via the existing email_reply approval path (reuse queueApproval + createIntent send_email), plus a mark_handled tool that flips messages.status to replied/closed. Owner/admin only.
  - [low] draft_email cannot attach a document → Extend draft_email schema with an attach hint (doc title fragment) and resolve via resolveAttachments before queueing the approval, mirroring sendReply.

### /outreach
- **DB tables:** donors, contacts, content_posts, outreach
- **Tools:** none
- **Permissions:** Outreach is operator-only: the page redirects to /login if getCurrentUser() is null, and both server actions re-check getCurrentUser(). There is no team-tier access (not a WhatsApp/group surface at all). Crucially there is NO approval gate on the mass send: sendOutreach delivers immediately from sasa@nisria.co (unlike draft_email/draft_thank_you which are gated), the only guardrail is the human click and the SEND_CAP=50 ceiling. No per-bot autonomy applies because no tool reaches it.
- **CAN do:**
  - The PAGE lets Nur compose and mass-send a branded email blast to donors, contacts, or both (sendOutreach server action), with {{first_name}} merge, dedupe by email, capped at SEND_CAP=50 per click, sent sequentially from sasa@nisria.co via lib/email.sendEmail
  - Send a single test copy to the logged-in user's own inbox (sendTest)
  - See live deduped recipient counts per audience (getRecipientCounts)
  - Each blast is logged to content_posts and emits an outreach.sent event
- **CANNOT do (why):**
  - Bot-driven mass outreach / newsletter send — _sendOutreach and sendTest are 'use server' actions in app/outreach/actions.ts invoked only from the Composer UI. There is NO outreach/blast tool in SMART_TOOLS, so Sasa cannot compose or trigger a mass send from Smart Mode at all. draft_email is strictly one recipient and goes to approvals, not the outreach blast path._
  - Read/query recipient counts or past blasts from chat — _No tool surfaces getRecipientCounts or the content_posts outreach log. list_campaigns reads campaigns, not outreach blasts. The bot has no read into who is on the outreach audience or what was last sent._
  - Manage the CSR/partner outreach pipeline (public.outreach table: stage, owner, channel) — _The outreach table (stage='identified'... pipeline) has no Sasa tool and no API route in the Comms set; it is orthogonal to the mass-send page and entirely unmanaged by the bot._
  - Schedule an outreach send for later — _sendOutreach fires immediately and synchronously within the serverless wall-clock; content_posts has scheduled_for but the outreach path always writes posted_at=now. No scheduling tool or cron for outreach exists._
- **GAPS → resolve:**
  - [high] No Sasa tool for the outreach blast (compose/send/schedule a newsletter) → Add a gated draft_outreach tool that composes the blast body, resolves the audience via gatherRecipients, and queues a single bulk approval (new approvals kind='outreach_blast') the worker fans out through sendEmail with the SEND_CAP honored. Keep it admin-only and gated, since a 50-recipient auto-send is far higher-stakes than a 1:1 draft.
  - [low] No read into outreach audience size or blast history from chat → Add a read tool outreach_status returning deduped audience counts (donors/contacts) and the last N content_posts where channels contains 'outreach'.
  - [medium] public.outreach CSR/partner pipeline is unmanaged → If this pipeline is still in use, add list/advance tools (e.g. list_outreach, advance_outreach_stage) mapped to the outreach table; otherwise document it as deprecated.

### /groups
- **DB tables:** messages, contacts, team_members, jobs, bot_status, tasks, beneficiaries
- **Tools:** post_to_group [C-queued], group_activity [R], member_activity [R], create_task / complete_task / reopen_task / add_beneficiary / add_inventory_item [CRU]
- **Permissions:** Two-layer gating. (1) Surface: any group message is forced role='team' (lib/agents/sasa.ts runSasa line 378), so the toolset is filtered to TEAM_TOOL_NAMES (create_task, complete_task, reopen_task, add_beneficiary, add_inventory_item, team_detail, lookup_contact, list_campaigns, remember_fact, calendar tools). post_to_group, group_activity, member_activity are NOT in that set, so only the admin/owner/founder 727 line can post to or read groups. (2) Inside runRead, group_activity and member_activity additionally hard-refuse tier='team' as a backstop; team_detail hides pay, lookup_contact restricts to colleagues, list_campaigns hides money, find_beneficiary hard-refuses team. (3) Delivery: the portal is one-way to groups, post_to_group only QUEUES a jobs row; the separate Railway userbot (x-group-secret auth on /api/group/outbox + /api/group/ingest + /api/group/link) is the sole sender and holds the group session. Autonomous in-group replies are suppressed (ingest returns reply:''); only operator-directed posts deliver. Owner-private (Taona 727) reads stay walled via viewerIsOwner.
- **CAN do:**
  - Read group chatter and the open/overdue tasks per group, or across all groups (group_activity), admin only
  - Read one team member's workload and recent group messages (member_activity), admin only
  - Queue a message for delivery into a named team WhatsApp group via the group bot (post_to_group); operator-directed posts always deliver even though the bot stays silent autonomously
  - The PAGE renders each group WhatsApp-style (owner right, others left, date dividers, search) via /api/groups/messages, and lets Nur post (GroupChat) and link the bot via a live QR (GroupLink -> /api/group/link)
  - In-group capture (via /api/group/ingest running runSasa team-tier): turn a team member's report into a task, complete/reopen their task by phone-exact identity, log a beneficiary as an under_review case (casesIntake), ingest dropped PDFs/photos into the library, attach case photos
  - Daily batched group digest of due/overdue tasks @mentioning assignees (/api/group/digest, cron), idempotent per day
  - Bot-down alerting: if the group bot is banned/logged_out, operators get one urgent 727 text (/api/group/link)
- **CANNOT do (why):**
  - Read a specific group's full thread from chat (vs the recent-window summary) — _group_activity caps at ~25-40 recent messages; the full WhatsApp-style thread is served only to the PAGE via /api/groups/messages. No tool fetches an arbitrary group's complete history for the bot, only search_history (keyword) touches it._
  - @mention a specific person reliably / direct-message someone via their group — _post_to_group accepts free text that 'may @mention a person' but there is no structured mention resolution against team_members (unlike the digest's firstName mentions). The bot cannot guarantee a real WhatsApp mention; message_person reaches a person 1:1 but only inside the 24h window, not through their group._
  - Create / rename / leave a WhatsApp group, or list which groups exist, from chat — _Groups are discovered passively from messages.account; there is no group registry table and no tool to enumerate or manage groups. The link/unlink flow is the userbot's QR only (/api/group/link)._
  - Run the group digest on demand from chat, or post a digest to a chosen group now — _/api/group/digest is a cron/secret-gated route with no SMART_TOOLS wrapper, so Sasa cannot trigger or preview a digest conversationally._
  - Team member reading donor/finance/beneficiary detail in a group — _Intentionally walled: a group is forced role='team' (sasa.ts line 378), tools are filtered to TEAM_TOOL_NAMES, and group_activity/member_activity/find_beneficiary hard-refuse tier='team'. This is a guardrail, not a gap, but it means no Comms read beyond tasks/roster/campaign-names is possible in-group._
- **GAPS → resolve:**
  - [medium] No structured @mention / target-a-person-in-group tool → Add a mention-aware variant or a target param to post_to_group that resolves a name to a team_members phone and emits a proper WA mention payload in the group.send job for the userbot to render.
  - [low] No tool to read a full group thread or list groups from chat → Add list_groups (distinct account where sender_type='group') and group_thread(group, limit) read tools, admin only, reusing the groups/messages query.
  - [low] Cannot trigger or preview the daily group digest conversationally → Add a run_group_digest action tool (admin only) that calls the digest runner for one group or all, returning what was queued.
  - [low] Bot-bound: portal cannot deliver to a group if the Railway userbot is offline → This is the deliberate one-way architecture; resolution is operational (re-link via QR). Surface queue depth + bot heartbeat (bot_status group_poll) in a read tool so Sasa can tell Nur a post is stuck rather than silently queuing.

### /workspace
- **DB tables:** messages, contacts, team_members, tasks, events
- **Tools:** inbox_status [R], create_task [C], message_person [C], draft_email [C-gated]
- **Permissions:** /workspace runs as the logged-in operator via getCurrentUser (founder Nur or builder Taona), both full-trust. Workspace doctrine (app/workspace/CLAUDE.md) enforces humans-only thread filtering and account-correct sending. Sasa's inbox_status read applies the owner-private wall for non-owner viewers (ownerContactIds excludes Taona's 727 line). No team-tier access to Workspace.
- **CAN do:**
  - Sasa can read which conversations need a reply (inbox_status, PII-walled for non-owner via ownerContactIds), create/assign tasks (create_task), send a direct WhatsApp message (message_person), and queue a gated email draft (draft_email)
  - The Workspace page itself (server actions, not Sasa tools) sends chat (email actually sends from sasa@, other channels queued), assigns tasks, and runs sasaDraft to pre-draft a reply
- **CANNOT do (why):**
  - Send a Workspace chat reply as the operator (sendChat) from Sasa — _sendChat is a /workspace server action with no Sasa tool wrapper; Sasa's message_person sends a fresh WhatsApp message but cannot reply-in-thread on an arbitrary channel or send email directly (email is always gated via draft_email)_
  - Trigger a Sasa pre-draft (sasaDraft) for a thread via a tool — _sasaDraft is invoked only by the Workspace UI; there is no tool to ask Sasa to pre-draft a specific thread's reply from Smart Mode_
  - Mark an inbound message read/replied/archived — _messages.status is updated only inside sendChat and the agents tick; no Sasa tool can change a message's status_
  - Open or manage Workspace tabs / contact profiles — _Browser-OS tab state is pure client UI; no DB-backed tool, so Sasa cannot drive it_
- **GAPS → resolve:**
  - [medium] No Sasa tool to reply-in-thread or change message status → Add a reply_in_thread tool (channel-aware, email actually sends gated, WhatsApp via message_person) and a mark_message tool wrapping the status updates
  - [low] sasaDraft pre-draft not reachable from the brain → Expose draft_thread_reply(contactId) as a read-style tool returning suggested text


## INTAKE AGENT
**Owns:** /cases, /filing

### /cases
- **DB tables:** beneficiaries, assets
- **Tools:** add_beneficiary [C], find_beneficiary [R]
- **Permissions:** Case creation happens on the group (team-tier) surface where add_beneficiary is allowed and the casesIntake context forces a never-auto-accept CASE rather than an accepted beneficiary — this is the core safeguarding guarantee. All case lifecycle progression (stage change, approve, decline, reopen) is admin/portal-only and gated to Nur; no agent path exists. Case reads via find_beneficiary are admin-only (team tier hard-refused), so a team member can create a case but never read the case board.
- **CAN do:**
  - Auto-log a potential beneficiary mentioned in a cases-intake WhatsApp group as a case for review (add_beneficiary with casesIntake context): status inactive, intake_stage under_review, tagged with the source group, with photo claiming and per-group/per-name dedup
  - Read a case's basic facts via find_beneficiary (admin), since cases live on the beneficiaries table
- **CANNOT do (why):**
  - Move a case between intake stages (under_review <-> pending_funds <-> prospect) — _setCaseStage is a portal action; no Sasa tool advances intake_stage. update_beneficiary cannot set intake_stage at all._
  - Approve a case into an active beneficiary — _approveCase (portal) clears intake_stage, flips status to active, and writes the org_fact grounding; no Sasa tool performs this one-update approval._
  - Decline a case (with a reason) or reopen a declined case — _declineCase/reopenCase are portal-only; intake_stage='declined' and the triage_notes append are unreachable from chat._
  - Set/read triage_notes, referred_by, case_channel on a case — _No tool reads or writes these case-specific columns; update_beneficiary ignores them._
  - Create a case from the web console / admin DM (outside a group) — _casesIntake is only set on the group surface; an admin typing in Smart Mode has no casesIntake flag, so add_beneficiary creates an ACCEPTED beneficiary, never a case — there is no add_case tool._
- **GAPS → resolve:**
  - [medium] Entire case lifecycle (stage/approve/decline/reopen) has no agent tools → Add admin-only, gated tools advance_case (stage), approve_case, decline_case(reason), reopen_case mirroring app/cases/actions.ts, each scoped to rows with intake_stage NOT NULL and emitting the existing events.
  - [low] No add_case tool for the console/DM surface → Add an add_case tool (or an as_case flag on add_beneficiary) so an admin can intentionally create an intake_stage='under_review' record.
  - [low] No read/write of triage_notes, referred_by, case_channel → Extend a case_detail read and a case-update tool to cover triage_notes/referred_by/case_channel.

### /filing
- **DB tables:** documents, ingest_batches, ingest_items, assets, agent_memory
- **Tools:** search_documents [R], file_document [R]
- **Permissions:** file_document and search_documents are admin/operator-tier only: neither is in TEAM_TOOL_NAMES (lib/agents/sasa.ts:37), so team-tier group chat cannot search or file documents. The 727 DM is operator-only: whatsapp/worker rejects any non-admin sender (operatorOf role !== 'admin', route.ts:84) so only Nur (founder) and Taona (owner) reach these tools. drive/extract, ingest/process, documents/* search routes are agent/cron-secret gated (x-agent-secret or Bearer CRON_SECRET); filing/file/[id] preview is session-gated (middleware NOT bypassed) so document bytes only stream to the logged-in founder. No PII wall is applied to documents specifically (unlike beneficiaries/team pay), so any filed bank statement or sensitive PDF is admin-visible without redaction. Owner-vs-founder privacy wall does not touch documents.
- **CAN do:**
  - search_documents: full-text + title search across the documents table, returns title, doc_type, folder, doc_date, summary (lib/smart-tools.ts:308-314)
  - file_document with no folder: confirm where a matched document is currently shelved (lib/smart-tools.ts:636-640)
  - file_document with folder: move/recategorize matched documents into one of legal/finance/programs/events/media/branding/people/reports/general, optionally set brand, and promote the linked stored asset to that shelf; emits document.filed (lib/smart-tools.ts:642-655)
  - Auto-file on arrival: a PDF/image/doc sent to the 727 (whatsapp/worker) or dropped in Settings is read (local-first extract-text, then Claude vision fallback), classified+routed by lib/ingest, indexed into documents (indexDocument) so it becomes searchable, and shelved in the Library
  - Auto-extract Drive: the daily cron mirrors the whole Drive into documents (metadata + doc_type + folder classification)
  - Lazy deep-text: opening a Drive doc in the reader backfills extracted_text so it becomes full-text searchable thereafter
- **CANNOT do (why):**
  - Trigger a Drive re-extraction / sync on demand from chat — _app/api/drive/extract exists and runs on cron, but no SMART_TOOLS entry maps to it; Sasa cannot say 'pull in the new Drive files now'_
  - Trigger/drain the ingest worker or report ingest batch status from chat — _app/api/ingest/process and lib/ingest.batchForReview/latestOpenBatch exist, but no tool exposes batch progress or 'what is still waiting for review'; the review gate lives only in the Settings UI (confirmBatch server action)_
  - Delete or unfile a document — _documents rows are upserted/updated but there is NO delete path anywhere (no route, no tool, no FileCard button). A mis-filed or duplicate document cannot be removed by Sasa or in the UI_
  - Set or correct a document's doc_date — _documents.doc_date is a real column, is shown/ordered in search_documents and used by the Filing UI, but NO intake path (drive/extract, ingest indexDocument) ever populates it and no tool updates it; it is permanently null_
  - Read out a document's full contents in chat — _search_documents returns only title/summary; there is no get_document_text tool. The full extracted_text is reachable only via the web reader (documents/content), so Sasa cannot quote the body of a filed PDF on the 727_
  - Rename a document or edit its summary/title — _file_document only writes folder + brand; title and summary have no tool, so a bad auto-title from ingest cannot be fixed by chat_
  - Move a document into a custom Drive-area folder — _file_document is hard-capped to 9 Library shelves; Drive areas like 'Admin & Compliance', 'Grants & Fundraising', 'Team & HR' produced by drive/extract categoryFor are not selectable targets_
  - File a brand-new document by URL/link from chat — _ingest accepts file uploads, voice, text, and whatsapp attachments, but there is no link/URL channel; a shared Drive/Dropbox link in a 727 message is not fetched or filed_
- **GAPS → resolve:**
  - [low] No tool to trigger Drive extraction or report ingest review status from chat → Add a sync_drive read/action tool (POSTs /api/drive/extract with the agent secret) and an ingest_status read tool wrapping latestOpenBatch/batchForReview so Sasa can say 'I pulled in 12 new files, 3 are waiting for your review'
  - [medium] doc_date is never populated → In lib/ingest.classifyItem, have the Haiku router also return doc_date (it already reads the text) and write it in indexDocument; backfill existing rows from extracted_text on lazy open
  - [low] No delete/unfile capability for documents → Add a delete_document tool (soft-delete or hard-delete with an event) + a route, mirroring delete_payment's recoverable pattern; expose a remove action on FileCard
  - [low] No get_document_text tool to quote a filed document in chat → Add a read_document tool that returns extracted_text (capped) for a matched title, lazily extracting via lib/extract-text if empty, so the 727 can answer 'what does the constitution say about X'
  - [low] No tool to fix a document's title/summary → Extend file_document (or add rename_document) to optionally set title/summary, humanized, emitting document.filed
  - [medium] 727 DM cannot run the cases (potential-beneficiary) intake; only the group bot can → Decide the desired 727 behavior and, if cases should be loggable from the DM, thread a casesIntake flag (or a distinct log_case tool) into runSasa from whatsapp/worker so an operator can forward a referral as a case for review
  - [medium] No link/URL ingest channel → Add a 'link' channel to IngestInput that fetches the URL (or resolves a Drive file id) before classify; reuse extract-text/drive fetchers
  - [high] Filed sensitive documents (bank statements, IDs) have no PII redaction or access tier → Add a sensitivity tag at classify time (bank_statement/contract/registration) and gate search_documents/preview accordingly, or at minimum confirm only-owner can open finance docs; align with the privacy wall in lib/privacy.ts


## KNOWLEDGE AGENT
**Owns:** /grants, /library, /legal, /reports, /settings

### /grants
- **DB tables:** grant_applications, grant_opportunities, jobs, agent_memory
- **Tools:** list_grants [R], prepare_grants [U-via-job]
- **Permissions:** Both list_grants and prepare_grants are admin-tier only: neither is in TEAM_TOOL_NAMES (lib/agents/sasa.ts:37), so the team group bot never sees grants, funding figures, or the prepare action. No PII wall needed (no children/donor data), but grant amounts are money figures the team must not see, enforced by tool exclusion. API refresh/prepare routes are machine-only (AGENT_TICK_SECRET / CRON_SECRET).
- **CAN do:**
  - List grant opportunities found by the hunter (title, funder, relevance tier/score, close_date), top 20 unpursued by score.
  - List grant applications in the pipeline (funder, program, status, amount_requested, deadline), top 40 by deadline.
  - Kick off background preparation of all un-prepared applications (enqueues jobs, fires the worker, lands packages in Prepared/review). Nothing is submitted.
  - Ground each prepared package in the org Brain (org_fact/brand_voice recall) and, when a link exists, fetch the funder page (lib/agents/grant.ts).
- **CANNOT do (why):**
  - Pursue/convert a specific opportunity into a pipeline application from chat — _pursueOpportunity() exists only as a /grants page server action (app/grants/actions.ts), not exposed as a Sasa tool. The bot can list opportunities but cannot act on a single one._
  - Add a brand-new grant application by funder/program/amount/deadline from chat — _addGrant() is a page-only server action; no add_grant SMART_TOOL. Bot can only prepare what already exists in the pipeline._
  - Advance a grant's status (submit, mark won/lost) or set amount_awarded from chat — _advanceStatus()/declineGrant() are page-only server actions; no tool maps to the status pipeline or amount_awarded, so the bot cannot move a grant past 'review' or record an award._
  - Decline / set aside a prepared grant from chat — _declineGrant() exists only as a page server action; no Sasa tool reaches it._
  - Read a single grant's full prepared package (notes body) on demand — _list_grants does not select the notes column; it returns only headline fields. The full package is visible only in the GrantPeek UI, not retrievable by the bot._
  - Prepare one specific grant by name (vs all) — _prepare_grants takes no input and always batches all un-prepared; prepareGrant(id) is page-only. Bot cannot target a single funder._
  - Trigger a fresh opportunity hunt / refresh on demand — _the refresh route is cron/agent-secret gated only; no tool and no UI button enqueues it interactively._
  - Auto-fill or auto-submit to a funder's portal — _Explicitly out of scope per app/grants/actions.ts comment ('auto-submit via browser is the next phase'); v1 only prepares the written package._
- **GAPS → resolve:**
  - [low] No tool to pursue a single opportunity into the pipeline → Add a pursue_opportunity SMART_TOOL (input: opportunity id or funder/title match) calling the existing pursueOpportunity logic; admin-tier only.
  - [low] No tool to add a grant application from chat → Add an add_grant tool (funder, program, amount_requested, deadline) reusing app/grants/actions.ts addGrant.
  - [medium] No tool to advance grant status or record an award → Add an update_grant_status tool (match by funder, status enum, optional amount_awarded with currency) wrapping advanceStatus, with Currency-law guard on amount_awarded.
  - [low] Bot cannot read a prepared package body → Add a read_grant tool (or a kind to list_grants) returning the notes package for one matched grant, admin-tier.
  - [low] No interactive opportunity-hunt trigger → Add a refresh_grants tool that internal-fires /api/grants/refresh with the agent secret, or a UI button; surface counts back.

### /library
- **DB tables:** assets, Supabase Storage bucket 'assets', agent_memory, documents
- **Tools:** file_document [R]
- **Permissions:** file_document IS in TEAM_TOOL_NAMES? No — it is admin-only (not listed in the TEAM set at sasa.ts:37). Assets can carry consent_required (child-safeguarding); the Library page shows a 'Private' badge for consent_required assets. There is no team-tier asset access at all, so the PII/consent wall is enforced by the team toolset simply excluding any asset tool. Storage bucket is private + RLS-gated (page comment).
- **CAN do:**
  - Confirm which Library shelf a filed document currently lives on (folder), matched by a title fragment.
  - Move/recategorize a matched document into a shelf (legal/finance/programs/events/media/branding/people/reports/general) and optionally set its brand, also promoting the backing asset so it appears on that shelf.
  - Retrieve uploaded assets as memory when composing (assets become agent_memory kind='asset' at upload time, recalled by other tools indirectly).
- **CANNOT do (why):**
  - Upload a file / ingest a new asset from chat — _uploadAsset() is a page-only server action requiring a multipart File; no SMART_TOOL accepts file bytes. Files arriving via WhatsApp are auto-ingested by a separate pipeline, but the bot has no upload tool._
  - Caption or re-caption an image, or set a description — _captionImage runs only inside uploadAsset; no tool re-runs ingestion or edits assets.description._
  - Flag/clear beneficiary consent on an asset (consent_required, consent_on_file) — _consent_required is auto-set at upload from a BENEFICIARY: caption prefix; no tool reads or toggles consent_on_file / usage_rights, so the bot cannot manage the consent wall._
  - List or search assets directly by brand/type/shelf — _There is no list_assets or search_assets tool. search_documents queries the documents table, not assets; an upload-only asset (a logo, a past post) with no documents row is invisible to the bot._
  - Delete or rename an asset — _No asset write tool beyond file_document's folder/brand patch; no delete/rename path exists._
  - Connect / import a Google Drive folder — _The Library UI shows a 'Google Drive — connect / Wiring pending OAuth' card (app/library/page.tsx); the OAuth import is unbuilt and no tool or route backs it._
- **GAPS → resolve:**
  - [medium] No asset upload/ingest tool → Add an ingest_asset tool that accepts an already-stored storage_path or a WhatsApp media id and runs the uploadAsset ingest path (classify, caption, remember, consent flag).
  - [low] No way to list/search the asset library from chat → Add a list_assets/search_assets tool (filter by brand, type, tag/shelf) returning titles + signed URLs; respect consent_required by withholding private images from team tier.
  - [medium] No consent management tool → Add a set_consent tool (mark consent_on_file true with usage_rights) gated to admin, so beneficiary media can be cleared for use; surfaces the safeguarding wall to the agent.
  - [high] Google Drive import is a dead UI affordance → Build a Drive-folder import route reusing lib/drive.ts (service account already exists), feeding files through the same ingest + memory, and a connect_drive_folder tool.

### /legal
- **DB tables:** documents, agent_memory
- **Tools:** search_documents [R], file_document [R]
- **Permissions:** search_documents IS in TEAM_TOOL_NAMES (sasa.ts:153) — the team group bot CAN search filed documents. file_document is admin-only. Legal/compliance docs are org-level (not child PII), so no beneficiary wall applies; however the team-tier search has no folder restriction, meaning a team member could surface a sensitive legal/contract document title via search_documents (a soft over-exposure). The content/preview API routes are session-gated to the logged-in founder only.
- **CAN do:**
  - Search filed compliance/legal documents (constitution, bylaws, IRS determination letter, CBO registration, TCC, leases) by title or full text and return summaries + dates.
  - Confirm a legal document's current shelf and move/recategorize it into the 'legal' shelf.
  - Recall the authoritative entity facts (EIN 92-2509133, 501(c)3 status, Kenya CBO reg) from the Brain when grounding any answer, via the always-on org_fact recall + humanize ORG_FACTS substitution.
- **CANNOT do (why):**
  - Read/answer from the structured entity facts as a tool (status, EIN, clause, addresses, banking) — _The US/KE entity facts and the compliance OBLIGATIONS list are HARD-CODED constants in app/legal/page.tsx, not in any table the bot queries. The bot relies on org_fact recall, which may or may not carry every field; there is no read_entity / legal_status tool._
  - Track or remind on recurring compliance obligations (Form 990, KRA TCC, CBO annual returns, land rates) — _OBLIGATIONS is a static array in the page with cadence text only. No table, no due dates, no calendar entries, and no tool — so the bot cannot tell Nur when a filing is due or that one is overdue._
  - Open / read a specific legal document's full text in conversation — _The /api/documents/content route exists but no SMART_TOOL calls it; search_documents returns only a 160-char summary, never the body._
  - Add a new compliance document record from chat (vs auto-ingest) — _No create-document tool; documents rows are created only by the Drive/WhatsApp ingest pipeline. file_document can only move existing rows._
  - Set or correct a document's doc_type, doc_date, or summary — _file_document patches only folder + brand; no tool edits doc_type/doc_date/summary, so a misclassified registration cannot be fixed by the bot._
- **GAPS → resolve:**
  - [medium] Entity facts and obligations are page-hardcoded, not data the bot can read or remind on → Move the entity facts into agent_memory org_facts (or a compliance table) and the OBLIGATIONS into the calendar/payments-style recurring model so query_calendar surfaces them; add a compliance_status read tool.
  - [medium] No reminders for recurring filings (990, TCC, CBO returns) → Seed dated obligation rows (recurring) and let the existing reminders cron + query_calendar pick them up; optionally a check_compliance tool.
  - [low] Bot cannot read a legal document's full text → Add a read_document tool that calls the documents/content logic (lazy-extract + return text) for one matched doc, admin-tier.
  - [low] Team-tier search_documents has no sensitivity filter → In runRead, when tier==='team', exclude folder='legal' and doc_type in (contract) or restrict to a safe allowlist of folders.
  - [low] No tool to correct a document's classification (doc_type/doc_date/summary) → Extend file_document or add an edit_document tool to set doc_type/doc_date, admin-tier.

### /reports
- **DB tables:** donations, payments, invoices, studio_documents, assets, agent_memory
- **Tools:** finance_summary [R], query_donations [R]
- **Permissions:** finance_summary and query_donations are admin-only (NOT in TEAM_TOOL_NAMES) — all money figures are walled from the team group bot. The report narrative explicitly never invents numbers (every figure passed in) and KES/USD are never mixed (Currency law). The studio/pdf route is the only Knowledge route NOT secret-gated machine-only but is session-gated to the founder. No child PII surfaces in reports.
- **CAN do:**
  - Answer the headline finance figures a report is built from: monthly money-in vs money-out and upcoming payments (finance_summary), and donation totals over any window (query_donations).
  - (Page only, not bot) generate a branded funder/board cover narrative grounded in the Brain, build a configurable report (type, window, sections, brand) and an invoice, export to PDF, and persist to studio_documents + assets + Library.
- **CANNOT do (why):**
  - Generate a funder or board report (narrative + figures + PDF) from chat — _generateNarrative / generateReport are app/reports/actions.ts server actions driven by ReportBuilder/ReportNarrative UI; there is NO report-generating SMART_TOOL. The bot can quote figures but cannot produce the report document._
  - Build / issue an invoice to another company from chat — _issueInvoice and draftInvoiceFromText are page-only server actions wired to InvoiceBuilder; no invoice tool exists for the bot._
  - List or look up issued invoices — _listInvoices is called only by the Reports page; the invoices table has no read tool, so the bot cannot tell Nur what was billed or to whom._
  - Export an existing report/document to PDF on demand — _/api/studio/pdf is reachable from the UI (PreviewLink) but no tool invokes it; the bot cannot hand back a PDF._
  - Report the Givebutter→Kenya flow (withdrawn USD vs KES paid out) figure — _That flow statement is computed inline on the Reports page from payments category='payout'/method='givebutter' vs category='kenya'/method='mpesa'; finance_summary does not expose it and no tool does, so the bot cannot state the flow numbers._
  - Generate the grant-ready document set (org profile, program budget, impact one-pager, board sheet) — _generateGrantReadyDoc is driven only by the studio.generate worker/queue (lib/grant-docs, app/studio/actions.ts); there is no tool to enqueue or trigger it from chat._
- **GAPS → resolve:**
  - [medium] No tool to generate a report from chat → Add a generate_report tool (type, brand, window, sections) that enqueues/calls generateReport and returns the studio_documents id + a PDF affordance; admin-tier, money-walled.
  - [medium] No tool to draft/issue or list invoices → Add draft_invoice (wraps draftInvoiceFromText), issue_invoice (wraps createInvoice), and list_invoices (reads invoices table) tools, admin-tier.
  - [low] Bot cannot surface the Givebutter→Kenya flow figures → Add a flow_statement read tool (or extend finance_summary) computing withdrawn USD vs KES/USD paid out from payments, keeping currencies unmixed.
  - [low] No on-demand PDF export tool → Add an export_pdf tool that, given a matched studio_documents/report title, returns the /api/studio/pdf href as an affordance.
  - [low] No tool to trigger the grant-ready document set → Add a generate_grant_docs tool that enqueues studio.generate jobs for the four GrantDocKinds and fires the worker, admin-tier.

### /settings
- **DB tables:** email_accounts, connector_registry, agent_memory, org_profile, studio_documents, brain_entries, brand_logos, invoices? no, assets, ingest_batches, ingest_items, extraction_staging
- **Tools:** remember_fact [CU], file_document [RU], search_documents [R], prepare_grants [C]
- **Permissions:** All /settings server actions run behind the login wall (middleware) with no per-role gate; effectively founder+builder admin. remember_fact's private lane is owner-only (ctx.rank==='owner'). brain_entries/org_profile are the One-brain grounding source recall() always loads. Team-tier never reaches Settings.
- **CAN do:**
  - Sasa can remember/correct durable org facts into the Brain (remember_fact), confirm and move documents into Library folders (file_document), and search filed documents (search_documents)
  - The Settings PAGE (server actions, not Sasa tools) edits the Brain onboarding sections (saveBrainSection, org_profile), brand voice, monthly goal, email accounts (addAccount), signatures, logos, integrations (Zanii), grant-doc generation, and runs the ingest pipeline (ingestFiles/ingestText/reviewBatch/confirmBatch)
- **CANNOT do (why):**
  - Edit Brain onboarding sections or brand voice via Sasa — _org_profile and brain_entries are written only by /settings server actions (saveBrainSection, addBrainEntry, saveVoiceToSection); remember_fact only writes the agent_memory fact lane, not the structured org_profile sections_
  - Add or toggle an email account, edit a signature — _email_accounts is mutated by addAccount/saveSignature server actions; no Sasa tool exists_
  - Run the ingest pipeline (drop files, review, confirm a batch) via Sasa — _ingestFiles/ingestText/reviewBatch/confirmBatch are server actions over ingest_batches/ingest_items/extraction_staging; Sasa has no tool to drive ingestion (it only sees the already-filed documents)_
  - Generate the standard grant documents (studio_documents) — _queueGrantDoc/queueAllGrantDocs are Settings server actions; prepare_grants prepares applications, not the GRANT_DOC_SPECS standard docs_
  - Set monthly goal or save Zanii integration config — _saveMonthlyGoal/saveZaniiConfig are Settings-only server actions with no tool path_
- **GAPS → resolve:**
  - [medium] Brain/voice/accounts/ingest are all human-only Settings surfaces with no bot path → Add tools: edit_brain_section (org_profile), set_brand_voice (agent_memory brand_voice), and an ingest_intake tool to start/confirm a batch; gate to admin
  - [low] Standard grant document generation not bot-triggerable → Add generate_grant_doc(kind) tool wrapping queueGrantDoc


## CONTENT AGENT
**Owns:** /content, /studio

### /content
- **DB tables:** content_posts, brands, assets
- **Tools:** none
- **Permissions:** No tier gating is even reachable because no Content tool exists. If a tool were added: the team tier (TEAM_TOOL_NAMES in lib/agents/sasa.ts) does NOT include any content/post tool, so by default it would be admin/owner+founder only (Nur admin tier, web console). Note content captions are public-facing marketing copy with no PII, so a content tool would be safe to expose to team tier, but currently it is moot. Brand selection is constrained to nisria|maisha|ahadi.
- **CAN do:**
  - NOTHING via Sasa tools. There is no SMART_TOOLS entry that reads or writes content_posts. The entire /content surface is driven only by server actions in app/content/actions.ts triggered from the page UI, not by the agent.
  - (UI-only, not bot) Nur can compose a post (composePost): pick brand, channels (instagram/facebook only), optional scheduled_for, body text, attach one image from the Library; it inserts into content_posts (status scheduled if dated else draft) and files a copy into assets.
  - (UI-only, not bot) aiDraft: Claude writes a caption from a brief, humanized, then inserted as a content_posts row with created_by='AI' and filed to Library.
  - (UI-only, not bot) setPostStatus: advance a post draft->scheduled or scheduled->posted (sets posted_at).
  - (UI-only, not bot) generateGraphic: a Canva placeholder that only emits a 'canva_connect_pending' event because CANVA_API_KEY is unset; renders no graphic.
- **CANNOT do (why):**
  - Sasa drafting a social caption by chat ('draft an Instagram post about the safe house') — _aiDraft exists as a /content server action but there is no smart-tool wrapping it; the agent has no tool to create or draft a content_posts row._
  - Sasa scheduling or queueing a post ('schedule that post for Friday') — _composePost/setPostStatus are page-only server actions; no smart-tool writes content_posts.status or scheduled_for._
  - Sasa listing/reading the content pipeline ('what's in our content queue', 'what's scheduled to post') — _No read tool selects content_posts. query_calendar's description claims it surfaces 'scheduled content' but the unified calendar feed is the only path and there is no dedicated content read tool._
  - Actually publishing to Instagram or Facebook — _No social connector exists. lib/gateway.ts dispatch() has ONLY case 'email.send_email'; every other connector throws 'Connector not enabled yet'. The page itself states auto-publishing 'runs through n8n once each platform's posting API is connected'. A post marked 'posted' is a manual status flip, not a real publish. The schema even has a 'failed' status that nothing can set._
  - Generating a branded graphic/image for a post — _generateGraphic is a stub gated on CANVA_API_KEY (unset); it logs a pending note and renders nothing. No image-generation tool or connector exists._
  - Using post.title or attaching media via chat — _content_posts has a title column the UI never collects, and image attach is a Library-image radio in the form only; no agent tool exposes either._
- **GAPS → resolve:**
  - [low] No Sasa tool to draft/create a content post → Add a 'draft_post' / 'schedule_post' smart-tool that inserts into content_posts (brand, channels, body, scheduled_for, status) reusing the aiDraft caption path; add 'list_content' read tool over content_posts.
  - [high] No real social-publishing pipeline (Instagram/Facebook) → Add an 'instagram'/'facebook' (or 'meta') connector case in lib/gateway.ts dispatch() that calls the Meta Graph publishing API, plus a cron/worker that picks up scheduled content_posts, routes through createIntent (gated lane), sets posted_at or status='failed'. Then a publish smart-tool can ride the gateway.
  - [medium] Graphic generation never wired → Wire generateGraphic to Canva autofill (or an image model), upload result to assets, set content_posts.image_url; optionally expose as a tool.

### /studio
- **DB tables:** studio_documents, assets, memory/brain, jobs, action_intents/events
- **Tools:** none
- **Permissions:** No tier gating is reachable: no Studio smart-tool exists, so neither admin nor team can drive it via chat. UI access (/studio, /settings) is auth-gated by middleware. If exposed as a tool it should be admin/owner+founder only: Studio docs are grounded in org_fact and can contain financials (program_budget, board_sheet) and would breach the team money wall (FINANCE_GROUNDING strip + TEAM_TOOL_NAMES exclusion), so a Studio tool must NOT be added to TEAM_TOOL_NAMES. Generation worker is secret-gated (AGENT_TICK_SECRET / CRON_SECRET).
- **CAN do:**
  - NOTHING via Sasa tools. There is no SMART_TOOLS entry for studio document generation. search_documents reads the separate 'documents' table (filed/extracted docs), NOT studio_documents, so the agent cannot even retrieve a Studio-produced doc.
  - (UI-only, app/studio + StudioConsole) generateDocument: Nur drops up to 4 images + files + a prompt + brand, Claude (vision when images present, else text) composes the BODY HTML grounded in the org brain (recall org_fact+brand_voice), humanize() gate strips dashes/placeholders and stamps the real date+contact, brandWrap() wraps it in branded letterhead, output is saved to assets + studio_documents + brain.
  - (worker-only, app/api/studio/generate) generateGrantReadyDoc: builds one of 4 grant-ready docs (org_profile, program_budget, impact_onepager, board_sheet) from grantDocSpec, grounded in the brain, branded, persisted. Triggered from /settings GrantReadiness panel via queueGrantDoc -> jobs queue, drained by the worker. Always Nisria-branded.
  - (route, app/api/studio/pdf) Export any studio_documents row to a real PDF via headless Chrome (lib/pdf htmlToPdf), falling back to the branded .html download if Chrome cannot launch.
- **CANNOT do (why):**
  - Sasa generating a document by chat ('make a thank-you certificate for X', 'draft a cover letter for the STP funder') — _generateDocument is a page-only server action invoked by StudioConsole; no smart-tool calls it. The agent cannot trigger Studio composition._
  - Sasa generating a grant-ready doc by chat ('regenerate our org profile') — _generateGrantReadyDoc is reachable only via the jobs queue from /settings (queueGrantDoc) and the worker; there is no Sasa tool to enqueue studio.generate._
  - Sasa retrieving a Studio-produced document ('pull up the impact one-pager you made') — _search_documents queries the 'documents' table (folder/extracted_text), not studio_documents. Studio output is only discoverable through brain recall as a kind='asset' note, with no dedicated read tool._
  - Sasa exporting/sending a Studio doc as PDF ('email that document as a PDF') — _The /api/studio/pdf route exists and email.send_email can attach refs (parseAttachRefs resolves a Studio doc to PDF/HTML), but no Sasa tool generates a Studio doc or hands its id to draft_email's attach_refs; the bridge is not exposed as a tool._
  - Generating Maisha/AHADI grant-ready docs — _generateGrantReadyDoc hardcodes brandKey='nisria'. Free-form generateDocument supports all three brands but grant-ready set is Nisria-only._
- **GAPS → resolve:**
  - [medium] No Sasa tool to generate a free-form Studio document → Add a 'create_document' smart-tool (admin-only) that enqueues a studio.generate-style job (or calls generateDocument server-side for text-only prompts), returns the doc id + a /api/studio/pdf affordance. Long generations should ride the existing jobs worker, not block the chat turn.
  - [low] No read tool over studio_documents → Add a 'find_studio_doc' read tool (or extend search_documents to union studio_documents) returning title, doc_type, kind, created_at, and the pdf href.
  - [low] No tool to enqueue a grant-ready regeneration → Wrap queueGrantDoc in a 'regenerate_grant_doc' smart-tool keyed by kind, admin-only, with an affordance to the settings panel.
  - [low] Grant-ready docs limited to Nisria → Parameterize brandKey on generateGrantReadyDoc and the grant-doc job payload if Maisha/AHADI need their own funder packets.


## ORCHESTRATOR AGENT
**Owns:** /smart, /assistant, /dashboard (app/page.tsx), /agents, /launchpad

### /smart
- **DB tables:** donations, donors, payments, pending_actions, grant_opportunities, grant_applications, tasks, messages, team_members, beneficiaries, contacts, documents, agent_memory, campaigns, jobs, calendar_events, assets, events, approvals, action_intents
- **Tools:** query_donations [R], lookup_donor [R], newest_donor [R], finance_summary [R], list_grants [R], list_tasks [R], inbox_status [R], list_team [R], latest_gift [R], search_history [R], find_beneficiary [R], lookup_contact [R], team_detail [R], search_documents [R], list_learned [R], list_campaigns [R], group_activity [R], member_activity [R], query_calendar [R], check_conflicts [R], create_task [C], complete_task [U], reopen_task [U], update_task [U], delete_task [D], add_team_member [C], update_team_member [U], add_inventory_item [C], add_beneficiary [C], update_beneficiary [U], record_payment [C], update_payment [U], delete_payment [D], add_contact [CU], update_contact [U], remember_fact [CU], file_document [RU], prepare_grants [C], post_to_group [C], message_person [C], draft_thank_you [C-gated], draft_email [C-gated], create_event [C], move_event [U], delete_event [D]
- **Permissions:** Smart Mode web route (/api/smart) always runs full admin: it reads the signed cookie via getCurrentUser, maps builder->rank 'owner' (Taona, final say), founder->rank 'founder' (Nur), and passes no operatorRole, so role defaults to 'admin' and the FULL SMART_TOOLS set is offered (sasa.ts line 397). viewerIsOwner defaults true for the console, so the owner-private 727 wall (OWNER_PRIVATE_KIND, ownerContactIds) is only enforced on the WhatsApp team/founder paths, not the web console. remember_fact private:true is honored only when ctx.rank==='owner'. Team-tier (group/WhatsApp) is gated to TEAM_TOOL_NAMES and strips money/PII; that path is not the web /smart surface.
- **CAN do:**
  - Read live donations totals/lists with date+status+recurring filters (query_donations), resolve newest/named donor and lifetime value (lookup_donor/newest_donor/latest_gift)
  - Read money-in vs money-out for a month (finance_summary)
  - Read grant opportunities and applications pipeline (list_grants)
  - Read/list open tasks, inbox needing reply, active team roster, campaigns
  - Search past conversations (search_history), filed documents (search_documents), and learned brain facts (list_learned)
  - Read beneficiaries by name/program/region (find_beneficiary, admin only), look up any person's contact (lookup_contact), full team roster with pay (team_detail, admin only)
  - Read group activity and per-member activity, unified calendar window, and holiday/conflict checks
  - Create/complete/reopen/update/delete tasks; assign to a member; urgent-gate WhatsApp ping on high/overdue tasks
  - Add and update team members (pay requires explicit currency), add inventory items, add/update beneficiaries (no money fields), add/update contacts
  - Log a payment Nur already made (staged for yes over WhatsApp, direct on web), correct or delete an AI-logged payment
  - Remember/correct durable org facts (owner can mark private), confirm or move a document's Library folder
  - Trigger background grant preparation, post into a team WhatsApp group, message one person directly, draft (gated) a thank-you or email into Needs You
  - Create/move/delete calendar events with Google Calendar two-way sync
- **CANNOT do (why):**
  - Create or edit a donation record — _No create/update_donation tool; donations table is read-only to Sasa (only query_donations reads it); donation writes come from external Givebutter sync, not chat_
  - Create, edit, or report campaign goal/raised figures — _list_campaigns is read-only; no create_campaign/update_campaign tool exists, so Sasa cannot launch or adjust a fundraising campaign even though the campaigns table and /campaigns UI support it_
  - Submit a grant application or set funder/amount/deadline on grant_applications — _prepare_grants only enqueues prep jobs; there is no submit_grant or update_grant_application tool, and the route comment in agents page marks fundraising as partial_
  - Approve/reject an item in Needs You — _Sasa can only queue into approvals (draft_email/draft_thank_you); there is no approve_action/reject_action tool, approvals are resolved only via the dashboard UI/ApprovalCard_
  - Change an autonomy lane or toggle a connector — _autonomy_rules and connector_registry are mutated only by /agents server actions setLane/toggleConnector; no Sasa tool maps to these, so Sasa cannot tune its own autonomy_
  - Reconcile or read bank statement transactions — _bank_transactions table is never read or written by any SMART_TOOL; bank import is a separate pending_actions/route path, leaving Sasa blind to statement-level data_
  - Create/draft a content post or newsletter — _content_posts table has no tool; the Content agent is marked status:soon (not built) on /agents_
  - Create or send an invoice — _invoices table has no Sasa tool path; invoice generation (lib/invoice.ts) is not exposed as a tool_
  - Manage donor outreach sequences / lapsing-donor outreach — _outreach table has no tool; steward only drafts thank-yous, lapsing-donor outreach is explicitly 'next' on /agents_
  - List or update finance_insights — _finance_insights table has no read or write tool_
  - Edit org_profile / Brain onboarding sections or brand voice — _remember_fact writes agent_memory facts only; org_profile and brain_entries are edited solely via /settings server actions, with no Sasa tool_
  - Set a recurring task, reminder, or calendar event — _create_task and create_event each hold one date only; the system prompt explicitly states recurring is not yet supported_
- **GAPS → resolve:**
  - [medium] No approve/reject tool for the Needs You queue → Add a resolve_approval tool (approve|reject by id/title) that calls the gateway execute path, guarded to admin only
  - [medium] No campaign create/update or donation create tool → Add create_campaign/update_campaign (goal/dates/status) tools; keep donations read-only or add a gated record_donation
  - [low] No autonomy/connector control tool → Add set_autonomy_lane and toggle_connector tools (owner/founder gated) wrapping the existing setLane/toggleConnector logic
  - [high] No bank reconciliation tool over bank_transactions → Add query_bank_transactions (read) and a gated reconcile_payment tool that links a statement line to a payment

### /assistant
- **DB tables:** (same as /smart via POST /api/smart)
- **Tools:** (identical to /smart: full SMART_TOOLS set) [R+C+U+D]
- **Permissions:** Same as /smart: routes through /api/smart -> runSasa as full admin, rank derived from the signed cookie. Two distinct chat UIs (/assistant and /smart via SmartConsole) front the one brain, so permissions are uniform.
- **CAN do:**
  - Identical capability to /smart: it is a thinner chat UI that POSTs the same message history to /api/smart, so every read and action tool is available
  - Answer fundraising/donor/campaign/task questions and draft posts/emails (its seeded suggestions), grounded in the Brain
- **CANNOT do (why):**
  - Anything /smart cannot do — _/assistant/page.tsx send() posts to the exact same /api/smart route with {messages}, so it inherits identical tool coverage and the same missing tools (approvals, campaigns, bank, content, invoices)_
  - Draft an Instagram caption as a stored content post — _The suggestion prompts a caption but there is no content_posts write tool; the model returns text only, nothing is persisted to a content surface_
- **GAPS → resolve:**
  - [low] Two near-duplicate chat front-ends (/assistant and /smart) on one route → Consolidate to one console or have /assistant import SmartConsole so action affordances and identity handling stay in sync
  - [medium] Caption/post drafting returns ephemeral text with no persistence → Add a draft_content_post tool that writes to content_posts in a draft/gated state

### /dashboard (app/page.tsx)
- **DB tables:** donations, approvals, tasks, messages, donors, campaigns, events, daily_summaries, calendar_events, org_profile
- **Tools:** finance_summary [R], query_donations [R], list_tasks [R], inbox_status [R], query_calendar [R], draft_thank_you [C-gated], draft_email [C-gated]
- **Permissions:** Dashboard renders for the logged-in operator (getCurrentUser greets by first name); both founder and builder see full money figures (MoneyHideToggle is a client privacy convenience, not a role gate). No team-tier dashboard. All money headlines are USD-only by design (Currency law).
- **CAN do:**
  - Sasa can read every headline the dashboard shows: raised MTD/all-time and recurring count (finance_summary/query_donations), open tasks (list_tasks), inbox needing reply (inbox_status), upcoming calendar (query_calendar), donor count (via counts)
  - Sasa feeds the Needs You queue (draft_thank_you, draft_email) and the activity stream (every tool emits an event rendered here)
  - The AskSasa entry bar on the empty-tasks state pipes a prompt straight into Smart Mode to assign a task
- **CANNOT do (why):**
  - Set the monthly fundraising goal (the gauge target) — _Monthly goal lives in org_profile and is edited only by /settings MonthlyGoalEditor (saveMonthlyGoal); no Sasa tool writes it_
  - Resolve a Needs You card from the dashboard via a tool — _ApprovalCard approve/reject is UI-only; no resolve_approval tool (same gap as /smart)_
  - Read or regenerate the cached daily brief (daily_summaries) — _The brief is written only by the agents tick cron (conductor); no Sasa tool reads daily_summaries or forces a brief refresh_
- **GAPS → resolve:**
  - [low] No tool to read/refresh the daily brief or set the monthly goal → Add read_brief and set_monthly_goal tools (owner/founder gated for the goal)
  - [medium] No resolve_approval tool to action the central Needs You list → Shared with /smart: add resolve_approval

### /agents
- **DB tables:** connector_registry, autonomy_rules, agent_runs, events
- **Tools:** none
- **Permissions:** /agents server actions hardcode actor 'Nur' with no role check beyond the login wall (middleware). The autonomy lanes (auto/approve/escalate) are the org-wide gating model that governs whether agent outputs auto-fire or queue into approvals (laneFor/queueApproval in gateway). connector_registry.enabled gates which connectors agents may use. These dials are admin-surface only; team-tier never reaches /agents.
- **CAN do:**
  - This page DISPLAYS the agent mesh, autonomy lanes, connector toggles, recent agent_runs and events. It is configured by two /agents server actions: setLane (writes autonomy_rules) and toggleConnector (writes connector_registry)
  - The agents that actually run (comms, steward, conductor brief) execute on the /api/agents/tick cron, not via Sasa tools; they write agent_runs, approvals, messages, daily_summaries
- **CANNOT do (why):**
  - Change an autonomy lane (auto/approve/escalate) via Sasa — _setLane is a /agents server action only; autonomy_rules has no Sasa tool, so the brain cannot tune its own gating_
  - Enable/disable a connector via Sasa — _toggleConnector is a /agents server action only; connector_registry has no Sasa tool_
  - Read agent_runs (what each agent decided/did) via Sasa — _No tool reads agent_runs; Sasa can only see the generic events stream indirectly through group_activity/member_activity, not the agent decision log_
  - Trigger any agent other than grant prepare — _Only prepare_grants enqueues work; comms/steward/conductor run on cron, with no on-demand Sasa trigger tool_
- **GAPS → resolve:**
  - [low] Autonomy and connector controls have no bot path (orphan-ish tables) → Add owner/founder-gated set_autonomy_lane and toggle_connector tools; emit autonomy.changed/connector.toggled as the actions already do
  - [low] agent_runs decision log is invisible to Sasa → Add a read tool agent_activity(agent?, since?) over agent_runs so Sasa can answer 'what did the comms agent do today'
  - [high] Content and Field/Data agents are status:soon (not built) → Build the Content agent (content_posts drafting) and Field/Data agent (beneficiary/inventory hygiene from the WhatsApp feed) and wire matching tools

### /launchpad
- **DB tables:** 
- **Tools:** none
- **Permissions:** Behind the login wall (middleware) like all sections; no role gating, no PII. Identical for founder and builder.
- **CAN do:**
  - Pure client navigation surface: a flat searchable grid of every section (the Browser-OS new-tab page). No DB reads/writes, no Sasa tools touch it
- **CANNOT do (why):**
  - Any data action — _app/launchpad/page.tsx renders only the Launchpad component (client-side section grid); there is no backend, no table, and no tool, by design_
  - Sasa-driven navigation ('open the donations page') — _No tool returns a navigation affordance to jump the operator to a section; tools only return open-record affordances on action results_
- **GAPS → resolve:**
  - [low] No bot-driven navigation/launch capability → Optional: add a navigate affordance type so Sasa can deep-link the operator to a section; low priority


---
## GAP BACKLOG (all 110, by effort)

### LOW effort (57)
- **Money//donations:** No batch thank-you tool (one-shot 'thank everyone we haven't thanked') → Add a draft_all_thank_yous tool that reuses queueThankYouGated over recent un-thanked succeeded gifts (cap ~10), gated into approvals like the UI button.
- **Money//donations:** No way for Sasa to filter/report donations by campaign or channel → Extend query_donations input_schema with optional campaign (name match) and channel filters, applied as .eq/.ilike in runRead.
- **Money//finance:** No log_payout tool for the Givebutter USD->Kenya bridge → Add a log_payout tool (USD, method=givebutter, category=payout, ref GB-PAYOUT-*) so Sasa can capture a payout reported in chat; keep it out of the operating-spend ledger view per doctrine.
- **Money//campaigns:** No add_campaign tool → Add an add_campaign tool (name, type, status, goal_amount, raised_amount, starts_on, ends_on) mirroring saveCampaign's insert branch, admin-only, never writing givebutter_id so syncs are not clobbered.
- **Money//campaigns:** No update_campaign tool → Add update_campaign (match by name, change status/goal/raised/dates/type) reusing saveCampaign's update branch; enforce Currency law on goal/raised and keep raised_amount honest (no invented figures).
- **Money//campaigns:** list_campaigns has no filters and cannot answer 'how is the X campaign doing' efficiently or 'which are live' → Extend list_campaigns input_schema with optional status, type, and name filters applied in runRead.
- **Work//tasks:** No way to move a task into in_progress or blocked via the assistant → Add a `status` argument to update_task (enum todo|in_progress|blocked|done) and route 'start the X task' / 'X is blocked' to it, reusing update_task's matcher
- **Work//tasks:** Cannot set or change a task description or brand from chat → Add optional `description` and `brand` fields to create_task and update_task and write them (brand resolved against brands like the calendar's brand enum)
- **Work//calendar:** Cannot fully edit an existing event (title/location/notes/end) from chat → Add an `update_event` tool that wraps updateCalendarEvent (title, location, notes, end_date, end_time, kind, brand, attendees), matched by title fragment like move_event
- **Work//calendar:** No attendees or brand on events created by Sasa → Add optional `attendees` (resolve names -> team_members.id) and `brand` to create_event's input_schema and pass them into the insert
- **People//team:** No tool writes the per-member pay ledger (team_payments) → Add a log_team_payment tool mirroring the logPayment server action (resolve member by name, require KES/USD, write team_payments + emit team.payment_logged).
- **People//team:** No activate_member tool → Add an activate_member tool calling the same path as activateMember (flip activated/status, best-effort activation email).
- **People//team:** update_team_member status enum is wrong/incomplete → Align the tool's status enum to the team_members_status_check values; remove 'departed'.
- **People//team/[id]:** No read of team_payments pay history → Add a read_team_pay_history tool (or extend member_activity with a pay-history block, admin-only).
- **People//team/[id]:** No in_progress/blocked task transitions → Add a set_task_status tool with the full todo/in_progress/blocked/done enum.
- **People//team/[id]:** No task-aware group follow-up → Add a follow_up_task tool resolving the task's source_group + assignee first name, mirroring followUpTask.
- **Comms//contacts/[id]:** No tool reads a contact's message thread → Add a read_contact_thread tool (messages by contact_id, owner-line walled like search_history) so Sasa can answer 'what did we last say to X'.
- **People//beneficiaries:** update_beneficiary status is unvalidated free text → Constrain status to the DB enum (active/graduated/transitioned/paused/exited/inactive) and reject others.
- **People//beneficiaries/[id]:** No per-id beneficiary read with the full identity set → Add a beneficiary_detail tool (admin-only) returning the fuller record the 360 shows, with the same team-tier hard refusal.
- **People//beneficiaries/[id]:** Validated lifecycle transitions missing → Validate status against beneficiaries_status_check; consider a dedicated set_beneficiary_status mirroring the portal action.
- **Intake//cases:** No add_case tool for the console/DM surface → Add an add_case tool (or an as_case flag on add_beneficiary) so an admin can intentionally create an intake_stage='under_review' record.
- **Intake//cases:** No read/write of triage_notes, referred_by, case_channel → Extend a case_detail read and a case-update tool to cover triage_notes/referred_by/case_channel.
- **Work//inventory:** add_inventory_item writes an invalid status:'draft' → Change the inserted status to 'in_stock' to match the portal addItem and the DB constraint.
- **Work//inventory:** No inventory read tool → Add a list_inventory / inventory_status tool (counts, low/out-of-stock, listed-on-Folklore) for both tiers.
- **Comms//inbox:** draft_email cannot attach a document → Extend draft_email schema with an attach hint (doc title fragment) and resolve via resolveAttachments before queueing the approval, mirroring sendReply.
- **Comms//outreach:** No read into outreach audience size or blast history from chat → Add a read tool outreach_status returning deduped audience counts (donors/contacts) and the last N content_posts where channels contains 'outreach'.
- **Comms//groups:** No tool to read a full group thread or list groups from chat → Add list_groups (distinct account where sender_type='group') and group_thread(group, limit) read tools, admin only, reusing the groups/messages query.
- **Comms//groups:** Cannot trigger or preview the daily group digest conversationally → Add a run_group_digest action tool (admin only) that calls the digest runner for one group or all, returning what was queued.
- **Comms//groups:** Bot-bound: portal cannot deliver to a group if the Railway userbot is offline → This is the deliberate one-way architecture; resolution is operational (re-link via QR). Surface queue depth + bot heartbeat (bot_status group_poll) in a read tool so Sasa can tell Nur a post is stuck rather than silently queuing.
- **Knowledge//grants:** No tool to pursue a single opportunity into the pipeline → Add a pursue_opportunity SMART_TOOL (input: opportunity id or funder/title match) calling the existing pursueOpportunity logic; admin-tier only.
- **Knowledge//grants:** No tool to add a grant application from chat → Add an add_grant tool (funder, program, amount_requested, deadline) reusing app/grants/actions.ts addGrant.
- **Knowledge//grants:** Bot cannot read a prepared package body → Add a read_grant tool (or a kind to list_grants) returning the notes package for one matched grant, admin-tier.
- **Knowledge//grants:** No interactive opportunity-hunt trigger → Add a refresh_grants tool that internal-fires /api/grants/refresh with the agent secret, or a UI button; surface counts back.
- **Knowledge//library:** No way to list/search the asset library from chat → Add a list_assets/search_assets tool (filter by brand, type, tag/shelf) returning titles + signed URLs; respect consent_required by withholding private images from team tier.
- **Knowledge//legal:** Bot cannot read a legal document's full text → Add a read_document tool that calls the documents/content logic (lazy-extract + return text) for one matched doc, admin-tier.
- **Knowledge//legal:** Team-tier search_documents has no sensitivity filter → In runRead, when tier==='team', exclude folder='legal' and doc_type in (contract) or restrict to a safe allowlist of folders.
- **Knowledge//legal:** No tool to correct a document's classification (doc_type/doc_date/summary) → Extend file_document or add an edit_document tool to set doc_type/doc_date, admin-tier.
- **Knowledge//reports:** Bot cannot surface the Givebutter→Kenya flow figures → Add a flow_statement read tool (or extend finance_summary) computing withdrawn USD vs KES/USD paid out from payments, keeping currencies unmixed.
- **Knowledge//reports:** No on-demand PDF export tool → Add an export_pdf tool that, given a matched studio_documents/report title, returns the /api/studio/pdf href as an affordance.
- **Knowledge//reports:** No tool to trigger the grant-ready document set → Add a generate_grant_docs tool that enqueues studio.generate jobs for the four GrantDocKinds and fires the worker, admin-tier.
- **Intake//filing:** No tool to trigger Drive extraction or report ingest review status from chat → Add a sync_drive read/action tool (POSTs /api/drive/extract with the agent secret) and an ingest_status read tool wrapping latestOpenBatch/batchForReview so Sasa can say 'I pulled in 12 new files, 3 are waiting for your review'
- **Intake//filing:** No delete/unfile capability for documents → Add a delete_document tool (soft-delete or hard-delete with an event) + a route, mirroring delete_payment's recoverable pattern; expose a remove action on FileCard
- **Intake//filing:** No get_document_text tool to quote a filed document in chat → Add a read_document tool that returns extracted_text (capped) for a matched title, lazily extracting via lib/extract-text if empty, so the 727 can answer 'what does the constitution say about X'
- **Intake//filing:** No tool to fix a document's title/summary → Extend file_document (or add rename_document) to optionally set title/summary, humanized, emitting document.filed
- **Content//content:** No Sasa tool to draft/create a content post → Add a 'draft_post' / 'schedule_post' smart-tool that inserts into content_posts (brand, channels, body, scheduled_for, status) reusing the aiDraft caption path; add 'list_content' read tool over content_posts.
- **Content//studio:** No read tool over studio_documents → Add a 'find_studio_doc' read tool (or extend search_documents to union studio_documents) returning title, doc_type, kind, created_at, and the pdf href.
- **Content//studio:** No tool to enqueue a grant-ready regeneration → Wrap queueGrantDoc in a 'regenerate_grant_doc' smart-tool keyed by kind, admin-only, with an affordance to the settings panel.
- **Content//studio:** Grant-ready docs limited to Nisria → Parameterize brandKey on generateGrantReadyDoc and the grant-doc job payload if Maisha/AHADI need their own funder packets.
- **Orchestrator//smart:** No autonomy/connector control tool → Add set_autonomy_lane and toggle_connector tools (owner/founder gated) wrapping the existing setLane/toggleConnector logic
- **Orchestrator//assistant:** Two near-duplicate chat front-ends (/assistant and /smart) on one route → Consolidate to one console or have /assistant import SmartConsole so action affordances and identity handling stay in sync
- **Comms//workspace:** sasaDraft pre-draft not reachable from the brain → Expose draft_thread_reply(contactId) as a read-style tool returning suggested text
- **Orchestrator//dashboard (app/page.tsx):** No tool to read/refresh the daily brief or set the monthly goal → Add read_brief and set_monthly_goal tools (owner/founder gated for the goal)
- **Orchestrator//agents:** Autonomy and connector controls have no bot path (orphan-ish tables) → Add owner/founder-gated set_autonomy_lane and toggle_connector tools; emit autonomy.changed/connector.toggled as the actions already do
- **Orchestrator//agents:** agent_runs decision log is invisible to Sasa → Add a read tool agent_activity(agent?, since?) over agent_runs so Sasa can answer 'what did the comms agent do today'
- **Knowledge//settings:** Standard grant document generation not bot-triggerable → Add generate_grant_doc(kind) tool wrapping queueGrantDoc
- **People//profile:** No created_by task view in member_activity → Extend member_activity to include created_by counts
- **Orchestrator//launchpad:** No bot-driven navigation/launch capability → Optional: add a navigate affordance type so Sasa can deep-link the operator to a section; low priority

### MEDIUM effort (43)
- **Money//donations:** Sasa cannot answer 'has X been thanked yet?' or advance/cancel a queued thank-you → Add a read that joins action_intents (thankyou: keys) to report per-donor thank-you status; optionally a gated tool to cancel a pending thank-you approval.
- **Money//donors:** No add_donor or update_donor tool → Add add_donor (name + optional email/phone/type/status) and update_donor (status, type, country, tags, notes, contact) tools, mirroring add_contact/update_contact but writing donors; keep lifetime_value/gift figures read-only.
- **Money//donors:** Sasa cannot retrieve a donor's conversation thread or activity timeline on request → Add a donor_thread/donor_activity read tool that resolves donor->contact(email)->messages+events, returning the cleaned thread and recent agent events.
- **Money//donors:** No grounded check-in draft for lapsed/prospect donors (no recent gift) → Add a draft_donor_note tool that reuses the donor-draft route logic (thank-you if recent gift, else grounded check-in), queued gated into approvals.
- **Money//finance:** No schedule_payment / add_obligation tool (upcoming + recurrence + due_on) → Add a schedule_payment tool writing payments status=upcoming with due_on, category, recurrence, vendor_country, emitting payment.scheduled (mirror addPayment); honor Currency law.
- **Money//finance:** No mark_payment_paid tool for an existing scheduled obligation (with recurrence roll-forward) → Add mark_payment_paid (match an upcoming payment by payee/amount/due window) that flips to paid and rolls the next recurrence forward like markPaid.
- **Money//finance:** finance_summary is too thin (no per-currency net position, no payout/Kenya reconciliation, no per-category breakdown) → Extend finance_summary (or add a treasury_position read) to return per-currency in/out/net, the Givebutter-withdrawn vs Kenya-paid reconciliation, and a category breakdown, reusing the page's computations.
- **Money//finance:** No reads for team_payments (payroll) or bank_transactions (statement ledger) → Add read tools: list_payroll (team_payments by member/period) and list_bank_transactions (date-windowed, source-doc traceable), both admin-only and stripped from team.
- **Money//campaigns:** No campaign performance read (donations rolled up per campaign) → Add a campaign_performance read that sums succeeded donations by campaign_id (per currency) and compares to goal_amount, so Sasa reports live progress rather than a possibly-stale stored figure.
- **Work//tasks:** No parameterized task query/search tool → Extend list_tasks with optional assignee_name / status / due_before / priority filters so 'what is overdue for Grace' resolves without member_activity
- **Work//tasks:** Multi-task dispatch only exists in the web DispatchBox, not in the brain → Let create_task accept an array, or add a create_tasks batch tool, so the WhatsApp/Smart path can split one instruction into many assigned tasks like the console does
- **Work//calendar:** Overlay items (task/payment/grant/content dates) are read-only on the calendar → Acceptable as-is; if inline rescheduling is wanted, have query results' overlay items carry an action hint so Sasa proactively calls update_task/update_payment when asked to move a due date from the calendar context
- **Work//calendar:** No drag-to-reschedule and no id-addressable event ops → Add drag handlers on the grid calling updateCalendarEvent by id, and let move/delete_event accept an event id when query_calendar already surfaced one
- **People//team:** add/update omit member_type-on-update, pay_type, engagement fields, notes, tags, photo → Extend add_team_member/update_team_member input schema to cover pay_type, engagement_start/type, notes, tags, and member_type-on-update; add a set_member_photo tool.
- **Comms//contacts/[id]:** draft_email cannot attach documents or be sent inline by the operator → Extend draft_email to accept attachment refs (reuse resolveAttachments) and surface the chosen sending account on the approval card.
- **Comms//contacts/[id]:** No contact delete/merge → Add a merge_contacts / delete_contact tool with a confirm gate; add an owner/created_by column for safe scoping.
- **People//beneficiaries:** No consent publish/withdraw tool → If desired, add a publish_beneficiary tool that queues a CONSENT approval (gated, never direct) rather than flipping consent_public outright; otherwise document it as intentionally portal-only.
- **People//beneficiaries:** No funding write path anywhere → Add an admin-only, currency-explicit set_beneficiary_funding tool (or a portal action) under the Money agent, gated.
- **Intake//cases:** Entire case lifecycle (stage/approve/decline/reopen) has no agent tools → Add admin-only, gated tools advance_case (stage), approve_case, decline_case(reason), reopen_case mirroring app/cases/actions.ts, each scoped to rows with intake_stage NOT NULL and emitting the existing events.
- **Work//inventory:** No update_inventory_item tool → Add update_inventory_item (quantity delta, status, price, location, sku, folklore_url) with the DB status enum validated.
- **Work//inventory:** No generate_listing tool → Add a generate_folklore_listing tool mirroring generateListing (resolve item by name, draft copy, save asset, flip folklore_listed).
- **Comms//inbox:** No tool to reply to / close a specific inbound conversation from chat → Add a gated reply_to_message tool (input: contact_id/message_id, body) that drafts a reply and queues it via the existing email_reply approval path (reuse queueApproval + createIntent send_email), plus a mark_handled tool that flips messages.status to replied/closed. Owner/admin only.
- **Comms//outreach:** public.outreach CSR/partner pipeline is unmanaged → If this pipeline is still in use, add list/advance tools (e.g. list_outreach, advance_outreach_stage) mapped to the outreach table; otherwise document it as deprecated.
- **Comms//groups:** No structured @mention / target-a-person-in-group tool → Add a mention-aware variant or a target param to post_to_group that resolves a name to a team_members phone and emits a proper WA mention payload in the group.send job for the userbot to render.
- **Knowledge//grants:** No tool to advance grant status or record an award → Add an update_grant_status tool (match by funder, status enum, optional amount_awarded with currency) wrapping advanceStatus, with Currency-law guard on amount_awarded.
- **Knowledge//library:** No asset upload/ingest tool → Add an ingest_asset tool that accepts an already-stored storage_path or a WhatsApp media id and runs the uploadAsset ingest path (classify, caption, remember, consent flag).
- **Knowledge//library:** No consent management tool → Add a set_consent tool (mark consent_on_file true with usage_rights) gated to admin, so beneficiary media can be cleared for use; surfaces the safeguarding wall to the agent.
- **Knowledge//legal:** Entity facts and obligations are page-hardcoded, not data the bot can read or remind on → Move the entity facts into agent_memory org_facts (or a compliance table) and the OBLIGATIONS into the calendar/payments-style recurring model so query_calendar surfaces them; add a compliance_status read tool.
- **Knowledge//legal:** No reminders for recurring filings (990, TCC, CBO returns) → Seed dated obligation rows (recurring) and let the existing reminders cron + query_calendar pick them up; optionally a check_compliance tool.
- **Knowledge//reports:** No tool to generate a report from chat → Add a generate_report tool (type, brand, window, sections) that enqueues/calls generateReport and returns the studio_documents id + a PDF affordance; admin-tier, money-walled.
- **Knowledge//reports:** No tool to draft/issue or list invoices → Add draft_invoice (wraps draftInvoiceFromText), issue_invoice (wraps createInvoice), and list_invoices (reads invoices table) tools, admin-tier.
- **Intake//filing:** doc_date is never populated → In lib/ingest.classifyItem, have the Haiku router also return doc_date (it already reads the text) and write it in indexDocument; backfill existing rows from extracted_text on lazy open
- **Intake//filing:** 727 DM cannot run the cases (potential-beneficiary) intake; only the group bot can → Decide the desired 727 behavior and, if cases should be loggable from the DM, thread a casesIntake flag (or a distinct log_case tool) into runSasa from whatsapp/worker so an operator can forward a referral as a case for review
- **Intake//filing:** No link/URL ingest channel → Add a 'link' channel to IngestInput that fetches the URL (or resolves a Drive file id) before classify; reuse extract-text/drive fetchers
- **Content//content:** Graphic generation never wired → Wire generateGraphic to Canva autofill (or an image model), upload result to assets, set content_posts.image_url; optionally expose as a tool.
- **Content//studio:** No Sasa tool to generate a free-form Studio document → Add a 'create_document' smart-tool (admin-only) that enqueues a studio.generate-style job (or calls generateDocument server-side for text-only prompts), returns the doc id + a /api/studio/pdf affordance. Long generations should ride the existing jobs worker, not block the chat turn.
- **Orchestrator//smart:** No approve/reject tool for the Needs You queue → Add a resolve_approval tool (approve|reject by id/title) that calls the gateway execute path, guarded to admin only
- **Orchestrator//smart:** No campaign create/update or donation create tool → Add create_campaign/update_campaign (goal/dates/status) tools; keep donations read-only or add a gated record_donation
- **Orchestrator//assistant:** Caption/post drafting returns ephemeral text with no persistence → Add a draft_content_post tool that writes to content_posts in a draft/gated state
- **Comms//workspace:** No Sasa tool to reply-in-thread or change message status → Add a reply_in_thread tool (channel-aware, email actually sends gated, WhatsApp via message_person) and a mark_message tool wrapping the status updates
- **Orchestrator//dashboard (app/page.tsx):** No resolve_approval tool to action the central Needs You list → Shared with /smart: add resolve_approval
- **Knowledge//settings:** Brain/voice/accounts/ingest are all human-only Settings surfaces with no bot path → Add tools: edit_brain_section (org_profile), set_brand_voice (agent_memory brand_voice), and an ingest_intake tool to start/confirm a batch; gate to admin
- **People//profile:** Auth-identity to team_members linkage is name-matched and unmanaged → Add a team_members.auth_user_id column and a link_profile tool/Settings action; expose a read tool for the current operator's own stats

### HIGH effort (10)
- **Money//finance:** Sasa cannot turn a shared M-Pesa/receipt image into a staged payment → Optional: a gated parse_receipt tool that runs the same vision extract and STAGES a record_payment for explicit 'yes', preserving the confirm-before-write money rule.
- **Work//tasks:** No recurring tasks/reminders → Add a recurrence column (rrule or interval) to tasks plus a cron that re-spawns the next instance on completion, and a `recurrence` arg on create_task; a 'Work' agent owner cron regenerates
- **Work//calendar:** No recurring calendar events → Add a recurrence/rrule column + a 'Work' agent cron that materializes upcoming instances (and mirrors them to Google via RRULE), plus a `recurrence` arg on create_event
- **People//beneficiaries:** Chat intake captures a thin slice of the PII profile → Route add_beneficiary through parseIntakeForm-style normalization or extend its schema (age/dob, gender, guardian_status, story, tags) and add a beneficiary photo-attach tool.
- **Comms//outreach:** No Sasa tool for the outreach blast (compose/send/schedule a newsletter) → Add a gated draft_outreach tool that composes the blast body, resolves the audience via gatherRecipients, and queues a single bulk approval (new approvals kind='outreach_blast') the worker fans out through sendEmail with the SEND_CAP honored. Keep it admin-only and gated, since a 50-recipient auto-send is far higher-stakes than a 1:1 draft.
- **Knowledge//library:** Google Drive import is a dead UI affordance → Build a Drive-folder import route reusing lib/drive.ts (service account already exists), feeding files through the same ingest + memory, and a connect_drive_folder tool.
- **Intake//filing:** Filed sensitive documents (bank statements, IDs) have no PII redaction or access tier → Add a sensitivity tag at classify time (bank_statement/contract/registration) and gate search_documents/preview accordingly, or at minimum confirm only-owner can open finance docs; align with the privacy wall in lib/privacy.ts
- **Content//content:** No real social-publishing pipeline (Instagram/Facebook) → Add an 'instagram'/'facebook' (or 'meta') connector case in lib/gateway.ts dispatch() that calls the Meta Graph publishing API, plus a cron/worker that picks up scheduled content_posts, routes through createIntent (gated lane), sets posted_at or status='failed'. Then a publish smart-tool can ride the gateway.
- **Orchestrator//smart:** No bank reconciliation tool over bank_transactions → Add query_bank_transactions (read) and a gated reconcile_payment tool that links a statement line to a payment
- **Orchestrator//agents:** Content and Field/Data agents are status:soon (not built) → Build the Content agent (content_posts drafting) and Field/Data agent (beneficiary/inventory hygiene from the WhatsApp feed) and wire matching tools
