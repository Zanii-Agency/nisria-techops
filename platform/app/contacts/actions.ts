"use server";
import { admin } from "../../lib/supabase-admin";
import { sendEmail } from "../../lib/email";
import { parseAttachRefs, resolveAttachments } from "../../lib/email-attachments";
import { emit } from "../../lib/events";
import { revalidatePath } from "next/cache";

// Inline email sent by Nur straight from a contact / donor 360 profile.
// Resilient: we always log the outbound message even if the SMTP send fails,
// so the conversation thread stays a faithful record of what Nur tried to send.
// R2-5: appends the branded signature for the chosen sending account and
// includes any picked Studio / Library document as a real attachment.
export async function emailContact(fd: FormData) {
  const to = String(fd.get("to") || "");
  const subject = String(fd.get("subject") || "A note from Nisria");
  const body = String(fd.get("body") || "");
  const contact_id = String(fd.get("contact_id") || "") || null;
  const account = String(fd.get("account") || "") || "sasa@nisria.co";
  const refs = parseAttachRefs(fd.get("attach_refs") as string | null);

  let status = "replied";
  if (to && body) {
    try {
      const { attachments } = await resolveAttachments(refs);
      await sendEmail(to, subject, body, { account, attachments });
    } catch (e: any) {
      status = "failed";
    }
  }

  await admin()
    .from("messages")
    .insert({ contact_id, channel: "email", direction: "out", subject, body, handled_by: "nur", status, account });

  await emit({
    type: "action.executed",
    source: "connector:email",
    actor: "nur",
    subject_type: "contact",
    subject_id: contact_id,
    payload: { action: "send_email", to, subject },
  });

  revalidatePath("/contacts");
  revalidatePath("/donors");
}
