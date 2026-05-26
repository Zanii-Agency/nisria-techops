"use client";

import { Sparkles } from "lucide-react";

// Opens the Sasa dock and (optionally) sends a preset prompt, right where the
// user is — no navigating away. Used by the empty Tasks card so "ask Sasa to
// assign one" happens inline instead of bouncing to another page.
export default function AskSasa({ prompt, label }: { prompt: string; label: string }) {
  return (
    <button
      type="button"
      className="btn sm ghost"
      onClick={() => window.dispatchEvent(new CustomEvent("sasa-ask", { detail: prompt }))}
      style={{ marginTop: 10 }}
    >
      <Sparkles size={13} /> {label}
    </button>
  );
}
