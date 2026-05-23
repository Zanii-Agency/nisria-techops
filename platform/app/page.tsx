import Shell from "../components/Shell";
import { Stat, Card, Meter, Table, Badge, Col, statusTone } from "../components/ui";
import { admin, money, num, date } from "../lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const db = admin();

  const [{ data: don }, { data: donors }, { data: camps }, { data: bens }, { data: recent }, { data: grants }, { data: outreach }] =
    await Promise.all([
      db.from("donations").select("amount,donated_at,status,is_recurring,donor_id"),
      db.from("donors").select("id,status"),
      db.from("campaigns").select("id,name,goal_amount,raised_amount,status").eq("status", "live"),
      db.from("beneficiaries").select("id,status,consent_public"),
      db.from("donations").select("amount,donated_at,status,donor:donors(full_name),campaign:campaigns(name)").order("donated_at", { ascending: false }).limit(8),
      db.from("grant_applications").select("status,amount_requested"),
      db.from("outreach").select("stage"),
    ]);

  const succeeded = (don || []).filter((d: any) => d.status === "succeeded");
  const now = new Date();
  const mtd = succeeded.filter((d: any) => {
    const x = new Date(d.donated_at);
    return x.getMonth() === now.getMonth() && x.getFullYear() === now.getFullYear();
  });
  const raisedAll = succeeded.reduce((s: number, d: any) => s + Number(d.amount), 0);
  const raisedMtd = mtd.reduce((s: number, d: any) => s + Number(d.amount), 0);
  const recurringDonors = new Set(succeeded.filter((d: any) => d.is_recurring).map((d: any) => d.donor_id)).size;
  const activeBens = (bens || []).filter((b: any) => b.status === "active").length;
  const publicBens = (bens || []).filter((b: any) => b.consent_public && b.status === "active").length;
  const openGrants = (grants || []).filter((g: any) => ["researching", "drafting", "submitted"].includes(g.status)).length;
  const liveOutreach = (outreach || []).filter((o: any) => !["won", "lost"].includes(o.stage)).length;

  const recentCols: Col<any>[] = [
    { key: "donor", label: "Donor", render: (r) => <span className="strong">{r.donor?.full_name || "Anonymous"}</span> },
    { key: "campaign", label: "Campaign", render: (r) => r.campaign?.name || "—" },
    { key: "status", label: "Status", render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
    { key: "donated_at", label: "Date", render: (r) => date(r.donated_at) },
    { key: "amount", label: "Amount", align: "right", render: (r) => <span className="strong">{money(r.amount)}</span> },
  ];

  return (
    <Shell title="Dashboard" sub={`${date(now.toISOString())} · live from Supabase`}>
      <div className="grid cols-4">
        <Stat label="Raised this month" value={money(raisedMtd)} delta={`${money(raisedAll)} all-time`} />
        <Stat label="Donors" value={num(donors?.length || 0)} delta={`${recurringDonors} recurring`} />
        <Stat label="Beneficiaries supported" value={num(activeBens)} delta={`${publicBens} public profiles`} />
        <Stat label="Pipeline" value={`${openGrants} grants`} delta={`${liveOutreach} outreach open`} />
      </div>

      <div className="grid cols-2" style={{ marginTop: 14 }}>
        <Card title="Live campaigns">
          <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {(camps || []).length === 0 && <div style={{ color: "var(--faint)" }}>No live campaigns.</div>}
            {(camps || []).map((c: any) => {
              const goal = Number(c.goal_amount || 0);
              const raised = Number(c.raised_amount || 0);
              const pct = goal > 0 ? (raised / goal) * 100 : 0;
              return (
                <div key={c.id}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="strong">{c.name}</span>
                    <span style={{ color: "var(--muted)" }}>{money(raised)}{goal > 0 ? ` / ${money(goal)}` : ""}</span>
                  </div>
                  <Meter pct={pct} />
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="The funnel">
          <div className="card-pad" style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.7 }}>
            <div><b style={{ color: "var(--text)" }}>Social</b> → <b style={{ color: "var(--text)" }}>Website</b> → <b style={{ color: "var(--text)" }}>Donate</b></div>
            <p style={{ marginTop: 8 }}>
              Donation + donor numbers above are live. Traffic stages (social reach → site visits → conversion rate)
              light up here once <b>GA4 + Ad Grants + Meta</b> are connected.
            </p>
            <Badge tone="gold">Connect analytics to complete the funnel</Badge>
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 14 }}>
        <Card title="Recent donations">
          <Table columns={recentCols} rows={recent || []} empty="No donations yet." />
        </Card>
      </div>
    </Shell>
  );
}
