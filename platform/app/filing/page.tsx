import Shell from "../../components/Shell";
import { Card, Badge } from "../../components/ui";
import { admin } from "../../lib/supabase-admin";
import FileCard from "../../components/FileCard";
import { FolderOpen, Search, ChevronLeft, FileText } from "lucide-react";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  bank_statement: "Bank statements", invoice: "Invoices", receipt: "Receipts",
  contract: "Contracts", budget: "Budgets", expenses: "Expenses", registration: "Registration",
  policy: "Policies", grant: "Grants", report: "Reports", database: "Databases",
  spreadsheet: "Spreadsheets", presentation: "Decks", document: "Documents",
};

function qs(base: Record<string, string>, patch: Record<string, string | undefined>) {
  const next = { ...base };
  for (const [k, v] of Object.entries(patch)) { if (!v) delete next[k]; else next[k] = v; }
  const s = new URLSearchParams(next).toString();
  return s ? `/filing?${s}` : "/filing";
}

export default async function Filing({ searchParams }: { searchParams?: { [k: string]: string | string[] | undefined } }) {
  const sp = searchParams || {};
  const one = (k: string) => (Array.isArray(sp[k]) ? (sp[k] as string[])[0] : (sp[k] as string | undefined)) || "";
  const folder = one("folder"), q = one("q"), type = one("type");

  const db = admin();
  const { data } = await db.from("documents").select("*").order("modified_at", { ascending: false }).limit(2000);
  const docs = (data || []) as any[];

  // counts per category off the full set (for the folder cards)
  const counts: Record<string, number> = {};
  for (const d of docs) counts[d.folder || "General"] = (counts[d.folder || "General"] || 0) + 1;

  // ---- folder view: a card per Drive area ----
  if (!folder) {
    const cats = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    return (
      <Shell title="Filing" sub={`${docs.length} documents, filed from the Drive`}>
        {docs.length === 0 ? (
          <Card><div className="empty">No documents filed yet. They appear here as the Drive is extracted.</div></Card>
        ) : (
          <div className="grid cols-3">
            {cats.map((c) => (
              <a key={c} className="card hover card-pad" href={qs({}, { folder: c })} style={{ textDecoration: "none" }}>
                <div className="flex" style={{ gap: 11 }}>
                  <span className="aico teal" style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0 }}><FolderOpen size={19} /></span>
                  <div style={{ minWidth: 0 }}>
                    <div className="strong" style={{ fontSize: 15 }}>{c}</div>
                    <div className="faint" style={{ fontSize: 12 }}>{counts[c]} {counts[c] === 1 ? "document" : "documents"}</div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </Shell>
    );
  }

  // ---- file view for the chosen folder ----
  const inFolder = docs.filter((d) => (d.folder || "General") === folder);
  const types = [...new Set(inFolder.map((d) => d.doc_type).filter(Boolean))] as string[];
  let rows = inFolder;
  if (type) rows = rows.filter((d) => d.doc_type === type);
  if (q) rows = rows.filter((d) => (d.title || "").toLowerCase().includes(q.toLowerCase()));

  const base: Record<string, string> = { folder };
  if (type) base.type = type;
  if (q) base.q = q;

  return (
    <Shell title={folder} sub={`${rows.length} ${rows.length === 1 ? "document" : "documents"} · Filing`}>
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="stack" style={{ gap: 12 }}>
          <a className="pill" href="/filing" style={{ alignSelf: "flex-start" }}><ChevronLeft size={13} /> All folders</a>
          <form method="GET" action="/filing" className="flex" style={{ gap: 8 }}>
            <input type="hidden" name="folder" value={folder} />
            {type && <input type="hidden" name="type" value={type} />}
            <input name="q" defaultValue={q} placeholder="Search documents…" style={{ maxWidth: 320 }} />
            <button className="btn ghost sm" type="submit"><Search size={14} /> Search</button>
            {q && <a className="pill" href={qs(base, { q: undefined })}>Clear</a>}
          </form>
          {types.length > 1 && (
            <div className="flex wrap" style={{ gap: 6 }}>
              <span className="faint" style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", minWidth: 50 }}>Type</span>
              <a className={`pill ${!type ? "on" : ""}`} href={qs(base, { type: undefined })}>All</a>
              {types.map((t) => (
                <a key={t} className={`pill ${type === t ? "on" : ""}`} href={qs(base, { type: t })}>{TYPE_LABEL[t] || t}</a>
              ))}
            </div>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <Card><div className="empty"><FileText size={20} color="var(--faint)" /><div style={{ marginTop: 8 }}>No documents match.</div></div></Card>
      ) : (
        <div className="grid cols-3">
          {rows.map((d) => <FileCard key={d.id} doc={d} />)}
        </div>
      )}
    </Shell>
  );
}
