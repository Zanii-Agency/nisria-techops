import { NextRequest, NextResponse } from "next/server";
import { sweepAndRememberAll } from "@/lib/mail-memory";

export const runtime = "nodejs";
export const maxDuration = 300; // reads many emails + embeds

function authed(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // FAIL CLOSED, same as the other crons
  const hdr = req.headers.get("authorization") || "";
  const key = new URL(req.url).searchParams.get("key") || "";
  return hdr === `Bearer ${secret}` || key === secret;
}

// Daily "remember the whole inbox" sweep. SILENT (no WhatsApp), so no onboarding
// gate. Idempotent via rememberEmail's gmail-message-id dedup.
export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const envMax = parseInt(process.env.MAIL_SWEEP_MAX_PER_BOX || "", 10);
  const r = await sweepAndRememberAll(Number.isFinite(envMax) && envMax > 0 ? envMax : undefined);
  return NextResponse.json(r);
}
