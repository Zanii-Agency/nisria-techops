// Relay honest-spine wall (2026-07-04, spec 002 / ADR-0016, Slice 1).
// v2 after the adversarial skeptic BLOCKED v1: every case here is NON-VACUOUS,
// each claim string is asserted BOTH ways (gated when unproven, allowed when
// proven) so a regex that simply fails to match can never green a case. Includes
// the exact strings that broke v1: "Let me know if...", offers, negations,
// futures, "Sent to Mark." (the tool's own phrasing), recipient-binding (a
// receipt for Mark must not launder "I told Grace"), and the queued-dedup leak.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { relayProofs, verifyRelayReceipt, claimsRelayWithoutReceipt, receiptFromRelay } from "../../lib/receipts-core.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);

const wamid = (name, to = "Mark", id = "wamid.ABC123") =>
  ({ name, result: { ok: true, detail: { delivered: true, to, to_last4: "1234", receipt_id: id } } });
const failedSend = (name) =>
  ({ name, result: { ok: false, detail: { delivered: false }, error: "send failed" } });
const queuedDedup = (name, to = "Mark") =>
  ({ name, result: { ok: true, detail: { delivered: false, queued: true, subscribed: true, to, deduped: true } } });
const realDedup = (name, to = "Mark") =>
  ({ name, result: { ok: true, detail: { deduped: true, mode: "exact", to, to_last4: "1234" } } });
const templ = (name, to = "Nur", id = "wamid.TPL1") =>
  ({ name, result: { ok: true, detail: { delivered: true, to, to_last4: "2716", via: "template", receipt_id: id } } });
const NONE = [];

// Helper: a claim string must be GATED when unproven AND ALLOWED when proven.
// This kills the vacuous-pass class: if the regex misses the string, the
// unproven assert goes red.
function bothWays(label, claim, provenRuns) {
  if (!claimsRelayWithoutReceipt(claim, NONE)) fail(`${label} UNPROVEN "${claim}" must be gated (regex missed it)`);
  else if (claimsRelayWithoutReceipt(claim, provenRuns)) fail(`${label} PROVEN "${claim}" must NOT be gated`);
  else ok(`${label} "${claim}" gated-unproven / allowed-proven`);
}

// ---- A. Claim shapes: both-ways (kills H2 + the vacuous-pass class) ----
bothWays("A1", "Passed it to Mark.", [wamid("relay_to_colleague")]);
bothWays("A2", "Done, I relayed that to Mark.", [wamid("message_person")]);
bothWays("A3", "Sent to Mark.", [wamid("message_person")]);                       // the tool's own phrasing (v1 miss)
bothWays("A4", "Sent to Mark and Aisha.", [wamid("message_person", "Mark", "w1"), wamid("message_person", "Aisha", "w2")]);
bothWays("A5", "I sent Mark your message.", [wamid("message_person")]);
bothWays("A6", "I texted Mark.", [wamid("message_person")]);
bothWays("A7", "Mark has been notified.", [wamid("message_person")]);
bothWays("A8", "Your message was delivered to Mark.", [wamid("message_person")]);
bothWays("A9", "I just messaged Mark.", [wamid("message_person")]);
bothWays("A10", "Forwarded it to Mark.", [wamid("relay_to_colleague")]);
bothWays("A11", "I told Mark about the visit.", [wamid("message_person")]);
bothWays("A12", "I let Grace know.", [wamid("message_person", "Grace")]);
bothWays("A13", "Message sent to Mark.", [wamid("message_person")]);

// ---- B. NOT a claim: must never be gated even with zero proof (kills C1/H1) ----
for (const [id, s] of [
  ["B1", "Let me know if you want changes."],                       // C1, the killer
  ["B2", "I have drafted it. Let me know and I will send it."],
  ["B3", "Let us know when you arrive."],
  ["B4", "I have not relayed it yet. Want me to?"],                 // honest denial
  ["B5", "Want me to let Grace know?"],                             // offer
  ["B6", "Shall I let Violet know?"],
  ["B7", "I'll let Mark know once he replies."],                    // future promise
  ["B8", "I can let Mark know if you want."],                       // capability
  ["B9", "Nur let Grace know yesterday."],                          // prior-turn reference
  ["B10", "I already told Mark."],                                  // prior-turn reference (log answers these)
  ["B11", "Mark has not messaged this line in the last 24 hours, so I've held your message and will send it the moment they next message in."],
  ["B12", "I do not have a teammate called Sam. Who do you mean, or give me their number?"],
  ["B13", "More than one teammate matches Sam: Sam A, Sam B. Which one?"],
]) {
  if (claimsRelayWithoutReceipt(s, NONE)) fail(`${id} non-claim "${s}" must NOT be gated`);
  else ok(`${id} non-claim not gated`);
}

// ---- C. Recipient binding (kills H3) ----
{
  const runs = [wamid("message_person", "Mark")];
  if (!claimsRelayWithoutReceipt("I told Grace about the visit.", runs)) fail("C1 a receipt for Mark must NOT launder a claim about Grace");
  else ok("C1 receipt bound to recipient (Mark receipt does not prove Grace claim)");
  if (claimsRelayWithoutReceipt("Passed it to Mark.", runs)) fail("C2 the receipt's own recipient must pass");
  else ok("C2 same-recipient claim passes");
  if (!claimsRelayWithoutReceipt("Sent to Mark and Aisha.", runs)) fail("C3 a 2-name claim with 1 receipt must be gated (Aisha unproven)");
  else ok("C3 partial multi-recipient claim gated");
  const dd = [realDedup("relay_to_colleague", "Mark")];
  if (!claimsRelayWithoutReceipt("Done, I relayed that to Grace as well.", dd)) fail("C4 a dedup on Mark must NOT launder a claim about Grace");
  else ok("C4 dedup bound to recipient too");
}

