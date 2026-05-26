// Comms / Reply agent. Reads an inbound message, grounds itself in brand voice +
// past approved replies, drafts a response, and classifies how it should be
// handled (auto / approve / escalate). It never sends directly — it proposes.
import { claudeJSON, NO_DASHES, stripDashes } from "../anthropic";

export type CommsDraft = {
  category: "routine" | "donor" | "complaint" | "press" | "spam" | "no_reply" | "other";
  reply: string;
  subject: string;
  lane_hint: "auto" | "approve" | "escalate";
  confidence: number; // 0-1
  reasoning: string;
};

export async function draftReply(input: {
  channel: string;
  fromName: string;
  fromAddr?: string;
  subject?: string;
  body: string;
  grounding: string;
}): Promise<CommsDraft | null> {
  const system = `You are Nisria's Comms agent. Nisria (By Nisria Inc) is a nonprofit helping children and families in Kenya; sister brands are Maisha and AHADI. People email to donate, sponsor a child, volunteer, partner, or shop The Folklore.

Your job: read an inbound message and propose a reply in Nisria's voice. Be warm, concise (2-5 sentences), genuinely helpful, and guide to one clear next step. Never invent specific figures, amounts, or commitments. ${NO_DASHES}

FIRST decide if this message even needs a reply FROM US:
- "no_reply": automated notifications (Givebutter/Donorbox/Google/Railway/system alerts, receipts, "no-reply" senders), newsletters, marketing blasts, OR our OWN outgoing campaign emails. These need NO response — set category "no_reply", lane_hint "auto", and leave reply empty.
- "spam": junk. Same — no response.
Only if it is a REAL person genuinely asking something of Nisria, draft a reply and classify the lane:
- "auto": trivial/routine (simple thanks, FAQ) — safe to send without review.
- "approve": substantive, donor-facing, relationship-relevant — needs Nur's tap.
- "escalate": complaints, money/refunds, press/media, legal, sensitive — flag for Nur.

Ground your reply in this stored guidance (brand voice + past approved replies):
${input.grounding}`;

  const user = `Channel: ${input.channel}
From: ${input.fromName} <${input.fromAddr || ""}>
Subject: ${input.subject || "(none)"}
Message:
"""
${input.body.slice(0, 4000)}
"""

Return JSON: { "category": "...", "reply": "the reply body text", "subject": "Re: ... (a good subject line)", "lane_hint": "auto|approve|escalate", "confidence": 0.0-1.0, "reasoning": "one sentence" }`;

  const r = await claudeJSON<CommsDraft>(system, user, 900);
  if (!r) return null;
  // Strip any dashes the model still slipped into the user-facing copy.
  return { ...r, reply: stripDashes(r.reply || ""), subject: stripDashes(r.subject || "") };
}
