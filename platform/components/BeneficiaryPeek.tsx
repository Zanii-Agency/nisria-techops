"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, statusTone } from "./ui";
import Modal from "./Modal";
import { toggleConsent } from "../app/beneficiaries/actions";
import { formatPersonName } from "../lib/names";
import { ExternalLink, Lock, MapPin, Calendar, Users, Tag, Globe, ShieldOff } from "lucide-react";

// Dates formatted client-side so the peek matches the table without a round-trip.
function date(v: any) {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function age(dob: any) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  const yrs = Math.floor(diff / (365.25 * 86400e3));
  return yrs >= 0 && yrs < 130 ? yrs : null;
}

const PROGRAM_LABEL: Record<string, string> = {
  safe_house: "Safe house",
  education: "Education",
  rescue: "Rescue",
  nutrition: "Nutrition",
  other: "Other",
};

// Clicking a beneficiary row opens a centered peek (via the shared Modal primitive). PII is clearly tagged "Private" and never leaves the
// admin surface. The consent toggle publishes/unpublishes the donor-facing
// public profile (the consent-gated view) and is the only write here.
// hidePhoto: when the parent surface (the cases-board lanecard) renders its own
// 42px thumbnail next to the name, the 28px trigger-button avatar reads as a
// duplicate of the same face. The founder flagged it (portal-fix shot 1,
// 2026-06-09). The Modal interior still shows the larger photo for the peek.
export default function BeneficiaryPeek({ b, hidePhoto = false }: { b: any; hidePhoto?: boolean }) {
  const [open, setOpen] = useState(false);
  const display = b.public_name || b.ref_code || "Beneficiary";
  // Pull the primary name to lead and keep any dependents separate, so a family
  // phrase ("Mercy Wanjiku and her children Princess and Tony") reads as a proper
  // name with a quiet dependents chip rather than a sentence.
  const fmt = formatPersonName(b.full_name || "");
  const personName = fmt.name || display;
  const dependents = fmt.dependents;
  const realName = personName || "—";
  const initial = (personName || display).charAt(0).toUpperCase();
  const tags: string[] = Array.isArray(b.tags) ? b.tags : [];
  const consented = !!b.consent_public;
  const a = age(b.date_of_birth);
  const program = b.program ? PROGRAM_LABEL[b.program] || b.program : null;

  const Row = ({ icon: Icon, label, children, priv }: { icon: any; label: string; children: React.ReactNode; priv?: boolean }) => (
    <div className="between" style={{ fontSize: 13, padding: "7px 0", borderTop: "1px solid var(--line)" }}>
      <span className="muted flex" style={{ gap: 7 }}>
        <Icon size={13} /> {label}
        {priv && <span className="badge gray" style={{ fontSize: 9.5, padding: "1px 6px" }}><Lock size={9} /> Private</span>}
      </span>
      <span style={{ textAlign: "right" }}>{children}</span>
    </div>
  );

  return (
    <>
      <button type="button" className="linkbtn strong flex" style={{ gap: 9, alignItems: "center" }} onClick={() => setOpen(true)} title="Quick look">
        {hidePhoto ? null : b._photoUrl
          ? <img src={b._photoUrl} alt="" style={{ width: 28, height: 28, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
          : <span className="avatar" style={{ width: 28, height: 28, fontSize: 12, flexShrink: 0 }}>{initial}</span>}
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{personName}</span>
        {dependents.length > 0 && (
          <span className="chip" style={{ fontSize: 10, flexShrink: 0 }} title={`Dependents: ${dependents.join(", ")}`}>
            <Users size={9} /> +{dependents.length}
          </span>
        )}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        width={480}
        title={
          <div className="flex" style={{ gap: 12 }}>
            {b._photoUrl
              ? <img src={b._photoUrl} alt="" style={{ width: 52, height: 52, borderRadius: 13, objectFit: "cover" }} />
              : <div className="avatar" style={{ width: 52, height: 52, fontSize: 19 }}>{initial}</div>}
            <div>
              <h3 style={{ fontSize: 17, lineHeight: 1.1 }} className="flex">
                {personName}
                <span className="badge gray" style={{ fontSize: 9.5, padding: "1px 6px" }}><Lock size={9} /> Private</span>
              </h3>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {b.ref_code ? <>{b.ref_code} · </> : null}{program || "unassigned program"}
              </div>
            </div>
          </div>
        }
        footer={
          <>
            <Link className="btn sm teal" href={`/beneficiaries/${b.id}`} onClick={() => setOpen(false)}>
              <ExternalLink size={13} /> Open full profile
            </Link>
            <form action={toggleConsent}>
              <input type="hidden" name="id" value={b.id} />
              <input type="hidden" name="to" value={consented ? "off" : "on"} />
              <button className="btn sm ghost" type="submit">
                {consented ? <><ShieldOff size={13} /> Unpublish profile</> : <><Globe size={13} /> Publish to donors</>}
              </button>
            </form>
            <div className="faint" style={{ fontSize: 11.5, flexBasis: "100%" }}>
              {consented
                ? "This profile is live on the donor-facing widget. Unpublishing removes it immediately."
                : "Publishing shows the alias, program, sanitized story and public photo to donors. Full name and location stay private."}
            </div>
          </>
        }
      >
        <div className="feature teal" style={{ marginBottom: 14 }}>
          <div className="ftitle" style={{ fontSize: 19 }}>
            {program || "No program set"}
          </div>
          <div className="fmeta">
            <Badge tone={statusTone(b.status)}>{b.status || "active"}</Badge>
            {consented
              ? <> · <Badge tone="green">public profile live</Badge></>
              : <> · <Badge tone="gray">private only</Badge></>}
          </div>
        </div>

        {b.public_story && (
          <div className="faint" style={{ fontSize: 12.5, lineHeight: 1.55, marginBottom: 12, fontStyle: "italic" }}>
            “{String(b.public_story).slice(0, 220)}{String(b.public_story).length > 220 ? "…" : ""}”
          </div>
        )}

        <div>
          <Row icon={Lock} label="Full name" priv><span>{realName}</span></Row>
          {dependents.length > 0 && (
            <Row icon={Users} label="Dependents" priv>
              <span>{dependents.join(", ")}</span>
            </Row>
          )}
          {(b.location || b.region) && <Row icon={MapPin} label="Location" priv>{b.location || b.region}</Row>}
          {b.guardian_status && <Row icon={Users} label="Guardian" priv>{b.guardian_status}</Row>}
          {a !== null && <Row icon={Calendar} label="Age" priv>{a}</Row>}
          {b.gender && <Row icon={Users} label="Gender" priv>{b.gender}</Row>}
          <Row icon={Calendar} label="Intake">{date(b.intake_date)}</Row>
          <Row icon={Globe} label="Consent">{consented ? <span className="strong">granted {date(b.consent_date)}</span> : "not granted"}</Row>
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
