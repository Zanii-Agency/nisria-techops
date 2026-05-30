// Source-message viewer (#4 source links). Given a message id, render the original
// message that produced a record (e.g. the WhatsApp instruction behind a payment).
// Behind the auth middleware (operator-only), so it is safe to link from any record.
import { NextRequest, NextResponse } from "next/server";
import { admin } from "../../../lib/supabase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return new NextResponse("missing id", { status: 400 });
  const { data: m } = await admin()
    .from("messages")
    .select("body,created_at,channel,direction,account")
    .eq("id", id)
    .maybeSingle();
  if (!m) return new NextResponse("Source message not found.", { status: 404, headers: { "content-type": "text/plain" } });
  const when = m.created_at ? new Date(m.created_at).toLocaleString() : "";
  const body = esc(String(m.body || "").trim() || "(no text)");
  const who = m.direction === "out" ? "Sasa" : "the operator";
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Source message</title></head>
<body style="font-family:-apple-system,system-ui,Segoe UI,Roboto,sans-serif;max-width:640px;margin:48px auto;padding:0 20px;color:#0d1b2a;background:#f5f8fa">
<div style="font-size:11.5px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;font-weight:600">Source &middot; ${esc(m.channel || "whatsapp")} &middot; ${esc(when)}</div>
<div style="margin-top:12px;padding:16px 18px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;font-size:15px;line-height:1.55;white-space:pre-wrap">${body}</div>
<div style="margin-top:14px;font-size:12.5px;color:#64748b">This is the original message from ${who} that produced the record.</div>
</body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
