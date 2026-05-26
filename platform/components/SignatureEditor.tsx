"use client";

import { useState } from "react";
import { saveSignature } from "../app/settings/actions";
import { MessageSquareQuote, Save, Eye } from "lucide-react";

// Editable branded email signature per sending account (R2-5 #44). Each account
// (sasa@ -> Nisria, maisha@ -> Maisha) carries its own signature_html, which the
// send connector auto-appends to every outbound email. Nur edits the HTML here
// with a live sandboxed preview. The logo is referenced by URL so it renders in
// recipients' inboxes.
type Account = { address: string; label: string | null; brand: string | null; signature_html: string | null };

function AccountSig({ acct }: { acct: Account }) {
  const [html, setHtml] = useState(acct.signature_html || "");
  const [saved, setSaved] = useState(false);

  return (
    <form
      action={async (fd: FormData) => {
        await saveSignature(fd);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }}
      style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}
    >
      <input type="hidden" name="address" value={acct.address} />
      <div className="between" style={{ marginBottom: 8 }}>
        <div className="flex" style={{ gap: 8 }}>
          <span className="strong" style={{ fontSize: 13 }}>{acct.address}</span>
          {acct.brand && <span className={`chip ${acct.brand}`}><span className="bdot" /> {acct.label || acct.brand}</span>}
        </div>
        <button className="btn sm teal" type="submit"><Save size={12} /> {saved ? "Saved" : "Save"}</button>
      </div>
      <textarea
        name="signature_html"
        value={html}
        onChange={(e) => setHtml(e.target.value)}
        rows={5}
        style={{ fontSize: 12, fontFamily: "var(--font-mono, ui-monospace, monospace)", lineHeight: 1.5, width: "100%" }}
        placeholder="<table>…branded signature HTML…</table>"
      />
      <div className="faint" style={{ fontSize: 11, margin: "8px 0 6px", display: "flex", gap: 5, alignItems: "center" }}>
        <Eye size={12} /> Live preview
      </div>
      <iframe
        title={`${acct.address} signature preview`}
        sandbox=""
        srcDoc={`<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#2a2d31;padding:6px">${html || "<span style='color:#889'>No signature set.</span>"}</div>`}
        style={{ width: "100%", height: 110, border: "1px solid var(--line)", borderRadius: 8, background: "#fff" }}
      />
    </form>
  );
}

export default function SignatureEditor({ accounts }: { accounts: Account[] }) {
  const emailAccounts = accounts.filter((a) => a.address.includes("@"));
  return (
    <div className="card">
      <div className="card-h"><span className="flex"><MessageSquareQuote size={15} /> Email signature</span></div>
      <div style={{ padding: "4px 18px 14px" }}>
        <div className="faint" style={{ fontSize: 11.5, marginBottom: 4 }}>
          Auto-appended to every outbound email. Each account gets its own branding.
        </div>
        {emailAccounts.length === 0 && <div className="empty">No email accounts yet.</div>}
        {emailAccounts.map((a) => <AccountSig key={a.address} acct={a} />)}
      </div>
    </div>
  );
}
