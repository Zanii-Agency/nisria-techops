# Nisria Command Center — Design + Logic + Function Audit

> Read-only product audit. No code was changed. Grounded in the actual codebase at
> `/Users/milaaj/Code/nisria-techops/platform` (Next.js 14 App Router, TS, RSC + server
> actions, Supabase). Live at https://command.nisria.co. Date: 2026-05-26.

## Scope & method

- Cross-referenced every one of the founder's 31 corrections in `FEEDBACK-ROUND-2026-05-26.md`
  against the source, traced each known bug to the **exact line(s)** that cause it, and
  hunted for net-new issues he did not list.
- Every count shown on a surface was traced to the query/function that produces it.
- Findings are severity-ranked and each cites the world standard it violates.

## Standards used (cited per finding)

1. **NN/g 10 Usability Heuristics** — H1 Visibility of system status, H2 Match real world,
   H3 User control/freedom, H4 Consistency & standards, H5 Error prevention, H6 Recognition
   over recall, H7 Flexibility/efficiency, H8 Aesthetic & minimalist, H9 Help users recover
   from errors, H10 Help/docs.
2. **WCAG 2.2 AA** — 1.4.3 Contrast (Text), 1.4.11 Non-text Contrast, 2.4.3 Focus Order,
   2.4.7 Focus Visible, 2.5.3 Label in Name, 2.5.8 Target Size (Minimum), 4.1.2 Name/Role/Value.
3. **Apple HIG + Refactoring UI** — spacing scale, hierarchy, real material/vibrancy vs cheap transparency.
4. **Best-in-class product bar (Linear / Stripe / Superhuman)** — zero dead-ends, density, restraint.
5. **Single-source-of-truth state model** — every number on screen must trace to one query,
   so Inbox / Tasks / Needs-You can never disagree.

---

## A. THE KNOWN BUGS — root cause traced in code

### BUG-1 (CRITICAL) — Dashboard "Inbox · need a reply = 0" and "Open tasks = 0" while there is real work

**Location:** `app/page.tsx:24`, `app/page.tsx:101`, `app/page.tsx:23`, `app/page.tsx:102`;
collides with `app/api/agents/tick/route.ts:87` and `app/inbox/page.tsx:50,53,61`.

**Cause — two independent definitions of "needs a reply" that disagree by design.**

The dashboard Inbox KPI counts only messages still in `status="new"`:

```ts
// app/page.tsx:24
db.from("messages").select("id", { count: "exact", head: true })
  .eq("direction", "in").eq("status", "new").eq("sender_type", "individual"),
// rendered at app/page.tsx:101  <div className="value">{num(newMsgs || 0)}</div> ... "need a reply"
```

But the agent tick **flips every processed message to `status="drafted"`** the moment it drafts a reply:

```ts
// app/api/agents/tick/route.ts:87
await db.from("messages").update({ status: "drafted", handled_by: "agent:comms" }).eq("id", m.id);
```

The inbox page, however, counts a message as "needs attention" if it is `new` **OR** `drafted`:

```ts
// app/inbox/page.tsx:50
if (m.direction === "in" && (m.status === "new" || m.status === "drafted") && m.sender_type === "individual") conv.unread++;
// app/inbox/page.tsx:53  if (f === "needs") convs = convs.filter((c) => c.unread > 0);
// app/inbox/page.tsx:61  const newCount = convs.reduce((s, c) => s + c.unread, 0);
```

So the instant Sasa drafts, the message leaves the dashboard count (`new` → `drafted`) but
stays in the inbox count → dashboard shows **0** while the inbox shows **2 need attention**.
They are literally two queries with two filters. This is the canonical single-source-of-truth violation.

**"Open tasks = 0":** the dashboard does not run a count query at all. It reuses the *list*
it fetched for the Tasks card, which is **capped at 7 rows**, then takes `.length`:

```ts
// app/page.tsx:23  db.from("tasks").select(...).neq("status","done").limit(7)
// app/page.tsx:102  <div className="value">{num((tasks || []).length)}</div> ... "across the team"
```

