import Link from "next/link";
import { notFound } from "next/navigation";
import Shell from "../../../../components/Shell";
import ConfirmButton from "../../../../components/ConfirmButton";
import { admin } from "../../../../lib/supabase-admin";
import { updateContact, deleteContact } from "../../actions";

export const dynamic = "force-dynamic";

const CHANNEL_OPTS = ["email", "whatsapp", "instagram", "facebook", "x", "linkedin"];

// Owner CRUD (KT #122): Nur edits a contact's name, email, phone or channel on the portal, not
// only via the bot. Delete is a deliberate, confirmed hard-delete (contacts is safe to hard-delete,
// messages.contact_id is ON DELETE SET NULL so a thread's history survives, just unlinked). Follows
// the inventory edit-page pattern: a plain form + server action, no client state.
export default async function EditContact({ params }: { params: { id: string } }) {
  const db = admin();
  const { data: c } = await db.from("contacts").select("*").eq("id", params.id).single();
  if (!c) notFound();

  const Field = ({ label, name, defaultValue, type = "text", placeholder = "" }: { label: string; name: string; defaultValue?: any; type?: string; placeholder?: string }) => (
    <label className="stack" style={{ gap: 4 }}>
      <span className="muted" style={{ fontSize: 12 }}>{label}</span>
      <input name={name} defaultValue={defaultValue ?? ""} type={type} placeholder={placeholder} />
    </label>
  );

  return (
    <Shell
      title={`Edit ${c.name || "contact"}`}
      sub={c.email || c.phone || "Contact"}
      action={<Link href={`/contacts/${c.id}`} className="btn ghost sm">Cancel</Link>}
    >
      <form action={updateContact} className="stack" style={{ gap: 16, maxWidth: 560 }}>
        <input type="hidden" name="id" value={c.id} />

        <div className="card card-pad stack" style={{ gap: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>Details</div>
          <Field label="Name" name="name" defaultValue={c.name} />
          <Field label="Email" name="email" type="email" defaultValue={c.email} />
          <Field label="Phone" name="phone" defaultValue={c.phone} />
          <label className="stack" style={{ gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Channel</span>
            <select name="channel" defaultValue={c.channel || ""}>
              <option value="">—</option>
              {CHANNEL_OPTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="between" style={{ marginTop: 4 }}>
          <ConfirmButton
            formAction={deleteContact}
            className="btn ghost"
            confirm={`Delete "${c.name || c.email || "this contact"}"? This cannot be undone.`}
            style={{ color: "var(--danger)" }}
          >
            Delete contact
          </ConfirmButton>
          <div className="flex" style={{ gap: 8 }}>
            <Link href={`/contacts/${c.id}`} className="btn ghost">Cancel</Link>
            <button type="submit" className="btn teal">Save changes</button>
          </div>
        </div>
      </form>
    </Shell>
  );
}
