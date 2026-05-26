"use client";

import { useState } from "react";
import { Badge } from "./ui";
import { useTabs } from "./tabs-context";
import { decideApproval } from "../app/approvals/actions";
import { Send, Sparkles, Maximize2 } from "lucide-react";

function ago(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return `${Math.floor(s / 86400)}d ago`;
}

// Which mailbox is this from? sasa@ shows as "Nisria", maisha@ as "Maisha".
function acctChip(account?: string | null): { label: string; cls: string } | null {
  if (account === "maisha@nisria.co") return { label: "Maisha", cls: "maisha" };
  if (account === "sasa@nisria.co") return { label: "Nisria", cls: "nisria" };
  return null;
}

// The full reply, self-contained so it owns its own editable state INSIDE the
// focus sheet (the sheet host renders it detached from this card). This is what
// the "expand" button opens — large, centered, minimizable to the tab strip.
function ReplyEditor({ a, original }: { a: any; original?: { subject?: string; body?: string; from?: string } | null }) {
  const editable = a.kind === "email_reply" || a.kind === "donor_thankyou";
  const [subject, setSubject] = useState(a.proposed?.subject || "");
  const [body, setBody] = useState(a.proposed?.body || "");
  const [busy, setBusy] = useState(false);

  async function improve() {
    setBusy(true);
    try {
      const r = await fetch("/api/improve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subject, body, to: a.proposed?.to, context: a.context }) });
      const j = await r.json();
      if (j.body) setBody(j.body);
      if (j.subject) setSubject(j.subject);
    } finally { setBusy(false); }
  }

  return (
    <>
      {original?.body && (
        <div style={{ marginBottom: 16 }}>
          <div className="faint" style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>In reply to{original.from ? ` ${original.from}` : ""}{original.subject ? ` · ${original.subject}` : ""}</div>
          <div className="peek-quote">{original.body}</div>
        </div>
      )}
      {editable ? (
        <form action={decideApproval}>
          <input type="hidden" name="id" value={a.id} />
          <div className="faint" style={{ fontSize: 12.5, marginBottom: 6 }}>To {a.proposed?.to || "—"}</div>
          <input name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} style={{ marginBottom: 10, fontSize: 14 }} />
          <textarea name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={16} style={{ fontSize: 14, lineHeight: 1.6 }} />
          <div className="flex wrap" style={{ marginTop: 10 }}>
            <button className="btn sm teal" name="decision" value="approve" type="submit"><Send size={13} /> Approve &amp; send</button>
            <button className="btn sm ghost" type="button" onClick={improve} disabled={busy}><Sparkles size={13} /> {busy ? "Improving…" : "Improve with AI"}</button>
            <button className="btn sm ghost" name="decision" value="reject" type="submit" formNoValidate>Decline</button>
          </div>
        </form>
      ) : (
        <form action={decideApproval}>
          <input type="hidden" name="id" value={a.id} />
          {a.summary && <div style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.6, marginBottom: 12 }}>{a.summary}</div>}
          <div className="flex" style={{ marginTop: 4 }}>
            <button className="btn sm teal" name="decision" value="approve" type="submit">Approve</button>
            <button className="btn sm ghost" name="decision" value="reject" type="submit">Decline</button>
          </div>
        </form>
      )}
    </>
  );
}

