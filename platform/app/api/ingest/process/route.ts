// R3-4 / P7: the INGESTION WORKER. Runs on its own request so the slow Claude
// classify+route work (and any vision captioning) never sits on the founder's
// navigation path. createBatch() does one fast insert + a detached trigger and
// returns instantly; this worker drains the `ingest.process` queue, classifying
// every item in a batch and recording the proposed route for the review step.
//
// Bounded + idempotent: claims queued jobs, processes each batch's queued items,
// marks done. The daily cron can poke this as a backstop.
import { NextRequest, NextResponse } from "next/server";
import { claimJobs, markJobDone, markJobError, reclaimStuckJobs } from "../../../../lib/jobs";
import { processBatch } from "../../../../lib/ingest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// A batch of items each needs a Claude classify call (some with vision), so ask
// for a longer budget. On plans that clamp below this, the queue drains the rest
// across calls.
export const maxDuration = 300;

function authed(req: NextRequest): boolean {
  const agent = process.env.AGENT_TICK_SECRET, cron = process.env.CRON_SECRET;
  const h = req.headers.get("x-agent-secret");
  const auth = req.headers.get("authorization") || "";
  const qs = new URL(req.url).searchParams.get("key");
  return Boolean((agent && (h === agent || qs === agent)) || (cron && auth === `Bearer ${cron}`));
}

function clampLimit(req: NextRequest): number {
  const raw = Number(new URL(req.url).searchParams.get("limit") || "3");
  return Math.max(1, Math.min(isNaN(raw) ? 3 : raw, 5));
}

async function drainQueue(limit: number): Promise<{ drained: number; errors: number }> {
  await reclaimStuckJobs("ingest.process");
  const jobs = await claimJobs("ingest.process", limit);
  let drained = 0, errors = 0;
  for (const job of jobs) {
    const batchId = (job.payload?.batchId || job.subject_id || "") as string;
    if (!batchId) {
      await markJobError(job.id, "no batchId");
      errors++;
      continue;
    }
    try {
      await processBatch(batchId);
      await markJobDone(job.id);
      drained++;
    } catch (e: any) {
      await markJobError(job.id, e?.message || "ingest processing failed");
      errors++;
    }
  }
  return { drained, errors };
}

async function run(req: NextRequest) {
  return { queue: await drainQueue(clampLimit(req)) };
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await run(req));
}

export async function GET(req: NextRequest) {
  if (authed(req)) return NextResponse.json(await run(req));
  return NextResponse.json({ ok: true, note: "POST with x-agent-secret to drain the ingest.process queue (capped)" });
}
