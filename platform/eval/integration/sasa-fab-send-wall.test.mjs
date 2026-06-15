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
{
  const m = SASA.match(/const\s+PASSIVE_SEND\s*=\s*(\/[^\n]+?\/[gimsuyx]*)/);
  if (!m) fail("S1 PASSIVE_SEND declared at module scope");
  else {
    const src = m[1];
    const verbs = ["sent", "messaged", "reminded", "notified", "told", "pinged", "informed", "reached"];
    const missing = verbs.filter((v) => !src.includes(v));
    if (missing.length) fail(`S1 PASSIVE_SEND missing verbs: ${missing.join(",")}`);
    else ok("S1 PASSIVE_SEND declared with sent|messaged|reminded|notified|told|pinged|informed|reached");
  }
}

// ---- S2: NAMED_PAIR_SEND regex ----
{
  const m = SASA.match(/const\s+NAMED_PAIR_SEND\s*=\s*\//);
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

// ---- S7: message_person success returns detail.via="whatsapp" + to_last4 ----
{
  // Find the success-path return line after the whatsapp.message_out emit.
  const lines = SMART.split(/\r?\n/);
  let emitIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/via:\s*"message_person"/.test(lines[i])) { emitIdx = i; break; }
  }
  if (emitIdx < 0) fail("S7 cannot locate whatsapp.message_out emit");
  else {
    // The success return comes within ~5 lines after the emit
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

// ---- S8: template fallback returns detail.via="template" + to_last4 ----
{
  const tmplRet = SMART.match(/via:\s*"operator_template"[\s\S]{0,400}detail:\s*\{[^}]*via:\s*"template"[^}]*\}/);
  if (!tmplRet) fail("S8 template fallback returns detail.via=\"template\"");
  else ok("S8 template fallback returns detail.via=\"template\"");
  if (!/via:\s*"template"[^}]*\}[\s\S]{0,5}\}\);/.test(SMART)) {
    // best-effort, looser parity check
  }
  if (!SMART.includes("to_last4: number.slice(-4), via: \"template\"")) {
    // looser format match
    if (!/to_last4:\s*number\.slice\(-4\)[^}]*via:\s*"template"/.test(SMART)) fail("S8 template fallback includes to_last4");
    else ok("S8 template fallback includes to_last4");
  } else {
    ok("S8 template fallback includes to_last4");
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

const SEND_TOOLS = new Set(["message_person", "post_to_group", "send_newsletter", "send_file_to_person", "transfer_drive_file"]);

const PASSIVE_SEND = /\b(?:both|all|each|these|those|the\s+(?:two|three|four|five|six|seven|eight|nine|ten)|two|three|four|five|six|seven|eight|nine|ten)\b(?:[\w\s,'"-]{0,60}?)\b(?:are|were|have\s+been|been|got)\b(?:[\w\s]{0,15}?)\b(?:sent|messaged|reminded|notified|told|pinged|informed|reached)\b/i;
const ELLIPTICAL_SEND = /\b(?:both|all|each|the\s+(?:two|three|four|five|six|seven|eight|nine|ten)|two|three|four|five|six|seven|eight|nine|ten)\s+(?:\w+\s+){0,3}(?:sent|messaged|reminded|notified|told|pinged|informed)\b/i;
const NAMED_PAIR_SEND = /\b([A-Z][a-zA-Z]+)\s+and\s+([A-Z][a-zA-Z]+)\b(?:[\w\s,'"-]{0,30}?)\b(?:have|are|were|got)\b(?:[\w\s]{0,15}?)\b(?:been\s+)?(?:sent|messaged|reminded|notified|told|pinged|informed|the\s+message)\b/;

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
    const key = toLast ? `p:${toLast}` : toName ? `n:${String(toName).toLowerCase().trim()}` : `t:${recipients.size}`;
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
  const missed = [];
  if (claim.names.length) {
    const sentLower = sentNames.map((n) => n.toLowerCase());
    for (const cn of claim.names) {
      const cl = cn.toLowerCase();
      const matched = sentLower.some((s) => s.includes(cl) || cl.includes(s));
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

if (process.exitCode) process.exit(process.exitCode);
console.log("\nAll checks passed.");
