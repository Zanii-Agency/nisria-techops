// INDEPENDENT VERIFIER (the trust gate).
//
// After the main agent (Claude Sonnet) drafts a reply, a DIFFERENT model family
// (OpenAI gpt-4o-mini) checks that every committed-sounding fact in the reply is
// grounded in either the user's own words or a tool result from THIS turn. A
// different model catches what the generator is blind to (independent failure
// modes), which is the whole point of running two models together.
//
// It flags only the dangerous classes: a stated money amount, a payee/person tied
// to a payment or action, or a claim that an action was completed ("logged",
// "recorded", "created a task", "scheduled", "sent"). It ignores empathy,
// questions, and numbers the user themselves provided.
//
// FAIL-OPEN by design: if the key is missing or the check errors, it passes the
// reply through unchanged. The verifier must never be able to break the bot.

type ToolRun = { name: string; input?: any; result?: any };
export type VerifyResult = { grounded: boolean; problems: string[]; corrected?: string };

const OPENAI_MODEL = "gpt-4o-mini";

const SYSTEM = `You are a strict grounding checker for a nonprofit's operations assistant.

You receive three things:
1. USER: what the user said.
2. TOOLS: the actions that REALLY ran this turn, each with its input and result. Treat every tool input and result as TRUE ground truth.
3. DRAFT: the assistant's proposed reply.

A statement in the DRAFT is SUPPORTED if the amount, name, or action it mentions appears in the USER message OR in any TOOL's input or result. Restating what a tool did (its input or result) is always grounded and correct. A figure read from a tool result is grounded.

Flag a problem ONLY for a concrete statement in the DRAFT that has NO support in the USER message and NO support in any TOOL:
- an invented money amount,
- an invented person/payee name tied to a payment or action,
- a claim that an action was completed ("logged", "created a task", "scheduled", "sent", "reimbursed") with no matching tool in the TOOLS list.

Quote the exact offending phrase for each problem.

NEVER flag: a question (e.g. "how much did you pay him?"), empathy, a suggestion, or anything already present in the USER message or a TOOL. If every concrete claim in the draft traces to the user or a tool, return grounded=true with no problems.

If (and only if) you flag something, write CORRECTED: rewrite the draft to drop every unsupported amount and name, and turn any unsupported completion claim into an honest statement that you have NOT done it yet plus a short request for the missing detail. Add no new facts.

Return strict JSON: {"grounded": boolean, "problems": string[], "corrected": string}. If the draft is clean: grounded=true, problems=[], corrected="".`;

export async function verifyReply(opts: {
  userMessage: string;
  toolRuns: ToolRun[];
  reply: string;
}): Promise<VerifyResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key || !opts.reply.trim()) return { grounded: true, problems: [] };
  const payload = {
    USER: opts.userMessage,
    TOOLS: opts.toolRuns.map((t) => ({ name: t.name, input: t.input, result: t.result })),
    DRAFT: opts.reply,
  };
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: JSON.stringify(payload) },
        ],
      }),
    });
    if (!r.ok) return { grounded: true, problems: [] };
    const j = await r.json();
    const txt = j?.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(txt);
    return {
      grounded: parsed.grounded !== false,
      problems: Array.isArray(parsed.problems) ? parsed.problems : [],
      corrected: typeof parsed.corrected === "string" && parsed.corrected.trim() ? parsed.corrected.trim() : undefined,
    };
  } catch {
    return { grounded: true, problems: [] };
  }
}
