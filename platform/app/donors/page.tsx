import Shell from "../../components/Shell";
import { Card, Table, Badge, Col, statusTone } from "../../components/ui";
import { admin, date } from "../../lib/supabase-admin";
import { Money } from "../../components/Money";
import DonorPeek from "../../components/DonorPeek";
import { Search } from "lucide-react";

export const dynamic = "force-dynamic";

// Build a querystring for a filter/sort pill while preserving the other active
// params (so clicking a status pill keeps the current search + sort, etc.).
function qs(current: Record<string, string>, patch: Record<string, string | undefined>) {
  const next: Record<string, string> = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === "") delete next[k];
    else next[k] = v;
  }
  const s = new URLSearchParams(next).toString();
  return s ? `/donors?${s}` : "/donors";
}

const STATUS_OPTS = ["active", "recurring", "major", "prospect", "lapsed"];
const TYPE_OPTS = ["individual", "organization", "foundation"];
const SORT_OPTS: { v: string; label: string }[] = [
  { v: "recent", label: "Most recent gift" },
  { v: "lifetime", label: "Highest giving" },
  { v: "lifetime_asc", label: "Lowest giving" },
  { v: "name", label: "Name A–Z" },
];

// Saved views (segments). Each maps to a slice of the existing querystring
// filters. A segment is "active" when the current filters match its patch
// exactly (ignoring search + sort, which are orthogonal refinements).
const SEGMENTS: { label: string; patch: Record<string, string | undefined>; match: (f: { status: string; recurring: string }) => boolean }[] = [
  { label: "All donors", patch: { status: undefined, recurring: undefined }, match: (f) => !f.status && !f.recurring },
  { label: "Recurring", patch: { status: undefined, recurring: "yes" }, match: (f) => f.recurring === "yes" && !f.status },
  { label: "Major", patch: { status: "major", recurring: undefined }, match: (f) => f.status === "major" },
  { label: "Lapsed", patch: { status: "lapsed", recurring: undefined }, match: (f) => f.status === "lapsed" },
  { label: "Prospects", patch: { status: "prospect", recurring: undefined }, match: (f) => f.status === "prospect" },
];

