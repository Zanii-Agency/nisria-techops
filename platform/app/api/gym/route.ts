// GYM RUNNER ENDPOINT (eval-only). Runs Sasa's REAL first-turn decision
// (evalSasa = real buildSystem + real SMART_TOOLS, ONE model call, NO DB writes)
// over a batch of adversarial scenarios. With SASA_BRAIN_BASE_URL set, the brain
// is the local DGX model, so the whole gym runs with zero Anthropic/OpenAI spend.
// Guarded by GROUP_BOT_SECRET (same as /api/evals). Never reachable without it.
import { NextRequest, NextResponse } from "next/server";
import { evalSasa } from "../../../lib/agents/sasa";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const secret = process.env.GROUP_BOT_SECRET || "";
  if (!secret || req.headers.get("x-eval-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const scenarios = Array.isArray(body?.scenarios) ? body.scenarios : null;
  if (!scenarios) return NextResponse.json({ error: "scenarios[] required" }, { status: 400 });

  const results = [];
  for (const s of scenarios) {
    try {
      const out = await evalSasa({ history: s.history, command: s.command, role: s.role === "team" ? "team" : "admin" });
      results.push({ id: s.id, text: out.text, toolCalls: out.toolCalls });
    } catch (e: any) {
      results.push({ id: s.id, error: String(e?.message || e) });
    }
  }
  return NextResponse.json({ results });
}
