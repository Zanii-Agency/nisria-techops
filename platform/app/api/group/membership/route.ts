// GROUP MEMBERSHIP. The group userbot (Railway) POSTs the list of groups it is
// ACTUALLY in (from groupFetchAllParticipating) every time it connects. The portal
// stores it as the authoritative membership so list_groups + Sasa's snapshot read
// REAL membership, never message-history-only (which misses silent groups) and
// never a model guess. This is the second source of truth (the bot's live WhatsApp
// session) being collapsed INTO the portal, which is what the prompt-vs-portal audit
// could never reach. Auth: x-group-secret must equal GROUP_BOT_SECRET (same as
// /api/group/ingest and /api/group/outbox).
import { NextRequest, NextResponse } from "next/server";
import { admin } from "../../../../lib/supabase-admin";
import { emit } from "../../../../lib/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authed(req: NextRequest) {
  return (req.headers.get("x-group-secret") || "") === (process.env.GROUP_BOT_SECRET || "\0");
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const groups = Array.isArray(b?.groups)
    ? [...new Set(b.groups.map((g: any) => String(typeof g === "string" ? g : g?.name || "").trim()).filter(Boolean))]
    : [];
  const db = admin();
  await db.from("bot_status").upsert(
    { key: "group_membership", value: { groups, ts: new Date().toISOString() }, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
  await emit({ type: "group.membership_synced", source: "group-bot", actor: "group-bot", subject_type: "bot", subject_id: null, payload: { count: groups.length, groups } });
  return NextResponse.json({ ok: true, count: groups.length });
}
