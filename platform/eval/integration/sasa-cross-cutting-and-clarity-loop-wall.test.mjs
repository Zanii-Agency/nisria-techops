// Cross-cutting disown + clarity repeat-loop wall (2026-07-20 live incident).
//
// LIVE INCIDENT this pins, two defects in one WhatsApp thread with Nur:
//
// 1. DISOWNED A TOOL IT WAS HOLDING. Nur asked for the documentation guide as a
//    PDF. Sasa answered "I can't generate or export PDF files directly" (11:54)
//    and then "I genuinely cannot create or export PDF files from this line.
//    That capability does not exist here yet" (11:55). It did exist:
//    create_letterhead_doc is in CROSS_CUTTING_TOOLS, so every lane holds it,
//    including the knowledge lane that thread routed to. The money lane was the
//    ONLY DOMAIN_FOCUS that mentioned the tool (that is why report requests
//    worked there), while every other lane said "scoped to X tools only" and
//    nothing more. The model believed the boundary half and disowned the tool.
//    NOTE this is the SECOND time this class shipped: sasa-deliverable-honesty
//    -wall (2026-07-11) fixed the money lane only, one lane at a time, so the
//    identical bug returned through knowledge nine days later. The fix here is
//    derived from the Set so it cannot recur lane by lane.
//
// 2. ANTI-LOOP GUARD THAT DID NOT BREAK THE LOOP. flag_for_clarity deduped the
//    telemetry event but still returned the question as `summary`, so Nur got
//    the identical "tell me in one line what you're looking for" at 11:49,
//    11:50 and 11:51. A guard that suppresses the log but not the behaviour is
//    not a guard.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
let failed = 0;
const ok = (m) => console.log(`PASS: ${m}`);
const fail = (m) => { failed++; console.log(`FAIL: ${m}`); };

const spec = readFileSync(resolve(HERE, "../../lib/agents/specialists/index.ts"), "utf8");
const manifests = readFileSync(resolve(HERE, "../../lib/agents/manifests/index.ts"), "utf8");
const tools = readFileSync(resolve(HERE, "../../lib/smart-tools.ts"), "utf8");

// ---- X1: the note is DERIVED from the Set, never hand-written ----
// This is the whole point. A hand-written list drifts the moment a tool is added
// to CROSS_CUTTING_TOOLS, which is exactly how the money lane ended up as the
// only lane that knew about create_letterhead_doc.
if (/const crossCuttingNote = \(allowed: string\[\]\)[\s\S]{0,600}?Array\.from\(CROSS_CUTTING_TOOLS\)\.filter\(/.test(spec))
  ok("X1 crossCuttingNote is derived from CROSS_CUTTING_TOOLS (cannot drift per-lane)");
else
  fail("X1 crossCuttingNote must be derived from the CROSS_CUTTING_TOOLS Set, not hand-written");

// ---- X1b: TEAM SAFETY. The note must announce only what the turn ACTUALLY holds ----
// create_letterhead_doc is intentionally not team-safe (it generates official org
// documents). Announcing the raw Set would promise a team member a capability
// getToolsForDomain strips for them: the same false-capability bug, mirrored.
if (/Array\.from\(CROSS_CUTTING_TOOLS\)\.filter\(\(t\) => allowed\.includes\(t\)\)/.test(spec))
  ok("X1b note intersects the Set with the turn's real allowed tools (team tier stays honest)");
else
  fail("X1b note must intersect CROSS_CUTTING_TOOLS with allowedToolNames, never announce the raw Set");

// ---- X1c: the letterhead sentence is gated on actually holding the tool ----
if (/held\.includes\("create_letterhead_doc"\)\s*\n?\s*\?/.test(spec))
  ok("X1c the letterhead instruction only appears when the tool is genuinely held");
else
  fail("X1c the letterhead instruction must be conditional on holding create_letterhead_doc");

// ---- X2: it actually reaches the model, on EVERY lane, with the real tool list ----
if (/DOMAIN_FOCUS\[domain\]\s*\|\|\s*DOMAIN_FOCUS\.general\)\s*\+\s*NO_SCOPE_LEAK\s*\+\s*crossCuttingNote\(allowedToolNames\)/.test(spec))
  ok("X2 crossCuttingNote(allowedToolNames) appended to the domainFocus handed to the engine");
else
  fail("X2 crossCuttingNote(allowedToolNames) must be appended to domainFocus for every domain");

// ---- X3: CROSS_CUTTING_TOOLS is imported (X1 would be a ReferenceError without it) ----
if (/import\s*\{[^}]*CROSS_CUTTING_TOOLS[^}]*\}\s*from\s*"\.\.\/manifests"/.test(spec))
  ok("X3 CROSS_CUTTING_TOOLS imported into specialists");
