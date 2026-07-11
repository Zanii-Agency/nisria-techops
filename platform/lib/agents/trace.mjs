// trace.mjs — the LangSmith-shape trace assembler (STEP 4).
//
// Turns a turn's raw `events` rows (all sharing one correlation_id/traceId) into
// an ordered, readable run tree: router decision -> specialist -> tools -> claims
// composed -> guards fired -> completion. This is the "the trace shows WHICH
// sub-agent failed and WHY" capability, built on the events already emitted
// (no new telemetry pipeline, no LangSmith SDK, no Python) — the deepagents/
// LangSmith debugging lesson delivered in-stack. Pure + unit-testable.

/**
 * @typedef {{ type: string, source?: string, payload?: any, created_at?: string, correlation_id?: string }} EventRow
 * @typedef {{ order: number, kind: "route"|"specialist"|"tool"|"claims"|"guard"|"complete"|"error"|"event", type: string, line: string, at: string|null, payload: any }} Span
 * @typedef {{ traceId: string|null, spans: Span[], failed: boolean, domains: string[], summary: string }} Trace
 */

const trunc = (s, n = 120) => { const t = String(s ?? ""); return t.length > n ? t.slice(0, n) + "…" : t; };
const arr = (x) => (Array.isArray(x) ? x : x == null ? [] : [x]);

// Map an event type -> {kind, render}. Unmapped types still appear as a generic
// span so the trace is never lossy (an unknown event is a clue, not noise).
function classify(ev) {
  const p = ev.payload || {};
  switch (ev.type) {
    case "mesh.routed":
      return { kind: "route", line: `→ routed to ${p.domain} (${p.reason || "route"}, conf ${p.confidence ?? "?"}${p.steps > 1 ? `, ${p.steps} steps` : ""})` };
    case "mesh.completed":
      return { kind: "complete", line: `✓ ${p.domain} done — tools: ${arr(p.toolsRan).join(", ") || "none"}` };
    case "mesh.specialist_error":
      return { kind: "error", line: `✗ ${p.domain} FAILED: ${trunc(p.error)}` };
    case "mesh.domain_leakage":
      return { kind: "guard", line: `⚠ domain leakage in ${p.domain}: ${trunc(p.details)}` };
    case "sasa.claims_composed":
      return { kind: "claims", line: `⊙ composed [${arr(p.classes).join(", ") || "none"}] (${p.claim_count ?? 0} claim${p.claim_count === 1 ? "" : "s"}), overrode_reply=${!!p.overrode_reply}` };
    case "sasa.send_claim_reconciled":
      return { kind: "guard", line: `⚠ send-claim reconciled (over-fire signal — watch during soak)` };
    case "sasa.honesty.guard_fired":
    case "sasa.honesty_guard_substituted":
    case "sasa.relay_gate_substituted":
    case "sasa.false_no_send_corrected":
    case "sasa.false_no_post_corrected":
    case "sasa.false_no_action_corrected":
    case "sasa.canned_nonsequitur_replaced":
    case "sasa.question_loop_break":
      return { kind: "guard", line: `⚠ guard fired: ${ev.type.replace(/^sasa\./, "")}` };
    default:
      if (ev.type.startsWith("whatsapp.")) return { kind: "tool", line: `· ${ev.type.replace(/^whatsapp\./, "")} ${trunc(JSON.stringify(p), 60)}` };
      return { kind: "event", line: `· ${ev.type}` };
  }
}

/**
 * Assemble an ordered trace from a turn's events (already filtered to one
 * correlation_id, or pass all and set traceId to filter here).
 * @param {EventRow[]} events
 * @param {string|null} [traceId] optional: filter events to this correlation_id
 * @returns {Trace}
 */
export function assembleTrace(events, traceId = null) {
  const rows = (Array.isArray(events) ? events : [])
    .filter((e) => e && (traceId == null || e.correlation_id === traceId))
    .slice()
    .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));

  /** @type {Span[]} */
  const spans = [];
  const domains = new Set();
  let failed = false;
  rows.forEach((ev, i) => {
    const c = classify(ev);
    if (c.kind === "error") failed = true;
    if (ev.payload?.domain) String(ev.payload.domain).split("+").forEach((d) => domains.add(d));
    spans.push({ order: i, kind: c.kind, type: ev.type, line: c.line, at: ev.created_at || null, payload: ev.payload || {} });
  });

  const domainList = [...domains];
  const summary = spans.length === 0
    ? "no events for this trace"
    : `${spans.length} span${spans.length === 1 ? "" : "s"}${domainList.length ? ` across ${domainList.join(", ")}` : ""}${failed ? " — FAILED" : ""}`;

  return { traceId: traceId ?? (rows[0]?.correlation_id || null), spans, failed, domains: domainList, summary };
}

/**
 * Render a trace as a flat text block (for a debug endpoint / CLI / log).
 * @param {Trace} trace
 * @returns {string}
 */
export function renderTrace(trace) {
  const head = `trace ${trace.traceId || "(none)"} — ${trace.summary}`;
  const body = trace.spans.map((s) => `  ${String(s.order).padStart(2, "0")} ${s.line}`).join("\n");
  return trace.spans.length ? `${head}\n${body}` : head;
}
