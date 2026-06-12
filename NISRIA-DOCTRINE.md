# Nisria Doctrine

The constitution. Every surface obeys these laws. Every agent enforces them. Every "done" claim is checked against them.

The laws emerged from real failures. Each one has an ADR in /docs/decisions/ explaining the failure that made it necessary. Do not relax a law without reading its ADR.

---

## Law 1. Source-of-truth law

**The rule.** No surface ships until it is populated from the real source and verified by row count and spot check. No fabricated numbers. No half-imports. No unparsed values. No empty shells called "done." Extracted documents preserve structure: paragraphs stay paragraphs, tables become real rows and columns, numbers parse correctly, photos allocate to the right record.

**What violating it looks like.** A $129 sextillion total on the dashboard because reference numbers were read as dollar amounts. Bank statements with credits only and zero debits. Beneficiary records with the case story field showing "..." or the literal word "stub." A module that renders cards from a hardcoded array. A summary that says "$26,400 raised" without a query behind it.

**The audit query.** For any displayed number: trace it back through the code to its query, then run the query and verify the rows exist with the values claimed. For any list view: count the rows on screen, count the rows in the table, they must match. For any extracted document: open the source, open the extracted record, the structured fields must match.

**Before and after.**

Before: `const totalRaised = 26400; <Money>{totalRaised}</Money>`
After: `const { data } = await db.from('donations').select('amount').eq('status','succeeded'); const totalRaised = data.reduce((s,d) => s + d.amount, 0);`

Before: `description: m.body.slice(0, 90)` rendering raw HTML in a timeline.
After: `description: snippet(m.body, 90)` using the shared cleaner.

Before: a beneficiary card with `name: "Demo Child One"` seeded in the database.
After: a beneficiary card with a name extracted from the Kwetu Database sheet, the source_doc_id pointing at the Drive file, the confidence high, the row signed off in extraction_staging before promotion.

---

## Law 2. Currency law

**The rule.** KES and USD never sum. Each shows in its own unit. Any blended total uses labeled prevailing FX and shows its parts. Donors with KES gifts show KES. Donors with USD gifts show USD. Raised all-time counts every gift found in Drive, including bank statements, grants, and KES, converted at the prevailing market rate, with the components visible.

**What violating it looks like.** A USD total that includes KES rows summed as if they were USD. A "raised all time" figure that excludes KES gifts because nobody normalized them. A pulse bar mixing dollars and shillings. A figure displayed without a currency label.

**The audit query.**
```sql
-- Detect KES rows in USD totals
select count(*) from donations
where currency = 'KES' and amount > 1000
and exists (select 1 from <surface_using_this_donation>);

-- Detect untagged currency
select count(*) from donations where currency is null or currency = '';

-- Detect impossible USD amounts (likely KES read as USD)
select * from donations where currency = 'USD' and amount > 1000000;
```

**Before and after.**

Before: `total = donations.reduce((s,d) => s + d.amount, 0)`
After: `const usd = donations.filter(d => d.currency==='USD').reduce(...); const kes = donations.filter(d => d.currency==='KES').reduce(...); display them separately, or compute blended = usd + kes/fxRate with fxRate labeled and source shown.`

Before: `<div>${total}</div>`
After: `<Money currency="USD">{usd}</Money> <Money currency="KES">{kes}</Money>`

---

## Law 3. Local-first law

