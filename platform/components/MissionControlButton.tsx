"use client";

import { LayoutGrid } from "lucide-react";

// A header affordance that opens the existing Mission Control overview (the
// bird's-eye grid of every open tab and minimized popup). Mission Control is
// mounted globally in AppFrame and listens for the "open-mission" event, so
// this just fires it. Same wiring as the Alt+Up shortcut, surfaced as a button.
export default function MissionControlButton() {
  return (
    <button
      type="button"
      className="btn ghost sm"
      onClick={() => window.dispatchEvent(new Event("open-mission"))}
      aria-label="Open Mission Control"
    >
      <LayoutGrid size={14} /> Mission Control
    </button>
  );
}
