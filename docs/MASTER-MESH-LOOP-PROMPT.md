# MASTER MESH ROLLOUT — autonomous loop prompt

Paste the block below into Claude Code in `~/Code/nisria-sr`. Invoke with `/loop` so it self-paces across iterations. It has full autonomy (Supabase admin, Vercel deploy, git). No permission loops until the final unlock gate.

---

You are completing the Deterministic Mesh rollout for the Nisria 727 WhatsApp bot, working in `~/Code/nisria-sr` (platform in `./platform`). You have FULL autonomy: Supabase admin, Vercel REST API, git push, curl. Do NOT ask permission until the final unlock gate. Be decisive. If you fail a step, fix it and continue; if you hit a hard wall, leave the bot LOCKED and write a report, never leave it half-broken and open.

FIRST, read these in full and treat them as ground truth:
- `docs/MESH-ARCHITECTURE.md`  (the target architecture and the 4 defects)
- `~/.claude/refs/trees/nisria/`  (every bug, capability, data node)
- `platform/NISRIA-DOCTRINE.md` and the per-module `CLAUDE.md` files
- `platform/lib/agents/*` and `platform/app/api/whatsapp/worker/route.ts`

## CORRECT THESE FALSE PREMISES from older handoffs before you act
1. WRONG: "delete sasa.ts, make each specialist call the Anthropic API directly." `runSasa` is the shared EXECUTION ENGINE (tool loop, honesty guard, send-on-confirm, PII scrub, pending_actions, WhatsApp formatter, ~44 walls). KEEP it. Take the monolith *pattern* offline (one brain + all tools + no routing + the silent fallback), NOT the engine. Specialists call the engine with a SCOPED tool list.
2. WRONG: "absence of `sasa.honesty_guard_substituted` proves the monolith is gone." The honesty guard is part of the engine and SHOULD keep firing. It is not a monolith signal. Do not use it as a failure criterion.
3. WRONG: the telemetry bug is mysterious. The real defects are: tool-scoping is a no-op, `toolCalls` is hardcoded `[]`, the guard is dead, the fallback is silent, and telemetry is awaited on the hot path. Fix those.

## CURRENT STATE (verify, do not assume)
- The bot is LOCKED: `MAINTENANCE_MODE=1` (plain var) is live on prod, deploy aliased to `command.nisria.co`. Public users get the maintenance reply. Build and test BEHIND this lock.
- `MAINTENANCE_ALLOWLIST` contains `971501168462`. Webhook tests from THIS number bypass maintenance and exercise the live mesh. Test as this number only. Never test as Nur `971501622716`.
- `meshEnabled()` currently defaults true on empty env (temporary). The worker calls `meshEnabled() ? runOrchestrated() : runSasa()` on ~line 1716.

## PHASES (loop until every check is green)

### Phase 0 — Ground truth
Confirm: git branch/HEAD vs origin/main, working tree clean, `npm install` done in `platform` (the predeploy gate runs tsc locally and needs `mcp-handler`). Confirm `command.nisria.co` serves the latest deploy (`vercel inspect <deploy>` → aliases include the domain).

### Phase 1 — Understand the transcripts line by line (do this BEFORE touching tools)
Pull and READ the WhatsApp history from Supabase `messages` (channel=whatsapp), grouped by `contact_id`, ordered by `created_at`: Nur (`971501622716`), Taona (`971501168462`), and every team member. Read at least the last 500 messages plus all group threads. For each recurring failure or unmet ask, write it down. Cross-reference every entry against the knowledge tree bugs. Produce `docs/mesh-transcript-findings.md`: what users actually ask, which asks failed, and the root cause class (missing tool / wrong domain / prompt hallucination / engine bug).

### Phase 2 — Tool audit and gap-fill (only after Phase 1)
For every tool in `lib/smart-tools.ts`: confirm it sits in the correct domain in `manifests/index.ts`, is not duplicated, and the specialist prompt permits it. Keep all tools currently in the architecture. From the transcript+tree gaps, identify genuinely MISSING tools; add each to `smart-tools.ts` (proper description + input_schema), to the right domain manifest, and reference it in the specialist prompt. Do not invent tools that no transcript or bug justifies. Write the diff rationale into `docs/mesh-transcript-findings.md`.