**The rule.** Every artifact opens inside the portal. Nothing links out. Beneficiary photos, grant applications, document previews, donor profiles, attachments, exports: all open in-portal, in the FocusSheet primitive. External links exist only when the artifact genuinely lives outside (a funder's submission portal, a verified third-party page) and are clearly marked as leaving the portal.

**What violating it looks like.** A beneficiary photo opening in a new tab. "Open application" bouncing to grants.gov. A document card whose click handler does `window.open(url)`. An attachment that downloads instead of previewing.

**The audit query.**
```bash
# Grep the codebase
grep -rn 'window.open\|target="_blank"\|href="http' platform/app platform/components
# Every hit must be justified or removed
```

**Before and after.**

Before: `<a href={photoUrl} target="_blank">View photo</a>`
After: `<button onClick={() => openSheet({type:'photo', url:photoUrl})}>View photo</button>` with the photo rendering in the FocusSheet via a signed URL.

Before: Grant card "Open application" → `window.open(grant.url)`
After: Grant card "Review application" → opens FocusSheet with the application body rendered natively, with a small "Open at funder" footer for the moment of actual submission.

---

## Law 4. Browser-OS law

**The rule.** The shell is a browser. Launchpad is the new-tab page. Tabs open, switch, keep state, close. No forced pinned strip. One navigation metaphor. Glance = popup. Work = tab. Two ways in: type (Spotlight ⌘K) or see (Launchpad / Mission Control).

**What violating it looks like.** A red "keeping structure" tab strip that auto-pins pages. Tabs that re-navigate and lose state on switch. Tab titles showing raw UUIDs. Two competing navigation systems (a side nav and a tab strip both claiming primacy).

**The audit query.** Open three different surfaces, type into each, switch tabs, return. Edits must persist. Tab titles must be human-readable. The pinned strip must not exist. Cmd-K must find any record across the system.

**Before and after.**

Before: clicking a grant card replaces the current page; back loses your inbox draft.
After: clicking a grant card opens a Workspace tab; switching to inbox preserves the grant tab; returning to the grant tab restores its scroll, its open peek, its draft text.

---

## Law 5. Drill-to-core law

**The rule.** Every list row opens a complete profile, to the beneficiary-profile standard. Campaigns, donors, contacts, team, grants, documents: all drill to a full record with identity, history, related entities, and actions. From a person's profile you assign a task. From a campaign profile you see every donation. From a document you see every field it sourced.

**What violating it looks like.** A campaign card that has no detail page. A contact list with no contact-detail route. A donor row that opens a small peek but no full profile. A document that links to Drive instead of opening as a record.

**The audit query.**
```bash
# Every list view must have a corresponding [id] route
find platform/app -name 'page.tsx' -path '*/[A-Za-z]*/page.tsx' | while read p; do
  dir=$(dirname "$p")
  [ -d "$dir/[id]" ] || echo "Missing detail route: $dir"
done
```

**Before and after.**

Before: `<tr onClick={() => peek(campaign)}>` opening a 280px popup with three fields.
After: `<Link href={'/campaigns/'+campaign.id}>` opening a full profile with goal, raised, donations list, donor list, timeline of activity, and editable actions.

---

## Law 6. Real-action law

**The rule.** Every send, move, or submit truly executes. Every action shows loading → success → confirmation. Honesty when something is a draft, not a submission. A button called "Submit grant" actually submits the grant. A button called "Prepare draft" says "draft" not "submit."

**What violating it looks like.** A "Submit grant application" button that drafts an application internally and shows "submitted" to the user. A "Send" button that flashes nothing and you don't know if it sent. A "Newsletter campaign" button that does nothing because the integration was never wired.

**The audit query.** For each action button: trace from onClick to the actual side effect. The label must match the side effect. Loading state must render. Success state must render. Error state must render.

**Before and after.**

Before: `<Button onClick={prepareGrant}>Submit</Button>` where prepareGrant only writes a draft.
After: `<Button onClick={prepareGrant}>Prepare draft</Button>` and a separate `<Button onClick={submitGrant} disabled={!draftReady}>Submit to funder</Button>` that actually emails the submission.

---

## Law 7. One-brain law

**The rule.** Sasa sees all email and all WhatsApp. Sasa can read and send any kind of message. Smart mode accepts attachments. Sasa is one omniscient brain across the org's communications, grounded in the Brain (agent_memory org_facts), and acts within the portal's structure (creating tasks, drafting emails, populating records).

**What violating it looks like.** Sasa that can read email but not WhatsApp. Sasa that drafts but cannot send. Smart mode that returns navigation cards instead of doing the thing. Sasa that doesn't know the org's mission or programs because the Brain isn't loaded.

**The audit query.** Ask Sasa five questions: "What did Vrundaa say last week?" (email), "What's the latest from the field team?" (WhatsApp), "Draft a thank you to Havar for the $500 gift" (composer), "Create a task for the design lead to review the SANARA report" (action), "What's our 2026 funding gap?" (Brain). All five must work.

---

## Law 8. Field-nervous-system law

**The rule.** One WhatsApp bot holds a personal 1:1 relationship with each team member and with Nur. It onboards people on first contact, collects their missing info, lets them pick a language. It ships everything to the portal. It escalates only payments and urgent things to Nur. It feeds inventory: each item gets a code and a photo against a catalogue.

**What violating it looks like.** A WhatsApp integration that's just a forwarder. A bot that doesn't know who's writing. A bot that escalates routine confirmations to Nur. A bot that requires English. Inventory captured manually after a WhatsApp message instead of from the message.

**The audit query.** Each team member's record must show: bot conversation history, onboarding completion, chosen language, last contact, current state. Inventory items captured via WhatsApp must show source: whatsapp, photo attached, code assigned automatically.

---

## Law 9. Earn-your-place law

**The rule.** Every module, card, and section holds real current value or it is removed. Money lives in one place. Dead surfaces get killed, not preserved as shells.

**What violating it looks like.** An "Agent activity" tab that takes space and says "no activity yet." A Home "Recent activity" card duplicating what's in Workspace. A "Fundraising" block on Home when Finance is the home for money. An Outreach page that's been empty for months.

**The audit query.** For each navigable surface: does it show data right now? Has it shown real data in the last 30 days of operation? If no to both, remove it.

**Before and after.**

Before: 21 nav entries including Outreach (empty), Newsletter (broken), Content (placeholder), Library (unused), Agent Activity (empty).
After: 12 nav entries, all of which load real data and serve a real workflow. The removed five are archived for future revival when the data exists.

---

## Law 10. Uniform-filter law

**The rule.** One commercial-grade filter component used everywhere. Like Bayut's "More Filters." A real dropdown panel, uniform across the whole platform. Legal categories, beneficiary cohorts, grant tiers, donor segments, finance categories all use the same component. Data is always arranged sequentially.

**What violating it looks like.** Five different filter UIs across five modules. Inline filter chips on one page, a sidebar select on another, a top bar dropdown on a third. A "category" filter that's a free-text input.

**The audit query.** Visit every list view. Count the distinct filter UI patterns. There must be exactly one.

---

## Law 11. Honesty law

**The rule.** No "done" without proof attached. Every claim of completion must include the audit query that proves it, the row counts before and after, the screenshot of the verified state, the source link for every figure. "Done" without evidence is a lie. This law exists because the through-line from CORTEX being "too convoluted" to the 31 corrections was the same pattern: shells declared done, unverified data shipped as truth.

**What violating it looks like.** "Pass 0 done. Money is fixed." with no audit output. "Workspace refactored." with no screenshot. "Beneficiary photos attached." with no count and no spot-check.

**The proof template.**
```
PASS/TASK: <name>
SCOPE: <what was in scope, what was not>
LAWS ENFORCED: <which laws govern this work>
EVIDENCE:
  - Audit query: <query> → <result before> → <result after>
  - Row counts: <before> → <after>
  - Spot checks: <three random records verified against source>
  - Screenshots: <paths>
  - Sub-agent reports: <doctrine-reviewer output, money-truth-auditor output>
KNOWN GAPS: <what is deliberately left and why>
SIGN-OFF: pending operator review
```

Every pass ends with this template filled in. No exceptions.

---

## Law 12. Test-mode law

**The rule.** Taona is the standing developer of the bot fleet. Every outbound chokepoint (`lib/whatsapp.ts:sendTextAndLog` and equivalents) accepts `opts.dev === true`. When true: the send is rerouted to `devPhone()` (DEV_PHONE env, fallback `971501168462`), the `messages` insert is skipped, the medic dispatch is skipped, the pre-send alarm emit is skipped, and the body is prefixed `[DEV]`. Sanitiser still runs so dev sees what prod would have sent. Test traffic NEVER lands on Nur and NEVER persists.

**What violating it looks like.** A "smoke test" script that calls the Meta Graph API directly, bypassing the chokepoint. A `TEST_MODE=1` env that silently leaves prod sends going to dev. A side-door `sendDevTest()` function that skips the sanitiser and medic. Any persisted row in `messages` tagged as a test.

**The pattern.** One chokepoint, one explicit per-call branch. Greppable, audit-friendly, can't drift between sessions. Same shape as the jensen-pa fleet sibling (Law 10 there, Law 12 here — same intent).

**How to apply.**
- Pre-deploy wire test: `node scripts/dev-ping.mjs "your test"` — fires through the chokepoint dev branch
- Cron-route verification: pass `dev: true` from a one-off invocation
- Eval runs that need to exercise the send path without polluting Nur's transcript

---

## How to use the doctrine

When starting work on a surface, identify which laws govern it and load only those plus the nested CLAUDE.md.

When proposing a change, name the law it serves and the law it might risk.

When claiming done, fill the proof template, run the sub-agents, attach the output.

When in doubt, the doctrine wins. If the doctrine seems wrong, write a new ADR proposing the change. Do not silently violate.
