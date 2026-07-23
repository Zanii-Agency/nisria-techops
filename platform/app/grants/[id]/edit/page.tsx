import Link from "next/link";
import { notFound } from "next/navigation";
import Shell from "../../../../components/Shell";
import ConfirmButton from "../../../../components/ConfirmButton";
import { admin } from "../../../../lib/supabase-admin";
import { updateGrant, deleteGrant } from "../../actions";

export const dynamic = "force-dynamic";

// Owner CRUD (KT #122): Nur edits any grant application field on the portal, not only via the
// bot. Currency law: one currency select governs both amount_requested and amount_awarded (the
// table carries a single currency column, never blended per-field). Delete is a deliberate,
// confirmed hard remove (ENTITY POLICY: DELETE, no FK references grant_applications.id). Follows
// the addGrant server-action form pattern already in this module (no client state, form + action).
const STATUS_OPTS = ["researching", "drafting", "review", "submitted", "won", "lost", "rejected"];

export default async function EditGrant({ params }: { params: { id: string } }) {
  const db = admin();
  const { data: g } = await db.from("grant_applications").select("*").eq("id", params.id).single();
  if (!g) notFound();

  const Field = ({ label, name, defaultValue, type = "text", placeholder = "" }: { label: string; name: string; defaultValue?: any; type?: string; placeholder?: string }) => (
    <label className="stack" style={{ gap: 4 }}>
      <span className="muted" style={{ fontSize: 12 }}>{label}</span>
      <input name={name} defaultValue={defaultValue ?? ""} type={type} placeholder={placeholder} />
    </label>
  );

  return (
    <Shell
      title={`Edit ${g.funder || "grant"}`}
      sub={g.program || "Grant application"}
      action={<Link href="/grants" className="btn ghost sm">Cancel</Link>}
    >
      <form action={updateGrant} className="stack" style={{ gap: 16, maxWidth: 660 }}>
        <input type="hidden" name="id" value={g.id} />

        <div className="card card-pad stack" style={{ gap: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>Details</div>
          <Field label="Funder" name="funder" defaultValue={g.funder} />
          <Field label="Program" name="program" defaultValue={g.program} />
          <label className="stack" style={{ gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Stage</span>
            <select name="status" defaultValue={g.status || "researching"}>
              {STATUS_OPTS.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
              ))}
            </select>
          </label>
          <Field label="Funder link" name="link" defaultValue={g.link} type="url" placeholder="https://…" />
          <Field label="Deadline" name="deadline" defaultValue={g.deadline} type="date" />
        </div>

        <div className="card card-pad stack" style={{ gap: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>Funding</div>
          <div className="flex" style={{ gap: 8 }}>
            <Field label="Amount requested" name="amount_requested" type="number" defaultValue={g.amount_requested ?? ""} />
            <Field label="Amount awarded" name="amount_awarded" type="number" defaultValue={g.amount_awarded ?? ""} />
          </div>
          <label className="stack" style={{ gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Currency</span>
            <select name="currency" defaultValue={g.currency || "USD"}>
              <option>USD</option><option>KES</option><option>AED</option>
            </select>
          </label>
          <div className="faint" style={{ fontSize: 11.5 }}>One currency covers both figures for this grant. Currencies are never blended.</div>
          <div className="flex" style={{ gap: 8 }}>
            <Field label="Submitted on" name="submitted_on" type="date" defaultValue={g.submitted_on} />
            <Field label="Decision on" name="decision_on" type="date" defaultValue={g.decision_on} />
          </div>
        </div>

        <div className="card card-pad stack" style={{ gap: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>Prepared package / notes</div>
          <textarea name="notes" defaultValue={g.notes ?? ""} rows={10} placeholder="The prepared application package, or any notes." />
        </div>

        <div className="between" style={{ marginTop: 4 }}>
          <ConfirmButton formAction={deleteGrant} className="btn ghost" confirm={`Delete the ${g.funder || "grant"} application? This cannot be undone.`} style={{ color: "var(--danger)" }}>
            Delete grant
          </ConfirmButton>
          <div className="flex" style={{ gap: 8 }}>
            <Link href="/grants" className="btn ghost">Cancel</Link>
            <button type="submit" className="btn teal">Save changes</button>
          </div>
        </div>
      </form>
    </Shell>
  );
}