### Phase 3 — Make the mesh real, take the monolith pattern offline
1. Give `runSasa` an explicit `allowedToolNames?: string[]` param; intersect the role-filtered toolset with it. `runSpecialist` passes the domain's scoped names so a specialist genuinely cannot call out-of-domain tools.
2. `runSpecialist` returns the REAL tool calls the engine ran (not `[]`), so the guard works and affordances survive.
3. Replace the orchestrator's `catch → runSasa(opts)` fallback with: an honest first-person error reply + `flag_to_nur` + emit `mesh.specialist_error`. No full-tool re-run, ever.
4. Remove the worker's `runSasa` branch: the only agent entry is `runOrchestrated`. The kill-switch (mesh off) routes everything to the `general` specialist (still the engine, still scoped), never a full-tool brain.
5. Keep `sasa.ts` as the engine. Remove every code path that runs it with the full toolset or without routing.

### Phase 4 — Telemetry
Make all `mesh.*` emits fire-and-forget (`.catch(()=>{})`), never awaited on the path that returns the reply. Emit `mesh.routed` on every router return, `mesh.completed` on success, `mesh.specialist_error` on failure, `mesh.domain_leakage` from the guard. Write directly via `admin().from("events").insert(...)` with error logging.

### Phase 5 — Deploy (real mechanics)
`cd platform && npm install` if needed, then `vercel deploy --prod --yes`. The predeploy gate must pass (walls + tsc); fix any red, never bypass. Set env vars via the Vercel REST API as **plain** type (encrypted-via-CLI stores empty strings here). After deploy, `vercel inspect <new-deploy>` and confirm `command.nisria.co` is in its aliases.

### Phase 6 — Verify loop (test as the allowlisted number `971501168462`)
Send signed webhooks (HMAC-SHA256 of the raw body with the signature secret) for each:
- "Remind me to call Mark at 3pm" → work
- "Log a payment of KES 5000 for rent" → money
- "Add Sarah as a beneficiary" → people
- "Send a message to Violet" → comms
- "Find the KRA document" → knowledge
- "Hello" → general
After each, query `events`. PASS criteria: `mesh.routed` present with the correct domain and sane confidence; reply is domain-appropriate; NO `mesh.domain_leakage`; the tools run belong to the routed domain. (`sasa.honesty_guard_substituted` firing is FINE.) Any failure → fix, redeploy, re-test. LOOP until all six pass twice in a row.

### Phase 7 — Adversarial skeptic (separate sub-agent)
Dispatch a subagent told to REFUTE "the monolith pattern is gone and the mesh routes correctly." It must grep for any remaining full-tool `runSasa` path, any silent fallback, any specialist able to call an out-of-domain tool, and any test that passed by luck. Fix everything it finds. Re-run Phase 6.

### Phase 8 — Finalize
Remove all debug code (file writes, stray console.logs, debug events). Restore `meshEnabled()` to `process.env.SASA_MESH === "on"`. Set `SASA_MESH=on` (plain) via the Vercel REST API. Delete `HANDOFF-2026-06-25.md`. Update the knowledge-tree nodes to the correct badges with curl proof attached. `git add -A && git commit -m "feat: deterministic mesh — monolith pattern removed, routing verified" && git push origin main`, then final `vercel deploy --prod --yes` and re-run Phase 6 once more.

### Phase 9 — Unlock gate (the ONE place you may pause)
Only if EVERY Phase 6 check is green AND the skeptic found nothing open: set `MAINTENANCE_MODE=0` (plain, via REST API), redeploy, confirm a non-allowlisted signed webhook now gets normal mesh handling (not the maintenance reply), then send the 8 DM interactors a first-person "I'm back up" message (no groups; reuse `scripts/_send-2026-06-25-maintenance-notice.mjs` as the pattern) and log each to `messages`. If anything is red, DO NOT unlock: leave `MAINTENANCE_MODE=1`, write `docs/mesh-rollout-report.md` with exactly what is blocking, and stop.

## ENV
- Supabase URL `https://ptvhqudonvvszupzhcfl.supabase.co`; service + anon keys are in `platform/.env.local`.
- Vercel: project `prj_dMXsLeZG77SJhbIoTs17HnV6FzUl`, team `team_qG2CWi4gf60FzWxFsu4SepEy`. Use the CLI's stored token or the REST API. Env writes MUST be `"type":"plain"`.
- WhatsApp webhook `https://command.nisria.co/api/whatsapp/webhook`; signature secret is `WHATSAPP_APP_SECRET` in the pulled prod env; send creds (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`) are in `.env.local`.

## DISCIPLINE
- Claim words: "deployed/live" only after a curl→200 on `command.nisria.co` AND a `vercel inspect` alias match; "fixed" only with a curl/DB/test proof pasted into the report. Never fake a zero on error.
- Use `/gstack-investigate` for any systematic debug, `/gstack-review` before the final push, `/gstack-qa` if you touch the portal.
- After each meaningful change, log a decision-anchored node in `~/.claude/refs/knowledge-tree.md`.
- One driver only: you. Do not run parallel sessions against this prod target.
