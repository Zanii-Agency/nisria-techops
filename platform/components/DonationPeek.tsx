"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, statusTone } from "./ui";
import Modal from "./Modal";
import { draftThankYouFor } from "../app/donations/actions";
import { ExternalLink, Heart, User, Tag, Calendar, Repeat } from "lucide-react";

// Money + dates formatted client-side so the peek matches the table without a
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

// Clicking a donation row opens a centered peek (via the shared Modal primitive) — the gift at a glance, with the donor's full 360°
// profile one click away. Amount carries .money so the hide toggle blurs it
// like everywhere else. The thank-you draft reuses the existing per-row action.
export default function DonationPeek({ donation: g }: { donation: any }) {
  const [open, setOpen] = useState(false);
  const donorName = g.donor?.full_name || "Anonymous";
  const recurring = !!g.is_recurring;
  const succeeded = (g.status || "").toLowerCase() === "succeeded";
  const hasEmail = !!g.donor?.email;
  const canThank = succeeded && hasEmail;

  const Row = ({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) => (
    <div className="between" style={{ fontSize: 13, padding: "7px 0", borderTop: "1px solid var(--line)" }}>
      <span className="muted flex" style={{ gap: 7 }}><Icon size={13} /> {label}</span>
      <span style={{ textAlign: "right" }}>{children}</span>
    </div>
  );

  return (
    <>
      <button type="button" className="linkbtn strong" onClick={() => setOpen(true)} title="Quick look">
        {donorName}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        width={460}
        title={
          <div className="flex" style={{ gap: 12 }}>
            <div className="avatar" style={{ width: 44, height: 44, fontSize: 17 }}>{donorName.charAt(0).toUpperCase()}</div>
            <div>
              <h3 style={{ fontSize: 17, lineHeight: 1.1 }}>{donorName}</h3>
              <div className="muted" style={{ fontSize: 12.5 }}>{recurring ? "monthly gift" : "one-off gift"}{g.channel ? ` · ${g.channel}` : ""}</div>
            </div>
          </div>
        }
        footer={
          (g.donor_id || canThank) ? (
            <>
              {g.donor_id && (
                <Link className="btn sm teal" href={`/donors/${g.donor_id}`} onClick={() => setOpen(false)}>
                  <ExternalLink size={13} /> Open donor profile
                </Link>
              )}
              {canThank && (
                <form action={draftThankYouFor}>
                  <input type="hidden" name="donation_id" value={g.id} />
                  <button className="btn sm ghost" type="submit"><Heart size={13} /> Draft thank-you</button>
                </form>
              )}
              {canThank && (
                <div className="faint" style={{ fontSize: 11.5, flexBasis: "100%" }}>
                  The thank-you drafts into Needs You. It only sends after you approve it.
                </div>
              )}
            </>
          ) : undefined
        }
      >
        <div className="feature teal" style={{ marginBottom: 14 }}>
          <div className="ftitle money" style={{ fontSize: 26 }}>{money(g.amount)}</div>
          <div className="fmeta">gift{g.status ? <> · <Badge tone={statusTone(g.status)}>{g.status}</Badge></> : null}</div>
        </div>

        <div>
          {g.donor_id ? (
            <Row icon={User} label="Donor">
              <Link className="linkbtn strong" href={`/donors/${g.donor_id}`} onClick={() => setOpen(false)}>{donorName}</Link>
            </Row>
          ) : (
            <Row icon={User} label="Donor">{donorName}</Row>
          )}
          <Row icon={Tag} label="Campaign">{g.campaign?.name || "—"}</Row>
          <Row icon={Calendar} label="Date">{date(g.donated_at)}</Row>
          <Row icon={Repeat} label="Recurring">{recurring ? <Badge tone="blue">monthly</Badge> : "one-off"}</Row>
        </div>
      </Modal>
    </>
  );
}
