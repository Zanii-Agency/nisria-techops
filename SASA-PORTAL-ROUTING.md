# Sasa Portal Routing — section by section (what each agent can / can't / should do)

_Plain English. Grounded in the real portal pages. CRUD = Create / Read / Update / Delete. "Gated" = goes to the Needs You approval queue, never auto-fires. The coverage sweep will verify each CRUD line against the actual code; this is the first cut._

Legend: ✅ can · ❌ can't (today) · ➕ suggested to add

---

## MONEY AGENT — owns: Donations, Donors, Finance, Campaigns
**Donations** (`/donations`)
- ✅ Read: totals, counts, by date range, latest gift, biggest gift.
- ❌ Create/Update/Delete a donation by chat (donations are recorded when money actually arrives, read-only on purpose).
- ➕ Should add: log an offline/cash *pledge* as pending; tag a donation to a campaign.

**Donors** (`/donors`)
- ✅ Read: find a donor, lifetime value, giving history, newest donor.
- ❌ Create/edit a donor record by chat; segment donors.
- ➕ Should add: add/merge a donor, update donor contact info, build a segment (lapsed / major / recurring) for a campaign.

**Finance** (`/finance`)
- ✅ Read: money-in vs money-out summary for a month.
- ✅ Create: log a payment (STAGED, "reply yes to confirm"). Update/Delete: only payments *Sasa itself* logged.
- ❌ Edit bank-statement history; move real money; edit donations/grants.
- ➕ Should add: runway/forecast, flag overdue/unpaid obligations, assisted bank reconciliation.

**Campaigns** (`/campaigns`)
- ✅ Read: list campaigns with goal/raised (money hidden from team).
- ❌ Create/launch a campaign by chat; update a goal.
- ➕ Should add: create a campaign, update its goal, link donations to it, progress nudges.

**Permissions:** admin/founder/owner only. Entirely blocked for team tier. Sonnet (high-stakes). No cron.

---

## WORK AGENT — owns: Tasks, Calendar
**Tasks** (`/tasks`)
- ✅ Full CRUD: create, complete, reopen, update (reassign/redate/rename), delete. Assign to a team member (pings them).
- ❌ Recurring tasks ("every Monday") — single date only.
- ➕ Should add: recurring engine, bulk ops ("close all festival tasks"), sub-task checklists (this also fixes multi-step).

**Calendar** (`/calendar`)
- ✅ Create/Update/Delete events (mirrored to Google). Read: what's coming up, conflicts, Kenya holidays.
- ❌ Recurring events; editing payroll/grant rows; real external links (Zoom/Meet).
- ➕ Should add: recurring, "find a slot with X", an honest "calendar hold placed, you add the Zoom link".

**Permissions:** team CAN do its own tasks + team events; team CANNOT see money on the calendar or touch payroll/grant rows. Haiku (Sonnet for ambiguous multi-step). Cron: `cron/reminders`, `task-digest`.

---

## PEOPLE AGENT — owns: Team, Contacts, Beneficiaries, Cases, Inventory
**Team** (`/team`, `/team/[id]`)
- ✅ Read roster (roles, phones, pay). Create/Update a member (pay needs a currency).
- ❌ Delete/deactivate a member by chat; run payroll.
- ➕ Should add: onboarding/offboarding flow, deactivate a member, payroll-run reminder + reconciliation.

**Contacts** (`/contacts/[id]`)
- ✅ Create/Update a contact (phone/email). Read: look up by name.
- ➕ Should add: merge/dedupe, delete a stale contact.

**Beneficiaries** (`/beneficiaries`, `/beneficiaries/[id]`) — CONFIDENTIAL (children)
- ✅ (admin only) Read/find; Create/Update a child's status, needs, program, region, contact.
- ❌ Any money/funding field; **team tier sees NOTHING here** (name/story/location hard-refused).
- ➕ Should add: case-status workflow, follow-up scheduling, auto-draft a record from a group report.

**Cases** (`/cases`) — intake pipeline
- ✅ Create a potential-beneficiary intake (lands in review, not auto-accepted); approve = one update.
- ➕ Should add: WhatsApp-group auto-draft of new cases.

**Inventory** (`/inventory`) — Maisha
- ✅ Create an inventory item.
- ❌ Update/delete; stock levels; low-stock alerts.
- ➕ Should add: stock counts, low-stock alerts, usage tracking.

**Permissions:** beneficiaries + pay = admin only, hard-walled from team. Sonnet (PII). No cron.

---

## COMMS AGENT — owns: Inbox, Outreach, Groups
**Inbox** (`/inbox`)
- ✅ Read: conversations needing a reply. Create: draft a reply/email (GATED to approvals).
- ❌ Auto-send anything.
- ➕ Should add: triage/auto-categorize inbound, bulk draft replies for approval.

