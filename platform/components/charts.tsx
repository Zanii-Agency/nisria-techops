import React from "react";

// Circular gauge (PREMIUM DESIGN 2 style)
export function Gauge({ pct, value, label }: { pct: number; value: string; label: string }) {
  const r = 56, c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(1, Math.max(0, pct / 100)));
  return (
    <div className="gauge">
      <svg width="132" height="132" viewBox="0 0 132 132">
        <circle cx="66" cy="66" r={r} fill="none" stroke="var(--line)" strokeWidth="12" />
        <circle cx="66" cy="66" r={r} fill="none" stroke="var(--teal)" strokeWidth="12" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 66 66)" />
      </svg>
      <div className="gtext"><div><div className="gval">{value}</div><div className="glabel">{label}</div></div></div>
    </div>
  );
}

// Rounded-bar chart. `valueLabels` puts a value on EVERY bar (denser, kills the
// empty whitespace — FEEDBACK #23); otherwise just the highlighted bar gets the
// black tooltip. `tall` raises the plot so the data fills the card.
export function BarChart({
  data,
  highlight,
  valueLabels,
  tall,
}: {
  data: { label: string; value: number; tip?: string }[];
  highlight?: number;
  valueLabels?: boolean;
  tall?: boolean;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className={`barchart ${tall ? "tall" : ""} ${valueLabels ? "labelled" : ""}`}>
      {data.map((d, i) => {
        const h = d.value <= 0 ? 4 : Math.max(8, (d.value / max) * 100);
        const hi = i === (highlight ?? data.length - 1);
        return (
          <div className={`barcol ${hi ? "hi" : ""}`} key={i}>
            {valueLabels ? (
              <div className="barval"><span className="money">{d.tip ?? d.value}</span></div>
            ) : (
              hi && <div className="bartip"><span className="money">{d.tip ?? d.value}</span></div>
            )}
            <div className="bar" style={{ height: `${h}%` }} />
            <div className="blabel">{d.label}</div>
          </div>
        );
      })}
    </div>
  );
}

