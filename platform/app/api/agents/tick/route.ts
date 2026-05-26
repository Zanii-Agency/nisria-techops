// The agent-runtime tick. Driven by Vercel Cron (GET, bearer secret) and/or
// n8n + inbound webhooks (POST, x-agent-secret). Drains new inbound messages →
// Comms agent drafts + classifies → files into the approvals queue with a gated
// action_intent → logs runs + events. Auto-sends only what the dials allow.
import { NextRequest, NextResponse } from "next/server";
import { admin } from "../../../../lib/supabase-admin";
import { emit } from "../../../../lib/events";
import { recall, groundingText } from "../../../../lib/memory";
import { draftReply } from "../../../../lib/agents/comms";
import { draftThankYou } from "../../../../lib/agents/steward";
import { buildBriefPoints } from "../../../../lib/agents/conductor";
import { laneFor, createIntent, approveApproval, queueApproval, type Lane } from "../../../../lib/gateway";
import { money } from "../../../../lib/supabase-admin";
import { getCounts } from "../../../../lib/counts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const RANK: Record<Lane, number> = { auto: 0, approve: 1, escalate: 2 };
const stricter = (a: Lane, b: Lane): Lane => (RANK[a] >= RANK[b] ? a : b);

async function runTick() {
  const db = admin();
  const out = { processed: 0, drafted: 0, escalated: 0, auto_sent: 0, thanked: 0, errors: [] as string[] };

  const { data: msgs } = await db
    .from("messages")
    .select("id,contact_id,channel,account,sender_type,subject,body,created_at,contact:contacts(name,email)")
    .eq("direction", "in")
    .eq("status", "new")
    .or("sender_type.eq.individual,sender_type.is.null") // skip automated outright
    .order("created_at", { ascending: true })
    .limit(3); // Hobby serverless ~10s cap → small batches; the 5-min cron drains over time

  const ruleLane = await laneFor("kind:email_reply");

  for (const m of (msgs || []) as any[]) {
    const started = Date.now();
    out.processed++;
    const contact: any = m.contact || {};
    const fromName = contact.name || (contact.email || "").split("@")[0] || "Someone";
    try {
      const mem = await recall(`${m.subject || ""} ${m.body || ""}`, { kinds: ["approved_reply"] });
      const draft = await draftReply({
        channel: m.channel || "email", fromName, fromAddr: contact.email,
        subject: m.subject, body: m.body || "", grounding: groundingText(mem),
      });
      if (!draft) { out.errors.push(`no draft for ${m.id}`); await db.from("messages").update({ status: "drafted", handled_by: "agent:comms" }).eq("id", m.id); continue; }

      // automated / no-reply / our own outgoing / spam / empty → never enters Needs You; archive quietly
      if (draft.category === "spam" || draft.category === "no_reply" || m.sender_type === "automated" || !draft.reply) {
        await db.from("messages").update({ status: "archived", handled_by: "agent:comms" }).eq("id", m.id);
        await db.from("agent_runs").insert({ agent: "agent:comms", correlation_id: m.id, decision: "noop", input: { from: fromName, subject: m.subject }, output: { category: draft.category }, model: "claude-sonnet-4-5", latency_ms: Date.now() - started, status: "ok" });
        continue;
      }

      const subject = draft.subject || `Re: ${m.subject || "your message"}`;
      const lane = stricter(ruleLane, (draft.lane_hint as Lane) || "approve");
      const correlation_id = m.id;

      const intent = await createIntent({
        connector: "email", action: "send_email",
        params: { to: contact.email, subject, text: draft.reply },
        lane, risk: draft.category === "complaint" || draft.category === "press" ? "high" : "low",
        requested_by: "agent:comms", correlation_id, idempotency_key: `reply:${m.id}`,
      });

      // Idempotent: skip if a pending reply approval for this message already
      // exists, and never create an orphan card when the intent was a swallowed
      // duplicate. `account` (sasa@ vs maisha@) is carried so the card can chip it.
      const { created, row: approval } = await queueApproval({
        kind: "email_reply",
        messageId: m.id,
        intentMissing: !intent,
        row: {
          kind: "email_reply", title: `Reply to ${fromName}`, summary: draft.reply.slice(0, 140),
          agent: "agent:comms", lane,
          proposed: { to: contact.email, subject, body: draft.reply, from: fromName },
          context: { message_id: m.id, contact_id: m.contact_id, subject: m.subject, from: fromName, account: m.account || null, category: draft.category, correlation_id, original: (m.body || "").slice(0, 1200) },
          related_contact_id: m.contact_id, intent_id: intent?.id || null,
        },
      });

      // message is handled either way (drafted now or already queued), so it
      // leaves the "new" backlog and won't be re-drafted into a second card.
      await db.from("messages").update({ status: "drafted", handled_by: "agent:comms" }).eq("id", m.id);

      if (!created) { continue; } // already queued — no duplicate run/emit/count

      await db.from("agent_runs").insert({
        agent: "agent:comms", correlation_id,
        decision: lane === "auto" ? "auto" : lane === "escalate" ? "escalate" : "draft",
        input: { from: fromName, subject: m.subject, category: draft.category },
        output: { lane, confidence: draft.confidence, reasoning: draft.reasoning },
        model: "claude-sonnet-4-5", latency_ms: Date.now() - started, status: "ok",
      });

      await emit({ type: "agent.decided", source: "agent:comms", actor: "agent:comms", subject_type: "contact", subject_id: m.contact_id, correlation_id, payload: { kind: "email_reply", lane, category: draft.category, from: fromName } });
      await emit({ type: "approval.created", source: "agent:comms", actor: "agent:comms", subject_type: "approval", subject_id: approval?.id, correlation_id, payload: { kind: "email_reply", title: `Reply to ${fromName}`, lane } });

      if (lane === "escalate") out.escalated++; else out.drafted++;

      if (lane === "auto" && approval?.id) {
        const r = await approveApproval(approval.id, { decidedBy: "auto" });
        if ((r as any)?.ok) out.auto_sent++;
      }
    } catch (e: any) {
      out.errors.push(`${m.id}: ${e?.message || e}`);
      await db.from("agent_runs").insert({ agent: "agent:comms", correlation_id: m.id, decision: "error", status: "error", error: e?.message || String(e) });
    }
  }

  // ---- Donor Steward: thank recent NEW gifts (last 3 days), once each ----
  try {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400e3).toISOString();
    const { data: gifts } = await db.from("donations")
      .select("id,amount,is_recurring,donated_at,donor:donors(id,full_name,email)")
      .eq("status", "succeeded").gte("donated_at", threeDaysAgo)
      .order("donated_at", { ascending: false }).limit(2);
    const tyLane = await laneFor("kind:donor_thankyou");
    for (const g of (gifts || []) as any[]) {
      const donor = g.donor || {};
      if (!donor.email) continue;
      const { data: existing } = await db.from("action_intents").select("id").eq("idempotency_key", `thankyou:${g.id}`).maybeSingle();
      if (existing) continue;
      const mem = await recall(`thank you donor ${donor.full_name}`, { kinds: ["approved_reply", "brand_voice"] });
      const ty = await draftThankYou({ name: donor.full_name || "friend", amount: money(g.amount), recurring: !!g.is_recurring, grounding: groundingText(mem) });
      if (!ty) continue;
      const intent = await createIntent({ connector: "email", action: "send_email", params: { to: donor.email, subject: ty.subject, text: ty.body }, lane: tyLane, requested_by: "agent:steward", correlation_id: g.id, idempotency_key: `thankyou:${g.id}` });
      const { created, row: ap } = await queueApproval({
        kind: "donor_thankyou",
        donationId: g.id,
        intentMissing: !intent,
        row: {
          kind: "donor_thankyou", title: `Thank ${donor.full_name || "donor"}`, summary: ty.body.slice(0, 140), agent: "agent:steward", lane: tyLane,
          proposed: { to: donor.email, subject: ty.subject, body: ty.body, from: donor.full_name },
          context: { donation_id: g.id, donor_id: donor.id, name: donor.full_name, amount: money(g.amount) },
          intent_id: intent?.id || null,
        },
      });
      if (!created) continue;
      await db.from("agent_runs").insert({ agent: "agent:steward", correlation_id: g.id, decision: tyLane === "auto" ? "auto" : "draft", input: { donor: donor.full_name, amount: money(g.amount) }, output: { lane: tyLane }, model: "claude-sonnet-4-5", status: "ok" });
      await emit({ type: "agent.decided", source: "agent:steward", actor: "agent:steward", subject_type: "donor", subject_id: donor.id, correlation_id: g.id, payload: { kind: "donor_thankyou", lane: tyLane, from: donor.full_name } });
      await emit({ type: "approval.created", source: "agent:steward", actor: "agent:steward", subject_type: "approval", subject_id: ap?.id, correlation_id: g.id, payload: { kind: "donor_thankyou", title: `Thank ${donor.full_name}`, lane: tyLane } });
      out.thanked++;
      if (tyLane === "auto" && ap?.id) await approveApproval(ap.id, { decidedBy: "auto" });
    }
  } catch (e: any) { out.errors.push(`steward: ${e?.message || e}`); }

  // ---- Daily brief (cron-cached so pages never call Claude to render) ----
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data: ds } = await db.from("daily_summaries").select("created_at").eq("for_date", today).maybeSingle();
    const stale = !ds || (Date.now() - new Date(ds.created_at).getTime() > 3 * 3600e3);
    if (stale) {
      const [{ data: dons }, { data: donors2 }, { count: pend }, { count: nm }, { data: tks }, { data: camps }, { data: evs }] = await Promise.all([
        db.from("donations").select("amount,status,donated_at"),
        db.from("donors").select("id"),
        db.from("approvals").select("id", { count: "exact", head: true }).eq("status", "pending"),
        db.from("messages").select("id", { count: "exact", head: true }).eq("direction", "in").eq("status", "new").eq("sender_type", "individual"),
        db.from("tasks").select("id").neq("status", "done"),
        db.from("campaigns").select("name").eq("status", "live"),
        db.from("events").select("type").in("type", ["agent.decided", "action.executed"]).order("created_at", { ascending: false }).limit(5),
      ]);
      const s = (dons || []).filter((d: any) => d.status === "succeeded");
      const nd = new Date();
      const rmtd = s.filter((d: any) => { const x = new Date(d.donated_at); return x.getMonth() === nd.getMonth() && x.getFullYear() === nd.getFullYear(); }).reduce((a: number, d: any) => a + Number(d.amount), 0);
      const rall = s.reduce((a: number, d: any) => a + Number(d.amount), 0);
      const bp = await buildBriefPoints({ raisedMtd: money(rmtd), raisedAll: money(rall), donors: donors2?.length || 0, newMessages: nm || 0, pendingApprovals: pend || 0, openTasks: (tks || []).length, recentAgentActions: (evs || []).map((e: any) => e.type), liveCampaigns: (camps || []).map((c: any) => c.name) });
      if (bp) await db.from("daily_summaries").upsert({ for_date: today, brief: bp.summary, points: bp.points, created_at: new Date().toISOString() }, { onConflict: "for_date" });
    }
  } catch (e: any) { out.errors.push(`brief: ${e?.message || e}`); }

  return out;
}

function authed(req: NextRequest): boolean {
  const agent = process.env.AGENT_TICK_SECRET;
  const cron = process.env.CRON_SECRET;
  const hAgent = req.headers.get("x-agent-secret");
  const auth = req.headers.get("authorization") || "";
  const qs = new URL(req.url).searchParams.get("key");
  if (agent && (hAgent === agent || qs === agent)) return true;          // n8n / manual
  if (cron && auth === `Bearer ${cron}`) return true;                    // Vercel cron
  return false;
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await runTick());
}

export async function GET(req: NextRequest) {
  if (authed(req)) return NextResponse.json(await runTick());
  // unauthenticated GET = health/heartbeat. Counts come from the single source of
  // truth so the bell, dashboard and inbox can never disagree.
  const db = admin();
  const counts = await getCounts(db);
  return NextResponse.json({
    ok: true,
    pending_approvals: counts.needsYou,
    new_messages: counts.needsReply,
  });
}
