// ORCHESTRATOR (mesh) — deterministic routing + domain-scoped delegation.
//
// The ONLY agent entry from the worker. Flow:
// 1. media -> intake-pipeline -> domain ; text -> router.routeMessage
// 2. low confidence -> decomposeMessage into per-domain steps
// 3. runSpecialist(domain): the shared engine, HARD-scoped to that domain's tools
// 4. multi-step -> synthesize
// 5. finalizeWithGuard: cross-domain leakage check on the REAL tools that ran
//
// There is NO monolith fallback. A specialist failure returns an honest error and
// emits mesh.specialist_error; it never re-runs the engine with the full toolset.

import { runSasa, type SasaTurn, type SasaResult } from "./sasa";
import { routeMessage, decomposeMessage, type Domain } from "./router";
import { runSpecialist } from "./specialists";
import { processIntake } from "./intake-pipeline";
import { TOOL_TO_DOMAIN, checkDomainLeakage, getToolsForDomain } from "./manifests";
import { claudeJSON } from "../anthropic";
import { emit } from "../events";

// Kept as a kill-switch hook. The worker no longer branches on it (the mesh is
// the only path); when off, routing simply collapses everyone to the engine via
// the general specialist. Never re-enables a full-tool monolith brain.
export function meshEnabled(): boolean {
  return (process.env.SASA_MESH || "").toLowerCase() === "on";
}

// Mesh telemetry. Awaited (emit() swallows its own errors) so the insert flushes
// before the serverless worker suspends; un-awaited inserts get dropped.
async function emitMesh(type: string, payload: Record<string, any>, traceId: string | null = null): Promise<void> {
  try {
    await emit({
      type,
      source: "agent:orchestrator",
      actor: "system",
      subject_type: "domain",
      subject_id: null, // events.subject_id is uuid; domain lives in payload
      correlation_id: traceId, // STEP 4 trace rail: joins mesh spans to the turn's traceId
      payload,
    });
  } catch {}
}

type OrchestratorOpts = Parameters<typeof runSasa>[0];

const HONEST_ERROR = "I hit a snag handling that just now. I have flagged it and will pick it back up. Mind sending it again in a moment?";

