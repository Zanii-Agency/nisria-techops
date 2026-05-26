"use client";

import { Badge } from "./ui";
import { useTabs } from "./tabs-context";
import { ExternalLink, Eye, Compass } from "lucide-react";

function money(v: any) {
  const n = Number(v);
  if (!isFinite(n) || !v) return null;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

// "View" on a grant-hunter opportunity opens its details in the centered focus
// sheet (minimizable to the tab strip, #40), instead of jumping straight to an
// external tab. The funder-portal link lives inside the sheet.
function OppBody({ o }: { o: any }) {
  const lo = money(o.amount_floor);
  const hi = money(o.amount_ceiling);
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="between" style={{ fontSize: 13, padding: "8px 0", borderTop: "1px solid var(--line)" }}>
      <span className="muted">{label}</span>
      <span style={{ textAlign: "right" }}>{children}</span>
    </div>
  );
  return (
    <>
      <div className="feature teal" style={{ marginBottom: 14 }}>
        <div className="ftitle" style={{ fontSize: 18, lineHeight: 1.3 }}>{o.title}</div>
        <div className="fmeta">
          {o.funder ? <>{o.funder} · </> : null}
          <Badge tone={o.relevance_tier === "HIGH" ? "green" : o.relevance_tier === "MEDIUM" ? "gold" : "gray"}>
            {(o.relevance_tier || "").toLowerCase()} · {Math.round((o.relevance_score || 0) * 100)}%
          </Badge>
        </div>
      </div>
      {o.summary && <div style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.6, marginBottom: 12 }}>{o.summary}</div>}
      <div>
        {(lo || hi) && <Row label="Amount">{lo || ""}{hi ? `–${hi}` : lo ? "+" : ""}</Row>}
        {o.close_date && <Row label="Deadline">{o.close_date}</Row>}
        {o.eligibility && <Row label="Eligibility">{o.eligibility}</Row>}
        {o.source && <Row label="Source">{o.source}</Row>}
      </div>
    </>
  );
}

export default function OpportunityView({ o }: { o: any }) {
  const { openSheet, closeSheet } = useTabs();
  const id = `opp:${o.id}`;
  function open() {
    openSheet({
      id,
      title: (o.title || o.funder || "Opportunity").slice(0, 28),
      icon: "award",
      width: 620,
      titleExtra: <span className="flex" style={{ gap: 6, color: "var(--muted)", fontSize: 12 }}><Compass size={13} /> Opportunity</span>,
      render: () => <OppBody o={o} />,
      footer: o.url ? (
        <a className="pill" href={o.url} target="_blank" rel="noreferrer" onClick={() => closeSheet(id)}>
          <ExternalLink size={12} /> Open funder portal
        </a>
      ) : undefined,
    });
  }
  return (
    <button type="button" className="pill" onClick={open}>
      <Eye size={12} /> View
    </button>
  );
}
