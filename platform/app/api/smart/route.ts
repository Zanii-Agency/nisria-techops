// SMART MODE = a REAL tool-using agent (R3-3 / P6). The founder's vision (imgs
// 173,174): "I should just type and things happen ... an agent that does things
// for me." Nur types a command; Claude runs a tool-use loop: it READS live data
// and EXECUTES actions inside the platform (create/assign tasks, add records,
// trigger grant prepares, draft+queue gated emails/thank-yous). Reads run
// directly; mutations that touch money/PII/outbound are GATED into the approvals
// queue (manage-by-exception). Safe populates run with an inline "done". The
// agent then replies in plain human language (via humanize) stating exactly what
// it did, plus an affordance to open the relevant screen/record.
//
// This REPLACES the old nav-card behavior: Smart Mode now DOES, it no longer
// just returns "Open <screen>" cards.
import { NextRequest, NextResponse } from "next/server";
import { admin, money } from "../../../lib/supabase-admin";
import { now } from "../../../lib/now";
import { humanize, withHumanSystem } from "../../../lib/humanize";
import { SMART_TOOLS, runSmartTool, isReadTool, type ToolResult } from "../../../lib/smart-tools";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-5";
const KEY = () => process.env.ANTHROPIC_API_KEY || "";

async function callClaude(system: string, messages: any[]) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY(), "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 1400, system, tools: SMART_TOOLS, messages }),
    cache: "no-store",
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || "Claude failed");
  return j;
}

export async function POST(req: NextRequest) {
  try {
    const { messages, command } = await req.json();
    const db = admin();
    const text = command || messages?.[messages.length - 1]?.content || "";

    // a small live snapshot so the agent has the lay of the land without a tool call
    const [{ count: pending }, { count: newMsgs }, { count: openTasks }] = await Promise.all([
      db.from("approvals").select("id", { count: "exact", head: true }).eq("status", "pending"),
      db.from("messages").select("id", { count: "exact", head: true }).eq("direction", "in").eq("status", "new").eq("sender_type", "individual"),
      db.from("tasks").select("id", { count: "exact", head: true }).neq("status", "done"),
    ]);

    const n = await now();
    const system = withHumanSystem(`You are Sasa, the operations agent inside Nur's private Nisria command center (By Nisria Inc, a US nonprofit helping children and families in Kenya; sister brands Maisha and AHADI). Nur talks to you to RUN the portal. The current date is ${n.long}.

You are not a chatbot that suggests screens. You ACT. When Nur asks for something, USE A TOOL to actually do it inside the platform, then tell her plainly what you did. Prefer doing over asking: if a safe action is clearly intended, just do it.

How tools work, two tiers:
- READ tools (donations, donors, finance, grants, tasks, inbox, team) run instantly. Use them to answer with real numbers and to resolve who/what an action targets (e.g. look up the newest donor before assigning a task about them).
- ACTION tools change the platform. Safe populates (create_task, add_team_member, add_inventory_item, add_beneficiary, prepare_grants) run immediately. GATED sends (draft_thank_you, draft_email) NEVER send to a real person; they queue a draft into Needs You for Nur to approve. Always tell her something was QUEUED for approval, never that it was sent.

Rules:
- Chain tools when needed: e.g. "assign a task to call our newest donor" → newest_donor, then create_task with that donor's name in the title.
- Never claim you sent an email or moved money. Outbound and money always go to the approvals queue first.
- After acting, give ONE short, warm, concrete sentence about what you did. Do not list tool names. Do not reveal you are an AI.

Right now: ${pending || 0} items waiting in Needs You, ${newMsgs || 0} messages need a reply, ${openTasks || 0} open tasks.`);

    let convo: any[] = (messages || []).slice(-8).map((m: any) => ({ role: m.role, content: typeof m.content === "string" ? m.content : String(m.content || "") }));
    if (command && (!convo.length || convo[convo.length - 1]?.content !== command)) {
      convo.push({ role: "user", content: command });
    }

    // accumulate what actually happened so the console can render affordances +
    // so we have a deterministic fallback reply even if the model goes quiet.
    const actions: ToolResult[] = [];

    for (let i = 0; i < 6; i++) {
      const resp = await callClaude(system, convo);
      if (resp.stop_reason !== "tool_use") {
        const modelText = (resp.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
        const reply = humanize(modelText || fallbackReply(actions), { now: { long: n.long, today: n.today } });
        return NextResponse.json({ reply, actions: serialize(actions) });
      }
      convo.push({ role: "assistant", content: resp.content });
      const results = [];
      for (const block of resp.content) {
        if (block.type === "tool_use") {
          const out = await runSmartTool(block.name, block.input || {});
          if (!isReadTool(block.name)) actions.push(out as ToolResult);
          results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out) });
        }
      }
      convo.push({ role: "user", content: results });
    }
    // ran out of loop budget — still report whatever we did
    return NextResponse.json({ reply: humanize(fallbackReply(actions) || "That took a few steps. Tell me the next thing.", { now: { long: n.long, today: n.today } }), actions: serialize(actions) });
  } catch (e: any) {
    return NextResponse.json({ reply: `Something went wrong: ${e?.message || "Smart Mode error"}`, actions: [] }, { status: 200 });
  }
}

// Build a plain reply from the actions taken, used if the model returns no text.
function fallbackReply(actions: ToolResult[]): string {
  const done = actions.filter((a) => a.ok);
  if (!done.length) return actions[0]?.summary || "Done.";
  return done.map((a) => a.summary).join(" ");
}

// Hand only the console-relevant bits to the client (summary + affordance).
function serialize(actions: ToolResult[]) {
  return actions.filter((a) => a.affordance).map((a) => ({ ok: a.ok, summary: a.summary, affordance: a.affordance }));
}
