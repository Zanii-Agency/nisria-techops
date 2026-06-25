# Nisria Sasa — Deterministic Mesh Architecture

**Status:** target architecture for the 727 bot rollout.
**Principle:** deterministic routing for *actions*, grounded LLM for *understanding*. One shared execution engine, many scoped specialists. No single brain holding all tools.

---

## The core decision (read this first)

There are two things people loosely call "the monolith". They are not the same:

| Thing | Keep or kill | Why |
|---|---|---|
| **`runSasa` execution engine** (tool-call loop, honesty guard, send-on-confirm, PII scrub, pending_actions, WhatsApp formatter) | **KEEP** | Battle-tested, ~44 walls protect it. Reimplementing it per specialist would re-introduce every bug the knowledge tree records. |
| **Monolith *pattern*** (one brain + all ~85 tools + no routing, plus the silent fallback to it) | **KILL** | This is the hallucination source: an LLM holding every tool guesses across domains. |

"Take the monolith offline entirely" = **no code path ever runs the engine with the full toolset or without routing.** The engine survives as infrastructure; the specialists are the only callers, each passing a scoped tool list.

This is the inverse of "delete sasa.ts and call the API directly in each specialist." That path throws away the guards and is rejected.

---

## Flow

```
WhatsApp inbound
  → worker (route.ts): verify sig, coalesce, dedupe, maintenance gate, unknown-sender gate
  → runOrchestrated (the ONLY agent entry; no runSasa branch)
      1. media?  → intake-pipeline → domain + routedCommand
      2. text    → router.routeMessage → { domain, confidence, reason }
                   emit mesh.routed  (fire-and-forget, off the critical path)
      3. confidence < 0.7 → decomposeMessage → steps[]
      4. runSpecialist(domain): focused prompt + SCOPED tool list + shared engine
                   returns { reply, toolCalls }   ← real, not []
                   on throw → honest error reply + flag_to_nur + emit mesh.specialist_error
                   (NO silent fallback to a full-tool runSasa)
      5. multi-step → synthesize
  → finalizeWithGuard: cross-domain leakage check on REAL toolCalls → emit mesh.domain_leakage
  → sendText → WhatsApp out + emit mesh.completed { domain, toolsRan }
```

---

## Domains (6 specialists)

| Domain | Model | Tools | Share of usage | Job |
|---|---|---|---|---|
| work | Haiku | 19 | 49% | tasks, reminders, calendar, scheduling |
| comms | Sonnet | 13 | 20% | outbound messaging, email, group posts |
| money | Sonnet | 15 | 17% | payments, donations, finance |
| people | Sonnet | 20 | 12% | team, contacts, beneficiaries, cases |
| knowledge | Haiku | 13 | 8% | documents, memory, grants |
| general | Haiku | 5 | residual | greetings, meta, ambiguous |

**Cross-cutting tools (all specialists):** `lookup_contact`, `search_history`, `remember_fact`, `flag_for_clarity`, `agent_activity`.

Tool→domain ownership and the reverse index live in `lib/agents/manifests/index.ts`. No tool may belong to two domains except the cross-cutting set.

---

## Router (two-stage, deterministic-first)

1. **Rule pass** (`scoreDomains`): regex patterns derived from 1,755 transcript messages, weighted by match specificity.
2. **Confidence bands:**
   - `>= 0.8` → route direct.
   - `0.4–0.8` → Haiku verifies; agree → use it; Haiku highly confident & disagrees → Haiku overrides; else rule with reduced confidence.
   - `< 0.4` → Haiku classifies; else fall through to `general`.
3. **Multi-domain:** `decomposeMessage` splits into per-domain steps, run sequentially, then synthesized into one reply.

Every return path emits `mesh.routed`.

---

## The four defects this rollout fixes

1. **Tool-scoping is a no-op.** `runSasa` has no `tools` parameter (sasa.ts:1586) and builds its toolset from `SMART_TOOLS` by role only (sasa.ts:1677). `runSpecialist` passes `{ tools } as any` (specialists/index.ts:233), which is ignored. **Fix:** give `runSasa` an explicit `allowedToolNames` param and intersect, so a specialist genuinely cannot call out-of-domain tools.
2. **`toolCalls` hardcoded `[]`** (specialists/index.ts:237). The leakage guard receives nothing and is dead; the mesh path loses action affordances. **Fix:** surface the real tool calls from the engine and return them.
3. **Silent monolith fallback.** `catch { return runSasa(opts) }` (orchestrator.ts:92) re-runs the engine with all tools and emits nothing. **Fix:** replace with an honest error reply + `flag_to_nur` + `mesh.specialist_error`. No full-tool re-run.
4. **No live telemetry.** `router.classified` never lands and `emitRouterTelemetry` is awaited on the hot path (a throw breaks the reply). **Fix:** fire-and-forget telemetry, and emit `mesh.routed` / `mesh.completed` / `mesh.specialist_error` / `mesh.domain_leakage` for full observability.

---

## Flag / env

- `SASA_MESH=on` activates the mesh. After rollout the mesh is the **only** path, so the flag becomes a kill-switch that routes everything to `general` (still the engine, still scoped), never to a full-tool brain.
- Set env vars as **plain** type via the Vercel REST API. The encrypted-via-CLI path stores empty strings on this project (known bug).

---

## Observability (events emitted)

`mesh.routed {domain, confidence, reason}` · `mesh.completed {domain, toolsRan}` · `mesh.specialist_error {domain, error}` · `mesh.domain_leakage {tool, expectedDomain}`. These make "is the mesh actually routing?" answerable forever, which it is not today.

---

## Key files

- `lib/agents/manifests/index.ts` — domain manifests + tool→domain reverse index
- `lib/agents/router.ts` — two-stage router + telemetry
- `lib/agents/specialists/index.ts` — 6 specialist prompts + `runSpecialist`
- `lib/agents/intake-pipeline.ts` — media classification
- `lib/agents/orchestrator.ts` — orchestrator + guard + `meshEnabled()`
- `lib/agents/sasa.ts` — the **execution engine** (kept; called only via specialists with scoped tools)
- `lib/smart-tools.ts` — all ~85 tool definitions
- `platform/app/api/whatsapp/worker/route.ts` — inbound wire-up (the `runSasa` branch is removed)
