import { redirect } from "next/navigation";
import Shell from "../../components/Shell";
import { Badge } from "../../components/ui";
import { admin } from "../../lib/supabase-admin";
import { getCurrentUser } from "../../lib/auth";
import { rangeStart, shortStamp } from "../../lib/now";
import { MessageCircle, Clock, Eye, Paperclip, FileText, Image as ImageIcon } from "lucide-react";

export const dynamic = "force-dynamic";

// THE OWNER MIRROR — EVERYONE, INCLUDING DOCUMENTS.
// -------------------------------------------------
// Originally the Sasa/Nur thread only (2026-07-20). Extended 2026-07-21 to the full
// mirror the owner asked for: every contact's conversation with Sasa, both directions,
// AND the documents/media that were sent (each message's asset_id resolves to a signed,
// viewable link). Owner-only (role "builder", the asymmetric privacy wall in
// lib/privacy.ts: everything the team/Nur does is visible to the owner on request; the
// owner's own line stays private to him). A contact filter focuses on one person; with
// no filter it shows every thread grouped by contact.

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

export default async function OwnerMirror({
  searchParams,
}: {
  searchParams: { range?: string; contact?: string };
}) {
  // OWNER-ONLY. The whole point is that the owner sees everyone; no one else may.
  const user = getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "builder") redirect("/");

  const db = admin();
  const range = (RANGES.find((r) => r.k === searchParams.range)?.k as string) || "today";
  const contactFilter = searchParams.contact || "";
  const sinceIso = (await rangeStart(range)).toISOString();

  // ALL contacts' messages in the window (owner sees everyone). Optional contact filter.
  let q = db
    .from("messages")
    .select("id,contact_id,channel,direction,body,handled_by,status,created_at,external_id,asset_id,contact:contacts(id,name,phone)")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true })
    .limit(4000);
  if (contactFilter) q = q.eq("contact_id", contactFilter);
  const { data } = await q;
  const rows = (data || []) as any[];

  // DOCUMENTS: sign a viewable URL for every attached asset (the "including documents"
  // ask). Distinct assets only; signed server-side so the bucket stays private.
  const assetIds = [...new Set(rows.map((m) => m.asset_id).filter(Boolean))];
  const assetMap: Record<string, { title: string; url: string | null; mime: string }> = {};
  if (assetIds.length) {
    const { data: assets } = await db.from("assets").select("id,title,storage_path,mime").in("id", assetIds);
    for (const a of (assets || []) as any[]) {
      let url: string | null = null;
      if (a.storage_path) {
        const { data: signed } = await db.storage.from("assets").createSignedUrl(a.storage_path, 3600);
        url = signed?.signedUrl || null;
      }
      assetMap[a.id] = { title: a.title || "attachment", url, mime: a.mime || "" };
    }
  }

  // Contact dropdown options: distinct contacts in the window.
  const contactMap = new Map<string, string>();
  for (const m of rows) {
    if (m.contact_id && !contactMap.has(m.contact_id)) contactMap.set(m.contact_id, m.contact?.name || m.contact?.phone || "Unknown");
  }
  const contactOptions = [...contactMap.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));

  // Group by contact, each contact's thread in time order. One filtered contact = one group.
  const groups = new Map<string, { name: string; phone: string | null; items: any[] }>();
  for (const m of rows) {
    const key = m.contact_id || "unknown";
    if (!groups.has(key)) groups.set(key, { name: m.contact?.name || "Unknown", phone: m.contact?.phone || null, items: [] });
    groups.get(key)!.items.push(m);
  }
  // Order contacts by most-recent activity.
  const contactGroups = [...groups.entries()].sort((a, b) => {
    const la = a[1].items[a[1].items.length - 1]?.created_at || "";
    const lb = b[1].items[b[1].items.length - 1]?.created_at || "";
    return lb.localeCompare(la);
  });

  const inbound = rows.filter((m) => m.direction === "in").length;
  const attachments = rows.filter((m) => m.asset_id).length;

  const href = (o: Partial<{ range: string; contact: string }>) => {
    const p = new URLSearchParams();
    const r = o.range ?? range;
    const c = o.contact ?? contactFilter;
    if (r && r !== "today") p.set("range", r);
    if (c) p.set("contact", c);
    const qs = p.toString();
    return `/mirror${qs ? `?${qs}` : ""}`;
  };

  const AttachmentChip = ({ a }: { a: { title: string; url: string | null; mime: string } }) => {
    const isImg = a.mime.startsWith("image/");
    const Ico = isImg ? ImageIcon : FileText;
    const inner = (
      <span className="chip" style={{ fontSize: 11, display: "inline-flex", alignItems: "center", gap: 5, background: "var(--surface)", border: "1px solid var(--line)", padding: "3px 8px", borderRadius: 8 }}>
        <Paperclip size={11} /> <Ico size={11} /> {a.title.slice(0, 40)}{a.url ? " ↗" : " (file unavailable)"}
      </span>
    );
    return a.url ? <a href={a.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none", color: "var(--teal-700)" }}>{inner}</a> : inner;
  };

  return (
    <Shell
      title="Owner Mirror"
      sub="Every conversation Sasa had with anyone, both directions, in full — including the documents and files that were sent."
    >
      <div className="card card-pad" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <span className="aico" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 12, background: "var(--teal-50)", color: "var(--teal-700)" }}>
          <Eye size={17} />
        </span>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)" }}>
            {rows.length} message{rows.length === 1 ? "" : "s"} across {contactGroups.length} {contactGroups.length === 1 ? "person" : "people"} · {inbound} inbound · {attachments} with a file.
          </div>
          <div className="faint" style={{ fontSize: 12 }}>
            {RANGES.find((r) => r.k === range)?.label} (Asia/Dubai) · full text, no cap · documents open in a new tab
          </div>
        </div>
      </div>

      {/* Window + contact filters */}
      <div className="flex wrap" style={{ marginBottom: 16, gap: 10, alignItems: "center" }}>
        <span className="faint" style={{ fontSize: 11.5 }}><Clock size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />Window</span>
        {RANGES.map((r) => (
          <a key={r.k} href={href({ range: r.k })} className={`pill ${range === r.k ? "on" : ""}`}>{r.label}</a>
        ))}
        <span className="faint" style={{ fontSize: 11.5, marginLeft: 10 }}><MessageCircle size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />Person</span>
        <form action="/mirror" method="get" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          {range !== "today" && <input type="hidden" name="range" value={range} />}
          <select name="contact" defaultValue={contactFilter} style={{ fontSize: 12.5, padding: "6px 10px", borderRadius: 999, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink-2)", minWidth: 170 }}>
            <option value="">Everyone</option>
            {contactOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button type="submit" className="pill" style={{ padding: "5px 11px", fontSize: 12 }}>Apply</button>
          {contactFilter && <a href={href({ contact: "" })} className="pill" style={{ padding: "5px 11px", fontSize: 12 }}>Clear</a>}
        </form>
      </div>

      {rows.length === 0 && (
        <div className="card"><div className="empty">
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <MessageCircle size={19} color="var(--muted)" />
            <div style={{ fontWeight: 600, color: "var(--ink-2)", fontSize: 13.5 }}>No conversations in this window.</div>
            <div className="faint" style={{ fontSize: 12 }}>Try a wider window.</div>
          </div>
        </div></div>
      )}

      {contactGroups.map(([cid, g]) => (
        <div key={cid} style={{ marginBottom: 18 }}>
          <div className="between" style={{ marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
            <div className="flex" style={{ gap: 8, alignItems: "baseline" }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>{g.name}</span>
              {g.phone && <span className="num" style={{ fontSize: 11.5, color: "var(--muted)" }}>{g.phone}</span>}
              <Badge tone="gray">{g.items.length} msg{g.items.length === 1 ? "" : "s"}</Badge>
            </div>
          </div>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {g.items.map((m, i) => {
              const isIn = m.direction === "in";
              const who = isIn ? g.name : "Sasa";
              const asset = m.asset_id ? assetMap[m.asset_id] : null;
              return (
                <div key={m.id} style={{ padding: "12px 16px", borderTop: i === 0 ? "none" : "1px solid var(--line)", borderLeft: `3px solid ${isIn ? "var(--gold-400, var(--line))" : "var(--teal-500, var(--teal-700))"}`, background: isIn ? "transparent" : "var(--teal-50)" }}>
                  <div className="between" style={{ gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                    <div className="flex" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: isIn ? "var(--ink)" : "var(--teal-700)" }}>{who}</span>
                      <span className="num" style={{ fontSize: 11.5, color: "var(--muted)" }}>{shortStamp(m.created_at)}</span>
                      {m.channel === "whatsapp" && <span className="chip" style={{ fontSize: 10.5 }}><MessageCircle size={11} /> WhatsApp</span>}
                    </div>
                    {!isIn && <Badge tone={statusTone(m.status)}>{(m.status || "queued").toLowerCase()}</Badge>}
                  </div>
                  {(m.body && m.body.trim()) ? (
                    <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--ink-2)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</div>
                  ) : (!asset && <span className="faint" style={{ fontSize: 12 }}>(no text)</span>)}
                  {asset && <div style={{ marginTop: 6 }}><AttachmentChip a={asset} /></div>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </Shell>
  );
}