else
  fail("X3 specialists must import CROSS_CUTTING_TOOLS from ../manifests");

// ---- X4: the tool the incident was about is still cross-cutting ----
// If someone demotes create_letterhead_doc to a single manifest, X1/X2 stay green
// while the capability silently narrows again. Pin the membership itself.
if (/export const CROSS_CUTTING_TOOLS = new Set\(\[[\s\S]*?"create_letterhead_doc"[\s\S]*?\]\)/.test(manifests))
  ok("X4 create_letterhead_doc is still a member of CROSS_CUTTING_TOOLS");
else
  fail("X4 create_letterhead_doc must stay in CROSS_CUTTING_TOOLS (every lane holds it)");

// ---- X5: the note explicitly forbids the exact denial Nur received ----
if (/NEVER tell the operator you cannot produce a PDF, a file, or a document/.test(spec))
  ok("X5 note explicitly bans the 'I cannot produce a PDF/file' denial");
else
  fail("X5 note must explicitly ban denying PDF/file/document production");

// ---- C1: a deduped clarity call returns a DIFFERENT summary, not the question ----
// The regression shape: `return { ok: true, summary: body ... }` reached on a repeat.
const clarityBlock = (tools.match(/if \(name === "flag_for_clarity"\)[\s\S]{0,4000}/) || [""])[0];
if (/if \(deduped\)\s*\{[\s\S]{0,600}?summary:\s*`You already asked the operator this exact question moments ago/.test(clarityBlock))
  ok("C1 a repeat clarity ask short-circuits with a do-not-repeat summary");
else
  fail("C1 deduped flag_for_clarity must return a different summary, never the same question again");

// ---- C2: the short-circuit returns BEFORE `body` is built ----
// Ordering matters: if the deduped branch sits after the body return, it is dead code.
const dedupIdx = clarityBlock.indexOf("if (deduped)");
const bodyIdx = clarityBlock.indexOf("const body = options.length");
if (dedupIdx !== -1 && bodyIdx !== -1 && dedupIdx < bodyIdx)
  ok("C2 the deduped short-circuit precedes the normal question return");
else
  fail("C2 the deduped branch must return before the normal question body is returned");

// ---- C3: the dedup lookup itself is still contact-scoped and time-boxed ----
// Guard the guard: a global or unbounded dedup would suppress legitimate re-asks
// to different people, or forever.
if (/\.eq\("type", "sasa\.clarity_requested"\)[\s\S]{0,200}?\.eq\("subject_id", contactKey\)/.test(clarityBlock)
    && /2 \* 60 \* 1000/.test(clarityBlock))
  ok("C3 dedup stays scoped to this contact and to a ~2 minute window");
else
  fail("C3 dedup must remain contact-scoped and time-boxed (never global/unbounded)");

// ---- X6/X7: BEHAVIOURAL. Run the real gate, do not trust the regexes above ----
// The string checks prove the code is shaped right. These prove it behaves right:
// the admin lane that failed Nur (knowledge) genuinely carries the tool, and the
// team tier genuinely does not, which is what X1b is protecting.
const { getToolsForDomain, CROSS_CUTTING_TOOLS } = await import("../../lib/agents/manifests/index.ts");

const heldFor = (domain, tier, cap) =>
  Array.from(CROSS_CUTTING_TOOLS).filter((t) => getToolsForDomain(domain, tier, cap).includes(t));

// X6: every admin lane holds the letterhead tool, especially `knowledge` (the lane
// Nur's documentation-guide thread routed to when Sasa denied it twice).
{
  const lanes = ["work", "money", "people", "comms", "knowledge", "programs", "library", "general"];
  const missing = lanes.filter((d) => !heldFor(d, "admin", "field").includes("create_letterhead_doc"));
  if (!missing.length) ok("X6 every admin lane holds create_letterhead_doc (incl. knowledge)");
  else fail(`X6 admin lanes missing create_letterhead_doc: ${missing.join(", ")}`);
}

// X7: no team lane announces it, at either capability. If this ever flips, the note
// starts promising staff an official org PDF the gate will refuse to produce.
{
  const leaked = [];
  for (const d of ["work", "money", "people", "comms", "knowledge", "programs", "library", "general"])
    for (const cap of ["field", "coordinator"])
      if (heldFor(d, "team", cap).includes("create_letterhead_doc")) leaked.push(`${d}/${cap}`);
  if (!leaked.length) ok("X7 no team lane holds create_letterhead_doc (note stays honest for staff)");
  else fail(`X7 create_letterhead_doc leaked to team tier: ${leaked.join(", ")}`);
}

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
