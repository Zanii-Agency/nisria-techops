"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  UploadCloud, Mic, FileText, Loader2, Check, Sparkles, Brain, FolderOpen,
  Wallet, Users, X, ChevronRight,
} from "lucide-react";
import { ingestFiles, ingestText, reviewBatch, confirmBatch } from "../app/settings/ingest-actions";
import type { Route } from "../lib/ingest";

// R3-4 / P7: ONE ingestion pipeline UI. The founder's ask (175,177,178,180):
// "a way for me to just upload a bunch of docs and it populates where it must",
// done by voice or by dropping everything at first login. This is the single
// affordance: drop files, speak, or paste; Sasa classifies and ROUTES each into
// the Brain / a record / the Library / Finance; the founder reviews and confirms.
// Non-blocking: dropping 20 files returns instantly and the worker fills in the
// routes live below.

type Item = {
  id: string;
  channel: string;
  attribution: string | null;
  filename: string | null;
  mime: string | null;
  routed_to: string | null;
  route: Route & { _text?: string };
  status: string;
  error: string | null;
};

const TARGET_META: Record<string, { label: string; Icon: any; tone: string }> = {
  brain: { label: "The Brain", Icon: Brain, tone: "teal" },
  record: { label: "A record", Icon: Users, tone: "blue" },
  finance: { label: "Finance", Icon: Wallet, tone: "gold" },
  library: { label: "Library", Icon: FolderOpen, tone: "gray" },
  skip: { label: "Skip", Icon: X, tone: "gray" },
};
const TARGET_ORDER = ["brain", "record", "finance", "library", "skip"];

