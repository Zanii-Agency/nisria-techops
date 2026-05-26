// Dedicated STUDIO document-generation WORKER. Runs on its own request so the
// slow Claude composition (a long-form generation) never sits on the founder's
// navigation path. The "Generate" / "Regenerate" click does one fast enqueue +
// a detached trigger and returns instantly; this worker drains the queue.
//
// Bounded + idempotent-friendly: claims queued `studio.generate` jobs, builds
// each grant-ready document grounded in the org brain, persists it, marks done.
// The daily cron can also poke this endpoint as a backstop.
import { NextRequest, NextResponse } from "next/server";
import { claimJobs, markJobDone, markJobError } from "../../../../lib/jobs";
import { generateGrantReadyDoc } from "../../../studio/actions";
import { grantDocSpec, type GrantDocKind } from "../../../../lib/grant-docs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// A single document composition (long-form Claude generation) can run ~20-40s,
// so ask for a longer budget. On plans that cap below this Vercel clamps it; the
// queue drains the rest across calls.
export const maxDuration = 300;

function authed(req: NextRequest): boolean {
  const agent = process.env.AGENT_TICK_SECRET, cron = process.env.CRON_SECRET;
  const h = req.headers.get("x-agent-secret");
  const auth = req.headers.get("authorization") || "";
  const qs = new URL(req.url).searchParams.get("key");
  return Boolean((agent && (h === agent || qs === agent)) || (cron && auth === `Bearer ${cron}`));
}

// limit clamp: how many documents this invocation may generate. Each is a
// long-form Claude call, so cap at 4 (the full grant-ready set) per call.
function clampLimit(req: NextRequest): number {
  const raw = Number(new URL(req.url).searchParams.get("limit") || "4");
  return Math.max(1, Math.min(isNaN(raw) ? 4 : raw, 4));
}

async function drainQueue(limit: number): Promise<{ drained: number; errors: number }> {
  const jobs = await claimJobs("studio.generate", limit);
  let drained = 0, errors = 0;
  for (const job of jobs) {
    const docKind = (job.payload?.docKind || "") as string;
    if (!grantDocSpec(docKind)) {
      await markJobError(job.id, `unknown docKind: ${docKind}`);
      errors++;
      continue;
    }
    try {
      await generateGrantReadyDoc(docKind as GrantDocKind);
      await markJobDone(job.id);
      drained++;
    } catch (e: any) {
      await markJobError(job.id, e?.message || "generation failed");
      errors++;
    }
  }
  return { drained, errors };
}

async function run(req: NextRequest) {
  const limit = clampLimit(req);
  const queue = await drainQueue(limit);
  return { queue };
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await run(req));
}

export async function GET(req: NextRequest) {
  if (authed(req)) return NextResponse.json(await run(req));
  return NextResponse.json({ ok: true, note: "POST with x-agent-secret to drain the studio.generate queue (capped)" });
}
