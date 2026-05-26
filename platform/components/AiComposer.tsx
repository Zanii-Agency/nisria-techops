"use client";

import { useState } from "react";
import { Send, Sparkles, Undo2, PenLine } from "lucide-react";
import AttachPicker from "./AttachPicker";

// Universal manual compose field with two AI affordances, reusing the exact
// /api/improve flow that ApprovalCard already uses:
//   - "Improve with AI": rewrites the current subject/body in place, with undo.
//   - "Draft with Sasa" (when draftDonorId is set): pre-fills a context-appropriate
//     message (thank-you for a recent gift, else a warm check-in) from /api/donor-draft.
// Renders a real <form action={action}> so the existing server actions
// (emailContact / sendReply) submit exactly as before. Nothing auto-sends.
export default function AiComposer({
  action,
  hidden,
  recipientLabel,
  recipientEmail,
  defaultSubject = "",
  defaultBody = "",
  bodyPlaceholder = "Write a message…",
  subjectRequired = false,
  bodyRequired = false,
  rows = 4,
  showSubject = true,
  draftDonorId,
  sendLabel = "Send email",
  sendClass = "btn teal",
  className,
  formStyle,
  allowAttach = true,
  account,
  allowAccountPick = false,
}: {
  action: (fd: FormData) => void | Promise<void>;
  hidden?: Record<string, string>;
  recipientLabel?: string;
  recipientEmail?: string;
  defaultSubject?: string;
  defaultBody?: string;
  bodyPlaceholder?: string;
  subjectRequired?: boolean;
  bodyRequired?: boolean;
  rows?: number;
  showSubject?: boolean;
  draftDonorId?: string;
  sendLabel?: string;
  sendClass?: string;
  className?: string;
  formStyle?: React.CSSProperties;
  // R2-5: attach a Studio / Library document to the email.
  allowAttach?: boolean;
  // sending account that picks the branded signature (sasa@ -> Nisria,
  // maisha@ -> Maisha). When allowAccountPick is on, Nur can switch it.
  account?: string;
  allowAccountPick?: boolean;
}) {
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [busy, setBusy] = useState<null | "improve" | "draft">(null);
  const [attachRefs, setAttachRefs] = useState<string[]>([]);
  const [acct, setAcct] = useState(account || "sasa@nisria.co");
  // snapshot for one-tap undo of the last AI rewrite/draft
  const [prev, setPrev] = useState<{ subject: string; body: string } | null>(null);

  async function improve() {
    if (busy) return;
    setBusy("improve");
    setPrev({ subject, body });
    try {
      const r = await fetch("/api/improve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject, body, to: recipientEmail }),
      });
      const j = await r.json();
      if (j.body) setBody(j.body);
      if (showSubject && j.subject) setSubject(j.subject);
    } finally {
      setBusy(null);
    }
  }

  async function draft() {
    if (busy || !draftDonorId) return;
    setBusy("draft");
    setPrev({ subject, body });
    try {
      const r = await fetch("/api/donor-draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ donor_id: draftDonorId }),
      });
      const j = await r.json();
      if (j.body) setBody(j.body);
      if (showSubject && j.subject) setSubject(j.subject);
    } finally {
      setBusy(null);
    }
  }

  function undo() {
    if (!prev) return;
    setSubject(prev.subject);
    setBody(prev.body);
    setPrev(null);
  }

  const defaultFormStyle: React.CSSProperties = {
    borderTop: "1px solid var(--line)",
    padding: "16px 22px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  };

  return (
    <form action={action} className={className} style={formStyle ?? defaultFormStyle}>
      {Object.entries(hidden || {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}

      {/* sending account (branded signature) + picked attachments travel with the form */}
      <input type="hidden" name="account" value={acct} />
      <input type="hidden" name="attach_refs" value={attachRefs.join(",")} />

      {/* Always show which account this sends from (P14). The branded signature
          for that account is appended automatically by lib/email. */}
      <div className="faint" style={{ fontSize: 11.5 }}>
        Sending from {acct} · the branded signature is added automatically.
      </div>

      {(recipientLabel || recipientEmail) && (
        <div className="between" style={{ gap: 10 }}>
          <span className="muted" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>{recipientLabel}</span>
          {recipientEmail && <span className="faint" style={{ fontSize: 12 }}>{recipientEmail}</span>}
        </div>
      )}

      {showSubject && (
        <input
          name="subject"
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required={subjectRequired}
          style={{ fontSize: 13 }}
        />
      )}

      <textarea
        name="body"
        placeholder={bodyPlaceholder}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={rows}
        required={bodyRequired}
        style={{ resize: "vertical" }}
      />

      <div className="flex wrap" style={{ justifyContent: "flex-end", gap: 8 }}>
        {allowAccountPick && (
          <select
            value={acct}
            onChange={(e) => setAcct(e.target.value)}
            style={{ fontSize: 12, maxWidth: 150, marginRight: "auto" }}
            title="Send from (sets the branded signature)"
          >
            <option value="sasa@nisria.co">From: Nisria</option>
            <option value="maisha@nisria.co">From: Maisha</option>
          </select>
        )}
        {allowAttach && <AttachPicker selected={attachRefs} onChange={setAttachRefs} size="sm" />}
        {draftDonorId && (
          <button type="button" className="btn ghost sm" onClick={draft} disabled={!!busy}>
            <PenLine size={13} /> {busy === "draft" ? "Drafting…" : "Draft with Sasa"}
          </button>
        )}
        <button type="button" className="btn ghost sm" onClick={improve} disabled={!!busy}>
          <Sparkles size={13} /> {busy === "improve" ? "Improving…" : "Improve with AI"}
        </button>
        {prev && (
          <button type="button" className="btn ghost sm" onClick={undo} disabled={!!busy} title="Undo the last AI change">
            <Undo2 size={13} /> Undo
          </button>
        )}
        <button type="submit" className={sendClass}>
          <Send size={14} /> {sendLabel}
        </button>
      </div>
    </form>
  );
}
