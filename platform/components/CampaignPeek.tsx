"use client";

import { useState } from "react";
import { Badge, Meter, statusTone } from "./ui";
import { X, Target, Calendar, Tag } from "lucide-react";

// Money + dates formatted client-side so the peek matches the cards without a
// round-trip. Keep these tiny and forgiving of nulls (mirrors DonorPeek).
function money(v: any) {
  const n = Number(v);
  if (!isFinite(n) || !v) return "$0";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function date(v: any) {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Clicking a campaign name opens a centered peek (same .peek-overlay pattern as
// DonorPeek / GrantPeek) — goal vs raised at a glance with the shared Meter.
// Raised + goal carry .money so the hide toggle blurs them like everywhere else.
// Donor/donation counts are only shown if the row already carries them.
export default function CampaignPeek({ campaign: c }: { campaign: any }) {
  const [open, setOpen] = useState(false);
  const goal = Number(c.goal_amount || 0);
  const raised = Number(c.raised_amount || 0);
  const pct = goal > 0 ? (raised / goal) * 100 : 0;
  const donorCount = c.donor_count ?? c.donors_count ?? null;
  const giftCount = c.donation_count ?? c.donations_count ?? null;

  const Row = ({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) => (
    <div className="between" style={{ fontSize: 13, padding: "7px 0", borderTop: "1px solid var(--line)" }}>
      <span className="muted flex" style={{ gap: 7 }}><Icon size={13} /> {label}</span>
      <span style={{ textAlign: "right" }}>{children}</span>
    </div>
  );

  return (
    <>
      <button type="button" className="linkbtn strong" onClick={() => setOpen(true)} title="Quick look" style={{ fontSize: 15 }}>
        {c.name}
      </button>

      {open && (
        <div className="peek-overlay" onClick={() => setOpen(false)}>
          <div className="peek-panel card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="between" style={{ marginBottom: 14 }}>
              <div className="flex" style={{ gap: 12 }}>
                <div className="avatar" style={{ width: 44, height: 44, fontSize: 17 }}>{(c.name || "C").charAt(0).toUpperCase()}</div>
                <div>
                  <h3 style={{ fontSize: 17, lineHeight: 1.1 }}>{c.name}</h3>
                  <div className="muted" style={{ fontSize: 12.5 }}>{c.type || "campaign"}{c.status ? <> · <Badge tone={statusTone(c.status)}>{c.status}</Badge></> : null}</div>
                </div>
              </div>
              <button type="button" className="expandbtn" onClick={() => setOpen(false)} title="Close"><X size={18} /></button>
            </div>

            <div className="feature teal" style={{ marginBottom: 14 }}>
              <div className="ftitle money" style={{ fontSize: 26 }}>{money(raised)}</div>
              <div className="fmeta">
                raised{goal > 0 ? <> · of {money(goal)} goal · {Math.round(pct)}%</> : null}
              </div>
              {goal > 0 && <div style={{ marginTop: 12 }}><Meter pct={pct} /></div>}
            </div>

            <div style={{ marginBottom: 16 }}>
              {goal > 0 && <Row icon={Target} label="Goal"><span className="money">{money(goal)}</span></Row>}
              <Row icon={Calendar} label="Starts">{date(c.starts_on)}</Row>
              {c.ends_on && <Row icon={Calendar} label="Ends">{date(c.ends_on)}</Row>}
              {c.type && <Row icon={Tag} label="Type">{c.type}</Row>}
              {donorCount !== null && <Row icon={Tag} label="Donors">{donorCount}</Row>}
              {giftCount !== null && <Row icon={Tag} label="Gifts">{giftCount}</Row>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
