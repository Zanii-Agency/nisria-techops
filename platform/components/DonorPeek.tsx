"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, statusTone } from "./ui";
import { useTabs } from "./tabs-context";
import AiComposer from "./AiComposer";
import { draftThankYouForDonor } from "../app/donations/actions";
import { emailContact } from "../app/contacts/actions";
import { ExternalLink, Heart, Mail, Phone, Globe, Tag, MessageSquare, Loader2 } from "lucide-react";

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

type Msg = { id: string; channel?: string; direction: string; subject?: string; body?: string; created_at: string; handled_by?: string };

// The donor profile + conversation, opened in the canonical Focus Tab — the SAME
// structure as the Needs-You tab (P1: "messages on donors, if they exist, must
// open like the Needs-You tab"). Profile at a glance, then the message thread,
// then the inline composer. Messages load lazily from /api/donor-thread so the
// donors list stays fast.
function DonorFocus({ d }: { d: any }) {
  const name = d.full_name || (d.email || "Unknown donor").split("@")[0];
  const tags: string[] = Array.isArray(d.tags) ? d.tags : [];
  const recurring = !!d.is_recurring || (d.status || "").toLowerCase() === "recurring";
  const [thread, setThread] = useState<Msg[]>([]);
  const [matchedContactId, setMatchedContactId] = useState<string>("");
  const [loading, setLoading] = useState(!!d.email);

  useEffect(() => {
    let alive = true;
    if (!d.email) { setLoading(false); return; }
    fetch(`/api/donor-thread?donor_id=${encodeURIComponent(d.id)}`)
      .then((r) => r.json())
      .then((j) => { if (!alive) return; setThread(j.thread || []); setMatchedContactId(j.matchedContactId || ""); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [d.id, d.email]);

  const Row = ({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) => (
    <div className="between" style={{ fontSize: 13, padding: "7px 0", borderTop: "1px solid var(--line)" }}>
      <span className="muted flex" style={{ gap: 7 }}><Icon size={13} /> {label}</span>
      <span style={{ textAlign: "right" }}>{children}</span>
    </div>
  );

  return (
    <>
      <div className="feature teal" style={{ marginBottom: 14 }}>
        <div className="ftitle money" style={{ fontSize: 26 }}>{money(d.lifetime_value)}</div>
        <div className="fmeta">lifetime giving{d.status ? <> · <Badge tone={statusTone(d.status)}>{d.status}</Badge></> : null}{recurring ? " · monthly" : ""}</div>
      </div>

      <div style={{ marginBottom: 16 }}>
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

      {/* conversation — same chat structure as the donor 360 + Needs-You reply */}
      <div className="card" style={{ marginBottom: 0 }}>
        <div className="card-h"><span className="flex"><MessageSquare size={15} /> Conversation</span><Badge tone="gray">{thread.length}</Badge></div>
        <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10, maxHeight: 360, overflowY: "auto" }}>
          {loading && <div className="flex faint" style={{ fontSize: 12.5, gap: 8 }}><Loader2 size={13} className="spin" /> Loading messages…</div>}
          {!loading && thread.length === 0 && <div className="empty" style={{ padding: 14 }}>No messages yet. Start the conversation below.</div>}
          {thread.map((m) => {
            const out = m.direction === "out";
            return (
              <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: out ? "flex-end" : "flex-start" }}>
                <div style={{ maxWidth: "82%", padding: "10px 13px", borderRadius: 15, fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word", background: out ? "var(--teal)" : "var(--canvas)", color: out ? "#fff" : "var(--ink)", border: out ? "0" : "1px solid var(--line)", borderBottomRightRadius: out ? 5 : 15, borderBottomLeftRadius: out ? 15 : 5 }}>
                  {m.subject && <div style={{ fontWeight: 600, marginBottom: 4 }}>{m.subject}</div>}
                  <div>{m.body || <span className="faint">(no content)</span>}</div>
                </div>
                <div className="faint" style={{ fontSize: 11, marginTop: 4, padding: "0 4px" }}>
                  {out ? `${m.handled_by === "ai" ? "Sasa" : "Nur"} · ${m.channel || "email"}` : name} · {date(m.created_at)}
                </div>
              </div>
            );
          })}
        </div>
        {d.email ? (
          <AiComposer
            action={emailContact}
            hidden={{ to: d.email, contact_id: matchedContactId || "" }}
            recipientLabel={`Email ${name}`}
            recipientEmail={d.email}
            defaultSubject="A note from Nisria"
            bodyPlaceholder={`Write to ${name}…`}
            subjectRequired
            bodyRequired
            draftDonorId={d.id}
            allowAccountPick
          />
        ) : (
          <div className="empty" style={{ borderTop: "1px solid var(--line)" }}>No email on file for this donor.</div>
        )}
      </div>
    </>
  );
}

// Clicking a donor row opens the donor in the canonical Focus Tab (P1) — profile
// + conversation, the SAME structure/behavior as the Needs-You tab. The full
// 360 route page is one click away in the footer.
export default function DonorPeek({ donor: d }: { donor: any }) {
  const { openSheet, closeSheet } = useTabs();
  const name = d.full_name || (d.email || "Unknown donor").split("@")[0];
  const recurring = !!d.is_recurring || (d.status || "").toLowerCase() === "recurring";
  const id = `donor:${d.id}`;

  function open() {
    openSheet({
      id,
      title: name.slice(0, 28),
      icon: "heart",
      titleExtra: (
        <span className="muted" style={{ fontSize: 12 }}>{d.type || "individual"}{recurring ? " · monthly" : ""}</span>
      ),
      render: () => <DonorFocus d={d} />,
      footer: (
        <>
          <Link className="btn sm teal" href={`/donors/${d.id}`} onClick={() => closeSheet(id)}>
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
      ),
    });
  }

  return (
    <button type="button" className="linkbtn strong" onClick={open} title="Open donor">
      {name}
    </button>
  );
}
