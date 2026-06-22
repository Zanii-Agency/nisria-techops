# Timezone conversion fix — Sasa calendar (Nairobi ↔ Dubai)

**Branch:** `fix/timezone-nairobi-dubai` (off `origin/main` @ 3bc0810) · **2026-06-22**
**Status:** BUILT + unit-proven in an isolated worktree. NOT deployed (another session holds the main repo; one Vercel = one driver). Deploy is a separate gated step — see below.

---

## What Nur saw
Sasa said a 12:00 PM **Nairobi** Zoom call was "2:00 PM **Dubai** time" and stored it at **14:00**. Dubai (UTC+4) is exactly 1h ahead of Nairobi (UTC+3), all year, no DST. **12:00 Nairobi = 13:00 Dubai, not 14:00.** The bot applied +2 where the gap is +1.

## Two root causes (both fixed)
- **Bug A — the model did the tz math itself and got it wrong.** `create_event` stored whatever HH:MM the model passed; the prompt never told it the offset. Fixed: the model now passes the time **as spoken** plus `source_tz`, and code converts deterministically. (Same failure class as KT #206540: deterministic route for actions, grounded LLM for understanding.)
- **Bug B — stored times had no canonical zone; the Google push disagreed with the portal.** The portal/brief/notify read stored `start_time` as **Asia/Dubai** (`now.ts` `DEFAULT_TZ`), but `gcal.ts` hardcoded `Africa/Nairobi` on every push, so each timed event landed on Nur's phone 1h off from the dashboard. Fixed: `gcal.ts` now imports and uses `DEFAULT_TZ` — one canonical zone everywhere.

## Changes
| File | Change |
|---|---|
| `platform/lib/tz-convert.mjs` | NEW pure module: `convertWallClock(date,time,fromTz,toTz)` + `tzOffsetMs`. Offsets from the IANA db via `Intl`, never hardcoded. Imported by both the app `.ts` and the wall (zero-drift). |
| `platform/lib/smart-tools.ts` | `create_event` + `move_event`: added `source_tz` to schema + deterministic conversion in handler (before dedup, so the stored date is canonical even on midnight rollover). |
| `platform/lib/gcal.ts` | `toResource` tz `Africa/Nairobi` → `DEFAULT_TZ` (imported from `now.ts`). |
| `platform/lib/agents/sasa.ts` | Added a TIMEZONE discipline rule to the calendar section: never convert in your head, pass the time as-spoken + `source_tz`. |
| `platform/eval/integration/sasa-timezone-convert-wall.test.mjs` | NEW wall, 8/8 green: the exact bug (12:00 Nairobi → 13:00 Dubai, explicitly not 14:00), the always-1h offset, reverse, idempotence, midnight rollovers, malformed pass-through. |

## Proof so far
- `node eval/integration/sasa-timezone-convert-wall.test.mjs` → **WALL GREEN, 8/8**. Conversion verified by hand: 12:00 Nairobi → instant 09:00 UTC → +4 Dubai = 13:00. ✓
- Full `tsc` / `npm run walls` / live webhook: see "Before this ships" — not yet run here (deps + deploy gated).

## Before this ships (deploy-or-die checklist — needs the deploy driver)
1. Merge/rebase onto current `main`, run full `npm run walls` (47 walls incl. the new one) + `next build` (typecheck) green.
2. Deploy to Vercel (single-driver — coordinate with the session on `fix/phone-canonical-dedup`).
3. **Live-prove:** signed owner webhook "put the Mwangi call on 2026-06-23 at 12pm Nairobi time" → assert DB row `start_time = 13:00` AND the Google event reads 13:00 Dubai on the phone.
4. **Correct Nur's existing event:** move "Maisha by Nisria x Ekshop Intro Call" (2026-06-23) to **13:00** — once deployed, `move_event` re-patches Google with the now-Dubai zone, fixing both surfaces. (Or a direct DB update + gcal re-patch.)
5. **Migration tail:** events created BEFORE this fix are tagged `Africa/Nairobi` in Google and remain 1h off on the phone until re-patched. Scope = future `calendar_events` with `start_time` + `gcal_event_id`. A one-shot re-patch of upcoming events closes it. (Portal is unaffected — `norm` reads the naive HH:MM either way.)

## Decision note (in lieu of a full ADR)
Canonical store zone = **naive Asia/Dubai wall-clock**, which is what the entire app already assumes (`now.ts`, `period.ts`, `notify.ts`). `gcal.ts` was the lone deviation — this restores consistency, it is not a new architecture. Rejected alternative: re-architecting to store UTC (or a separate tz column). That is correct in the abstract but a far larger blast radius (every read site) for no added correctness here, and is explicitly out of scope. KT #206540 (model must not do arithmetic) + new lesson: stored times need ONE canonical zone enforced at every boundary, or portal and phone silently drift.