If there are 0 open tasks it reads 0 (plausibly correct), but if there are >7 it silently
caps at 7 — the number is not a real count, it is "length of a truncated preview list." The
KPI and the underlying truth are not the same query. (Standards: **H1 Visibility of system
status**, **single-source-of-truth**.)

**Fix (simpler):** one server function `getCounts()` returns `{ needsReply, openTasks,
needsYou, donors }` from one place. Define "needs reply" once = inbound + individual +
`status in ('new','drafted')`. Dashboard Inbox KPI and inbox header both read it. Tasks KPI
uses a real `head:true` count, not `list.length`.

---

### BUG-2 (CRITICAL) — Needs You shows duplicate reply cards (e.g. two identical "Reply to sameer patil")

**Location:** `app/api/agents/tick/route.ts:61-74` vs the dedup that exists at
`app/donations/actions.ts:18-32`.

**Cause — the email-reply path has no "already drafted for this message?" guard, while the
thank-you path does.** When the tick drafts a reply it inserts an approval *unconditionally*:

```ts
// app/api/agents/tick/route.ts:61  createIntent({... idempotency_key: `reply:${m.id}` })
// app/api/agents/tick/route.ts:68
const { data: approval } = await db.from("approvals").insert({
  kind: "email_reply", title: `Reply to ${fromName}`, ...
```

The intent has an idempotency key, but the **approval insert does not check for an existing
pending approval for the same `message_id`**. Two ways this duplicates:

1. A message reopened by a reject (`gateway.ts:121` sets the message back to `status:"new"`)
   gets re-drafted on the next tick → second approval, same title.
2. If the intent insert hits a duplicate key, `createIntent` swallows it and returns
   `data = null` (`gateway.ts:43`), but the code **still inserts the approval** with
   `intent_id: intent?.id || null` (line 74) — so you get an orphan duplicate card that can't even send.

Contrast the thank-you path, which is correct — it checks BOTH the intent key and any
existing approval before queuing:

```ts
// app/donations/actions.ts:18-32  alreadyQueued() → checks intent key AND
//   db.from("approvals")...eq("kind","donor_thankyou").eq("context->>donation_id", donationId)
```

The email-reply path needs the same guard. (Standards: **H5 Error prevention**,
**data integrity / single-source-of-truth**.)

**Fix:** before inserting an `email_reply` approval, `select id from approvals where
kind='email_reply' and status='pending' and context->>message_id = m.id` → skip if present.
Mirror `alreadyQueued`.

---

### BUG-3 (HIGH) — Needs You cards do not show which account (sasa@ vs maisha@) the mail is from

**Location:** card render `components/ApprovalCard.tsx:44-53` (title is only `a.title` =
`"Reply to <name>"`), data origin `app/api/agents/tick/route.ts:70-72`.

**Cause — the account is never carried into the approval.** The tick selects the message but
**does not select `m.account`** (see select at `tick/route.ts:27-28`, which omits `account`),
and the approval `context` it writes (`tick/route.ts:72`) stores `message_id, contact_id,
subject, from, category, correlation_id, original` — **no account**. So the card has nothing
to display. The inbox page already has account labeling logic that could be reused:

```ts
// app/inbox/page.tsx:63
const acctLabel = (m:any) => m?.account === "maisha@nisria.co" ? "Maisha"
  : m?.account === "sasa@nisria.co" ? "Nisria" : (m?.channel && m.channel !== "email" ? m.channel : "");
```

**Fix:** add `account` to the tick's message select, store it in approval `context.account`,
and render a `<chip>` (reuse `.chip.nisria` / `.chip.maisha`) on the card. Empty state should
read "Nothing needs you yet." (See also the empty-state wording, FB-9.)

---

### BUG-4 (HIGH) — Donor & contact timelines render RAW HTML/CSS (`@media…`, `<!doctype html>`, `</sty`)

**Location:** `app/donors/[id]/page.tsx:65` and `app/contacts/[id]/page.tsx:38`.

**Cause — `cleanEmail` is applied to the conversation thread but NOT to the timeline `meta`.**
The timeline pushes the *raw body slice*:

