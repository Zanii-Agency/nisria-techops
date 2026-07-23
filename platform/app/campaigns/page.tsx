import Shell from "../../components/Shell";
import { Card, Meter, Badge, statusTone } from "../../components/ui";
import { Gauge } from "../../components/charts";
import { admin, date } from "../../lib/supabase-admin";
import { Money } from "../../components/Money";
import CampaignPeek from "../../components/CampaignPeek";
import CampaignEditor from "../../components/CampaignEditor";
import ConfirmButton from "../../components/ConfirmButton";
import { deleteCampaign } from "./actions";

export const dynamic = "force-dynamic";

export default async function Campaigns() {
  const db = admin();
  const { data } = await db.from("campaigns").select("*").order("starts_on", { ascending: false }).limit(200);

  const all = data || [];

  // The "active campaign" worth featuring: the live one pulling the most money.
  // Falls back to any active row, then to the most recent row, so the hero never
  // disappears when statuses are sparse.
  const isActive = (c: any) => ["active", "live"].includes((c.status || "").toLowerCase());
  const actives = all.filter(isActive);
  const ranked = [...(actives.length ? actives : all)].sort(
    (a, b) => Number(b.raised_amount || 0) - Number(a.raised_amount || 0)
  );
  const featured = ranked[0] || null;
  const rest = featured ? all.filter((c: any) => c.id !== featured.id) : all;

  const stats = (c: any) => {
    const goal = Number(c.goal_amount || 0);
    const raised = Number(c.raised_amount || 0);
    const pct = goal > 0 ? (raised / goal) * 100 : 0;
    return { goal, raised, pct };
  };

  return (
    <Shell title="Campaigns" sub={`${all.length} campaigns`} action={<CampaignEditor label="New campaign" />}>
      {all.length === 0 && (
        <Card><div className="empty">No campaigns yet. They'll appear here as Givebutter syncs in.</div></Card>
      )}

      {featured && (() => {
        const { goal, raised, pct } = stats(featured);
        return (
          <div className="feature teal" style={{ marginBottom: 18 }}>
            <div className="between" style={{ alignItems: "flex-start", gap: 18 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="flex" style={{ gap: 8, marginBottom: 10 }}>
                  <Badge tone={statusTone(featured.status)}>{featured.status}</Badge>
                  <span className="badge">Featured</span>
                </div>
                <CampaignPeek campaign={featured} />
                <div className="fmeta" style={{ marginTop: 6 }}>
                  {featured.type} · {date(featured.starts_on)}
                  {featured.ends_on ? ` → ${date(featured.ends_on)}` : ""}
                </div>
                <div style={{ marginTop: 16 }}>
                  <Money amount={raised} className="disp2" style={{ fontSize: 34 }} />
                  {goal > 0 && (
                    <span className="fmeta" style={{ marginLeft: 8 }}>
                      raised of <Money amount={goal} /> goal
                    </span>
                  )}
                </div>
                <div style={{ marginTop: 14, maxWidth: 420 }}><Meter pct={pct} /></div>
                <div className="flex" style={{ gap: 10, marginTop: 16 }}>
                  <CampaignEditor campaign={featured} label="Edit campaign" variant="pill" />
                  <form action={deleteCampaign}>
                    <input type="hidden" name="id" value={featured.id} />
                    <ConfirmButton
                      formAction={deleteCampaign}
                      className="pill"
                      style={{ color: "var(--danger)" }}
                      confirm={`Delete "${featured.name}"? This cannot be undone.`}
                    >
                      Delete
                    </ConfirmButton>
                  </form>
                </div>
              </div>
              {goal > 0 && (
                <div style={{ flexShrink: 0 }}>
                  <Gauge pct={pct} value={`${Math.round(pct)}%`} label="of goal" />
                </div>
              )}
            </div>
          </div>
        );
      })()}

      <div className="grid cols-3">
        {rest.map((c: any) => {
          const { goal, raised, pct } = stats(c);
          return (
            <div className="card card-pad" key={c.id}>
              <div className="between" style={{ alignItems: "flex-start", gap: 8 }}>
                <CampaignPeek campaign={c} />
                <Badge tone={statusTone(c.status)}>{c.status}</Badge>
              </div>
              <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 4 }}>
                {c.type} · {date(c.starts_on)}{c.ends_on ? ` → ${date(c.ends_on)}` : ""}
              </div>

              <div className="between" style={{ marginTop: 16, gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <Money amount={raised} className="disp2" style={{ fontSize: 22, display: "block" }} />
                  {goal > 0 && (
                    <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 2 }}>
                      of <Money amount={goal} /> · {Math.round(pct)}%
                    </div>
                  )}
                </div>
                {goal > 0 && (
                  <div style={{ flexShrink: 0 }}>
                    <Gauge pct={pct} value={`${Math.round(pct)}%`} label="of goal" />
                  </div>
                )}
              </div>

              {goal > 0 ? (
                <div style={{ marginTop: 12 }}><Meter pct={pct} /></div>
              ) : (
                <div style={{ color: "var(--faint)", fontSize: 12, marginTop: 12 }}>No goal set</div>
              )}

              <div className="flex" style={{ gap: 8, marginTop: 14 }}>
                <CampaignEditor campaign={c} label="Edit" variant="pill" />
                <form action={deleteCampaign}>
                  <input type="hidden" name="id" value={c.id} />
                  <ConfirmButton
                    formAction={deleteCampaign}
                    className="pill"
                    style={{ color: "var(--danger)" }}
                    confirm={`Delete "${c.name}"? This cannot be undone.`}
                  >
                    Delete
                  </ConfirmButton>
                </form>
              </div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}
