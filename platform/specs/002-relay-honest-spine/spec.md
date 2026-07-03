# Spec 002 — Relay on the Honest Spine (Sasa Option-B, Slice 1)

Status: DRAFT (pre-build). Author: Sasa/Sinan for Taona. Date: 2026-07-03.
Related: KT #206605, #206606, #206607, #206540, evidence-binding doctrine, ADR (spine) forthcoming.

> This is Slice 1 of the Option-B rebuild. It proves the whole new loop on ONE action (the relay)
> before anything else moves. It does NOT rewrite Sasa. It builds the new loop beside the old one
> (strangler) so the live bot never goes dark.

## 1. Problem

Nur runs a 20+ person NGO on WhatsApp, and the core job Sasa exists for is moving information between the team and her. Today that path is unreliable: the model sometimes does not call the send tool (nothing happens), sometimes sends to the wrong or an ambiguous contact, and sometimes tells Nur "done, I relayed that" when nothing went out. The honesty layer that is supposed to catch the lie is regex reading the bot's own English, so it both misfires on innocent wording (canned "tell me a bit more" on normal requests) and misses real lies. The result: Nur cannot trust that a relay happened, which is the one thing the product must guarantee. This blocks the whole thesis (a reliable bot Nisria depends on, then sellable to other NGOs).

## 2. Outcome

A relay either happens with a re-checkable receipt, or Sasa honestly says it did not. Sasa never claims a relay it cannot prove.

- **Primary metric:** of all relay attempts, 100% of Sasa's "sent/relayed" claims are backed by a stored provider receipt (a WhatsApp wamid). Zero receipt-less "sent" claims. Measured by: every relay claim row in the receipt store has a non-null `provider_id`; a nightly check finds zero replies containing a sent-claim with no matching receipt for that turn.
- **Secondary metric (regression catch):** honesty-guard false-fires on the relay path drop to zero (no canned "tell me more" substituted onto a reply where the relay actually succeeded). Measured by: count of `honesty.substituted` events on relay turns where a receipt exists = 0.

## 3. Scope

**In scope:**
- A structured relay ticket: the model's only job on this path is to emit `{intent:"relay", recipient, message, source}` (understand + draft), not to execute.
- A deterministic relay executor: resolves the recipient, sends, and returns a receipt or an honest failure. Same input, same behavior, every time.
- A local receipt store behind a clean seam: `recordReceipt()` / `verifyClaim()`. Backed by Sasa's own Postgres now (a `receipts` table or the existing `events`). The external ledger.zanii.agency becomes an adapter behind this seam later, no rework.
- A claim gate at finalize: a "sent/relayed/messaged X" claim is allowed to ship ONLY if `verifyClaim()` finds a matching receipt for this turn. No receipt, the claim is rewritten to the honest truth (not sent / could not confirm).
- Runs beside the existing relay path (strangler), behind a flag, on the relay intent only.

**Out of scope (explicitly excluded):**
- The other domains (money, people, work, knowledge, programs, library). They stay on the old path until Slice 2+.
- Rewriting the router/orchestrator. Slice 1 reuses existing routing; it only adds the ticket + executor + receipt gate for the relay intent.
- The external ledger integration itself. We build the seam, not the adapter. Ledger wiring is Phase 4.
- Deleting the old regex honesty guards. They stay until claims across all slices route through the gate (Phase 3).
- Group-chat relays and media relays. Slice 1 is 1:1 text relay only.
- Voice/call relays.

## 4. User flow

Happy path:
1. A team member messages the Nisria line: "tell Nur the Gilgil pickup is confirmed for Tuesday."
2. The model reads it and emits a relay ticket: `{intent:"relay", recipient:"Nur", message:"Gilgil pickup confirmed for Tuesday", source:"<team member>"}`. It does not send.
3. The deterministic executor resolves "Nur" to her contact, sends via the WhatsApp send primitive, and captures the returned wamid.
4. `recordReceipt()` writes a receipt: `{turn_id, action:"relay", recipient_id, provider:"whatsapp", provider_id:<wamid>, at}`.
5. At finalize, the reply claims "Passed that to Nur." The gate calls `verifyClaim()`, finds the receipt, allows the claim.

