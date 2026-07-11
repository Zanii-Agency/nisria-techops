import Link from "next/link";
import Shell from "../../../components/Shell";
import { Badge } from "../../../components/ui";
import { admin, date } from "../../../lib/supabase-admin";
import { Money } from "../../../components/Money";
import PrintButton from "../../../components/PrintButton";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

// YALLA KENYA — investor expense report. A clean, printable statement of every
// expense booked against the film project, grouped by category, per currency
// (never blended, Currency Law). Each line names the source proof so the
// numbers are defensible.

export default async function YallaReport() {
  const db = admin();
  const { data: rows } = await db
    .from("payments")
    .select("id,payee,purpose,amount,currency,category,method,paid_at,status,source_type,source_uploaded_at,source_ref,screenshot_path")
    .eq("project", "yalla")
    .eq("direction", "out")
    .eq("status", "paid")
    .order("paid_at", { ascending: true })
    .limit(5000);

  const expenses = (rows || []) as any[];
  const totals: Record<string, number> = {};
  const byCat: Record<string, Record<string, number>> = {};
  for (const p of expenses) {
    const c = String(p.currency || "KES").toUpperCase();
    totals[c] = (totals[c] || 0) + Number(p.amount || 0);
    const cat = String(p.category || "other");
    (byCat[cat] ||= {})[c] = (byCat[cat]?.[c] || 0) + Number(p.amount || 0);
  }
  const currencies = Object.keys(totals).sort();
  const dates = expenses.map((p) => p.paid_at).filter(Boolean).sort();
  const period = dates.length
    ? `${date(dates[0])} to ${date(dates[dates.length - 1])}`
    : "no expenses yet";
  const withProof = expenses.filter((p) => p.source_ref || p.screenshot_path).length;

  return (
    <Shell
      title="Yalla Kenya: expense report"
      sub={`Every expense booked against the film project. Period: ${period}.`}
      action={
        <span className="flex" style={{ gap: 8 }}>
          <Link className="btn ghost sm" href="/yalla"><ArrowLeft size={14} /> Back</Link>
          <PrintButton />
        </span>
      }
    >
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-pad">
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
            {currencies.length === 0 && <div className="faint">No expenses booked yet.</div>}
            {currencies.map((c) => (
              <div key={c}>
                <div className="faint" style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Total spent ({c})</div>
                <div className="strong disp2" style={{ fontSize: 28, fontWeight: 800 }}><Money amount={Math.round(totals[c])} currency={c} /></div>
              </div>
            ))}
          </div>
          <div className="faint" style={{ fontSize: 12, marginTop: 12 }}>
            {expenses.length} expenses · {withProof} with a source document on file · totals kept per currency, never converted.
          </div>
        </div>
      </div>

      {/* Category subtotals */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h"><span>By category</span></div>
        <div style={{ padding: "2px 0" }}>
          {Object.entries(byCat).sort((a, b) => (b[1].KES || b[1].USD || 0) - (a[1].KES || a[1].USD || 0)).map(([cat, amts], i) => (
            <div key={cat} className="between" style={{ padding: "11px 22px", borderTop: i ? "1px solid var(--line)" : "none" }}>
              <span className="strong" style={{ textTransform: "capitalize" }}>{cat}</span>
              <span className="stack" style={{ gap: 0, textAlign: "right" }}>
                {Object.entries(amts).sort().map(([c, v]) => <Money key={c} amount={Math.round(v)} currency={c} className="strong" />)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Itemized ledger */}
      <div className="card">
        <div className="card-h"><span>Itemized expenses</span><Badge tone="gray">{expenses.length}</Badge></div>
        <div style={{ padding: "2px 0" }}>
          {expenses.map((p, i) => {
            const proof = p.source_ref || p.screenshot_path || null;
            return (
              <div key={p.id} className="between" style={{ padding: "11px 22px", borderTop: i ? "1px solid var(--line)" : "none" }}>
                <div style={{ minWidth: 0 }}>
                  <div className="strong">{p.payee || "-"}</div>
                  <div className="faint" style={{ fontSize: 11.5, marginTop: 2 }}>
                    {p.purpose ? `${p.purpose} · ` : ""}{p.paid_at ? date(p.paid_at) : "date unknown"}
                    {p.category ? ` · ${p.category}` : ""}
                    {proof ? " · source on file" : " · no source"}
                  </div>
                </div>
                <Money amount={p.amount} currency={p.currency} className="strong" style={{ whiteSpace: "nowrap", flexShrink: 0 }} />
              </div>
            );
          })}
        </div>
      </div>
    </Shell>
  );
}
