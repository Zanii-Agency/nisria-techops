import Link from "next/link";
import Shell from "../../components/Shell";
import { Badge } from "../../components/ui";
import { admin, date } from "../../lib/supabase-admin";
import { Money, MoneyHideToggle } from "../../components/Money";
import ExpenseIntake from "../../components/ExpenseIntake";
import { Film, FileText, Image as ImageIcon, FileType2, MessageSquare, Mic, ReceiptText, ArrowUpRight, AlertTriangle, CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

// YALLA KENYA — the film project's expense ledger. Every payment logged for the
// project books into `payments` with project='yalla', tagged with the kind of
// source it came from and when that proof was uploaded (evidence-binding:
// no receipt, no valid line). Money OUT only. Currency Law: KES and USD are
// summed and shown separately, never blended.

const SOURCE_META: Record<string, { label: string; icon: any }> = {
  pdf: { label: "PDF", icon: FileType2 },
  image: { label: "Photo", icon: ImageIcon },
  screenshot: { label: "Screenshot", icon: ImageIcon },
  receipt: { label: "Receipt", icon: ReceiptText },
  text: { label: "Typed", icon: MessageSquare },
  voice: { label: "Voice", icon: Mic },
  whatsapp: { label: "WhatsApp", icon: MessageSquare },
};

const fmtDateTime = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export default async function Yalla() {
  const db = admin();
  const { data: rows } = await db
    .from("payments")
    .select("id,payee,purpose,amount,currency,category,method,paid_at,status,source_type,source_uploaded_at,source_ref,screenshot_path,needs_review,confirmed_at")
    .eq("project", "yalla")
    .eq("direction", "out")
    .order("paid_at", { ascending: false })
    .limit(2000);

  const expenses = (rows || []) as any[];

  // Totals per currency (never blended). Only counts booked (paid) spend.
  const totals: Record<string, number> = {};
  const byCategory: Record<string, Record<string, number>> = {};
  for (const p of expenses) {
    if (p.status !== "paid") continue;
    const c = String(p.currency || "KES").toUpperCase();
    totals[c] = (totals[c] || 0) + Number(p.amount || 0);
    const cat = String(p.category || "other");
    (byCategory[cat] ||= {})[c] = (byCategory[cat]?.[c] || 0) + Number(p.amount || 0);
  }
  const currencies = Object.keys(totals).sort(); // KES before USD
  const reviewCount = expenses.filter((p) => p.needs_review && !p.confirmed_at).length;
  const catEntries = Object.entries(byCategory).sort(
    (a, b) => (b[1].KES || b[1].USD || 0) - (a[1].KES || a[1].USD || 0),
  );

  return (
    <Shell
      title="Yalla Kenya"
      sub="The film project's books. Every expense, with the receipt that proves it. Money out only."
      action={
        <Link className="btn ghost sm" href="/yalla/report">
          <FileText size={14} /> Generate report
        </Link>
      }
    >
      {/* RUNNING TOTAL — spent to date, per currency, never blended */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h">
          <span className="flex" style={{ gap: 7 }}><Film size={15} /> Spent on Yalla, to date</span>
          <span className="flex" style={{ gap: 10, alignItems: "center" }}>
            {reviewCount > 0 && <Badge tone="gold"><AlertTriangle size={11} /> {reviewCount} to confirm</Badge>}
            <MoneyHideToggle />
          </span>
        </div>
        <div className="card-pad">
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
            {currencies.length === 0 && (
              <div className="faint" style={{ fontSize: 13 }}>Nothing logged yet. Drop the first receipt below.</div>
            )}
            {currencies.map((c) => (
              <div key={c}>
                <div className="faint" style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Total spent ({c})</div>
                <div className="strong disp2" style={{ fontSize: 30, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                  <Money amount={Math.round(totals[c])} currency={c} />
                </div>
                <div className="faint" style={{ fontSize: 11.5, marginTop: 3 }}>{expenses.filter((p) => p.status === "paid" && String(p.currency || "KES").toUpperCase() === c).length} expenses</div>
              </div>
            ))}
          </div>
          {catEntries.length > 0 && (
            <div style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
              <div className="faint" style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>By category</div>
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
                {catEntries.map(([cat, amts]) => (
                  <div key={cat} className="flex" style={{ justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                    <span className="strong" style={{ textTransform: "capitalize" }}>{cat}</span>
                    <span className="stack" style={{ gap: 0, textAlign: "right" }}>
                      {Object.entries(amts).sort().map(([c, v]) => (
                        <Money key={c} amount={Math.round(v)} currency={c} className="strong" style={{ whiteSpace: "nowrap" }} />
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* THE LEDGER — every expense with its source + upload time */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h"><span className="flex" style={{ gap: 7 }}><ReceiptText size={15} /> Expenses</span><Badge tone="gray">{expenses.length}</Badge></div>
        {expenses.length === 0 ? (
          <div className="empty">No Yalla expenses yet. Use the intake below to log the first one from a receipt, PDF, screenshot or a typed note.</div>
        ) : (
          <div style={{ padding: "2px 0" }}>
            {expenses.map((p, i) => {
              const meta = SOURCE_META[String(p.source_type || "").toLowerCase()] || null;
              const SrcIcon = meta?.icon || ReceiptText;
              const uploaded = fmtDateTime(p.source_uploaded_at);
              const proof = p.source_ref || p.screenshot_path || null;
              const unconfirmed = p.needs_review && !p.confirmed_at;
              return (
                <div key={p.id} className="between" style={{ padding: "13px 22px", borderTop: i ? "1px solid var(--line)" : "none", boxShadow: unconfirmed ? "inset 3px 0 0 var(--warning)" : "none" }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="flex" style={{ gap: 9, flexWrap: "wrap", alignItems: "center" }}>
                      <span className="strong">{p.payee || "-"}</span>
                      {p.category && <Badge tone="gray">{String(p.category).charAt(0).toUpperCase() + String(p.category).slice(1)}</Badge>}
                      {meta && <Badge tone="teal"><SrcIcon size={11} /> {meta.label}</Badge>}
                      {unconfirmed
                        ? <Badge tone="gold"><AlertTriangle size={11} /> Needs confirm</Badge>
                        : proof
                          ? <Badge tone="green"><CheckCircle2 size={11} /> Proof on file</Badge>
                          : <Badge tone="gold">No proof</Badge>}
                    </div>
                    <div className="faint" style={{ fontSize: 11.5, marginTop: 3 }}>
                      {p.purpose ? `${p.purpose} · ` : ""}
                      {p.paid_at ? `spent ${date(p.paid_at)}` : "date unknown"}
                      {uploaded ? ` · uploaded ${uploaded}` : ""}
                      {proof ? (
                        <> · <a className="linkbtn" href={`/api/asset?path=${encodeURIComponent(proof)}`} title="Open the proof">view source <ArrowUpRight size={10} /></a></>
                      ) : null}
                    </div>
                  </div>
                  <Money amount={p.amount} currency={p.currency} className="strong" style={{ whiteSpace: "nowrap", flexShrink: 0 }} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* INTAKE — scoped to the Yalla project */}
      <ExpenseIntake
        project="yalla"
        title="Log a Yalla expense"
        blurb="Drop a receipt, PDF, screenshot or M-Pesa confirmation, or type it. Sasa reads it and shows a draft to confirm. It books against Yalla Kenya with its source and upload time recorded."
      />
    </Shell>
  );
}
