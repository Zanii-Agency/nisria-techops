import { redirect } from "next/navigation";
import Shell from "../../../components/Shell";
import { Badge } from "../../../components/ui";
import { admin } from "../../../lib/supabase-admin";
import { getCurrentUser } from "../../../lib/auth";
import { phoneKey } from "../../../lib/whatsapp";
import { now } from "../../../lib/now";
import { MessageCircle, Send, AlertTriangle, Clock, Users, Hash } from "lucide-react";

export const dynamic = "force-dynamic";

// Sasa Outbound Audit
// ------------------
// The real ground truth of what Sasa actually sent to anyone other than Nur on
// WhatsApp, independent of Sasa's narration of what she did. Founder-only
// surface (Nur). Honesty law (#11): the bot tells Nur "I sent it to Violet";
// this page is the receipt. If a row is missing, the bot's claim was a lie or
// a hallucination.
//
// SCOPE NOTE. The query intentionally does NOT scope to "team members" only.
// It returns every Sasa-stamped outbound to any contact that is not Nur:
// donors, beneficiaries, external contacts, and team. The surface copy reads
// "recipient" everywhere so the headline matches the data.
//
// Filter logic (all four must hold):
//   1. direction = 'out'
//   2. handled_by IS NOT NULL, Sasa stamps her outbound with handled_by
//      ('sasa', 'agent:comms', etc.). Manual/human-relayed messages do not.
//   3. contact_id is NOT one of Nur's contacts, we audit messages TO anyone
//      other than Nur herself.
//   4. created_at within the selected window.

// Nur's phone numbers (the founder), in the same shape phoneKey() normalises to.
// Hardcoded per the spec; not pulled from env because OWNER_WHATSAPP is Taona's
// number, not Nur's, and we explicitly want to filter OUT Nur as a recipient
// here. lib/privacy.ts protects Taona's line; this protects Nur's audit view.
const NUR_PHONE_KEYS = ["971501622716", "106274704363640"].map((x) => phoneKey(x));

// Resolve every contact row that represents Nur (by phone or by name starting
// with "nur"), so we can exclude messages SENT TO Nur from the audit view.
// Cheap query: contacts is small and we only need ids.
async function nurContactIds(db: any): Promise<string[]> {
  const { data } = await db.from("contacts").select("id,name,phone").limit(2000);
  const rows = (data || []) as Array<{ id: string; name: string | null; phone: string | null }>;
  return rows
    .filter((c) => {
      const nameHit = (c.name || "").toLowerCase().startsWith("nur");
      const phoneHit = NUR_PHONE_KEYS.includes(phoneKey(c.phone || ""));
      return nameHit || phoneHit;
    })
    .map((c) => c.id);
}

const RANGES = [
  { k: "today", label: "Today", days: 0 },
  { k: "7d", label: "Last 7 days", days: 7 },
  { k: "30d", label: "Last 30 days", days: 30 },
] as const;

const STATUSES = [
  { k: "all", label: "All" },
  { k: "sent", label: "Sent" },
  { k: "failed", label: "Failed" },
] as const;

async function rangeStart(k: string): Promise<Date> {
  if (k === "7d") {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 7);
    return d;
  }
  if (k === "30d") {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 30);
    return d;
  }
  // "today" = Dubai midnight today, expressed as the corresponding UTC instant.
  // We route through the canonical clock (lib/now.ts) so server-local time
  // (UTC on Vercel) can never poison the boundary. n.today is "YYYY-MM-DD"
  // already resolved to Asia/Dubai; anchor it at +04:00 to get the instant.
  // Prior implementation used setHours(0,0,0,0) which is server-local midnight,
  // i.e. 04:00 Dubai on a UTC server, so anything sent between Dubai midnight
  // and 04:00 silently fell out of the "today" window.
  const n = await now("Asia/Dubai");
  return new Date(`${n.today}T00:00:00+04:00`);
}

// Dubai-time short stamp, e.g. "Sun 10:23".
function dubaiShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    timeZone: "Asia/Dubai",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusTone(s: string | null | undefined): "green" | "red" | "gray" {
  const v = (s || "").toLowerCase();
  if (v === "sent" || v === "delivered" || v === "read" || v === "replied") return "green";
  if (v === "failed" || v === "maintenance_dropped") return "red";
  return "gray";
}