export default async function Donors({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  // normalize incoming params
  const sp = searchParams || {};
  const one = (k: string) => (Array.isArray(sp[k]) ? (sp[k] as string[])[0] : (sp[k] as string | undefined)) || "";
  const q = one("q").trim();
  const status = one("status");
  const type = one("type");
  const recurring = one("recurring"); // yes | no | ""
  const sort = one("sort") || "recent"; // recent (default) | lifetime | name

  // querystring base (used to build pill links without losing other params)
  const active: Record<string, string> = {};
  if (q) active.q = q;
  if (status) active.status = status;
  if (type) active.type = type;
  if (recurring) active.recurring = recurring;
  if (sort && sort !== "recent") active.sort = sort;

  // DEFAULT sort is most-recent-gift first. We pull the full set ordered by the
  // primary sort at the DB, then apply in-memory filters (small dataset).
  const db = admin();
  const order =
    sort === "lifetime"
      ? { col: "lifetime_value", asc: false } // highest first
      : sort === "lifetime_asc"
      ? { col: "lifetime_value", asc: true } // lowest first
      : sort === "name"
      ? { col: "full_name", asc: true }
      : { col: "last_gift_at", asc: false };
  const { data } = await db
    .from("donors")
    .select("*")
    .order(order.col, { ascending: order.asc, nullsFirst: false })
    .limit(500);

  let rows = (data || []) as any[];
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter(
      (r: any) =>
        (r.full_name || "").toLowerCase().includes(needle) ||
        (r.email || "").toLowerCase().includes(needle),
    );
  }
  if (status) rows = rows.filter((r: any) => (r.status || "").toLowerCase() === status);
  if (type) rows = rows.filter((r: any) => (r.type || "").toLowerCase() === type);
  if (recurring === "yes")
    rows = rows.filter((r: any) => !!r.is_recurring || (r.status || "").toLowerCase() === "recurring");
  if (recurring === "no")
    rows = rows.filter((r: any) => !r.is_recurring && (r.status || "").toLowerCase() !== "recurring");

  const isFiltered = !!(q || status || type || recurring);

  const cols: Col<any>[] = [
    { key: "full_name", label: "Name", render: (r: any) => <DonorPeek donor={r} /> },
    { key: "email", label: "Email", render: (r: any) => r.email || "—" },
    { key: "type", label: "Type" },
    { key: "status", label: "Status", render: (r: any) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
    { key: "last_gift_at", label: "Last gift", render: (r: any) => date(r.last_gift_at) },
    { key: "lifetime_value", label: "Lifetime", align: "right", render: (r: any) => <Money className="strong" amount={r.lifetime_value} currency={r.currency} /> },
  ];

  // Group rows by status for the grouped table view. Status drives the group
  // header + its tone. Groups are ordered by the canonical STATUS_OPTS order,
  // with anything unknown (or blank) collected last under "other". Within each
  // group the rows keep the DB sort already applied above.
  const groupOrder = [...STATUS_OPTS, "other"];
  const groupsMap = new Map<string, any[]>();
  for (const r of rows) {
    const s = (r.status || "").toLowerCase();
    const key = STATUS_OPTS.includes(s) ? s : "other";
    if (!groupsMap.has(key)) groupsMap.set(key, []);
    groupsMap.get(key)!.push(r);
  }
  const groups = groupOrder
    .filter((k) => groupsMap.has(k))
    .map((k) => ({ key: k, rows: groupsMap.get(k)! }));

  const sub = `${rows.length} ${rows.length === 1 ? "record" : "records"} · the CRM`;

  return (
    <Shell title="Donors" sub={sub}>
      {/* saved-view segments */}
      <div className="flex wrap" style={{ gap: 8, marginBottom: 12 }}>
        {SEGMENTS.map((seg) => {
          const on = seg.match({ status, recurring }) && (seg.label === "All donors" ? !type : true);
          return (
            <a
              key={seg.label}
              className={`pill ${on ? "on" : ""}`}
              href={qs(active, { ...seg.patch, ...(seg.label === "All donors" ? { type: undefined } : {}) })}
              style={{ padding: "8px 15px", fontWeight: 600 }}
            >
              {seg.label}
            </a>
          );
        })}
      </div>

      {/* one consolidated filter omnibar */}
      <div
        className="card"
        style={{
          marginBottom: 16,
          padding: "10px 12px",
          borderRadius: 999,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        {/* search (GET form, preserves the other params via hidden inputs) */}
        <form method="GET" action="/donors" className="flex" style={{ gap: 8, alignItems: "center", flex: "1 1 280px", minWidth: 240 }}>
          <input type="hidden" name="status" value={status} />
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="recurring" value={recurring} />
          <input type="hidden" name="sort" value={sort} />
          <Search size={15} style={{ color: "var(--muted)", flexShrink: 0, marginLeft: 4 }} />
          <input
            id="donor-search"
            name="q"
            defaultValue={q}
            placeholder="Search name or email…"
            style={{ flex: 1, minWidth: 0, border: 0, background: "transparent", boxShadow: "none", padding: "6px 0" }}
          />
          <button className="btn ghost sm" type="submit">Search</button>
          {q && <a className="pill" href={qs(active, { q: undefined })}>Clear “{q}”</a>}
        </form>

        {/* divider */}
        <span style={{ width: 1, alignSelf: "stretch", background: "var(--line)", margin: "0 2px" }} aria-hidden />

        {/* consolidated filter chips (links keep the querystring behavior, no JS) */}
        <div className="flex wrap" style={{ gap: 6, alignItems: "center" }}>
          <FilterGroup
            active={active}
            param="status"
            current={status}
            allLabel="All status"
            options={STATUS_OPTS.map((s) => ({ v: s, label: s }))}
          />
          <FilterGroup
            active={active}
            param="type"
            current={type}
            allLabel="All types"
            options={TYPE_OPTS.map((t) => ({ v: t, label: t }))}
          />
          <FilterGroup
            active={active}
            param="recurring"
            current={recurring}
            allLabel="Any cadence"
            options={[
              { v: "yes", label: "Monthly" },
              { v: "no", label: "One-off" },
            ]}
          />
          <FilterGroup
            active={active}
            param="sort"
            current={sort === "recent" ? "" : sort}
            allLabel="Most recent gift"
            options={SORT_OPTS.filter((s) => s.v !== "recent")}
            clearValue={undefined}
          />
        </div>

        {isFiltered && (
          <a className="pill" href="/donors" style={{ marginLeft: "auto" }}>Reset all</a>
        )}
      </div>

      <Card title="All donors">
        {rows.length === 0 ? (
          <div className="empty">
            {isFiltered ? "No donors match these filters." : "No donors yet. They'll appear here as Givebutter syncs in."}
          </div>
        ) : (
          groups.map((g, i) => (
            <div key={g.key} style={{ marginTop: i === 0 ? 0 : 22 }}>
              <div
                className="flex"
                style={{ alignItems: "center", gap: 10, padding: "0 4px 8px" }}
              >
                <Badge tone={statusTone(g.key === "other" ? "" : g.key)}>{g.key}</Badge>
                <span className="faint" style={{ fontSize: 12, fontWeight: 600 }}>
                  {g.rows.length} {g.rows.length === 1 ? "donor" : "donors"}
                </span>
              </div>
              <Table columns={cols} rows={g.rows} />
            </div>
          ))
        )}
      </Card>
    </Shell>
  );
}

// One filter dimension rendered as a compact pill group inside the omnibar.
// Every option is a link that patches a single querystring param while
// preserving the rest (via qs(active, ...)), so the existing GET-based filter
// behavior is kept with zero client JS (this is a server component). The "all"
// pill clears the param. `clearValue` lets a param (sort) map its default to
// "remove the key" rather than an explicit value.
function FilterGroup({
  active,
  param,
  current,
  allLabel,
  options,
  clearValue,
}: {
  active: Record<string, string>;
  param: string;
  current: string;
  allLabel: string;
  options: { v: string; label: string }[];
  clearValue?: string;
}) {
  return (
    <span className="flex" style={{ gap: 5, alignItems: "center" }}>
      <a className={`pill ${!current ? "on" : ""}`} href={qs(active, { [param]: clearValue })}>
        {allLabel}
      </a>
      {options.map((o) => (
        <a key={o.v} className={`pill ${current === o.v ? "on" : ""}`} href={qs(active, { [param]: o.v })}>
          {o.label}
        </a>
      ))}
    </span>
  );
}
