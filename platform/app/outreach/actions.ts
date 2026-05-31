"use server";

import { getOrgContext } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { createBrainStore } from "@/lib/brain-store";
import { renderEmail } from "@/lib/email-render";

export type Audience = "all" | "donors" | "contacts";

export type RecipientCounts = { donors: number; contacts: number };

type Recipient = { email: string; name: string };

type SendResult = { ok: boolean; sent: number; failed: number; message: string };

function dedupe(list: Recipient[]): Recipient[] {
  const seen = new Set<string>();
  return list.filter((r) => {
    const key = (r.email || "").trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function gatherRecipients(audience: Audience): Promise<Recipient[]> {
  const store = createBrainStore();
  const out: Recipient[] = [];

  if (audience === "all" || audience === "donors") {
    const { data } = await store.client
      .from("donors")
      .select("name, email")
      .not("email", "is", null);
    if (data) out.push(...data.map((d: any) => ({ email: d.email, name: d.name || "" })));
  }

  if (audience === "all" || audience === "contacts") {
    const { data } = await store.client
      .from("contacts")
      .select("name, email")
      .not("email", "is", null);
    if (data) out.push(...data.map((c: any) => ({ email: c.email, name: c.name || "" })));
  }

  return dedupe(out);
}

/** Live recipient counts for the audience picker (deduped within each segment). */
export async function getRecipientCounts(): Promise<RecipientCounts> {
  const ctx = await getOrgContext();
  if (!ctx) return { donors: 0, contacts: 0 };

  const [donors, contacts] = await Promise.all([
    gatherRecipients("donors"),
    gatherRecipients("contacts"),
  ]);

  return { donors: donors.length, contacts: contacts.length };
}

/** Send a single test copy to the logged-in user's own inbox. */
export async function sendTest(
  _prev: SendResult | null,
  formData: FormData
): Promise<SendResult> {
  const ctx = await getOrgContext();
  if (!ctx) return { ok: false, sent: 0, failed: 0, message: "Not authenticated" };
  if (!ctx.userEmail) {
    return { ok: false, sent: 0, failed: 0, message: "No email on your account to test to" };
  }

  const subject = String(formData.get("subject") || "").trim();
  const body = String(formData.get("body") || "").trim();
  if (!subject || !body) {
    return { ok: false, sent: 0, failed: 0, message: "Add a subject and message first" };
  }

  try {
    const html = renderEmail({ orgName: ctx.orgName, body, recipientName: ctx.userName || "" });
    await sendEmail({ to: ctx.userEmail, subject: `[TEST] ${subject}`, html });
    return { ok: true, sent: 1, failed: 0, message: `Test sent to ${ctx.userEmail}` };
  } catch (e: any) {
    return { ok: false, sent: 0, failed: 1, message: e?.message || "Test send failed" };
  }
}

/** Mass send to the chosen audience (donors, contacts, or both). */
export async function sendOutreach(
  _prev: SendResult | null,
  formData: FormData
): Promise<SendResult> {
  const ctx = await getOrgContext();
  if (!ctx) return { ok: false, sent: 0, failed: 0, message: "Not authenticated" };

  const subject = String(formData.get("subject") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const audience = (String(formData.get("audience") || "all") as Audience);

  if (!subject || !body) {
    return { ok: false, sent: 0, failed: 0, message: "Subject and message are required" };
  }

  const recipients = await gatherRecipients(audience);
  if (recipients.length === 0) {
    return { ok: false, sent: 0, failed: 0, message: "No recipients found for this audience" };
  }

  let sent = 0;
  let failed = 0;

  for (const r of recipients) {
    try {
      const html = renderEmail({ orgName: ctx.orgName, body, recipientName: r.name });
      await sendEmail({ to: r.email, subject, html, replyTo: ctx.userEmail || undefined });
      sent++;
    } catch {
      failed++;
    }
  }

  const message =
    failed === 0
      ? `Delivered to ${sent} ${sent === 1 ? "recipient" : "recipients"}`
      : `Sent ${sent}, ${failed} failed`;

  return { ok: failed === 0, sent, failed, message };
}
