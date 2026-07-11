// DAILY YALLA KENYA FINANCE DIGEST (Field-nervous-system law).
// Nur is in Kenya for the Yalla film project and investors want a daily read on
// spend. Once a day this cron reads the Yalla project ledger and WhatsApps Nur
// ONE summary: what was logged today, the running project total (per currency,
// never blended — Currency Law), and anything auto-booked that still needs her
// day-end confirm (her answer: "auto log but ask Nur day end to confirm").
//
// Triggered by Vercel cron (GET, Authorization: Bearer CRON_SECRET). Also
// runnable with x-agent-secret / x-group-secret / ?key=. Idempotent per day: a
// yalla.digest_sent event already today skips a re-run (?force=1 overrides).
// Sends only if the project has any expenses at all (no noise before it starts).
import { NextRequest, NextResponse } from "next/server";
import { admin } from "../../../../lib/supabase-admin";
import { emit } from "../../../../lib/events";
import { pushOperatorUpdate } from "../../../../lib/notify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

// Sum a set of rows into a { CCY: total } map (never blended across currencies).
function perCurrency(rows: any[]): Record<string, number> {
  const t: Record<string, number> = {};
  for (const p of rows) {
    const c = String(p.currency || "KES").toUpperCase();
    t[c] = (t[c] || 0) + Number(p.amount || 0);
  }
  return t;
}
const fmtTotals = (t: Record<string, number>) =>
  Object.keys(t).length ? Object.entries(t).sort().map(([c, v]) => money(v, c)).join(" + ") : "nothing";

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const force = new URL(req.url).searchParams.get("force") === "1";
  const db = admin();

  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  if (!force) {
    const { data: already } = await db
      .from("events").select("id").eq("type", "yalla.digest_sent")
      .gte("created_at", dayStart.toISOString()).limit(1);
    if (already?.[0]) return NextResponse.json({ ok: true, skipped: "already sent today" });
  }

  // Whole Yalla ledger (money out, paid).
  const { data: rows } = await db
    .from("payments")
    .select("payee,amount,currency,category,paid_at,source_uploaded_at,needs_review,confirmed_at,status")
    .eq("project", "yalla").eq("direction", "out")
    .limit(5000);
  const all = ((rows || []) as any[]).filter((p) => p.status === "paid");

  if (!all.length) {
    await emit({ type: "yalla.digest_sent", source: "cron", actor: "system", subject_type: "digest", subject_id: null, payload: { count: 0, sent: false, reason: "no expenses" } });
    return NextResponse.json({ ok: true, count: 0, sent: false, reason: "no yalla expenses yet" });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const loggedToday = all.filter((p) => (p.source_uploaded_at || p.paid_at || "") >= since);
  const toConfirm = all.filter((p) => p.needs_review && !p.confirmed_at);

  const runningTotals = perCurrency(all);
  const todayTotals = perCurrency(loggedToday);

  const todayLines = loggedToday
    .slice(0, 15)
    .map((p) => `• ${p.payee || "expense"} — ${money(Number(p.amount || 0), String(p.currency || "KES").toUpperCase())}${p.category ? ` (${p.category})` : ""}`);

  const body =
    `Yalla Kenya — daily finance\n\n` +
    (loggedToday.length
      ? `Logged today: ${fmtTotals(todayTotals)} across ${loggedToday.length} expense${loggedToday.length > 1 ? "s" : ""}.\n` + todayLines.join("\n") + (loggedToday.length > 15 ? `\n…and ${loggedToday.length - 15} more.` : "")
      : `No new spend logged today.`) +
    `\n\nSpent to date: ${fmtTotals(runningTotals)} across ${all.length} expenses.` +
    (toConfirm.length ? `\n\n${toConfirm.length} auto-logged item${toConfirm.length > 1 ? "s" : ""} need your confirm — open command.nisria.co/yalla to review.` : ``) +
    `\n\nFull ledger + report: https://command.nisria.co/yalla`;

  const nurWa = (process.env.WHATSAPP_OPERATORS || "").split(",").map((s) => s.trim()).filter(Boolean)[0] || "";
  let sent = false;
  if (nurWa) {
    try {
      const res = await pushOperatorUpdate(db, nurWa, "Nur", body);
      sent = !!res?.ok;
    } catch (err) {
      console.error("yalla-digest send failed", err);
    }
  }

  await emit({ type: "yalla.digest_sent", source: "cron", actor: "system", subject_type: "digest", subject_id: null, payload: { count: all.length, logged_today: loggedToday.length, to_confirm: toConfirm.length, sent } });
  return NextResponse.json({ ok: true, count: all.length, logged_today: loggedToday.length, to_confirm: toConfirm.length, sent });
}
