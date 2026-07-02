// ADMIN one-shot: generate a document on the org letterhead and deliver the PDF to
// Nur on WhatsApp. Server-side (Vercel: chromium PDF + Supabase both work), so an
// operator/builder can push a letterhead doc to Nur without the full MCP OAuth
// dance. CRON_SECRET-gated (same auth as the other ops crons). Optional apology
// text is sent first. This is the same create_letterhead_doc the bot/bridge use.
import { NextRequest, NextResponse } from "next/server";
import { runSmartTool } from "@/lib/smart-tools";
import { sendTextAndLog } from "@/lib/whatsapp";
import { admin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authed(req: NextRequest): boolean {
  const s = process.env.CRON_SECRET;
  if (!s) return false;
  const a = req.headers.get("authorization") || "";
  const k = new URL(req.url).searchParams.get("key") || "";
  return a === `Bearer ${s}` || k === s;
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let b: any = {};
  try { b = await req.json(); } catch { /* tolerate */ }
  const body = String(b?.body || "").trim();
  if (!body) return NextResponse.json({ error: "no body" }, { status: 400 });
  const nur = (process.env.NUR_WA_ID || "").trim();
  const out: any = { apology: null, letterhead: null };
  if (b?.apology && nur) {
    const a = await sendTextAndLog(admin(), nur, String(b.apology), { handledBy: "sasa" }).catch((e: any) => ({ id: null, error: String(e?.message || e) }));
    out.apology = { delivered: !!a?.id, error: a?.error || null };
  }
  out.letterhead = await runSmartTool(
    "create_letterhead_doc",
    { body, title: String(b?.title || "Document"), doc_type: String(b?.doc_type || "letter"), brand: String(b?.brand || "nisria") },
    { tier: "admin", rank: "owner", operatorName: "Nur", senderPhone: nur || undefined },
  );
  return NextResponse.json({ ok: true, ...out });
}
