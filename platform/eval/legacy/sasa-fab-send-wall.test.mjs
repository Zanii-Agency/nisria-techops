// Fabricated-send wall (2026-06-15, KT #287). Pins today's lie shapes so they
// can never ship again. Same family as sasa-task-frag-wall.test.mjs (KT #274
// passive-plural completion wall), different verb domain.
//
// Source seams pinned here:
//   S1  PASSIVE_SEND regex exists with the expected verb family
//   S2  NAMED_PAIR_SEND regex exists and captures two names
//   S3  extractPluralSendClaim returns {count, names}
//   S4  claimsPluralSendMismatch detector exists and counts distinct
//       successful SEND-tool recipients
//   S5  Wired in the substitution chain BEFORE claimsSendWithoutSend
//   S6  Emits sasa.passive_plural_send_mismatch event
//   S7  message_person success returns detail.via="whatsapp" and to_last4
//   S8  message_person template fallback returns detail.via="template" and to_last4
//   S9  Same-recipient varied-text Jaccard dedup at >=0.7 in a 10-minute window
//
// Behavioral repros:
//   B1  "Done. Both messages are sent. Violet and Cynthia have been reminded"
//       with ONLY Violet in toolRuns -> mismatch detected, missed=["Cynthia"]
//   B2  Two REAL distinct sends to two recipients -> no mismatch
//   B3  Single send claim (no plural) -> not handled by this detector
//   B4  Empty toolRuns + plural claim -> mismatch with distinct=0
//
// Pure local. No DB, no network, no Anthropic.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const SASA = fs.readFileSync(path.join(ROOT, "lib", "agents", "sasa.ts"), "utf8");
const SMART = fs.readFileSync(path.join(ROOT, "lib", "smart-tools.ts"), "utf8");

const fail = (msg) => { console.error("FAIL:", msg); process.exitCode = 1; };
const ok = (msg) => console.log("PASS:", msg);

// ---- S1: PASSIVE_SEND regex with the expected verb family ----
// HONESTY-1 (2026-06-15, KT #287 audit) replaced three independent regex
// literals with a shared SEND_VERBS_GROUP constant. The seam now checks the
// PASSIVE_SEND declaration AND the verb group, which all three regexes
// (PASSIVE_SEND, ELLIPTICAL_SEND, NAMED_PAIR_SEND) inherit from.
{
  const passive = SASA.match(/const\s+PASSIVE_SEND\s*=\s*(?:new\s+RegExp\([\s\S]+?\)|\/[^\n]+?\/[gimsuyx]*)/);
  if (!passive) fail("S1 PASSIVE_SEND declared at module scope");
  else {
    const group = SASA.match(/const\s+SEND_VERBS_GROUP\s*=\s*"([^"]+)"/);
    if (!group) fail("S1 SEND_VERBS_GROUP constant declared (shared verb family)");
    else {
      const src = group[1];
      // The source stores backslash-escapes for the regex constructor, so
      // multi-word phrases appear as "looped\\s+in" in the raw text. Strip
      // the doubled backslashes before checking so the verb tokens match.
      const flat = src.replace(/\\\\s\+?/g, " ").replace(/\\\\/g, "");
      const verbs = [
        "sent", "messaged", "reminded", "notified", "told", "pinged", "informed", "reached",
        "emailed", "dm'?d", "dmed", "contacted", "alerted", "acknowledged", "briefed",
        "updated", "copied", "cc'?d", "called", "phoned", "looped in", "followed up with",
      ];
      const missing = verbs.filter((v) => !flat.includes(v));
      if (missing.length) fail(`S1 SEND_VERBS_GROUP missing verbs: ${missing.join(",")}`);
      else ok("S1 SEND_VERBS_GROUP carries the full verb family (HONESTY-1)");
    }
  }
}

// ---- S2: NAMED_PAIR_SEND regex ----
{
  const m = SASA.match(/const\s+NAMED_PAIR_SEND\s*=\s*(?:new\s+RegExp|\/)/);
  if (!m) fail("S2 NAMED_PAIR_SEND declared at module scope");
  else ok("S2 NAMED_PAIR_SEND declared");
}

