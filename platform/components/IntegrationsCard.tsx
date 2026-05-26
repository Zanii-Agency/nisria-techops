"use client";

import { useState } from "react";
import { saveZaniiConfig } from "../app/settings/actions";
import type { Integration } from "../lib/integrations";
import { Plug, Save, Loader2, CheckCircle2, AlertTriangle, Clock } from "lucide-react";

// The integrations area (R3-5 / P12, img 171). Renders the Zanii connector as an
// honest STUB: the key fields we will need (API key, workspace/account id, base
// URL, what it syncs) plus a clear "not connected, code coming" status. Saving
// stores the shape on the connector row so the real Zanii code drops in as a
// wiring job. We never pretend a sync runs; the status reflects the truth.

const FIELDS: { key: string; label: string; secret?: boolean; hint?: string; placeholder?: string }[] = [
  { key: "api_key", label: "Zanii API key", secret: true, hint: "Paste when Nur hands over the Zanii code.", placeholder: "zk_live_…" },
  { key: "workspace_id", label: "Workspace ID", hint: "The Zanii workspace this org maps to.", placeholder: "ws_…" },
  { key: "account_id", label: "Ads account ID", hint: "The Zanii Ads account to read spend from.", placeholder: "acct_…" },
  { key: "base_url", label: "API base URL", hint: "Defaults to https://zanii.agency.", placeholder: "https://zanii.agency" },
  { key: "syncs", label: "What it syncs", hint: "What flows between Zanii and the Command Center." },
];

export default function IntegrationsCard({ zanii }: { zanii: Integration | null }) {
  const cfg = zanii?.config || {};
  const [vals, setVals] = useState<Record<string, string>>({
    // never hydrate the secret into the input; show a masked marker instead
    api_key: "",
    workspace_id: cfg.workspace_id || "",
    account_id: cfg.account_id || "",
    base_url: cfg.base_url || "",
    syncs: cfg.syncs || "",
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasKey = !!(cfg.api_key && cfg.api_key.length);

  async function save() {
    if (busy) return;
    setBusy(true); setSaved(false); setError(null);
    try {
      const fd = new FormData();
      for (const f of FIELDS) fd.append(f.key, vals[f.key] ?? "");
      const res = await saveZaniiConfig(fd);
      if (res.ok) { setSaved(true); setVals((v) => ({ ...v, api_key: "" })); }
      else setError(res.error || "Could not save.");
    } catch (e: any) {
      setError(e?.message || "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" id="integrations">
      <div className="card-h">
        <span className="flex"><Plug size={15} /> Integrations</span>
        <span className="badge gray">stub</span>
      </div>
      <div className="card-pad stack" style={{ gap: 14 }}>
        <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
          Where outside tools connect to the Command Center. Zanii is mapped here with the key fields it will need; the live code is coming, so this is the shape, not a running sync yet.
        </div>

        {/* Zanii entry */}
        <div className="stack" style={{ gap: 12, border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "14px 15px" }}>
          <div className="between">
            <span className="flex" style={{ gap: 9, alignItems: "center" }}>
              <span className="aico" style={{ width: 32, height: 32, borderRadius: 9, background: "var(--surface-2, var(--surface))", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 13 }}>Z</span>
              <span>
                <span className="strong" style={{ fontSize: 13.5 }}>Zanii</span>
                <span className="faint" style={{ display: "block", fontSize: 11 }}>Ads spend, campaign metrics, lead handoff</span>
              </span>
            </span>
            <span className="badge gold" style={{ fontSize: 10 }}>
              <Clock size={10} /> not connected · code coming
            </span>
          </div>

          <div className="faint" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
            {cfg.status_note || "Awaiting the Zanii code Nur will provide. Wiring it in is a config job, not a redesign."}
          </div>

          <div className="stack" style={{ gap: 9 }}>
            {FIELDS.map((f) => (
              <label key={f.key} className="stack" style={{ gap: 3, fontSize: 11.5 }}>
                <span className="faint">{f.label}{f.secret && hasKey ? " · a key is stored" : ""}</span>
                <input
                  type={f.secret ? "password" : "text"}
                  value={vals[f.key] ?? ""}
                  placeholder={f.secret && hasKey ? "•••••••• (stored, leave blank to keep)" : f.placeholder || ""}
                  onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
                  disabled={busy}
                  autoComplete="off"
                />
                {f.hint && <span className="faint" style={{ fontSize: 10.5 }}>{f.hint}</span>}
              </label>
            ))}
          </div>

          <div className="flex" style={{ gap: 10, alignItems: "center" }}>
            <button type="button" className="btn sm" onClick={save} disabled={busy}>
              {busy ? <Loader2 size={13} className="spin" /> : <Save size={13} />} Save details
            </button>
            {saved && <span className="flex" style={{ gap: 6, color: "var(--teal-700)", fontSize: 12 }}><CheckCircle2 size={13} /> Saved</span>}
            {error && <span className="flex" style={{ gap: 6, color: "var(--danger)", fontSize: 12 }}><AlertTriangle size={13} /> {error}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
