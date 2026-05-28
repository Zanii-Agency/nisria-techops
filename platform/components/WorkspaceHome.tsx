"use client";

import { useRouter } from "next/navigation";
import { useTabs } from "./tabs-context";
import {
  Layers, X, MessageCircle, Mail, Phone, MessageSquare, Bot, ChevronRight, Bell, FileText, Inbox,
} from "lucide-react";

const CH: Record<string, { icon: any; tone: string; label: string }> = {
  whatsapp: { icon: MessageCircle, tone: "green", label: "WhatsApp" },
  email: { icon: Mail, tone: "blue", label: "Email" },
  voice: { icon: Phone, tone: "peri", label: "Voice" },
  sms: { icon: MessageSquare, tone: "gold", label: "SMS" },
};
const ago = (d: string) => {
  if (!d) return "";
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

export default function WorkspaceHome({ messages, events, pendingApprovals }: { messages: any[]; events: any[]; pendingApprovals: number }) {
  const router = useRouter();
  const { tabs, closeTab } = useTabs();

  return (
    <div className="pagewrap rise">
      <div className="hero">
        <div>
          <div className="eyebrow">Workspace</div>
          <h1>Your active work, live.</h1>
        </div>
      </div>

      {/* OPEN NOW — the working set (persistent tabs) you can resume */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h"><span className="flex"><Layers size={15} /> Open now</span><span className="faint" style={{ fontSize: 12 }}>{tabs.length} {tabs.length === 1 ? "tab" : "tabs"}</span></div>
        {tabs.length === 0 ? (
          <div className="empty" style={{ padding: "26px 22px" }}>
            Nothing open yet. Jump in from the <a href="/launchpad" className="linkbtn strong">Launchpad</a>, or open any record and it lives here.
          </div>
        ) : (
          <div className="ws-grid">
            {tabs.map((t) => (
              <div key={t.href} className="ws-card" onClick={() => router.push(t.href)}>
                <button className="ws-x" onClick={(e) => { e.stopPropagation(); closeTab(t.href); }}><X size={12} /></button>
                <span className="ws-ico"><FileText size={17} /></span>
                <span className="ws-title">{t.title}</span>
                <span className="ws-sub">{t.href}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1.5fr 1fr", gap: 16 }}>
        {/* LIVE OPS — the comms nerve centre (WhatsApp/email/voice all land here) */}
        <div className="card">
          <div className="card-h">
            <span className="flex"><Inbox size={15} /> Live ops</span>
            <a href="/inbox" className="flex faint" style={{ fontSize: 12, textDecoration: "none", gap: 4 }}>All conversations <ChevronRight size={13} /></a>
          </div>
          <div className="faint" style={{ fontSize: 11.5, padding: "10px 22px 4px", lineHeight: 1.5 }}>
            Every channel feeds here — WhatsApp, email, voice notes and replies. Sasa reads each one, extracts what matters and routes it. {pendingApprovals > 0 && <span className="strong">{pendingApprovals} need your sign-off.</span>}
          </div>
          <div style={{ maxHeight: "46vh", overflowY: "auto" }}>
            {messages.length === 0 && <div className="empty" style={{ padding: "22px" }}>Quiet so far. New messages appear here as they arrive.</div>}
            {messages.map((m) => {
              const meta = CH[(m.channel || "").toLowerCase()] || { icon: MessageSquare, tone: "gray", label: m.channel || "Message" };
              const Icon = meta.icon;
              const who = m.contact?.name || "Unknown";
              const text = (m.subject || m.body || "").replace(/\s+/g, " ").trim();
              return (
                <a key={m.id} href="/inbox" className="flex ws-msg" style={{ gap: 11, padding: "11px 22px", borderTop: "1px solid var(--line)", textDecoration: "none", alignItems: "flex-start" }}>
                  <span className={`aico ${["teal", "peri", "green", "gold", "red", "gray"].includes(meta.tone) ? meta.tone : "gray"}`} style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0 }}><Icon size={14} /></span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span className="between">
                      <span className="strong" style={{ fontSize: 13 }}>{who}</span>
                      <span className="faint" style={{ fontSize: 11, flexShrink: 0 }}>{meta.label} · {ago(m.created_at)}</span>
                    </span>
                    <span style={{ display: "block", fontSize: 12.5, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>{text || "—"}</span>
                  </span>
                  {m.direction === "in" && m.status !== "handled" && <span className="badge teal" style={{ fontSize: 9.5, flexShrink: 0 }}>new</span>}
                </a>
              );
            })}
          </div>
        </div>

        {/* ACTIVITY — what Sasa and the system have been doing */}
        <div className="card">
          <div className="card-h"><span className="flex"><Bot size={15} /> Activity</span></div>
          <div style={{ maxHeight: "46vh", overflowY: "auto", padding: "4px 0" }}>
            {events.length === 0 && <div className="empty" style={{ padding: "22px" }}>Quiet so far today.</div>}
            {events.map((e, i) => (
              <div key={i} className="flex" style={{ gap: 10, padding: "10px 18px", borderTop: i ? "1px solid var(--line)" : "none" }}>
                <span className="aico teal" style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0 }}><Bot size={12} /></span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "block", fontSize: 12.5, fontWeight: 500 }}>{(e.type || "event").replace(/[._]/g, " ")}</span>
                  <span className="faint" style={{ fontSize: 11 }}>{e.actor || e.source || "system"} · {ago(e.created_at)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