// ---- D. Dedup carve-outs (kills H4) ----
{
  if (claimsRelayWithoutReceipt("Already sent that to Mark.", [realDedup("message_person")])) fail("D1 a real dedup (delivered earlier) must NOT be gated");
  else ok("D1 real dedup already-sent: not gated");
  if (!claimsRelayWithoutReceipt("Done, I relayed that to Mark.", [queuedDedup("message_person")])) fail("D2 a QUEUED (held, delivered:false) dedup must NOT count as proof");
  else ok("D2 queued-not-delivered dedup: gated (H4 closed)");
}

// ---- E. Fabrication with zero tool runs (spec G7/G10) ----
{
  if (!claimsRelayWithoutReceipt("Done, I relayed that to Nur.", NONE)) fail("E1 relay claim with NO tool run must be gated");
  else ok("E1 model forgot the tool + claim: gated");
  if (!claimsRelayWithoutReceipt("Done, relayed to Nur.", [failedSend("message_person")])) fail("E2 fabricated Done over a failed send must be gated");
  else ok("E2 fabricated Done + failed send: gated");
}

// ---- F. Template path (L1: template wamid now a real receipt) ----
{
  const runs = [templ("message_person")];
  if (claimsRelayWithoutReceipt("Sent to Nur.", runs)) fail("F1 template delivery with its id must pass");
  else ok("F1 template delivery passes");
  const v = verifyRelayReceipt(runs);
  if (!v || v.providerId !== "wamid.TPL1") fail("F2 the template id must be a stored receipt now (not discarded)");
  else ok("F2 template id is a persisted receipt");
}

// ---- G. receiptFromRelay ----
{
  const good = receiptFromRelay({ turnId: "t1", toolName: "message_person", result: wamid("message_person").result, recipientId: "c1" });
  if (!good || good.provider_id !== "wamid.ABC123" || good.provider !== "whatsapp") fail("G1 delivered wamid -> stored receipt");
  else ok("G1 receiptFromRelay: wamid -> receipt");
  if (receiptFromRelay({ turnId: "t1", toolName: "message_person", result: failedSend("message_person").result }) !== null) fail("G2 failed send must NOT produce a receipt");
  else ok("G2 failed send -> no receipt");
  if (receiptFromRelay({ turnId: "t1", toolName: "message_person", result: queuedDedup("message_person").result }) !== null) fail("G3 queued/held must NOT produce a receipt");
  else ok("G3 queued -> no receipt");
}

// ---- H. Innocent-word immunity (the anti-regex-misfire case) ----
{
  const runs = [wamid("relay_to_colleague", "Mark")];
  if (claimsRelayWithoutReceipt("Passed it to Mark. His task list is complete.", runs)) fail("H1 innocent 'complete' beside a proven relay must not substitute");
  else ok("H1 proven relay + innocent word: no misfire");
}

// ---- W. Wiring (source anti-drift) ----
{
  const ST = readFileSync(resolve(HERE, "../../lib/smart-tools.ts"), "utf8");
  const SA = readFileSync(resolve(HERE, "../../lib/agents/sasa.ts"), "utf8");
  const RC = readFileSync(resolve(HERE, "../../lib/receipts.ts"), "utf8");
  const NT = readFileSync(resolve(HERE, "../../lib/notify.ts"), "utf8");

  if (!/receipt_id: res\.id/.test(ST)) fail("W1 relay handlers must expose the wamid as receipt_id: res.id");
  else ok("W1 relay results expose the wamid");
  if ((ST.match(/void recordRelayReceipt\(db,/g) || []).length < 3) fail("W2 receipt writes must be fire-and-forget (void) on all three paths (2 direct + template)");
  else ok("W2 receipt writes fire-and-forget on direct + template paths (skeptic M3/L1)");
  if (!/relaySpineOn\(\) && claimsRelayWithoutReceipt\(reply, toolRuns\)/.test(SA)) fail("W3 finalize must have the flag-gated relay claim-gate");
  else ok("W3 finalize relay gate wired + flag-gated");
  if (!/HONEST_NO_RELAY = "I have not actually sent that\./.test(SA) || !/humanize\(HONEST_NO_RELAY/.test(SA)) fail("W4 the gate must substitute HONEST_NO_RELAY (claims nothing), not HONEST_NO_SEND (skeptic H1)");
  else ok("W4 gate substitutes the claims-nothing honest line");
  if (!/RELAY_HONEST_SPINE/.test(RC) || !/=== "on"/.test(RC)) fail("W5 relaySpineOn must gate on RELAY_HONEST_SPINE === 'on' (dark by default)");
  else ok("W5 gate dark by default");
  if (!/try \{[\s\S]*from\("receipts"\)\.insert[\s\S]*\} catch/.test(RC)) fail("W6 recordReceipt must be best-effort (try/catch)");
  else ok("W6 recordReceipt best-effort");
  if ((SA.match(/!\(relaySpineOn\(\) && claimsRelayWithoutReceipt\(s, toolRuns\)\)/g) || []).length < 2) fail("W7 both kept-sentence reconstructors must drop unproven relay-claim sentences (skeptic M1)");
  else ok("W7 kept-sentence reconstructors filter unproven relay claims");
  if (!/id: r\.id \|\| null/.test(NT)) fail("W8 pushOperatorUpdate must surface the template id (skeptic L1)");
  else ok("W8 template message id surfaced");
}

if (process.exitCode) console.error("\nsasa-relay-honest-spine-wall: FAIL");
else console.log("\nsasa-relay-honest-spine-wall: ALL GREEN");
