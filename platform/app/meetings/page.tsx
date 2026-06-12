import Link from "next/link";
import Shell from "../../components/Shell";
import { Badge } from "../../components/ui";
import { admin } from "../../lib/supabase-admin";

export const dynamic = "force-dynamic";

function fmtDate(s: string | null): string {
  if (!s) return "";
  try {
    return new Date(s).toLocaleString("en-GB", { timeZone: "Africa/Nairobi", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
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

type MeetingRow = {
  id: string;
  title: string;
  source: string;
  duration_sec: number;
  summary: string;
  decisions: string[];
  status: string;
  failed_reason: string | null;
  created_at: string;
};

export default async function Meetings() {
  const db = admin();
  const { data } = await db
    .from("digital_u_meetings")
    .select("id,title,source,duration_sec,summary,decisions,status,failed_reason,created_at")
    .order("created_at", { ascending: false })
    .limit(60);
  const meetings: MeetingRow[] = (data || []) as MeetingRow[];

  const total = meetings.length;
  const captured = meetings.filter((m) => m.status === "captured").length;
  const failed = meetings.filter((m) => m.status === "failed").length;

  return (
    <Shell title="Meetings">
      <div className="px-6 py-8 max-w-5xl mx-auto">
        <div className="flex items-baseline justify-between mb-6">
          <div>
            <h1 className="text-2xl font-light tracking-tight">Meetings</h1>
            <p className="text-sm text-zinc-500 mt-1">
              Calls Digital Nur recorded for you. Send a Zoom or Meet link in WhatsApp and the notetaker joins.
            </p>
          </div>
          <div className="text-sm text-zinc-500 space-x-3">
            <span>{captured} captured</span>
            {failed > 0 && <span className="text-red-500">{failed} failed</span>}
            <span className="text-zinc-400">of {total}</span>
          </div>
        </div>

        {meetings.length === 0 ? (
          <div className="border border-zinc-200 rounded-lg p-10 text-center">
            <p className="text-zinc-600">No meetings yet.</p>
            <p className="text-sm text-zinc-400 mt-2">
              WhatsApp Sasa a Zoom or Meet link and Digital Nur will join. Captures land here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {meetings.map((m) => {
              const sourceTone = m.source === "zoom" ? "blue" : m.source === "meet" ? "green" : m.source === "teams" ? "purple" : "";
              return (
                <Link
                  key={m.id}
                  href={`/meetings/${m.id}`}
                  className="block border border-zinc-200 rounded-lg p-5 hover:border-zinc-400 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h2 className="text-base font-medium truncate">{m.title}</h2>
                        <Badge tone={sourceTone}>{m.source}</Badge>
                        {m.status === "failed" && <Badge tone="red">failed</Badge>}
                      </div>
                      <p className="text-xs text-zinc-500 mb-3">{fmtDate(m.created_at)} · {fmtDuration(m.duration_sec)}</p>
                      {m.status === "failed" ? (
                        <p className="text-sm text-red-600 line-clamp-2">{m.failed_reason || "Capture failed."}</p>
                      ) : m.summary ? (
                        <p className="text-sm text-zinc-700 line-clamp-3">{m.summary}</p>
                      ) : (
                        <p className="text-sm text-zinc-400">No summary yet.</p>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </Shell>
  );
}
