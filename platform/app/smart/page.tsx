import SmartConsole from "../../components/SmartConsole";
import { Wand2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default function Smart() {
  return (
    <div className="pagewrap rise">
      <div className="hero">
        <div>
          <div className="eyebrow"><Wand2 size={14} style={{ verticalAlign: -2 }} /> Smart Mode</div>
          <h1>Tell me what to do.</h1>
        </div>
      </div>
      <SmartConsole />
    </div>
  );
}
