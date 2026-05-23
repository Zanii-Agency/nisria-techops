import Shell from "../../components/Shell";
import { Card, Table, Badge, Col, statusTone } from "../../components/ui";
import { admin, money, date } from "../../lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function Grants() {
  const db = admin();
  const { data } = await db.from("grant_applications").select("*").order("deadline", { ascending: true }).limit(300);
  const cols: Col<any>[] = [
    { key: "funder", label: "Funder", render: (r) => <span className="strong">{r.funder}</span> },
    { key: "program", label: "Program", render: (r) => r.program || "—" },
    { key: "amount_requested", label: "Ask", align: "right", render: (r) => money(r.amount_requested) },
    { key: "deadline", label: "Deadline", render: (r) => date(r.deadline) },
    { key: "status", label: "Status", render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
    { key: "amount_awarded", label: "Awarded", align: "right", render: (r) => (r.amount_awarded ? money(r.amount_awarded) : "—") },
  ];
  return (
    <Shell title="Grants" sub={`${data?.length || 0} applications · sorted by deadline`}>
      <Card title="Grant pipeline">
        <Table columns={cols} rows={data || []} empty="No grant applications yet. Feed from Harsh's engine / Granted MCP." />
      </Card>
    </Shell>
  );
}
