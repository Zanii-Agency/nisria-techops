"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sendChat, assignTask, sasaDraft } from "../app/workspace/actions";
import {
  MessageCircle, Mail, Phone, MessageSquare, Send, Sparkles, ExternalLink,
  ListChecks, Activity, ChevronRight, Inbox, CheckCircle2, Bot, FileCheck,
  Layers,
} from "lucide-react";

// 2026-06-09 (Taona's call): Workspace converted from 3-column persistent
// portal to BROWSER-TAB pattern. Tabs row at top of the workspace canvas;
// click a tab → its full content fills the canvas in-place (no route change,
// no FocusSheet). State preserved per tab via React state on this component
// (each tab branch keeps its own selection/composer state for the session).
//
// Tabs: Conversations · Tasks · Activity. The "Threads" function from the old
// 4-column layout is folded into Conversations — picking a thread on the left
// rail of that tab shows the chat on the right, all within the single tab.

const CH: Record<string, { icon: any; label: string; tone: string }> = {
  whatsapp: { icon: MessageCircle, label: "WhatsApp", tone: "green" },
  email: { icon: Mail, label: "Email", tone: "teal" },
  voice: { icon: Phone, label: "Voice", tone: "peri" },
  sms: { icon: MessageSquare, label: "SMS", tone: "gold" },
};
const meta = (c: string) => CH[(c || "").toLowerCase()] || { icon: MessageSquare, label: c || "Message", tone: "gray" };
const ago = (d: string) => {
  if (!d) return "";
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "now"; if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`; return `${Math.floor(s / 86400)}d`;
};
const clip = (s: string, n = 46) => { const t = (s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n) + "…" : t; };

function eventLabel(e: any): { text: string; icon: any; tone: string } {
  const who = (e.actor || "").trim();
  const by = who && who.toLowerCase() !== "system" ? ` by ${who}` : "";
  const map: Record<string, { text: string; icon: any; tone: string }> = {
    "message.received": { text: "New message arrived", icon: Inbox, tone: "teal" },
    "agent.decided": { text: `Sasa drafted a reply${by}`, icon: Sparkles, tone: "peri" },
    "approval.created": { text: "An action was queued for review", icon: FileCheck, tone: "gold" },
    "approval.approved": { text: `Action approved${by}`, icon: CheckCircle2, tone: "green" },
    "action.executed": { text: `Message sent${by}`, icon: Send, tone: "green" },
    "task.assigned": { text: `Task assigned${by}`, icon: CheckCircle2, tone: "teal" },
    "payment.verified": { text: "Payment logged", icon: CheckCircle2, tone: "green" },
    "grants.refreshed": { text: "Grant opportunities refreshed", icon: Activity, tone: "peri" },
    "asset.ingested": { text: "A document was filed to Library", icon: FileCheck, tone: "gold" },
  };
  return map[e.type] || { text: `${e.type.replace(/\./g, " ")}${by}`, icon: Bot, tone: "gray" };
}
function eventAgo(d: string): string {
  if (!d) return "";
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

type TabKey = "conversations" | "tasks" | "activity";

export default function WorkspacePortal({ threads, team, tasks, events }: { threads: any[]; team: any[]; tasks: any[]; events: any[] }) {
  const router = useRouter();
  const [active, setActive] = useState<TabKey>("conversations");

  // Conversations tab state — persists while the operator is on this tab.
  const key = (t: any) => t.contactId || "unknown";
  const [sel, setSel] = useState<string | null>(threads[0] ? key(threads[0]) : null);
  const [draft, setDraft] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const activeThread = threads.find((t) => key(t) === sel) || null;
  const teamName = (id: string) => team.find((m) => m.id === id)?.name || "Unassigned";

  const openProfile = () => { if (activeThread?.contactId) router.push(`/contacts/${activeThread.contactId}`); };
  const doDraft = async () => {
    if (!activeThread?.contactId) return;
    setDrafting(true);
    try { setDraft(await sasaDraft(activeThread.contactId, activeThread.channel)); } finally { setDrafting(false); }
  };

  const TABS: { key: TabKey; label: string; icon: any; count: number }[] = [
    { key: "conversations", label: "Conversations", icon: MessageCircle, count: threads.length },
    { key: "tasks",         label: "Tasks",         icon: ListChecks,    count: tasks.length },
    { key: "activity",      label: "Activity",      icon: Activity,      count: events.length },
  ];

  return (
    <div className="wp-tabhost">
      {/* Tabs row — browser-tab pattern. Click swaps content in-place. */}
      <div className="wp-tabbar" role="tablist">
        {TABS.map((t) => {
          const Ico = t.icon;
          const on = active === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={on}
              className={`wp-tab ${on ? "on" : ""}`}
              onClick={() => setActive(t.key)}
            >
              <Ico size={15} />
              <span>{t.label}</span>
              <span className="wp-tab-count">{t.count}</span>
            </button>
          );
        })}
      </div>

      {/* Tab body — the active tab's full content fills the canvas. */}
      <div className="wp-tabbody">
        {active === "conversations" && (
          <div className="wp-convo">
            <aside className="wp-rail">
              <div className="wp-railhead">
                <span className="flex" style={{ gap: 7 }}><MessageCircle size={15} /> Conversations</span>
                <span className="faint" style={{ fontSize: 12 }}>{threads.length}</span>
              </div>
              <div className="wp-threads">
                {threads.length === 0 && <div className="faint" style={{ padding: 18, fontSize: 12.5 }}>No conversations yet. They appear as messages arrive.</div>}
                {threads.map((t) => {
                  const m = meta(t.channel); const Icon = m.icon; const last = t.messages[t.messages.length - 1];
                  return (
                    <button key={key(t)} className={`wp-thread ${sel === key(t) ? "on" : ""}`} onClick={() => { setSel(key(t)); setDraft(""); setAssignOpen(false); }}>
                      <span className={`aico ${m.tone}`} style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }}><Icon size={15} /></span>
                      <span style={{ minWidth: 0, flex: 1, textAlign: "left" }}>
                        <span className="between"><span className="strong" style={{ fontSize: 13 }}>{t.name}</span><span className="faint" style={{ fontSize: 10.5 }}>{ago(t.lastAt)}</span></span>
                        <span className="faint" style={{ display: "block", fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{clip(last?.body || last?.subject || "")}</span>
                      </span>
                      {t.unread > 0 && <span className="wp-unread">{t.unread}</span>}
                    </button>
                  );
                })}
              </div>
            </aside>

            <section className="wp-chat">
              {!activeThread ? (
                <div className="wp-empty">Pick a conversation to chat, or open an app from the Launchpad.</div>
              ) : (
                <>
                  <div className="wp-chathead">
                    <div className="flex" style={{ gap: 10, minWidth: 0 }}>
                      <span className={`aico ${meta(activeThread.channel).tone}`} style={{ width: 34, height: 34, borderRadius: 10 }}>{(() => { const I = meta(activeThread.channel).icon; return <I size={15} />; })()}</span>
                      <div style={{ minWidth: 0 }}>
                        <div className="strong" style={{ fontSize: 14 }}>{activeThread.name}</div>
                        <div className="faint" style={{ fontSize: 11.5 }}>{meta(activeThread.channel).label}{activeThread.phone ? ` · ${activeThread.phone}` : activeThread.email ? ` · ${activeThread.email}` : ""}</div>
                      </div>
                    </div>
                    <div className="flex" style={{ gap: 7 }}>
                      {activeThread.contactId && <button onClick={openProfile} className="btn ghost sm"><ExternalLink size={13} /> Open profile</button>}
                      <button onClick={() => setAssignOpen((o) => !o)} className={`btn sm ${assignOpen ? "teal" : "ghost"}`}><ListChecks size={13} /> Assign task</button>
                    </div>
                  </div>

                  {assignOpen && (
                    <form action={assignTask} className="wp-assign" onSubmit={() => setAssignOpen(false)}>
                      <input name="title" placeholder={`Task from ${activeThread.name}…`} autoFocus style={{ flex: 1, minWidth: 160 }} />
                      <input type="hidden" name="from_name" value={activeThread.name} />
                      <select name="assignee_id" defaultValue=""><option value="">Assign to…</option>{team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
                      <input type="date" name="due_on" style={{ width: 150 }} />
                      <button className="btn teal sm" type="submit">Assign</button>
                    </form>
                  )}

                  <div className="wp-msgs">
                    {activeThread.messages.map((msg: any) => (
                      <div key={msg.id} className={`wp-bubble ${msg.direction === "out" ? "out" : "in"}`}>
                        {msg.subject && <div className="strong" style={{ fontSize: 12, marginBottom: 3 }}>{msg.subject}</div>}
                        <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{clip(msg.body || "", 600)}</div>
                        <div className="wp-bubble-meta">{msg.status === "queued" ? "queued · " : ""}{ago(msg.created_at)}</div>
                      </div>
                    ))}
                  </div>

                  <form action={sendChat} className="wp-composer" onSubmit={() => setDraft("")}>
                    <input type="hidden" name="contact_id" value={activeThread.contactId || ""} />
                    <input type="hidden" name="channel" value={activeThread.channel} />
                    <input type="hidden" name="to" value={activeThread.email || ""} />
                    <textarea name="body" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Message ${activeThread.name} on ${meta(activeThread.channel).label}…`} rows={2} />
                    <div className="wp-composer-bar">
                      <button type="button" onClick={doDraft} className="btn ghost sm" disabled={drafting}><Sparkles size={13} /> {drafting ? "Sasa is writing…" : "Sasa draft"}</button>
                      <span className="flex" style={{ gap: 8 }}>
                        {activeThread.channel !== "email" && <span className="faint" style={{ fontSize: 11 }}>queues until WhatsApp is connected</span>}
                        <button type="submit" className="btn teal sm"><Send size={13} /> {activeThread.channel === "email" ? "Send" : "Queue"}</button>
                      </span>
                    </div>
                  </form>
                </>
              )}
            </section>
          </div>
        )}

        {active === "tasks" && (
          <div className="wp-fullpane">
            <div className="wp-railhead">
              <span className="flex" style={{ gap: 7 }}><ListChecks size={15} /> Tasks</span>
              <span className="faint" style={{ fontSize: 12 }}>{tasks.length} open</span>
            </div>
            <div className="wp-tasks-full">
              {tasks.length === 0 && <div className="faint" style={{ padding: 18, fontSize: 12.5 }}>No open tasks. Assign one from a conversation.</div>}
              {tasks.map((t) => (
                <a key={t.id} href="/tasks" className="wp-task">
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 500 }}>{t.title}</span>
                    <span className="faint" style={{ fontSize: 11 }}>{teamName(t.assignee_id)}{t.due_on ? ` · due ${t.due_on}` : ""}</span>
                  </span>
                  <span className={`badge ${t.priority === "high" ? "red" : t.priority === "low" ? "gray" : "gold"}`} style={{ fontSize: 10 }}>{t.priority || "med"}</span>
                </a>
              ))}
            </div>
            <div style={{ padding: "10px 14px", borderTop: "1px solid var(--line)" }}>
              <a href="/tasks" className="linkbtn strong"><Layers size={13} style={{ verticalAlign: -2, marginRight: 4 }} /> Open full Tasks board <ChevronRight size={13} style={{ verticalAlign: -2 }} /></a>
            </div>
          </div>
        )}

        {active === "activity" && (
          <div className="wp-fullpane">
            <div className="wp-railhead">
              <span className="flex" style={{ gap: 7 }}><Activity size={15} /> Live activity</span>
              <span className="faint" style={{ fontSize: 12 }}>{events.length} recent</span>
            </div>
            <div className="wp-activity-full">
              {events.length === 0 && <div className="empty" style={{ padding: 36, fontSize: 13 }}>Quiet so far. Activity shows here as messages, drafts, and actions land.</div>}
              {events.map((e: any, i: number) => {
                const { text, icon: Icon, tone } = eventLabel(e);
                return (
                  <div key={i} className="actrow">
                    <span className={`aico ${tone}`}><Icon size={14} /></span>
                    <div className="abody">
                      <div className="atitle">{text}</div>
                      {e.source && <div className="ameta">{e.source}</div>}
                    </div>
                    <span className="aright">{eventAgo(e.created_at)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
