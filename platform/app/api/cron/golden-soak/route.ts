// SYNTHETIC-NUR GOLDEN-PATH SOAK (2026-07-01). Runs every morning and health-checks the
// 8 things Nur must be able to do daily, so a break is caught by US before she hits it.
// SAFE: no writes to prod. Each check is a pure ROUTE assertion (does the parser still
// route Nur's golden input — catches a deploy regression) PLUS a live DEPENDENCY ping
// (DB table reachable / tool registered / group bot alive / brain key present — catches
// runtime drift the deploy walls can't). Any red -> pushIncident to Taona (deduped) +
// a golden_soak.failed event. All green -> golden_soak.ok. This is the launch-confidence
// net: "I get told the moment a core job stops working," not "I hope it works."
import { NextRequest, NextResponse } from "next/server";
import { admin } from "../../../../lib/supabase-admin";
import { emit } from "../../../../lib/events";

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

type Check = { path: string; ok: boolean; detail: string };

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = admin();
  const checks: Check[] = [];
  const add = (path: string, ok: boolean, detail: string) => checks.push({ path, ok, detail });

  // shared imports (best-effort; a failed import is itself a red)
  let parseTasks: any, parsePaymentAll: any, SMART_TOOL_NAMES: Set<string>, phoneLooksValid: any;
  try {
    ({ parseTasks } = await import("../../whatsapp/worker/parseTasks.mjs"));
    ({ parsePaymentAll } = await import("../../whatsapp/worker/parsePayment.mjs"));
    ({ SMART_TOOL_NAMES } = await import("../../../../lib/smart-tools"));
    ({ phoneLooksValid } = await import("../../../../lib/phone.mjs"));
  } catch (e: any) {
    add("imports", false, `core module import failed: ${String(e?.message || e).slice(0, 120)}`);
  }
  const hasTool = (n: string) => !!SMART_TOOL_NAMES && SMART_TOOL_NAMES.has(n);
  const tableOk = async (t: string) => { try { const r = await db.from(t).select("id", { count: "exact", head: true }); return !r.error; } catch { return false; } };

  // 0) BRAIN alive — the single point of failure. No key = nothing works.
  add("brain_key", !!process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_API_KEY ? "Anthropic key present" : "ANTHROPIC_API_KEY missing — the brain cannot run");
  // 0b) DB reachable
  add("database", await tableOk("tasks"), "tasks table reachable");

  // 1) TASK CREATE — parser still routes "Add these tasks for today to me: <bullets>"
  try {
    const roster = [{ id: "soak", name: "Soak Runner", phone: "+254700000000", status: "active" }];
    const p = parseTasks({ body: "Add these tasks for today to me:\n- alpha proposal\n- beta proposal", team_members: roster, sender_contact_id: "soak", source_message_id: "soak", sender_rank: "founder", sender_role: "admin", sender_team_member: roster[0] });
    const n = (p?.tasks || []).length;
    add("task_create", n === 2 && hasTool("create_task"), `parseTasks -> ${n} tasks; create_task tool ${hasTool("create_task") ? "ok" : "MISSING"}`);
  } catch (e: any) { add("task_create", false, `route error: ${String(e?.message || e).slice(0, 100)}`); }

  // 2) TASK ASSIGN — create_task tool + a real bot_access teammate with a valid number
  try {
    const { data: mem } = await db.from("team_members").select("name,phone,bot_access,status").eq("bot_access", true);
    const reachable = ((mem || []) as any[]).filter((m) => (m.status ?? "active") !== "inactive" && phoneLooksValid(m.phone));
    add("task_assign", hasTool("create_task") && reachable.length > 0, `${reachable.length} bot-access teammate(s) reachable; create_task ${hasTool("create_task") ? "ok" : "MISSING"}`);
  } catch (e: any) { add("task_assign", false, `roster read error: ${String(e?.message || e).slice(0, 100)}`); }

  // 3) PAYMENT LOG — parser still stages a payee-less expense + record_payment tool
  try {
    const stg = (parsePaymentAll("Log a payment of KES 5000 for office rent") || []).filter((x: any) => x?.intent === "stage_payment").length;
    add("payment_log", stg === 1 && hasTool("record_payment"), `parsePayment -> ${stg} staged; record_payment ${hasTool("record_payment") ? "ok" : "MISSING"}`);
  } catch (e: any) { add("payment_log", false, `route error: ${String(e?.message || e).slice(0, 100)}`); }

  // 4) GROUP POST — post_to_group tool + group userbot alive (heartbeat < 6 min)
  try {
    const { data: hb } = await db.from("bot_status").select("updated_at").eq("key", "group_poll").maybeSingle();
    const ageMin = hb?.updated_at ? (Date.now() - new Date(hb.updated_at).getTime()) / 60000 : Infinity;
    add("group_post", hasTool("post_to_group") && ageMin < 6, `group bot heartbeat ${isFinite(ageMin) ? Math.round(ageMin) + "m" : "STALE"}; post_to_group ${hasTool("post_to_group") ? "ok" : "MISSING"}`);
  } catch (e: any) { add("group_post", false, `heartbeat read error: ${String(e?.message || e).slice(0, 100)}`); }

  // 5) BRAIN SAVE — remember_fact tool + agent_memory reachable
  add("brain_save", hasTool("remember_fact") && (await tableOk("agent_memory")), `remember_fact ${hasTool("remember_fact") ? "ok" : "MISSING"}; agent_memory reachable`);
  // 6) WISHLIST — add_wishlist_item tool + wishlist_items reachable
  add("wishlist_add", hasTool("add_wishlist_item") && (await tableOk("wishlist_items")), `add_wishlist_item ${hasTool("add_wishlist_item") ? "ok" : "MISSING"}; wishlist_items reachable`);
  // 7) EMAIL SEND — draft_email tool present
  add("email_send", hasTool("draft_email"), `draft_email ${hasTool("draft_email") ? "ok" : "MISSING"}`);
  // 8) CALENDAR — create_event tool + events table reachable
  add("calendar_event", hasTool("create_event") && (await tableOk("events")), `create_event ${hasTool("create_event") ? "ok" : "MISSING"}; events reachable`);

  const red = checks.filter((c) => !c.ok);
  const result = { type: "golden_soak", ok: red.length === 0, passed: checks.length - red.length, total: checks.length, at: new Date().toISOString(), failed: red.map((c) => ({ path: c.path, detail: c.detail })), checks };
  await emit({
    type: red.length ? "golden_soak.failed" : "golden_soak.ok",
    source: "cron", actor: "system", subject_type: "soak", subject_id: null,
    payload: { total: checks.length, passed: checks.length - red.length, failed: result.failed },
  }).catch(() => {});

  // HMAC WEBHOOK to Taona's own bot (preferred delivery). If SOAK_WEBHOOK_URL +
  // SOAK_WEBHOOK_SECRET are set, POST the full signed result EVERY run (green heartbeat +
  // red alert) so his bot always knows the soak itself is alive — a missing daily post is
  // itself a signal. Body is HMAC-SHA256 signed; his bot verifies X-Signature before
  // trusting it. Falls back to the WhatsApp incident below when no webhook is configured.
  const hookUrl = process.env.SOAK_WEBHOOK_URL || "";
  const hookSecret = process.env.SOAK_WEBHOOK_SECRET || "";
  let webhookDelivered = false;
  if (hookUrl && hookSecret) {
    try {
      const crypto = await import("node:crypto");
      const body = JSON.stringify(result);
      const sig = crypto.createHmac("sha256", hookSecret).update(body).digest("hex");
      const r = await fetch(hookUrl, { method: "POST", headers: { "content-type": "application/json", "x-signature": `sha256=${sig}`, "x-soak-event": red.length ? "golden_soak.failed" : "golden_soak.ok" }, body });
      webhookDelivered = r.ok;
    } catch { /* fall through to WhatsApp */ }
  }

  // WhatsApp incident to the owner: on red always; also if the preferred webhook was
  // configured but did NOT deliver (so a failing soak is never silent).
  if (red.length || (hookUrl && !webhookDelivered)) {
    try {
      const { pushIncident } = await import("../../../../lib/notify");
      const detail = red.length
        ? `${red.length}/${checks.length} core path(s) failing: ${red.map((c) => `${c.path} (${c.detail})`).join("; ")}. Nur may hit this today.`
        : `soak is green but the bot webhook (${hookUrl.slice(0, 40)}) did not accept the post — check the HMAC endpoint.`;
      await pushIncident("Golden-path soak", detail);
    } catch { /* incident best-effort */ }
  }

  return NextResponse.json({ ...result, webhook: hookUrl ? (webhookDelivered ? "delivered" : "failed") : "not-configured" });
}
