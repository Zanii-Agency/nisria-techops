"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

// Manual refresh. Replaces the old 15s auto-refresh that wiped in-progress edits
// in open composers/peeks. The notification bell still polls for the count; the
// founder pulls fresh data on demand here. Shows when it last refreshed.
export default function Refresh() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [last, setLast] = useState<string>("");

  function refresh() {
    start(() => {
      router.refresh();
      setLast(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
    });
  }

  return (
    <button
      type="button"
      className="chip nisria"
      onClick={refresh}
      title="Refresh now"
      style={{ background: "none", border: 0, cursor: "pointer" }}
    >
      <RefreshCw size={12} className={pending ? "spin" : ""} />
      {pending ? "Refreshing…" : last ? `Updated ${last}` : "Refresh"}
    </button>
  );
}
