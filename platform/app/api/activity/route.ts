// LIVE ACTIVITY FEED (R3-3 / P5). One cheap, pollable endpoint the live panel
// under the top-nav chip reads on a short interval, so the app visibly reflects
// what the agents are doing right now: drafted a reply, prepared a grant, queued
// a thank-you, sent. Returns the recent `events` rows (already the single source
// of truth for activity) plus live background-job counts so the panel can show a
// "preparing N" pulse while work is in flight. Read-only, auth-gated by the same
// middleware as every page; no secret needed.
import { NextRequest, NextResponse } from "next/server";
import { admin } from "../../../lib/supabase-admin";
import { activityLabel, activityTone, type ActivityEvent } from "../../../lib/activity";
import { jobCounts } from "../../../lib/jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const db = admin();
    const limit = Math.min(Number(new URL(req.url).searchParams.get("limit") || "25") || 25, 60);
    const [{ data: rows }, grants] = await Promise.all([
      db.from("events").select("id,type,source,actor,payload,created_at").order("created_at", { ascending: false }).limit(limit),
      jobCounts("grant.prepare"),
    ]);
    const events = ((rows || []) as ActivityEvent[] & { id: string }[]).map((e: any) => ({
      id: e.id,
      label: activityLabel(e),
      tone: activityTone(e.type),
      at: e.created_at,
    }));
    return NextResponse.json({
      events,
      jobs: { preparing: grants.queued + grants.running },
      now: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ events: [], jobs: { preparing: 0 }, error: e?.message || "activity error" }, { status: 200 });
  }
}
