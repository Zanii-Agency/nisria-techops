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
 * @typedef {"send"|"post"|"action"|"task_create"|"task_complete"|"task_reopen"|"task_update"|"event_create"|"event_move"|"payment"|"file"|"flag"} ActionClass
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
 * @param {{ isCommitting?: (name: string) => boolean }} [opts]
 * @returns {ComposedClaims}
 */
export function composeActionClaims(toolRuns, opts) {
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
      case "message_person":
      case "relay_to_colleague":
      case "send_file_to_person": {
        if (wasDeduped(d)) { push("send", t.name, d.to ? `${d.to} already had that.` : `Already sent that.`, d); break; }
        if (d.delivered === true) {
          const to = d.to || "them";
          const line = t.name === "relay_to_colleague"
            ? `Passed it to ${to} and told them it's from you.`
            : t.name === "send_file_to_person"
              ? `Sent the file to ${to}.`
              : d.via === "template" ? `Sent to ${to} (delivered as an off-window update).` : `Sent to ${to}.`;
          push("send", t.name, line, d);
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
        // Money is stage-then-confirm: a staged payment is NOT logged yet. The
        // receipt's own summary carries the "Ready to log X. Reply yes" affordance,
        // so prefer it (render-from-receipt includes the receipt's own words).
        if (d.staged === true || d.awaiting_confirm === true) {
          push("payment", t.name, summ(t) || `Staged the payment for your confirmation, nothing is recorded yet.`, d);
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
      default: {
        // GENERIC COMMITTING RECEIPT (the other ~125 tools): render the receipt's own
        // summary. smart-tools already words these carefully + humanized. Without this,
        // a stripped claim about e.g. add_beneficiary would leave the bot MUTE about a
        // real action. Gated on the caller telling us the tool commits (isCommitting),
        // so read-tool summaries ("3 open tasks") never masquerade as action claims.
        if (opts?.isCommitting?.(t.name) && summ(t)) push("action", t.name, summ(t), d);
        break;
      }
    }
  }

  out.text = out.claims.map((c) => c.line).join(" ");
  return out;
}

// Sentences that ASSERT a completed/attempted action in the model's own prose.
// These are the claims the composer owns as truth, so the model's version must be
// removed before the composed block is appended (else it duplicates or, worse,
// contradicts the receipt). Bias is deliberate: match aggressively. A stripped
// conversational nicety is harmless; a surviving false "Sent to X" is THE bug.
const ACTION_ASSERTION =
  /\b(?:sent|messaged|texted|told|notified|emailed|reminded|pinged|posted|logged|recorded|created|added(?!\s+bonus)|marked|completed|closed|reopened|updated|moved|rescheduled|scheduled|booked|filed|flagged|passed it|delivered|put it on|it'?s (?:on|now on) (?:the|your) calendar|handled it|taken care of|(?:is|are) now (?:set|scheduled|booked|moved|updated|on the (?:calendar|board))\b|set (?:it |that )?(?:to|for)\b|done(?:\.|,|!|\b))\b/i;
// Shapes that are NOT assertions of a done action: questions, and future/offer
// language ("I'll", "I can", "want me to", "shall I", "would you like"). These are
// kept — they are conversation, not a claim about what already happened.
const NOT_AN_ASSERTION =
  /\?\s*$|\b(?:i'?ll|i will|i can|i could|want me to|shall i|should i|would you like|do you want me to|let me|i'?m going to|i am going to|about to|next i'?ll)\b/i;

/**
 * Strip the model's own action-claim sentences from its prose, leaving the
 * conversational remainder (greetings, context, questions, offers). The composed
 * truth block is appended separately by assembleReply.
 * @param {string} modelText
 * @returns {string}
 */
export function stripModelActionClaims(modelText) {
  const text = String(modelText || "").trim();
  if (!text) return "";
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const kept = sentences.filter((s) => !(ACTION_ASSERTION.test(s) && !NOT_AN_ASSERTION.test(s)));
  return kept.join(" ").replace(/\s{2,}/g, " ").trim();
}

/**
 * The authoritative final reply: the model's conversational text with its action
 * claims removed, followed by the confirmation lines composed from receipts. This
 * is what finalize() routes through when SASA_RENDER_ACTION_CLAIMS is on — the
 * flag-gated cutover that replaces the reactive guard ladder.
 * @param {string} modelText
 * @param {ToolRun[]} toolRuns
 * @param {{ isCommitting?: (name: string) => boolean }} [opts]
 * @returns {{ reply: string, composed: ComposedClaims, conversational: string }}
 */
export function assembleReply(modelText, toolRuns, opts) {
  const composed = composeActionClaims(toolRuns, opts);
  const conversational = stripModelActionClaims(modelText);
  // Dedup: a deterministic backstop (e.g. the multi-payment stager) may have already
  // written a receipt's own summary into the reply text. Never append a line whose
  // head is already present, or the operator reads the confirmation twice.
  // (check only SURVIVING text: a stripped lie must never block its true replacement)
  const freshLines = composed.claims
    .map((c) => c.line)
    .filter((l) => l && !conversational.includes(l.slice(0, 30)));
  const reply = [conversational, freshLines.join(" ")].filter(Boolean).join(" ").trim();
  return { reply, composed, conversational };
}
