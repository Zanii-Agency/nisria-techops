import Link from "next/link";
import Shell from "../../components/Shell";
import { Badge } from "../../components/ui";
import { admin } from "../../lib/supabase-admin";
import { getCurrentUser } from "../../lib/auth";
import { getCurrentTeamMember, initialsOf } from "../../lib/profile";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = { founder: "Founder", builder: "Builder" };

export default async function Profile() {
  const user = getCurrentUser();
  const profile = await getCurrentTeamMember();

  if (!user) {
    return (
      <Shell title="Profile">
        <div className="card"><div className="card-pad muted">Not signed in.</div></div>
      </Shell>
    );
  }

  const db = admin();
  const initials = profile ? initialsOf(profile.name) : user.initials;

  // Task stats grounded in the profile bridge: what's assigned to me, what I created.
  let assignedOpen = 0, assignedDone = 0, createdMine = 0;
  if (profile) {
    const { data: assigned } = await db.from("tasks").select("status").eq("assignee_id", profile.id).limit(1000);
    assignedOpen = (assigned || []).filter((t: any) => t.status !== "done").length;
    assignedDone = (assigned || []).filter((t: any) => t.status === "done").length;
  }
  const { count } = await db.from("tasks").select("id", { count: "exact", head: true }).eq("created_by", user.name);
  createdMine = count || 0;

  const Stat = ({ n, label, href }: { n: number; label: string; href?: string }) => {
    const inner = (
      <div className="card" style={{ flex: 1 }}>
        <div className="card-pad" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{n}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{label}</div>
        </div>
      </div>
    );
    return href ? <Link href={href} style={{ flex: 1, textDecoration: "none", color: "inherit" }}>{inner}</Link> : inner;
  };

  return (
    <Shell title="Profile" sub="Who you are on the platform, and your work at a glance">
      <div className="card">
        <div className="card-pad" style={{ display: "flex", gap: 18, alignItems: "center" }}>
          <div aria-hidden style={{
            width: 64, height: 64, borderRadius: "50%", flexShrink: 0,
            background: "var(--nisria)", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, fontWeight: 700,
          }}>{initials}</div>
          <div style={{ minWidth: 0 }}>
            <div className="between" style={{ gap: 10 }}>
              <span className="strong" style={{ fontSize: 19 }}>{profile?.name || user.name}</span>
              <Badge>{ROLE_LABEL[user.role] || user.role}</Badge>
            </div>
            <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>{user.org}</div>
            {profile?.role && <div style={{ fontSize: 13.5, marginTop: 8 }}>{profile.role}</div>}
            {profile?.email && <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{profile.email}</div>}
          </div>
        </div>
        {profile?.responsibilities && (
          <div className="card-pad" style={{ borderTop: "1px solid var(--hairline)", fontSize: 13, color: "var(--ink-2)" }}>
            {profile.responsibilities}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
        <Stat n={assignedOpen} label="Assigned to me · open" href="/tasks?mine=1" />
        <Stat n={assignedDone} label="Assigned to me · done" href="/tasks?mine=1" />
        <Stat n={createdMine} label="Created by me" href="/tasks?mine=1" />
      </div>

      {!profile && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-pad muted" style={{ fontSize: 12.5 }}>
            No team directory profile is linked to this login yet. Task assignment counts need one.
          </div>
        </div>
      )}
    </Shell>
  );
}