```ts
// app/donors/[id]/page.tsx:60-67
for (const m of msgs)
  timeline.push({ ... meta: (m.body || "").slice(0, 90), ... });   // RAW — no cleanEmail
```
```ts
// app/contacts/[id]/page.tsx:38   meta: (m.body || "").slice(0, 90),  // RAW — no cleanEmail
```

Meanwhile the conversation thread right below it IS clean:

```ts
// app/donors/[id]/page.tsx:249   <div>{cleanEmail(m.body || "") || ...}</div>
// app/contacts/[id]/page.tsx:142  <div>{cleanEmail(m.body || "") || ...}</div>
```

A 90-char slice of a marketing/MJML email = `@media only screen and (min-width:480px){...} </sty`.
That is the exact garbage the founder screenshotted. (Standards: **H2 Match real world**,
**H8 Aesthetic & minimalist**, **single source of truth** — one render path for email bodies.)

**Fix:** wrap the timeline meta: `meta: snippet(m.body || "", 90)` (the `snippet` helper at
`lib/email-render.ts:30` already does cleanEmail+truncate). One-word change in two files.

**Sub-finding (NEW):** the donor conversation thread on the 360 page is **capped at 60 messages**
(`donors/[id]/page.tsx:40` `.limit(60)`) and the surrounding card has no `max-height`/scroll —
contradicts FB-10's "retrieve ALL emails, be scrollable." Marked NEW-7 below.

---

### BUG-5 (HIGH) — Money figures that DON'T blur with the hide toggle

The blur rule only targets `.hide-money .money` (`globals.css:385`). Anything missing the
`.money` class stays sharp. Enumerated:

| Figure | Location | Has `.money`? |
|---|---|---|
| **Finance "Withdrawn from Givebutter $27,652"** | `app/finance/page.tsx:238-240` (the `<div style=…26px>` wrapping `<Money>`) — `<Money>` itself adds `.money`, so this one **is** covered. OK. | yes (via `<Money>`) |
| **Finance "Paid out in Kenya KES …"** | `finance/page.tsx:259-261` via `<Money>` | yes |
| **Campaigns "raised / of goal"** | `app/campaigns/page.tsx:31-32` — `<span className="strong">{money(raised)}</span>` and `<span>of {money(goal)}…</span>` | **NO — both bare** |
| **Contact 360 "lifetime giving"** | `app/contacts/[id]/page.tsx:73` `<div className="ftitle">{money(lifetime)}</div>` | **NO** |
| **Contact 360 gift rows** | `app/contacts/[id]/page.tsx:84` `<span className="strong">{money(d.amount)}</span>` | **NO** |
| **Donor 360 timeline gift titles** | `app/donors/[id]/page.tsx:71` `title: \`Gift ${money(g.amount)}…\`` (and contacts `:39`) | **NO — inside a string, unblurrable as-is** |
| **Dashboard bar-chart tooltip** | `app/page.tsx:43` `tip: money(val)` → rendered in `.bartip` (`charts.tsx:29`) | **NO** |
| **Team "open tasks" badges / Finance category subtotals** | various | n/a (not money) |

The founder's specific complaint "Raised all-time $26,483" — note that on the **current**
dashboard `app/page.tsx:99` it IS `className="value money"`, so all-time is covered there.
But **Raised-this-month** (`page.tsx:91`) and **goal** (`page.tsx:92`) are covered, good.
The leaks are on Campaigns, Contact 360, and the two 360 timelines + the chart tooltip.
(Standards: **H4 Consistency & standards**.)

**Fix:** add `className="money"` to the campaign and contact-360 amounts. For amounts baked
into a string (timeline titles, chart tooltip) split the number into its own `<span className="money">`.

---

### BUG-6 (HIGH) — Dropdown menus overlap / bleed through the tab strip and content; glass is cheap

**Location:** `globals.css:78` (`.topnav` z-50 + sticky), `globals.css:120` (`.dropmenu`
z-80, `position:absolute; top:48px`), `globals.css:130` (`.tabbar` — **no position, no z-index**),
glass token `globals.css:23` `--glass-2: rgba(255,255,255,0.66)`.

**Cause — three compounding issues:**