export default function ApprovalCard({ a, original }: { a: any; original?: { subject?: string; body?: string; from?: string } | null }) {
  const editable = a.kind === "email_reply" || a.kind === "donor_thankyou";
  const [subject, setSubject] = useState(a.proposed?.subject || "");
  const [body, setBody] = useState(a.proposed?.body || "");
  const [busy, setBusy] = useState(false);
  const { openSheet } = useTabs();
  const chip = acctChip(a.context?.account);

  async function improve() {
    setBusy(true);
    try {
      const r = await fetch("/api/improve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subject, body, to: a.proposed?.to, context: a.context }) });
      const j = await r.json();
      if (j.body) setBody(j.body);
      if (j.subject) setSubject(j.subject);
    } finally { setBusy(false); }
  }

  // A clear, human tab title — NEVER an id. "Reply to <name>" when we can read
  // the recipient, else the approval's own title.
  function sheetTitle() {
    const to = a.proposed?.to || original?.from || "";
    const who = (to.split("@")[0] || "").replace(/[._-]+/g, " ").trim();
    if ((a.kind === "email_reply" || a.kind === "donor_thankyou") && who) {
      return `Reply to ${who.replace(/\b\w/g, (c: string) => c.toUpperCase())}`.slice(0, 28);
    }
    return (a.title || "Needs you").slice(0, 28);
  }

  function expand() {
    openSheet({
      id: `approval:${a.id}`,
      title: sheetTitle(),
      icon: "inbox",
      brand: chip?.cls,
      width: 720,
      titleExtra: (
        <>
          {chip && <span className={`chip ${chip.cls}`}><span className="bdot" /> {chip.label}</span>}
          {a.lane === "escalate" && <Badge tone="red">Escalated</Badge>}
          {a.agent && <Badge tone="teal">{String(a.agent).replace("agent:", "")}</Badge>}
        </>
      ),
      render: () => <ReplyEditor a={a} original={original} />,
    });
  }

  const actions = (
    <div className="flex wrap" style={{ marginTop: 10 }}>
      <button className="btn sm teal" name="decision" value="approve" type="submit"><Send size={13} /> Approve &amp; send</button>
      <button className="btn sm ghost" type="button" onClick={improve} disabled={busy}><Sparkles size={13} /> {busy ? "Improving…" : "Improve with AI"}</button>
      <button className="btn sm ghost" name="decision" value="reject" type="submit" formNoValidate>Decline</button>
    </div>
  );

  return (
    // compact card in the Needs You scroller. "Expand" opens the full reply in
    // the centered focus sheet (replaces the old small/left popup, #143/#146).
    <form action={decideApproval} className="card" style={{ padding: 14, boxShadow: "none", background: "var(--surface-2)", height: "fit-content" }}>
      <input type="hidden" name="id" value={a.id} />
      <div className="between" style={{ marginBottom: 8 }}>
        <div className="flex">
          <span className="strong" style={{ fontSize: 13.5 }}>{a.title}</span>
          {chip && <span className={`chip ${chip.cls}`}><span className="bdot" /> {chip.label}</span>}
          {a.lane === "escalate" && <Badge tone="red">Escalated</Badge>}
        </div>
        <div className="flex" style={{ gap: 6 }}>
          <span className="faint" style={{ fontSize: 11 }}>{ago(a.created_at)}</span>
          <button type="button" className="expandbtn tip-host" data-tip="Open full view" aria-label="Open full view" onClick={expand}><Maximize2 size={14} /></button>
        </div>
      </div>
      {editable ? (
        <>
          {original?.body && (
            <details style={{ marginBottom: 8 }}>
              <summary style={{ fontSize: 11.5, fontWeight: 600, color: "var(--muted)", cursor: "pointer" }}>In reply to{original.from ? ` ${original.from}` : ""}</summary>
              <div style={{ marginTop: 6, padding: "8px 10px", background: "var(--canvas)", borderRadius: 8, fontSize: 12, color: "var(--ink-2)", maxHeight: 120, overflowY: "auto", whiteSpace: "pre-wrap" }}>{original.body}</div>
            </details>
          )}
          <div className="faint" style={{ fontSize: 12, marginBottom: 6 }}>To {a.proposed?.to || "—"}</div>
          <input name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} style={{ marginBottom: 8, fontSize: 13 }} />
          <textarea name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={5} style={{ fontSize: 13, lineHeight: 1.5 }} />
          {actions}
        </>
      ) : (
        <>
          {a.summary && <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55, marginBottom: 4 }}>{a.summary}</div>}
          <div className="flex" style={{ marginTop: 10 }}>
            <button className="btn sm teal" name="decision" value="approve" type="submit">Approve</button>
            <button className="btn sm ghost" name="decision" value="reject" type="submit">Decline</button>
          </div>
        </>
      )}
    </form>
  );
}
