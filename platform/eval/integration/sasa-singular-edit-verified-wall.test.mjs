// Singular-passive-edit verified wall (2026-06-21, KT #342). The live SANARA lie:
// "Done. The SANARA graduation task is now correctly set to July 10. Sorry it
// didn't fully update last time." — a SINGULAR PASSIVE edit claim that escaped
// AGENT_COMPLETION (first-person only), DONE_SIMPLE (done/complete only), and
// PASSIVE_COMPLETION (plural only, KT #274), so a fabricated date change shipped
// with NO update_task / move_event run. The model self-corrected a turn later, but
// the lie went out first. Fix: claimsSingularEditWithoutSuccess substitutes an
// honest reask when the claim is made and no task/event mutation succeeded.
//
// Seams:
//   S1  the detector + its regexes exist in sasa.ts
//   S2  it is wired into the substitution chain (before claimsCompletionWithoutSuccess)
//       and emits sasa.singular_edit_unverified
//   S3  behavioural: the SANARA lie (no tool) is CAUGHT; the SAME claim WITH a
//       successful update_task/move_event PASSES; a status report ("is set for
//       July 3", no change) is NOT caught; an active first-person form is left to
//       the existing guard (not our concern here)
//
// Pure local.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SASA = fs.readFileSync(path.resolve(HERE, "..", "..", "lib", "agents", "sasa.ts"), "utf8");
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);

