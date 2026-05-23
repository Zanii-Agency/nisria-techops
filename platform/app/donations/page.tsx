import Shell from "../../components/Shell";
import { Card, Table, Badge, Col, statusTone } from "../../components/ui";
import { admin, money, date } from "../../lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function Donations() {
  const db = admin();
  const { data } = await db
    .from("donations")
    .select("*,donor:donors(full_name),campaign:campaigns(name)")
    .order("donated_at", { ascending: false })
    .limit(500);
  const cols: Col<any>[] = [
    { key: "donor", label: "Donor", render: (r) => <span className="strong">{r.donor?.full_name || "Anonymous"}</span> },
    { key: "campaign", label: "Campaign", render: (r) => r.campaign?.name || "—" },
    { key: "channel", label: "Channel" },
    { key: "is_recurring", label: "Recurring", render: (r) => (r.is_recurring ? <Badge tone="blue">monthly</Badge> : "—") },
    { key: "status", label: "Status", render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
    { key: "donated_at", label: "Date", render: (r) => date(r.donated_at) },
    { key: "amount", label: "Amount", align: "right", render: (r) => <span className="strong">{money(r.amount)}</span> },
  ];
  return (
    <Shell title="Donations" sub={`${data?.length || 0} gifts`}>
      <Card title="All donations">
        <Table columns={cols} rows={data || []} empty="No donations yet." />
      </Card>
    </Shell>
  );
}
