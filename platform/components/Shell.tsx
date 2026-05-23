"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { logout } from "../app/login/actions";

const NAV = [
  { href: "/", label: "Dashboard", ico: "◫" },
  { href: "/donors", label: "Donors", ico: "○" },
  { href: "/donations", label: "Donations", ico: "$" },
  { href: "/campaigns", label: "Campaigns", ico: "◎" },
  { href: "/beneficiaries", label: "Beneficiaries", ico: "♥" },
  { href: "/inventory", label: "Inventory", ico: "▦" },
  { href: "/grants", label: "Grants", ico: "✦" },
  { href: "/outreach", label: "Outreach", ico: "→" },
];

export default function Shell({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  const path = usePathname();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="dot">N</span> Nisria
        </div>
        <nav className="nav">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={active ? "active" : ""}>
                <span className="ico">{n.ico}</span> {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="foot">
          <form action={logout}>
            <button
              type="submit"
              style={{ background: "none", border: 0, color: "var(--faint)", cursor: "pointer", padding: 0, fontSize: 12 }}
            >
              Sign out
            </button>
          </form>
          <div style={{ marginTop: 6 }}>Command Center · v1</div>
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <h1>{title}</h1>
          {sub && <div className="sub">{sub}</div>}
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