export default async function TranscriptsAudit({
  searchParams,
}: {
  searchParams: { range?: string; status?: string; contact?: string };
}) {
  // FOUNDER-ONLY GATE. This surface shows raw outbound traffic to staff, which
  // is exactly the data the founder needs to audit Sasa's honesty. Anyone else
  // (including unauthenticated viewers) bounces to login.
  const user = getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "founder") redirect("/");

  const db = admin();
  const range = (RANGES.find((r) => r.k === searchParams.range)?.k as string) || "today";
  const status = (STATUSES.find((s) => s.k === searchParams.status)?.k as string) || "all";
  const contactFilter = searchParams.contact || "";

  const sinceIso = (await rangeStart(range)).toISOString();
  const nurIds = await nurContactIds(db);

  // Pull every Sasa-stamped outbound in the window. handled_by NOT NULL is the
  // marker Sasa uses (see lib/whatsapp.ts sendTextAndLog + gateway.ts onApproved).
  // We exclude Nur's contact rows server-side; the rest is filtered in-page so
  // the contact dropdown can still see every distinct contact in the window.
  let q = db
    .from("messages")
    .select(
      "id,contact_id,channel,direction,body,handled_by,status,created_at,subject,external_id,account,sender_type,contact:contacts(id,name,email,phone,channel)",
    )
    .eq("direction", "out")
    .not("handled_by", "is", null)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (nurIds.length > 0) q = q.not("contact_id", "in", `(${nurIds.join(",")})`);
  const { data: msgs } = await q;

  const all = ((msgs || []) as any[]).filter((m) => !nurIds.includes(m.contact_id));

  // Distinct contacts in the window, for the contact filter dropdown.
  const contactMap = new Map<string, { id: string; name: string }>();
  for (const m of all) {
    const cid = m.contact_id;
    if (!cid) continue;
    if (!contactMap.has(cid)) {
      const name = m.contact?.name || m.contact?.email || m.contact?.phone || "Unknown";
      contactMap.set(cid, { id: cid, name });
    }
  }
  const contactOptions = [...contactMap.values()].sort((a, b) => a.name.localeCompare(b.name));

  // Apply the in-page filters (status + contact). Range was pushed into the SQL.
  const filtered = all.filter((m) => {
    if (status === "sent" && statusTone(m.status) !== "green") return false;
    if (status === "failed" && statusTone(m.status) !== "red") return false;
    if (contactFilter && m.contact_id !== contactFilter) return false;
    return true;
  });

  const distinctContacts = new Set(filtered.map((m) => m.contact_id).filter(Boolean));
  const counter = `Sasa sent ${filtered.length} message${filtered.length === 1 ? "" : "s"} to ${distinctContacts.size} recipient${distinctContacts.size === 1 ? "" : "s"} in this window.`;

  // Build URL helper for filter chips that preserve the other selections.
  const href = (overrides: Partial<{ range: string; status: string; contact: string }>) => {
    const p = new URLSearchParams();
    const r = overrides.range ?? range;
    const s = overrides.status ?? status;
    const c = overrides.contact ?? contactFilter;
    if (r && r !== "today") p.set("range", r);
    if (s && s !== "all") p.set("status", s);
    if (c) p.set("contact", c);
    const qs = p.toString();
    return `/admin/transcripts${qs ? `?${qs}` : ""}`;
  };

  return (
    <Shell
      title="Sasa Outbound Audit"
      sub="Every message Sasa sent to anyone other than you (Nur), in a chosen window. The receipt of what really went out."
    >
      {/* Counter card. The headline number for the window. */}
      <div className="card card-pad" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <span
          className="aico"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            borderRadius: 12,
            background: "var(--teal-50)",
            color: "var(--teal-700)",
          }}
        >
          <Send size={17} />
        </span>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)" }}>{counter}</div>
          <div className="faint" style={{ fontSize: 12 }}>
            {RANGES.find((r) => r.k === range)?.label} (Asia/Dubai) · handled_by IS NOT NULL · Nur excluded
          </div>
        </div>
      </div>

      {/* Filter row 1: time range chips */}
      <div className="flex wrap" style={{ marginBottom: 10, gap: 7, alignItems: "center" }}>
        <span className="faint" style={{ fontSize: 11.5, marginRight: 2 }}>
          <Clock size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />
          Window
        </span>
        {RANGES.map((r) => (
          <a key={r.k} href={href({ range: r.k })} className={`pill ${range === r.k ? "on" : ""}`}>
            {r.label}
          </a>
        ))}
      </div>

      {/* Filter row 2: contact + status */}
      <div className="flex wrap" style={{ marginBottom: 16, gap: 10, alignItems: "center" }}>
        <span className="faint" style={{ fontSize: 11.5, marginRight: 2 }}>
          <Users size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />
          Recipient
        </span>
        <form action="/admin/transcripts" method="get" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          {range !== "today" && <input type="hidden" name="range" value={range} />}
          {status !== "all" && <input type="hidden" name="status" value={status} />}
          <select
            name="contact"
            defaultValue={contactFilter}
            style={{
              fontSize: 12.5,
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid var(--line)",
              background: "var(--surface)",
              color: "var(--ink-2)",
              minWidth: 180,
            }}
          >
            <option value="">All recipients</option>
            {contactOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button type="submit" className="pill" style={{ padding: "5px 11px", fontSize: 12 }}>
            Apply
          </button>
          {contactFilter && (
            <a href={href({ contact: "" })} className="pill" style={{ padding: "5px 11px", fontSize: 12 }}>
              Clear
            </a>
          )}
        </form>

        <span className="faint" style={{ fontSize: 11.5, marginLeft: 10, marginRight: 2 }}>
          Status
        </span>
        {STATUSES.map((s) => (
          <a
            key={s.k}
            href={href({ status: s.k })}
            className={`pill ${status === s.k ? "on" : ""}`}
            style={{ padding: "5px 11px", fontSize: 12 }}
          >
            {s.label}
          </a>
        ))}
      </div>

      {/* Result list. Time-sorted, full body, traceable wamid. */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {filtered.length === 0 && (
          <div className="empty">
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <AlertTriangle size={19} color="var(--muted)" />
              <div style={{ fontWeight: 600, color: "var(--ink-2)", fontSize: 13.5 }}>
                No outbound messages to any recipient in this window.
              </div>
              <div className="faint" style={{ fontSize: 12, maxWidth: 460, lineHeight: 1.5 }}>
                This is GOOD if Sasa was not supposed to send anything. If Sasa CLAIMED she sent
                something (to Violet, Cynthia, Mark, anyone) and this view is empty, the claim was
                a hallucination. The receipt is the truth.
              </div>
            </div>
          </div>
        )}

        {filtered.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {filtered.map((m, i) => {
              const name = m.contact?.name || m.contact?.email || m.contact?.phone || "Unknown";
              const phone = m.contact?.phone || "";
              const wamid = m.external_id ? String(m.external_id).slice(-8) : "";
              const tone = statusTone(m.status);
              return (
                <div
                  key={m.id}
                  style={{
                    padding: "14px 18px",
                    borderTop: i === 0 ? "none" : "1px solid var(--line)",
                    display: "grid",
                    gridTemplateColumns: "120px 1fr",
                    gap: 14,
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <span
                      className="num"
                      style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", fontVariantNumeric: "tabular-nums" }}
                    >
                      {dubaiShort(m.created_at)}
                    </span>
                    <Badge tone={tone}>{(m.status || "queued").toLowerCase()}</Badge>
                    {m.channel === "whatsapp" && (
                      <span className="chip" style={{ fontSize: 10.5 }}>
                        <MessageCircle size={11} /> WhatsApp
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                    <div className="between" style={{ flexWrap: "wrap", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, color: "var(--faint)", fontWeight: 500 }}>To</span>
                        {m.contact_id ? (
                          <a
                            href={`/contacts/${m.contact_id}`}
                            style={{
                              fontWeight: 600,
                              fontSize: 13.5,
                              color: "var(--teal-700)",
                              textDecoration: "none",
                            }}
                          >
                            {name}
                          </a>
                        ) : (
                          <span style={{ fontWeight: 600, fontSize: 13.5, color: "var(--ink)" }}>{name}</span>
                        )}
                        {phone && (
                          <span
                            className="num"
                            style={{ fontSize: 11.5, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}
                          >
                            {phone}
                          </span>
                        )}
                      </div>
                      {wamid && (
                        <span
                          className="num"
                          title={`external_id: ${m.external_id}`}
                          style={{
                            fontSize: 10.5,
                            color: "var(--faint)",
                            fontVariantNumeric: "tabular-nums",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Hash size={11} />…{wamid}
                        </span>
                      )}
                    </div>
                    {m.subject && (
                      <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink-2)" }}>{m.subject}</div>
                    )}
                    <div
                      style={{
                        fontSize: 13,
                        lineHeight: 1.55,
                        color: "var(--ink-2)",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {m.body || <span className="faint">(empty body)</span>}
                    </div>
                    {m.handled_by && (
                      <div className="faint" style={{ fontSize: 10.5 }}>
                        handled_by: <span className="num">{m.handled_by}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Shell>
  );
}
