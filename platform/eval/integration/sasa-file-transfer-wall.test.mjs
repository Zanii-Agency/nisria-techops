// File-transfer wall (2026-07-21). Operator directive: "files, images, pdfs, zips, links
// must be transferable between people." Two halves had to hold:
//
//   INGESTION. The worker only STORED images/PDFs/audio; every other file (zip, office doc,
//   video, design file) hit a "send it another way" nudge and RETURNED, so it never entered
//   the library and "send Bashir this zip" died before Sasa even ran. That is the brand-books
//   failure. Now any file is stored + filed (no extraction) so it is forwardable, and the turn
//   continues so an accompanying instruction is acted on.
//
//   DELIVERY. WhatsApp delivers PDFs/Office/images natively but rejects some types (.zip) and
//   can fail on size. deliverFile tries the native media message, then falls back to a download
//   LINK as text, so an unsupported type never means "can't send".
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
let failed = 0;
const ok = (m) => console.log("PASS:", m);
const fail = (m) => { failed++; console.log("FAIL:", m); };
const worker = readFileSync(resolve(HERE, "../../app/api/whatsapp/worker/route.ts"), "utf8");
const st = readFileSync(resolve(HERE, "../../lib/smart-tools.ts"), "utf8");

// ---- INGESTION ----
// F1: a non-readable file is now DOWNLOADED + STORED, not dropped. The old drop-and-return
// nudge ("I cannot watch video yet") is gone from that branch.
if (/arrived and is now SAVED on file/.test(worker) && !/I cannot watch video yet/.test(worker))
  ok("F1 non-readable files are stored (old drop-and-nudge branch removed)");
else fail("F1 the video/zip/other branch must store the file, not drop it with a nudge");
// F2: it is filed so send_file_to_person can find it — createBatch with the stored file, no text.
if (/inputs: \[\{ channel: "whatsapp"[\s\S]{0,140}?storage_path: proofPath, asset_id: stored\.assetId \}\]/.test(worker))
  ok("F2 the stored file is filed into documents (createBatch with storage_path, findable/sendable)");
else fail("F2 non-readable ingest must createBatch the stored file so it is forwardable");
// F3: the turn CONTINUES (command is set, no early return/nudge) and Sasa is told it CAN forward it.
if (/You cannot read its contents[\s\S]{0,120}?forward it to anyone with send_file_to_person/.test(worker)
    && /Do NOT say you cannot handle this file type/.test(worker))
  ok("F3 Sasa is told it stored the file and CAN forward it (never 'cannot handle this type')");
else fail("F3 the ingest command must let Sasa forward the file, not deny the type");

