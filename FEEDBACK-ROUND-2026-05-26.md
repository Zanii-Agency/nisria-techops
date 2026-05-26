# Nisria Command Center — Feedback Round (2026-05-26, morning)

> Status: CAPTURE ONLY. Do NOT build yet. Nur/Taona is still adding corrections and will
> ask for my opinion before I touch anything. This file is the source of truth for the fix round.

## A. New capabilities he wants

1. **Document Studio (AI document creation).** Some emails require drafting documents (e.g. the
   STP 10th Cohort email asks for: Interim Report, 2Q Financial Settlement Sheet, Bank Statement,
   Supporting Documents ZIP, receipts). The portal should **suggest opening a Studio**, let her
   **drag-and-drop screenshots / info / documents**, and then **generate the needed documents** for
   Nur, **branded** (Nisria/Maisha/AHADI branding on the output docs). Think: inbound request →
   "Sasa can prepare these documents" → drop inputs → branded PDF/DOCX out.

2. **Finance: AI-populate expenses via drag-drop or voice.** On the Finance tab there must be a
   prompt to **populate ALL expenses** by drag-and-drop (receipts/screenshots) OR **voice**. AI
   profiles all expenses and figures out what's needed. (Extends the existing M-Pesa-screenshot
   vision idea into a full expense intake.)

3. **Reports tab.** A dedicated place to **generate the reports that are needed** — bank statements,
   financial reports, settlement sheets, the grant/funder report packages. Ties to #1 and #2.

4. **Kenya reconciliation — upload past receipts.** In Givebutter→Kenya reconciliation she should be
   able to **upload whatever past receipts she has**; the system must **understand historical data is
   incomplete** ("some info won't be there") but **going forward she uploads everything**. Right now
   it shows $27,652 withdrawn vs KES 0 paid out because nothing is logged on the Kenya side.

5. **First-run ONBOARDING (in Settings) — the portal is a brain.** When she signs in the first time
   (we are still in dev), there must be an onboarding flow that **collects ALL info ever about the
   org**: key events, key losses, key assets, history. The portal is **a brain with memory** that
   **advises and guides using Claude**, and **populates + saves** everything. Onboarding lives in
   **Settings** (re-runnable). This feeds Sasa's context/memory.

6. **Grants: auto-select + auto-prepare ALL, always ready.** The grant agent should **automatically
   select and prepare ALL** opportunities and keep them **ready for submission at all times**. Nur
   just shows up and **accepts or declines** — everything is already prepared/queued. Today they sit
   in "Researching (4)" with manual "Prepare application" buttons and "Prepared·review (0)". Wrong:
   the pipeline should be pre-filled into Prepared/ready, not waiting on her to click prepare.

## B. Logic / data correctness (he stresses this hardest — "your system is not wired correctly")

7. **Inbox "needs a reply" says 0 but there ARE emails needing replies.** Dashboard "Inbox 0 need a
   reply" + "Open tasks 0" are wrong: the inbox shows 2 conversations needing attention and Needs You
   has 12. Counts/logic are broken. If there's work, it should not read 0. (Inbox count, tasks count,
   Needs-You count must reconcile and be truthful.)

8. **Needs You is REPEATING emails.** Duplicate reply cards (two identical "Reply to sameer patil",
   both Escalated). Dedupe.

9. **Needs You doesn't show which ACCOUNT** the mail is from (sasa@ vs maisha@). Each card must show
   the source account. "If there are none, then [say] yet" (clean empty state).

10. **Donor timeline shows RAW HTML/CSS** instead of clean email text — e.g. `@media only screen and
    (min-width:480px){ .mj-column-per-100 {...} } </sty` and `<!doctype html><html ...>`. The email
    renderer is not cleaning MJML/HTML in the donor 360 conversation + timeline. Must show clean text,
    **retrieve ALL emails**, be **scrollable**, and **allow sending new emails** from the timeline.

11. **Donations must link to the donor profile** the same way donors do (click → profile).

12. **Money/People/Studio dropdowns OVERLAP the tab strip** below the nav (z-index/stacking). The
    open dropdown menu collides with the open record tabs. Resolve stacking/placement.

