"use client";

import { useRef, useState, useTransition } from "react";
import { ImageUp, Trash2, Check, Loader2 } from "lucide-react";
import { uploadLogo, removeLogo } from "../app/settings/ingest-actions";

// R3-4 / P8: brand logo upload with a LIVE PREVIEW (never raw code). One card per
// brand (Nisria / Maisha / AHADI). Dropping an image stores it (data URI + a
// Library copy) and the preview swaps to the rendered <img> instantly. The stored
// logo is used in the email signature and generated documents.
type LogoMap = Record<string, { data_uri: string } | undefined>;

const BRANDS: { key: string; label: string; chip: string }[] = [
  { key: "nisria", label: "Nisria", chip: "nisria" },
  { key: "maisha", label: "Maisha", chip: "maisha" },
  { key: "ahadi", label: "AHADI", chip: "ahadi" },
];

export default function LogoUploader({ logos }: { logos: LogoMap }) {
  return (
    <div className="card" style={{ gridColumn: "1 / -1" }}>
      <div className="card-h">
        <span className="flex"><ImageUp size={15} /> Brand logos</span>
        <span className="badge teal">{BRANDS.filter((b) => logos[b.key]?.data_uri).length} of {BRANDS.length} set</span>
      </div>
      <div className="card-pad stack" style={{ gap: 12 }}>
        <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6, margin: 0 }}>
          Upload a logo for each brand. You will see it here as a real preview, exactly as it appears.
          The logo is used in your email signature and on every document the portal generates.
        </p>
        <div className="grid cols-3" style={{ gap: 12 }}>
          {BRANDS.map((b) => (
            <LogoCard key={b.key} brand={b.key} label={b.label} chip={b.chip} initial={logos[b.key]?.data_uri || ""} />
          ))}
        </div>
      </div>
    </div>
  );
}

function LogoCard({ brand, label, chip, initial }: { brand: string; label: string; chip: string; initial: string }) {
  const [dataUri, setDataUri] = useState(initial);
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const [justSaved, setJustSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(file: File) {
    setErr("");
    // optimistic local preview while the upload runs
    const reader = new FileReader();
    reader.onload = () => setDataUri(String(reader.result || ""));
    reader.readAsDataURL(file);
    const fd = new FormData();
    fd.set("brand", brand);
    fd.set("logo", file);
    start(async () => {
      const res = await uploadLogo(fd);
      if (res.ok && res.data_uri) {
        setDataUri(res.data_uri);
        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 2200);
      } else {
        setErr(res.error || "Upload failed");
        setDataUri(initial);
      }
    });
  }

  function clear() {
    const fd = new FormData();
    fd.set("brand", brand);
    start(async () => { await removeLogo(fd); setDataUri(""); });
  }

  return (
    <div className="card" style={{ boxShadow: "none", border: "1px solid var(--line)", borderRadius: 14, background: "var(--surface)" }}>
      <div className="card-pad stack" style={{ gap: 10 }}>
        <div className="between">
          <span className={`chip ${chip}`}><span className="bdot" /> {label}</span>
          {dataUri && (
            <button type="button" className="btn ghost sm tip-host tip-below" data-tip="Remove logo" onClick={clear} disabled={pending} aria-label="Remove logo">
              <Trash2 size={13} />
            </button>
          )}
        </div>

        {/* LIVE PREVIEW: the rendered logo, never code */}
        <div
          onClick={() => inputRef.current?.click()}
          style={{
            height: 96, borderRadius: 10, cursor: "pointer",
            border: dataUri ? "1px solid var(--line)" : "2px dashed var(--line-2)",
            background: dataUri ? "#fff" : "var(--canvas)",
            display: "grid", placeItems: "center", padding: 10, overflow: "hidden",
          }}
        >
          {dataUri ? (
            <img src={dataUri} alt={`${label} logo`} style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }} />
          ) : (
            <span className="faint flex" style={{ gap: 6, fontSize: 12 }}>
              <ImageUp size={16} /> Click to upload
            </span>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.currentTarget.value = ""; }}
        />

        <div className="between">
          <span className="faint flex" style={{ fontSize: 11, gap: 5 }}>
            {pending ? <><Loader2 size={12} className="spin" /> Saving…</> : justSaved ? <><Check size={12} style={{ color: "var(--teal)" }} /> Saved</> : dataUri ? "Used in signature + documents" : "PNG, JPG, SVG or WebP"}
          </span>
          <button type="button" className="btn ghost sm" onClick={() => inputRef.current?.click()} disabled={pending}>
            {dataUri ? "Replace" : "Upload"}
          </button>
        </div>
        {err && <div className="faint" style={{ fontSize: 11, color: "var(--red, #c0392b)" }}>{err}</div>}
      </div>
    </div>
  );
}
