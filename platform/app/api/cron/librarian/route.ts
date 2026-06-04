// THE LIBRARIAN (memory hygiene). Once a day the brain curates itself: it
// consolidates duplicate facts into one canonical row, flags genuine
// contradictions for human review (never auto-merges them), and (re)builds the
// entity graph linking facts to the people, orgs and accounts they are about.
// recall() only grounds in status='active' facts, so the moment the librarian
// supersedes or flags a row it stops shaping answers.
//
// Triggered by Vercel cron (GET, Authorization: Bearer CRON_SECRET). Also runnable
// manually with ?key=<CRON_SECRET|AGENT_TICK_SECRET|GROUP_BOT_SECRET>.
import { NextRequest, NextResponse } from "next/server";
import { runLibrarian } from "../../../../lib/librarian";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function authed(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") || "";
  const cron = process.env.CRON_SECRET, agent = process.env.AGENT_TICK_SECRET, group = process.env.GROUP_BOT_SECRET;
  const qs = new URL(req.url).searchParams.get("key");
  if (cron && auth === `Bearer ${cron}`) return true;
  if (agent && (req.headers.get("x-agent-secret") === agent || qs === agent)) return true;
  if (group && (req.headers.get("x-group-secret") === group || qs === group)) return true;
  return false;
}

async function run(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await runLibrarian();
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
