// Server-side PDF export for a Studio / grant-ready document (R2-5 #43).
// Renders the document's branded HTML to a real PDF with headless Chrome and
// streams it as a download. If PDF rendering is unavailable (local dev, or the
// serverless plan cannot launch Chrome), it falls back to downloading the .html
// so the action never dead-ends. App is auth-gated by middleware.
import { NextRequest, NextResponse } from "next/server";
import { admin } from "../../../../lib/supabase-admin";
import { htmlToPdf } from "../../../../lib/pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function slug(s: string): string {
  return (s || "document").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 60) || "document";
}

export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const { data: doc } = await admin()
    .from("studio_documents")
    .select("title,html")
    .eq("id", id)
    .maybeSingle();
  if (!doc?.html) return NextResponse.json({ error: "not found" }, { status: 404 });

  const name = slug(doc.title);
  const pdf = await htmlToPdf(String(doc.html));
  if (pdf) {
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${name}.pdf"`,
        "cache-control": "no-store",
      },
    });
  }
  // fallback: deliver the branded HTML (still printable to PDF in the browser)
  return new NextResponse(String(doc.html), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `attachment; filename="${name}.html"`,
      "cache-control": "no-store",
    },
  });
}
