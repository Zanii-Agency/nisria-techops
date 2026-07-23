"use client";
// A submit button that asks for confirmation before it fires its (server-action) formAction.
// Cancelling the confirm prevents the submit. Reusable for any irreversible owner-CRUD control.
import type { ReactNode, CSSProperties } from "react";

export default function ConfirmButton({
  children,
  confirm,
  className,
  formAction,
  style,
}: {
  children: ReactNode;
  confirm: string;
  className?: string;
  formAction?: (fd: FormData) => void | Promise<void>;
  style?: CSSProperties;
}) {
  return (
    <button
      type="submit"
      formAction={formAction}
      className={className}
      style={style}
      onClick={(e) => { if (!window.confirm(confirm)) e.preventDefault(); }}
    >
      {children}
    </button>
  );
}
