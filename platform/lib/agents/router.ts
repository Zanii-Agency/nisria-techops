// DOMAIN ROUTER — deterministic classification + Haiku fallback.
//
// Routes every inbound message to a domain (work/money/people/comms/knowledge/general).
// Two-stage: rule-based fast path (regex patterns from transcript analysis), then
// Haiku fallback for ambiguous cases. Multi-domain messages are decomposed into
// per-domain steps.
//
// Replaces the observation-only intent-classifier with a load-bearing router.
// The intent-classifier still runs for logging/grading but does not affect routing.

import { HAIKU } from "../anthropic";
import { MANIFESTS, type Domain } from "./manifests";
import { admin } from "../supabase-admin";

export type { Domain };

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DOMAINS = Object.keys(MANIFESTS) as Domain[];
const isDomain = (d: unknown): d is Domain => typeof d === "string" && (DOMAINS as string[]).includes(d);
const clamp01 = (n: unknown): number => (typeof n === "number" && isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5);

// FORCED TOOL-USE call (2026-07-01). Replaces the old /\{[^}]+\}/ text-scrape, which
// silently broke decomposeMessage: the char-class stopped at the FIRST "}", so the
// nested steps array never parsed and every multi-domain message collapsed to general
// (orchestrator saw length 1 and dropped the secondary intent). With tool_choice the
// model CANNOT return prose / markdown fences / malformed JSON — the API hands back a
// validated tool_use.input. One bounded retry on transient (429 / 5xx / timeout);
// fail-closed to null so the caller's fallback path always holds. Routing is the hot
// path, so we keep the short abort timeout rather than routing through anthropicPOST.
export type ToolSpec = { name: string; description: string; input_schema: Record<string, any> };
export async function anthropicTool<T>(
  system: string,
  user: string,
  tool: ToolSpec,
  opts: { maxTokens?: number; timeoutMs?: number } = {},
): Promise<{ input: T | null; error?: string }> {
  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) return { input: null, error: "no_api_key" };

  const attempt = async (): Promise<{ input: T | null; error?: string; retryable?: boolean }> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 4000);
    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: HAIKU,
          max_tokens: opts.maxTokens ?? 200,
          // Pure classification / decomposition: temperature 0 for a stable,
          // deterministic domain pick. No creativity wanted in routing.
          temperature: 0,
          system,
          tools: [tool],
          tool_choice: { type: "tool", name: tool.name },
          messages: [{ role: "user", content: user }],
        }),
      });
      if (!res.ok) {
        const retryable = res.status === 429 || res.status === 529 || (res.status >= 500 && res.status < 600);
        return { input: null, error: `http_${res.status}`, retryable };
      }
      const j: any = await res.json();
      const block = (j?.content || []).find((b: any) => b?.type === "tool_use" && b?.name === tool.name);
      if (!block?.input) return { input: null, error: "no_tool_use" };
      return { input: block.input as T };
    } catch (err: any) {
      // AbortError (timeout) and network errors are worth one retry.
      return { input: null, error: `exception:${String(err?.message || err).slice(0, 80)}`, retryable: true };
    } finally {
      clearTimeout(timer);
    }
  };

  const first = await attempt();
  if (first.input || !first.retryable) return { input: first.input, error: first.error };
  const second = await attempt();
  return { input: second.input, error: second.error };
}

// Telemetry: emit the routing decision. Awaited inside try/catch so it flushes
// in the serverless worker (un-awaited inserts get dropped when the function
// suspends), while a caught error can never break the reply path.
async function emitRouterTelemetry(
  domain: Domain,
  confidence: number,
  reason: string,
  command: string,
): Promise<void> {
  // AWAIT the insert (inside try/catch) so it actually flushes before the
  // serverless worker suspends. A caught error can never break the reply path.
  try {
    const { error } = await admin().from("events").insert({
      type: "mesh.routed",
      source: "agent:router",
      actor: "system",
      subject_type: "domain",
      subject_id: null, // events.subject_id is uuid; domain lives in payload

      payload: { domain, confidence, reason: reason.slice(0, 200), command: command.slice(0, 200) },
    });
    if (error) console.error("mesh.routed insert error:", error);
  } catch (e) {
    console.error("emitRouterTelemetry threw:", e);
  }
}

export type RouterResult = {
  domain: Domain;
  confidence: number; // 0-1
  reason: string;
  steps?: { domain: Domain; text: string }[]; // for multi-domain messages
};

// The keyword scorer and DOMAIN_PATTERNS live in ./router-patterns (a pure module
// with no model-client import), so the routing logic is testable under plain node.
// Imported for internal fast-lane use and re-exported for existing callers.
import { scoreDomains, DOMAIN_PATTERNS } from "./router-patterns";
export { scoreDomains, DOMAIN_PATTERNS } from "./router-patterns";

