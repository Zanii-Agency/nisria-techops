import SmartConsole from "../../components/SmartConsole";
import { Wand2, ListChecks, Boxes, PenLine } from "lucide-react";

export const dynamic = "force-dynamic";

const CAPS = [
  { icon: ListChecks, title: "Run tasks", meta: "Assign work, log a call, move a status." },
  { icon: Boxes, title: "Update records", meta: "Add inventory, file a doc, populate a card." },
  { icon: PenLine, title: "Draft & queue", meta: "Thank-yous and posts, held for your approval." },
];

// The capability tiles (Run tasks / Update records / Draft & queue) used to sit
// BELOW the console, repeating what the hero subtitle and the hero badges and
// the SmartConsole greeting all already said. Founder flagged the duplication
// (portal-fix shot 9). The tiles move to the top (they tell the operator what
// Smart Mode CAN do BEFORE she types), the duplicate subtitle is gone, and the
// hero badges are gone. The SmartConsole greeting still says it once.
export default function Smart() {
  return (
    <div className="pagewrap rise">
      <div className="hero">
        <div>
          <div className="eyebrow"><Wand2 size={14} style={{ verticalAlign: -2 }} /> Smart Mode</div>
          <h1 className="disp2">Tell me what to do.</h1>
        </div>
      </div>

      <div className="grid3" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 16 }}>
        {CAPS.map((c) => (
          <div key={c.title} className="feature teal">
            <div className="ficon"><c.icon size={20} /></div>
            <div className="ftitle">{c.title}</div>
            <div className="fmeta">{c.meta}</div>
          </div>
        ))}
      </div>

      <SmartConsole />
    </div>
  );
}
