// Lists documents Nur can attach to an outbound email (R2-5 #43): Studio /
// grant-ready documents (studio_documents) plus Library files (assets). Each
// option carries an opaque ref ("doc:<id>" | "asset:<id>") the composer stores
// in a hidden field; the server send path resolves the ref into a real
// attachment. Read-only; the app is already auth-gated by middleware.
import { NextResponse } from "next/server";
import { admin } from "../../../lib/supabase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const db = admin();
    const [{ data: docs }, { data: assets }] = await Promise.all([
      db
        .from("studio_documents")
        .select("id,title,doc_type,brand,kind,created_at")
        .order("created_at", { ascending: false })
        .limit(30),
      db
        .from("assets")
        .select("id,title,type,mime,brand,created_at")
        .neq("type", "image")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    const docOpts = ((docs || []) as any[]).map((d) => ({
      ref: `doc:${d.id}`,
      title: d.title || "Document",
      kind: d.kind ? "grant-ready" : (d.doc_type || "document"),
      brand: d.brand || null,
      group: "Studio documents",
    }));
    const assetOpts = ((assets || []) as any[]).map((a) => ({
      ref: `asset:${a.id}`,
      title: a.title || "File",
      kind: a.type || "file",
      brand: a.brand || null,
      group: "Library files",
    }));

    return NextResponse.json({ options: [...docOpts, ...assetOpts] });
  } catch (e: any) {
    return NextResponse.json({ options: [], error: e?.message || "failed" }, { status: 200 });
  }
}
