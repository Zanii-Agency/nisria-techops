// sasa-send-claim-render-wall — Stage 2 (ADR-0017) anti-hallucination.
// Pins the flag-gated deterministic send/post render (reconcileSendClaims): the
// POSITIVE counterpart to the regex guard wall. Source-seam asserts the wiring +
// safety properties + the skeptic-hardening (per-clause extraction, future skip,
// alreadySubstituted gate, bare-number guard), then a behavioural mirror runs the
// skeptic's exact over-fire inputs and asserts they are now INERT. Same style as
// the other honesty walls (read sasa.ts as text + mirror the decision logic).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SA = fs.readFileSync(path.resolve(HERE, "..", "..", "lib", "agents", "sasa.ts"), "utf8");
let bad = 0;
const ok = (m) => console.log("PASS:", m);
const fail = (m) => { console.log("FAIL:", m); bad++; };

// ---- S: source-seam wiring + safety ----
if (/export function reconcileSendClaims\(/.test(SA)) ok("S1 reconcileSendClaims exists + exported");
else fail("S1 reconcileSendClaims must exist and be exported");
if (/export function renderActionClaimsEnabled\(/.test(SA)) ok("S2 renderActionClaimsEnabled flag reader exists");
else fail("S2 renderActionClaimsEnabled must exist");
if (/SASA_RENDER_ACTION_CLAIMS === "1"[\s\S]{0,40}?SASA_RENDER_ACTION_CLAIMS === "true"/.test(SA)) ok("S3 flag is default-OFF (opt-in only)");
else fail("S3 flag must be default-OFF (require an explicit 1/true)");
if (/names\.length === 0 && groups\.length === 0\) return \{ reply: r, reconciled: false \}/.test(SA)) ok("S4 no-delivery turns are left to the guards");
else fail("S4 must return unchanged when nothing delivered this turn");
if (/`\$\{r\.trimEnd\(\)\}\\n\\n\$\{corrective\}`/.test(SA)) ok("S5 correction is a non-destructive append");
else fail("S5 must append the corrective line, not rewrite the prose");
const enabledGate = SA.indexOf("if (renderActionClaimsEnabled() && !alreadySubstituted) {");
const retIdx = SA.indexOf("return { reply, actions: serialize(actions), toolsRan:");
if (enabledGate > 0 && retIdx > enabledGate) ok("S6 wired behind flag + !alreadySubstituted, before the return");
else fail("S6 must be wired behind flag AND !alreadySubstituted, before the return");
if (/sasa\.send_claim_reconciled/.test(SA)) ok("S7 emits an observable event");
else fail("S7 must emit sasa.send_claim_reconciled");

// ---- skeptic-hardening pins (must not silently revert) ----
if (/const sendClauses = clauses\.filter\(/.test(SA)) ok("S8 recipients extracted PER send-clause (not whole reply)");
else fail("S8 must extract claimed recipients per send-clause");
if (/!FUTURE_CLAIM\.test\(s\) && !SEND_NEG\.test\(s\)/.test(SA)) ok("S9 send-clauses skip future + denial clauses");
else fail("S9 must skip future/denial clauses when picking send-clauses");
if (/claimedPeople\(sendClauses\.join\(" "\)\)/.test(SA)) ok("S10 claimedPeople runs over send-clauses only");
else fail("S10 claimedPeople must run over the send-clauses, not the whole reply");
if (/const isBareNumber = /.test(SA) && /namedTruth = names\.filter/.test(SA)) ok("S11 bare-number recipients excluded from naming compare");
else fail("S11 must exclude bare-number recipients from the naming comparison");

// ---- B: behavioural mirror of the FIXED decision (runs the skeptic's inputs) ----
// Faithful-enough mirror: split into clauses, keep only present-tense affirmative
// send clauses, extract capitalized first-names from THOSE, compare to delivered
// first-names (bare numbers dropped). Mirrors the source; drifts red if the source
// reverts to whole-reply extraction (B1/B2 would flip to mismatch).
const STOP = new Set(["Done","Sent","Sure","Thanks","Ok","Okay","Yes","No","Got","Also","Right"]);
const isBareNumber = (s) => /^\+?[\d][\d\s().-]{5,}$/.test(String(s || "").trim());
const firstNames = (str) => (str.match(/\b([A-Z][a-z]{2,})\b/g) || []).filter((w) => !STOP.has(w)).map((w) => w.toLowerCase());
function reconcile(reply, deliveredNames) {
  const named = deliveredNames.filter((n) => !isBareNumber(n));
  const truth = named.map((n) => n.split(/\s+/)[0].toLowerCase());
  const clauses = reply.split(/(?<=[.!?;:])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const sendClauses = clauses.filter(
    (s) => /\bsent to\b|\bi'?ve sent\b|\bi have sent\b|\bmessage sent\b|\bmessaged\b|\b(?:he|she|they)\s+(?:has|have)\b/i.test(s)
      && !/\bi'?ll|i will|follow up with|let me|going to\b/i.test(s)
      && !/\bhave ?n'?t|has ?n'?t|not\b/i.test(s),
  );
  if (!sendClauses.length) return false;
  const claimed = firstNames(sendClauses.join(" "));
  if (named.length === 0 && claimed.length > 0) return false;
  const namedButNot = claimed.filter((c) => !truth.includes(c));
  const deliveredButNot = truth.filter((t) => !claimed.includes(t));
  return namedButNot.length > 0 || (claimed.length > 0 && deliveredButNot.length > 0);
}
// Skeptic Hole #1: name in a non-send clause must NOT trigger.
if (reconcile("Done, sent to Mark. Grace mentioned she'll be late tomorrow.", ["Mark"]) === false) ok("B1 passing mention of another person -> inert");
else fail("B1 a non-send mention must NOT trigger a correction");
// Skeptic Hole #1 variant: future clause must NOT trigger.
if (reconcile("Sent to Mark. I'll follow up with Grace after the meeting.", ["Mark"]) === false) ok("B2 future clause -> inert");
else fail("B2 a future 'I'll follow up with X' must NOT trigger");
// True over-claim: names a non-delivered recipient IN the send clause.
if (reconcile("Sent to Mark and Grace.", ["Mark"]) === true) ok("B3 names a non-delivered recipient in-clause -> mismatch");
else fail("B3 naming a non-delivered recipient in the send clause must be a mismatch");
// Exact match -> inert.
if (reconcile("Sent to Mark.", ["Mark"]) === false) ok("B4 exact recipient match -> inert");
else fail("B4 exact match must be inert");
// Omits a delivered recipient -> mismatch.
if (reconcile("Sent to Mark.", ["Mark", "Cynthia"]) === true) ok("B5 omits a delivered recipient -> mismatch");
else fail("B5 omitting a delivered recipient must be a mismatch");
// Bare-number recipient -> cannot compare -> inert.
if (reconcile("Sent to Mark.", ["+254712345678"]) === false) ok("B6 bare-number recipient -> inert");
else fail("B6 a bare-number recipient must not manufacture a mismatch");

console.log(`\nsasa-send-claim-render-wall: ${bad === 0 ? "PASS" : "FAIL"}`);
process.exit(bad === 0 ? 0 : 1);
