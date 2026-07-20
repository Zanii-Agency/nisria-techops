import { redirect } from "next/navigation";
import Shell from "../../components/Shell";
import { Badge } from "../../components/ui";
import { admin } from "../../lib/supabase-admin";
import { getCurrentUser } from "../../lib/auth";
import { founderContactIds } from "../../lib/privacy";
import { rangeStart, shortStamp } from "../../lib/now";
import { MessageCircle, Clock, AlertTriangle, Eye } from "lucide-react";

export const dynamic = "force-dynamic";

// THE OWNER MIRROR
// ----------------
// What Sasa and Nur actually said to each other, both directions, in full.
//
// WHY THIS PAGE EXISTS (2026-07-20 incident). The mirror used to be a WhatsApp
// push: every Sasa line to Nur was relayed to Taona's line as it happened. That
// rail cannot carry a conversation. A watcher never replies, so his 24h Meta
// window is permanently closed, which forced every relay through the approved
// system_alert template. That template is built for backend incidents, its body
// always closes with "Check the Nisria portal.", and template params are capped
// and newline-stripped. The result Taona actually saw:
//
//   "System alert on Sasa to Nur M'nasria. I can't generate or export PDF files
//    directly, that's not something I can do from this line. What I can do is:
//    1. Have Taona build these as formatted PDF templates in the Studio ...
//    2. Send the content to a specific team member to format and save. 3. Keep
//    the . Check the Nisria portal."
//
// Framed as an incident, flattened, and cut mid-word at 300 characters. The push
// fix (only genuinely deliberate alerts escalate to the template) stops the
// false alarms, but on its own it makes passive relays disappear instead of
// arriving badly. Visibility has to live somewhere that has no 24h window and no
// param cap. That is here. WhatsApp keeps only the nudge; the portal is the feed.
//
// The data needs no new plumbing: every mirror line was already persisted to
// `messages` as a normal row. This is a read-only view over what was always there.
//
// PRIVACY. Owner-only, and deliberately asymmetric (see lib/privacy.ts): Taona is
// the owner, Nur is the founder, "everything she does is visible to Taona on
// request" while his own line stays private to him. That makes the Sasa/Nur
// thread legitimately viewable HERE and nowhere else. Gated on role "builder";
// the founder bounces. The inverse surface is /admin/transcripts, which is
// founder-gated and EXCLUDES Nur. Both read founderContactIds() so a thread can
// never fall out of both views.

const RANGES = [
  { k: "today", label: "Today" },
  { k: "7d", label: "Last 7 days" },
  { k: "30d", label: "Last 30 days" },
] as const;

