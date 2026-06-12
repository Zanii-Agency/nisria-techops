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
  if (!seconds || seconds < 60) return seconds ? `${seconds}s` : "—";
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
      <div className="px-6 py-8 max-w-4xl mx-auto">
        <Link href="/meetings" className="text-sm text-zinc-500 hover:text-zinc-900">← All meetings</Link>

        {!m ? (
          <div className="mt-6">Meeting not found.</div>
        ) : (
          <>
            <div className="mt-4 mb-8">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-light tracking-tight">{m.title}</h1>
                <Badge tone={sourceTone}>{m.source}</Badge>
                {m.status === "failed" && <Badge tone="red">failed</Badge>}
              </div>
              <p className="text-sm text-zinc-500">{fmtDate(m.created_at)} · {fmtDuration(m.duration_sec)}</p>
            </div>

            {m.status === "failed" && (
              <div className="mb-6 p-4 border border-red-200 bg-red-50 rounded-lg">
                <p className="text-sm text-red-800">{m.failed_reason || "Capture failed."}</p>
              </div>
            )}

            {m.summary && (
              <section className="mb-8">
                <h2 className="text-sm uppercase tracking-wide text-zinc-500 mb-3">Summary</h2>
                <p className="text-zinc-800 leading-relaxed whitespace-pre-wrap">{m.summary}</p>
              </section>
            )}

            {Array.isArray(m.decisions) && m.decisions.length > 0 && (
              <section className="mb-8">
                <h2 className="text-sm uppercase tracking-wide text-zinc-500 mb-3">Decisions</h2>
                <ul className="space-y-2">
                  {m.decisions.map((d: string, i: number) => (
                    <li key={i} className="flex gap-3">
                      <span className="text-zinc-400 mt-1">·</span>
                      <span className="text-zinc-800">{d}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {tasks.length > 0 && (
              <section className="mb-8">
                <h2 className="text-sm uppercase tracking-wide text-zinc-500 mb-3">Tasks from this call</h2>
                <ul className="space-y-2">
                  {tasks.map((t: any) => (
                    <li key={t.id} className="flex items-center gap-3">
                      <Badge tone={t.priority === "high" ? "red" : t.priority === "low" ? "" : "yellow"}>{t.priority}</Badge>
                      <span className={`flex-1 ${t.status === "done" ? "line-through text-zinc-400" : "text-zinc-800"}`}>{t.title}</span>
                      <Link href="/tasks" className="text-xs text-zinc-500 hover:text-zinc-900">view</Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {m.transcript && (
              <section>
                <h2 className="text-sm uppercase tracking-wide text-zinc-500 mb-3">Transcript</h2>
                <pre className="text-sm text-zinc-700 whitespace-pre-wrap font-mono bg-zinc-50 p-4 rounded-lg max-h-96 overflow-auto">{m.transcript}</pre>
              </section>
            )}
          </>
        )}
      </div>
    </Shell>
  );
}
