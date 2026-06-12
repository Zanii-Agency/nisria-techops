// Digital Nur meeting-bot driver for Nisria. Mirrors the Jensen-PA pattern
// (see jensen-pa/lib/digital-u.ts), wired into Nisria's own task schema,
// chokepoint, and persona. The meeting-bot is the engine; Nisria is one
// of multiple drivers. KT #230.
//
// Called by:
//   1. WhatsApp worker: Nur pastes a Zoom/Meet/Teams link → instant dispatch.
//   2. (Future) Calendar sync: scan upcoming events with meeting URLs.
//
// The meeting-bot POSTs notes back to /api/digital-u/ingest where the
// transcript becomes tasks (priority-mapped) + a WhatsApp summary in Sasa's
// voice via sendTextAndLog.

const MEET_RE = /(https?:\/\/(?:meet\.google\.com|[^\s]*\.zoom\.us|[^\s]*zoom\.us|teams\.(?:microsoft|live)\.com)\/[\w\-/?&=#.@]+)/i;

export function extractMeetingLink(text: string): string | null {
  const m = String(text || "").match(MEET_RE);
  if (!m) return null;
  return m[1].replace(/[).,;'"!?\]]+$/, "");
}

const CANCEL_RE = /^(?:(?:digital\s+nur\b)|(?:hey\s+(?:digital\s+nur|bot|sasa))\b)?\s*[,.:]?\s*(stop(?:\s+it)?|leave(?:\s+(?:the\s+)?(?:meeting|call|room))?|cancel|abort|get\s+out|kill\s+(?:it|the\s+bot)|quit|exit)\s*[.!]?\s*$/i;

export function isCancelIntent(text: string): boolean {
  const t = String(text || "").trim();
  if (!t || t.length > 80) return false;
  return CANCEL_RE.test(t);
}

function siteUrl(): string {
  const explicit = process.env.NISRIA_PUBLIC_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const v = process.env.VERCEL_URL;
  if (v) return `https://${v.replace(/\/$/, "")}`;
  return "https://command.nisria.co";
}

export async function dispatchMeetingBot(opts: {
  link: string;
  title?: string;
  scheduledAt?: string;
  displayName?: string;
}): Promise<{ ok: boolean; mode?: string; eventId?: string; botId?: string; error?: string }> {
  const base = (process.env.MEETING_BOT_URL || "").replace(/\/$/, "");
  const key = process.env.MEETING_BOT_API_KEY;
  if (!base || !key) return { ok: false, error: "MEETING_BOT_URL or MEETING_BOT_API_KEY not configured" };
  const ingestKey = process.env.INGEST_KEY;
  const callbackUrl = `${siteUrl()}/api/digital-u/ingest`;
  try {
    const r = await fetch(`${base}/api/dispatch`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key },
      body: JSON.stringify({
        link: opts.link,
        title: opts.title || "",
        scheduledAt: opts.scheduledAt || undefined,
        callbackUrl,
        callbackKey: ingestKey || undefined,
        displayName: opts.displayName || "Digital Nur",
      }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: body?.error || `${r.status} ${r.statusText}` };
    return { ok: true, mode: body?.mode, eventId: body?.eventId, botId: body?.botId };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export async function cancelActiveBot(): Promise<{ ok: boolean; title?: string; botId?: string; error?: string }> {
  const base = (process.env.MEETING_BOT_URL || "").replace(/\/$/, "");
  const key = process.env.MEETING_BOT_API_KEY;
  if (!base || !key) return { ok: false, error: "MEETING_BOT_URL or MEETING_BOT_API_KEY not configured" };
  try {
    const r = await fetch(`${base}/api/dispatch/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key },
      body: JSON.stringify({}),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: body?.error || `${r.status} ${r.statusText}` };
    return { ok: true, title: body?.title, botId: body?.botId };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}
