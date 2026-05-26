// Donor Steward agent. Writes a warm, personal thank-you for a recent gift,
// grounded in brand voice. Proposes only — the gateway gates the send.
import { claudeJSON } from "../anthropic";
import { humanize, withHumanSystem } from "../humanize";
import { now } from "../now";

export type ThankYou = { subject: string; body: string };

export async function draftThankYou(input: { name: string; amount: string; recurring: boolean; grounding: string }): Promise<ThankYou | null> {
  const n = await now();
  const system = withHumanSystem(`You are Nisria's Donor Steward, writing as a member of staff. Write a short, sincere, personal thank-you to a donor (2-4 sentences) in Nisria's voice. Warm, specific, never generic or guilt-trippy. Mention in general terms what their support makes possible (do NOT invent figures). If the gift is recurring/monthly, acknowledge the ongoing commitment. End simply. The current date is ${n.long}.

Brand voice + examples to match:
${input.grounding}`);
  const user = `Donor: ${input.name}
Gift: ${input.amount}${input.recurring ? " (monthly/recurring)" : " (one-time)"}

Return JSON: { "subject": "a warm subject line", "body": "the thank-you body" }`;
  const r = await claudeJSON<ThankYou>(system, user, 500);
  if (!r) return null;
  // THE GATE: human voice, no dashes, no placeholders.
  const opts = { now: { long: n.long, today: n.today } };
  return { subject: humanize(r.subject || "", opts), body: humanize(r.body || "", opts) };
}
