// False-denial-of-a-group-post wall (2026-07-01 Dorcas incident, KT #206540 class).
// Nur: "send on the admin group confirming Dorcas can go ahead, and send me payment
// details." post_to_group POSTED to the Admin group this turn, but the model over-applied
// the "logging is not telling / haven't messaged them, want me to?" discipline and DENIED
// the completed post, so Nur saw a hedge + a permission-ask for something already done.
// Because post_to_group QUEUES (detail.delivered=false), the person-send false-denial
// corrector can't catch it. Fix: a successful post_to_group + a denial/hedge/offer reply
// (that does not already affirm the post) is rewritten to "Done, I posted that to <group>."
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);

// mirror of the branch predicates in lib/agents/sasa.ts (keep in step)
const DENIES_SEND = /\b(?:have\s*n['’]?t|has\s*n['’]?t|have\s+not|has\s+not|not\s+yet|did\s*n['’]?t|did\s+not)\s+(?:actually\s+|yet\s+|really\s+|ever\s+)?(?:messaged?|sent|told|texted|notified|reached\s+out|pinged)\s+(?:them|him|her|it|that|anyone|anybody)\b/i;
const SEND_OFFER = /\b(?:want me to|shall i|should i|do you want me to|would you like me to|i can|let me)\b[^.?!]{0,45}?\b(?:message|text|tell|notify|remind|ping|send\s+(?:it|them|him|her))\b/i;
const AFFIRMS_POST = /\bposted?\b[^.?!]{0,30}\b(?:to|in|on)\b[^.?!]{0,20}\bgroup\b|\bposted (?:it|that|this)\b/i;
const LOGGED_HEDGE = /\b(?:i logged that|on their board|daily brief|have not actually messaged|haven'?t (?:actually )?messaged|not actually messaged)\b/i;
const postedGroupsThisTurn = (runs) => (runs || []).filter((t) => t?.name === "post_to_group" && t?.result?.ok === true).map((t) => t?.result?.detail?.group).filter(Boolean);
const corrects = (reply, runs) => postedGroupsThisTurn(runs).length > 0 && (DENIES_SEND.test(reply) || LOGGED_HEDGE.test(reply) || SEND_OFFER.test(reply)) && !AFFIRMS_POST.test(reply);

const POSTED = [{ name: "post_to_group", result: { ok: true, detail: { group: "Nisria • (Admin)" } } }];
const DORCAS = "I logged that, but I have not actually messaged them. It is on their board and will show in their daily brief. Want me to message them directly now so they see it?";

// ---- F1: the incident reply IS corrected (post landed but reply denied it) ----
{
  if (!corrects(DORCAS, POSTED)) fail("F1 a successful post_to_group + a denial/hedge reply must be corrected");
  else ok("F1 false denial of a completed group post is corrected");
}

// ---- F2: a reply that ALREADY affirms the post is left alone (no clobber) ----
{
  if (corrects("Posted to the Admin group. But I haven't messaged Grace directly, want me to?", POSTED))
    fail("F2 a reply that affirms the post must NOT be clobbered");
  else ok("F2 mixed reply that owns the post is left intact");
  if (corrects("Done, posted to the Admin group.", POSTED)) fail("F2b a clean post confirmation must not be rewritten");
  else ok("F2b clean post confirmation untouched");
}

// ---- F3: no post ran -> never fires (a real 'I haven't messaged them' stays honest) ----
{
  if (corrects(DORCAS, [])) fail("F3 with NO post_to_group this turn, the hedge must stay (it's honest)");
  else ok("F3 without a completed post, the honest hedge is preserved");
  if (corrects(DORCAS, [{ name: "post_to_group", result: { ok: false } }])) fail("F3b a FAILED post must not trigger a false 'posted' claim");
  else ok("F3b a failed post does not fabricate a 'posted' confirmation");
}

// ---- F4: the fix is wired in sasa.ts (anti-drift) ----
{
  const SRC = readFileSync(resolve(HERE, "../../lib/agents/sasa.ts"), "utf8");
  if (!/function postedGroupsThisTurn/.test(SRC)) fail("F4a postedGroupsThisTurn helper missing");
  else if (!/postedGroupsThisTurn\(toolRuns\)\.length && \(DENIES_SEND\.test\(reply\) \|\| LOGGED_HEDGE\.test\(reply\) \|\| SEND_OFFER\.test\(reply\)\) && !AFFIRMS_POST/.test(SRC)) fail("F4b the correction branch is missing/renamed");
  else if (!/sasa\.false_no_post_corrected/.test(SRC)) fail("F4c the correction event is missing");
  else ok("F4 group-post false-denial correction wired in sasa.ts");
}

// ---- F5: generalized false-denial for event/payment/complete (class fix) ----
// A committing tool ran ok this turn but the reply denies it / asks to redo it.
{
  const C = [
    { tools: ["create_event", "move_event"], deny: /\b(?:have\s*n['’]?t|has\s*n['’]?t|have\s+not|has\s+not|did\s*n['’]?t|not\s+yet)\b[^.?!]{0,34}\b(?:schedul|book|add|creat|put|set\s*up)\w*\b|\bwant me to\b[^.?!]{0,24}\b(?:schedul|book|add|creat|set\s*up)\w*\b/i, affirm: /\b(?:scheduled|booked|added it|created it|on (?:the|your) calendar|it'?s on the calendar|put it on)\b/i, phrase: "Done, it's on the calendar." },
    { tools: ["record_payment", "update_payment"], deny: /\b(?:have\s*n['’]?t|has\s*n['’]?t|have\s+not|has\s+not|did\s*n['’]?t|not\s+yet)\b[^.?!]{0,34}\b(?:logg|record|sav)\w*\b|\bwant me to\b[^.?!]{0,24}\b(?:log|record|save)\b/i, affirm: /\b(?:logged|recorded|saved)\b/i, phrase: "Done, I logged the payment." },
    { tools: ["complete_task"], deny: /\b(?:have\s*n['’]?t|has\s*n['’]?t|have\s+not|has\s+not|did\s*n['’]?t|not\s+yet)\b[^.?!]{0,34}\b(?:complet|mark|clos|finish)\w*\b|\bwant me to\b[^.?!]{0,24}\b(?:complet|mark|clos|finish)\w*\b/i, affirm: /\b(?:marked|completed|closed|it'?s done|already done)\b/i, phrase: "Done, marked it complete." },
  ];
  const DOO = /\b(?:have\s*n['’]?t|has\s*n['’]?t|have\s+not|has\s+not|did\s*n['’]?t|not\s+yet|want me to|shall i|should i|do you want me to|would you like me to)\b/i;
  const d = (reply, runs) => { const cl = String(reply).split(/(?<=[.!?;])\s+|,\s+/).map((s) => s.trim()).filter(Boolean); for (const c of C) { const ran = (runs || []).some((t) => c.tools.includes(t.name) && t.result?.ok === true); if (!ran) continue; const den = cl.some((s) => c.deny.test(s)); const aff = cl.some((s) => c.affirm.test(s) && !DOO.test(s)); if (den && !aff) return c.phrase; } return null; };
  const EV = [{ name: "create_event", result: { ok: true } }], PAY = [{ name: "record_payment", result: { ok: true } }], TASK = [{ name: "complete_task", result: { ok: true } }];
  if (!d("I have not actually scheduled it, want me to add it?", EV)) fail("F5a a denied completed create_event must be corrected");
  else if (!d("I have not logged that payment yet. Want me to record it?", PAY)) fail("F5b a denied completed record_payment must be corrected");
  else if (!d("I haven't marked it complete, want me to?", TASK)) fail("F5c a denied completed complete_task must be corrected");
  else ok("F5 denied completed event/payment/task are corrected");
  if (d("Done, it's on the calendar for Tuesday.", EV)) fail("F5d an affirmed event must not be rewritten");
  else if (d("Logged the payment. I haven't scheduled the review yet, want me to?", PAY)) fail("F5e a mixed honest reply (payment done, event pending) must not be clobbered");
  else if (d("I have not scheduled it, want me to?", [])) fail("F5f with no tool run, an honest hedge must stay");
  else ok("F5 affirmed / mixed / no-tool cases are safe");
  const SRC = readFileSync(resolve(HERE, "../../lib/agents/sasa.ts"), "utf8");
  if (!/function deniedCompletedAction/.test(SRC) || !/sasa\.false_no_action_corrected/.test(SRC)) fail("F5g deniedCompletedAction corrector must be wired in sasa.ts");
  else ok("F5g generalized false-denial corrector wired in sasa.ts");
}

if (process.exitCode) console.error("\nsasa-false-no-post-wall: FAIL");
else console.log("\nsasa-false-no-post-wall: ALL GREEN");
