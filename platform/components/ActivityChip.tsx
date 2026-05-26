"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Activity, Loader2, Bot } from "lucide-react";

// LIVE ACTIVITY SURFACE (R3-3 / P5). The app must feel ALIVE about what the
// agents are doing, not silent. This is the global pulse in the top nav: a chip
// that lights up when work is in flight (grants preparing) OR something just
// happened, and EXPANDS into a small live panel streaming the events feed
// (drafted a reply, prepared a grant, queued a thank-you, sent) on a short poll.
//
// It never blocks: it only ever GETs /api/activity (cheap, read-only) and renders
// a chip + a dropdown. When idle and quiet it stays a muted "Activity" pill so
// the chrome is calm; when work is live it shows a spinner + count and pulses.
type Row = { id: string; label: string; tone: string; at: string };
const TONE: Record<string, string> = { teal: "var(--teal-700)", gold: "#B45309", green: "#15803D", red: "#B4332C", gray: "var(--muted)" };

function ago(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  return s < 60 ? "now" : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
}

export default function ActivityChip() {
  const [rows, setRows] = useState<Row[]>([]);
  const [preparing, setPreparing] = useState(0);
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState(false); // brief glow when a new event lands
  const wrapRef = useRef<HTMLDivElement>(null);
  const lastTop = useRef<string>("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/activity?limit=20", { cache: "no-store" });
      const j = await r.json();
      const next: Row[] = Array.isArray(j.events) ? j.events : [];
      setRows(next);
      setPreparing(j?.jobs?.preparing || 0);
      // flash the chip when the newest event id changes
      const top = next[0]?.id || "";
      if (top && lastTop.current && top !== lastTop.current) {
        setFresh(true);
        setTimeout(() => setFresh(false), 2200);
      }
      lastTop.current = top;
    } catch {
      /* ignore a missed cycle */
    }
  }, []);

  // Poll faster while work is in flight (or the panel is open), idle otherwise.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (alive) await load();
      if (alive) timer = setTimeout(tick, preparing > 0 || open ? 4000 : 15000);
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [load, preparing, open]);

  // Smart Mode (and any action) dispatches this so the stream updates instantly.
  useEffect(() => {
    const onPing = () => load();
    window.addEventListener("nisria:activity", onPing);
    return () => window.removeEventListener("nisria:activity", onPing);
  }, [load]);

  // close on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const busy = preparing > 0;

  return (
    <div className="dropwrap actwrap" ref={wrapRef}>
      <button
        className={`navpill actpill ${busy ? "busy" : ""} ${fresh ? "fresh" : ""}`}
        title="Activity"
        onClick={() => setOpen((o) => !o)}
      >
        {busy ? <Loader2 size={14} className="spin" /> : <Activity size={14} />}
        <span className="actpill-label">{busy ? `Preparing ${preparing}` : "Activity"}</span>
      </button>
      {open && (
        <div className="dropmenu actpanel" style={{ right: 0, left: "auto", minWidth: 300, maxWidth: 340 }}>
          <div className="between" style={{ padding: "4px 8px 8px", borderBottom: "1px solid var(--hairline)", marginBottom: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 12.5 }}>Live activity</span>
            {busy && <span className="chip nisria" style={{ gap: 5 }}><Loader2 size={11} className="spin" /> {preparing} preparing</span>}
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {rows.length === 0 && <div className="faint" style={{ padding: "14px 10px", fontSize: 12.5 }}>Quiet right now. Agent activity shows up here as it happens.</div>}
            {rows.map((r) => (
              <div key={r.id} className="actrow" style={{ padding: "9px 8px" }}>
                <span className="aico teal" style={{ width: 28, height: 28, color: TONE[r.tone] || "var(--muted)" }}><Bot size={13} /></span>
                <div className="abody"><div className="atitle" style={{ fontSize: 12.5 }}>{r.label}</div></div>
                <span className="aright">{ago(r.at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
