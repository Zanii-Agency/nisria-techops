// delete_task confirm wall (spec 007 §1, 2026-07-21 live data-loss incident).
//
// WHAT THIS PINS. Five delete_* tools stage a "reply yes" before doing anything on a WhatsApp
// turn. delete_task was the ONE that did not, and that gap caused real, irreversible data loss:
// Nur said "drop 1.3, 1.4, 1.5" against a mis-scoped task list, and two tasks (one hers, one
// Malek Malieng's) were permanently deleted with no confirmation. delete_task now joins
// DELETE_TOOLS so no irreversible task delete executes on model judgment.
//
// This is the root-cause fix, not a patch: consent (a human "yes") is the safety, not row
// identity. The interceptor already reads input.title (delete_task's arg) for the preview.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
let failed = 0;
const ok = (m) => console.log(`PASS: ${m}`);
const fail = (m) => { failed++; console.log(`FAIL: ${m}`); };

const src = readFileSync(resolve(HERE, "../../lib/smart-tools.ts"), "utf8");

// ---- D1: delete_task is in the staged-confirm set ----
const setLine = (src.match(/const DELETE_TOOLS = new Set\(\[[^\]]*\]\)/) || [""])[0];
if (/"delete_task"/.test(setLine)) ok("D1 delete_task is in DELETE_TOOLS (staged for reply-yes)");
else fail("D1 delete_task MUST be in DELETE_TOOLS — an unconfirmed task delete caused live data loss");

// ---- D2: the five siblings are still staged (no accidental removal) ----
{
  const siblings = ["delete_event", "delete_contact", "delete_case", "delete_document", "delete_payment"];
  const missing = siblings.filter((t) => !new RegExp(`"${t}"`).test(setLine));
  if (!missing.length) ok("D2 all five original delete tools still staged");
  else fail(`D2 a delete tool fell out of the staged set: ${missing.join(", ")}`);
}

// ---- D3: the interceptor fails CLOSED — no contactId means refuse, never delete ----
// The whole point: if the confirm can't be set up, nothing is deleted. Assert the guard still
// returns refused rather than falling through to the delete.
if (/if \(!ctx\.contactId\) return \{ ok: false[\s\S]{0,160}?deleted nothing/.test(src))
  ok("D3 interceptor fails closed: no contact for confirm => deletes nothing");
else fail("D3 the confirm interceptor must refuse (delete nothing) when it cannot stage");

// ---- D4: staging failure also fails closed ----
if (/if \(stErr\) return \{ ok: false[\s\S]{0,160}?deleted nothing/.test(src))
  ok("D4 a staging insert error deletes nothing (fails closed)");
else fail("D4 a staging error must delete nothing");

// ---- D5: the interceptor gates on confirmWrites (WhatsApp), not the web console ----
// A human clicking delete in the portal (no confirmWrites) is a direct, already-consented action.
if (/if \(ctx\.confirmWrites && DELETE_TOOLS\.has\(name\)\)/.test(src))
  ok("D5 staging applies only on confirmWrites turns (WhatsApp), console delete stays direct");
else fail("D5 the confirm gate must key on ctx.confirmWrites");

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
