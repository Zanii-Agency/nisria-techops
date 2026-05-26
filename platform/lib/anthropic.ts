// Server-only Claude client for the portal's AI features (assistant, task
// dispatch, inbox auto-reply, newsletter/content drafting).
const KEY = () => process.env.ANTHROPIC_API_KEY || "";
const MODEL = "claude-sonnet-4-5";

// BRAND VOICE: the founder bans em-dashes and en-dashes in all user-facing AI
// copy. Belt-and-suspenders (FEEDBACK #6):
//  1) NO_DASHES is appended to every drafting system prompt so the model avoids
//     them in the first place, and
//  2) stripDashes() post-processes any output so a dash can never slip through.
export const NO_DASHES =
  "Never use em-dashes (—) or en-dashes (–). Use a comma, period, or colon instead. This is a hard brand rule.";

// Replace —/– (and the rarer figure/horizontal-bar variants) with clean
// punctuation, preserving meaning: " — " between clauses becomes ", ",
// a trailing/leading dash becomes a comma, and a hyphenated range (10–20)
// becomes "10 to 20".
export function stripDashes(s: string): string {
  if (!s) return s;
  return s
    // number ranges: 10–20 / 10—20  ->  10 to 20
    .replace(/(\d)\s*[—–]\s*(\d)/g, "$1 to $2")
    // spaced clause dash: "a — b"  ->  "a, b"
    .replace(/\s*[—–]\s*/g, ", ")
    // any stragglers
    .replace(/[—–]/g, ",")
    // tidy any doubled punctuation the swap may have created
    .replace(/,\s*,/g, ",")
    .replace(/([.,;:!?])\s*,/g, "$1");
}

type Msg = { role: "user" | "assistant"; content: string };

export async function askClaude(opts: {
  system: string;
  messages: Msg[];
  maxTokens?: number;
}): Promise<string> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": KEY(),
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      messages: opts.messages,
    }),
    cache: "no-store",
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || "Claude request failed");
  return j?.content?.[0]?.text ?? "";
}

// Convenience for a single-shot prompt.
export const claude = (system: string, user: string, maxTokens = 1024) =>
  askClaude({ system, messages: [{ role: "user", content: user }], maxTokens });

// Vision: caption an image for the asset library (also flags possible beneficiary photos).
export async function captionImage(base64: string, mediaType: string): Promise<string> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY(), "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 220,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
        { type: "text", text: "In 1-2 sentences, describe this image for a nonprofit's asset library: what it shows, the mood, and any visible text or logos. If it appears to show identifiable children or beneficiaries, start with 'BENEFICIARY:'." },
      ] }],
    }),
    cache: "no-store",
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || "vision failed");
  return j?.content?.[0]?.text ?? "";
}

// Ask Claude for JSON; strips code fences and parses. Returns null on failure.
export async function claudeJSON<T = any>(system: string, user: string, maxTokens = 1500): Promise<T | null> {
  const raw = await claude(system + "\n\nRespond with ONLY valid JSON, no prose, no code fences.", user, maxTokens);
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}
