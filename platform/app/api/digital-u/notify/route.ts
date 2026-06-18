// Internal Digital U → Nur notify channel. Out-of-band messages from
// meeting-bot scheduling, future calendar auto-latch, or operator scripts
// land here and route through Sasa's sendTextAndLog (Law 2 chokepoint).
// x-api-key matches INGEST_KEY.

import { NextRequest, NextResponse } from "next/server";
import { admin } from "../../../../lib/supabase-admin";
import { sendTextAndLog, phoneKey } from "../../../../lib/whatsapp";

export const runtime = "nodejs";

function nurNumber(): string {
  const raw = process.env.NUR_WHATSAPP;
  if (!raw) throw new Error("NUR_WHATSAPP env not set. Set it to Nur's WhatsApp number (digits only, no +).");
  return phoneKey(raw);
}

export async function POST(req: NextRequest) {
  if (process.env.INGEST_KEY && req.headers.get("x-api-key") !== process.env.INGEST_KEY) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const message = String(body?.message || "").trim();
  if (!message) return NextResponse.json({ ok: false, error: "message required" }, { status: 400 });
  const to = nurNumber();
  const r = await sendTextAndLog(admin(), to, message, { handledBy: "sasa" });
  return NextResponse.json({ ok: !!r.id });
}
