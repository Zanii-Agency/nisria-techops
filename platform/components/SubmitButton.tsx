"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

// Shared form-submit button. Reads the enclosing <form action={...}> pending
// state via useFormStatus, so it disables + shows a spinner while the server
// action runs. Closes the Real-action law's "loading -> done" requirement and
// kills the double-submit risk (e.g. marking a recurring payment paid twice).
export function SubmitButton({
  className = "btn",
  pendingLabel,
  children,
  style,
}: {
  className?: string;
  pendingLabel?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending} style={style}>
      {pending ? (
        <>
          <Loader2 size={14} className="spin" /> {pendingLabel || "Working…"}
        </>
      ) : (
        children
      )}
    </button>
  );
}

export default SubmitButton;
