import Link from "next/link";
import { notFound } from "next/navigation";
import Shell from "../../../../components/Shell";
import ConfirmButton from "../../../../components/ConfirmButton";
import { admin } from "../../../../lib/supabase-admin";
import { updateDonor, archiveDonor } from "../../actions";

export const dynamic = "force-dynamic";

// Owner CRUD (KT #122): the founder edits a donor's profile fields on the portal, not only via
// the bot. Follows the addItem/updateItem server-action form pattern already in this codebase
// (no client state, just a form + server action). Archive is non-destructive: see actions.ts
// for why it maps to the existing status="lapsed" value (donors are never hard-deleted).
export default async function EditDonor({ params }: { params: { id: string } }) {
  const db = admin();
  const { data: d } = await db.from("donors").select("*").eq("id", params.id).single();
  if (!d) notFound();

  return (
    <Shell
      title={`Edit ${d.full_name || "donor"}`}
      sub={d.email || d.phone || "Donor"}
      action={<Link href={`/donors/${d.id}`} className="btn ghost sm">Cancel</Link>}
    >
      <form action={updateDonor} className="stack" style={{ gap: 16, maxWidth: 560 }}>
        <input type="hidden" name="id" value={d.id} />

        <div className="card card-pad stack" style={{ gap: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>Profile</div>
          <label className="stack" style={{ gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Name</span>
            <input name="full_name" defaultValue={d.full_name || ""} />
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Email</span>
            <input name="email" type="email" defaultValue={d.email || ""} />
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Phone</span>
            <input name="phone" defaultValue={d.phone || ""} />
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Status</span>
            <select name="status" defaultValue={d.status || "prospect"}>
              <option value="prospect">Prospect</option>
              <option value="active">Active</option>
              <option value="major">Major</option>
              <option value="lapsed">Lapsed</option>
            </select>
          </label>
        </div>

        <div className="between" style={{ marginTop: 4 }}>
          <ConfirmButton
            formAction={archiveDonor}
            className="btn ghost"
            confirm={`Archive ${d.full_name}? They'll be marked lapsed and kept on file with their full giving history, not deleted.`}
            style={{ color: "var(--danger)" }}
          >
            Archive donor
          </ConfirmButton>
          <div className="flex" style={{ gap: 8 }}>
            <Link href={`/donors/${d.id}`} className="btn ghost">Cancel</Link>
            <button type="submit" className="btn teal">Save changes</button>
          </div>
        </div>
      </form>
    </Shell>
  );
}
