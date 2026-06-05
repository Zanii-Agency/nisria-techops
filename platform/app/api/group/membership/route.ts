// GROUP MEMBERSHIP + IDENTITY. The group userbot (Railway) POSTs the groups it is
// ACTUALLY in (from groupFetchAllParticipating) every time it connects. We do two
// things with that, both from one call:
//  1) Store the authoritative membership name-list in bot_status so list_groups +
//     Sasa's snapshot read REAL membership, never message-history-only (which misses
//     silent groups) and never a model guess. The bot's live WhatsApp session is the
//     second source of truth, collapsed into the portal.
//  2) Upsert each group's real identity (subject + avatar + jid + size) into the
//     groups table so the portal shows proper group icons and the true subject,
//     instead of deriving a name from messages.account and drawing one generic icon.
//
// Both are additive and safe to run before the redesign swaps in. Auth: x-group-secret
// must equal GROUP_BOT_SECRET (same as /api/group/ingest and /api/group/outbox).
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

  // the bot may send strings (legacy) or rich {name/subject, jid, avatar_url, ...}
  const incoming: any[] = Array.isArray(b?.groups) ? b.groups : [];
  const db = admin();

  // 1) authoritative membership: the distinct group NAMES the bot is in
  const names = [
    ...new Set(
      incoming
        .map((g) => String(typeof g === "string" ? g : g?.subject || g?.name || "").trim())
        .filter(Boolean),
    ),
  ];
  await db.from("bot_status").upsert(
    { key: "group_membership", value: { groups: names, ts: new Date().toISOString() }, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
  await emit({ type: "group.membership_synced", source: "group-bot", actor: "group-bot", subject_type: "bot", subject_id: null, payload: { count: names.length, groups: names } });

  // 2) group identity for proper icons: upsert subject + avatar when the bot sends
  // rich objects (string-only payloads just sync membership, no identity to store)
  const rows = incoming
    .filter((g) => g && typeof g === "object")
    .map((g) => {
      const name = String(g.subject || g.name || "").trim().slice(0, 200);
      if (!name) return null;
      return {
        name,
        subject: name,
        jid: g.jid ? String(g.jid).slice(0, 120) : null,
        avatar_url: g.avatar_url ? String(g.avatar_url).slice(0, 1000) : null,
        participant_count: Number.isFinite(g.participant_count) ? Number(g.participant_count) : null,
        updated_at: new Date().toISOString(),
      };
    })
    .filter(Boolean) as any[];
  // Dedupe by name (keep the last): a single upsert batch that hits the same
  // onConflict key twice errors in Postgres ("ON CONFLICT DO UPDATE cannot affect
  // row a second time") and drops the WHOLE batch. Two WhatsApp groups can share a
  // subject, so without this the groups table silently never populates.
  const byName = new Map<string, any>();
  for (const r of rows) byName.set(r.name, r);
  const deduped = [...byName.values()];
  let identities = 0;
  if (deduped.length) {
    const { error } = await db.from("groups").upsert(deduped, { onConflict: "name" });
    if (error) return NextResponse.json({ ok: false, error: error.message, count: names.length }, { status: 500 });
    identities = deduped.length;
  }

  return NextResponse.json({ ok: true, count: names.length, identities });
}
