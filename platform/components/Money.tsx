"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

// SINGLE money-rendering primitive. Every currency value in the app renders
// through here so the privacy blur (.hide-money .money) can never be forgotten
// on a new amount. Promoted from the inline <Money> that used to live only in
// app/finance/page.tsx.
//
// USD → clean $ via Intl. Anything else (e.g. KES) keeps its code so it can't be
// mislabelled as dollars. The formatted string lives inside a <span.money>.
function fmt(amount: any, currency?: string): string {
  const cur = (currency || "USD").toUpperCase();
  if (cur === "USD") {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(amount || 0));
  }
  const n = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(amount || 0));
  return `${cur} ${n}`;
}

export function Money({
  amount,
  currency,
  className,
  style,
  prefix,
}: {
  amount: any;
  currency?: string;
  className?: string;
  style?: any;
  prefix?: string;
}) {
  return (
    <span className={`money${className ? " " + className : ""}`} style={style}>
      {prefix || ""}{fmt(amount, currency)}
    </span>
  );
}

// Per-card hide eye. Replaces the single global toggle in the top bar (the
// founder wants the control right where the money is). Toggling sets the same
// .hide-money class on <html> so the blur is global, but the AFFORDANCE lives on
// each money card. Persists to localStorage and reflects state set by any other
// MoneyHideToggle on the page.
export function MoneyHideToggle({ style }: { style?: any }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const read = () => setHidden(document.documentElement.classList.contains("hide-money"));
    read();
    // keep every per-card eye in sync when another one is toggled
    window.addEventListener("money-hide-changed", read);
    return () => window.removeEventListener("money-hide-changed", read);
  }, []);

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const h = !document.documentElement.classList.contains("hide-money");
    document.documentElement.classList.toggle("hide-money", h);
    try { localStorage.setItem("nis.hideMoney", h ? "1" : "0"); } catch {}
    setHidden(h);
    window.dispatchEvent(new Event("money-hide-changed"));
  }

  return (
    <button
      type="button"
      className="money-eye"
      onClick={toggle}
      title={hidden ? "Show amount" : "Hide amount"}
      aria-label={hidden ? "Show amount" : "Hide amount"}
      style={style}
    >
      {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
    </button>
  );
}

export default Money;
