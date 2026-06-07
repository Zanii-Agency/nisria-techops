# How to Sweep — Sasa 727 v1.x Architecture Pipeline

The repeatable playbook that took Sasa's task workflow from `eval-passed-prod-broke` (v1.0, 17h of silent portal-blindness, lying-done canned-phrase spam, duplicate writes) to `cold-input real-phone-verified clean` (v1.3.4) in one session.

Call this back on any future fixture (payments, beneficiary intake, send tools, group ingest, calendar, donations, finance) when the bot side feels brittle.

## How to invoke

Tell Claude one of:

- **"Do the sweep on `<fixture>`"** — e.g. `do the sweep on payments`, `do the sweep on beneficiary intake`
- **"v1 architecture sweep on `<surface>`"** — same thing, explicit
- **"Cold-trial me"** — fast verification only (skips lockdown + build phases, assumes architecture is already shipped, just runs the prod harness + asks you for a real-phone cold-input round)

Claude reads this doc, looks up the relevant KT nodes (#126, #127, #128), and runs the pipeline below.

## The five tools that make the loop work

### 1. Maintenance lockdown

Blocks every WhatsApp inbound except the operator's number from reaching the bot. Blocks every portal request without an admin token from reaching the app — redirects to `/maintenance`. Lifted by flipping one env var, no code change to unlock.

- **Code:** `platform/app/api/whatsapp/worker/route.ts` (maintenance gate near the top of `processJob`) + `platform/middleware.ts` (early redirect to `/maintenance`)
- **Page:** `platform/app/maintenance/page.tsx`
- **Vercel envs to set:**
  - `MAINTENANCE_MODE=1`
  - `MAINTENANCE_ALLOWLIST=971501168462` (CSV of allowed WA digits — no `+`)
  - `MAINTENANCE_ADMIN_TOKEN=<random hex>` (set as a cookie to bypass portal middleware)
- **To unlock:** flip `MAINTENANCE_MODE=0` and redeploy. Two minutes.

### 2. Prod harness

Fires the 9-prompt battery as HMAC-signed synthetic Meta webhooks at the live worker, asserts the resulting DB state, cleans up.

- **Code:** `platform/eval/integration/prod-harness.mjs`
- **Run:** `cd platform && vercel env pull /tmp/v.env --environment=production --yes && set -a && source /tmp/v.env && set +a && node eval/integration/prod-harness.mjs --keep --skip=3`
- **Flags:** `--keep` leaves rows for inspection, `--skip=N,M` skips test numbers
- **Cost:** ~$0.50 of Anthropic per full run, ~5 min wall clock
- **Idempotent cleanup** by `RUN_ID` prefix (resolves wamid → internal UUID → deletes tasks + comments + deps + harness messages)

### 3. Integration eval (local)

Runs in 1 second, no network, no API spend. Tests parseTasks the pure function + static-code assertions for wired seams (tool-strip, status enum, reaction extraction, etc.).

- **Code:** `platform/eval/integration/seam-9-message-battery.test.mjs`
- **Run:** `node platform/eval/integration/seam-9-message-battery.test.mjs`
- **Catches:** architectural-promise breakage before any deploy (per KT #126)

### 4. DB-direct proof HTML

Queries Supabase with the service-role key, renders the trial's actual rows (tasks, comments, deps, status transitions, conversation log) as a clean HTML table. Headless Chromium screenshots it. **Skeptic-proof receipt** — can't lie because it's the raw DB, not the UI.

- **Generator:** `~/.claude/jobs/<job>/proof.mjs`
- **Headless screenshot:** puppeteer-core against the Playwright-installed Chromium at `~/Library/Caches/ms-playwright/chromium-1223/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
- **Output:** `~/Desktop/sasa-<run>-trial/PROOF-db-direct.png`

### 5. Cold-input real-phone trial

Taona fires **fresh** prompts (different titles, fresh vocabulary) from his actual phone — separate from anything the harness has seen — so neither the model's context nor the dev's repeated fixtures can cache the answer. Per KT #128, finds the vocabulary gaps and transport-encoding foot-guns the clean-input harness misses.

- **Pattern:** brand new titles per round; do NOT reuse "Anthropic grant" / "Pay Mark Njambi" / "Java proposal" — those are baked into Claude's recent context
- **Skip @-mention tests** if you don't want to ping the assignee on their real WhatsApp during maintenance
- **Send retries** to test idempotency (parseTaskComment + parseStateTransition dedup within 5 min)

## The 11-step pipeline order

```
1. Lockdown                    (env flag, deploy)
2. Skeptic ground truth        (parallel Explore agents read source, no theorizing)
3. Integration eval FIRST      (write the test before the fix — KT #126)
4. Surgical fixes one at a     (eval after each, never batch)
   time
5. Qwen adversarial diff       (ssh dgx3, curl localhost:8001/v1/chat/completions)
   review
6. Doctrine reviewer agent     (.claude/agents/doctrine-reviewer.md, 11 laws)
7. Commit + push + vercel      (one commit per fix tier, force flag if needed)
   --prod
8. Prod harness                ($0.50 sandbox, my run)
9. Cold-input real-phone       (operator's phone, fresh vocab)
   trial
10. Cleanup orphans + append   (KT node per meaningful lesson)
    KT node
11. Lockdown lifted ONLY       (unlock = flip MAINTENANCE_MODE=0 + deploy)
    after 8 AND 9 are green
```

## The KT nodes that govern this pipeline

- **#126** — Eval grades the function; the architectural promise lives at the integration seam. Test the seam.
- **#127** — When the model is a brittle dispatcher, route the verb deterministically. parseTasks for creation, parseTaskOps for everything that follows. Tool-strip at the dispatcher, not just at the tool list.
- **#128** — Real-phone cold-input verification surfaces gaps the harness can't see. Clean-input eval is necessary but not sufficient.

Read those three before kicking off a new sweep.

## Anti-patterns (do not repeat)

- ❌ "13/13 eval pass, deploy, done." (KT #126 — the eval was unit, not integration)
- ❌ Strip a tool from the model's offered list and assume the model can't call it (KT #127 — the dispatcher still routes by name; strip at the dispatcher too)
- ❌ Migration adds new FK columns; portal queries embed unqualified `team_members(name)`; portal silently goes dark for 17 hours
- ❌ Test on Taona's harness fixtures only; ship to Nur (KT #128 — cold input finds the verb-list, vocabulary, encoding gaps)
- ❌ Run harness against pre-fix code, see failures, fix MULTIPLE things at once, re-run. Per-fix re-runs are the only honest signal.

## Repo state right now (2026-06-07 end of day)

- **Last commit on main:** `cc976db` Sasa 727 v1.3.4
- **Vercel prod:** `MAINTENANCE_MODE=1`, allowlist = Taona's WhatsApp
- **Baseline tasks:** 95 (19 done, 70 assigned, ~2 overdue) — clean of all harness orphans
- **What's done:** task creation, state transitions, comments, dependencies, reaction-tick, idempotency, honesty guard (with recent-activity awareness), recurrence (incl. specific weekday names), self-assigned narration noise reduction, portal `/tasks` FK-embed disambiguation
- **What's deferred:** payments, beneficiary intake, send tools, group ingest, calendar, donations, finance — each gets its own sweep
- **Tomorrow's call:** `unlock` (open to Nur) or `do the sweep on <next fixture>`

## Commits from today's sweep

```
070275b v1.1: parseTasks tool-strip + sender-aware self-assign + Pattern G + reaction extraction
3c7eac7 v1.2: dispatcher-level tool-strip + honesty-guard parseTasks-aware
e8a8863 v1.3: parseTaskOps (state/comment/deps) + recency reaction-tick + agent-led guard
ffd128a v1.3.1: cleanFrag strips leading conjunctions + title-first reaction lookup
58ba0ad maintenance lockdown
c70e6d8 portal FK embed disambiguation (the silent 17h portal-blind bug)
a1332a1 v1.3.2: recent-activity honesty-guard signal + parseTaskOps idempotency
5b9b59d v1.3.3: self-assigned Heads-up suppression
cc976db v1.3.4: TASK_VERBS expansion + every-weekday recurrence + +-URL-encoding fix
```

---

*Authored 2026-06-07 by the v1.3.4 sweep session. See KT #126/#127/#128 for the underlying engineering lessons.*
