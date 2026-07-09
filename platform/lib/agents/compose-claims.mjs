// compose-claims.mjs — the action-claim composer (ADR-0017 follow-up, MASTER-LOOP Stage 2).
//
// The single seam that renders "Done / Sent / Logged" confirmation lines
// DETERMINISTICALLY from tool receipts, instead of letting the model free-write
// them and policing the prose with regex afterward. This is the correct-by-
// construction replacement for the ~10 reactive honesty guards in the finalize()
// ladder: a claim about a delivering/committing action can ONLY exist here if the
// tool's receipt says it happened. No receipt -> no line -> the failure is
// structurally impossible to emit, not caught after the fact.
//
// Pure by design: input is this turn's toolRuns (each carrying the tool's result
// receipt), output is the authoritative confirmation text + which action classes
// fired. No DB, no model, no imports from the heavy agent file -> unit-testable in
// isolation, and it joins the node wall green-gate (deepagents' middleware lesson,
// in our stack). .mjs so the plain-node walls import it; sasa.ts imports it too.
//
// Receipt contract this reads (already emitted by smart-tools.ts):
//   message_person   -> detail{ delivered, to, to_last4, via:'whatsapp'|'template', queued?, receipt_id }
//   post_to_group    -> detail{ posted, group } | ok summary naming the group
//   create_task      -> detail{ task_id, assignee?, deduped? }
//   complete_task    -> detail{ task_id }        (title in summary)
//   reopen_task      -> detail{ task_id }
//   update_task      -> detail{ task_id, changed[] }
//   create_event     -> detail{ event_id, synced? }
//   move_event       -> detail{ event_id }
//   record_payment   -> detail{ payment_id?, staged?, recorded? }
//   file_document    -> detail{ doc_id, delivered? }
//   flag_to_nur      -> detail{ delivered, to:'Nur' }

/**
 * @typedef {{ name: string, input?: any, result?: any }} ToolRun
 * @typedef {"send"|"post"|"task_create"|"task_complete"|"task_reopen"|"task_update"|"event_create"|"event_move"|"payment"|"file"|"flag"} ActionClass
 * @typedef {{ class: ActionClass, tool: string, line: string, receipt: Record<string, any> }} ComposedClaim
 * @typedef {{ text: string, claims: ComposedClaim[], classes: ActionClass[] }} ComposedClaims
 */

const isOk = (t) => t?.result?.ok === true;
const det = (t) => (t?.result?.detail && typeof t.result.detail === "object" ? t.result.detail : {});
// Title-bearing confirmations quote the receipt's OWN summary (already humanize()d)
// so the composed line matches the real record, never a model paraphrase.
const summ = (t) => String(t?.result?.summary || "").trim();

// Pull the first quoted title out of a tool summary ('Marked "Foo" done.').
function quotedTitle(s) {
  const m = String(s || "").match(/[""'"]([^""'"]{1,90})[""'"]/);
  return m ? m[1] : null;
}

// Deduped / no-op receipts are truthful successes but must NOT produce a fresh
// "Done" line (they already existed) -> a quieter acknowledgement instead.
const wasDeduped = (d) => d.deduped === true || d.deduped_in_turn === true || d.blocked === true;

/**
 * Compose the authoritative action-confirmation block from this turn's receipts.
 * @param {ToolRun[]} toolRuns
 * @returns {ComposedClaims}
 */
export function composeActionClaims(toolRuns) {
  /** @type {ComposedClaims} */
  const out = { text: "", claims: [], classes: [] };
  if (!Array.isArray(toolRuns) || toolRuns.length === 0) return out;

  const push = (cls, tool, line, receipt) => {
    if (!line) return;
    out.claims.push({ class: cls, tool, line, receipt });
    if (!out.classes.includes(cls)) out.classes.push(cls);
  };

  for (const t of toolRuns) {
    if (!isOk(t)) continue;
    const d = det(t);
    switch (t.name) {
      case "message_person": {
        if (wasDeduped(d)) { push("send", t.name, d.to ? `${d.to} already had that.` : `Already sent that.`, d); break; }
        if (d.delivered === true) {
          const to = d.to || "them";
          push("send", t.name, d.via === "template" ? `Sent to ${to} (delivered as an off-window update).` : `Sent to ${to}.`, d);
        } else if (d.queued === true) {
          push("send", t.name, `Held your message for ${d.to || "them"}; WhatsApp's 24h window is closed, so I'll send it the moment they next message in.`, d);
        }
        break;
      }
      case "post_to_group": {
        const g = d.group || quotedTitle(summ(t)) || null;
        push("post", t.name, g ? `Posted to the ${g} group.` : `Posted to the group.`, d);
        break;
      }
      case "create_task": {
        if (wasDeduped(d)) { push("task_create", t.name, `Already on the task board.`, d); break; }
        const title = quotedTitle(summ(t));
        const who = d.assignee && String(d.assignee).toLowerCase() !== "nur" ? ` for ${d.assignee}` : "";
        push("task_create", t.name, title ? `Logged the task "${title}"${who}.` : `Logged the task${who}.`, d);
        break;
      }
      case "complete_task": {
        const title = quotedTitle(summ(t));
        push("task_complete", t.name, title ? `Marked "${title}" done.` : `Marked it done.`, d);
        break;
      }
      case "reopen_task": {
        const title = quotedTitle(summ(t));
        push("task_reopen", t.name, title ? `Reopened "${title}".` : `Reopened it.`, d);
        break;
      }
      case "update_task": {
        const title = quotedTitle(summ(t));
        push("task_update", t.name, title ? `Updated "${title}".` : `Updated the task.`, d);
        break;
      }
      case "create_event": {
        if (wasDeduped(d)) { push("event_create", t.name, `Already on the calendar.`, d); break; }
        const title = quotedTitle(summ(t));
        push("event_create", t.name, title ? `Added "${title}" to the calendar.` : `Added it to the calendar.`, d);
        break;
      }
      case "move_event": {
        const title = quotedTitle(summ(t));
        push("event_move", t.name, title ? `Moved "${title}".` : `Moved the event.`, d);
        break;
      }
      case "record_payment":
      case "update_payment": {
        // Money is stage-then-confirm: a staged payment is NOT logged yet.
        if (d.staged === true || d.awaiting_confirm === true) {
          push("payment", t.name, `Staged the payment for your confirmation, nothing is recorded yet.`, d);
        } else if (d.payment_id || d.recorded === true) {
          push("payment", t.name, `Logged the payment.`, d);
        }
        break;
      }
      case "file_document":
      case "create_letterhead_doc": {
        if (d.delivered === true) push("file", t.name, `Filed it and sent you the file here.`, d);
        else if (d.doc_id) push("file", t.name, `Filed it${d.file_url ? "; the download link is in my message" : ""}.`, d);
        break;
      }
      case "flag_to_nur": {
        if (d.delivered === true) push("flag", t.name, `Flagged it to Nur.`, d);
        break;
      }
      default:
        break;
    }
  }

  out.text = out.claims.map((c) => c.line).join(" ");
  return out;
}