function statusTone(s: string | null | undefined): "green" | "red" | "gray" {
  const v = (s || "").toLowerCase();
  if (v === "sent" || v === "delivered" || v === "read" || v === "replied") return "green";
  if (v === "failed" || v === "maintenance_dropped") return "red";
  return "gray";
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "Asia/Dubai",
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

export default async function OwnerMirror({
  searchParams,
}: {
  searchParams: { range?: string };
}) {
  // OWNER-ONLY GATE. This is the founder's own conversation. Only the owner
  // (role "builder", per lib/privacy.ts) may read it.
  const user = getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "builder") redirect("/");

  const db = admin();
  const range = (RANGES.find((r) => r.k === searchParams.range)?.k as string) || "today";
  const sinceIso = (await rangeStart(range)).toISOString();

  const nurIds = await founderContactIds(db);

  // No founder contact resolved means the filter below would be unbounded and
  // this page would leak every thread in the system. Fail CLOSED, loudly.
  let rows: any[] = [];
  if (nurIds.length > 0) {
    const { data } = await db
      .from("messages")
      .select("id,contact_id,channel,direction,body,handled_by,status,created_at,external_id,contact:contacts(id,name,phone)")
      .in("contact_id", nurIds)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .limit(1000);
    rows = (data || []) as any[];
  }

  const inbound = rows.filter((m) => m.direction === "in").length;
  const outbound = rows.length - inbound;

  const href = (r: string) => (r === "today" ? "/mirror" : `/mirror?range=${r}`);

  // Group by Dubai day so a long window still reads as a conversation.
  const days: { label: string; items: any[] }[] = [];
  for (const m of rows) {
    const label = dayLabel(m.created_at);
    if (!days.length || days[days.length - 1].label !== label) days.push({ label, items: [] });
    days[days.length - 1].items.push(m);
  }

  return (
    <Shell
      title="Owner Mirror"
      sub="Everything Sasa and Nur said to each other, both directions, in full. Nothing truncated, nothing reframed."
    >
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
          <Eye size={17} />
        </span>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)" }}>
            {rows.length} message{rows.length === 1 ? "" : "s"} in this window. {inbound} from Nur, {outbound} from Sasa.
          </div>
          <div className="faint" style={{ fontSize: 12 }}>
            {RANGES.find((r) => r.k === range)?.label} (Asia/Dubai) · full text, no character cap
          </div>
        </div>
      </div>

      <div className="flex wrap" style={{ marginBottom: 16, gap: 7, alignItems: "center" }}>
        <span className="faint" style={{ fontSize: 11.5, marginRight: 2 }}>
          <Clock size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />
          Window
        </span>
        {RANGES.map((r) => (
          <a key={r.k} href={href(r.k)} className={`pill ${range === r.k ? "on" : ""}`}>
            {r.label}
          </a>
        ))}
      </div>

      {nurIds.length === 0 && (
        <div className="card">
          <div className="empty">
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <AlertTriangle size={19} color="var(--muted)" />
              <div style={{ fontWeight: 600, color: "var(--ink-2)", fontSize: 13.5 }}>
                No founder contact could be resolved.
              </div>
              <div className="faint" style={{ fontSize: 12, maxWidth: 460, lineHeight: 1.5 }}>
                This view is showing nothing rather than showing everything. Check that a contact
                row exists for Nur with her WhatsApp number, then reload.
              </div>
            </div>
          </div>
        </div>
      )}

      {nurIds.length > 0 && rows.length === 0 && (
        <div className="card">
          <div className="empty">
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <MessageCircle size={19} color="var(--muted)" />
              <div style={{ fontWeight: 600, color: "var(--ink-2)", fontSize: 13.5 }}>
                No messages between Sasa and Nur in this window.
              </div>
              <div className="faint" style={{ fontSize: 12 }}>Try a wider window.</div>
            </div>
          </div>
        </div>
      )}

      {days.map((day) => (
        <div key={day.label} style={{ marginBottom: 18 }}>
          <div
            className="faint"
            style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 }}
          >
            {day.label}
          </div>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {day.items.map((m, i) => {
              const isNur = m.direction === "in";
              const who = isNur ? m.contact?.name || "Nur" : "Sasa";
              return (
                <div
                  key={m.id}
                  style={{
                    padding: "13px 16px",
                    borderTop: i === 0 ? "none" : "1px solid var(--line)",
                    // A quiet left rule is enough to tell the two sides apart at a
                    // glance without chat-bubble theatre in a dense audit view.
                    borderLeft: `3px solid ${isNur ? "var(--gold-400, var(--line))" : "var(--teal-500, var(--teal-700))"}`,
                    background: isNur ? "transparent" : "var(--teal-50)",
                  }}
                >
                  <div className="between" style={{ gap: 8, flexWrap: "wrap", marginBottom: 5 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: isNur ? "var(--ink)" : "var(--teal-700)" }}>
                        {who}
                      </span>
                      <span
                        className="num"
                        style={{ fontSize: 11.5, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}
                      >
                        {shortStamp(m.created_at)}
                      </span>
                      {m.channel === "whatsapp" && (
                        <span className="chip" style={{ fontSize: 10.5 }}>
                          <MessageCircle size={11} /> WhatsApp
                        </span>
                      )}
                    </div>
                    {!isNur && <Badge tone={statusTone(m.status)}>{(m.status || "queued").toLowerCase()}</Badge>}
                  </div>
                  {/* pre-wrap is the whole point: this is the surface where a line
                      arrives with its newlines and its full length intact. */}
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
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </Shell>
  );
}
