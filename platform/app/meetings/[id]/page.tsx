import Link from "next/link";
import Shell from "../../../components/Shell";
import { Badge } from "../../../components/ui";
import { admin } from "../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

function fmtDate(s: string | null): string {
  if (!s) return "";
  try {
    return new Date(s).toLocaleString("en-GB", { timeZone: "Africa/Nairobi", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return s;
  }
}

function fmtDuration(seconds: number): string {
  if (!seconds || seconds < 60) return seconds ? `${seconds}s` : "-";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m - h * 60;
  return `${h}h ${r}m`;
}

export default async function MeetingDetail({ params }: { params: { id: string } }) {
  const db = admin();
  const { data } = await db
    .from("digital_u_meetings")
    .select("id,title,source,duration_sec,transcript,summary,decisions,status,failed_reason,created_at")
    .eq("id", params.id)
    .single();
  const m = data as any;

  const { data: taskRows } = await db
    .from("tasks")
    .select("id,title,priority,status,due_on")
    .eq("source_kind", "meeting")
    .eq("source_id", params.id)
    .order("priority", { ascending: true });
  const tasks = (taskRows || []) as any[];

  const sourceTone = m?.source === "zoom" ? "blue" : m?.source === "meet" ? "green" : m?.source === "teams" ? "purple" : "";

  return (
    <Shell title={m?.title || "Meeting"}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 0" }}>
        <Link href="/meetings" style={{ fontSize: 13, color: "var(--muted)" }}>← All meetings</Link>

        {!m ? (
          <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--faint)", marginTop: 16 }}>Meeting not found.</div>
        ) : (
          <>
            <div style={{ marginTop: 16, marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", fontFamily: "var(--font-display)" }}>{m.title}</div>
                <Badge tone={sourceTone}>{m.source}</Badge>
                {m.status === "failed" && <Badge tone="red">failed</Badge>}
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>{fmtDate(m.created_at)} · {fmtDuration(m.duration_sec)}</div>
            </div>

            {m.status === "failed" && (
              <div style={{ marginBottom: 24, padding: 14, background: "var(--line)", borderRadius: 12, fontSize: 13, color: "var(--danger)" }}>
                {m.failed_reason || "Capture failed."}
              </div>
            )}

            {m.summary && (
              <section style={{ marginBottom: 28 }}>
                <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>Summary</h2>
                <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)", whiteSpace: "pre-wrap" }}>{m.summary}</div>
              </section>
            )}

            {Array.isArray(m.decisions) && m.decisions.length > 0 && (
              <section style={{ marginBottom: 28 }}>
                <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>Decisions</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {m.decisions.map((d: string, i: number) => (
                    <div key={i} style={{ display: "flex", gap: 10, fontSize: 14, color: "var(--ink-2)" }}>
                      <span style={{ color: "var(--faint)" }}>·</span>
                      <span>{d}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {tasks.length > 0 && (
              <section style={{ marginBottom: 28 }}>
                <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>Tasks from this call</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {tasks.map((t: any) => (
                    <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
                      <Badge tone={t.priority === "high" ? "red" : t.priority === "low" ? "" : "yellow"}>{t.priority}</Badge>
                      <span style={{ flex: 1, textDecoration: t.status === "done" ? "line-through" : "none", color: t.status === "done" ? "var(--faint)" : "var(--ink-2)" }}>{t.title}</span>
                      <Link href="/tasks" style={{ fontSize: 12, color: "var(--muted)" }}>view</Link>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {m.transcript && (
              <section>
                <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>Transcript</h2>
                <pre style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink-2)", whiteSpace: "pre-wrap", fontFamily: "monospace", background: "var(--glass)", padding: 16, borderRadius: 14, maxHeight: 400, overflow: "auto" }}>{m.transcript}</pre>
              </section>
            )}
          </>
        )}
      </div>
    </Shell>
  );
}
