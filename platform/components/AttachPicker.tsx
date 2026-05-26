"use client";

import { useEffect, useState } from "react";
import Modal from "./Modal";
import { Badge } from "./ui";
import { Paperclip, FileText, File as FileIcon, Check, X, Loader2 } from "lucide-react";

// Attach a Studio / grant-ready document or a Library file to an outbound email
// (R2-5 #43). Self-contained: the parent passes the current selection + an
// onChange. The picker fetches /api/attachables, shows a centered Modal grouped
// by source, and reports the chosen opaque refs ("doc:<id>" | "asset:<id>").
// The parent keeps those in a hidden <input name="attach_refs"> so the server
// send path turns each into a real attachment (Studio -> PDF/HTML, asset -> file).

type Opt = { ref: string; title: string; kind: string; brand: string | null; group: string };

export default function AttachPicker({
  selected,
  onChange,
  size = "sm",
}: {
  selected: string[];
  onChange: (refs: string[]) => void;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<Opt[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || opts) return;
    setLoading(true);
    fetch("/api/attachables")
      .then((r) => r.json())
      .then((j) => setOpts(Array.isArray(j.options) ? j.options : []))
      .catch(() => setOpts([]))
      .finally(() => setLoading(false));
  }, [open, opts]);

  const byRef = new Map((opts || []).map((o) => [o.ref, o]));
  const groups = (opts || []).reduce<Record<string, Opt[]>>((acc, o) => {
    (acc[o.group] = acc[o.group] || []).push(o);
    return acc;
  }, {});

  function toggle(ref: string) {
    onChange(selected.includes(ref) ? selected.filter((r) => r !== ref) : [...selected, ref]);
  }

  return (
    <>
      <button
        type="button"
        className={`btn ghost ${size}`}
        onClick={() => setOpen(true)}
        title="Attach a document"
      >
        <Paperclip size={13} /> Attach{selected.length ? ` (${selected.length})` : ""}
      </button>

      {/* selected chips shown inline next to the composer */}
      {selected.length > 0 && (
        <div className="flex wrap" style={{ gap: 6, width: "100%", marginTop: 2 }}>
          {selected.map((ref) => {
            const o = byRef.get(ref);
            const isDoc = ref.startsWith("doc:");
            return (
              <span key={ref} className="pill" style={{ gap: 6, fontSize: 11.5 }}>
                {isDoc ? <FileText size={12} /> : <FileIcon size={12} />}
                {o ? (o.title.length > 28 ? o.title.slice(0, 26) + "…" : o.title) : "attachment"}
                <button
                  type="button"
                  onClick={() => toggle(ref)}
                  style={{ background: "none", border: 0, cursor: "pointer", display: "grid", placeItems: "center", color: "var(--muted)" }}
                  aria-label="Remove attachment"
                >
                  <X size={12} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        width={520}
        title="Attach a document"
        footer={
          <>
            <span className="faint" style={{ fontSize: 11.5, marginRight: "auto" }}>
              {selected.length} selected. Studio docs attach as PDF (or HTML if PDF is unavailable).
            </span>
            <button type="button" className="btn teal sm" onClick={() => setOpen(false)}>Done</button>
          </>
        }
      >
        {loading && <div className="flex" style={{ gap: 8, padding: 16, color: "var(--muted)" }}><Loader2 size={15} className="spin" /> Loading documents…</div>}
        {!loading && opts && opts.length === 0 && (
          <div className="empty">No documents yet. Create one in the Studio or upload to the Library.</div>
        )}
        {!loading && opts && Object.entries(groups).map(([group, items]) => (
          <div key={group} style={{ marginBottom: 14 }}>
            <div className="faint" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>{group}</div>
            <div className="stack" style={{ gap: 6 }}>
              {items.map((o) => {
                const on = selected.includes(o.ref);
                const isDoc = o.ref.startsWith("doc:");
                return (
                  <button
                    key={o.ref}
                    type="button"
                    className="card hover"
                    onClick={() => toggle(o.ref)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, textAlign: "left",
                      padding: "9px 12px", width: "100%", cursor: "pointer", font: "inherit",
                      border: on ? "1px solid var(--teal)" : "1px solid var(--line)",
                      background: on ? "var(--teal-50)" : "var(--surface)",
                    }}
                  >
                    <span className={`aico ${isDoc ? "teal" : "peri"}`} style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0 }}>
                      {isDoc ? <FileText size={14} /> : <FileIcon size={14} />}
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span className="strong" style={{ fontSize: 13, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.title}</span>
                      <span className="flex" style={{ gap: 6, marginTop: 3 }}>
                        <Badge tone="gray">{o.kind}</Badge>
                        {o.brand && <span className={`chip ${o.brand}`}><span className="bdot" /> {o.brand}</span>}
                      </span>
                    </span>
                    {on && <Check size={16} color="var(--teal-700)" style={{ flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </Modal>
    </>
  );
}
