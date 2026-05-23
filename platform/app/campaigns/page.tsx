import Shell from "../../components/Shell";
import { Card, Meter, Badge, statusTone } from "../../components/ui";
import { admin, money, date } from "../../lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function Campaigns() {
  const db = admin();
  const { data } = await db.from("campaigns").select("*").order("starts_on", { ascending: false }).limit(200);
  return (
    <Shell title="Campaigns" sub={`${data?.length || 0} campaigns`}>
      <div className="grid cols-2">
        {(data || []).length === 0 && (
          <Card><div className="empty">No campaigns yet.</div></Card>
        )}
        {(data || []).map((c: any) => {
          const goal = Number(c.goal_amount || 0);
          const raised = Number(c.raised_amount || 0);
          const pct = goal > 0 ? (raised / goal) * 100 : 0;
          return (
            <div className="card card-pad" key={c.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="strong" style={{ fontSize: 15 }}>{c.name}</span>
                <Badge tone={statusTone(c.status)}>{c.status}</Badge>
              </div>
              <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 4 }}>
                {c.type} · {date(c.starts_on)}{c.ends_on ? ` → ${date(c.ends_on)}` : ""}
              </div>
              <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between" }}>
                <span className="strong">{money(raised)}</span>
                {goal > 0 && <span style={{ color: "var(--muted)" }}>of {money(goal)} · {Math.round(pct)}%</span>}
              </div>
              <Meter pct={pct} />
            </div>
          );
        })}
      </div>
    </Shell>
  );
}