// Haiku fallback for ambiguous cases. `failed` is true only when the model was
// unreachable (no key / timeout / error after retry), so routeMessage can fall back
// to the keyword score instead of trusting a fabricated "general".
async function haikuClassify(
  text: string,
  history: { role: "user" | "assistant"; content: string }[] = [],
): Promise<{ domain: Domain; confidence: number; reason: string; failed: boolean }> {
  const domains = DOMAINS.join(", ");
  const system = `You are a domain router for Sasa, the Nisria operations bot. Classify the inbound message into ONE of these domains: ${domains}.

Decision rules:
- work: tasks, reminders, calendar, scheduling, deadlines
- money: payments, donations, finance, salaries, receipts, invoices
- comms: messaging, email, newsletters, posting to groups, outbound
- people: team members, contacts, beneficiaries, cases, intake
- knowledge: org documents, files, Brain facts, grants, memory, search
- programs: Maisha inventory (stock, quantities, Folklore listing) and the donor wishlist (fundable needs and funded counts)
- library: saving and recalling LINKS / articles / clips / resources to keep ("save this link", "remember this article", "find/send me the X again", "the sample pics")
- general: greetings, meta-questions, ambiguous, or multi-domain

If the message touches multiple domains, pick the PRIMARY one (the action that needs to happen first).`;

  const last4 = history.slice(-4);
  const ctxLines = last4.map((m) => `${m.role.toUpperCase()}: ${m.content.slice(0, 200)}`).join("\n");
  const user = `${ctxLines ? ctxLines + "\n" : ""}USER (current): ${text.slice(0, 1000)}`;

  const { input, error } = await anthropicTool<{ domain: string; confidence: number; reason: string }>(
    system,
    user,
    {
      name: "classify_domain",
      description: "Return the single best domain for this message.",
      input_schema: {
        type: "object",
        properties: {
          domain: { type: "string", enum: DOMAINS },
          confidence: { type: "number", description: "0.0 to 1.0" },
          reason: { type: "string", description: "One short sentence (under 120 chars)." },
        },
        required: ["domain", "confidence", "reason"],
      },
    },
    { maxTokens: 150, timeoutMs: 3500 },
  );

  if (!input || !isDomain(input.domain)) {
    return { domain: "general", confidence: 0.3, reason: error || "no_tool_use", failed: true };
  }
  return { domain: input.domain, confidence: clamp01(input.confidence), reason: String(input.reason || "").slice(0, 200), failed: false };
}

// Main router function.
export async function routeMessage(
  text: string,
  history: { role: "user" | "assistant"; content: string }[] = [],
): Promise<RouterResult> {
  if (!text || !text.trim()) {
    return { domain: "general", confidence: 0, reason: "empty_message" };
  }

  // UNDERSTAND-FIRST router (2026-06-26, KT #411). The model reads and understands EVERY
  // message; keywords are no longer the primary decision. Rationale (operator directive):
  // keyword-matching flails on messy/multilingual/context messages, and at Nisria's volume
  // the per-message cost of letting the model understand is negligible. SAFETY: routing is
  // the safest possible LLM use — the model picks ONE of a FIXED set of domains (validated
  // in haikuClassify against MANIFESTS, so it cannot invent a lane), and a wrong pick only
  // mis-files to a specialist that says "not my lane"; it can never act, send, or spend.
  const scored = scoreDomains(text);
  const top = scored[0];
  const second = scored[1];

  // FAST-LANE (cost/latency only): a dead-obvious, unambiguous keyword hit skips the model.
  // Requires an overwhelming top score AND a clear gap over the runner-up, so an ambiguous
  // message is NEVER fast-laned — it always goes to the model to understand.
  if (top && top.score >= 1.5 && (!second || top.score - second.score >= 0.8)) {
    const result: RouterResult = {
      domain: top.domain,
      confidence: Math.min(top.score, 1),
      reason: `fast_lane: ${top.matches} unambiguous pattern(s)`,
    };
    await emitRouterTelemetry(result.domain, result.confidence, result.reason, text);
    return result;
  }

  // The model understands the message and picks one domain.
  const llm = await haikuClassify(text, history);
  if (!llm.failed) {
    const result: RouterResult = {
      domain: llm.domain,
      confidence: llm.confidence,
      reason: `understood: ${llm.reason}`,
    };
    await emitRouterTelemetry(result.domain, result.confidence, result.reason, text);
    return result;
  }

  // SAFETY NET: the model was unreachable (no key / timeout / error). Fall back to the
  // keyword score so routing still works, never a hard dependency on the model being up.
  const fb: RouterResult = top && top.score >= 0.4
    ? { domain: top.domain, confidence: top.score * 0.7, reason: `regex_fallback (model down): ${top.matches} pattern(s)` }
    : { domain: "general", confidence: 0.3, reason: `regex_fallback_general (model down): best=${top?.domain}(${top?.score ?? 0})` };
  await emitRouterTelemetry(fb.domain, fb.confidence, fb.reason, text);
  return fb;
}

// Decompose multi-domain messages into per-domain steps. Structured output — the
// nested steps array is returned as validated tool input, not scraped from text
// (the old regex stopped at the first "}", so this ALWAYS collapsed to one general
// step and the orchestrator dropped every secondary intent).
export async function decomposeMessage(
  text: string,
): Promise<{ domain: Domain; text: string }[]> {
  const single: { domain: Domain; text: string }[] = [{ domain: "general", text }];

  const system = `You split an operator's WhatsApp instruction into per-domain sub-instructions. Each sub-instruction handles ONE domain (${DOMAINS.join(", ")}). If the message is single-domain, return ONE item. Keep each step in the operator's own words.`;

  const { input } = await anthropicTool<{ steps: { domain: string; text: string }[] }>(
    system,
    text.slice(0, 1500),
    {
      name: "split_message",
      description: "Split the instruction into per-domain steps (one item if single-domain).",
      input_schema: {
        type: "object",
        properties: {
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: { domain: { type: "string", enum: DOMAINS }, text: { type: "string" } },
              required: ["domain", "text"],
            },
          },
        },
        required: ["steps"],
      },
    },
    { maxTokens: 400, timeoutMs: 4000 },
  );

  if (!input?.steps?.length) return single;
  const steps = input.steps
    .map((s) => ({ domain: isDomain(s.domain) ? s.domain : ("general" as Domain), text: String(s.text || "").trim() }))
    .filter((s) => s.text);
  return steps.length ? steps : single;
}