export async function runOrchestrated(opts: OrchestratorOpts): Promise<SasaResult> {
  const command = String((opts as any).command || "");
  const history: SasaTurn[] = [...((opts as any).history || [])];
  const tier = (opts as any).operatorRole === "team" ? "team" : "admin";
  const traceId: string | null = (opts as any).traceId || null; // STEP 4: one trace per turn

  // Match the worker's ACTUAL attachment markers. The worker writes
  // "[document attachment, here is what it shows]", "[image/screenshot attachment ...]"
  // (and "...from a team member..." variants), and "[voice note, transcribed]" — NEVER
  // "[Media attachment". The old gate/regex matched none of those, so extracted text was
  // always empty (documents lost their content) and images skipped intake entirely.
  const ATTACH_RE = /\[[^\]]*attachment[^\]]*here is what it shows\]\n([\s\S]*?)(?:\n\n|$)/;
  const VOICE_RE = /\[voice note, transcribed\]\n([\s\S]*?)(?:\n\n|$)/;
  const isMedia = ATTACH_RE.test(command) || VOICE_RE.test(command);

  let steps: { domain: Domain; text: string }[] = [];

  if (isMedia) {
    const m = command.match(ATTACH_RE) || command.match(VOICE_RE);
    const extractedText = (m?.[1] || "").trim();
    const originalCommand = command.split(/\n*\[(?:[^\]]*attachment|voice note)/)[0].trim();
    const mediaType = command.includes("[document") ? "document" : command.includes("[image") ? "image" : "voice";
    const intakeResult = await processIntake({ extractedText, originalCommand, mediaType, history });
    steps = [{ domain: intakeResult.domain, text: intakeResult.routedCommand }];
    await emitMesh("mesh.routed", { domain: intakeResult.domain, confidence: 1, reason: "media_intake", command: command.slice(0, 200) }, traceId);
  } else {
    const routeResult = await routeMessage(command, history);
    if (routeResult.confidence < 0.7) {
      const decomposed = await decomposeMessage(command);
      // Cap fan-out: a single message can't explode into unbounded specialist runs
      // (cost/DoS amplification + per-step domain smuggling). Handle the first few.
      steps = decomposed.length > 1 ? decomposed.slice(0, 3) : [{ domain: routeResult.domain, text: command }];
    } else {
      steps = [{ domain: routeResult.domain, text: command }];
    }
    // STEP 4 trace rail: the routing decision is the mesh's key debug span ("which
    // specialist, and why"). The media path already emits it; the text path did not.
    await emitMesh("mesh.routed", { domain: routeResult.domain, confidence: routeResult.confidence, reason: routeResult.confidence < 0.7 ? "low_conf_decompose" : "route", steps: steps.length, command: command.slice(0, 200) }, traceId);
  }

  // Single step: run the specialist directly.
  if (steps.length === 1) {
    const step = steps[0];
    try {
      const result = await runSpecialist({
        domain: step.domain,
        command: step.text,
        history,
        tier,
        teamCap: (opts as any).teamCap,
        operatorName: (opts as any).operatorName,
        base: opts as any,
      });
      const finalReply = await finalizeWithGuard(result.reply, result.toolsRan.map((n) => ({ name: n, result: null })), step.domain, traceId);
      await emitMesh("mesh.completed", { domain: step.domain, toolsRan: result.toolsRan, steps: 1 }, traceId);
      return {
        reply: finalReply,
        actions: result.toolsRan.map((n) => ({ ok: true as const, summary: `${n} called`, affordance: undefined })),
        toolsRan: result.toolsRan,
      };
    } catch (err) {
      await emitMesh("mesh.specialist_error", { domain: step.domain, error: String((err as any)?.message || err).slice(0, 300) }, traceId);
      console.error(`[orchestrator] specialist failed for ${step.domain}:`, err);
      return { reply: HONEST_ERROR, actions: [], toolsRan: [] };
    }
  }

  // Multi-step: run each specialist sequentially. No monolith fallback.
  const replies: string[] = [];
  const actions: SasaResult["actions"] = [];
  const allToolsRan: string[] = [];

  for (const step of steps) {
    try {
      const result = await runSpecialist({
        domain: step.domain,
        command: step.text,
        history,
        tier,
        teamCap: (opts as any).teamCap,
        operatorName: (opts as any).operatorName,
        base: opts as any,
      });
      if (result.reply) {
        history.push({ role: "user", content: step.text });
        history.push({ role: "assistant", content: result.reply });
        replies.push(result.reply);
      }
      if (result.toolsRan.length) {
        allToolsRan.push(...result.toolsRan);
        actions.push(...result.toolsRan.map((n) => ({ ok: true as const, summary: `${n} called`, affordance: undefined })));
      }
    } catch (err) {
      await emitMesh("mesh.specialist_error", { domain: step.domain, error: String((err as any)?.message || err).slice(0, 300) }, traceId);
      console.error(`[orchestrator] specialist failed for ${step.domain}:`, err);
      replies.push("One part of that tripped me up and I have flagged it.");
    }
  }

  let reply = replies.join("\n");
  if (replies.length > 1) {
    // SYNTHESIS HONESTY (2026-07-11): the old synthesizer REWROTE the step replies,
    // so a second model pass could paraphrase, drop, or inflate the composed truth
    // lines after the composer had already rendered them from receipts. Now the
    // model may only author a short LEAD-IN; the step replies are appended
    // VERBATIM, and the lead-in itself is claim-stripped. No model text can
    // restate an action anywhere after the composer.
    try {
      const syn = await claudeJSON<{ lead: string }>(
        "Write ONE short, warm, first-person lead-in sentence (max 15 words) for a reply that will list the results below it. Do NOT mention, restate, or summarize any specific action, name, or number: the results speak for themselves. No em-dashes. Return JSON {\"lead\":\"...\"}.",
        `Original request: ${command}\n\n(${replies.length} step results follow, do not restate them)`,
        200,
      );
      const { stripModelActionClaims } = await import("./compose-claims.mjs");
      const lead = stripModelActionClaims(String(syn?.lead || "")).trim();
      reply = [lead, ...replies].filter(Boolean).join("\n");
    } catch { /* lead-in is optional; verbatim step replies already stand alone */ }
  }

  const finalReply = await finalizeWithGuard(reply, allToolsRan.map((n) => ({ name: n, result: null })), steps[0]?.domain || "general", traceId);
  await emitMesh("mesh.completed", { domain: steps.map((s) => s.domain).join("+"), toolsRan: allToolsRan, steps: steps.length }, traceId);
  return { reply: finalReply, actions, toolsRan: allToolsRan };
}

// Cross-domain leakage check lives in ./manifests (single source, pure, testable).
// Imported above for the runtime guard; re-exported here for existing callers.
export { checkDomainLeakage } from "./manifests";

export async function finalizeWithGuard(
  reply: string,
  toolRuns: { name: string; result: any }[],
  expectedDomain: Domain,
  traceId: string | null = null,
): Promise<string> {
  const leakage = checkDomainLeakage(reply, toolRuns, expectedDomain);
  if (leakage.leakage) {
    console.warn(`[orchestrator:guard] domain leakage: ${leakage.details}`);
    await emitMesh("mesh.domain_leakage", {
      domain: expectedDomain,
      details: leakage.details,
      tools: toolRuns.map((t) => t.name),
    }, traceId);
  }

  // FALSE-CANNOT: the mirror of the honesty law. Denying a capability the specialist was
  // actually holding is how a working feature dies, because the operator stops asking.
  // Checked against the tools OFFERED this turn, not the ones that ran (2026-07-20:
  // "I genuinely cannot create or export PDF files" with create_letterhead_doc in hand).
  try {
    const { detectFalseCannot } = await import("./false-cannot.mjs");
    const offered = getToolsForDomain(expectedDomain, "admin");
    const fc = detectFalseCannot(reply, offered);
    if (fc) {
      console.warn(`[orchestrator:guard] FALSE CANNOT (${fc.topic}): "${fc.sentence}" while holding ${fc.couldHaveUsed.join(", ")}`);
      await emitMesh("mesh.false_cannot", {
        domain: expectedDomain,
        topic: fc.topic,
        denial: fc.denial,
        sentence: fc.sentence,
        could_have_used: fc.couldHaveUsed,
      }, traceId);
    }
  } catch (e: any) {
    console.warn(`[orchestrator:guard] false-cannot check skipped: ${e?.message || e}`);
  }
  return reply;
}
