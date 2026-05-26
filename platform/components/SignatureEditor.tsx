"use client";

import { useState } from "react";
import { saveSignature } from "../app/settings/actions";
import { MessageSquareQuote, Save, Eye, Code2 } from "lucide-react";

// Editable branded email signature per sending account (R2-5 #44). Each account
// (sasa@ -> Nisria, maisha@ -> Maisha) carries its own signature_html, which the
// send connector auto-appends to every outbound email. The logo is referenced by
// URL so it renders in recipients' inboxes.
//
// P8 "render, never show code": the LIVE PREVIEW is the primary, default view.
// The raw HTML textarea only appears behind an explicit "Edit HTML" toggle, so
// Nur never sees code as the main surface.
type Account = { address: string; label: string | null; brand: string | null; signature_html: string | null };
type LogoMap = Record<string, { data_uri: string } | undefined>;

function AccountSig({ acct, logo }: { acct: Account; logo?: string }) {
  const [html, setHtml] = useState(acct.signature_html || "");
  const [saved, setSaved] = useState(false);
  const [editHtml, setEditHtml] = useState(false);

  // P8: the preview renders the brand LOGO above the signature, exactly as the
  // send connector composes it (logoImgTag prepended in lib/email.ts), so what
  // Nur sees here is what the recipient sees, never code.
  const logoTag = logo ? `<img src="${logo}" alt="logo" style="height:40px;width:auto;display:block;margin-bottom:10px" />` : "";

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
      {/* the textarea is always present (so the form submits the HTML) but hidden
          unless Edit HTML is on — the preview is the primary view. */}
      <input type="hidden" name="signature_html" value={html} />
      <div className="between" style={{ marginBottom: 8 }}>
        <div className="flex" style={{ gap: 8 }}>
          <span className="strong" style={{ fontSize: 13 }}>{acct.address}</span>
          {acct.brand && <span className={`chip ${acct.brand}`}><span className="bdot" /> {acct.label || acct.brand}</span>}
        </div>
        <div className="flex" style={{ gap: 6 }}>
          <button type="button" className={`btn sm ghost ${editHtml ? "" : ""}`} onClick={() => setEditHtml((v) => !v)}>
            {editHtml ? <><Eye size={12} /> Preview</> : <><Code2 size={12} /> Edit HTML</>}
          </button>
          <button className="btn sm teal" type="submit"><Save size={12} /> {saved ? "Saved" : "Save"}</button>
        </div>
      </div>

      {/* PRIMARY: live rendered preview (what the recipient sees) */}
      <div className="faint" style={{ fontSize: 11, margin: "0 0 6px", display: "flex", gap: 5, alignItems: "center" }}>
        <Eye size={12} /> Live preview
      </div>
      <iframe
        title={`${acct.address} signature preview`}
        sandbox=""
        srcDoc={`<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#2a2d31;padding:6px">${logoTag}${html || (logoTag ? "" : "<span style='color:#889'>No signature set. Click ‘Edit HTML’ to add one.</span>")}</div>`}
        style={{ width: "100%", height: 150, border: "1px solid var(--line)", borderRadius: 8, background: "#fff" }}
      />

      {/* ADVANCED: raw HTML, only behind the toggle */}
      {editHtml && (
        <textarea
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          rows={5}
          style={{ marginTop: 10, fontSize: 12, fontFamily: "var(--font-mono, ui-monospace, monospace)", lineHeight: 1.5, width: "100%" }}
          placeholder="<table>…branded signature HTML…</table>"
        />
      )}
    </form>
  );
}

export default function SignatureEditor({ accounts, logos = {} }: { accounts: Account[]; logos?: LogoMap }) {
  const emailAccounts = accounts.filter((a) => a.address.includes("@"));
  return (
    <div className="card">
      <div className="card-h"><span className="flex"><MessageSquareQuote size={15} /> Email signature</span></div>
      <div style={{ padding: "4px 18px 14px" }}>
        <div className="faint" style={{ fontSize: 11.5, marginBottom: 4 }}>
          Auto-appended to every outbound email. Each account gets its own branding and logo.
        </div>
        {emailAccounts.length === 0 && <div className="empty">No email accounts yet.</div>}
        {emailAccounts.map((a) => <AccountSig key={a.address} acct={a} logo={logos[(a.brand || "nisria")]?.data_uri} />)}
      </div>
    </div>
  );
}
