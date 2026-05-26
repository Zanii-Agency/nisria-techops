"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, statusTone } from "./ui";
import Modal from "./Modal";
import { draftThankYouForDonor } from "../app/donations/actions";
import { ExternalLink, Heart, Mail, Phone, Globe, Tag } from "lucide-react";

// Money + dates formatted client-side so the peek matches the table without a
// round-trip. Keep these tiny and forgiving of nulls.
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

// Clicking a donor row opens a centered peek (same .peek-overlay pattern as
// ApprovalCard / GrantPeek) — the at-a-glance card with quick actions, with the
// full 360° profile one click away. Lifetime carries .money so the hide toggle
// blurs it like everywhere else.
export default function DonorPeek({ donor: d }: { donor: any }) {
  const [open, setOpen] = useState(false);
  const name = d.full_name || (d.email || "Unknown donor").split("@")[0];
  const tags: string[] = Array.isArray(d.tags) ? d.tags : [];
  const recurring = !!d.is_recurring || (d.status || "").toLowerCase() === "recurring";

  const Row = ({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) => (
    <div className="between" style={{ fontSize: 13, padding: "7px 0", borderTop: "1px solid var(--line)" }}>
      <span className="muted flex" style={{ gap: 7 }}><Icon size={13} /> {label}</span>
      <span style={{ textAlign: "right" }}>{children}</span>
    </div>
  );

  return (
    <>
      <button type="button" className="linkbtn strong" onClick={() => setOpen(true)} title="Quick look">
        {name}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        width={460}
        title={
          <div className="flex" style={{ gap: 12 }}>
            <div className="avatar" style={{ width: 44, height: 44, fontSize: 17 }}>{name.charAt(0).toUpperCase()}</div>
            <div>
              <h3 style={{ fontSize: 17, lineHeight: 1.1 }}>{name}</h3>
              <div className="muted" style={{ fontSize: 12.5 }}>{d.type || "individual"}{recurring ? " · monthly" : ""}</div>
            </div>
          </div>
        }
        footer={
          <>
            <Link className="btn sm teal" href={`/donors/${d.id}`} onClick={() => setOpen(false)}>
              <ExternalLink size={13} /> Open full profile
            </Link>
            {d.email && (
              <form action={draftThankYouForDonor}>
                <input type="hidden" name="donor_id" value={d.id} />
                <button className="btn sm ghost" type="submit"><Heart size={13} /> Draft thank-you</button>
              </form>
            )}
            <div className="faint" style={{ fontSize: 11.5, flexBasis: "100%" }}>
              The thank-you drafts into Needs You. It only sends after you approve it.
            </div>
          </>
        }
      >
        <div className="feature teal" style={{ marginBottom: 14 }}>
          <div className="ftitle money" style={{ fontSize: 26 }}>{money(d.lifetime_value)}</div>
          <div className="fmeta">lifetime giving{d.status ? <> · <Badge tone={statusTone(d.status)}>{d.status}</Badge></> : null}</div>
        </div>

        <div>
          {d.email && <Row icon={Mail} label="Email"><span style={{ wordBreak: "break-all" }}>{d.email}</span></Row>}
          {d.phone && <Row icon={Phone} label="Phone">{d.phone}</Row>}
          <Row icon={Heart} label="Last gift">{date(d.last_gift_at)}</Row>
          {d.country && <Row icon={Globe} label="Country">{d.country}</Row>}
          {d.source && <Row icon={Tag} label="Source">{d.source}</Row>}
          {tags.length > 0 && (
            <div className="flex" style={{ flexWrap: "wrap", gap: 6, paddingTop: 10 }}>
              {tags.map((t, i) => <span key={i} className="chip"><Tag size={11} /> {t}</span>)}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
