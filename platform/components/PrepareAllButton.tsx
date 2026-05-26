"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { prepareAllReady } from "../app/grants/actions";
import { Sparkles, Loader2, Check } from "lucide-react";

// Manual trigger for the auto-prepare batch (FEEDBACK #6). Calls the same
// capped, idempotent server batch the daily refresh runs, then surfaces a short
// result so Nur sees how many landed in "Prepared · review". Safe to tap again:
// it only prepares grants that still need a package. Also triggered by the
// contextual top bar's "Prepare all ready" action (grants:prepare-all).
export default function PrepareAllButton() {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const router = useRouter();

  const run = useCallback(() => {
    setNote(null);
    start(async () => {
      const res = await prepareAllReady();
      if (res.prepared > 0) {
        setNote(`Prepared ${res.prepared}${res.capped ? ` of ${res.considered} (a few per tap — tap again for more)` : ""}. Now in review.`);
      } else if (res.considered > 0) {
        setNote("Everything HIGH-relevance is already prepared and waiting in review.");
      } else {
        setNote("Nothing new to prepare yet. The grant hunter pursues strong finds automatically.");
      }
      router.refresh();
    });
  }, [start, router]);

  useEffect(() => {
    const onAsk = () => { if (!pending) run(); };
    window.addEventListener("grants:prepare-all", onAsk);
    return () => window.removeEventListener("grants:prepare-all", onAsk);
  }, [run, pending]);

  return (
    <span className="flex" style={{ gap: 10, alignItems: "center" }}>
      <button type="button" className="btn teal sm" onClick={run} disabled={pending}>
        {pending ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
        {pending ? "Preparing…" : "Prepare all ready"}
      </button>
      {note && (
        <span className="faint flex" style={{ fontSize: 11.5, gap: 5, maxWidth: 320 }}>
          <Check size={12} color="var(--teal-700)" /> {note}
        </span>
      )}
    </span>
  );
}
