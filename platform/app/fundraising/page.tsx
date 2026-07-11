import Link from "next/link";
import Shell from "../../components/Shell";
import Treasury from "../../components/Treasury";
import { HeartHandshake, Award, ArrowUpRight } from "lucide-react";

export const dynamic = "force-dynamic";

// FUNDRAISING — the donor and grant story, lifted off the operating Finance
// page (which is now money-in vs money-out only). Treasury is the A-to-Z
// lifetime summary: donations per currency, grants won, Givebutter as the
// bridge, and the honest cash position.

export default function Fundraising() {
  return (
    <Shell
      title="Fundraising"
      sub="What we've raised, to date. Donations, grants and the treasury position. Kept separate from the operating books."
      action={
        <span className="flex" style={{ gap: 8 }}>
          <Link className="btn ghost sm" href="/donations"><HeartHandshake size={14} /> Donations</Link>
          <Link className="btn ghost sm" href="/grants"><Award size={14} /> Grants</Link>
        </span>
      }
    >
      <Treasury />
      <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>
        Operating spend and current cash flow live on <Link className="linkbtn" href="/finance">Finance <ArrowUpRight size={10} /></Link>.
      </div>
    </Shell>
  );
}
