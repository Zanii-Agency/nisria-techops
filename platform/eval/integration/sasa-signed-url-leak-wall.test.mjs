// Signed-storage-URL leak wall (2026-07-20, SECOND occurrence of this class).
//
// LIVE INCIDENT. The operator asked for a letterhead PDF. Sasa built it, delivered it
// correctly as a WhatsApp document, and then ALSO pasted the signed Supabase URL into
// the reply text. WhatsApp flagged the message as a suspicious link, so what actually
// landed was a broken-looking blob next to a file that had already arrived:
//
//   "Your test letter is on Nisria letterhead and ready as a PDF. 👇
//    (https://<project>.supabase.co/storage/v1/object/sign/...pdf?token=..."
//
// HOW IT LEAKED. create_letterhead_doc returns the signed URL on detail.file_url. The
// whole tool result is JSON.stringify'd back to the model as a tool_result, so the
// model read the URL and helpfully shared it. The tool never put it in `summary` on
// the delivered path: the model did, because it could see it.
//
// WHY THIS IS A WALL AND NOT A COMMENT. The identical failure was diagnosed and fixed
// on 2026-07-11 for project_expense_report, whose comment still reads: "NEVER puts the
// storage URL in the reply text (a raw signed link is what trips WhatsApp's suspicious
// link flag — proven live 2026-07-11)". That fix was applied to ONE tool. Its sibling
// in the same file kept the bug for nine days until an operator hit it. Fixing an
// instance of a class leaves the class alive. The guard now sits at the seam every
// tool result passes through, and this wall pins the seam, not the tool.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
let failed = 0;
const ok = (m) => console.log(`PASS: ${m}`);
const fail = (m) => { failed++; console.log(`FAIL: ${m}`); };

const sasa = readFileSync(resolve(HERE, "../../lib/agents/sasa.ts"), "utf8");
const tools = readFileSync(resolve(HERE, "../../lib/smart-tools.ts"), "utf8");
const { redactSignedUrls, hasSignedUrl } = await import("../../lib/redact.mjs");

const SIGNED = "https://abcdefgh.supabase.co/storage/v1/object/sign/assets/studio/out/1784550312632-test.pdf?token=eyJhbGciOi.J9.xyz";

// ---- U1: the redactor actually masks a real signed URL ----
{
  const out = redactSignedUrls(`here you go 👇 (${SIGNED})`);
  if (!out.includes("supabase.co") && !out.includes("token=") && out.includes("[file delivered as an attachment]"))
    ok("U1 a signed storage URL is masked");
  else fail(`U1 signed URL survived redaction: ${out}`);
}

// ---- U2: it survives JSON encoding, which is the shape it actually travels in ----
// The seam redacts the STRINGIFIED tool result, so the URL arrives with JSON escaping
// around it. A regex that only matches bare URLs would pass U1 and still leak in prod.
{
  const payload = JSON.stringify({ ok: true, summary: "Done, sent it.", detail: { delivered: true, file_url: SIGNED } });
  const out = redactSignedUrls(payload);
  if (!out.includes("supabase.co") && !out.includes("token=")) ok("U2 masked inside a JSON.stringify'd tool result");
  else fail("U2 signed URL survived redaction when JSON-encoded (the real shape)");
}

// ---- U3: ordinary links are NOT masked ----
// get_resource returns saved bookmarks, and the operator shares normal links. A blanket
// URL scrub would break the library lane, so the guard must stay narrow.
{
  const keep = "saved: https://www.vogue.com/article/nisria and https://nisria.co/about plus https://x.supabase.co/storage/v1/object/public/assets/logo.png";
  const out = redactSignedUrls(keep);
  if (out === keep) ok("U3 normal and PUBLIC storage links are left alone");
  else fail(`U3 over-redacted a legitimate link: ${out}`);
}

// ---- U4: the detector agrees with the masker ----
{
  if (hasSignedUrl(SIGNED) && !hasSignedUrl("https://nisria.co/about")) ok("U4 hasSignedUrl detects signed URLs only");
  else fail("U4 hasSignedUrl disagrees with the masker");
}

// ---- S1: THE SEAM. The model-facing tool_result is redacted ----
// This is the check that matters. If someone reverts this line, every file-delivering
// tool starts leaking again, in one place, for all 144 tools.
if (/results\.push\(\{\s*type:\s*"tool_result",\s*tool_use_id:\s*block\.id,\s*content:\s*redactSignedUrls\(JSON\.stringify\(out\)\)\s*\}\)/.test(sasa))
  ok("S1 the tool_result handed to the model is passed through redactSignedUrls");
else
  fail("S1 the model-facing tool_result MUST be wrapped in redactSignedUrls(JSON.stringify(out))");

// ---- S2: toolRuns keeps the REAL value ----
// Receipts, the composer and telemetry must still see the true URL. Redacting the
// receipt too would break the honesty spine, which binds claims to real receipts.
{
  const i = sasa.indexOf("toolRuns.push({ name: block.name, input: block.input, result: out })");
  if (i !== -1 && !/toolRuns\.push\([^)]*redactSignedUrls/.test(sasa))
    ok("S2 toolRuns keeps the unredacted result (receipts and composer unaffected)");
  else
    fail("S2 toolRuns must NOT be redacted: the composer binds claims to real receipts");
}

// ---- S3: no tool pastes a signed URL into a chat body ----
// Belt and braces on the seam: the summary is what the operator reads, and on the MCP
// bridge path it is sent verbatim. "Download (1h): <link>" was the literal 2026-07-20
// leak on the bridge path.
{
  const offenders = [];
  if (/Download \(1h\): \$\{link\}/.test(tools)) offenders.push("create_letterhead_doc bridge summary");
  // any summary template interpolating a variable named like a signed url
  const re = /summary:\s*humanize\(`[^`]*\$\{(?:link|fileUrl|signedUrl|file_url)\}/g;
  let m; while ((m = re.exec(tools))) offenders.push(m[0].slice(0, 60));
  if (!offenders.length) ok("S3 no tool interpolates a storage link into a chat summary");
  else fail(`S3 chat body still pastes a storage link: ${offenders.join(" | ")}`);
}

// ---- S4: the delivering tools still SEND the file ----
// The fix must not degrade into "stop sending links" by also not sending the document.
// The whole point is the attachment, which was already working.
{
  const sends = (tools.match(/await sendDocument\(/g) || []).length;
  if (sends >= 2) ok(`S4 sendDocument still used (${sends} call sites): the file itself is the delivery`);
  else fail("S4 sendDocument call sites disappeared: the attachment IS the deliverable");
}

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
