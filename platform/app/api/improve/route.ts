// "Improve with AI": takes the current draft, returns a sharper version in Nisria's voice.
import { NextRequest, NextResponse } from "next/server";
import { claudeJSON } from "../../../lib/anthropic";
import { humanize, withHumanSystem } from "../../../lib/humanize";
import { now } from "../../../lib/now";
import { recall, groundingText } from "../../../lib/memory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { subject, body, to, context, instruction } = await req.json();
    const mem = await recall(`${subject} ${body}`.slice(0, 200), { kinds: ["approved_reply", "brand_voice"] });
    const n = await now();
    const system = withHumanSystem(`You improve a draft reply for Nisria (warm, sincere nonprofit helping children & families in Kenya), writing as a member of staff. Keep it concise, genuine, on-voice, with one clear next step. Do not invent figures or promises. The current date is ${n.long}. ${instruction ? "Extra instruction: " + instruction : ""}

Brand voice + examples:
${groundingText(mem)}`);
    const user = `Recipient: ${to || "the sender"}
Current subject: ${subject || ""}
Current draft:
"""
${body || ""}
"""
Return JSON: {"subject":"improved subject","body":"improved reply body"}`;
    const r = await claudeJSON<{ subject: string; body: string }>(system, user, 700);
    // THE GATE: no dashes, no placeholders, no raw merge token, real date.
    const opts = { now: { long: n.long, today: n.today } };
    if (r) return NextResponse.json({ subject: humanize(r.subject || "", opts), body: humanize(r.body || "", opts) });
    return NextResponse.json({ body, subject });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "improve failed" }, { status: 200 });
  }
}
