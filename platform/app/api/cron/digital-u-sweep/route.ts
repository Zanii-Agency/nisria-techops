// Every 5 minutes Vercel cron pings here. We scan Nur's Gmail (impersonated
// via DWD) for fresh meeting invites and auto-latch the meeting-bot for any
// future Zoom/Meet/Teams call we find. The full state machine, idempotency,
// and heads-up live in lib/digital-u-sweep.ts.

import { NextRequest, NextResponse } from "next/server";
import { sweepNurInbox } from "@/lib/digital-u-sweep";
import { searchInboxFor } from "@/lib/gmail";

export const runtime = "nodejs";
export const maxDuration = 60;

function authed(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // FAIL CLOSED
  const hdr = req.headers.get("authorization") || "";
  const key = new URL(req.url).searchParams.get("key") || "";
  return hdr === `Bearer ${secret}` || key === secret;
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // verbose=1 returns extra probe data so we can verify impersonation worked
  // even when the search filter is genuinely empty. Run AGAINST nur@nisria.co
  // with a much broader query and report counts only (no PII).
  const verbose = new URL(req.url).searchParams.get("verbose") === "1";
  if (verbose) {
    try {
      const broad = await searchInboxFor("nur@nisria.co", "newer_than:30d", 25);
      const meetings = await searchInboxFor("nur@nisria.co", "newer_than:30d (zoom.us OR meet.google.com OR teams.microsoft.com)", 25);
      const probe = { broadCount: broad.length, meetingCount: meetings.length, meetingSubjects: meetings.slice(0, 5).map((h) => h.subject) };
      const sweep = await sweepNurInbox();
      return NextResponse.json({ probe, sweep });
    } catch (e: any) {
      return NextResponse.json({ probeError: e?.message || String(e) }, { status: 500 });
    }
  }
  const r = await sweepNurInbox();
  return NextResponse.json(r);
}
