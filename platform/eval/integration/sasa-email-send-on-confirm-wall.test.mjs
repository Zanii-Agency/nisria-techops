// Email send-on-confirm wall (2026-06-30, this session). Taona: "if I say send an
// email it happens, just one confirmation, not the portal." draft_email queues an
// email_reply approval; approving it used to REQUIRE the portal "Needs You". The new
// worker block lets an in-chat "send it" / "fire it" / "email it", or a bare "yes"
// right after a draft preview, approve+send via the SAME approveApproval the portal
// calls. ONE in-chat confirm, no portal. Safety: a bare "yes" only sends when the last
// bubble was a draft preview, and several pending drafts with no named recipient ASK
// which (a stray "yes" can never fire the wrong email). These regexes MIRROR the worker
// block (app/api/whatsapp/worker/route.ts); the source-marker checks below fail the
// wall if that block is removed or renamed, bounding the drift.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);

// --- mirrors of the worker-block detection (keep byte-identical) ---
const explicitSend = (c) => /\b(?:send it|send the email|send that email|send this email|fire it|email it|go ahead and send(?: it)?|send the draft|send it now)\b/i.test(c || "");
// CRITICAL GUARD (2026-07-01 incident): never treat a task/case/payment message, or a
// person-directed relay ("send it to Mark"), as an email-draft confirm; and require the
// send phrase to be primary (short message, or right after a draft preview).
const otherIntent = (c) => /\b(?:task|reminder|beneficiary|case|payment|invoice|meeting|event|appointment|note to self)\b/i.test(c || "")
  || /\bsend (?:it|this|that|the letter|the report|them|him|her)\s+to\s+[A-Z]?[a-z]+/i.test(c || "");
const wc = (c) => String(c || "").trim().split(/\s+/).filter(Boolean).length;
const bareYesSend = (c) => /^\s*(?:yes|yeah|yep|yup|ok(?:ay)?|sure|go\s*ahead|do it|send|send it|confirm(?:ed)?|approve(?:d)?)\s*[.!]*\s*$/i.test(c || "");
const lastWasDraftPreview = (s) => !!s && /here'?s (?:the|what will go|your)[^\n]*\b(?:draft|email)\b|\*?subject:?\*?/i.test(s);
const sendEmailConfirm = (c, anchor) => explicitSend(c) && !otherIntent(c) && (wc(c) <= 8 || lastWasDraftPreview(anchor));
// fires? = an explicit email send-confirm OR a bare yes right after a draft preview
const fires = (cmd, anchor) => sendEmailConfirm(cmd, anchor) || (bareYesSend(cmd) && lastWasDraftPreview(anchor));

const DRAFT_BUBBLE = "Here's the draft to taonac96@gmail.com:\n\n*Subject:* Catch-up this Friday\n\nHi there, hope this finds you well.";

// ---- E1: explicit email send-confirm phrases fire ----
{
  for (const c of ["send it", "send the email", "fire it", "email it", "go ahead and send it", "send the draft", "send it now"])
    if (!sendEmailConfirm(c)) fail(`E1 "${c}" must be a send-confirm`);
  ok("E1 explicit send-confirm phrases fire");
}

// ---- E2: unrelated commands do NOT fire (no stray send) ----
{
  for (const c of ["what's the weather", "draft an email to mwangi about funding", "show me the draft", "read me the latest email", "delete that task"])
    if (fires(c, DRAFT_BUBBLE)) fail(`E2 "${c}" must NOT fire an email send`);
  ok("E2 unrelated / draft / show / read commands do not send");
}

// ---- E3: bare "yes" only sends right after a draft preview ----
{
  if (!fires("yes", DRAFT_BUBBLE)) fail("E3a bare 'yes' AFTER a draft preview must fire");
  if (fires("yes", "I filed that document for reference.")) fail("E3b bare 'yes' after a NON-draft bubble must NOT fire");
  if (fires("yes", null)) fail("E3c bare 'yes' with no prior bubble must NOT fire");
  if (!fires("go ahead", DRAFT_BUBBLE)) fail("E3d 'go ahead' after a draft must fire");
  ok("E3 bare affirmative sends only directly after a draft preview");
}

