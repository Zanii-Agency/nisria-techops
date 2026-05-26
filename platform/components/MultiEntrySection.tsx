"use client";

import { useState, useTransition } from "react";
import { Plus, Check, ChevronDown, Save, Trash2, Maximize2, Mic, Sparkles, type LucideIcon } from "lucide-react";
import { useTabs } from "./tabs-context";
import { addBrainEntry, removeBrainEntry, saveVoiceToSection } from "../app/settings/ingest-actions";
import type { SectionKey } from "../lib/brain";

// R3-4 / P10: a Brain section that holds MULTIPLE entries (different projects),
// not one textarea. Used for "Programs" and the grant "Programs and impact".
// Shows the list, an add-entry form, a voice mic to dictate an entry, and opens
// each entry in a FocusTab to view/edit (the ONE "open big" primitive).
export type Entry = { id: string; title: string; content: string; source?: string | null };

export default function MultiEntrySection({
  sectionKey,
  label,
  blurb,
  placeholder,
  entryLabel,
  Icon,
  entries: initial,
}: {
  sectionKey: SectionKey;
  label: string;
  blurb: string;
  placeholder: string;
  entryLabel: string;
  Icon: LucideIcon;
  entries: Entry[];
}) {
  const [open, setOpen] = useState(initial.length === 0);
  const [entries, setEntries] = useState<Entry[]>(initial);
  const [adding, setAdding] = useState(false);
  const { openSheet, closeSheet } = useTabs();

  function onSaved(e: Entry) {
    setEntries((list) => {
      const i = list.findIndex((x) => x.id === e.id);
      if (i >= 0) { const copy = [...list]; copy[i] = e; return copy; }
      return [...list, e];
    });
  }
  function onRemoved(id: string) {
    setEntries((list) => list.filter((x) => x.id !== id));
  }

  // open one entry in a FocusTab to view/edit
  function openEntry(e: Entry) {
    openSheet({
      id: `brain-entry:${e.id}`,
      title: e.title || label,
      icon: "file",
      brand: "nisria",
      render: () => (
        <EntryEditor
          sectionKey={sectionKey}
          entry={e}
          placeholder={placeholder}
          onSaved={(saved) => onSaved(saved)}
          onRemoved={() => { onRemoved(e.id); closeSheet(`brain-entry:${e.id}`); }}
        />
      ),
    });
  }

  return (
    <div className="card" style={{ boxShadow: "none", border: "1px solid var(--line)", borderRadius: 14, overflow: "hidden", background: "var(--surface)" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="between" style={{ width: "100%", padding: "13px 16px", background: "none", border: 0, cursor: "pointer", textAlign: "left" }}>
        <span className="flex" style={{ gap: 11, minWidth: 0 }}>
          <span className="aico" style={{ background: entries.length ? "var(--teal-50)" : "var(--canvas)", color: entries.length ? "var(--teal-700)" : "var(--muted)", width: 32, height: 32, borderRadius: 10, display: "grid", placeItems: "center", flexShrink: 0 }}>
            <Icon size={16} />
          </span>
          <span className="stack" style={{ gap: 1, minWidth: 0 }}>
            <span className="strong" style={{ fontSize: 13.5 }}>{label}</span>
            <span className="faint" style={{ fontSize: 11.5, lineHeight: 1.4 }}>{blurb}</span>
          </span>
        </span>
        <span className="flex" style={{ gap: 8, flexShrink: 0 }}>
          {entries.length > 0 ? (
            <span className="badge green" style={{ gap: 4 }}><Check size={12} /> {entries.length} {entries.length === 1 ? entryLabel : entryLabel + "s"}</span>
          ) : (
            <span className="badge gray">none yet</span>
          )}
          <ChevronDown size={16} style={{ color: "var(--muted)", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s var(--ease)" }} />
        </span>
      </button>

      {open && (
        <div className="stack" style={{ gap: 8, padding: "0 16px 16px" }}>
          {/* the list of entries */}
          {entries.map((e) => (
            <div key={e.id} className="between" style={{ gap: 8, padding: "9px 11px", border: "1px solid var(--line)", borderRadius: 11, background: "var(--canvas)" }}>
              <button type="button" onClick={() => openEntry(e)} className="flex" style={{ gap: 8, minWidth: 0, background: "none", border: 0, cursor: "pointer", textAlign: "left", flex: 1 }}>
                <span className="stack" style={{ gap: 1, minWidth: 0 }}>
                  <span className="strong" style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</span>
                  <span className="faint" style={{ fontSize: 11, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(e.content || "").slice(0, 80)}</span>
                </span>
              </button>
              <button type="button" className="btn ghost sm tip-host tip-below" data-tip="Open" onClick={() => openEntry(e)} aria-label="Open entry">
                <Maximize2 size={12} />
              </button>
            </div>
          ))}

          {entries.length === 0 && (
            <div className="faint" style={{ fontSize: 12, lineHeight: 1.5, padding: "4px 0" }}>
              No {entryLabel}s yet. Add each {entryLabel} as its own entry so funders see them distinctly.
            </div>
          )}

          {/* add an entry */}
          {adding ? (
            <EntryEditor
              sectionKey={sectionKey}
              entry={null}
              placeholder={placeholder}
              entryLabel={entryLabel}
              onSaved={(saved) => { onSaved(saved); setAdding(false); }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <button type="button" className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => setAdding(true)}>
              <Plus size={13} /> Add a {entryLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// View/edit one entry. Used inline (add) and inside a FocusTab (edit). Includes a
// voice mic so an entry can be dictated.
function EntryEditor({
  sectionKey,
  entry,
  placeholder,
  entryLabel,
  onSaved,
  onCancel,
  onRemoved,
}: {
  sectionKey: SectionKey;
  entry: Entry | null;
  placeholder: string;
  entryLabel?: string;
  onSaved: (e: Entry) => void;
  onCancel?: () => void;
  onRemoved?: () => void;
}) {
  const [title, setTitle] = useState(entry?.title || "");
  const [content, setContent] = useState(entry?.content || "");
  const [pending, start] = useTransition();
  const [listening, setListening] = useState(false);

  function save() {
    const fd = new FormData();
    fd.set("section", sectionKey);
    fd.set("title", title);
    fd.set("content", content);
    if (entry?.id) fd.set("id", entry.id);
    start(async () => {
      await addBrainEntry(fd);
      // we do not get the new id back from the form action; for a new entry use a
      // temporary id so the list updates, the next page load reconciles real ids.
      onSaved({ id: entry?.id || `tmp-${Date.now()}`, title: title.trim() || (entryLabel || "entry"), content: content.trim() });
    });
  }

  function remove() {
    if (!entry?.id) return;
    const fd = new FormData();
    fd.set("id", entry.id);
    start(async () => { await removeBrainEntry(fd); onRemoved?.(); });
  }

  function toggleMic() {
    const SR = (typeof window !== "undefined") && ((window as any).webkitSpeechRecognition || (window as any).SpeechRecognition);
    if (!SR) { alert("Voice input needs Chrome/Edge (Web Speech API)."); return; }
    if (listening) return setListening(false);
    const rec = new SR();
    rec.lang = "en-US"; rec.interimResults = true; rec.continuous = true;
    let finalText = content ? content + " " : "";
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t + " "; else interim += t;
      }
      setContent((finalText + interim).trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    setListening(true);
  }

  return (
    <div className="stack" style={{ gap: 8, padding: entry ? 4 : "10px 11px", border: entry ? "none" : "1px solid var(--line)", borderRadius: 11, background: entry ? "transparent" : "var(--canvas)" }}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${(entryLabel || "Entry").replace(/^\w/, (c) => c.toUpperCase())} name`} style={{ fontSize: 13, fontWeight: 600 }} />
      <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder={placeholder} rows={entry ? 8 : 4} style={{ resize: "vertical", lineHeight: 1.6, fontSize: 13 }} />
      <div className="between">
        <span className="flex" style={{ gap: 6 }}>
          <button type="button" className={`btn ghost sm ${listening ? "teal" : ""}`} onClick={toggleMic} title="Dictate this entry">
            <Mic size={13} /> {listening ? "Listening…" : "Speak"}
          </button>
          {entry?.id && onRemoved && (
            <button type="button" className="btn ghost sm" onClick={remove} disabled={pending} title="Remove this entry">
              <Trash2 size={13} /> Remove
            </button>
          )}
        </span>
        <span className="flex" style={{ gap: 6 }}>
          {onCancel && <button type="button" className="btn ghost sm" onClick={onCancel} disabled={pending}>Cancel</button>}
          <button type="button" className="btn teal sm" onClick={save} disabled={pending || (!content.trim() && !title.trim())}>
            {pending ? <><Sparkles size={13} /> Saving…</> : <><Save size={13} /> Save</>}
          </button>
        </span>
      </div>
    </div>
  );
}
