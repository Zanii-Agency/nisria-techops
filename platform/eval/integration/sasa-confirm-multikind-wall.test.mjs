// Confirm-gate multi-kind money-safety wall (2026-07-01 routing audit). A bare "yes"
// must NOT commit MULTIPLE different-kind irreversible stages at once (a staged payment
// AND a staged send in the same 20-min window). Same-kind batches still commit together.
// When kinds differ and the operator didn't name which, list & ask (commit nothing);
// if she names one ("yes the payment"), commit only that kind. Plus: the intake route
// must exclude media/content nouns so "add a new child photo to the newsletter" is not
// treated as a beneficiary intake.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);

// mirror of the gate decision (keep in step with route.ts)
const IRREVERSIBLE = new Set(["confirm_action", "record_payment", "send_message", "case_to_approve", "bank_import"]);
const KIND_WORD = { record_payment: /\b(?:pay|payment|paid|money|log|record|expense)\b/i, send_message: /\b(?:send|message|msg|text|tell|whatsapp|reply)\b/i, case_to_approve: /\b(?:case|beneficiar|child|admit|approve)\b/i, bank_import: /\b(?:bank|import|statement|verif)\b/i };
// returns { action: "commit_all" | "ask" | "commit_kind", kind? }
function decide(pend, msg) {
  const t = msg.toLowerCase();
  const irrev = pend.filter((p) => IRREVERSIBLE.has(p.kind));
  const kinds = [...new Set(irrev.map((p) => p.kind))];
  if (kinds.length > 1) {
    const named = kinds.filter((k) => KIND_WORD[k] && KIND_WORD[k].test(t));
    if (named.length === 1) return { action: "commit_kind", kind: named[0] };
    return { action: "ask" };
  }
  return { action: "commit_all" };
}

// ---- C1: two payments (same kind) + "yes" -> commit all (batch preserved) ----
{
  const d = decide([{ kind: "record_payment", summary: "KES 5000 to Mark" }, { kind: "record_payment", summary: "KES 2000 to Grace" }], "yes");
  if (d.action !== "commit_all") fail(`C1 same-kind batch must commit all on yes, got ${d.action}`);
  else ok("C1 same-kind payment batch still commits together on a bare yes");
}

// ---- C2: payment + send + bare "yes" -> ASK, commit nothing ----
{
  const d = decide([{ kind: "record_payment", summary: "KES 5000 to Mark" }, { kind: "send_message", summary: "message Grace" }], "yes");
  if (d.action !== "ask") fail(`C2 mixed-kind + bare yes must ASK, got ${d.action}`);
  else ok("C2 payment + send + bare yes asks which (no blanket commit)");
}

// ---- C3: mixed kinds + "yes the payment" -> commit only the payment ----
{
  const d = decide([{ kind: "record_payment", summary: "KES 5000 to Mark" }, { kind: "send_message", summary: "message Grace" }], "yes the payment");
  if (!(d.action === "commit_kind" && d.kind === "record_payment")) fail(`C3 'yes the payment' must commit only the payment, got ${JSON.stringify(d)}`);
  else ok("C3 'yes the payment' commits only the payment");
  const d2 = decide([{ kind: "record_payment", summary: "x" }, { kind: "send_message", summary: "y" }], "yes the message");
  if (!(d2.action === "commit_kind" && d2.kind === "send_message")) fail(`C3b 'yes the message' must commit only the send, got ${JSON.stringify(d2)}`);
  else ok("C3b 'yes the message' commits only the send");
}

// ---- C4: single irreversible + yes -> commit (unchanged) ----
{
  const d = decide([{ kind: "record_payment", summary: "KES 5000" }], "yes");
  if (d.action !== "commit_all") fail("C4 a single staged payment must still commit on yes");
  else ok("C4 single staged action commits normally");
}

// ---- C5: the fix is wired in route.ts (anti-drift) ----
{
  const SRC = readFileSync(resolve(HERE, "../../app/api/whatsapp/worker/route.ts"), "utf8");
  if (!/distinctIrrevKinds\.length > 1 && effectiveYes/.test(SRC)) fail("C5a multi-kind guard missing from the confirm gate");
  else ok("C5a confirm gate guards multi-kind bare-yes");
  if (!/const pendToCommit = kindFilter/.test(SRC)) fail("C5b commit loop must use the kind-filtered pending set");
  else ok("C5b commit loop honors the kind filter");
  if (!/sasa\.confirm_ambiguous_kinds/.test(SRC)) fail("C5c ambiguous-kinds event missing");
  else ok("C5c ambiguous-kinds ask is observable");
  // intake media/content exclusion
  if (!/photo\|newsletter\|website\|site\|story\|post\|draft\|article\|caption\|content\|social/.test(SRC)) fail("C5d intake must exclude media/content nouns");
  else ok("C5d intake excludes photo/newsletter/story/post/etc");
}

if (process.exitCode) console.error("\nsasa-confirm-multikind-wall: FAIL");
else console.log("\nsasa-confirm-multikind-wall: ALL GREEN");
