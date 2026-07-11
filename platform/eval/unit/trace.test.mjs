// Unit wall for the trace assembler (lib/agents/trace.mjs). Pure, no network.
// Proves the LangSmith-shape run tree: ordered spans, "which specialist failed
// and why" is legible, and the composed-claims span is captured for the soak.
//
// Run: node eval/unit/trace.test.mjs

import { assembleTrace, renderTrace } from "../../lib/agents/trace.mjs";

let pass = 0, fail = 0;
const eq = (got, want, note) => {
  const okk = got === want;
  console.log(`${okk ? "PASS" : "FAIL"}  ${note}`);
  if (!okk) { console.log(`      got:  ${JSON.stringify(got)}`); console.log(`      want: ${JSON.stringify(want)}`); fail++; } else pass++;
};
const has = (got, sub, note) => {
  const okk = typeof got === "string" && got.includes(sub);
  console.log(`${okk ? "PASS" : "FAIL"}  ${note}`);
  if (!okk) { console.log(`      got: ${JSON.stringify(got)}`); fail++; } else pass++;
};

const ev = (type, payload, at, cid = "T1") => ({ type, payload, created_at: at, correlation_id: cid });

// A happy money turn: routed -> tools -> claims composed -> completed.
const happy = [
  ev("mesh.routed", { domain: "money", confidence: 0.9, reason: "route", steps: 1 }, "2026-07-11T10:00:00Z"),
  ev("whatsapp.message_out", { to_last4: "1234" }, "2026-07-11T10:00:01Z"),
  ev("sasa.claims_composed", { classes: ["send"], claim_count: 1, overrode_reply: true }, "2026-07-11T10:00:02Z"),
  ev("mesh.completed", { domain: "money", toolsRan: ["message_person"], steps: 1 }, "2026-07-11T10:00:03Z"),
];
{
  const t = assembleTrace(happy, "T1");
  eq(t.spans.length, 4, "all 4 spans assembled");
  eq(t.spans[0].kind, "route", "first span is the routing decision");
  eq(t.failed, false, "happy path not marked failed");
  eq(t.domains.join(","), "money", "domain extracted");
  has(t.spans[0].line, "routed to money", "routing line legible");
  has(t.spans[2].line, "composed [send]", "claims_composed span shows classes (soak signal)");
}

// A FAILED turn: the whole point of the trace — which specialist, and why.
const broke = [
  ev("mesh.routed", { domain: "people", confidence: 0.8, reason: "route", steps: 1 }, "2026-07-11T11:00:00Z"),
  ev("mesh.specialist_error", { domain: "people", error: "find_beneficiary threw: DB timeout" }, "2026-07-11T11:00:01Z"),
];
{
  const t = assembleTrace(broke, "T1");
  eq(t.failed, true, "failed turn flagged");
  has(t.spans[1].line, "people FAILED", "names the failing specialist");
  has(t.spans[1].line, "DB timeout", "surfaces WHY it failed");
  has(t.summary, "FAILED", "summary carries the failure");
}

// Ordering by created_at, not array order (events can arrive out of order).
const unordered = [
  ev("mesh.completed", { domain: "work" }, "2026-07-11T12:00:03Z"),
  ev("mesh.routed", { domain: "work", confidence: 0.9 }, "2026-07-11T12:00:00Z"),
];
{
  const t = assembleTrace(unordered, "T1");
  eq(t.spans[0].kind, "route", "spans sorted by time, route first");
  eq(t.spans[1].kind, "complete", "completion last");
}

// correlation_id filtering: only this turn's events.
{
  const mixed = [ev("mesh.routed", { domain: "money" }, "2026-07-11T13:00:00Z", "T1"), ev("mesh.routed", { domain: "work" }, "2026-07-11T13:00:00Z", "T2")];
  const t = assembleTrace(mixed, "T1");
  eq(t.spans.length, 1, "filters to the requested traceId");
  eq(t.domains.join(","), "money", "only T1's domain");
}

// Unknown event types are still shown (lossless), not dropped.
{
  const t = assembleTrace([ev("sasa.some_new_event", { x: 1 }, "2026-07-11T14:00:00Z")], "T1");
  eq(t.spans.length, 1, "unknown event still becomes a span (lossless)");
}

// renderTrace produces readable text.
{
  const txt = renderTrace(assembleTrace(happy, "T1"));
  has(txt, "trace T1", "render has trace header");
  has(txt, "00 → routed to money", "render numbers + shows spans");
}

// Empty / defensive.
eq(assembleTrace([], "T1").summary, "no events for this trace", "empty trace safe");
eq(assembleTrace(null).spans.length, 0, "null events safe");

console.log(`\ntrace wall: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
