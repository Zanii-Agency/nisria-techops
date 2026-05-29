import Shell from "../../components/Shell";
import { admin } from "../../lib/supabase-admin";
import { getCurrentUser } from "../../lib/auth";
import { STORY_SECTIONS, MULTI_SECTION_KEYS } from "../../lib/brain";
import {
  PILLARS,
  SEQUENCE,
  COMING_NEXT,
  OWNER_LABEL,
  type CheckKey,
  type Owner,
} from "../../lib/guide";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  CircleDashed,
  ArrowRight,
  Hammer,
  Sparkles,
  UserRound,
  Compass,
} from "lucide-react";

export const dynamic = "force-dynamic";

type Status = "done" | "partial" | "pending";

// ---- LIVE STATUS: read real counts, never hardcode done/pending -------------
async function computeStatus(): Promise<Record<CheckKey, { status: Status; detail: string }>> {
  const db = admin();
  const count = async (table: string, filter?: (q: any) => any) => {
    try {
      let q = db.from(table).select("*", { count: "exact", head: true });
      if (filter) q = filter(q);
      const { count: c } = await q;
      return c || 0;
    } catch {
      return 0;
    }
  };

  const [
    team,
    donors,
    beneficiaries,
    payments,
    grants,
    assets,
    emails,
    sigs,
    profileRes,
    entryRes,
    connRes,
  ] = await Promise.all([
    count("team_members"),
    count("donors"),
    count("beneficiaries"),
    count("payments"),
    count("grant_opportunities"),
    count("assets"),
    count("email_accounts"),
    count("email_accounts", (q) => q.neq("signature_html", "")),
    db.from("org_profile").select("section,content"),
    db.from("brain_entries").select("section").in("section", MULTI_SECTION_KEYS),
    db.from("connector_registry").select("key,enabled"),
  ]);

  // Brain completeness, mirroring the Settings page exactly.
  const saved: Record<string, string> = {};
  for (const row of ((profileRes.data || []) as any[])) {
    if (row?.section) saved[row.section] = row.content || "";
  }
  const hasEntry = new Set(((entryRes.data || []) as any[]).map((r) => r.section));
  const filledCount = STORY_SECTIONS.filter(
    (s) => (saved[s.key] || "").trim().length > 0 || hasEntry.has(s.key)
  ).length;
  const storyTotal = STORY_SECTIONS.length;
  const brainPct = storyTotal ? Math.round((filledCount / storyTotal) * 100) : 0;

  const connectors: Record<string, boolean> = {};
  for (const c of ((connRes.data || []) as any[])) connectors[c.key] = !!c.enabled;

  const ok = (n: number, label: string): { status: Status; detail: string } =>
    n > 0 ? { status: "done", detail: label } : { status: "pending", detail: "Nothing here yet" };

  return {
    brain:
      brainPct >= 100
        ? { status: "done", detail: "All areas filled" }
        : brainPct > 0
        ? { status: "partial", detail: `${filledCount} of ${storyTotal} areas filled` }
        : { status: "pending", detail: "Not started yet" },
    team: ok(team, `${team} members`),
    donors: ok(donors, `${donors} donors imported`),
    beneficiaries: ok(beneficiaries, `${beneficiaries} profiles`),
    finance: ok(payments, `${payments} entries logged`),
    grants: ok(grants, `${grants} opportunities found`),
    library: ok(assets, `${assets} items`),
    email_accounts: ok(emails, `${emails} connected`),
    signature: ok(sigs, `${sigs} set`),
    content_channels: connectors["postiz"]
      ? { status: "done", detail: "Channels connected" }
      : { status: "pending", detail: "Not connected yet" },
    whatsapp: connectors["whatsapp"]
      ? { status: "done", detail: "Fully connected" }
      : { status: "partial", detail: "Sending and receiving now, permanent connection pending" },
  };
}

const STATUS_META: Record<Status, { icon: any; cls: string; word: string }> = {
  done: { icon: CheckCircle2, cls: "g-done", word: "Done" },
  partial: { icon: CircleDashed, cls: "g-partial", word: "In progress" },
  pending: { icon: Circle, cls: "g-pending", word: "To do" },
};

const OWNER_ICON: Record<Owner, any> = { you: UserRound, sasa: Sparkles, taona: Hammer };

export default async function GuidePage() {
  const user = getCurrentUser();
  const firstName = user?.name?.split(" ")[0] || "there";
  const status = await computeStatus();

  const doneCount = SEQUENCE.filter((s) => status[s.check].status === "done").length;

  return (
    <Shell title="Guide" sub="How the command center works, and what to set up next">
      {/* Welcome */}
      <div className="card guide-hero">
        <div className="guide-hero-icon"><Compass size={22} /></div>
        <div>
          <h2 style={{ margin: 0 }}>Welcome, {firstName}.</h2>
          <p className="muted" style={{ marginTop: 6, maxWidth: 640 }}>
            This is your command center. One place to run Nisria: the money, the children, the
            messages, the story. Sasa, your assistant, does the heavy lifting and asks you before
            anything important leaves the building. Below is a map of where everything lives, then a
            short sequence to make it yours. The sequence checks itself against your real data, so it
            always tells the truth about what is done.
          </p>
        </div>
      </div>

      {/* THE SEQUENCE */}
      <div className="guide-section-head">
        <h3>Set it up, in sequence</h3>
        <span className="guide-progress">{doneCount} of {SEQUENCE.length} done</span>
      </div>
      <div className="guide-steps">
        {SEQUENCE.map((step) => {
          const st = status[step.check];
          const meta = STATUS_META[st.status];
          const SIcon = meta.icon;
          const OIcon = OWNER_ICON[step.owner];
          return (
            <Link href={step.href} key={step.n} className={`card guidestep ${meta.cls}`}>
              <div className="guidestep-status"><SIcon size={20} /></div>
              <div className="guidestep-body">
                <div className="guidestep-top">
                  <span className="guidestep-title">{step.title}</span>
                  <span className={`ownertag own-${step.owner}`}><OIcon size={12} /> {OWNER_LABEL[step.owner]}</span>
                </div>
                <p className="guidestep-why">{step.why}</p>
                <div className="guidestep-meta">
                  <span className={`g-badge ${meta.cls}`}>{meta.word}</span>
                  <span className="muted">{st.detail}</span>
                  <span className="guidestep-go">Open <ArrowRight size={13} /></span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* THE MAP */}
      <div className="guide-section-head" style={{ marginTop: 34 }}>
        <h3>Where everything lives</h3>
      </div>
      <div className="grid cols-2">
        {PILLARS.map((p) => (
          <div className="card card-pad" key={p.key}>
            <div style={{ marginBottom: 4 }}>
              <strong style={{ fontSize: 15 }}>{p.title}</strong>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{p.blurb}</div>
            </div>
            <div className="guide-maplist">
              {p.items.map((it) => (
                <Link href={it.href} key={it.href} className="guide-mapitem">
                  <div className="guide-mapitem-head">
                    <span className="guide-mapitem-label">{it.label}</span>
                    <ArrowRight size={13} className="muted" />
                  </div>
                  <div className="guide-mapitem-what">{it.what}</div>
                  <div className="guide-mapitem-obj">{it.objective}</div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* COMING NEXT */}
      <div className="guide-section-head" style={{ marginTop: 34 }}>
        <h3>Still being built</h3>
      </div>
      <div className="card card-pad">
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          The platform keeps growing. These are on the way, so nothing here surprises you when it
          appears.
        </p>
        <ul className="guide-next">
          {COMING_NEXT.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      </div>
    </Shell>
  );
}
