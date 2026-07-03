// Relay honest-spine wall (2026-07-04, spec 002 / ADR-0016, Slice 1).
// The honest spine's first slice: Sasa may CLAIM a relay only if a real delivery
// receipt (a WhatsApp wamid) backs it this turn. This wall pins the pure gate
// logic (the 12 golden cases from spec 002) AND asserts the wiring is in the
// source (receipt exposed on the relay results, gate wired flag-gated at finalize,
// recordReceipt best-effort). The gate is DARK behind RELAY_HONEST_SPINE.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { relayProof, verifyRelayReceipt, claimsRelayWithoutReceipt, receiptFromRelay, RELAY_CLAIM_RE } from "../../lib/receipts-core.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);

const wamid = (name, to = "Mark", id = "wamid.ABC123") =>
  ({ name, result: { ok: true, detail: { delivered: true, to, to_last4: "1234", receipt_id: id } } });
const failed = (name, to = "Mark") =>
  ({ name, result: { ok: false, detail: { delivered: false }, error: "send failed" } });
const queued = (name, to = "Mark") =>
  ({ name, result: { ok: true, detail: { delivered: false, queued: true, to } } });
const deduped = (name, to = "Mark") =>
  ({ name, result: { ok: true, detail: { deduped: true, to } } });
const templ = (name, to = "Nur") =>
  ({ name, result: { ok: true, detail: { delivered: true, to, via: "template" } } });

// ---- Golden set (spec 002) ----

// 1. valid relay with wamid receipt -> proven, no substitution
{
  const runs = [wamid("relay_to_colleague")];
  if (!verifyRelayReceipt(runs)) fail("G1 a delivered relay with a wamid must verify");
  else if (claimsRelayWithoutReceipt("Passed it to Mark.", runs)) fail("G1 a proven relay claim must NOT be substituted");
  else ok("G1 valid relay + wamid: proven, claim allowed");
}

// 2. send failed (no receipt) but reply claims sent -> gate fires
{
  const runs = [failed("relay_to_colleague")];
  if (!claimsRelayWithoutReceipt("Passed it to Mark.", runs)) fail("G2 a 'sent' claim with a failed send must be gated");
  else ok("G2 send-failed + sent-claim: gated");
}

// 3. off-window queued -> reply is a HOLD (not a sent claim), must not be gated
{
  const runs = [queued("message_person")];
  const hold = "Mark has not messaged this line in the last 24 hours, so I've held your message and will send it the moment they next message in.";
  if (claimsRelayWithoutReceipt(hold, runs)) fail("G3 an honest 'held/will send' line must NOT be gated (not a sent claim)");
  else ok("G3 off-window hold: not a claim, not gated");
}

// 4. unknown recipient -> reply asks, no claim -> not gated
{
  const runs = [{ name: "relay_to_colleague", result: { ok: false, detail: { unresolved: true } } }];
  if (claimsRelayWithoutReceipt("I do not have a teammate called Sam. Who do you mean, or give me their number?", runs)) fail("G4 an ask (no claim) must not be gated");
  else ok("G4 unknown recipient ask: not gated");
}

// 5. ambiguous recipient -> reply asks, no claim -> not gated
{
  const runs = [{ name: "relay_to_colleague", result: { ok: false, detail: { ambiguous: true } } }];
  if (claimsRelayWithoutReceipt("More than one teammate matches Sam: Sam A, Sam B. Which one?", runs)) fail("G5 ambiguity ask must not be gated");
  else ok("G5 ambiguous recipient ask: not gated");
}

// 6. multi-recipient, all delivered with receipts -> proven
{
  const runs = [wamid("message_person", "Mark", "wamid.1"), wamid("message_person", "Aisha", "wamid.2")];
  if (claimsRelayWithoutReceipt("Sent to Mark and Aisha.", runs)) fail("G6 all-delivered multi-recipient must be proven");
  else ok("G6 multi-recipient all delivered: proven");
}

// 7. model did NOT call the tool, but reply claims a relay -> gate fires (no silent fake)
{
  const runs = []; // nothing ran
  if (!claimsRelayWithoutReceipt("Done, I relayed that to Nur.", runs)) fail("G7 a relay claim with NO tool run must be gated");
  else ok("G7 model forgot the tool + claim: gated");
}

