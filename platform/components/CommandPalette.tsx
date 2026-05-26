"use client";

import { useEffect, useRef, useState } from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard, Sparkles, Inbox, PenLine, ListChecks, Users, Send,
  HeartHandshake, DollarSign, Target, Heart, Package, Award, Megaphone,
} from "lucide-react";

const DESTS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/assistant", label: "AI Assistant", icon: Sparkles },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/content", label: "Content", icon: PenLine },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/team", label: "Team", icon: Users },
  { href: "/newsletter", label: "Newsletter", icon: Send },
  { href: "/donors", label: "Donors", icon: HeartHandshake },
  { href: "/donations", label: "Donations", icon: DollarSign },
  { href: "/campaigns", label: "Campaigns", icon: Target },
  { href: "/beneficiaries", label: "Beneficiaries", icon: Heart },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/grants", label: "Grants", icon: Award },
  { href: "/outreach", label: "Outreach", icon: Megaphone },
];

const ACTIONS = [
  { href: "/assistant", label: "Ask the AI assistant", icon: Sparkles },
  { href: "/content", label: "Create a post", icon: PenLine },
  { href: "/tasks", label: "Dispatch a task", icon: ListChecks },
];

// THE ⌘K PALETTE (R-recur-2 fix). It previously used `Command.Dialog`, whose
// Radix portal renders the panel as a SIBLING of the overlay, so the overlay's
// `grid place-items` never positioned the panel: it fell into document flow and
// rendered bottom-left, uncentered (the recurring bug). This now renders its
// OWN overlay with the EXACT structure of the Modal / FocusTab primitives:
// a fixed inset:0 + grid place-items:center scrim with the OPAQUE panel as a
// CHILD, so it is truly centered and crisp every time, with no dependence on a
// portal we do not control. The `Command` engine (filter + keyboard list) is
// kept; only the broken Dialog wrapper is dropped.
export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); }
    };
    document.addEventListener("keydown", onKey);
    // allow other components (the top-nav search button) to open it
    const openEvt = () => setOpen(true);
    window.addEventListener("open-cmdk", openEvt);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("open-cmdk", openEvt);
    };
  }, [open]);

  // lock background scroll + focus the input while open, mirroring the Modal.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => {
      panelRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    }, 0);
    return () => { document.body.style.overflow = prev; clearTimeout(t); };
  }, [open]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  if (!open) return null;

  return (
    // overlay: fixed, full-screen, grid-centered (same as Modal/FocusTab). Click
    // the scrim to dismiss; the panel stops propagation so inner clicks stay.
    <div className="cmdk-overlay" onClick={() => setOpen(false)}>
      <Command
        ref={panelRef}
        label="Command palette"
        className="cmdk-panel"
        role="dialog"
        aria-modal="true"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <Command.Input placeholder="Search or jump to a page…" />
        <Command.List>
          <Command.Empty>No results.</Command.Empty>
          <Command.Group heading="Actions">
            {ACTIONS.map((a) => (
              <Command.Item key={a.label} value={a.label} onSelect={() => go(a.href)}>
                <a.icon size={16} /> {a.label}
              </Command.Item>
            ))}
          </Command.Group>
          <Command.Group heading="Go to">
            {DESTS.map((d) => (
              <Command.Item key={d.href} value={d.label} onSelect={() => go(d.href)}>
                <d.icon size={16} /> {d.label}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
