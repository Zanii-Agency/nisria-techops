import Shell from "../../components/Shell";
import { Card, Table, Badge, Col, statusTone } from "../../components/ui";
import { admin, money, num } from "../../lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function Inventory() {
  const db = admin();
  const { data } = await db.from("inventory").select("*").order("name").limit(500);
  const cols: Col<any>[] = [
    { key: "sku", label: "SKU", render: (r) => <span className="strong">{r.sku || "—"}</span> },
    { key: "name", label: "Product" },
    { key: "collection", label: "Collection", render: (r) => r.collection || "—" },
    { key: "quantity", label: "Qty", align: "right", render: (r) => num(r.quantity) },
    { key: "unit_price", label: "Price", align: "right", render: (r) => money(r.unit_price) },
    { key: "status", label: "Status", render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
    { key: "folklore_listed", label: "Folklore", render: (r) => (r.folklore_listed ? <Badge tone="green">listed</Badge> : <Badge>not listed</Badge>) },
  ];
  return (
    <Shell title="Inventory" sub={`${data?.length || 0} items · The Folklore`}>
      <Card title="Stock">
        <Table columns={cols} rows={data || []} empty="No inventory yet." />
      </Card>
    </Shell>
  );
}
