// Email-a-file-to-external wall (2026-07-21).
// Nur: "Send Bashir the brand book". Sasa said "not filed in the library" (wrong — it's in the
// documents store) and had NO tool to email a file to an external address anyway. draft_email now
// takes `attach`, searches BOTH org documents and the library, and rides the file as a real
// attachment via the existing gateway attach_refs plumbing. Not found => says so, drafts nothing.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
let failed = 0; const ok = (m)=>console.log("PASS:",m); const fail=(m)=>{failed++;console.log("FAIL:",m);};
const st = readFileSync(resolve(HERE, "../../lib/smart-tools.ts"), "utf8");
const ea = readFileSync(resolve(HERE, "../../lib/email-attachments.ts"), "utf8");

// A1: the document: ref type is parseable and resolvable
if (/\^\(doc\|asset\|document\):/.test(ea)) ok("A1 parseAttachRefs accepts the document: ref");
else fail("A1 parseAttachRefs must accept document: refs");
if (/kind === "document"[\s\S]{0,900}?db\.storage\.from\("assets"\)\.download\(path\)/.test(ea)) ok("A2 resolveAttachments downloads the org-document bytes from the assets bucket");
else fail("A2 resolveAttachments must handle the document: kind (ingest: -> assets bucket download)");

// B1: draft_email searches BOTH stores
if (/from\("documents"\)\.select\("id,title,drive_file_id"\)[\s\S]{0,900}?from\("assets"\)\.select\("id,title"\)/.test(st))
  ok("B1 attach search spans org documents AND the library assets");
else fail("B1 draft_email attach must search documents AND assets");
// B2: not-found is honest, drafts nothing (no false promise)
if (/I couldn't find a filed document or library file matching[\s\S]{0,80}?haven't drafted the email/.test(st))
  ok("B2 a missing file => honest 'not found', drafts nothing (no false promise)");
else fail("B2 a missing attach file must draft nothing and say so");
// B3: the ref is threaded into the intent so the gateway attaches it
if (/attach_refs: attachRefs \} : \{\}\)/.test(st)) ok("B3 attach_refs threaded into the send_email intent");
else fail("B3 attach_refs must be passed to the email intent (gateway reads p.attach_refs)");
// B4: the attachment is shown to Nur in the draft preview
if (/attachLabel \? \[`\*Attached:\* \$\{attachLabel\}`\]/.test(st)) ok("B4 the draft preview shows what's attached");
else fail("B4 the draft must show the attachment to Nur");
console.log(failed?`\n${failed} FAILED`:"\nALL PASS");
process.exit(failed?1:0);
