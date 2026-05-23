import Shell from "../../components/Shell";
import { Card, Table, Badge, Col, statusTone } from "../../components/ui";
import { admin, date } from "../../lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function Outreach() {
  const db = admin();
  const { data } = await db.from("outreach").select("*").order("next_action_on", { ascending: true }).limit(400);
  const cols: Col<any>[] = [
    { key: "org_name", label: "Organization", render: (r) => <span className="strong">{r.org_name}</span> },
    { key: "contact_name", label: "Contact", render: (r) => r.contact_name || "—" },
    { key: "type", label: "Type", render: (r) => <Badge>{r.type}</Badge> },
    { key: "stage", label: "Stage", render: (r) => <Badge tone={statusTone(r.stage)}>{r.stage}</Badge> },
    { key: "owner", label: "Owner", render: (r) => r.owner || "—" },
    { key: "next_action", label: "Next action", render: (r) => r.next_action || "—" },
    { key: "next_action_on", label: "Due", render: (r) => date(r.next_action_on) },
  ];
  return (
    <Shell title="Outreach" sub={`${data?.length || 0} prospects · CSR · influencer · partners`}>
      <Card title="Outreach pipeline">
        <Table columns={cols} rows={data || []} empty="No outreach logged yet." />
      </Card>
    </Shell>
  );
}
