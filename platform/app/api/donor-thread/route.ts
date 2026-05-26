// Donor conversation thread for the donor Focus Tab (DonorPeek). Returns the
// matched contact's messages (keyed by shared email) oldest-first so the newest
// sits at the bottom by the composer, mirroring the /donors/[id] page. Lazy:
// fetched only when the Focus Tab opens, so the donors list stays fast.
import { NextRequest, NextResponse } from "next/server";
import { admin } from "../../../lib/supabase-admin";
import { cleanEmail } from "../../../lib/email-render";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("donor_id");
    if (!id) return NextResponse.json({ error: "missing donor_id" }, { status: 200 });

    const db = admin();
    const { data: donor } = await db.from("donors").select("id,email").eq("id", id).single();
    const email = (donor as any)?.email as string | undefined;
    if (!email) return NextResponse.json({ thread: [], matchedContactId: null });

    const { data: contactRows } = await db.from("contacts").select("id").eq("email", email);
    const contactIds = (contactRows || []).map((c: any) => c.id).filter(Boolean);
    const matchedContactId = contactIds[0] || null;
    if (!contactIds.length) return NextResponse.json({ thread: [], matchedContactId });

    const { data: m } = await db
      .from("messages")
      .select("id,channel,direction,subject,body,created_at,handled_by")
      .in("contact_id", contactIds)
      .order("created_at", { ascending: true });

    const thread = (m || []).map((x: any) => ({
      id: x.id,
      channel: x.channel,
      direction: x.direction,
      subject: x.subject,
      body: cleanEmail(x.body || ""),
      created_at: x.created_at,
      handled_by: x.handled_by,
    }));
    return NextResponse.json({ thread, matchedContactId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "thread failed", thread: [] }, { status: 200 });
  }
}
