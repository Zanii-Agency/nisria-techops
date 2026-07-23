"use server";
import { admin } from "../../lib/supabase-admin";
import { sendEmail } from "../../lib/email";
import { parseAttachRefs, resolveAttachments } from "../../lib/email-attachments";
import { emit } from "../../lib/events";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const CHANNELS = new Set(["email", "whatsapp", "instagram", "facebook", "x", "linkedin"]);

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

  // Default to "failed" so an empty recipient/body never logs as a successful "replied".
  let status = "failed";
  if (to && body) {
    try {
      const { attachments } = await resolveAttachments(refs);
      await sendEmail(to, subject, body, { account, attachments });
      status = "replied";
    } catch (e: any) {
      status = "failed";
    }
  }

  // H-5: a donor/contact emailed with no matching contacts row (common for Givebutter donors
  // whose email isn't in contacts) used to log the message with contact_id=null, so it never
  // appeared in any thread and the send looked like it did nothing. Find-or-create a contact
  // by the email so the outbound row links to a visible thread.
  let resolvedContactId = contact_id;
  if (!resolvedContactId && to) {
    const { data: existing } = await admin().from("contacts").select("id").ilike("email", to).limit(1);
    if (existing && existing[0]) resolvedContactId = existing[0].id;
    else {
      const { data: created } = await admin().from("contacts").insert({ name: to.split("@")[0] || to, email: to, channel: "email" }).select("id").single();
      resolvedContactId = created?.id || null;
    }
  }

  await admin()
    .from("messages")
    .insert({ contact_id: resolvedContactId, channel: "email", direction: "out", subject, body, handled_by: "nur", status, account });

  await emit({
    type: "action.executed",
    source: "connector:email",
    actor: "nur",
    subject_type: "contact",
    subject_id: resolvedContactId,
    payload: { action: "send_email", to, subject },
  });

  // refresh the LIST pages AND the detail pages — the composer lives on the 360,
  // so without revalidating the detail route the sent message never appears and it
  // looks like nothing happened.
  revalidatePath("/contacts");
  revalidatePath("/donors");
  revalidatePath("/contacts/[id]", "page");
  revalidatePath("/donors/[id]", "page");
}

// MANUAL EDIT (2026-07-23). Owner data is forever the owner's to edit (KT #122): Nur corrects a
// contact's name, email, phone or channel on the portal, not only via the bot. Text fields
// set/clear; channel is validated against the same options the list filter offers.
export async function updateContact(fd: FormData) {
  const id = String(fd.get("id") || "").trim();
  if (!id) return;
  const db = admin();
  const { data: cur } = await db.from("contacts").select("id,name").eq("id", id).single();
  if (!cur) return;

  const str = (k: string) => String(fd.get(k) ?? "").trim();
  const patch: Record<string, any> = {
    name: str("name") || cur.name || null,
    email: str("email") || null,
    phone: str("phone") || null,
  };
  const ch = str("channel");
  patch.channel = CHANNELS.has(ch) ? ch : null;

  const { error } = await db.from("contacts").update(patch).eq("id", id);
  if (error) {
    await emit({ type: "contact.edit_failed", source: "contacts", actor: "Nur", subject_type: "contact", subject_id: id, payload: { error: error.message } });
    return;
  }
  await emit({ type: "contact.edited", source: "contacts", actor: "Nur", subject_type: "contact", subject_id: id, payload: { name: patch.name } });
  revalidatePath(`/contacts/${id}`);
  revalidatePath("/contacts");
  redirect(`/contacts/${id}`);
}

// DELETE (owner CRUD). Contacts are safe to hard-delete: messages.contact_id is ON DELETE SET
// NULL, so removing a contact never breaks a message thread's history, it just unlinks it.
export async function deleteContact(fd: FormData) {
  const id = String(fd.get("id") || "").trim();
  if (!id) return;
  const db = admin();
  const { data: cur } = await db.from("contacts").select("id,name").eq("id", id).single();
  if (!cur) redirect("/contacts");
  const { error } = await db.from("contacts").delete().eq("id", id);
  if (error) {
    await emit({ type: "contact.delete_failed", source: "contacts", actor: "Nur", subject_type: "contact", subject_id: id, payload: { error: error.message } });
    return;
  }
  await emit({ type: "contact.deleted", source: "contacts", actor: "Nur", subject_type: "contact", payload: { name: cur?.name } });
  revalidatePath("/contacts");
  redirect("/contacts");
}