Failure path A (send fails / off-window):
1-3. As above, but the send returns no wamid (off 24h window, or Meta error).
4. No receipt is written.
5. The gate finds no receipt, so it rewrites any "sent" claim to the truth: "I could not deliver that to Nur right now (her window is closed). It is saved and I will retry / you can nudge her." Nothing false ships.

Failure path B (ambiguous / unknown recipient):
1-2. Model emits `{intent:"relay", recipient:"Sam", ...}`.
3. The executor's resolver finds zero or multiple "Sam". It does not send. It returns an honest need: "I do not have a unique contact for Sam, which number?" No receipt, no claim.

## 5. Non-goals

- Not making the model more clever. The fix is moving execution off the model, not prompting it harder.
- Not replacing WhatsApp as the channel.
- Not building a general workflow engine. This is one action done honestly, as the template the other actions will copy.
- Not optimizing latency or cost in Slice 1. Correctness and honesty first.

## 6. Open questions

- Q: Receipt store, new `receipts` table or reuse `events`? A: default to a dedicated `receipts` table (clean seam for the ledger adapter); confirm against existing `events` shape before Phase 1 build.
- Q: What counts as the relay receipt, the wamid at send-accept, or the delivery-status webhook (delivered)? A: Slice 1 uses the wamid (accepted). Note as a known limit; a later slice can upgrade the receipt to delivery-confirmed via the status webhook.
- Q: The external ledger contract (recordReceipt/verifyClaim signature). A: unknown until ledger.zanii.agency ships; the local seam is designed to be the reference shape. Revisit at Phase 4.
- Q: Where does the ticket schema live so Slice 2+ can extend it? A: propose `lib/tickets/` with a discriminated union on `intent`; confirm in the ADR.

## 7. Test cases (golden set)

| # | Input / scenario | Expected outcome |
|---|------------------|------------------|
| 1 | Team member: "tell Nur pickup confirmed Tuesday", Nur window open | Ticket emitted, send returns wamid, receipt stored with provider_id, reply "Passed that to Nur" allowed |
| 2 | Same, but send returns no wamid (Meta error) | No receipt; any "sent" claim rewritten to honest "could not deliver"; nothing false ships |
| 3 | Same, but Nur's 24h window is closed | No free-form delivery; no receipt; honest "her window is closed, saved / nudge her"; no "sent" claim |
| 4 | Relay to "Sam" and two contacts named Sam exist | No send, no receipt; asks which Sam with the two options |
| 5 | Relay to "Khaleed" and no contact matches | No send, no receipt; asks for the number; never invents one |
| 6 | "tell Mark and Aisha the meeting moved" (multi-recipient) | Two tickets, two sends, two receipts; claim lists only the recipients whose receipt exists |
| 7 | Model returns text but emits NO relay ticket (forgot the tool) | Executor did nothing, so no receipt; gate blocks any "done/sent"; reply is honest it did not act (no silent fake success) |
| 8 | Meta redelivers the same inbound (retry/duplicate) | Idempotent: one send, one receipt; no double relay, no double claim |
| 9 | Team-tier member asks to relay a beneficiary's funding amount to another team member | PII wall holds: funding not included; relay of the non-PII part only, receipt reflects what actually sent |
| 10 | Model reply says "Done, relayed to Nur" but the send threw and no receipt exists | Gate catches it: claim rewritten to the truth; the fabricated "Done" never reaches the user |
| 11 | Successful relay (receipt exists) but reply also contains innocent word "complete" | No false honesty-substitution; the true reply ships unchanged (kills the regex-misfire class) |
| 12 | recordReceipt() write fails (DB hiccup) after a real send | Gate treats missing receipt as unproven: claim is downgraded to "sent but could not log proof, verifying", never a clean false "done"; incident logged |

## Definition of done (Slice 1)

- The relay runs through the new loop behind a flag, beside the untouched old path.
- Every successful relay writes a receipt; every "sent" claim is gated on a receipt.
- All 12 golden cases pass as walls (deterministic, source-anti-drift where they assert code shape).
- Live proof on prod: a real relay produces a wamid receipt row, and a forced send-failure produces an honest non-claim (curl/DB proof), with no test as Nur (owner test number only).
- ADR for the spine is written and linked before code (Tier-1 pipeline).
