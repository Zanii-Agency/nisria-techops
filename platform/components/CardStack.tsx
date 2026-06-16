"use client";

import { useState, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props<T> = {
  items: T[];
  render: (item: T, index: number) => React.ReactNode;
  laneLabel: string;
  laneTone: string;
};

export default function CardStack<T>({ items, render, laneLabel, laneTone }: Props<T>) {
  const [index, setIndex] = useState(0);
  const clamped = Math.min(Math.max(0, index), items.length - 1);

  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const next = useCallback(() => setIndex((i) => Math.min(items.length - 1, i + 1)), [items.length]);

  if (items.length === 0) {
    return <div className="muted" style={{ textAlign: "center", padding: "32px 16px", fontSize: 13 }}>Nothing here.</div>;
  }

  const current = items[clamped];

  return (
    <div className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 220 }}>
      <div className="flex" style={{ alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div className="flex" style={{ gap: 8, alignItems: "center" }}>
          <span className={`cohort-dot ${laneTone}`} />
          <span style={{ fontWeight: 700, fontSize: 14 }}>{laneLabel}</span>
          <span className="faint" style={{ fontSize: 12 }}>{clamped + 1} / {items.length}</span>
        </div>
        <div className="flex" style={{ gap: 4 }}>
          <button
            onClick={prev}
            disabled={clamped === 0}
            className="btn ghost sm"
            style={{ padding: "4px 8px", opacity: clamped === 0 ? 0.3 : 1 }}
            aria-label="Previous card"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={next}
            disabled={clamped >= items.length - 1}
            className="btn ghost sm"
            style={{ padding: "4px 8px", opacity: clamped >= items.length - 1 ? 0.3 : 1 }}
            aria-label="Next card"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div key={clamped} style={{ animation: "cs-fade-in 200ms var(--ease)", flex: 1 }}>
        {render(current, clamped)}
      </div>

      <style>{`
        @keyframes cs-fade-in {
          from { opacity: 0; transform: translateX(8px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
