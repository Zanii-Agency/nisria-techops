"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Home, Inbox, HeartHandshake, DollarSign, Target, Award, FileText, ShieldCheck,
  Sparkles, FolderOpen, PenLine, Send, Package, Heart, Users, ListChecks,
  Wand2, Bot, Settings, Search, LifeBuoy,
} from "lucide-react";

// Launchpad: one searchable bento of every place in the command center (in the
// platform's light editorial skin). Pinned, most-used modules sit large; the rest
// stay standard. Type to filter, Enter opens the top hit, Esc clears. Purely
// additive, a destination, not a change to how the existing nav behaves.
type App = { label: string; href: string; icon: any; tone: string };
const APPS: App[] = [
  { label: "Home", href: "/", icon: Home, tone: "teal" },
  { label: "Inbox", href: "/inbox", icon: Inbox, tone: "peri" },
  { label: "Donors", href: "/donors", icon: HeartHandshake, tone: "teal" },
  { label: "Donations", href: "/donations", icon: DollarSign, tone: "green" },
  { label: "Campaigns", href: "/campaigns", icon: Target, tone: "gold" },
  { label: "Grants", href: "/grants", icon: Award, tone: "peri" },
  { label: "Finance", href: "/finance", icon: DollarSign, tone: "green" },
  { label: "Reports", href: "/reports", icon: FileText, tone: "teal" },
  { label: "Legal & Compliance", href: "/legal", icon: ShieldCheck, tone: "gold" },
  { label: "Document Studio", href: "/studio", icon: Sparkles, tone: "peri" },
  { label: "Filing", href: "/filing", icon: FolderOpen, tone: "teal" },
  { label: "Content", href: "/content", icon: PenLine, tone: "gold" },
  { label: "Library", href: "/library", icon: FolderOpen, tone: "peri" },
  { label: "Outreach", href: "/outreach", icon: Send, tone: "teal" },
  { label: "Inventory", href: "/inventory", icon: Package, tone: "gold" },
  { label: "Beneficiaries", href: "/beneficiaries", icon: Heart, tone: "teal" },
  { label: "Cases", href: "/cases", icon: LifeBuoy, tone: "teal" },
  { label: "Team", href: "/team", icon: Users, tone: "peri" },
  { label: "Tasks", href: "/tasks", icon: ListChecks, tone: "gold" },
  { label: "Smart Mode", href: "/smart", icon: Wand2, tone: "teal" },
  { label: "Agents", href: "/agents", icon: Bot, tone: "peri" },
  { label: "Settings", href: "/settings", icon: Settings, tone: "gray" },
].sort((a, b) => a.label.localeCompare(b.label));

// Presentation-only: which modules read as pinned / most-used and so render large in
// the bento. Keyed by href so it survives label edits. No server logic, no new data.
const FEATURED = new Set<string>(["/", "/inbox", "/finance", "/donors", "/tasks", "/beneficiaries"]);

export default function Launchpad() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? APPS.filter((a) => a.label.toLowerCase().includes(n)) : APPS;
  }, [q]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && list[0]) router.push(list[0].href);
    if (e.key === "Escape") setQ("");
  };

  // Pinned tiles lead the bento only when the operator is browsing the full set; once
  // a query is active the order stays as filtered so the top hit is predictable.
  const searching = q.trim().length > 0;
  const featured = searching ? [] : list.filter((a) => FEATURED.has(a.href));
  const rest = searching ? list : list.filter((a) => !FEATURED.has(a.href));

  return (
    <div className="lp-wrap rise">
      <div className="lp-searchrow">
        <div className="lp-search">
          <Search size={17} style={{ color: "var(--faint)", flexShrink: 0 }} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search apps…" />
        </div>
      </div>

      {featured.length > 0 && (
        <>
          <div className="lp-secrow">
            <span className="lp-sectitle disp2">Pinned</span>
            <span className="badge gray">{featured.length}</span>
          </div>
          <div className="lp-bento">
            {featured.map((a) => {
              const Ico = a.icon;
              return (
                <button key={a.href} type="button" className="card hover lp-cell" onClick={() => router.push(a.href)}>
                  <span className={`lp-ico ${a.tone}`}><Ico size={26} /></span>
                  <span className="lp-cell-body">
                    <span className="lp-cell-name disp2">{a.label}</span>
                    <span className="lp-cell-go">Open</span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {rest.length > 0 && (
        <>
          {!searching && (
            <div className="lp-secrow">
              <span className="lp-sectitle disp2">All modules</span>
              <span className="badge gray">{rest.length}</span>
            </div>
          )}
          <div className="lp-grid">
            {rest.map((a) => {
              const Ico = a.icon;
              return (
                <button key={a.href} type="button" className="lp-tile" onClick={() => router.push(a.href)}>
                  <span className={`lp-ico ${a.tone}`}><Ico size={26} /></span>
                  <span className="lp-label">{a.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {list.length === 0 && <div className="faint" style={{ textAlign: "center", padding: 40 }}>No app matches “{q}”.</div>}

      <style jsx>{`
        .lp-secrow { display: flex; align-items: center; gap: 9px; margin: 26px 2px 12px; }
        .lp-secrow:first-of-type { margin-top: 4px; }
        .lp-sectitle { font-size: 13px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
        .lp-bento { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        .lp-cell { display: flex; align-items: center; gap: 14px; padding: 18px; text-align: left; cursor: pointer; font: inherit; }
        .lp-cell .lp-ico { flex-shrink: 0; }
        .lp-cell-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .lp-cell-name { font-size: 16px; font-weight: 600; color: var(--ink); line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .lp-cell-go { font-size: 12px; font-weight: 500; color: var(--faint); }
        @media (max-width: 820px) { .lp-bento { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 540px) { .lp-bento { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