13. **Sasa brief still not scrollable.** (Repeat — flagged before.)

14. **Money still not hideable** — "Raised all-time $26,483" and donor balances do NOT blur with the
    money-hide (eye) toggle. The `.money` class isn't applied to all balances. (Repeat.)

## C. Design quality / polish

15. **Donor peek opens in the wrong place + not centered.** Clicking a profile "goes down" and the
    peek is mis-positioned; must be **centered**. Content also overflows the card edges (the
    "thank-you drafts into Needs You…" helper text bleeds outside). Fix positioning + overflow.

16. **Needs You expanded popup not center-aligned + glass is cheap.** The expanded reply card is not
    centered and the **glass/transparency is not clean — it bleeds through, looks cheap, not pro, and
    affects everything else**. Make the modal a proper centered overlay with a clean, opaque-enough
    surface (kill the see-through mess).

17. **Top bar should TRANSFORM per tab.** The persistent top nav should adapt/transform contextually
    depending on which tab/page you're on (not the same static bar everywhere). "Transform into
    something else, you know."

18. **"Add a grant" placement is strange** — currently an inline form jammed at the bottom of the
    first kanban column. Needs a better home (e.g. a button/modal, or a dedicated spot).

19. **Paid history takes too much space** — should be **collapsed by default, expand at will**.

20. **Avatar stack "W H E S A +55" under Donors — remove it.** "I don't understand it and it
    shouldn't be there."

