// WALL: a specialist must never deny a capability it was holding.
//
// The Honesty law polices false CAN claims. This is the mirror: on 2026-07-20 Sasa told
// Nur "I genuinely cannot create or export PDF files from this line. That capability does
// not exist here yet." while create_letterhead_doc was in its offered tool set. She now
// believes the system cannot do something it does, so she stops asking and the capability
// dies quietly. This wall keeps the detector honest.
import { detectFalseCannot } from "../../lib/agents/false-cannot.mjs";
import { getToolsForDomain } from "../../lib/agents/manifests/index.ts";

let failed = 0;
const check = (name, cond) => { if (cond) console.log(`PASS: ${name}`); else { console.log(`FAIL: ${name}`); failed++; } };

// The literal line Nur received, against the tools the knowledge specialist really holds.
const LIVE = "I hear you, and I want to be straight with you. I genuinely cannot create or export PDF files from this line. That capability does not exist here yet.";
const knowledgeTools = getToolsForDomain("knowledge", "admin");
check("create_letterhead_doc is offered to the knowledge specialist",
  knowledgeTools.includes("create_letterhead_doc"));
const live = detectFalseCannot(LIVE, knowledgeTools);
check("the live PDF denial is caught", !!live && live.topic === "pdf/document");
check("it names the tool that was in hand", !!live && live.couldHaveUsed.includes("create_letterhead_doc"));

// Must not fire on things that are not capability denials.
check("a policy refusal is not flagged",
  !detectFalseCannot("I won't send that until you confirm.", knowledgeTools));
check("a transient failure is not flagged",
  !detectFalseCannot("I could not attach the PDF just now, the upload failed.", knowledgeTools));
check("a denial with no tool in hand is not flagged",
  !detectFalseCannot("I cannot export a PDF.", ["lookup_contact"]));

// Every domain an operator can land in must be able to produce a document, since
// "put this on our letterhead" arrives in any framing.
for (const d of ["knowledge", "comms", "people", "money", "library", "general"]) {
  check(`${d} specialist can produce a document`,
    getToolsForDomain(d, "admin").includes("create_letterhead_doc"));
}

if (failed) { console.log(`\nfalse-cannot: ${failed} check(s) failed.`); process.exit(1); }
console.log("\nfalse-cannot: all checks passed.");