1. **No z-index scale; the tab bar is unlayered.** `.topnav` is `position:sticky; z-index:50`
   which **creates a stacking context**. The dropdown (`z-index:80`) lives *inside* that context
   and is `position:absolute; top:48px`, so it extends downward into the visual band where the
   `.tabbar` renders. `.tabbar` is statically positioned with no z-index, so it cannot be lifted
   above and is painted behind — but because the dropdown surface is **66% opaque glass**, the
   tab labels and the cards beneath show straight through. On `/agents` the founder saw
   "Comms agent" bleeding through the Studio menu — same root cause.
2. **The dropdown is rendered inside `.navpills` which is inside the pill bar with `padding:0 12px`**,
   not portaled — so it is clipped/constrained by the nav's own box and can't escape cleanly.
3. **Glass is too transparent** for an overlay surface: `--glass-2` at 0.66 alpha over a blurred
   backdrop reads as "see-through," not Apple-grade vibrancy (real macOS menus are near-opaque
   with a subtle tint). Same token powers `.dropmenu`, `.login-card`, `.dock-panel`, `.cmdk-panel`.

(Standards: **Apple HIG material/vibrancy**, **1.4.11 Non-text Contrast** (menu vs background),
**H8 Aesthetic & minimalist**, **Refactoring UI** layering.)

**Fix (simpler, kills several findings):** introduce a real z-index scale (`--z-nav:50;
--z-dropdown:200; --z-dock:300; --z-cmdk:400; --z-modal:500`). Make `.dropmenu` use a
**solid/near-opaque** surface (`rgba(255,255,255,0.96)` + 1px hairline + the existing shadow,
drop the heavy blur) so nothing bleeds. The same opaque token fixes FB-16/FB-24.

---

### BUG-7 (MEDIUM) — Peek modal & Needs-You expanded popup: centering + glass + overflow

**Location:** `globals.css:389-391` (`.peek-overlay` / `.peek-panel`), `ApprovalCard.tsx:80-107`,
`DonorPeek.tsx:46-93`.

**Findings:**
- The overlay **is** centered (`.peek-overlay { display:grid; place-items:center }`,
  `globals.css:389`) — so the "goes down / not centered" symptom is **not** the overlay itself.
  The real cause: the peek panel uses the **`.card` glass** (`<div className="peek-panel card">`)
  which is `--glass` at **0.48 alpha** (`globals.css:23`/`176`) → the cheap see-through the
  founder flags in FB-16. On a busy page the content behind bleeds through the modal.
- **Content overflow / helper text bleeding outside the card** (FB-15): the DonorPeek helper
  line "The thank-you drafts into Needs You…" (`DonorPeek.tsx:89-91`) sits **after** the
  action row with no bottom padding accounting for it; `.peek-panel` has `padding:24px` but the
  feature card + rows can push the panel taller than `max-height:88vh` and the inner content is
  the scroll owner only on `.peek-panel` (`overflow-y:auto`), while nested `.feature`/`.peek-quote`
  have their own scroll — double scroll + tight padding makes the last line look like it bleeds.
- **"goes down" on click:** `DonorPeek` / `DonationPeek` triggers are `<button className="linkbtn">`
  *inside a table cell*; opening sets local state and the modal is `position:fixed`, so it should
  center — but the table row stays the scroll anchor. If the table is scrolled, the fixed overlay
  is correct; the perceived "down" is from the modal's `place-items:center` + `padding:5vh 20px`
  combined with very tall peek content (no internal scroll on the panel beyond 88vh) pushing the
  visible portion below the fold.

(Standards: **Apple HIG material**, **H8 Aesthetic & minimalist**, **single modal primitive**.)

**Fix:** one shared `<Modal>` primitive with a **near-opaque** surface (not `.card` glass),
fixed centering, single internal scroll, consistent padding. Replace the four hand-rolled
`.peek-overlay` instances (ApprovalCard, DonorPeek, DonationPeek, CampaignPeek, GrantPeek,
BeneficiaryPeek) with it.

---

### BUG-8 (MEDIUM) — TWO search bars

