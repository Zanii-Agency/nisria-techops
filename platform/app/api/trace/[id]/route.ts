// TRACE VIEW (STEP 4, LangSmith-shape). Given a turn's traceId (= events
// correlation_id), returns the ordered run tree: router decision -> specialist ->
// tools -> claims composed -> guards -> completion. The "which sub-agent failed
// and why" view, built on the events already emitted. Read-only.
//
// GET /api/trace/<traceId>            -> JSON { trace }
// GET /api/trace/<traceId>?format=txt -> text/plain rendered trace
// Gated by x-eval-secret (= GROUP_BOT_SECRET), same as the eval harness.
import { NextRequest, NextResponse } from "next/server";
import { admin } from "../../../../lib/supabase-admin";
import { assembleTrace, renderTrace } from "../../../../lib/agents/trace.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if ((req.headers.get("x-eval-secret") || "") !== (process.env.GROUP_BOT_SECRET || "\0")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const traceId = String(params.id || "").trim();
  if (!traceId) return NextResponse.json({ error: "missing traceId" }, { status: 400 });

  const { data, error } = await admin()
    .from("events")
    .select("type,source,payload,created_at,correlation_id")
    .eq("correlation_id", traceId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const trace = assembleTrace(data || [], traceId);
  if (new URL(req.url).searchParams.get("format") === "txt") {
    return new NextResponse(renderTrace(trace), { headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return NextResponse.json({ trace });
}
