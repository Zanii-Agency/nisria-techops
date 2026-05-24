"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { logout } from "../app/login/actions";

const PRIMARY = [
  { href: "/", label: "Dashboard", ico: "◫" },
  { href: "/assistant", label: "AI Assistant", ico: "✦" },
  { href: "/inbox", label: "Inbox", ico: "✉" },
  { href: "/content", label: "Content", ico: "✎" },
  { href: "/tasks", label: "Tasks", ico: "✓" },
  { href: "/team", label: "Team", ico: "◑" },
  { href: "/newsletter", label: "Newsletter", ico: "❋" },
];
const RECORDS = [
  { href: "/donors", label: "Donors", ico: "○" },
  { href: "/donations", label: "Donations", ico: "$" },
  { href: "/campaigns", label: "Campaigns", ico: "◎" },
  { href: "/beneficiaries", label: "Beneficiaries", ico: "♥" },
  { href: "/inventory", label: "Inventory", ico: "▦" },
  { href: "/grants", label: "Grants", ico: "✧" },
  { href: "/outreach", label: "Outreach", ico: "→" },
];

export default function Shell({ title, sub, action, children }: { title: string; sub?: string; action?: React.ReactNode; children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const recordsActive = RECORDS.some((r) => isActive(r.href));

  return (
    <div className="shell">
      <header className="topnav">
        <div className="tn-left">
          <div className="brand"><span className="dot">N</span> Nisria</div>
          <nav className="tn-nav">
            {PRIMARY.map((n) => (
              <Link key={n.href} href={n.href} className={isActive(n.href) ? "active" : ""}>
                <span className="ico">{n.ico}</span> {n.label}
              </Link>
            ))}
            <div className="tn-dropdown" onMouseLeave={() => setOpen(false)}>
              <button className={`tn-dd-btn ${recordsActive ? "active" : ""}`} onClick={() => setOpen((o) => !o)}>
                <span className="ico">▦</span> Records ▾
              </button>
              {open && (
                <div className="tn-menu">
                  {RECORDS.map((r) => (
                    <Link key={r.href} href={r.href} className={isActive(r.href) ? "active" : ""} onClick={() => setOpen(false)}>
                      <span className="ico">{r.ico}</span> {r.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </nav>
        </div>
        <div className="tn-right">
          <span className="tn-foot">Command Center · v2</span>
          <form action={logout}><button className="tn-signout" type="submit">Sign out</button></form>
        </div>
      </header>

      <main className="main">
        <div className="pagehead">
          <div>
            <h1>{title}</h1>
            {sub && <div className="sub">{sub}</div>}
          </div>
          {action}
        </div>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