**Location:** top-nav omnibox `components/AppFrame.tsx:121-123` ("Search anything… ⌘K"),
home hero `components/HeroSearch.tsx:7-12` ("Search or jump to… ⌘K"). **Both** just dispatch
`new Event("open-cmdk")` — they open the *same* command palette. So there are two triggers
for one action, which is pure redundancy. (Standards: **H8 Aesthetic & minimalist**,
**H4 Consistency**, Linear/Superhuman restraint.)

**Fix:** keep the top-nav omnibox (always visible, ⌘K is the muscle-memory pattern), delete
`HeroSearch` from `app/page.tsx:65`. Reclaim the hero space for something real (see FB-23).

---

## B. NET-NEW issues the founder did not list (marked NEW)

| ID | Location | Cat | Sev | Standard | Evidence / Fix |
|---|---|---|---|---|---|
| **NEW-1** | `globals.css:284-286` inputs use `border:1px solid var(--hairline)` and focus ring `box-shadow:0 0 0 3px rgba(0,196,194,0.15)`; nav pills/omnibox/tabs have **no `:focus-visible`** style at all | A11y | **High** | **2.4.7 Focus Visible**, **4.1.2** | Keyboard users get no visible focus on the entire top nav, tabs, dropdown links, pills, and icon buttons. Add a global `:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px }`. |
| **NEW-2** | Icon-only buttons: `.iconbtn` 38×38 (`globals.css:106`), `.tab .x` **17×17** (`globals.css:138`), `.tab-add` 28×28, `.expandbtn` ~24px (`globals.css:392`), `.mic`/`.send` 42px | A11y | **High** | **2.5.8 Target Size (24px min)** | The tab close `×` (17px) and expand button are below the 24px AA minimum. Several icon buttons also lack `aria-label` (e.g. `HeroSearch` go button has one, but `.expandbtn` relies on `title` only). |
| **NEW-3** | Contrast: `--faint:#93A4A3` on `--glass`/white (`globals.css:20`); used for `.delta`, `.fmeta`, `.mr-time`, `blabel`, most "meta" text | A11y | **High** | **1.4.3 Contrast (4.5:1)** | `#93A4A3` on white ≈ 2.6:1 — fails AA for normal text. `--muted:#5F7574` ≈ 4.7:1 (borderline pass). Nearly every secondary label uses `faint`. Darken `--faint`. |
| **NEW-4** | `NotifBell.tsx:14` polls `GET /api/agents/tick` every 60s for `pending_approvals`; dashboard "Needs you" badge uses `approvals.length` from `page.tsx:22` (limit 12) | Logic | **Medium** | single-source-of-truth | Bell count (true pending count, `tick/route.ts:180`) and the dashboard "Needs you" badge (`page.tsx:107`, capped at 12) can disagree once >12 pending. Same disease as BUG-1. |
| **NEW-5** | `Live.tsx:13` `setInterval(router.refresh, 15000)` on the dashboard **plus** `NotifBell.tsx:16` 60s poll **plus** `force-dynamic` everywhere | Function | **Medium** | H1 / performance | The dashboard hard-refreshes server components every 15s, re-running ~7 Supabase queries each time, while any open peek/compose modal loses unsaved edits on refresh (state is client-local). A focus listener also refreshes. Edits in the inbox composer / ApprovalCard textarea can be wiped mid-typing. |
| **NEW-6** | `ApprovalCard.tsx:69` non-editable approvals render `<pre>{JSON.stringify(a.proposed,null,2)}</pre>` | Design/Function | **Medium** | H2 Match real world, H8 | Any approval kind that isn't `email_reply`/`donor_thankyou` dumps **raw JSON** at the user. Dead-end, not human. |
| **NEW-7** | `donors/[id]/page.tsx:40` `.limit(60)`; conversation card (`:216-257`) has no max-height/scroll | Function | **Medium** | FB-10 intent, H7 | Contradicts "retrieve ALL emails + scrollable." Same on contacts 360. |
| **NEW-8** | `app/donations/page.tsx:115` `Recurring` column header but mobile has no responsive table; `.mail` is `height: calc(100vh - 240px)` fixed (`globals.css:356`) | Design | **Low** | Responsive / HIG | Tables and the 2-pane mail client don't reflow under ~700px; the mail grid `344px 1fr` will squash. No mobile story despite "field team" use cases (FB-28). |
| **NEW-9** | `AppFrame.tsx:91` Back button calls `router.back()` unconditionally | Function | **Low** | H3 User control | On first load `router.back()` can leave the app entirely (browser history). No disabled state when there's nowhere to go. |
| **NEW-10** | `MoneyToggle.tsx:11` reads `localStorage` in `useEffect` → first paint always shows money, then blurs (FOUC) | Design/Privacy | **Low** | H1, privacy intent | A privacy toggle that flashes the real numbers on every navigation defeats its purpose. Also the toggle is global (FB-26 wants it per-card). |
| **NEW-11** | `inbox/page.tsx:74` "+ Add account" links to `/team`; `Add account` pill in inbox filter row | Function | **Low** | H2, dead-end | "Add account" (a mailbox) routing to the **Team** (HR) page is a mismatched mental model — a dead-ish end. |
| **NEW-12** | `agents/page.tsx:129` `laneTone[r.output?.lane]` — `output` may be undefined for error/old runs | Logic | **Low** | robustness | Optional-chained, won't crash, but renders `gray` "error" badges inconsistently. Minor. |
| **NEW-13** | `globals.css:7` imports Inter from Google Fonts via `@import url(...)` in CSS | Performance | **Low** | Refactoring UI / perf | Render-blocking `@import` in the global stylesheet; should use `next/font`. Also the design comment claims "Satoshi" but only Inter is loaded (`globals.css:3` vs `:7`). |
| **NEW-14** | `app/page.tsx:13` `MONTHLY_GOAL = 5000` hard-coded; gauge `goalPct` (`:56`) can exceed 100% with no clamp on the label (the `Gauge` arc clamps at `charts.tsx:6`, but the `%` text doesn't) | Logic | **Low** | H1 truthfulness | A great month shows e.g. "143% of goal" with a full ring — fine, but the goal itself is a magic constant, not configurable in Settings. |

---

## C. The 31 corrections → merged master backlog

Mapped to standard(s), severity, and the file that must change. Use this as the build list.

| # | Founder item | Standard(s) | Sev | File(s) to change |
|---|---|---|---|---|
| 1 | Document Studio (AI doc creation, drag-drop, branded out) | New capability; H7 Flexibility | High | new `app/studio/*`, `lib/agents/*`, PDF via headless-Chrome HTML/CSS (per global pref) |
| 2 | Finance: AI-populate expenses via drag-drop / voice | New capability | High | `app/finance/*` + `app/api/smart` (vision), new intake action |
| 3 | Reports tab | New capability | High | new `app/reports/*` (ties #1/#2) |
| 4 | Kenya reconciliation — upload past receipts, accept incomplete history | Logic / H9 | High | `app/finance/page.tsx:122-134` (kenyaRows), `finance/actions.ts` upload + `logPayout` |
| 5 | First-run Onboarding in Settings (the brain/memory) | New capability; H10 | High | `app/settings/*`, `lib/memory.ts` |
| 6 | Grants: auto-select + auto-prepare ALL, always ready | Logic / H7 | High | `app/grants/page.tsx:36-48` (researching column), `app/api/grants/refresh`, `grants/actions.ts:prepareGrant` (make auto) |
| **7** | **Inbox "needs a reply"=0 wrong; counts must reconcile** | **single-source-of-truth, H1** | **Critical** | **`app/page.tsx:24,101-102` + `app/inbox/page.tsx:50,61` + `tick/route.ts:87`** → one `getCounts()` |
| **8** | **Needs You repeating/duplicate cards** | **H5, data integrity** | **Critical** | **`app/api/agents/tick/route.ts:61-74`** (add `alreadyQueued`-style guard) |
| **9** | **Needs You doesn't show account (sasa@/maisha@) + empty state** | **H6 Recognition, H1** | **High** | **`tick/route.ts:27,72` (carry `account`) + `ApprovalCard.tsx:44-53` + `page.tsx:109`** |
| **10** | **Donor timeline raw HTML; retrieve all, scrollable, send from timeline** | **H2, H8** | **High** | **`app/donors/[id]/page.tsx:65,40,216` + `app/contacts/[id]/page.tsx:38`** (use `snippet`, remove limit, add scroll) |
| 11 | Donations link to donor profile (like donors do) | H4 Consistency | Medium | **already done** via `DonationPeek.tsx:68-85` → "Open donor profile". Verify the *row* (not just peek) and the donations table name cell behave like donors. |
| 12 | Money/People/Studio dropdowns overlap tab strip (z-index) | Apple HIG, 1.4.11 | High | `globals.css:78,120,130` (z-scale + opaque surface) |
| 13 | Sasa brief not scrollable | H7 | Medium | `app/page.tsx:77` has `maxHeight:138; overflowY:auto` — **appears fixed**; verify live (founder says recurring lie). |
| 14 | Money not hideable (Raised all-time + balances) | H4 | High | see BUG-5 table (Campaigns, Contact 360, 360 timelines, chart tip) |
| 15 | Donor peek wrong place / not centered / content overflow | Apple HIG, H8 | Medium | `globals.css:389-391`, `DonorPeek.tsx:46-91` (shared Modal primitive) |
| 16 | Needs You popup not centered + cheap glass | Apple HIG material, 1.4.11 | High | `globals.css:389-391` (use opaque surface), `ApprovalCard.tsx:80` |
| 17 | Top bar should transform per tab | H7, design | Medium | `AppFrame.tsx:70-147` (contextual top bar per route) |
| 18 | "Add a grant" placement strange | H8, H4 | Medium | `app/grants/page.tsx:166-180` (move to button→modal/header) |
| 19 | Paid history takes too much space — collapse by default | H8 | Medium | `app/finance/page.tsx:167-171` + render (wrap in `<details>`) |
| 20 | Remove avatar stack "W H E S A +55" under Donors | H8, H2 | Medium | `app/page.tsx:100` (`<AvatarStack names={donorNames} />`) + `charts.tsx:39` |
| 21 | TWO search bars — keep one | H8, H4 | Medium | delete `HeroSearch` (`app/page.tsx:2,65` + `components/HeroSearch.tsx`); keep omnibox `AppFrame.tsx:121` |
| 22 | Empty Tasks card sends her elsewhere; ask Sasa inline | H3, H7 | Medium | `app/page.tsx:118` (inline Sasa ask, dispatch `sasa-ask` event like ActionChips) |
| 23 | Wasted space (Fundraising chart mostly empty) | H8, density | Medium | `app/page.tsx:145-148`, `charts.tsx:20-37` (denser chart or merge cards) |
| 24 | Dropdowns ugly/see-through/overlap | Apple HIG, 1.4.11 | High | same as #12 — `globals.css:120` opaque |
| 25 | Floating Sasa orb touches cards | H8, spacing | Medium | `globals.css:312` `.dock` bottom/right safe-area; or dock that reserves a gutter |
| 26 | Trim top-right icon cluster; move money-hide to per-card; Sasa has 2 entry points | H8, H4 | High | `AppFrame.tsx:120-142` (remove redundant; consolidate Sasa sparkle vs orb), `MoneyToggle.tsx` → per-card eye |
| 27 | "Open full view" tooltip covers the number | H8, 1.4.3 | Medium | `ApprovalCard.tsx:51` + card KPIs use native `title=` → replace with positioned tooltip not over content |
| 28 | Beneficiary intake by voice + AI + photos; PII/consent | New capability | High | `app/beneficiaries/*`, new intake; reuse `VoiceDock` mic + `api/smart` vision |
| 29 | Team members = full HR-lite records + voice/AI intake | New capability | High | `app/team/page.tsx` (form is only name/role/email/phone, `:57-61`), `team/actions.ts` |
| 30 | Donor profile carries an AI DRAFT, not blank composer | H7, H6 | Medium | `app/donors/[id]/page.tsx:259-274` (pre-fill via steward draft) |
| 31 | Universal "Improve with AI" on any manual text field | H7 | Medium | exists on `ApprovalCard.tsx:21-29` (`/api/improve`); extend to `donors/[id]` composer, inbox `sendReply` form (`inbox/page.tsx:143-154`), contacts composer |

---

## D. Systemic root causes (fix these 6 and most findings collapse)

1. **Counts are computed per-component instead of from one source of truth.**
   Dashboard `newMsgs` (`page.tsx:24`, `status="new"`), inbox `unread` (`inbox/page.tsx:50`,
   `new`|`drafted`), bell (`tick/route.ts:180`, all pending), tasks-as-list-length (`page.tsx:23`).
   → BUG-1, BUG-2's symptom, NEW-4. **Fix:** a single `lib/counts.ts getCounts()` with canonical
   definitions, consumed everywhere. This is the "logic tree" the founder keeps asking for.

2. **No z-index scale + glass tokens too transparent.** Magic z-values (50/60/80/100/120) and
   `--glass*` at 0.34–0.66 alpha used for *overlays* (menus, modals, dock). → BUG-6, BUG-7,
   FB-12/15/16/24/25. **Fix:** named `--z-*` scale + a dedicated **opaque** `--surface-elevated`
   token for anything that floats over content (menus/modals stop bleeding).

3. **No single modal/overlay primitive.** Six hand-rolled `.peek-overlay` copies
   (ApprovalCard, DonorPeek, DonationPeek, CampaignPeek, GrantPeek, BeneficiaryPeek) each set
   their own `maxWidth`, padding, scroll, surface. → centering/overflow/glass inconsistencies.
   **Fix:** one `<Modal>` component; delete the duplication.

4. **Two email-rendering paths; only one cleans.** `cleanEmail`/`snippet` exist
   (`lib/email-render.ts`) but timelines bypass them (`donors/[id]:65`, `contacts/[id]:38`).
   → BUG-4. **Fix:** never render `m.body` raw anywhere; a single `<EmailText>`/`snippet()` is the
   only allowed path.

5. **Money privacy depends on remembering a class on every amount.** `.money` is opt-in per
   call site (`globals.css:385`), so new amounts silently leak. → BUG-5. **Fix:** a `<Money>`
   component (already exists in `finance/page.tsx:61`!) promoted to a shared component and used
   for **every** currency value app-wide; ban bare `{money(x)}`.

6. **Agent writes have inconsistent idempotency.** The thank-you path guards
   (`donations/actions.ts:18`) but the reply path doesn't (`tick/route.ts:68`), and
   `createIntent` swallows duplicate-key then still inserts the approval (`gateway.ts:43` →
   `tick/route.ts:68`). → BUG-2. **Fix:** one `queueApproval()` helper that always checks
   "pending approval already exists for this correlation/source?" before inserting, for **all** kinds.

---

## E. North star — make it SIMPLER, CLEARER, TRUTHFUL (things to REMOVE, not add)

- **Remove `HeroSearch`** (FB-21) — second trigger for the same palette.
- **Remove the `AvatarStack`** on the Donors KPI (FB-20) — decorative, meaningless ("+55").
- **Remove the heavy `backdrop-filter` blur** from dropdown/modal surfaces — replace with a
  flat near-opaque surface. Cheaper to render, looks more pro, fixes the bleed.
- **Remove the 15s `Live` auto-refresh on the dashboard** (NEW-5) or make it diff-based — it
  wipes in-progress edits and hammers Supabase. A manual "Refresh" + the bell poll is enough.
- **Remove the raw-JSON `<pre>` fallback** in ApprovalCard (NEW-6) — render nothing or a human summary.
- **Consolidate the two Sasa entry points** (FB-26) — the top-right sparkle and the floating
  orb both `open-sasa`; keep the orb, drop the sparkle (frees a top-bar slot).
- **Do NOT add multi-tenant/white-label** — founder parked it (scope note). Keep focus on this build.

Over-engineering already present to watch: a full **Action Gateway + intents + autonomy
dials + agent_runs + events** mesh exists, yet the user-facing counts it feeds are wrong. The
plumbing is more sophisticated than the surface truthfulness — invest in the single
source-of-truth layer before adding more agents.
