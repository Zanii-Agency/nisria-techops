import Shell from "../../components/Shell";
import { Card, Table, Badge, Col, statusTone } from "../../components/ui";
import { admin, date } from "../../lib/supabase-admin";
import FilterBar, { FilterField, Segment } from "../../components/FilterBar";

export const dynamic = "force-dynamic";

function qs(current: Record<string, string>, patch: Record<string, string | undefined>) {
  const next: Record<string, string> = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === "") delete next[k];
    else next[k] = v;
  }
  const s = new URLSearchParams(next).toString();
  return s ? `/contacts?${s}` : "/contacts";
}

const CHANNEL_OPTS = ["email", "whatsapp", "instagram", "facebook", "x", "linkedin"];

export default async function Contacts({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const sp = searchParams || {};
  const one = (k: string) => (Array.isArray(sp[k]) ? (sp[k] as string[])[0] : (sp[k] as string | undefined)) || "";
  const q = one("q").trim();
  const channel = one("channel");

  const active: Record<string, string> = {};
  if (q) active.q = q;
  if (channel) active.channel = channel;

  const db = admin();
  const { data } = await db
    .from("contacts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  let rows = (data || []) as any[];
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter(
      (r: any) =>
        (r.name || "").toLowerCase().includes(needle) ||
        (r.email || "").toLowerCase().includes(needle) ||
        (r.phone || "").includes(needle) ||
        (r.org || "").toLowerCase().includes(needle),
    );
  }
  if (channel) rows = rows.filter((r: any) => (r.channel || "").toLowerCase() === channel);

  const isFiltered = !!(q || channel);

  const cols: Col<any>[] = [
    {
      key: "name",
      label: "Name",
      render: (r: any) => <a href={`/contacts/${r.id}`} style={{ fontWeight: 600, color: "var(--teal-700)", textDecoration: "none" }}>{r.name || (r.email || "Unknown").split("@")[0]}</a>,
    },
    { key: "email", label: "Email", render: (r: any) => r.email || <span className="faint">-</span> },
    { key: "phone", label: "Phone", render: (r: any) => r.phone || <span className="faint">-</span> },
    { key: "org", label: "Organisation", render: (r: any) => r.org || r.organization || r.company || <span className="faint">-</span> },
    {
      key: "channel",
      label: "Channel",
      render: (r: any) => r.channel ? <Badge tone="gray">{r.channel}</Badge> : <span className="faint">-</span>,
    },
    {
      key: "status",
      label: "Status",
      render: (r: any) => r.status ? <Badge tone={statusTone(r.status)}>{r.status}</Badge> : <span className="faint">-</span>,
    },
    { key: "created_at", label: "Added", render: (r: any) => date(r.created_at) },
  ];

  const sub = `${rows.length} ${rows.length === 1 ? "contact" : "contacts"} · the CRM`;

  const filterFields: FilterField[] = [
    { key: "channel", label: "Channel", type: "select", options: CHANNEL_OPTS.map((s) => ({ v: s, label: s })) },
  ];
  const filterValues: Record<string, string> = { q, channel };

  return (
    <Shell title="Contacts" sub={sub}>
      <FilterBar
        basePath="/contacts"
        fields={filterFields}
        values={filterValues}
        segments={[]}
        sort=""
        sortOptions={[]}
        count={rows.length}
        searchKey="q"
        searchPlaceholder="Search name, email, phone or org..."
      />

      <Card title="All contacts" scroll>
        {rows.length === 0 ? (
          <div className="empty">
            {isFiltered ? "No contacts match these filters." : "No contacts yet. They'll appear as people email or message the portal."}
          </div>
        ) : (
          <Table columns={cols} rows={rows} />
        )}
      </Card>
    </Shell>
  );
}
