import { Money } from "./Money";
import UpcomingPaymentsStrip from "./UpcomingPaymentsStrip";
import { ArrowUpRight, ArrowDownLeft, Clock, ChevronRight } from "lucide-react";
import type { UpcomingPayment } from "../lib/upcoming";

// The 3-card hero on /finance: Money in this month / Money out this month /
// Upcoming payments. Operating cash only — donations live on /fundraising, not
// here (Taona 2026-07-09). Equal width on desktop, stack on mobile; the
// Upcoming card holds the internal horizontal scroll.

export default function ExpenseTrioHero({
  inTotals,
  inCount,
  outTotals,
  outCount,
  outDeltaPct,
  upcoming,
  refunds,
}: {
  inTotals: Record<string, number>;
  inCount: number;
  outTotals: Record<string, number>;
  outCount: number;
  outDeltaPct: number | null;
  upcoming: UpcomingPayment[];
  refunds: { count: number; totals: Record<string, number> };
}) {
  const primaryIn = inTotals.KES || inTotals.USD || 0;
  const primaryInCcy = inTotals.KES ? "KES" : "USD";
  const primaryOut = outTotals.KES || outTotals.USD || 0;
  const primaryOutCcy = outTotals.KES ? "KES" : "USD";

  const upcomingTotal = upcoming.reduce<Record<string, number>>((acc, p) => {
    acc[p.currency] = (acc[p.currency] || 0) + p.amount;
    return acc;
  }, {});

  return (
    <div className="trio-hero">
      {/* Money in this month — operating inflows (member payments, transfers),
          NOT donations. Donations live on /fundraising. */}
      <a className="trio-card trio-don" href="#expense-list">
        <div className="trio-card-head">
          <span className="trio-card-icon teal"><ArrowUpRight size={15} /></span>
          <span className="trio-card-label">Money in this month</span>
          <ChevronRight size={14} className="trio-card-arrow" />
        </div>
        <div className="trio-card-figure">
          <Money amount={primaryIn} currency={primaryInCcy} />
        </div>
        <div className="trio-card-sub">
          {inCount} {inCount === 1 ? "payment received" : "payments received"}
        </div>
      </a>

      {/* Money out this month */}
      <a className="trio-card trio-out" href="#expense-list">
        <div className="trio-card-head">
          <span className="trio-card-icon coral"><ArrowDownLeft size={15} /></span>
          <span className="trio-card-label">Money out this month</span>
          <ChevronRight size={14} className="trio-card-arrow" />
        </div>
        <div className="trio-card-figure">
          <Money amount={primaryOut} currency={primaryOutCcy} />
        </div>
        <div className="trio-card-sub">
          {outCount} {outCount === 1 ? "transaction" : "transactions"}
          {outDeltaPct !== null && (
            <> · {outDeltaPct >= 0 ? "▲" : "▼"} {Math.abs(outDeltaPct)}% vs last month</>
          )}
        </div>
        {refunds.count > 0 && (
          <div className="trio-card-refund">
            refunds: {Object.entries(refunds.totals).map(([c, v]) => (
              <Money key={c} amount={v} currency={c} className="strong" />
            ))} ({refunds.count})
          </div>
        )}
      </a>

      {/* Upcoming payments — horizontally scrollable */}
      <div className="trio-card trio-up">
        <div className="trio-card-head">
          <span className="trio-card-icon gold"><Clock size={15} /></span>
          <span className="trio-card-label">Upcoming payments</span>
          <span className="trio-card-mini">
            {upcoming.length} in next 7 days
            {Object.entries(upcomingTotal).map(([c, v]) => (
              <span key={c} className="muted" style={{ marginLeft: 6 }}>
                · <Money amount={v} currency={c} />
              </span>
            ))}
          </span>
        </div>
        <UpcomingPaymentsStrip rows={upcoming} />
      </div>
    </div>
  );
}
