import { NextRequest, NextResponse } from "next/server";
import { admin } from "../../../../lib/supabase-admin";
import { extractText } from "../../../../lib/extract-text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Return a document's text so it can be READ natively in the app. Lazy: if the
// text was never extracted, pull it now (download via service account + parse),
// store it, and return it. Subsequent opens are instant and the content becomes
// searchable. The original Drive file is only a fallback link in the UI.
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const db = admin();
  const { data: doc } = await db
    .from("documents")
    .select("id,title,mime,drive_file_id,drive_url,extracted_text,summary,doc_type,folder")
    .eq("id", id)
    .single();
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });

  let text = (doc.extracted_text || "").trim();
  if (text.length < 40 && doc.drive_file_id) {
    const pulled = await extractText(doc.drive_file_id, doc.mime);
    if (pulled && pulled.length >= 40) {
      text = pulled;
      await db.from("documents").update({ extracted_text: text, updated_at: new Date().toISOString() }).eq("id", id);
    }
  }
  return NextResponse.json({
    id: doc.id, title: doc.title, summary: doc.summary || null,
    text, mime: doc.mime, drive_url: doc.drive_url, doc_type: doc.doc_type, folder: doc.folder,
  });
}