// ---- DELIVERY ----
// F4: deliverFile sends the native WhatsApp file for deliverable types. NO LINK FALLBACK
// (operator directive 2026-07-22: never text a raw storage/download URL). An unsupported type
// returns unsupportedType, never a link. The native send passes `link` to WhatsApp which fetches
// it server-side (recipient sees the FILE, not a URL) — that is allowed; texting the URL is not.
if (/async function deliverFile/.test(st)
    && /startsWith\("image\/"\) \? await sendImage\(number, link[\s\S]{0,80}?sendDocument\(number, link/.test(st)
    && /if \(!waNativeSendable\(m\)\) return \{ ok: false, via: null, unsupportedType: true/.test(st))
  ok("F4 deliverFile sends native only; unsupported types return unsupportedType (no link)");
else fail("F4 deliverFile must be native-only with an unsupportedType result, no link fallback");
// F5: BOTH send_file_to_person sites route through deliverFile (current-turn attachment + filed doc).
const sites = (st.match(/await deliverFile\(db, number!/g) || []).length;
if (sites >= 2) ok(`F5 both send_file_to_person paths use deliverFile (${sites} sites)`);
else fail(`F5 both send sites (attachment + filed doc) must use deliverFile, found ${sites}`);
// F6: NO DB LINKS EVER. deliverFile must not text a signed/storage URL as a message body, and
// an unsupported type must be reported honestly (never dressed up, never a link).
if (!/sendTextAndLog\([^)]*\$\{link\}/.test(st) && !/sendText\([^)]*\$\{link\}/.test(st)
    && /WhatsApp can't carry that file type/.test(st))
  ok("F6 no raw link is ever texted; an unsupported type is reported honestly");
else fail("F6 must never text a storage/download link; report unsupported types honestly");
// F7: THE load-bearing fix. send_file_to_person searches the ASSETS table, not only documents.
// indexDocument skips text-less files (<30 chars), so a stored zip/image has NO documents row;
// searching only documents would leave it unfindable and unforwardable despite being stored.
if (/from\("assets"\)\.select\("title,mime,storage_path"\)\.ilike\("title", likeD\)/.test(st))
  ok("F7 send_file_to_person also searches assets (text-less binaries are findable/sendable)");
else fail("F7 send_file_to_person MUST search assets or a stored-but-textless file stays unforwardable");
// F8: TEAM-TIER SENSITIVITY WALL. Broadening the search to assets must NOT let a team member
// forward a restricted (finance/legal/ID) file. documents filters sensitivity=normal for team,
// and asset candidates are cross-checked against their documents row and restricted ones dropped.
if (/const isTeam = ctx\.tier === "team"/.test(st)
    && /isTeam \? docsQ\.eq\("sensitivity", "normal"\)/.test(st)
    && /blockedPaths\.has\(a\.storage_path\)/.test(st))
  ok("F8 team-tier callers cannot forward restricted files (documents + assets both walled)");
else fail("F8 send_file_to_person must apply the team-tier sensitivity wall to BOTH documents and assets");

// ---- HARDENING (from the adversarial review, 2026-07-21) ----
// F9: deliverFile only delivers types WhatsApp actually renders natively. zip/webp/svg/video
// are NOT in the allowlist (a native POST for them returns a wamid then fails async), so they
// are reported unsupported — never sent, never linked.
if (/function waNativeSendable/.test(st) && !/application\/zip/.test(st.match(/function waNativeSendable[\s\S]*?\n\}/)?.[0] || ""))
  ok("F9 native allowlist excludes zip/webp/video (reported unsupported, not falsely 'sent')");
else fail("F9 waNativeSendable must exclude zip/webp/video");
// F10: the ingest branch caps download size so a 100MB file cannot OOM the function.
if (/downloadMedia\(mediaId, \{ maxBytes:/.test(worker) && /media && media\.tooLarge/.test(worker) && /function downloadMedia\(mediaId: string, opts/.test(readFileSync(resolve(HERE, "../../lib/whatsapp.ts"), "utf8")))
  ok("F10 non-readable ingest caps download size (no OOM) and handles too-large honestly");
else fail("F10 non-readable ingest must cap file size before buffering it twice");
// F11: a sender's caption ("send this to Bashir") is NOT clobbered by the fallback body stamp.
if (/asset_id: stored\.assetId, \.\.\.\(text \? \{\} : \{ body: mediaName \|\| msgType \}\)/.test(worker))
  ok("F11 a real caption is preserved (fallback body only stamped when there is no text)");
else fail("F11 the ingest body-stamp must not overwrite a sender caption");
// F12: dedupe keys on a STABLE id (not title — two same-titled files must not collapse), and
// the empty-query guard re-checks the SANITIZED value so a garbled "%"/":" query cannot match all.
if (/key: ingestPath \|\| url \|\| `doc:\$\{dc\.id\}`/.test(st) && /const core = query\.replace\(\/\[\(\),:\*%_\]\/g, ""\)\.trim\(\);[\s\S]{0,80}?if \(!core\)/.test(st))
  ok("F12 send lookup dedupes by stable id (not title) and re-checks the sanitized-empty query");
else fail("F12 lookup must dedupe by stable key AND guard the sanitized-empty query");
// F13: COALESCED-MEDIA RECOVERY (2026-07-22). When an image/file is coalesced with text in one
// burst, assembleBurst joins only the raw "[image]" bodies and drops the attachment, so the model
// denied "I can't receive images". The worker must recover the burst's stored asset as proofPath
// so send_file_to_person can forward "this", and tell the model it HAS the file.
if (/COALESCED MEDIA RECOVERY/.test(worker)
    && /\.in\("id", coalescedMessageIds\)\.not\("asset_id", "is", null\)/.test(worker)
    && /proofPath = ap;/.test(worker)
    && /Do NOT say you cannot receive or view files/.test(worker))
  ok("F13 a photo/file coalesced with text is recovered as proofPath and is forwardable");
else fail("F13 the worker must recover a coalesced burst's attachment so it can be forwarded");

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
