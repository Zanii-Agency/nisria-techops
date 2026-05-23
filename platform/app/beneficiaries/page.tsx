import Shell from "../../components/Shell";
import { Card, Table, Badge, Col, statusTone } from "../../components/ui";
import { admin, money, date } from "../../lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function Beneficiaries() {
  const db = admin();
  const { data } = await db.from("beneficiaries").select("*").order("intake_date", { ascending: false }).limit(500);
  const cols: Col<any>[] = [
    { key: "ref_code", label: "Ref", render: (r) => <span className="strong">{r.ref_code || "—"}</span> },
    { key: "full_name", label: "Name" },
    { key: "location", label: "Location", render: (r) => r.location || "—" },
    { key: "category", label: "Category", render: (r) => (r.category ? <Badge>{r.category}</Badge> : "—") },
    { key: "status", label: "Status", render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
    { key: "consent_public", label: "Public", render: (r) => (r.consent_public ? <Badge tone="green">consented</Badge> : <Badge>private</Badge>) },
    { key: "funded", label: "Funded", align: "right", render: (r) => {
        const g = Number(r.goal_amount || 0); const f = Number(r.funded_amount || 0);
        return g > 0 ? <span>{money(f)} / {money(g)}</span> : "—";
      } },
  ];
  return (
    <Shell title="Beneficiaries" sub={`${data?.length || 0} records · PII, handle with care`}>
      <Card title="All beneficiaries" action={<Badge tone="gold">consent-gated for public</Badge>}>
        <Table columns={cols} rows={data || []} empty="No beneficiaries yet. They enter via the intake form." />
      </Card>
    </Shell>
  );
}
