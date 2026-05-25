"use client";

import { useState } from "react";
import { Badge } from "./ui";
import { decideApproval } from "../app/approvals/actions";
import { Send, Sparkles } from "lucide-react";

function ago(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return `${Math.floor(s / 86400)}d ago`;
}

export default function ApprovalCard({ a, original }: { a: any; original?: { subject?: string; body?: string; from?: string } | null }) {
  const editable = a.kind === "email_reply" || a.kind === "donor_thankyou";
  const [subject, setSubject] = useState(a.proposed?.subject || "");
  const [body, setBody] = useState(a.proposed?.body || "");
  const [busy, setBusy] = useState(false);

  async function improve() {
    setBusy(true);
    try {
      const r = await fetch("/api/improve", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject, body, to: a.proposed?.to, context: a.context }),
      });
      const j = await r.json();
      if (j.body) setBody(j.body);
      if (j.subject) setSubject(j.subject);
    } finally { setBusy(false); }
  }

  return (
    <form action={decideApproval} className="card" style={{ padding: 14, boxShadow: "none", background: "var(--surface-2)", height: "fit-content" }}>
      <input type="hidden" name="id" value={a.id} />
      <div className="between" style={{ marginBottom: 8 }}>
        <div className="flex">
          <span className="strong" style={{ fontSize: 13.5 }}>{a.title}</span>
          {a.lane === "escalate" && <Badge tone="red">Escalated</Badge>}
        </div>
        <span className="faint" style={{ fontSize: 11 }}>{ago(a.created_at)}</span>
      </div>
      {original?.body && (
        <details style={{ marginBottom: 8 }}>
          <summary style={{ fontSize: 11.5, fontWeight: 600, color: "var(--muted)", cursor: "pointer" }}>
            In reply to{original.from ? ` ${original.from}` : ""}{original.subject ? ` · ${original.subject}` : ""}
          </summary>
          <div style={{ marginTop: 6, padding: "8px 10px", background: "var(--canvas)", borderRadius: 8, borderLeft: "3px solid var(--line-2)", fontSize: 12, color: "var(--ink-2)", lineHeight: 1.5, maxHeight: 140, overflowY: "auto", whiteSpace: "pre-wrap" }}>
            {original.body}
          </div>
        </details>
      )}
      {editable ? (
        <>
          <div className="faint" style={{ fontSize: 12, marginBottom: 6 }}>To {a.proposed?.to || "—"}</div>
          <input name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} style={{ marginBottom: 8, fontSize: 13 }} />
          <textarea name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={6} style={{ fontSize: 13, lineHeight: 1.5 }} />
          <div className="flex wrap" style={{ marginTop: 10 }}>
            <button className="btn sm teal" name="decision" value="approve" type="submit"><Send size={13} /> Approve &amp; send</button>
            <button className="btn sm ghost" type="button" onClick={improve} disabled={busy}><Sparkles size={13} /> {busy ? "Improving…" : "Improve with AI"}</button>
            <button className="btn sm ghost" name="decision" value="reject" type="submit" formNoValidate>Decline</button>
          </div>
        </>
      ) : (
        <>
          <pre style={{ fontSize: 12, whiteSpace: "pre-wrap", color: "var(--ink-2)" }}>{JSON.stringify(a.proposed, null, 2)}</pre>
          <div className="flex" style={{ marginTop: 10 }}>
            <button className="btn sm teal" name="decision" value="approve" type="submit">Approve</button>
            <button className="btn sm ghost" name="decision" value="reject" type="submit">Decline</button>
          </div>
        </>
      )}
    </form>
  );
}
