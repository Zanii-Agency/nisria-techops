// WEEKLY CAPABILITY-GAP SCAN (behavioral half of the coverage guarantee).
//
// The predeploy wall (eval/unit/capability-coverage.test.mjs) proves nothing is
// advertised-but-unwired. This is the other half: it reads REAL traffic for the
// asks the bot PUNTED on — refused, hit an honest-error, flagged for clarity, or
// routed at low confidence — and DMs the owner a short digest. A golden test only
// checks what we thought of; this surfaces the demand we did not predict.
//
// Triggered by Vercel cron (Authorization: Bearer CRON_SECRET). Also runnable with
// x-agent-secret / ?key=. Idempotent per ISO week (a capability_gap.scanned event
// this week skips a re-run; ?force=1 overrides). DM goes through the LOGGED path.
import { NextRequest, NextResponse } from "next/server";
import { admin } from "../../../../lib/supabase-admin";
import { emit } from "../../../../lib/events";
import { sendTextAndLog, resolveContact } from "../../../../lib/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authed(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") || "";
  const cron = process.env.CRON_SECRET, agent = process.env.AGENT_TICK_SECRET;
  const qs = new URL(req.url).searchParams.get("key");
  if (cron && auth === `Bearer ${cron}`) return true;
  if (agent && (req.headers.get("x-agent-secret") === agent || qs === agent)) return true;
  return false;
}

// Punt patterns in an outbound reply: the bot could not do what was asked.
const PUNTS: { label: string; re: RegExp }[] = [
  { label: "hit a snag (honest-error)", re: /hit a snag|pick it back up|tripped me up/i },
  { label: "could not do it here", re: /not something I can do|not available here|only operators|do not have (?:the )?(?:ability|access)|can't do that from|cannot do that/i },
  { label: "asked which one / needs more", re: /which one\??$|not sure which|could you clarify|need a bit more/i },
];

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const db = admin();
  const force = new URL(req.url).searchParams.get("force") === "1";

  // Idempotent per ISO week: skip if we already scanned in the last 6 days.
  const weekAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
  if (!force) {
    const { data: prior } = await db.from("events").select("id").eq("type", "capability_gap.scanned").gte("created_at", weekAgo).limit(1);
    if (prior?.[0]) return NextResponse.json({ ok: true, skipped: "already scanned this week" });
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  // Outbound replies that punted.
  const { data: outs } = await db.from("messages").select("body").eq("direction", "out").gte("created_at", since).limit(2000);
  const outBodies = ((outs || []) as any[]).map((m) => String(m.body || ""));
  const puntCounts = PUNTS.map((p) => ({ label: p.label, n: outBodies.filter((b) => p.re.test(b)).length, sample: outBodies.find((b) => p.re.test(b)) || "" }));
  // Specialist errors + low-confidence routes.
  const { data: errs } = await db.from("events").select("id").eq("type", "mesh.specialist_error").gte("created_at", since).limit(500);
  const { data: routes } = await db.from("events").select("payload").eq("type", "mesh.routed").gte("created_at", since).limit(2000);
  const lowConf = ((routes || []) as any[]).filter((e) => (e.payload?.confidence ?? 1) < 0.7).length;
  const errN = (errs || []).length;

  const totalPunts = puntCounts.reduce((s, p) => s + p.n, 0);
  const lines: string[] = [`*Weekly capability check*`, "", `Scanned ${outBodies.length} replies + ${(routes || []).length} routes over 7 days.`];
  if (totalPunts === 0 && errN === 0 && lowConf === 0) {
    lines.push("", "✅ Nothing dead-ended. Every practical ask was handled by a real tool.");
  } else {
    lines.push("", "*Where the bot fell short (worth a look):*");
    if (errN) lines.push(`• ${errN} time${errN > 1 ? "s" : ""} it hit an internal snag`);
    for (const p of puntCounts) if (p.n) lines.push(`• ${p.n} × ${p.label}${p.sample ? `\n   e.g. "${p.sample.slice(0, 90)}"` : ""}`);
    if (lowConf) lines.push(`• ${lowConf} route${lowConf > 1 ? "s" : ""} were low-confidence (unsure which area)`);
    lines.push("", "If any of these are things the team needs, tell me and I will wire it.");
  }
  const body = lines.join("\n");

  const owner = (process.env.OWNER_WHATSAPP || "").split(",").map((s) => s.trim()).filter(Boolean)[0] || "";
  let sent = false;
  if (owner) {
    try { const cid = await resolveContact(db, owner, "Taona").catch(() => null); const r = await sendTextAndLog(db, owner, body, { contactId: cid as any, handledBy: "sasa" }); sent = !!r?.id; } catch (e) { console.error("capability-gap send failed", e); }
  }
  await emit({ type: "capability_gap.scanned", source: "cron", actor: "system", subject_type: "digest", subject_id: null, payload: { punts: totalPunts, errors: errN, low_conf: lowConf, sent } });
  return NextResponse.json({ ok: true, punts: totalPunts, errors: errN, low_conf: lowConf, sent });
}