// 8. duplicate/retry dedup -> honest 'already sent', must NOT be gated
{
  const runs = [deduped("relay_to_colleague")];
  if (claimsRelayWithoutReceipt("Already sent that to Mark.", runs)) fail("G8 a legit dedup 'already sent' must NOT be gated");
  else ok("G8 dedup already-sent: not gated");
}

// 9. PII: the delivered (non-PII) relay still verifies; PII stripping is a handler concern
{
  const runs = [wamid("relay_to_colleague", "Grace", "wamid.pii")];
  if (!verifyRelayReceipt(runs)) fail("G9 a delivered relay verifies regardless (PII enforced upstream)");
  else ok("G9 delivered relay verifies (PII is a handler concern, not the gate's)");
}

// 10. fabricated 'Done' but send threw / no receipt -> gate BLOCKS the lie
{
  const runs = [failed("message_person")];
  if (!claimsRelayWithoutReceipt("Done, relayed to Nur.", runs)) fail("G10 a fabricated 'Done' with no receipt must be blocked");
  else ok("G10 fabricated Done + no receipt: blocked");
}

// 11. successful relay + innocent word 'complete' -> no misfire (the anti-regex case)
{
  const runs = [wamid("relay_to_colleague", "Mark", "wamid.ok")];
  if (claimsRelayWithoutReceipt("Passed it to Mark. His task list is complete.", runs)) fail("G11 an innocent word must NOT trigger a substitution when the relay is proven");
  else ok("G11 proven relay + innocent 'complete': no misfire");
}

// 12. receiptFromRelay builds a stored receipt only from a real wamid
{
  const good = receiptFromRelay({ turnId: "t1", toolName: "message_person", result: wamid("message_person").result, recipientId: "c1" });
  if (!good || good.provider_id !== "wamid.ABC123" || good.provider !== "whatsapp") fail("G12 a delivered wamid must produce a stored receipt");
  const none = receiptFromRelay({ turnId: "t1", toolName: "message_person", result: failed("message_person").result });
  if (none !== null) fail("G12 a failed send must NOT produce a stored receipt");
  else ok("G12 receiptFromRelay: wamid -> receipt, failure -> null");
}

// bonus: template carve-out is honestly exempt (real send, wamid not surfaced yet)
{
  const runs = [templ("message_person")];
  const p = relayProof(runs);
  if (!p || p.kind !== "template") fail("T1 operator template delivery must be proven (carve-out)");
  else if (verifyRelayReceipt(runs)) fail("T1 template carve-out must NOT be recorded as a wamid receipt (none surfaced)");
  else if (claimsRelayWithoutReceipt("Sent to Nur.", runs)) fail("T1 a real template delivery must not be gated");
  else ok("T1 template carve-out: proven but not a stored receipt (documented limit)");
}

// ---- Wiring (source anti-drift) ----
{
  const ST = readFileSync(resolve(HERE, "../../lib/smart-tools.ts"), "utf8");
  const SA = readFileSync(resolve(HERE, "../../lib/agents/sasa.ts"), "utf8");
  const RC = readFileSync(resolve(HERE, "../../lib/receipts.ts"), "utf8");

  if (!/receipt_id: res\.id/.test(ST)) fail("W1 relay handlers must expose the wamid as receipt_id: res.id");
  else ok("W1 relay results expose the wamid (receipt_id: res.id)");
  if ((ST.match(/recordRelayReceipt\(db,/g) || []).length < 2) fail("W2 both relay_to_colleague and message_person must record a receipt");
  else ok("W2 both relay tools record a receipt");
  if (!/relaySpineOn\(\) && claimsRelayWithoutReceipt\(reply, toolRuns\)/.test(SA)) fail("W3 finalize must have the flag-gated relay claim-gate");
  else ok("W3 finalize relay gate is wired + flag-gated");
  if (!/RELAY_HONEST_SPINE/.test(RC) || !/=== "on"/.test(RC)) fail("W4 relaySpineOn must gate on RELAY_HONEST_SPINE === 'on' (dark by default)");
  else ok("W4 gate is dark by default (RELAY_HONEST_SPINE opt-in)");
  if (!/try \{[\s\S]*from\("receipts"\)\.insert[\s\S]*\} catch/.test(RC)) fail("W5 recordReceipt must be best-effort (try/catch, never throws)");
  else ok("W5 recordReceipt is best-effort (safe if table absent)");
}

if (process.exitCode) console.error("\nsasa-relay-honest-spine-wall: FAIL");
else console.log("\nsasa-relay-honest-spine-wall: ALL GREEN");