// ---- E4: recipient narrowing token extraction (mirrors worker STOP set) ----
{
  const STOP = new Set(["send", "it", "the", "email", "draft", "that", "this", "now", "fire", "go", "ahead", "yes", "yeah", "please", "to", "out", "off", "and", "approve", "approved", "confirm", "confirmed", "ok", "okay", "sure"]);
  const toks = (c) => c.toLowerCase().replace(/[^a-z0-9@.]+/g, " ").split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w));
  if (JSON.stringify(toks("send the one to mwangi")) !== JSON.stringify(["mwangi"])) fail("E4a 'send the one to mwangi' must extract ['mwangi']");
  if (toks("send it").length !== 0) fail("E4b bare 'send it' must extract no recipient token (so multiple drafts ASK which)");
  ok("E4 recipient narrowing tokenizer is correct");
}

// ---- E5: the worker block actually exists and reuses approveApproval (anti-drift) ----
{
  const src = readFileSync(resolve(HERE, "../../app/api/whatsapp/worker/route.ts"), "utf8");
  const need = ["sendEmailConfirm", "lastWasDraftPreview", "approveApproval(chosen.id", "sasa.email_sent_on_confirm", 'eq("kind", "email_reply").eq("status", "pending")'];
  for (const m of need) if (!src.includes(m)) fail(`E5 worker block missing marker: ${m}`);
  // admin-only gate present in the block region
  if (!/opRank === "owner" \|\| opRank === "founder"/.test(src)) fail("E5 admin-only gate missing");
  ok("E5 worker block present: in-chat confirm -> approveApproval (portal's own send path), admin-only");
}

// ---- E6: the 2026-07-01 incident must NEVER fire an email send ----
// Nur: "Add this task to me as urgent for today: - Prepare letter ... and send it to
// Mark." "send it" matched, and a 37-day-old stale draft went to global@hamkke.org.
{
  const NUR = "Add this task to me as urgent for today:\n- Prepare letter for Juvenile Center and send it to Mark.";
  if (fires(NUR, null)) fail("E6a a task-create containing 'send it to Mark' must NOT fire an email send");
  else ok("E6a task-create with 'send it to X' does not send an email");
  if (fires("send it to Mark", null)) fail("E6b a person-directed 'send it to Mark' is a relay, not an email-draft confirm");
  else ok("E6b 'send it to Mark' (person relay) does not fire an email send");
  if (fires("prepare the report and send it to the board tomorrow", null)) fail("E6c a long imperative that merely contains 'send it' must NOT fire");
  else ok("E6c long imperative containing 'send it' does not fire");
  // legit confirms still work
  if (!fires("send it", null)) fail("E6d a short bare 'send it' must still fire");
  else ok("E6d short 'send it' still fires");
  if (!fires("send the email to mwangi", null)) fail("E6e 'send the email to mwangi' must still fire");
  else ok("E6e 'send the email to mwangi' still fires");
}

// ---- E7: worker enforces recency + recipient-match (anti-drift on the fix) ----
{
  const src = readFileSync(resolve(HERE, "../../app/api/whatsapp/worker/route.ts"), "utf8");
  if (!/gte\("created_at", draftCutISO\)/.test(src)) fail("E7a recency gate (draftCutISO) missing from the drafts query");
  else ok("E7a drafts query is recency-gated (no stale draft can be sent by a confirm)");
  if (!/RECIPIENT-MATCH GUARD/.test(src) || !/drafts\.length === 1/.test(src)) fail("E7b recipient-match guard (single-draft) missing");
  else ok("E7b single-draft recipient-match guard present (won't send to the wrong address)");
  if (!/const otherIntent =/.test(src) || !/const sendEmailConfirm = explicitSend && !otherIntent/.test(src)) fail("E7c otherIntent / primary-content guard missing from worker");
  else ok("E7c worker gates sendEmailConfirm on !otherIntent + primary content");
}

if (process.exitCode) console.error("\nsasa-email-send-on-confirm-wall: FAIL");
else console.log("\nsasa-email-send-on-confirm-wall: ALL GREEN");
