// Money-grounding wall (2026-06-24, KT #394). Verified live bug: the bot flagged Nur to "review
// and approve" a fabricated "Sanara KES 30,000 content creation for graduation expenses" when the
// uploaded document was a KES 5,409 SHIF slip. flag_to_nur now re-extracts the recent document(s)
// and neutralises any currency figure NOT present in the real text (the file is still delivered).
import { claimedFigures, ungroundedFigures } from "../../lib/money-grounding.mjs";
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${m} (got ${JSON.stringify(a)})`); else ok(m); };

// real SHIF e-slip text (extracted via unpdf from the actual file)
const SHIF = "Total Contributions: KES. 5,303.00 Penalties: KES. 106.00 Grand Total: KES. 5,409.00 Employer NISRIA COMMUNITY PROGRAMME Contribution Period: 05 /2026 E-Slip Number VTNDJAGV";

// ---- G1: claimedFigures pulls the currency amounts from a summary ----
eq(claimedFigures("Violet sent a document from Sanara for KES 30,000 content creation"), ["30000"], "G1a 'KES 30,000' -> ['30000']");
eq(claimedFigures("KRA PAYE KES 8,080.00 received"), ["8080"], "G1b 'KES 8,080.00' -> ['8080']");
eq(claimedFigures("nothing about money here"), [], "G1c no figure -> []");

// ---- G2: the EXACT transcript lie is flagged ungrounded against the real SHIF text ----
eq(ungroundedFigures("Violet sent a document from Sanara for KES 30,000 content creation, to be used for graduation expenses", SHIF), ["30000"],
   "G2 the fabricated 'KES 30,000' is NOT in the real SHIF slip -> ungrounded (neutralise + send file)");

// ---- G3 (INVERSE-SAFETY): a TRUE figure that IS in the document is grounded (NOT neutralised) ----
eq(ungroundedFigures("SHIF contribution KES 5,409", SHIF), [], "G3a 'KES 5,409' IS in the slip -> grounded, keep the summary");
eq(ungroundedFigures("partial: Sanara KES 30,000 plus the SHIF KES 5,409", SHIF), ["30000"],
   "G3b mixed: only the fabricated 30,000 is flagged, the real 5,409 is not");

// ---- G4 (INVERSE-SAFETY): when the doc could NOT be read, never accuse a figure ----
eq(ungroundedFigures("KES 30,000 approval", ""), [], "G4a empty doc text -> [] (no false accusation; file still delivered)");
eq(ungroundedFigures("KES 30,000 approval", "short"), [], "G4b too-short text -> [] (cannot judge)");

// ---- G5: smart-tools wires the guard ----
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ST = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "lib", "smart-tools.ts"), "utf8");
if (!/import \{ claimedFigures, ungroundedFigures \} from "\.\/money-grounding\.mjs";/.test(ST)) fail("G5a smart-tools must import the grounding helpers");
else ok("G5a smart-tools imports the grounding helpers");
if (!/const ungrounded = ungroundedFigures\(summary, docText\);/.test(ST)) fail("G5b flag_to_nur must call ungroundedFigures on the extracted doc text");
else ok("G5b flag_to_nur neutralises ungrounded figures");
if (!/sasa\.flag_money_ungrounded/.test(ST)) fail("G5c must emit an observable event when it neutralises a fabricated figure");
else ok("G5c emits sasa.flag_money_ungrounded");

if (process.exitCode) console.error("\nWALL RED."); else console.log("\nWALL GREEN.");
