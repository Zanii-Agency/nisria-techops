import Shell from "../../components/Shell";
import { Badge } from "../../components/ui";
import { admin, date } from "../../lib/supabase-admin";
import { needsReplyCount } from "../../lib/counts";
import { getCurrentUser } from "../../lib/auth";
import { ownerContactIds } from "../../lib/privacy";
import { cleanEmail, snippet, isIndividual } from "../../lib/email-render";
import { sendReply } from "./actions";
import { decideApprovalAction } from "../approvals/actions";
import ActionForm from "../../components/ActionForm";
import { SubmitButton } from "../../components/SubmitButton";
import AiComposer from "../../components/AiComposer";
import { Sparkles, Send, Mail, MessageCircle, Hash, Inbox as InboxIcon, Info, Layers } from "lucide-react";

export const dynamic = "force-dynamic";

function timeShort(iso: string) {
  const d = new Date(iso); const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
// Full stamp for a message bubble: date AND time (e.g. "Jun 3, 9:16 PM"), today shows just the time.
function whenFull(iso: string) {
  const d = new Date(iso); const now = new Date();
  const t = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return t;
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${t}`;
}

const FILTERS = [
  { k: "needs", label: "Needs reply", icon: Mail },
  { k: "all", label: "All mail", icon: Mail },
  { k: "nisria", label: "Nisria · sasa@", icon: Mail },
  { k: "maisha", label: "Maisha · maisha@", icon: Mail },
  { k: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { k: "social", label: "Social", icon: Hash },
];

function matchFilter(m: any, f: string): boolean {
  if (f === "all" || f === "needs" || !f) return true;
  if (f === "nisria") return m.account === "sasa@nisria.co";
  if (f === "maisha") return m.account === "maisha@nisria.co";
  if (f === "whatsapp") return m.channel === "whatsapp";
  if (f === "social") return ["instagram", "facebook", "social", "x", "linkedin"].includes(m.channel);
  return true;
}

// LANES: the primary "Needs You / Inbox" split, by what the item IS, derived
// from real fields only. There is no per-conversation assignee on messages
// (assignee lives on tasks, a different surface), so we do NOT fabricate an
// "Assigned to me" lane. The honest lanes are:
//   needs   — a person is waiting on a reply (unread > 0) and Sasa hasn't drafted one
//   drafts  — Sasa has a pending draft reply for this conversation (the approvals queue)
//   fyi     — automated / non-individual senders, nothing to reply to
//   all     — everything in the current account/channel view
const LANES = [
  { k: "needs", label: "Needs you", icon: InboxIcon },
  { k: "drafts", label: "Sasa drafts", icon: Sparkles },
  { k: "fyi", label: "FYI", icon: Info },
  { k: "all", label: "All", icon: Layers },
] as const;

export default async function Inbox({ searchParams }: { searchParams: { c?: string; f?: string; lane?: string } }) {
  const db = admin();
  const f = searchParams.f || "all";
  const lane = searchParams.lane || "needs";
  const [{ data: msgs }, { data: aps }, needsReply] = await Promise.all([
    // exclude backfilled chat history + live group traffic from the 1:1 inbox
    // (it belongs on the Groups page + profiles, not as live conversations).
    db.from("messages").select("id,contact_id,channel,account,sender_type,direction,subject,body,status,created_at,contact:contacts(id,name,email,channel)").not("handled_by", "in", "(backfill,group-bot)").order("created_at", { ascending: false }).limit(500),
    db.from("approvals").select("id,kind,proposed,context,lane,status,created_at").eq("status", "pending").eq("kind", "email_reply"),
    needsReplyCount(db),
  ]);

  // PRIVACY WALL: the owner's (Taona's) 727 thread is private. Only the owner
  // (auth role "builder") sees it in the inbox; for Nur it is filtered out
  // entirely, threads and messages both. Owner-view = full visibility.
  const viewerIsOwner = getCurrentUser()?.role === "builder";
  const ownerIds = viewerIsOwner ? [] : await ownerContactIds(db);
  const visibleMsgs = ((msgs || []) as any[]).filter((m) => viewerIsOwner || !ownerIds.includes(m.contact_id));

  const filtered = visibleMsgs.filter((m) => matchFilter(m, f));
  const byContact = new Map<string, any>();
  for (const m of filtered) {
    const cid = m.contact_id || "none";
    if (!byContact.has(cid)) byContact.set(cid, { cid, contact: m.contact, last: m, count: 0, unread: 0, account: m.account, channel: m.channel });
    const conv = byContact.get(cid);
    conv.count++;
    if (m.direction === "in" && (m.status === "new" || m.status === "drafted") && m.sender_type === "individual") conv.unread++;
  }
  const allConvs = [...byContact.values()].sort((a, b) => new Date(b.last.created_at).getTime() - new Date(a.last.created_at).getTime());

  // The set of conversations Sasa has drafted a pending reply for, keyed by the
  // approval's context.contact_id. Drives the "Sasa drafts" lane and its count.
  const draftContactIds = new Set<string>(((aps || []) as any[]).map((a) => a.context?.contact_id).filter(Boolean));

  // Per-conversation lane membership, from real fields only.
  const isNeeds = (c: any) => c.unread > 0 && !draftContactIds.has(c.cid);   // a person waiting, Sasa hasn't drafted
  const isDraft = (c: any) => draftContactIds.has(c.cid);                      // Sasa has a pending draft
  const isFyi = (c: any) => !isIndividual(c.contact?.email, c.last?.sender_type) && c.unread === 0; // automated, nothing to reply to

  const laneFn: Record<string, (c: any) => boolean> = {
    needs: isNeeds,
    drafts: isDraft,
    fyi: isFyi,
    all: () => true,
  };
  const laneCount = (k: string) => allConvs.filter(laneFn[k] || (() => true)).length;
  const convs = allConvs.filter(laneFn[lane] || (() => true));

  const selected = searchParams.c || convs[0]?.cid;
  const thread = visibleMsgs.filter((m) => (m.contact_id || "none") === selected).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const sel = byContact.get(selected) || (selected ? { cid: selected, contact: thread[0]?.contact, count: thread.length } : null);
  const draft = (aps || []).find((a: any) => a.context?.contact_id === selected);
  const toAddr = sel?.contact?.email || "";
  const individual = isIndividual(toAddr, thread[thread.length - 1]?.sender_type);
  // Header count comes from the single source of truth so the inbox, dashboard
  // and bell can never disagree. (Per-conversation .unread still drives the list
  // badges + the "needs" filter, using the same new|drafted definition.)
  const newCount = needsReply;

  const acctLabel = (m: any) => m?.account === "maisha@nisria.co" ? "Maisha" : m?.account === "sasa@nisria.co" ? "Nisria" : (m?.channel && m.channel !== "email" ? m.channel : "");

  return (
    <Shell title="Inbox" sub={`${convs.length} conversations · ${newCount} need attention`}>
      {/* LANES: primary split by what the item is (links set ?lane=, filter in-page) */}
      <div className="flex wrap" style={{ marginBottom: 12, gap: 7 }}>
        {LANES.map((x) => {
          const n = laneCount(x.k);
          return (
            <a key={x.k} href={`/inbox?lane=${x.k}&f=${f}`} className={`pill ${lane === x.k ? "on" : ""}`}>
              <x.icon size={13} /> {x.label}
              {n > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: lane === x.k ? "rgba(255,255,255,0.22)" : "var(--surface-2)", color: lane === x.k ? "#fff" : "var(--muted)" }}>{n}</span>
              )}
            </a>
          );
        })}
      </div>

      {/* secondary refine: account / channel (the existing ?f= filter, preserved) */}
      <div className="flex wrap" style={{ marginBottom: 14, gap: 6, alignItems: "center" }}>
        <span className="faint" style={{ fontSize: 11.5, marginRight: 2 }}>Filter</span>
        {FILTERS.filter((x) => x.k !== "needs").map((x) => (
          <a key={x.k} href={`/inbox?lane=${lane}&f=${x.k}`} className={`pill ${f === x.k ? "on" : ""}`} style={{ padding: "5px 11px", fontSize: 12 }}>
            <x.icon size={12} /> {x.label}
          </a>
        ))}
        <a href="/team" className="pill" style={{ marginLeft: "auto" }} title="Connect another mailbox or channel">+ Add account</a>
      </div>

      <div className="mail">
        <div className="mail-list">
          {convs.length === 0 && <div className="empty">{lane === "needs" ? "All caught up. Nothing needs a reply right now." : "No messages in this view yet."}</div>}
          {convs.map((c) => {
            const name = c.contact?.name || (c.contact?.email || "Unknown").split("@")[0];
            const active = c.cid === selected;
            const al = acctLabel(c.last);
            // left accent rail reflects what the row IS, so the queue reads at a glance
            const hasDraft = isDraft(c);
            const railColor = hasDraft ? "var(--peri-700)" : c.unread > 0 ? "var(--gold)" : "var(--line-2)";
            return (
              <a key={c.cid} href={`/inbox?lane=${lane}&f=${f}&c=${c.cid}`} className={`mail-row ${active ? "active" : ""} ${c.unread ? "unread" : ""}`} style={active ? undefined : { borderLeftColor: railColor }}>
                <div className="mr-top">
                  <span className="mr-from">{name}</span>
                  <span className="mr-time">{timeShort(c.last.created_at)}</span>
                </div>
                <div className="mr-subj">{c.last.subject || "(no subject)"}</div>
                <div className="mr-snip">{snippet(c.last.body || "", 72)}</div>
                <div className="flex" style={{ marginTop: 6, gap: 6 }}>
                  {hasDraft && <Badge tone="peri"><Sparkles size={11} /> Sasa drafted</Badge>}
                  {c.unread > 0 && <Badge tone="gold">{c.unread} new</Badge>}
                  {al && <span className={`chip ${al === "Maisha" ? "maisha" : "nisria"}`}><span className="bdot" /> {al}</span>}
                </div>
              </a>
            );
          })}
        </div>

        <div className="mail-read">
          {!sel && <div className="empty">Pick a conversation on the left to read and reply.</div>}
          {sel && (
            <>
              <div className="between">
                <div>
                  <div className="mr-h">{sel.contact?.name || (toAddr || "Unknown").split("@")[0]}</div>
                  <div className="mr-meta">{toAddr || "—"} · {sel.count} messages{acctLabel(sel.last || thread[0]) ? ` · ${acctLabel(sel.last || thread[0])}` : ""}</div>
                </div>
                {individual && selected !== "none" && <a className="pill" href={`/contacts/${selected}`}>View profile</a>}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18, marginTop: 12 }}>
                {thread.map((m) => (
                  <div key={m.id} className="card" style={{ padding: 14, boxShadow: "none", background: m.direction === "out" ? "var(--teal-50)" : "var(--surface-2)", marginLeft: m.direction === "out" ? 40 : 0, marginRight: m.direction === "out" ? 0 : 40 }}>
                    <div className="between" style={{ marginBottom: 5 }}>
                      <span style={{ fontWeight: 600, fontSize: 12.5 }}>{m.direction === "out" ? "Nisria" : (sel.contact?.name || "Them")}{m.handled_by?.startsWith("agent") ? " · via Sasa" : ""}</span>
                      <span className="faint" style={{ fontSize: 11 }}>{whenFull(m.created_at)}</span>
                    </div>
                    {m.subject && <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{m.subject}</div>}
                    <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink-2)", whiteSpace: "pre-wrap" }}>{cleanEmail(m.body || "")}</div>
                  </div>
                ))}
              </div>

              {draft && (
                <ActionForm action={decideApprovalAction} className="card" style={{ padding: 16, background: "var(--peri-50)", border: "1px solid var(--peri-100)", marginBottom: 14 }}>
                  <input type="hidden" name="id" value={draft.id} />
                  <input type="hidden" name="confirm_label" value={draft.proposed?.to || ""} />
                  <div className="flex" style={{ marginBottom: 8 }}>
                    <Sparkles size={15} color="var(--peri-700)" />
                    <span style={{ fontWeight: 600, fontSize: 13, color: "var(--peri-700)" }}>Sasa drafted a reply</span>
                    {draft.lane === "escalate" && <Badge tone="red">Escalated</Badge>}
                  </div>
                  <input name="subject" defaultValue={draft.proposed?.subject || ""} style={{ marginBottom: 8, fontSize: 13 }} />
                  <textarea name="body" defaultValue={draft.proposed?.body || ""} rows={6} style={{ fontSize: 13, lineHeight: 1.6 }} />
                  <div className="flex" style={{ marginTop: 10 }}>
                    <SubmitButton className="btn sm teal" name="decision" value="approve" pendingLabel="Sending…"><Send size={13} /> Approve &amp; send</SubmitButton>
                    <SubmitButton className="btn sm ghost" name="decision" value="reject" formNoValidate pendingLabel="Declining…">Decline</SubmitButton>
                  </div>
                </ActionForm>
              )}

              {!draft && individual && toAddr && (
                <AiComposer
                  action={sendReply}
                  className="card"
                  formStyle={{ padding: 16, boxShadow: "none", display: "flex", flexDirection: "column", gap: 8 }}
                  hidden={{ contact_id: String(selected), to: toAddr }}
                  recipientLabel={`Reply to ${toAddr}`}
                  defaultSubject={`Re: ${thread[thread.length - 1]?.subject || ""}`}
                  bodyPlaceholder="Write a reply…"
                  rows={4}
                  sendLabel="Send"
                  sendClass="btn sm teal"
                  account={sel.account || thread[thread.length - 1]?.account || "sasa@nisria.co"}
                />
              )}

              {!individual && !draft && (
                <div className="card" style={{ padding: 14, boxShadow: "none", background: "var(--surface-2)" }}>
                  <span className="muted" style={{ fontSize: 12.5 }}>Automated sender, no reply needed. Sasa extracts anything useful (donations, alerts) automatically.</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}
