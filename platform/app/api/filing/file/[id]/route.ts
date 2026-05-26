// In-app document preview proxy. Streams a filed Drive document's bytes via the
// service account so the founder can open it INSIDE the platform (FocusTab iframe)
// without bouncing to Drive or storing duplicate copies. Session-gated by
// middleware (NOT bypassed) so private documents are only served to the logged-in
// founder. Google-native docs/sheets are exported to PDF for rendering.
import { NextRequest, NextResponse } from "next/server";
import { admin } from "../../../../../lib/supabase-admin";
import { fetchFileBytes } from "../../../../../lib/drive";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;
  const db = admin();
  const { data } = await db.from("documents").select("mime,title").eq("drive_file_id", id).maybeSingle();
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const { buf, contentType } = await fetchFileBytes(id, data.mime || "application/pdf");
    const safe = String(data.title || "document").replace(/[^\w.\- ]+/g, "_");
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "content-type": contentType,
        "content-disposition": `inline; filename="${safe}"`,
        "cache-control": "private, max-age=300",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "fetch failed" }, { status: 502 });
  }
}
