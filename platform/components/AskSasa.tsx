"use client";

import { useState } from "react";
import { Sparkles, Send } from "lucide-react";

// Inline "ask Sasa right here" (FEEDBACK #22). On the empty Tasks card, instead
// of a button that sends Nur elsewhere, she types her request inline and it
// dispatches the existing `sasa-ask` event with her text — Sasa opens and
// answers in place. `prompt` is a fallback used when she sends an empty box (so
// the old one-tap behaviour still works), and seeds the placeholder.
export default function AskSasa({ prompt, label }: { prompt?: string; label: string }) {
  const [text, setText] = useState("");

  function ask() {
    const msg = text.trim() || prompt || "";
    if (!msg) return;
    window.dispatchEvent(new CustomEvent("sasa-ask", { detail: msg }));
    setText("");
  }

  return (
    <div
      className="flex"
      style={{ gap: 7, marginTop: 12, maxWidth: 420, marginLeft: "auto", marginRight: "auto" }}
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ask(); } }}
        placeholder={label}
        aria-label={label}
        style={{ fontSize: 13 }}
      />
      <button
        type="button"
        className="btn sm teal"
        onClick={ask}
        title="Ask Sasa"
        aria-label="Ask Sasa"
        style={{ flexShrink: 0 }}
      >
        <Sparkles size={13} /> Ask
      </button>
    </div>
  );
}