export default function IngestDock() {
  const [batchId, setBatchId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState<string>(""); // processing | ready | applied
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, Partial<Route>>>({});
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  // voice
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recRef = useRef<any>(null);

  // text drop
  const [text, setText] = useState("");

  // poll the review while a batch is processing
  useEffect(() => {
    if (!batchId || status === "applied") return;
    let alive = true;
    const tick = async () => {
      try {
        const { batch, items: its } = await reviewBatch(batchId);
        if (!alive) return;
        setItems((its || []) as Item[]);
        setStatus((batch as any)?.status || "processing");
      } catch {}
    };
    tick();
    const t = setInterval(() => { if (status !== "ready") tick(); }, 2500);
    return () => { alive = false; clearInterval(t); };
  }, [batchId, status]);

  function dropFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const fd = new FormData();
    fd.set("source", "upload");
    for (const f of Array.from(files)) fd.append("file", f);
    setBusy(true); setApplied(false); setOverrides({});
    start(async () => {
      const res = await ingestFiles(fd);
      setBatchId(res.batchId);
      setStatus("processing");
      setBusy(false);
    });
  }

  function dropText(channel: "text" | "voice", value: string) {
    const v = value.trim();
    if (!v) return;
    const fd = new FormData();
    fd.set("source", channel === "voice" ? "voice" : "first-login");
    fd.set("channel", channel);
    fd.set("text", v);
    setBusy(true); setApplied(false); setOverrides({});
    start(async () => {
      const res = await ingestText(fd);
      setBatchId(res.batchId);
      setStatus("processing");
      setText(""); setTranscript("");
      setBusy(false);
    });
  }

  function toggleMic() {
    const SR = (typeof window !== "undefined") && ((window as any).webkitSpeechRecognition || (window as any).SpeechRecognition);
    if (!SR) { alert("Voice input needs Chrome/Edge (Web Speech API)."); return; }
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    const rec = new SR();
    rec.lang = "en-US"; rec.interimResults = true; rec.continuous = true;
    let finalText = "";
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t + " "; else interim += t;
      }
      setTranscript((finalText + interim).trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  function confirm() {
    if (!batchId) return;
    setBusy(true);
    start(async () => {
      await confirmBatch(batchId, overrides);
      setApplied(true);
      setStatus("applied");
      setBusy(false);
    });
  }

  function reset() {
    setBatchId(null); setItems([]); setStatus(""); setApplied(false); setOverrides({});
  }

  const routed = items.filter((i) => i.status === "routed" || i.status === "applied");
  const allRouted = items.length > 0 && routed.length === items.length;
  const summary = summarize(items, overrides);

  return (
    <div className="card" style={{ gridColumn: "1 / -1" }}>
      <div className="card-h">
        <span className="flex"><Sparkles size={16} /> Drop everything, Sasa will sort it</span>
        <span className="badge teal">one pipeline</span>
      </div>

      <div className="card-pad stack" style={{ gap: 14 }}>
        <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6, margin: 0 }}>
          New here, or have a pile of documents? Drop them all at once, speak, or paste a note. Sasa reads
          each one and files it where it belongs: a fact into the Brain, a person into a record, an invoice
          flagged for Finance, a photo into the Library. You confirm before anything is saved.
        </p>

        {/* the three inputs */}
        <div className="grid cols-3" style={{ gap: 12 }}>
          {/* bulk files */}
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); dropFiles(e.dataTransfer.files); }}
            style={{ border: "2px dashed var(--line-2)", borderRadius: 14, padding: 18, textAlign: "center", cursor: "pointer", background: "var(--surface)" }}
          >
            <div style={{ width: 42, height: 42, borderRadius: 12, background: "var(--teal-50)", color: "var(--teal-700)", display: "grid", placeItems: "center", margin: "0 auto 8px" }}><UploadCloud size={20} /></div>
            <div className="strong" style={{ fontSize: 13 }}>Drop a bunch of files</div>
            <div className="faint" style={{ fontSize: 11.5, marginTop: 2 }}>Photos, PDFs, reports, anything</div>
            <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={(e) => { dropFiles(e.target.files); e.currentTarget.value = ""; }} />
          </div>

          {/* voice */}
          <div style={{ border: "2px dashed var(--line-2)", borderRadius: 14, padding: 18, textAlign: "center", background: "var(--surface)" }}>
            <button type="button" className={`mic ${listening ? "on" : ""}`} onClick={toggleMic} style={{ margin: "0 auto 8px", width: 42, height: 42 }} title="Speak to fill the Brain">
              <Mic size={20} />
            </button>
            <div className="strong" style={{ fontSize: 13 }}>{listening ? "Listening…" : "Speak it"}</div>
            <div className="faint" style={{ fontSize: 11.5, marginTop: 2, minHeight: 16 }}>{transcript ? transcript.slice(0, 60) + (transcript.length > 60 ? "…" : "") : "Fast and easy, just talk"}</div>
            {transcript && !listening && (
              <button type="button" className="btn teal sm" style={{ marginTop: 8 }} onClick={() => dropText("voice", transcript)} disabled={busy}>
                <Sparkles size={12} /> File this
              </button>
            )}
          </div>

          {/* paste text */}
          <div style={{ border: "2px dashed var(--line-2)", borderRadius: 14, padding: 14, background: "var(--surface)" }}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Or paste a note, a list, an email…"
              rows={3}
              style={{ width: "100%", resize: "none", fontSize: 12.5, lineHeight: 1.5 }}
            />
            <button type="button" className="btn teal sm" style={{ marginTop: 6, width: "100%" }} onClick={() => dropText("text", text)} disabled={busy || !text.trim()}>
              <FileText size={12} /> File this note
            </button>
          </div>
        </div>

        {/* live status + review */}
        {batchId && !applied && (
          <div className="stack" style={{ gap: 10, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
            {!allRouted ? (
              <div className="flex" style={{ gap: 8, fontSize: 13, color: "var(--ink-2)" }}>
                <Loader2 size={15} className="spin" style={{ color: "var(--teal)" }} />
                Sasa is reading {items.length || "your"} item{items.length === 1 ? "" : "s"} and deciding where each belongs…
              </div>
            ) : (
              <>
                <div className="strong" style={{ fontSize: 13.5 }}>{summary}</div>
                <div className="stack" style={{ gap: 8 }}>
                  {routed.map((it) => (
                    <ReviewRow key={it.id} item={it} override={overrides[it.id]} onChange={(r) => setOverrides((o) => ({ ...o, [it.id]: { ...o[it.id], ...r } }))} />
                  ))}
                </div>
                <div className="flex" style={{ gap: 8, justifyContent: "flex-end" }}>
                  <button type="button" className="btn ghost sm" onClick={reset} disabled={busy}>Discard</button>
                  <button type="button" className="btn teal sm" onClick={confirm} disabled={busy || pending}>
                    {busy ? <><Loader2 size={13} className="spin" /> Filing…</> : <><Check size={13} /> Confirm and file</>}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {applied && (
          <div className="flex" style={{ gap: 8, fontSize: 13, color: "var(--teal-700)", paddingTop: 12, borderTop: "1px solid var(--line)" }}>
            <Check size={15} /> Filed. The Brain and your records are updated.
            <button type="button" className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={reset}>Drop more</button>
          </div>
        )}
      </div>
    </div>
  );
}

// one human sentence: "Sasa filed these 6: 3 to the Brain, 2 to Library, 1 to Finance."
function summarize(items: Item[], overrides: Record<string, Partial<Route>>): string {
  const counts: Record<string, number> = {};
  for (const it of items) {
    if (it.status !== "routed" && it.status !== "applied") continue;
    const t = overrides[it.id]?.target || it.routed_to || it.route?.target || "skip";
    counts[t] = (counts[t] || 0) + 1;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) return "Nothing to file.";
  const parts = TARGET_ORDER.filter((t) => counts[t]).map((t) => `${counts[t]} to ${TARGET_META[t].label}`);
  return `Sasa filed these ${total}: ${parts.join(", ")}. Confirm or adjust.`;
}

function ReviewRow({ item, override, onChange }: { item: Item; override?: Partial<Route>; onChange: (r: Partial<Route>) => void }) {
  const target = (override?.target || item.routed_to || item.route?.target || "skip") as string;
  const meta = TARGET_META[target] || TARGET_META.skip;
  const Icon = meta.Icon;
  const title = item.route?.title || item.filename || (item.route?._text ? item.route._text.slice(0, 40) : "Item");
  const reason = item.route?.reason || "";

  return (
    <div className="card" style={{ boxShadow: "none", border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface)" }}>
      <div className="card-pad" style={{ padding: "10px 12px" }}>
        <div className="between" style={{ gap: 10 }}>
          <span className="flex" style={{ gap: 9, minWidth: 0 }}>
            <span className="aico" style={{ width: 30, height: 30, borderRadius: 9, background: "var(--teal-50)", color: "var(--teal-700)", display: "grid", placeItems: "center", flexShrink: 0 }}>
              <Icon size={15} />
            </span>
            <span className="stack" style={{ gap: 1, minWidth: 0 }}>
              <span className="strong" style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
              {reason && <span className="faint" style={{ fontSize: 11, lineHeight: 1.4 }}>{reason}</span>}
            </span>
          </span>
          <span className="flex" style={{ gap: 6, flexShrink: 0 }}>
            <ChevronRight size={13} style={{ color: "var(--muted)" }} />
            {/* adjust the destination */}
            <select
              value={target}
              onChange={(e) => onChange({ target: e.target.value as any })}
              style={{ fontSize: 11.5, padding: "3px 6px" }}
            >
              {TARGET_ORDER.map((t) => <option key={t} value={t}>{TARGET_META[t].label}</option>)}
            </select>
          </span>
        </div>
        {item.error && <div className="faint" style={{ fontSize: 11, color: "var(--red, #c0392b)", marginTop: 4 }}>{item.error}</div>}
      </div>
    </div>
  );
}
