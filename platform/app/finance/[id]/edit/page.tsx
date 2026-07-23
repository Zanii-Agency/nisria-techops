import Link from "next/link";
import { notFound } from "next/navigation";
import Shell from "../../../../components/Shell";
import ConfirmButton from "../../../../components/ConfirmButton";
import { Badge } from "../../../../components/ui";
import { Money } from "../../../../components/Money";
import { admin, date } from "../../../../lib/supabase-admin";
import { updatePayment, archivePayment } from "../../actions";

export const dynamic = "force-dynamic";

// Owner CRUD for a single payment row (mirrors the inventory edit-page pattern:
// pre-filled server-action form, ConfirmButton for the destructive-equivalent
// control). Money rows are never hard-deleted, so this has no delete, only
// Archive (sets the existing status column to 'archived', see actions.ts).
// Status itself is read-only here: paid/scheduled/due/overdue are owned by
// markPaid on /finance, archived is owned by the Archive button below.
export default async function EditPayment({ params }: { params: { id: string } }) {
  const db = admin();
  const { data: p } = await db.from("payments").select("*").eq("id", params.id).single();
  if (!p) notFound();

  return (
    <Shell
      title={`Edit payment · ${p.payee || "—"}`}
      sub={<span className="flex" style={{ gap: 8, alignItems: "center" }}>
        <Money amount={p.amount} currency={p.currency} /> <Badge tone="gray">{p.status}</Badge>
      </span>}
      action={<Link href="/finance" className="btn ghost sm">Cancel</Link>}
    >
      <div className="stack" style={{ gap: 16, maxWidth: 560 }}>
        <form action={updatePayment} className="card card-pad stack" style={{ gap: 12 }}>
          <input type="hidden" name="id" value={p.id} />

          <label className="stack" style={{ gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Payee</span>
            <input name="payee" defaultValue={p.payee || ""} required />
          </label>

          <label className="stack" style={{ gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Purpose</span>
            <input name="purpose" defaultValue={p.purpose || ""} />
          </label>

          {/* Currency law: amount and currency are one pair, edited together. */}
          <div className="grid cols-2" style={{ gap: 12 }}>
            <label className="stack" style={{ gap: 4 }}>
              <span className="muted" style={{ fontSize: 12 }}>Amount</span>
              <input name="amount" type="number" min="0" step="0.01" defaultValue={p.amount ?? ""} required />
            </label>
            <label className="stack" style={{ gap: 4 }}>
              <span className="muted" style={{ fontSize: 12 }}>Currency</span>
              <select name="currency" defaultValue={p.currency || "USD"}>
                <option value="USD">USD</option>
                <option value="KES">KES</option>
              </select>
            </label>
          </div>

          <div className="grid cols-2" style={{ gap: 12 }}>
            <label className="stack" style={{ gap: 4 }}>
              <span className="muted" style={{ fontSize: 12 }}>Category</span>
              <select name="category" defaultValue={p.category || "other"}>
                <option value="subscription">Subscription</option>
                <option value="salary">Salary</option>
                <option value="vendor">Vendor</option>
                <option value="kenya">Kenya</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="stack" style={{ gap: 4 }}>
              <span className="muted" style={{ fontSize: 12 }}>Method</span>
              <select name="method" defaultValue={p.method || "bank"}>
                <option value="bank">Bank</option>
                <option value="card">Card</option>
                <option value="mpesa">M-Pesa</option>
              </select>
            </label>
          </div>

          <div className="grid cols-2" style={{ gap: 12 }}>
            <label className="stack" style={{ gap: 4 }}>
              <span className="muted" style={{ fontSize: 12 }}>Due date</span>
              <input name="due_on" type="date" defaultValue={p.due_on || ""} />
            </label>
            <label className="stack" style={{ gap: 4 }}>
              <span className="muted" style={{ fontSize: 12 }}>Repeats</span>
              <select name="recurrence" defaultValue={p.recurrence || "none"}>
                <option value="none">One-off</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </label>
          </div>

          <label className="stack" style={{ gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Vendor country (optional)</span>
            <input name="vendor_country" defaultValue={p.vendor_country || ""} placeholder="e.g. Kenya" />
          </label>

          <div className="faint" style={{ fontSize: 11 }}>
            {p.paid_at ? `Paid ${date(p.paid_at)}. ` : ""}Status is set by Mark paid / Archive, not by this form.
          </div>

          <div className="between" style={{ marginTop: 4 }}>
            <ConfirmButton
              formAction={archivePayment}
              className="btn ghost"
              confirm={`Archive the payment to "${p.payee || "—"}"? It stays in the audit trail but drops off Payables, Reminders and Paid history. Never deleted.`}
              style={{ color: "var(--danger)" }}
            >
              Archive
            </ConfirmButton>
            <div className="flex" style={{ gap: 8 }}>
              <Link href="/finance" className="btn ghost">Cancel</Link>
              <button type="submit" className="btn teal">Save changes</button>
            </div>
          </div>
        </form>
      </div>
    </Shell>
  );
}
