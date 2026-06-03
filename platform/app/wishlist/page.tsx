import Shell from "../../components/Shell";
import { Badge, Meter } from "../../components/ui";
import { Money } from "../../components/Money";
import { admin, date } from "../../lib/supabase-admin";
import DispatchBox from "../../components/DispatchBox";

export const dynamic = "force-dynamic";

// The wishlist: concrete needs a donor can fund. Managed here and by Sasa (the 727
// bot) via add_wishlist_item / fund_wishlist_item / list_wishlist. Grouped by how
// far each item is funded, open and partial first because those are the live asks.
const GROUPS: { key: string; label: string; sub: string }[] = [
  { key: "open", label: "Open needs", sub: "nothing funded yet" },
  { key: "partial", label: "Partially funded", sub: "some way there" },
  { key: "fulfilled", label: "Fulfilled", sub: "fully covered" },
];

export default async function Wishlist() {
  const db = admin();
  const { data } = await db
    .from("wishlist_items")
    .select("*")
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(300);
  const items = (data || []) as any[];

  const openCount = items.filter((i) => i.status === "open" || i.status === "partial").length;

  return (
    <Shell title="Wishlist" sub={`${openCount} open ${openCount === 1 ? "need" : "needs"} · add one by just telling Sasa`}>
      <DispatchBox />
      <div className="grid cols-3" style={{ marginTop: 16 }}>
        {GROUPS.map((g) => {
          const list = items.filter((i) => i.status === g.key);
          return (
            <div className="card" key={g.key}>
              <div className="card-h">{g.label}<Badge>{list.length}</Badge></div>
              <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {list.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>{g.sub}. Nothing here.</div>}
                {list.map((i) => {
                  const need = i.qty_needed || 1;
                  const funded = i.qty_funded || 0;
                  const pct = Math.round((funded / need) * 100);
                  return (
                    <div key={i.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                      <div className="between">
                        <span className="strong" style={{ fontSize: 13.5 }}>{i.title}</span>
                        {i.category && <Badge tone="blue">{i.category}</Badge>}
                      </div>
                      {i.description && <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{i.description}</div>}
                      <div style={{ marginTop: 10 }}>
                        <Meter pct={pct} />
                        <div className="between" style={{ marginTop: 6 }}>
                          <span className="muted" style={{ fontSize: 12 }}>
                            {funded} of {need} funded
                            {i.unit_cost != null ? <> · <Money amount={i.unit_cost} currency={i.currency} /> each</> : null}
                          </span>
                          <span className="muted" style={{ fontSize: 12 }}>{pct}%</span>
                        </div>
                      </div>
                      <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
                        added {date(i.created_at)}{i.created_by ? ` · ${i.created_by}` : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}
