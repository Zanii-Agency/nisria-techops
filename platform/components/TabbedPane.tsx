"use client";

import { useState, type ReactNode } from "react";

// Two-pane primitive: left rail of category tabs with counts, right pane scrolls
// inside itself (overflow-y:auto with capped height). Solves the bottomless
// body-scroll on record surfaces.
//
// Tabs carry PRE-RENDERED bodies (ReactNode), not render functions, so server
// components can pass JSX across the server/client boundary without tripping
// Next's "functions cannot be passed to client components" guard. The parent
// pre-renders every tab body server-side, and we just toggle which is visible.
//
// On viewports < 760px the rail collapses into a horizontal swipe-pill strip
// at the top.

export type TabbedTab = {
  id: string;
  label: string;
  count?: number;
  hint?: string;
  body: ReactNode;
};

export default function TabbedPane({
  tabs,
  initialId,
  emptyHint = "Nothing here yet.",
}: {
  tabs: TabbedTab[];
  initialId?: string;
  emptyHint?: string;
}) {
  const first = tabs[0]?.id || "";
  const [active, setActive] = useState<string>(initialId || first);

  if (tabs.length === 0) return <div className="empty">{emptyHint}</div>;

  return (
    <div className="tpane-wrap">
      <aside className="tpane-rail">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tpane-tab ${t.id === active ? "active" : ""}`}
            onClick={() => setActive(t.id)}
          >
            <span className="tpane-tab-row">
              <span className="tpane-tab-label">{t.label}</span>
              {typeof t.count === "number" && <span className="tpane-tab-count">{t.count}</span>}
            </span>
            {t.hint && <span className="tpane-tab-hint">{t.hint}</span>}
          </button>
        ))}
      </aside>
      <section className="tpane-body card">
        {tabs.map((t) => (
          <div key={t.id} style={{ display: t.id === active ? "flex" : "none", flexDirection: "column", minHeight: 0, flex: 1 }}>
            <div className="tpane-bodyhead">
              <span className="strong" style={{ fontSize: 13.5 }}>{t.label}</span>
              {typeof t.count === "number" && <span className="muted" style={{ fontSize: 12 }}>{t.count} {t.count === 1 ? "item" : "items"}</span>}
            </div>
            <div className="tpane-bodyscroll">{t.body}</div>
          </div>
        ))}
      </section>
    </div>
  );
}
