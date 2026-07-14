// Deliverable-request honesty wall (2026-07-11, KT #206669).
// LIVE INCIDENT this pins: Nur asked for a combined Yalla Kenya financial
// report ("compiled financial report... combined in one file"). The turn
// classified question_read (correctly — it IS a read request), the model's
// reply was a bare "Done." with zero receipt (only search_history/
// finance_summary/query_donations ran — none of which produce or send a
// file), and the composer's isReadIntent exemption (built to protect genuine
// state answers like "the Gilgil task is done") let the bare claim ship
// unbacked. No file was ever generated or sent; Nur asked "Where did you
// send it?" into a report that never existed.
//
// Root cause traced live, not guessed: create_letterhead_doc was ALREADY
// cross-cutting (available to every domain including money, confirmed via
// getToolsForDomain's CROSS_CUTTING_TOOLS merge) — this was never a missing
// tool, it was (a) a composer blind spot letting an unbacked deliverable
// claim through the read-intent exemption, and (b) the money prompt never
// telling the model to reach for the tool it already had. Both fixed here.
//
// SECOND PASS (same night, operator pushback): the first fix gated on a
// "does the command mention report/file/document" keyword regex — a narrow
// symptom patch. Rebuilt on a general principle instead: the read-intent
// exemption (KT #235, "the Gilgil task is done") only protects a claim that
// NAMES something real (>=3 words of substance); a bare "Done."/"Sent." never
// survives, on ANY turn, regardless of what triggered it or what it's about.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
let failed = 0;
const ok = (m) => console.log(`PASS: ${m}`);
const fail = (m) => { failed++; console.log(`FAIL: ${m}`); };

const sasa = readFileSync(resolve(HERE, "../../lib/agents/sasa.ts"), "utf8");
const spec = readFileSync(resolve(HERE, "../../lib/agents/specialists/index.ts"), "utf8");
const manifests = readFileSync(resolve(HERE, "../../lib/agents/manifests/index.ts"), "utf8");

// D1: the substance check exists — a bare completion word has no real content.
if (/hasSubstance\s*=\s*rawText\.split\(\/\\s\+\/\)\.filter\(Boolean\)\.length\s*>=\s*3/.test(sasa))
  ok("D1 hasSubstance requires >=3 real words before a claim can be trusted");
else fail("D1 missing the substance check in sasa.ts — reverted to intent-only gating?");

// D2: the pure-lie substitution fires unless BOTH read-intent AND real substance are
// present — general principle, not a keyword list. A bare claim never survives on
// ANY turn; a substantive one only survives when it's also read-shaped.
if (/!\(isReadIntent\([^)]*\)\s*&&\s*hasSubstance\)/.test(sasa))
  ok("D2 exemption requires isReadIntent AND hasSubstance together, not intent alone");
else fail("D2 missing the !(isReadIntent(...) && hasSubstance) gate — a bare Done can ship unbacked on any read-classified turn again");

// D3: the deliverable fallback text is honest (does not claim a file exists) and
// offers real content (read the numbers here) instead of a bare apology.
if (/not able to actually produce that file.*will not say I did/is.test(sasa))
  ok("D3 deliverable fallback is honest and offers a text alternative, not just a refusal");
else fail("D3 deliverable-request fallback text regressed — must not claim a file was produced");

// D4: create_letterhead_doc stays cross-cutting (available to every domain,
// including money) rather than domain-owned — confirms the capability was
// never missing, so this must not silently move back to domain-scoped.
if (/CROSS_CUTTING_TOOLS = new Set\(\[[\s\S]{0,400}"create_letterhead_doc"/.test(manifests))
  ok("D4 create_letterhead_doc remains a cross-cutting tool (available to money already)");
else fail("D4 create_letterhead_doc is no longer cross-cutting — money domain may have lost report capability");

// D5: MONEY_MANIFEST.tools does NOT also list create_letterhead_doc directly — that
// would create the exact domain-tool overlap sasa-specialist-isolation-wall guards
// against (a tool that is BOTH cross-cutting AND explicitly domain-owned).
const moneyBlock = manifests.slice(manifests.indexOf("MONEY_MANIFEST"), manifests.indexOf("PEOPLE_MANIFEST"));
if (!/"create_letterhead_doc"/.test(moneyBlock))
  ok("D5 MONEY_MANIFEST.tools does not duplicate the cross-cutting create_letterhead_doc entry");
else fail("D5 create_letterhead_doc was added directly to MONEY_MANIFEST.tools — creates a cross-cutting/domain overlap, breaks specialist-isolation");

// D6: the money domain prompt tells the model to use create_letterhead_doc for
// report/file requests and to fall back to a real text answer, never a bare claim.
if (/create_letterhead_doc with those real figures/.test(spec) && /read the real numbers out here as plain text/.test(spec))
  ok("D6 money DOMAIN_FOCUS instructs report-request handling + honest text fallback");
else fail("D6 money prompt missing report-request guidance — model has the tool but isn't told to reach for it");

console.log(failed ? "WALL RED." : "sasa-deliverable-honesty-wall: ALL GREEN");
process.exit(failed ? 1 : 0);
