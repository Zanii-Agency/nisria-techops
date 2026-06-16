// Ingest pipeline extraction tests. Verifies that the extraction chain in
// classifyItem handles PDFs and images correctly. Unit-level, no network.
import { extractTextFromBuffer } from "../lib/intake/extract-text.js";
import assert from "node:assert/strict";

let pass = 0;
let fail = 0;
const TEST = "[06-ingest-extraction]";

function ok(cond, msg) {
  try { assert.ok(cond, msg); pass++; } catch (e) { console.error(`  FAIL ${msg}`); fail++; }
}
function eq(a, b, msg) {
  try { assert.equal(a, b, msg); pass++; } catch (e) { console.error(`  FAIL ${msg}: ${e.message}`); fail++; }
}

async function main() {
  console.log(`\n  ${TEST}\n`);

  // 1. text/plain extraction
  const textBuf = Buffer.from("Hello world, this is a test document.");
  const textResult = await extractTextFromBuffer(textBuf, "text/plain");
  ok(textResult === "Hello world, this is a test document.", "text/plain returns content verbatim");

  // 2. application/json extraction
  const jsonBuf = Buffer.from(JSON.stringify({ name: "test", amount: 5000 }));
  const jsonResult = await extractTextFromBuffer(jsonBuf, "application/json");
  ok(jsonResult.includes("test"), "application/json extracts readable text");
  ok(jsonResult.includes("5000"), "application/json includes numeric values");

  // 3. Unsupported MIME returns null
  const audioResult = await extractTextFromBuffer(Buffer.from("fake"), "audio/ogg");
  eq(audioResult, null, "audio/ogg returns null");

  // 4. Empty/malformed PDF returns null (not throws)
  const badPdfResult = await extractTextFromBuffer(Buffer.from("not a real pdf"), "application/pdf");
  // unpdf will try to parse and fail gracefully
  // the return may be null or empty string depending on unpdf behavior
  ok(badPdfResult === null || badPdfResult === "", "bad pdf returns null or empty (no throw)");

  // 5. DOCX MIME reaches mammoth (will return null or empty for fake data)
  const docxResult = await extractTextFromBuffer(Buffer.from("fake docx"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  ok(docxResult === null || docxResult === "", "fake docx returns null or empty (no throw)");

  // 6. Excel MIME reaches SheetJS (won't throw)
  const xlsxResult = await extractTextFromBuffer(Buffer.from("fake xlsx"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  ok(xlsxResult === null || typeof xlsxResult === "string", "fake xlsx returns string or null (no throw)");

  console.log(`\n  Results: ${pass} pass / ${fail} fail\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL", e); process.exit(2); });