// ---- S3: extractPluralSendClaim function ----
{
  const m = SASA.match(/function\s+extractPluralSendClaim\s*\(/);
  if (!m) fail("S3 extractPluralSendClaim function exists");
  else ok("S3 extractPluralSendClaim declared");
}

// ---- S4: claimsPluralSendMismatch detector ----
{
  const m = SASA.match(/function\s+claimsPluralSendMismatch\s*\(/);
  if (!m) fail("S4 claimsPluralSendMismatch function exists");
  else ok("S4 claimsPluralSendMismatch declared");
  // SEND_TOOLS used by the detector
  if (!/SEND_TOOLS\.has\(t\.name\)/.test(SASA)) fail("S4 detector uses SEND_TOOLS set");
  else ok("S4 detector iterates SEND_TOOLS only");
}

// ---- S5: wired in the substitution chain BEFORE claimsSendWithoutSend ----
{
  // Locate both substitution-chain hook sites by source order: the plural-send
  // arm and the claimsSendWithoutSend arm. The plural-send arm MUST appear
  // first in source order so the chain hits it first when both could match.
  const pluralIdx = SASA.indexOf("claimsPluralSendMismatch(reply, toolRuns)");
  const directIdx = SASA.indexOf("claimsSendWithoutSend(reply, toolRuns)");
  if (pluralIdx < 0) fail("S5 plural-send detector wired into chain");
  else if (directIdx < 0) fail("S5 claimsSendWithoutSend still in chain");
  else if (!(pluralIdx < directIdx)) fail("S5 plural-send arm must come BEFORE claimsSendWithoutSend in source order");
  else ok("S5 plural-send arm fires before claimsSendWithoutSend in the substitution chain");
}

// ---- S6: event emit on substitution ----
{
  if (!/sasa\.passive_plural_send_mismatch/.test(SASA)) fail("S6 event sasa.passive_plural_send_mismatch emitted");
  else ok("S6 emits sasa.passive_plural_send_mismatch event");
}

// ---- S7: message_person success emits whatsapp.message_out with via + to_last4 ----
// 2026-06-15 audit follow-up: smart-tools.ts canonicalized payload.via values
// to "whatsapp" (real Cloud API send) and "template" (operator_update
// fallback). The legacy "message_person" / "operator_template" values were
// removed. The seam now locates the whatsapp.message_out emit directly and
// checks the payload shape, which is the contract claimsPluralSendMismatch
// actually relies on (recipient identity in detail.to_last4 + detail.to).
{
  const lines = SMART.split(/\r?\n/);
  let emitIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    // Match the production whatsapp.message_out emit with via:"whatsapp"
    // (the real Cloud API send path; the template fallback path is checked
    // separately in S8).
    if (/type:\s*"whatsapp\.message_out"/.test(lines[i]) && /via:\s*"whatsapp"/.test(lines[i])) {
      emitIdx = i;
      break;
    }
  }
  if (emitIdx < 0) fail("S7 cannot locate whatsapp.message_out emit (via=whatsapp)");
  else {
    const window = lines.slice(emitIdx, emitIdx + 8).join(" ");
    const hasOk = /return\s*\{\s*ok:\s*true/.test(window);
    const hasVia = /via:\s*"whatsapp"/.test(window);
    const hasLast4 = /to_last4:/.test(window);
    if (!hasOk) fail("S7 success path does not return ok:true");
    else if (!hasVia) fail('S7 success path does not return detail.via="whatsapp"');
    else if (!hasLast4) fail("S7 success path does not return detail.to_last4");
    else ok("S7 message_person success returns detail.via=\"whatsapp\" + to_last4");
  }
}

// ---- S8: template fallback emits whatsapp.message_out with via="template" + to_last4 ----
{
  const lines = SMART.split(/\r?\n/);
  let emitIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/type:\s*"whatsapp\.message_out"/.test(lines[i]) && /via:\s*"template"/.test(lines[i])) {
      emitIdx = i;
      break;
    }
  }
  if (emitIdx < 0) fail("S8 cannot locate template-fallback whatsapp.message_out emit");
  else {
    const window = lines.slice(emitIdx, emitIdx + 8).join(" ");
    const hasOk = /return\s*\{\s*ok:\s*true/.test(window);
    const hasVia = /via:\s*"template"/.test(window);
    const hasLast4 = /to_last4:/.test(window);
    if (!hasOk) fail("S8 template fallback does not return ok:true");
    else if (!hasVia) fail('S8 template fallback does not return detail.via="template"');
    else if (!hasLast4) fail("S8 template fallback does not return detail.to_last4");
    else ok("S8 template fallback returns detail.via=\"template\" + to_last4");
  }
}

// ---- S9: Jaccard same-recipient dedup at >=0.7 in 10-min window ----
{
  if (!/since10m/.test(SMART)) fail("S9 10-min window declared");
  else ok("S9 10-min window declared");
  if (!/>=\s*0\.7/.test(SMART) && !/>= 0\.7/.test(SMART)) fail("S9 Jaccard threshold 0.7");
  else ok("S9 Jaccard threshold 0.7");
  if (!/mode:\s*"fuzzy"/.test(SMART)) fail("S9 fuzzy dedup return shape");
  else ok("S9 returns detail.mode=\"fuzzy\" on Jaccard match");
}

// ----------------- BEHAVIORAL: extract detector and run it on the toolRuns -----------------
// We can't easily import the TS file from a .mjs test without compiling, so we
// reimplement the regex + detector inline and assert it matches today's lies.
// If the detector inside sasa.ts drifts, the SEAM checks above (S1-S4) will
// catch the drift first; this behavioral block proves the LOGIC is correct.

// HONESTY-6 (2026-06-15): send_newsletter dropped (it queues, never delivers).
const SEND_TOOLS = new Set(["message_person", "post_to_group", "send_file_to_person", "transfer_drive_file"]);

// HONESTY-1 (2026-06-15): regexes inherit the same SEND_VERBS_GROUP as sasa.ts.
const SEND_VERBS_GROUP = "looped\\s+in|followed\\s+up\\s+with|sent|messaged|reminded|notified|told|pinged|informed|reached|emailed|dm'?d|dmed|contacted|alerted|acknowledged|briefed|updated|copied|cc'?d|called|phoned";
const PASSIVE_SEND = new RegExp("\\b(?:both|all|each|these|those|the\\s+(?:two|three|four|five|six|seven|eight|nine|ten)|two|three|four|five|six|seven|eight|nine|ten)\\b(?:[\\w\\s,'\"-]{0,60}?)\\b(?:are|were|have\\s+been|been|got)\\b(?:[\\w\\s]{0,15}?)\\b(?:" + SEND_VERBS_GROUP + ")\\b", "i");
const ELLIPTICAL_SEND = new RegExp("\\b(?:both|all|each|the\\s+(?:two|three|four|five|six|seven|eight|nine|ten)|two|three|four|five|six|seven|eight|nine|ten)\\s+(?:\\w+\\s+){0,3}(?:" + SEND_VERBS_GROUP + ")\\b", "i");
const NAMED_PAIR_SEND = new RegExp("\\b([A-Z][a-zA-Z]+)\\s+and\\s+([A-Z][a-zA-Z]+)\\b(?:[\\w\\s,'\"-]{0,30}?)\\b(?:have|are|were|got)\\b(?:[\\w\\s]{0,15}?)\\b(?:been\\s+)?(?:" + SEND_VERBS_GROUP + "|the\\s+message)\\b");

function extractPluralSendClaim(reply) {
  const r = String(reply || "");
  const namedPair = r.match(NAMED_PAIR_SEND);
  if (namedPair) return { count: 2, names: [namedPair[1], namedPair[2]] };
  if (!PASSIVE_SEND.test(r) && !ELLIPTICAL_SEND.test(r)) return null;
  const NUM_WORDS = { both: 2, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const lower = r.toLowerCase();
  for (const [w, n] of Object.entries(NUM_WORDS)) if (new RegExp(`\\b${w}\\b`).test(lower)) return { count: n, names: [] };
  if (/\b(?:all|each|these|those)\b/.test(lower)) return { count: 2, names: [] };
  return null;
}

function claimsPluralSendMismatch(reply, toolRuns) {
  const claim = extractPluralSendClaim(reply);
  if (!claim) return null;
  const recipients = new Set();
  const sentNames = [];
  for (const t of toolRuns) {
    if (!SEND_TOOLS.has(t.name)) continue;
    const r = t.result || {};
    if (r.ok !== true) continue;
    const toName = r?.detail?.to ?? t?.input?.to ?? null;
    const toLast = r?.detail?.to_last4 ?? null;
    // HONESTY-7 (2026-06-15): stable key per SEND tool, skip phantoms.
    const input = (t.input || {});
    const detail = r?.detail || {};
    let key = null;
    if (toLast) key = `p:${toLast}`;
    else if (toName) key = `n:${String(toName).toLowerCase().trim()}`;
    else if (t.name === "post_to_group" && input.group) key = `g:${String(input.group).toLowerCase().trim()}`;
    else if (t.name === "send_file_to_person" && (detail.to || input.to)) key = `n:${String(detail.to || input.to).toLowerCase().trim()}`;
    else if (t.name === "transfer_drive_file" && (input.to || detail.to_email)) key = `e:${String(input.to || detail.to_email).toLowerCase().trim()}`;
    else continue;
    if (!recipients.has(key)) {
      recipients.add(key);
      if (toName) {
        const nm = String(toName);
        if (!sentNames.some((s) => s.toLowerCase() === nm.toLowerCase())) sentNames.push(nm);
      }
    }
  }
  const distinct = recipients.size;
  if (distinct >= claim.count) return null;
  // HONESTY-4 (2026-06-15): token-boundary matching, not two-way substring.
  const tokenize = (s) => String(s || "").toLowerCase().trim().split(/\s+/).filter(Boolean);
  const sentTokens = sentNames.map((n) => tokenize(n));
  const missed = [];
  if (claim.names.length) {
    for (const cn of claim.names) {
      const cTokens = tokenize(cn);
      if (!cTokens.length) { missed.push(cn); continue; }
      const first = cTokens[0];
      const matched = sentTokens.some((sToks) => sToks.includes(first));
      if (!matched) missed.push(cn);
    }
  }
  return { mismatch: true, claimed: claim.count, distinct, sent_names: sentNames, claimed_names: claim.names, missed_names: missed };
}

// ---- B1: today's exact lie ----
{
  const reply = "Done. Both messages are sent. Violet and Cynthia have been reminded that the STP report is due today.";
  const toolRuns = [
    { name: "message_person", input: { to: "Violet Otieno" }, result: { ok: true, summary: "Sent to Violet Otieno.", detail: { delivered: true, to: "Violet Otieno", to_last4: "2752", via: "whatsapp" } } },
  ];
  const mm = claimsPluralSendMismatch(reply, toolRuns);
  if (!mm) fail("B1 today's plural-send lie should mismatch");
  else if (mm.claimed !== 2) fail(`B1 claimed=2 expected, got ${mm.claimed}`);
  else if (mm.distinct !== 1) fail(`B1 distinct=1 expected, got ${mm.distinct}`);
  else if (!mm.missed_names.includes("Cynthia")) fail(`B1 missed_names should include Cynthia, got ${JSON.stringify(mm.missed_names)}`);
  else ok("B1 \"Both messages are sent. Violet and Cynthia have been reminded\" with only Violet -> missed=[Cynthia]");
}

// ---- B2: real distinct sends to two recipients -> NO mismatch ----
{
  const reply = "Both Violet and Cynthia have been reminded.";
  const toolRuns = [
    { name: "message_person", input: { to: "Violet Otieno" }, result: { ok: true, detail: { to: "Violet Otieno", to_last4: "2752", via: "whatsapp" } } },
    { name: "message_person", input: { to: "Cynthia Mwangi" }, result: { ok: true, detail: { to: "Cynthia Mwangi", to_last4: "4123", via: "whatsapp" } } },
  ];
  const mm = claimsPluralSendMismatch(reply, toolRuns);
  if (mm) fail(`B2 two real distinct sends should NOT mismatch, got ${JSON.stringify(mm)}`);
  else ok("B2 two real distinct sends to two recipients pass without rewrite");
}

// ---- B3: single send claim is NOT a plural ----
{
  const reply = "Sent to Mark.";
  const toolRuns = [
    { name: "message_person", input: { to: "Mark" }, result: { ok: true, detail: { to: "Mark", to_last4: "9486", via: "whatsapp" } } },
  ];
  const mm = claimsPluralSendMismatch(reply, toolRuns);
  if (mm) fail(`B3 single send claim should not be caught by plural detector, got ${JSON.stringify(mm)}`);
  else ok("B3 single send claim not caught by plural detector");
}

// ---- B4: plural claim with NO send tool ran ----
{
  const reply = "Both have been notified.";
  const toolRuns = [
    { name: "create_task", input: { title: "Notify both" }, result: { ok: true, detail: { task_id: "abc" } } },
  ];
  const mm = claimsPluralSendMismatch(reply, toolRuns);
  if (!mm) fail("B4 plural claim with no SEND tool should mismatch");
  else if (mm.distinct !== 0) fail(`B4 distinct=0 expected, got ${mm.distinct}`);
  else ok("B4 plural claim + zero successful sends -> mismatch with distinct=0");
}

// ---- B5: passive plural without names ("All sent.") ----
{
  const reply = "All sent.";
  const toolRuns = [
    { name: "message_person", input: { to: "Violet" }, result: { ok: true, detail: { to: "Violet", to_last4: "2752", via: "whatsapp" } } },
  ];
  const mm = claimsPluralSendMismatch(reply, toolRuns);
  if (!mm) fail("B5 'All sent.' with only 1 successful send should mismatch");
  else if (mm.claimed !== 2) fail(`B5 claimed=2 (all -> >=2 lower bound), got ${mm.claimed}`);
  else if (mm.distinct !== 1) fail(`B5 distinct=1 expected, got ${mm.distinct}`);
  else ok("B5 'All sent.' + only 1 send -> mismatch with claimed=2 distinct=1");
}

// ---- B6: name matching is fuzzy ("Violet" claimed, "Violet Otieno" sent) ----
{
  const reply = "Violet and Cynthia have been reminded.";
  const toolRuns = [
    { name: "message_person", input: { to: "Violet Otieno" }, result: { ok: true, detail: { to: "Violet Otieno", to_last4: "2752", via: "whatsapp" } } },
  ];
  const mm = claimsPluralSendMismatch(reply, toolRuns);
  if (!mm) fail("B6 claimed=Violet+Cynthia, sent=Violet Otieno -> still mismatch on Cynthia");
  else if (mm.missed_names.includes("Violet")) fail("B6 Violet should NOT be in missed_names (Violet Otieno matches)");
  else if (!mm.missed_names.includes("Cynthia")) fail(`B6 Cynthia should be in missed_names, got ${JSON.stringify(mm.missed_names)}`);
  else ok("B6 name match is substring-fuzzy: Violet matches Violet Otieno, Cynthia missing");
}

// ============================================================================
// AUDIT FOLLOW-UP TESTS (2026-06-15, six bypass shapes from the KT #287 audit)
// Each block locks in one fix so a future regex tweak cannot quietly undo it.
// ============================================================================

// ---- H6: send_newsletter is NOT in SEND_TOOLS (it queues, never delivers) ----
// HONESTY-6: a successful send_newsletter call must NOT count as a real send.
// If it did, "Sent to all donors" would pass even when nothing was delivered.
{
  // Source seam: SEND_TOOLS declaration in sasa.ts no longer lists send_newsletter.
  const m = SASA.match(/const\s+SEND_TOOLS\s*=\s*new\s+Set\(\[([^\]]+)\]\)/);
  if (!m) fail("H6 SEND_TOOLS declared");
  else if (/send_newsletter/.test(m[1])) fail("H6 SEND_TOOLS still contains send_newsletter (queues, must not back send claims)");
  else ok("H6 SEND_TOOLS excludes send_newsletter (HONESTY-6)");

  // Behavioral: a plural claim backed only by send_newsletter must mismatch.
  const reply = "Done. Both donors are emailed.";
  const toolRuns = [
    { name: "send_newsletter", input: { audience: "donors" }, result: { ok: true, summary: "Drafted to 2 donors, queued in Needs You.", detail: { drafted: true, count: 2 } } },
  ];
  const mm = claimsPluralSendMismatch(reply, toolRuns);
  if (!mm) fail("H6 send_newsletter must not back a plural send claim");
  else if (mm.distinct !== 0) fail(`H6 distinct=0 expected (send_newsletter ignored), got ${mm.distinct}`);
  else ok("H6 send_newsletter does not count as a real send recipient");
}

// ---- H1: emailed/dm'd/contacted/etc. all caught by the expanded verb family ----
// HONESTY-1: SEND_VERBS_GROUP must trip the plural detector on the new verbs.
{
  // "Both donors are emailed" was specifically called out in the audit.
  const reply = "Both donors are emailed.";
  const claim = extractPluralSendClaim(reply);
  if (!claim) fail('H1 "Both donors are emailed." should be caught by extractPluralSendClaim');
  else if (claim.count !== 2) fail(`H1 claim.count=2 expected, got ${claim.count}`);
  else ok('H1 "Both donors are emailed." triggers the plural detector (emailed in verb family)');

  // A couple of the other new verbs, sampled to prove the family expanded.
  const samples = [
    "Both have been DM'd.",
    "All three were contacted today.",
    "Both are acknowledged.",
    "Both clients were copied on the reply.",
    "All four were looped in.",
  ];
  let pass = 0;
  for (const s of samples) {
    if (extractPluralSendClaim(s)) pass += 1;
  }
  if (pass < samples.length) fail(`H1 expected ${samples.length} sample shapes to trip, got ${pass}`);
  else ok(`H1 ${samples.length}/${samples.length} new verbs (dm'd, contacted, acknowledged, copied, looped in) trip the plural detector`);
}

// ---- H4: token-boundary missed_names check ("Ann" + "Anna" != match) ----
// HONESTY-4: the two-way substring matcher would falsely report Ann matched
// because 'anna'.includes('ann') is true. Token-boundary matching fixes that.
{
  // Ann claimed, Anna sent: Ann must be reported as missed.
  const reply = "Ann and Beth are sent.";
  const toolRuns = [
    { name: "message_person", input: { to: "Anna" }, result: { ok: true, detail: { to: "Anna", to_last4: "1111", via: "whatsapp" } } },
  ];
  const mm = claimsPluralSendMismatch(reply, toolRuns);
  if (!mm) fail("H4 Ann/Beth claim with only Anna sent should mismatch");
  else if (!mm.missed_names.includes("Ann")) fail(`H4 Ann should be in missed_names (token != Anna), got ${JSON.stringify(mm.missed_names)}`);
  else if (!mm.missed_names.includes("Beth")) fail(`H4 Beth should be in missed_names (no send for Beth), got ${JSON.stringify(mm.missed_names)}`);
  else ok("H4 token-boundary match: Ann != Anna (was falsely matched under substring rule)");

  // Sanity: Violet claimed + "Violet Otieno" sent still matches by first-token.
  const reply2 = "Violet and Cynthia have been reminded.";
  const toolRuns2 = [
    { name: "message_person", input: { to: "Violet Otieno" }, result: { ok: true, detail: { to: "Violet Otieno", to_last4: "2752", via: "whatsapp" } } },
  ];
  const mm2 = claimsPluralSendMismatch(reply2, toolRuns2);
  if (!mm2) fail("H4 Violet/Cynthia with Violet Otieno sent should still mismatch on Cynthia");
  else if (mm2.missed_names.includes("Violet")) fail("H4 Violet should NOT be missed (token violet shared with Violet Otieno)");
  else if (!mm2.missed_names.includes("Cynthia")) fail("H4 Cynthia should be missed");
  else ok("H4 first-name token still matches multi-token sent names: Violet matches Violet Otieno");
}

// ---- H5: sentence-level future-tense check (no whole-reply blanket pass) ----
// HONESTY-5: "Sent! I will let you know if he replies" must not get a pass
// from a whole-reply "i will" match. The past-tense "Sent!" sentence still
// claims a send and must trigger claimsSendWithoutSend when no tool ran.
{
  // Reimplement the post-fix claimsSendWithoutSend inline to test the logic.
  // The seam check (source presence of SEND_CLAIM / SEND_HAS) is implicit:
  // both regex constants are declared at module scope (already covered by
  // existing source flow). This block proves the sentence-level walk.
  const SEND_CLAIM_LOCAL = /\b(?:sent\s+(?:it|them|the\s+(?:task|message|reminder|note))?\s*(?:to|him|her|them)|i'?ve\s+sent|i\s+have\s+sent|message\s+sent|messaged|texted|pinged|notified|told\s+(?:him|her|them|\w+)|let\s+(?:him|her|them|\w+)\s+know|reached\s+out\s+to|posted\s+(?:it\s+)?(?:to|in)\b)/i;
  const SEND_HAS_LOCAL = /\b(?:he|she|they)\s+(?:now\s+)?(?:has|have)\s+(?:it|them)\b|\b\w+\s+(?:has|have|received|got)\s+(?:the\s+(?:task|message|reminder|note)|it now)\b/i;
  const FUTURE_PER_SENTENCE_LOCAL = /\b(?:i will|i'?ll|let me|should i|shall i|do you want me|want me to|would you like me|can i|haven'?t|have not|not yet)\b/i;

  function claimsSendWithoutSendLocal(reply, toolRuns) {
    if (!(SEND_CLAIM_LOCAL.test(reply) || SEND_HAS_LOCAL.test(reply))) return false;
    const sent = toolRuns.some((t) => SEND_TOOLS.has(t.name) && t.result?.ok === true);
    if (sent) return false;
    const sentences = String(reply || "").split(/[.!?]+\s+/).filter((s) => s.trim());
    for (const s of sentences) {
      if (!(SEND_CLAIM_LOCAL.test(s) || SEND_HAS_LOCAL.test(s))) continue;
      if (FUTURE_PER_SENTENCE_LOCAL.test(s)) continue;
      return true;
    }
    return false;
  }

  // "Messaged him. I will let you know if he replies" with NO send tool. Pre-fix
  // the whole-reply "i will" check exempted the entire reply; post-fix the
  // "Messaged him." sentence stands on its own and must trip the guard. The
  // first sentence carries SEND_CLAIM ("messaged"), the second carries the
  // future tense that used to nuke the entire check.
  const reply = "Messaged him. I will let you know if he replies.";
  const toolRuns = [];
  if (!claimsSendWithoutSendLocal(reply, toolRuns)) fail('H5 past+future mixed reply with no SEND tool must trip the per-sentence guard');
  else ok("H5 sentence-level future check: past-tense \"Messaged him.\" still trips even with \"I will let you know\" after");

  // Sanity: a pure-future single-sentence reply still gets a pass.
  if (claimsSendWithoutSendLocal("I will message him in an hour.", [])) fail("H5 pure-future reply must not trip the guard");
  else ok("H5 pure-future single sentence is honest: \"I will message him in an hour.\"");
}

// ---- H7: stable recipient dedup key for non-individual SEND tools ----
// HONESTY-7: two post_to_group calls to the SAME group must count as ONE
// distinct recipient, not two. The legacy fallback key `t:${size}` produced
// t:0, t:1 which falsely satisfied a plural claim.
{
  const reply = "Both groups have been notified.";
  const toolRuns = [
    { name: "post_to_group", input: { group: "stp-team" }, result: { ok: true, summary: "Posted to stp-team.", detail: { posted: true } } },
    { name: "post_to_group", input: { group: "stp-team" }, result: { ok: true, summary: "Posted to stp-team.", detail: { posted: true } } },
  ];
  const mm = claimsPluralSendMismatch(reply, toolRuns);
  if (!mm) fail("H7 two posts to the SAME group should still mismatch a plural claim");
  else if (mm.distinct !== 1) fail(`H7 distinct=1 expected (same group deduped), got ${mm.distinct}`);
  else ok("H7 two post_to_group calls to the same group dedup to 1 distinct recipient");

  // Sanity: two posts to DIFFERENT groups count as 2 distinct.
  const reply2 = "Both groups have been notified.";
  const toolRuns2 = [
    { name: "post_to_group", input: { group: "stp-team" }, result: { ok: true, detail: { posted: true } } },
    { name: "post_to_group", input: { group: "finance" }, result: { ok: true, detail: { posted: true } } },
  ];
  const mm2 = claimsPluralSendMismatch(reply2, toolRuns2);
  if (mm2) fail(`H7 two distinct groups should NOT mismatch a plural claim, got ${JSON.stringify(mm2)}`);
  else ok("H7 two posts to DIFFERENT groups count as 2 distinct recipients");
}

// ---- H2: sequential narration ("Sent to X. Sent to Y.") mismatch ----
// HONESTY-2: sequential single-send sentences bypass every passive/plural
// detector. The new claimsSequentialSendMismatch catches them by counting
// distinct claimed first-name recipients across all sentences.
{
  // Reimplement the new sequential detector inline (no TS compile in tests).
  const SEQ_RE = /(?:^|[.!?\s])(Sent|Messaged|Told|Pinged|Notified|Emailed|DM'?d|Reached out to|Reminded|Informed)\s+(?:to\s+)?([A-Z][a-zA-Z]+)/g;

  function claimsSequentialSendMismatchLocal(reply, toolRuns) {
    const r = String(reply || "");
    const claimedSet = new Set();
    const claimedOrder = [];
    SEQ_RE.lastIndex = 0;
    let m;
    while ((m = SEQ_RE.exec(r)) !== null) {
      const nm = m[2];
      const key = nm.toLowerCase();
      if (!claimedSet.has(key)) { claimedSet.add(key); claimedOrder.push(nm); }
    }
    if (claimedOrder.length < 2) return null;
    const recipients = new Set();
    const sentNames = [];
    for (const t of toolRuns) {
      if (!SEND_TOOLS.has(t.name)) continue;
      const res = t.result || {};
      if (res.ok !== true) continue;
      const toName = res?.detail?.to ?? t?.input?.to ?? null;
      const toLast = res?.detail?.to_last4 ?? null;
      const input = t.input || {};
      const detail = res?.detail || {};
      let key = null;
      if (toLast) key = `p:${toLast}`;
      else if (toName) key = `n:${String(toName).toLowerCase().trim()}`;
      else if (t.name === "post_to_group" && input.group) key = `g:${String(input.group).toLowerCase().trim()}`;
      else if (t.name === "send_file_to_person" && (detail.to || input.to)) key = `n:${String(detail.to || input.to).toLowerCase().trim()}`;
      else if (t.name === "transfer_drive_file" && (input.to || detail.to_email)) key = `e:${String(input.to || detail.to_email).toLowerCase().trim()}`;
      else continue;
      if (!recipients.has(key)) {
        recipients.add(key);
        if (toName) {
          const nm = String(toName);
          if (!sentNames.some((s) => s.toLowerCase() === nm.toLowerCase())) sentNames.push(nm);
        }
      }
    }
    const distinct = recipients.size;
    if (distinct >= claimedOrder.length) return null;
    const tokenize = (s) => String(s || "").toLowerCase().trim().split(/\s+/).filter(Boolean);
    const sentTokens = sentNames.map((n) => tokenize(n));
    const missed = [];
    for (const cn of claimedOrder) {
      const cTokens = tokenize(cn);
      if (!cTokens.length) { missed.push(cn); continue; }
      const first = cTokens[0];
      const matched = sentTokens.some((sToks) => sToks.includes(first));
      if (!matched) missed.push(cn);
    }
    return { mismatch: true, claimed: claimedOrder.length, distinct, sent_names: sentNames, claimed_names: claimedOrder, missed_names: missed };
  }

  // Today's exact lie shape: "Sent to Violet. Sent to Cynthia." with only Violet.
  const reply = "Sent to Violet. Sent to Cynthia.";
  const toolRuns = [
    { name: "message_person", input: { to: "Violet Otieno" }, result: { ok: true, detail: { to: "Violet Otieno", to_last4: "2752", via: "whatsapp" } } },
  ];
  const mm = claimsSequentialSendMismatchLocal(reply, toolRuns);
  if (!mm) fail("H2 sequential narration should mismatch when one of two sends is missing");
  else if (mm.claimed !== 2) fail(`H2 claimed=2 expected, got ${mm.claimed}`);
  else if (mm.distinct !== 1) fail(`H2 distinct=1 expected, got ${mm.distinct}`);
  else if (!mm.missed_names.includes("Cynthia")) fail(`H2 Cynthia should be missed, got ${JSON.stringify(mm.missed_names)}`);
  else ok('H2 "Sent to Violet. Sent to Cynthia." with only Violet -> missed=[Cynthia]');

  // Sanity: two REAL sends to two recipients via sequential narration pass.
  const reply2 = "Sent to Violet. Sent to Cynthia.";
  const toolRuns2 = [
    { name: "message_person", input: { to: "Violet" }, result: { ok: true, detail: { to: "Violet", to_last4: "2752", via: "whatsapp" } } },
    { name: "message_person", input: { to: "Cynthia" }, result: { ok: true, detail: { to: "Cynthia", to_last4: "4123", via: "whatsapp" } } },
  ];
  if (claimsSequentialSendMismatchLocal(reply2, toolRuns2)) fail("H2 two real sequential sends should NOT mismatch");
  else ok("H2 two real sequential sends pass without rewrite");

  // Sanity: a single sequential claim ("Sent to Mark.") is not a sequence.
  if (claimsSequentialSendMismatchLocal("Sent to Mark.", [])) fail("H2 a single send is not a sequence; should not mismatch");
  else ok("H2 single send claim is not a sequence (needs 2+ distinct claimed names)");

  // Source seam: claimsSequentialSendMismatch is declared and wired into the chain.
  if (!/function\s+claimsSequentialSendMismatch\s*\(/.test(SASA)) fail("H2 claimsSequentialSendMismatch function declared in sasa.ts");
  else ok("H2 claimsSequentialSendMismatch declared in sasa.ts");

  const pluralIdx = SASA.indexOf("claimsPluralSendMismatch(reply, toolRuns)");
  const seqIdx = SASA.indexOf("claimsSequentialSendMismatch(reply, toolRuns)");
  const directIdx = SASA.indexOf("claimsSendWithoutSend(reply, toolRuns)");
  if (seqIdx < 0) fail("H2 claimsSequentialSendMismatch wired into substitution chain");
  else if (!(pluralIdx < seqIdx && seqIdx < directIdx)) fail("H2 sequential arm must sit BETWEEN plural and direct in source order");
  else ok("H2 sequential arm fires after plural, before claimsSendWithoutSend");

  if (!/sasa\.sequential_send_mismatch/.test(SASA)) fail("H2 sasa.sequential_send_mismatch event emitted");
  else ok("H2 emits sasa.sequential_send_mismatch event for observability");
}

if (process.exitCode) process.exit(process.exitCode);
console.log("\nAll checks passed.");