**Outreach** (`/outreach`)
- ✅ Draft donor outreach (gated).
- ❌ Multi-recipient blast; automated sequences.
- ➕ Should add: a gated multi-step donor-cultivation drip; thank-you automation.

**Groups** (`/groups`) — the group bot
- ✅ Read group activity + group-born tasks; post to the group (queued); capture tasks from chatter; flag-to-Nur on high-stakes-low-confidence.
- ❌ DM individuals (that's the official 727 number's job).
- ➕ Should add: scheduled group digest, smarter escalation.

**Delegation:** Work agent creates+assigns → Comms sends the assignee a `task_alert` DM **from the official 727 number** (+ optional group @mention). Permissions: email/thank-you NEVER auto-send. Sonnet. Cron: `group/digest`, outbox drain.

---

## KNOWLEDGE AGENT — owns: Grants, Library, Legal, Reports, Brain
**Grants** (`/grants`)
- ✅ Read opportunities + applications; enqueue grant-package prep.
- ❌ Submit an application; edit a grant record/deadline by chat.
- ➕ Should add: submission-status tracking, follow-up sequence, edit deadline, grounded full-package generation (verified figures + correct EIN 92-2509133).

**Library** (`/library`)
- ✅ Read/search filed documents; (re)file to a shelf.
- ❌ Delete a document.
- ➕ Should add: move/re-file, delete, generate a branded document on request.

**Legal** (`/legal`)
- ✅ Read legal facts (EIN, constitution, registration).
- ➕ Should add: compliance-deadline reminders, draft simple legal docs (gated).

**Reports** (`/reports`)
- ✅ Read + the daily brief.
- ➕ Should add: on-demand "board report" (grounded), proactive weekly digest to Nur.

**Brain/Memory** (cross-cutting)
- ✅ Remember durable facts (owner can mark private), recall, search history.
- ➕ Should add: contradiction self-correction, an entity graph (who relates to whom).

**Permissions:** grants read-only by chat. Haiku for reads/search, Sonnet for package/report generation. Cron: `grants/refresh`, `grants/prepare`.

---

## INTAKE AGENT (mailroom) — owns: Filing + everything inbound via 727
**Filing** (`/filing`) + inbound PDFs/invoices/images/voice/links
- ✅ Receive → extract/OCR/transcribe → classify → file into Library + Brain → route to the right specialist (invoice→Money, grant doc→Knowledge, beneficiary photo→People PII-walled).
- ❌ Execute a link (read-only fetch + summarize); move money itself.
- ➕ Should add: confidence flags on auto-classification, easy mis-file correction, duplicate detection.

**Permissions:** files + routes; never the final actor on money/PII. Haiku (classify); extraction is non-LLM code. Cron: `ingest/process`, `drive/extract`.

---

## CONTENT AGENT (under-served today — your `/content` + `/studio`)
**Content / Studio** (`/content`, `/studio`)
- ✅ Generate branded documents + PDFs (studio/generate, studio/pdf exist).
- ❌ Post to social (Instagram/Facebook/LinkedIn) — no connector. Publish to a CMS. Editorial calendar.
- ➕ Should add (this is the Limova "John" gap): draft→approve→**post to social** (one channel first, gated), CMS publish for the Nisria/Maisha/AHADI sites, an editorial calendar. High fundraising value.
- **Permissions:** all outbound social/CMS GATED to approvals (never auto-post). Sonnet for copy, Haiku for scheduling.

---

## ORCHESTRATOR + GUARD (cross-cutting, no portal section of their own)
- **Orchestrator** (`/agents` is its control panel, owner only): identify role at the door → decompose multi-step → route → assemble one Sasa reply. Cron: `agents/tick`.
- **Guard:** grounding + honesty check on every outbound reply (catches invented figures, false "done", PII leaks). Unbypassable.

---

## ADMIN-ONLY (no agent acts here without owner/founder)
- **Settings** (`/settings`), **Profile** (`/profile`), **Agents** (`/agents` control panel): configuration. Owner/founder only; Sasa reads but does not change config by chat.

---

## The biggest gaps this surfaces (➕ worth prioritizing)
1. **Content/social** — whole capability missing (`/content`,`/studio` can make docs but can't publish). Highest growth value.
2. **Recurring** — Tasks + Calendar both lack it; most-requested.
3. **Campaign + donor write paths** — read-only today; can't create/segment.
4. **Inventory depth** — create-only; no stock/alerts.
5. **Grants lifecycle** — can't track submission/status or follow up.

The coverage sweep turns this first cut into a verified matrix (every CRUD line checked against the code) and confirms nothing in the portal is left without an owner.
