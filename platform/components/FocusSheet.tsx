"use client";

import { useEffect, useRef } from "react";
import { Minus, X } from "lucide-react";
import { useTabs } from "./tabs-context";

// THE FOCUS SHEET HOST. ONE component, mounted once in the shell. It renders
// the single non-minimized sheet, big and dead-center, over a blurred backdrop.
// The header carries Minimize (drops it into the tab strip as a real tab) and
// Close (discards). Clicking the minimized tab restores it. This is the in-app
// replacement for the old small/left popups — truly centered, never a window
// manager.
export default function FocusSheetHost() {
  const { sheets, minimizeSheet, closeSheet } = useTabs();
  const open = sheets.find((s) => !s.minimized) || null;
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); minimizeSheet(open.id); return; }
      if (e.key === "Tab") {
        const f = panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])'
        );
        if (!f || !f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => {
      const el = panelRef.current?.querySelector<HTMLElement>(
        'button,a[href],textarea,input,select,[tabindex]:not([tabindex="-1"])'
      );
      el?.focus();
    }, 0);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prev;
      clearTimeout(t);
    };
  }, [open, minimizeSheet]);

  if (!open) return null;

  return (
    // backdrop click minimizes (keeps the work in the tab strip, never loses it)
    <div className="sheet-overlay" onClick={() => minimizeSheet(open.id)}>
      <div
        ref={panelRef}
        className="sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-label={open.title}
        style={{ maxWidth: open.width || 720 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <div className="flex" style={{ gap: 10, minWidth: 0 }}>
            <h3 style={{ fontSize: 18, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{open.title}</h3>
            {open.titleExtra}
          </div>
          <div className="flex" style={{ gap: 4 }}>
            <button type="button" className="expandbtn tip-host" data-tip="Minimize to tabs" aria-label="Minimize to tab strip" onClick={() => minimizeSheet(open.id)}><Minus size={18} /></button>
            <button type="button" className="expandbtn tip-host" data-tip="Close" aria-label="Close" onClick={() => closeSheet(open.id)}><X size={18} /></button>
          </div>
        </div>
        <div className="sheet-body">{open.render()}</div>
        {open.footer && <div className="sheet-foot">{open.footer}</div>}
      </div>
    </div>
  );
}