21. **TWO search bars** — the top-nav omnibox ("Search anything ⌘K") AND the home hero ("Search or
    jump to ⌘K"). Keep ONE, the most ideal; remove the other.

22. **Empty Tasks card says "Ask Sasa to assign one" but that means going elsewhere.** Should let her
    **ask Sasa right there inline**, not navigate away.

23. **Wasted space everywhere.** E.g. the "Fundraising · last 6 months" chart is mostly empty space.
    Rule: every empty/wasteful area must either hold something meaningful or be removed. He says this
    is recurring and I "keep lying" about fixing it.

## D. Cross-cutting (the meta-issues he keeps repeating)

- **EVERY card must be clickable** and lead somewhere. Raised repeatedly across dev, still not done.
- **Consistent LOGIC failures** — counts wrong, repeats, dead-end empty states. This is why he asked
  for logic trees; he feels I built it complicated instead. The whole thing needs a coherent logic
  layer where states/counts are truthful and every surface leads somewhere sensible.
- **Glass must look PRO, not cheap** — current transparency bleeds and cheapens everything.
- **No wasted space. No dead ends. Everything clickable, centered, scrollable, truthful.**
- Tone: he is frustrated that recurring items (clickable cards, wasted space, scrollable brief,
  hideable money) were claimed-fixed but weren't. When I fix, I must VERIFY each on the live site,
  not assert.

## C. Design quality / polish (continued — second batch)

24. **Dropdowns are UGLY + overlap the content.** Studio/Money/People menus are see-through, badly
    layered, and collide with the cards/tabs behind them (e.g. "Comms agent" bleeding through the
    Studio menu on /agents). Make them solid, clean, properly elevated (z-index + opaque surface).
25. **Floating Sasa AI button touches cards.** The bottom-right orb overlaps content; it must sit
    clearly separate (safe-area padding, or a proper dock that never collides with cards).
26. **Top-right icon cluster is redundant — trim it.** Remove redundant icons. The **money-hide (eye)
    toggle must leave the top bar** and become a **small per-card toggle right where the money is
    shown** (on the "Raised this month" gauge card, "Raised all-time" card, donor balance cards,
    etc.). Also note: Sasa has two entry points (the top-right sparkle AND the floating orb) =
    redundant; consolidate. (Refines/replaces points 13–14 approach for money-hide.)
27. **"Open full view" tooltip covers the number** on the card. Tooltip placement is wrong (it sits
    on top of "$26,483"). Fix tooltip positioning. (Cards becoming clickable is good — finish that,
    but the hover label must not obscure content.)

## A. New capabilities (continued)

28. **Beneficiary intake by VOICE + AI + photos.** Nur or the field team must be able to add a
    child's profile by **voice note** (AI transcribes + structures it) and **photos**, capturing
    goals, age, story, program, school fees, needs, guardians: a **full per-child database record**.
    This is the Field/Data agent. Ties to impact reporting + child-sponsorship + the brain. PII and
    consent are critical here (children's data).

29. **Team members need full records** (same depth as beneficiaries): salary, responsibilities,
    history, engagement duration / tenure (start date), plus voice/AI intake. Today the form is only
    name / role / email / phone. Make Team a real HR-lite record (who does what, what they cost,
    how long, their history). Likely same voice+AI intake pattern as beneficiaries (#28).
    **REFINED 2026-05-26:** ~**16 team members + 10 tailors** to account for. Each member gets a
    **timeline**: ongoing tasks, pending, done, **payment history**, responsibilities, engagement
    duration. **Entry channel = the WhatsApp bot** (being set up, hopefully today): team "comes in"
    via the bot and their info auto-populates their record + timeline. Build the records + timelines
    now so WhatsApp can feed them later. Account for their work, tasks, and pay.

## Today's scope (founder wants the project "completed today")
WhatsApp / Canva / Google Drive = LATER (his call). Today = improve what's there + agentify it
truthfully. Keep import paths: drop receipts/invoices/photos on the portal (store in Supabase) and
LINK external (Drive/Dropbox/Photos URLs, since his media is scattered) so the AI can use them.
"Drop it on the portal and it creates what you need and sends it" is the Document/Report Studio goal.

## Cross-cutting pattern emerging (entities should be RICH + AI-intake)
Donors, Beneficiaries, Team are all currently thin. He wants each to be a deep record with
AI/voice/photo intake, full history, and everything that matters about that entity. The platform =
a memory-rich CRM/brain, not thin forms.

30. **Donor profile should carry an AI DRAFT, not a blank composer.** Sasa pre-drafts the
    context-appropriate message (a thank-you, or whatever the situation calls for) right there on the
    profile, ready to edit/send. Same on any entity where she'd write.
31. **Universal "Improve with AI" on anything typed manually.** Wherever Nur writes by hand (donor
    composer, inbox reply, any email/text field) there must be an "improve with AI" action.

## Scope note
Multi-tenant / white-label PARKED for now (his call 2026-05-26). Focus = improve THIS build,
especially design flaws + logic. Resale considered later.

## D2. Agentification — TRUTHFUL state (I overstated this; correcting the record)
"Agent mesh / agentic ecosystem" was hype. Real state, from `app/api/agents/tick/route.ts`:
- **Comms agent — REAL.** 5-min cron: reads new inbound mail, Claude classifies+drafts, grounds in
  past approved replies, assigns autonomy lane, files to Needs You, auto-sends only on `auto` lane.
- **Donor Steward — REAL but MISLABELED "soon"** on `agents/page.tsx:12` (it actually fires in the
  tick, `:101-130`). UI lies about its own agent. FIX the badge.
- **Sasa/Conductor — HALF.** Auto-writes the daily brief on cron (real); the chat is reactive only.
- **Grant discovery — autonomous daily**; grant PREP is a manual button (not autonomous).
- **Content / Fundraising / Field-Data agents — NOT BUILT.** Placeholder cards w/ "soon" badge
  (`agents/page.tsx:13-15`). No engine.
- **Actuator gap:** the ONLY real-world action is email (Gmail SMTP). WhatsApp / socials / Drive /
  Canva NOT connected, so "controls other platforms" is not true yet. Agents draft + write to DB.
- **Built + real underneath:** event bus, gated action_intents, autonomy dials, memory table (Comms
  learns). Solid plumbing, undersused. Same disease as the audit: substance oversold by surface.
Net: of 6 agents shown, 2 real, 1 half, 3 placeholders. One loop, one actuator (email).

## Instruction
Do NOT start building. Opinion/strategy requested 2026-05-26 (answered in chat). Audit done
(`DESIGN-LOGIC-AUDIT.md`). Await his "go" on Phase 0 / scope before touching code.
