import Link from "next/link";
import { notFound } from "next/navigation";
import Shell from "../../../../components/Shell";
import ConfirmButton from "../../../../components/ConfirmButton";
import { admin } from "../../../../lib/supabase-admin";
import { getCurrentUser } from "../../../../lib/auth";
import { updateItem, deleteItem } from "../../actions";

export const dynamic = "force-dynamic";

// Owner CRUD (KT #122): Nur edits any inventory field on the portal, not only via the bot. Text
// fields set/clear, measurements + every extra labelled attribute ride the links jsonb, cost/price
// are founder-only. Delete is a deliberate, confirmed remove. Follows the addItem server-action form
// pattern already in this module (no client state, just a form + server action).
const HIDE_LINK = new Set(["measurements", "description"]);

export default async function EditInventoryItem({ params }: { params: { id: string } }) {
  const db = admin();
  const { data: it } = await db.from("inventory").select("*").eq("id", params.id).single();
  if (!it) notFound();
  const user = getCurrentUser();
  const isFounder = user?.role === "founder";
  const links = (it.links || {}) as Record<string, any>;
  const extras = Object.entries(links).filter(([k, v]) => v != null && v !== "" && !HIDE_LINK.has(k));

  const Field = ({ label, name, defaultValue, type = "text", placeholder = "" }: { label: string; name: string; defaultValue?: any; type?: string; placeholder?: string }) => (
    <label className="stack" style={{ gap: 4 }}>
      <span className="muted" style={{ fontSize: 12 }}>{label}</span>
      <input name={name} defaultValue={defaultValue ?? ""} type={type} placeholder={placeholder} />
    </label>
  );

  return (
    <Shell
      title={`Edit ${it.name || "item"}`}
      sub={it.tracking_no || "Inventory"}
      action={<Link href={`/inventory/${it.id}`} className="btn ghost sm">Cancel</Link>}
    >
      <form action={updateItem} className="stack" style={{ gap: 16, maxWidth: 660 }}>
        <input type="hidden" name="id" value={it.id} />

        <div className="card card-pad stack" style={{ gap: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>Details</div>
          <Field label="Name" name="name" defaultValue={it.name} />
          <label className="stack" style={{ gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Type</span>
            <select name="item_type" defaultValue={it.item_type || ""}>
              <option value="">—</option>
              <option value="end_product">Finished piece</option>
              <option value="textile">Textile</option>
              <option value="supply">Supply</option>
            </select>
          </label>
          <Field label="Tracking # / Product ID" name="tracking_no" defaultValue={it.tracking_no} />
          <Field label="Collection" name="collection" defaultValue={it.collection} />
          <Field label="Category" name="category" defaultValue={it.category} />
          <Field label="Style" name="style" defaultValue={it.style} />
          <Field label="Artisan" name="maker" defaultValue={it.maker} />
          <Field label="Size" name="size" defaultValue={it.size} />
          <Field label="Storage" name="location" defaultValue={it.location} />
          <Field label="Quantity" name="quantity" type="number" defaultValue={it.quantity ?? 0} />
          <label className="stack" style={{ gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Stock status</span>
            <select name="status" defaultValue={it.status || "in_stock"}>
              <option value="in_stock">In stock</option>
              <option value="low">Low</option>
              <option value="out">Out</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          {it.item_type === "end_product" && (
            <label className="stack" style={{ gap: 4 }}>
              <span className="muted" style={{ fontSize: 12 }}>Lifecycle</span>
              <select name="lifecycle_state" defaultValue={it.lifecycle_state || ""}>
                <option value="">—</option>
                {["production", "in_stock", "reserved", "sold", "shipped", "in_transit", "delivered", "returned", "restock"].map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="card card-pad stack" style={{ gap: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>Measurements &amp; details</div>
          <Field label="Measurements" name="measurements" defaultValue={links.measurements} placeholder={'e.g. Shoulder 20", Chest 50"'} />
          {extras.map(([k, v]) => (
            <Field key={k} label={k} name={`attr__${k}`} defaultValue={String(v)} />
          ))}
          <div>
            <span className="muted" style={{ fontSize: 12 }}>Add a field</span>
            <div className="flex" style={{ gap: 8, marginTop: 4 }}>
              <input name="attr_new_label" placeholder="Label (e.g. Lining)" style={{ flex: 1 }} />
              <input name="attr_new_value" placeholder="Value" style={{ flex: 1 }} />
            </div>
          </div>
        </div>

        {isFounder && (
          <div className="card card-pad stack" style={{ gap: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>
              Cost &amp; price <span className="faint" style={{ fontWeight: 400 }}>· founder only</span>
            </div>
            <div className="flex" style={{ gap: 8 }}>
              <input name="unit_cost" type="number" step="0.01" min="0" placeholder="Cost" defaultValue={it.unit_cost ?? ""} style={{ flex: 2 }} />
              <select name="cost_currency" defaultValue={it.cost_currency || "KES"} style={{ flex: 1 }}>
                <option>KES</option><option>USD</option><option>AED</option>
              </select>
            </div>
            <div className="flex" style={{ gap: 8 }}>
              <input name="unit_price" type="number" step="0.01" min="0" placeholder="Price" defaultValue={it.unit_price ?? ""} style={{ flex: 2 }} />
              <select name="price_currency" defaultValue={it.price_currency || "USD"} style={{ flex: 1 }}>
                <option>USD</option><option>KES</option><option>AED</option>
              </select>
            </div>
            <div className="faint" style={{ fontSize: 11.5 }}>Currencies are never blended. Clear a box to remove the figure.</div>
          </div>
        )}

        <div className="between" style={{ marginTop: 4 }}>
          <ConfirmButton formAction={deleteItem} className="btn ghost" confirm={`Delete "${it.name}"? This cannot be undone.`} style={{ color: "var(--danger)" }}>
            Delete item
          </ConfirmButton>
          <div className="flex" style={{ gap: 8 }}>
            <Link href={`/inventory/${it.id}`} className="btn ghost">Cancel</Link>
            <button type="submit" className="btn teal">Save changes</button>
          </div>
        </div>
      </form>
    </Shell>
  );
}
