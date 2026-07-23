import Link from "next/link";
import { notFound } from "next/navigation";
import Shell from "../../../../components/Shell";
import { admin, date } from "../../../../lib/supabase-admin";
import { getCurrentUser } from "../../../../lib/auth";
import { updateDonation } from "../../actions";

export const dynamic = "force-dynamic";

// Owner CRUD (KT #122): Nur corrects a donation's metadata on the portal, not only via the bot.
// Follows the same server-action-form pattern as /inventory/[id]/edit (no client state). Amount +
// currency are founder-only and only save as a pair (Currency law). No delete/archive control:
// see the comment on updateDonation in ../../actions.ts for why the schema does not support one.
const STATUS_OPTS = ["succeeded", "pending", "refunded", "failed"];
const CCY_OPTS = ["USD", "KES", "AED"];

function toDateInput(v: string | null | undefined) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export default async function EditDonation({ params }: { params: { id: string } }) {
  const db = admin();
  const { data: g } = await db
    .from("donations")
    .select("*,donor:donors(id,full_name),campaign:campaigns(id,name)")
    .eq("id", params.id)
    .single();
  if (!g) notFound();

  const { data: campaigns } = await db.from("campaigns").select("id,name").order("name");
  const user = getCurrentUser();
  const isFounder = user?.role === "founder";
  const donorName = g.donor?.full_name || "Anonymous";

  const Field = ({ label, name, defaultValue, type = "text", placeholder = "" }: { label: string; name: string; defaultValue?: any; type?: string; placeholder?: string }) => (
    <label className="stack" style={{ gap: 4 }}>
      <span className="muted" style={{ fontSize: 12 }}>{label}</span>
      <input name={name} defaultValue={defaultValue ?? ""} type={type} placeholder={placeholder} />
    </label>
  );

  return (
    <Shell
      title={`Edit gift · ${donorName}`}
      sub={`${date(g.donated_at)} · logged ${date(g.created_at)}`}
      action={<Link href="/donations" className="btn ghost sm">Cancel</Link>}
    >
      <form action={updateDonation} className="stack" style={{ gap: 16, maxWidth: 660 }}>
        <input type="hidden" name="id" value={g.id} />

        <div className="card card-pad stack" style={{ gap: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>Gift details</div>
          <label className="stack" style={{ gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Donor</span>
            <div style={{ padding: "8px 0" }}>{donorName}</div>
            <span className="faint" style={{ fontSize: 11.5 }}>Not editable here. Reassigning a gift to a different donor is a donor-record change, not a gift edit.</span>
          </label>
          <Field label="Channel" name="channel" defaultValue={g.channel} placeholder="givebutter" />
          <label className="stack" style={{ gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Campaign</span>
            <select name="campaign_id" defaultValue={g.campaign_id || ""}>
              <option value="">-</option>
              {(campaigns || []).map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="flex" style={{ gap: 8, alignItems: "center" }}>
            <input type="checkbox" name="is_recurring" defaultChecked={!!g.is_recurring} style={{ width: "auto" }} />
            <span className="muted" style={{ fontSize: 12 }}>Monthly recurring gift</span>
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Status</span>
            <select name="status" defaultValue={g.status || "succeeded"}>
              {STATUS_OPTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <Field label="Date" name="donated_at" type="date" defaultValue={toDateInput(g.donated_at)} />
          <Field label="External ID (Givebutter, etc)" name="external_id" defaultValue={g.external_id} />
        </div>

        {isFounder && (
          <div className="card card-pad stack" style={{ gap: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>
              Amount <span className="faint" style={{ fontWeight: 400 }}>· founder only</span>
            </div>
            <div className="flex" style={{ gap: 8 }}>
              <input name="amount" type="number" step="0.01" min="0" placeholder="Amount" defaultValue={g.amount ?? ""} style={{ flex: 2 }} />
              <select name="currency" defaultValue={g.currency || "USD"} style={{ flex: 1 }}>
                {CCY_OPTS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="faint" style={{ fontSize: 11.5 }}>Amount and currency always save together. Currencies are never blended.</div>
          </div>
        )}

        <div className="between" style={{ marginTop: 4 }}>
          <span className="faint" style={{ fontSize: 11.5, maxWidth: 320 }}>
            Gifts cannot be archived or deleted from here. This is a financial audit trail; correct the record instead of hiding it.
          </span>
          <div className="flex" style={{ gap: 8 }}>
            <Link href="/donations" className="btn ghost">Cancel</Link>
            <button type="submit" className="btn teal">Save changes</button>
          </div>
        </div>
      </form>
    </Shell>
  );
}
