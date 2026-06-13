// Max-1-retry guard for /api/digital-u/ingest. The T4 meeting-bot worker can
// call back for the same meeting id more than once (re-tries, two captures,
// partial failures). Without a guard, each callback ships a fresh WhatsApp
// to Nur with the meeting summary. Same shape as the 2026-06-12 Zomato 5-ping
// incident on jensen-pa that produced KT #244.
//
// Strict rule: if digital_u_meetings.status is already 'captured', we have
// shipped Nur exactly one summary for that meeting. Subsequent ingest
// callbacks are no-ops — `mode: "already-acked"` is returned.
//
// 'failed' is intentionally NOT terminal here: a "couldn't capture (waiting
// room, host kicked)" failure can legitimately be retried after the human
// fixes the issue, and the cost of one duplicate "I tried to join" line
// is preferable to silently dropping a real retry.
//
// 'transcribing' and 'queued' are clearly in-progress and never terminal.
//
// Doctrine: this is a chokepoint-side guard reading the canonical
// digital_u_meetings row (Law 7 source-of-truth) instead of a kv side-table.
// Same architectural choice as KT #244 on jensen-pa.

export function isAckedMeetingStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return status === "captured";
}
