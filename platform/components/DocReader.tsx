"use client";

import { useState, useEffect } from "react";
import { useTabs } from "./tabs-context";
import { Search, ExternalLink } from "lucide-react";

// Reads a document's extracted text and shows it NATIVELY in a focus sheet:
// summary on top, full text below, scrollable and searchable in place. No leaving
// the platform. The original Drive file is a fallback link in the footer only.
function Body({ id }: { id: string }) {
  const [data, setData] = useState<any>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    let on = true;
    fetch(`/api/documents/content?id=${id}`)
      .then((r) => r.json())
      .then((d) => { if (on) (d.error ? setErr(d.error) : setData(d)); })
      .catch((e) => on && setErr(String(e)));
    return () => { on = false; };
  }, [id]);

  if (err) return <div className="card-pad faint">Could not read this document ({err}).</div>;
  if (!data) return <div className="card-pad faint">Reading the document…</div>;

  const text: string = data.text || "";
  const paras = text.split(/\n{2,}/).filter((p) => p.trim());
  const needle = q.trim().toLowerCase();
  const shown = needle ? paras.filter((p) => p.toLowerCase().includes(needle)) : paras;

  const hl = (p: string, i: number) => {
    if (!needle) return <p key={i} style={{ margin: "0 0 11px" }}>{p}</p>;
    const parts = p.split(new RegExp(`(${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
    return <p key={i} style={{ margin: "0 0 11px" }}>{parts.map((s, j) => s.toLowerCase() === needle ? <mark key={j} style={{ background: "var(--teal-100)", padding: "0 1px" }}>{s}</mark> : s)}</p>;
  };

  return (
    <div className="stack" style={{ gap: 0 }}>
      {data.summary && (
        <div className="card-pad" style={{ borderBottom: "1px solid var(--line)" }}>
          <div className="faint" style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>Summary</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{data.summary}</div>
        </div>
      )}
      <div style={{ padding: "11px 18px", borderBottom: "1px solid var(--line)" }}>
        <div className="flex" style={{ gap: 8, height: 38, padding: "0 14px", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 999 }}>
          <Search size={14} style={{ color: "var(--faint)", flexShrink: 0 }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search in this document…" style={{ border: 0, background: "none", width: "100%", outline: "none", font: "inherit", fontSize: 13 }} />
          {needle && <span className="faint" style={{ fontSize: 11.5, flexShrink: 0 }}>{shown.length} match{shown.length === 1 ? "" : "es"}</span>}
        </div>
      </div>
      {!text ? (
        <div className="card-pad faint" style={{ fontSize: 13, lineHeight: 1.6 }}>No readable text could be extracted from this file type. Open the original from the footer.</div>
      ) : (
        <div style={{ padding: "16px 22px", maxHeight: "58vh", overflowY: "auto", fontSize: 13.5, lineHeight: 1.7, color: "var(--ink-2)" }}>
          {shown.length ? shown.map(hl) : <span className="faint">No lines match “{q}”.</span>}
        </div>
      )}
    </div>
  );
}

export default function DocReader({
  doc, children, className,
}: {
  doc: { id: string; title: string; drive_url?: string | null; icon?: string };
  children: React.ReactNode;
  className?: string;
}) {
  const { openSheet } = useTabs();
  const open = () =>
    openSheet({
      id: `doc:${doc.id}`,
      title: doc.title,
      icon: doc.icon || "file",
      width: 760,
      render: () => <Body id={doc.id} />,
      footer: doc.drive_url ? (
        <a className="btn ghost sm" href={doc.drive_url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open original</a>
      ) : undefined,
    });
  return (
    <button type="button" onClick={open} className={className} style={{ textAlign: "left", border: 0, background: "none", width: "100%", font: "inherit", cursor: "pointer", padding: 0, color: "inherit" }}>
      {children}
    </button>
  );
}