// ---- S1 ----
if (!/function claimsSingularEditWithoutSuccess\(/.test(SASA) || !/SINGULAR_EDIT_CLAIM\s*=/.test(SASA)) fail("S1 sasa.ts must define claimsSingularEditWithoutSuccess + its regex");
else if (!/SINGULAR_EDIT_ACTIVE\s*=/.test(SASA)) fail("S1 must include the active-voice arm (HOLE 2)");
else if (!/MUTATION_TOOL_RX\s*=/.test(SASA) || !/MUTATION_TOOL_RX\.test\(t\.name\)/.test(SASA)) fail("S1 success-check must key on the mutation-verb prefix, not a task/event-only set (HOLE 1)");
else ok("S1 singular-edit detector present with active arm + broad mutation success-check");

// ---- S2 ----
{
  if (!/else if \(claimsSingularEditWithoutSuccess\(reply, toolRuns\)/.test(SASA)) fail("S2 the detector must be wired into the substitution else-if chain");
  else if (!/sasa\.singular_edit_unverified/.test(SASA)) fail("S2 must emit sasa.singular_edit_unverified for observability");
  else {
    // must run BEFORE the generic claimsCompletionWithoutSuccess branch
    const iMine = SASA.indexOf("else if (claimsSingularEditWithoutSuccess");
    const iGen = SASA.indexOf("else if (claimsCompletionWithoutSuccess(reply, toolRuns) && !isCapabilityQuestion");
    if (iMine < 0 || iGen < 0 || iMine > iGen) fail("S2 the singular-edit branch must run before the generic completion guard");
    else ok("S2 wired before the generic guard, with an observability event");
  }
}

// ---- S3: behavioural (mirror the detector exactly, KT #344 adversarial cases) ----
{
  const SINGULAR_EDIT_CLAIM = /\b(?:task|reminder|todo|event|meeting|visit|appointment|graduation|deadline|due\s*date|date)\b[\w\s'’,-]{0,40}?\b(?:is|are|has\s+been|have\s+been|'?s)\s+(?:now\s+(?:(?:correctly|already|successfully)\s+)?(?:set|marked|scheduled|moved|changed|updated|rescheduled|pushed|shifted|reset|bumped)|(?:(?:correctly|already|successfully)\s+)?(?:moved|changed|updated|rescheduled|pushed|shifted|reset|bumped))\b[\w\s'’,-]{0,20}?\b(?:to|for|as|on)\b\s*\S/i;
  const SINGULAR_EDIT_ACTIVE = /\b(?:(?:i'?ve|i\s+have|i|we'?ve|we\s+have|we)\s+)?(?:just\s+|gone\s+ahead\s+and\s+|already\s+|now\s+)?(?:moved|pushed|changed|rescheduled|reset|bumped|shifted|set|updated)\b[\w\s'’,-]{0,30}?\bto\b\s+(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*|mon|tues?|wed|thur?s?|fri|sat|sun(?:day)?|today|tomorrow|tonight|next\s+\w+|this\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|the\s+\d{1,2}(?:st|nd|rd|th)?\b|\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{1,2}[\/-]\d{1,2})/i;
  const MUTATION_TOOL_RX = /^(?:update|move|edit|set|reschedul|change|add|create|merge|delete|reopen|complete|approve|decline|record|remove|assign)_/;
  const caught = (reply, toolRuns) => {
    if (!SINGULAR_EDIT_CLAIM.test(reply) && !SINGULAR_EDIT_ACTIVE.test(reply)) return false;
    const succeeded = toolRuns.some((t) => MUTATION_TOOL_RX.test(t.name) && t.result?.ok === true);
    return !succeeded;
  };
  const LIE = "Done. The SANARA graduation task is now correctly set to July 10. Sorry it didn't fully update last time.";
  // core: fabrication caught, verified edit passes
  if (!caught(LIE, [])) fail("S3 the SANARA lie with NO tool run must be caught");
  else if (caught(LIE, [{ name: "update_task", result: { ok: true } }])) fail("S3 the SAME claim WITH a successful update_task must PASS");
  else if (caught("The donor meeting is now moved to Friday.", [{ name: "move_event", result: { ok: true } }])) fail("S3 a real move with move_event must PASS");
  // HOLE-1 false positives: real edits via NON task/event mutation tools must PASS
  else if (caught("The payment date has been moved to the 15th.", [{ name: "update_payment", result: { ok: true } }])) fail("S3 HOLE1: a real update_payment date move must PASS (not be called a failure)");
  else if (caught("The grant deadline is now set to March 1.", [{ name: "update_grant", result: { ok: true } }])) fail("S3 HOLE1: a real update_grant deadline must PASS");
  else if (caught("The campaign end date has been changed to June 30.", [{ name: "update_campaign", result: { ok: true } }])) fail("S3 HOLE1: a real update_campaign date must PASS");
  else if (caught("The home visit date is now moved to Tuesday.", [{ name: "move_case", result: { ok: true } }])) fail("S3 HOLE1: a real move_case date must PASS");
  else if (caught("Her start date has been updated to Monday.", [{ name: "update_team_member", result: { ok: true } }])) fail("S3 HOLE1: a real update_team_member date must PASS");
  // HOLE-2 active-voice fabrications (no tool) must be CAUGHT
  else if (!caught("I've gone ahead and pushed the graduation to July 10.", [])) fail("S3 HOLE2: active-voice 'pushed ... to July 10' fabrication must be caught");
  else if (!caught("Changed it to the 10th.", [])) fail("S3 HOLE2: active-voice 'changed it to the 10th' fabrication must be caught");
  // active-voice but a real tool ran → PASS
  else if (caught("I've moved the meeting to 3pm.", [{ name: "move_event", result: { ok: true } }])) fail("S3 active-voice WITH a real move_event must PASS");
  // relay / non-edit active sentences must NOT be caught (no date target)
  else if (caught("I have moved your request to Taona for a decision.", [])) fail("S3 a relay 'moved your request to Taona' must NOT be caught (no date)");
  // status reports must NOT be caught
  else if (caught("The graduation is set for July 3, as it stands now.", [])) fail("S3 a pure status report must NOT be caught");
  else if (caught("The meeting is set for 3pm.", [])) fail("S3 a bare status 'is set for 3pm' must NOT be caught");
  // passive non-task edit fabrication (no tool) still caught
  else if (!caught("Done, the Kibera visit has been rescheduled to next Tuesday.", [])) fail("S3 a passive 'rescheduled to' claim with no tool must be caught");
  else ok("S3 catches fabricated edits (passive+active), passes ALL real edits incl. payment/grant/campaign/case/member, ignores relays + status reports");
}

if (process.exitCode) console.error("\nWALL RED.");
else console.log("\nWALL GREEN.");
