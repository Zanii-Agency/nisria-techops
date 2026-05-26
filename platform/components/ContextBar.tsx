"use client";

import { useRouter, usePathname } from "next/navigation";
import {
  Search, UserPlus, Sparkles, FilePlus2, ReceiptText, Mail, MailCheck,
  Heart, DollarSign, Target, Award, FileText, Users, HeartHandshake, PenLine, Inbox as InboxIcon,
} from "lucide-react";

// CONTEXTUAL TOP BAR (FEEDBACK #17). A subtle strip under the pill nav that
// transforms per route: the current section name + the 1-2 most relevant
// actions for that page. It does NOT replace the pill nav — it complements it.
//
// Actions stay truthful: each dispatches an event the relevant page already
// listens for (or opens the command palette), so nothing dead-ends. When the
// target page isn't mounted yet, we navigate there first, then fire the event
// on the next tick so the page's listener is alive to catch it.

type Action = {
  label: string;
  icon: any;
  // One of: dispatch an event (client modal buttons listen for these),
  // focus/scroll an inline panel by id (server-form buttons + inline intakes),
  // open the command palette, or just navigate.
  event?: string;
  detail?: any;
  target?: string; // element id to scroll-into-view + focus
  cmdk?: boolean;
  // route the action belongs to; if we're not there yet, navigate first.
  route?: string;
};

type Ctx = { label: string; icon: any; actions: Action[] };

// Match the longest static prefix so /donors/[id] still shows the Donors context.
function contextFor(path: string): Ctx | null {
  if (path === "/" ) {
    // The top ⌘K omnibox owns Search; ContextBar no longer duplicates it (#39).
    return { label: "Mission Control", icon: Sparkles, actions: [
      { label: "Ask Sasa", icon: Sparkles, event: "open-sasa" },
    ] };
  }
  if (path.startsWith("/donors")) {
    return { label: "Donors", icon: Heart, actions: [
      { label: "Search donors", icon: Search, route: "/donors", target: "donor-search" },
    ] };
  }
  if (path.startsWith("/donations")) {
    return { label: "Donations", icon: DollarSign, actions: [
      { label: "Draft thank-yous", icon: Heart, route: "/donations", target: "donations-thank-all" },
    ] };
  }
  if (path.startsWith("/campaigns")) {
    // No page-specific action; the ⌘K omnibox covers search. Show just the title.
    return { label: "Campaigns", icon: Target, actions: [] };
  }
  if (path.startsWith("/grants")) {
    return { label: "Grants", icon: Award, actions: [
      { label: "Prepare all ready", icon: Sparkles, route: "/grants", event: "grants:prepare-all" },
      { label: "Add grant", icon: FilePlus2, route: "/grants", event: "grants:add" },
    ] };
  }
  if (path.startsWith("/finance")) {
    return { label: "Finance", icon: DollarSign, actions: [
      { label: "Add expense", icon: ReceiptText, route: "/finance", target: "finance-expense-intake" },
    ] };
  }
  if (path.startsWith("/reports")) {
    return { label: "Reports", icon: FileText, actions: [
      { label: "New report", icon: FilePlus2, route: "/reports", target: "reports-builder" },
    ] };
  }
  if (path.startsWith("/inbox")) {
    return { label: "Inbox", icon: InboxIcon, actions: [
      { label: "Needs reply", icon: MailCheck, route: "/inbox?f=needs" },
      { label: "All mail", icon: Mail, route: "/inbox?f=all" },
    ] };
  }
  if (path.startsWith("/team")) {
    return { label: "Team", icon: Users, actions: [
      { label: "Add member", icon: UserPlus, route: "/team", event: "team:add" },
    ] };
  }
  if (path.startsWith("/beneficiaries")) {
    return { label: "Beneficiaries", icon: HeartHandshake, actions: [
      { label: "Add child", icon: UserPlus, route: "/beneficiaries", target: "beneficiary-intake" },
    ] };
  }
  if (path.startsWith("/content")) {
    return { label: "Content", icon: PenLine, actions: [
      { label: "Draft a post", icon: Sparkles, event: "sasa-ask", detail: "Give me 3 post ideas for this week that fit Nisria's voice." },
    ] };
  }
  if (path.startsWith("/studio")) {
    return { label: "Document Studio", icon: Sparkles, actions: [] };
  }
  return null;
}

export default function ContextBar() {
  const path = usePathname();
  const router = useRouter();
  // strip a querystring for matching (e.g. /inbox?f=needs)
  const ctx = contextFor((path || "/").split("?")[0]);
  if (!ctx) return null;

  function run(a: Action) {
    if (a.cmdk) { window.dispatchEvent(new Event("open-cmdk")); return; }

    const base = (a.route || "").split("?")[0];
    const needsNav = !!(a.route && base && !path.startsWith(base));

    if (a.event) {
      const fire = () => window.dispatchEvent(new CustomEvent(a.event!, { detail: a.detail }));
      if (needsNav) { router.push(a.route!); setTimeout(fire, 420); } else fire();
      return;
    }
    if (a.target) {
      // Scroll an inline panel (or a server-form button) into view + focus it.
      // Works for inline intakes AND server-action buttons without wiring a
      // listener into a server component — never dead-ends.
      const focus = () => {
        const el = document.getElementById(a.target!);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const f = (el.matches("input,textarea,button,select,a") ? el : el.querySelector<HTMLElement>("input,textarea,button,select")) as HTMLElement | null;
        f?.focus({ preventScroll: true });
      };
      if (needsNav) { router.push(a.route!); setTimeout(focus, 460); } else focus();
      return;
    }
    if (a.route) router.push(a.route);
  }

  const Sec = ctx.icon;
  return (
    <div className="ctxbar">
      <div className="ctxbar-inner">
        <span className="ctxbar-title"><Sec size={15} /> {ctx.label}</span>
        {ctx.actions.length > 0 && (
          <span className="ctxbar-actions">
            {ctx.actions.map((a) => {
              const I = a.icon;
              return (
                <button key={a.label} type="button" className="ctxbar-act" onClick={() => run(a)}>
                  <I size={13} /> {a.label}
                </button>
              );
            })}
          </span>
        )}
      </div>
    </div>
  );
}
