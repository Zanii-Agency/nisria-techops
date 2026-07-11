// DAILY FINANCE SUMMARY INTO THE GROUP (Taona 2026-07-11). The team that posts
// receipts should see the books they feed: once a day the bot posts into the
// Finances group who logged what and the day's total. This is also the
// reconciliation surface (control totals): files that arrived vs expenses that
// booked vs duplicates suppressed, so a silent miss or a mis-tag is publicly
// visible within a day instead of hiding in the database.
//
// Delivery: the portal never touches WhatsApp group sessions. It queues a
// `group.send` job; the Railway userbot polls /api/group/outbox and delivers.
// Idempotent per day (events: group.finance_summary_sent); quiet days send nothing.
import { NextRequest, NextResponse } from "next/server";
import { admin } from "../../../../lib/supabase-admin";
import { emit } from "../../../../lib/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const GROUP = "Nisria • Finances 💵";

function authed(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") || "";
  const cron = process.env.CRON_SECRET, agent = process.env.AGENT_TICK_SECRET, group = process.env.GROUP_BOT_SECRET;
  const qs = new URL(req.url).searchParams.get("key");
  if (cron && auth === `Bearer ${cron}`) return true;
  if (agent && (req.headers.get("x-agent-secret") === agent || qs === agent)) return true;
  if (group && (req.headers.get("x-group-secret") === group || qs === group)) return true;
  return false;
}

const money = (n: number, c: string) => `${c} ${Math.round(n).toLocaleString("en-US")}`;
const digits = (s: string) => String(s || "").replace(/\D+/g, "");

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const force = new URL(req.url).searchParams.get("force") === "1";
  const db = admin();

  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  if (!force) {
    const { data: already } = await db.from("events").select("id").eq("type", "group.finance_summary_sent")
      .gte("created_at", dayStart.toISOString()).limit(1);
    if (already?.[0]) return NextResponse.json({ ok: true, skipped: "already sent today" });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Everything that landed in the ledger today from the group's stream — live
  // auto-books (created_by=group:<phone>) AND history-import rows (backfill:...),
  // so the team summary matches the books, not one ingest path.
  const { data: booked } = await db.from("payments")
    .select("amount,currency,project,created_by,payee,purpose,source_type")
    .or("created_by.like.group:%,created_by.like.backfill:%")
    .gte("created_at", since).limit(500);
  const rows = (booked || []) as any[];

  // Control totals: files that arrived vs duplicates we suppressed.
  const { data: mediaEv } = await db.from("events").select("id").eq("type", "whatsapp.group_media_in")
    .eq("payload->>group", GROUP).gte("created_at", since).limit(500);
  const { data: dupEv } = await db.from("events").select("id").eq("type", "group.payment_dup_suppressed")
    .eq("payload->>group", GROUP).gte("created_at", since).limit(500);
  const filesIn = mediaEv?.length || 0;
  const dupsSuppressed = dupEv?.length || 0;

  if (!rows.length && !filesIn) {
    await emit({ type: "group.finance_summary_sent", source: "cron", actor: "system", subject_type: "digest", subject_id: null, payload: { sent: false, reason: "quiet day" } });
    return NextResponse.json({ ok: true, sent: false, reason: "quiet day" });
  }

  // Resolve each poster to a human name. Live rows carry group:<phone>; history
  // rows carry backfill:<batch>:<contactId>. Both resolve via contacts; a raw
  // push-name like "dorcasnjambi74@gmail,com" is cleaned to "Dorcasnjambi74".
  const { data: contacts } = await db.from("contacts").select("id,phone,name").limit(2000);
  const clean = (n: string) => { const s = String(n).split("@")[0].replace(/[,.]com$/i, "").trim(); return s.charAt(0).toUpperCase() + s.slice(1); };
  const nameByPhone = new Map<string, string>();
  const nameById = new Map<string, string>();
  for (const c of (contacts || []) as any[]) {
    if (c.name) { if (c.phone) nameByPhone.set(digits(c.phone), clean(c.name)); nameById.set(String(c.id), clean(c.name)); }
  }
  const posterName = (createdBy: string) => {
    const s = String(createdBy || "");
    if (s.startsWith("group:")) {
      const d = digits(s.slice(6));
      return nameByPhone.get(d) || (d ? `+${d.slice(0, 6)}…` : "team");
    }
    const cid = s.split(":").pop() || "";
    return nameById.get(cid) || "team";
  };

  // Per-person totals, per currency (Currency Law: never blended).
  const byPerson = new Map<string, { count: number; totals: Record<string, number> }>();
  const dayTotals: Record<string, number> = {};
  for (const r of rows) {
    const who = posterName(r.created_by);
    const c = String(r.currency || "KES").toUpperCase();
    const p = byPerson.get(who) || { count: 0, totals: {} };
    p.count += 1; p.totals[c] = (p.totals[c] || 0) + Number(r.amount || 0);
    byPerson.set(who, p);
    dayTotals[c] = (dayTotals[c] || 0) + Number(r.amount || 0);
  }
  const fmtT = (t: Record<string, number>) => Object.entries(t).sort().map(([c, v]) => money(v, c)).join(" + ") || "0";

  // MONEY-FIRST (Taona 2026-07-11): per-person amounts only. Counts and item
  // detail live in the portal; the group sees who moved how much.
  const personLines = [...byPerson.entries()]
    .sort((a, b) => (b[1].totals.KES || 0) - (a[1].totals.KES || 0))
    .map(([who, p]) => `• ${who}: ${fmtT(p.totals)}`);

  const generalTotals: Record<string, number> = {};
  for (const r of rows) {
    if (r.project) continue;
    const c = String(r.currency || "KES").toUpperCase();
    generalTotals[c] = (generalTotals[c] || 0) + Number(r.amount || 0);
  }
  const hasGeneral = Object.keys(generalTotals).length > 0;

  const text =
    `*Daily money summary*\n\n` +
    (rows.length
      ? `${personLines.join("\n")}\n\n*Total today:* ${fmtT(dayTotals)}` +
        (hasGeneral ? `\n(${fmtT(generalTotals)} went to general, not Yalla: say "yalla" with a receipt to tag it)` : "")
      : `No money logged today.`) +
    (() => {
      // Control total: files that arrived minus files that became expenses minus
      // duplicates. Only the remainder is genuinely unread.
      const bookedFromFiles = rows.filter((r) => r.source_type === "pdf" || r.source_type === "image" || r.source_type === "screenshot").length;
      const unread = Math.max(0, filesIn - bookedFromFiles - dupsSuppressed);
      return unread > 0 ? `\n\n${unread} file${unread > 1 ? "s" : ""} arrived that I could not read as receipts. They are filed for review.` : ``;
    })() +
    (dupsSuppressed > 0 ? `\n${dupsSuppressed} duplicate${dupsSuppressed > 1 ? "s" : ""} skipped (same payment posted more than once).` : ``) +
    `\n\nEvery entry waits for Nur's confirm before it is final.`;

  // Queue for the group bot (the sole holder of the group session).
  const { data: job } = await db.from("jobs").insert({
    kind: "group.send", status: "queued",
    payload: { group: GROUP, text },
  }).select("id").single();

  await emit({ type: "group.finance_summary_sent", source: "cron", actor: "system", subject_type: "digest", subject_id: job?.id ?? null, payload: { sent: true, people: byPerson.size, expenses: rows.length, files_in: filesIn, dups: dupsSuppressed } });
  return NextResponse.json({ ok: true, sent: true, queued_job: job?.id || null, people: byPerson.size, expenses: rows.length, files_in: filesIn, dups_suppressed: dupsSuppressed });
}
