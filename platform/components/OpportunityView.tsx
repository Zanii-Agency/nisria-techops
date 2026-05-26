"use client";

import { Badge } from "./ui";
import { useTabs, type OpenSheet, type Sibling } from "./tabs-context";
import { ExternalLink, Eye, Compass } from "lucide-react";

function money(v: any) {
  const n = Number(v);
  if (!isFinite(n) || !v) return null;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

// "View" on a grant-hunter opportunity opens its details in the centered focus
// sheet (minimizable to the tab strip, #40), instead of jumping straight to an
// external tab. The funder-portal link lives inside the sheet.
// Decode the few HTML entities the grant feeds leave in titles/descriptions
// (e.g. &#8203; zero-width space, &amp;), so a card never shows "&#8203;" raw
// (#162). Pure string work, safe on the client.
function clean(s: any): string {
  return String(s || "")
    .replace(/&#8203;|&#x200b;/gi, "")
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function OppBody({ o }: { o: any }) {
  const lo = money(o.amount_floor);
  const hi = money(o.amount_ceiling);
  // the table column is `description` (not `summary`/`eligibility`) — #162. Fall
  // back across the real columns so the View tab is never blank.
  const title = clean(o.title) || clean(o.funder) || "Funding opportunity";
  const funder = clean(o.funder);
  const desc = clean(o.summary) || clean(o.description);
  const tier = (o.relevance_tier || "").toLowerCase();
  const closeDate = clean(o.close_date);
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="between" style={{ fontSize: 13, padding: "8px 0", borderTop: "1px solid var(--line)" }}>
      <span className="muted">{label}</span>
      <span style={{ textAlign: "right" }}>{children}</span>
    </div>
  );
  return (
    <>
      <div className="feature teal" style={{ marginBottom: 14 }}>
        <div className="ftitle" style={{ fontSize: 18, lineHeight: 1.3 }}>{title}</div>
        <div className="fmeta">
          {funder && funder !== title ? <>{funder} · </> : null}
          <Badge tone={o.relevance_tier === "HIGH" ? "green" : o.relevance_tier === "MEDIUM" ? "gold" : "gray"}>
            {tier || "scored"} · {Math.round((o.relevance_score || 0) * 100)}%
          </Badge>
        </div>
      </div>
      {desc
        ? <div style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.6, marginBottom: 12 }}>{desc}</div>
        : <div className="faint" style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 12 }}>No description was published with this listing. Open the funder portal below for the full details.</div>}
      <div>
        {(lo || hi) && <Row label="Amount">{lo || ""}{hi ? `–${hi}` : lo ? "+" : ""}</Row>}
        {closeDate && <Row label="Deadline">{closeDate}</Row>}
        {o.eligibility && <Row label="Eligibility">{clean(o.eligibility)}</Row>}
        {o.source && <Row label="Source">{o.source}</Row>}
        {o.countries && Array.isArray(o.countries) && o.countries.length > 0 && <Row label="Countries">{o.countries.join(", ")}</Row>}
      </div>
    </>
  );
}

// Build the Focus Tab payload for one opportunity — reused as opener AND sibling.
function buildOppSheet(o: any, closeSheet: (id: string) => void, siblings?: any[]): OpenSheet {
  const id = `opp:${o.id}`;
  const sibs: Sibling[] | undefined = siblings && siblings.length > 1
    ? siblings.map((s) => ({ id: `opp:${s.id}`, build: () => buildOppSheet(s, closeSheet, siblings) }))
    : undefined;
  return {
    id,
    title: (clean(o.title) || clean(o.funder) || "Opportunity").slice(0, 28),
    icon: "award",
    group: "opportunities",
    siblings: sibs,
    titleExtra: <span className="flex" style={{ gap: 6, color: "var(--muted)", fontSize: 12 }}><Compass size={13} /> Opportunity</span>,
    render: () => <OppBody o={o} />,
    footer: o.url ? (
      <a className="pill" href={o.url} target="_blank" rel="noreferrer" onClick={() => closeSheet(id)}>
        <ExternalLink size={12} /> Open funder portal
      </a>
    ) : undefined,
  };
}

export default function OpportunityView({ o, siblings }: { o: any; siblings?: any[] }) {
  const { openSheet, closeSheet } = useTabs();
  // "View" opens the opportunity in the canonical Focus Tab, with prev/next
  // arrows across the hunter's live opportunities (P1).
  function open() {
    openSheet(buildOppSheet(o, closeSheet, siblings));
  }
  return (
    <button type="button" className="pill" onClick={open}>
      <Eye size={12} /> View
    </button>
  );
}
