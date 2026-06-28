// Media-extraction tests — the orchestrator must pull the OCR/transcript text out of
// the worker's attachment markers. WARNING: ATTACH_RE/VOICE_RE below mirror
// lib/agents/orchestrator.ts (the media branch). If you change the source, update here.
// Regression guard for the marker-drift bug: the old regex looked for "[Media attachment"
// which the worker never writes, so extracted text was always empty.

import assert from "node:assert/strict";

const ATTACH_RE = /\[[^\]]*attachment[^\]]*here is what it shows\]\n([\s\S]*?)(?:\n\n|$)/;
const VOICE_RE = /\[voice note, transcribed\]\n([\s\S]*?)(?:\n\n|$)/;

function extract(command) {
  const isMedia = ATTACH_RE.test(command) || VOICE_RE.test(command);
  if (!isMedia) return { isMedia: false };
  const m = command.match(ATTACH_RE) || command.match(VOICE_RE);
  const extractedText = (m?.[1] || "").trim();
  const originalCommand = command.split(/\n*\[(?:[^\]]*attachment|voice note)/)[0].trim();
  const mediaType = command.includes("[document") ? "document" : command.includes("[image") ? "image" : "voice";
  return { isMedia: true, extractedText, originalCommand, mediaType };
}

let pass = 0, fail = 0;
const run = (name, fn) => { try { fn(); console.log(`  PASS   ${name}`); pass++; } catch (e) { console.log(`  FAIL   ${name}\n      ${e.message}`); fail++; } };

console.log("\n  Media-extraction (orchestrator marker parse)\n");

run("document attachment: extracts OCR text + type=document", () => {
  const cmd = `[document attachment, here is what it shows]\nInvoice from I&M Bank\nAmount: KES 5,409\n\nIf the above shows payments Nur made, record each one with record_payment.`;
  const r = extract(cmd);
  assert.equal(r.isMedia, true);
  assert.equal(r.mediaType, "document");
  assert.match(r.extractedText, /KES 5,409/, "the bank amount must survive into extractedText");
});

run("image/screenshot attachment: extracts M-Pesa text + type=image", () => {
  const cmd = `[image/screenshot attachment, here is what it shows]\nQGR7H1A2BC Confirmed. Ksh29,000.00 sent to GRACE on 29/5/26\n\nIf the above shows payments Nur made, record each one with record_payment.`;
  const r = extract(cmd);
  assert.equal(r.isMedia, true);
  assert.equal(r.mediaType, "image", "image/screenshot must classify as image, the old gate missed this");
  assert.match(r.extractedText, /QGR7H1A2BC/, "the M-Pesa code must survive");
});

run("team-member variant marker still parses", () => {
  const cmd = `[document attachment from a team member, here is what it shows]\nChild reunification report for Jazbon\n\nThis is already saved on file. If it is something Nur should see, use flag_to_nur.`;
  const r = extract(cmd);
  assert.equal(r.isMedia, true);
  assert.match(r.extractedText, /reunification report/);
});

run("voice note: extracts transcript + type=voice", () => {
  const cmd = `[voice note, transcribed]\nremind me to call Mark at 3pm`;
  const r = extract(cmd);
  assert.equal(r.isMedia, true);
  assert.equal(r.mediaType, "voice");
  assert.match(r.extractedText, /call Mark/);
});

run("leading text before the marker becomes originalCommand", () => {
  const cmd = `here is the receipt\n\n[image/screenshot attachment, here is what it shows]\nKES 1,200 to KPLC\n\nrecord it.`;
  const r = extract(cmd);
  assert.equal(r.originalCommand, "here is the receipt");
  assert.match(r.extractedText, /KPLC/);
});

run("non-media message is not treated as media", () => {
  assert.equal(extract("Paid Lucy 15000 salary").isMedia, false);
});

console.log(`\n  SUMMARY: ${pass} passed / ${fail} failed\n`);
if (fail) process.exit(1);
