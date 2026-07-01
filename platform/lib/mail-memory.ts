// Inbox MEMORY + URGENT-ALERT sweep for Sasa. Lists the recent inbox across every
// mailbox, remembers every NEW email (full body) to the brain so awareness never
// depends on Nur opening a mail, TRIAGES each new email for urgency, and pings Nur
// on the genuinely urgent ones (a payment due, a deadline, a donor decision, an
// RSVP). Idempotent: already-remembered emails are skipped (bounds cost so the
// cron can run often), and rememberEmail dedups by gmail id. The alert pass dedups
// per email via events and respects quiet hours, so an overnight urgent mail is
// held and fired on the morning run, and no email ever pings twice.
import { searchAllInboxes, readEmail } from "./gmail";
import { rememberEmail } from "./memory";
import { admin } from "./supabase-admin";
import { pushEmailAlert } from "./notify";
import { anthropicTool } from "./agents/router";

// Triage ONE email: does it need Nur's attention soon? Biased HARD against false
// pings — the inbox is mostly automated bank notices, newsletters, and receipts,
// and a false alarm erodes trust. Structured output (forced tool-use), fail-safe:
// a classifier failure returns not-urgent, so we never ping on an error.
async function classifyEmailUrgency(from: string | null, subject: string | null, body: string | null): Promise<{ urgent: boolean; category: string; reason: string }> {
  const system = `You triage a nonprofit's incoming email for its founder, Nur. Decide if THIS email needs Nur's personal attention SOON.

FLAG (urgent=true) ONLY when it needs Nur to act, decide, or reply within days:
- a payment/invoice/bill due, or a funding/grant decision or deadline
- a legal, tax, government, or compliance notice with a deadline
- a donor or partner asking a question or awaiting a decision/RSVP
- a meeting/event invite that needs a response
- anything explicitly time-sensitive or asking for a reply

DO NOT FLAG (urgent=false) — these are the majority:
- automated bank transaction notifications, statements, receipts
- newsletters, marketing, promotions, digests, social notifications
- delivery / no-reply / system notifications, calendar auto-updates
- FYI, thank-you, or confirmations that need no action

Bias HARD toward urgent=false. When in doubt, it is NOT urgent. A false alarm erodes trust.`;
  const user = `From: ${from || ""}\nSubject: ${subject || ""}\n\nBody:\n${String(body || "").slice(0, 2500)}`;
  const { input } = await anthropicTool<{ urgent: boolean; category: string; reason: string }>(
    system,
    user,
    {
      name: "triage_email",
      description: "Decide if this email needs Nur's attention soon.",
      input_schema: {
        type: "object",
        properties: {
          urgent: { type: "boolean" },
          category: { type: "string", description: "one word, e.g. payment, deadline, donor, invite, legal, fyi, automated" },
          reason: { type: "string", description: "<=15 words on why she needs it; empty if not urgent" },
        },
        required: ["urgent", "category", "reason"],
      },
    },
    { maxTokens: 120, timeoutMs: 3500 },
  );
  if (!input) return { urgent: false, category: "unknown", reason: "" }; // fail-safe: never ping on classifier failure
  return { urgent: input.urgent === true, category: String(input.category || "").slice(0, 40), reason: String(input.reason || "").slice(0, 200) };
}

export async function sweepAndRememberAll(maxPerBox = 60): Promise<{ ok: boolean; scanned: number; remembered: number; flagged: number; errors?: string[] }> {
  const db = admin();
  let hits;
  try {
    // 7-day window with ample overlap so no mail is missed between runs; re-reads
    // are skipped below (already in the brain), so the overlap is nearly free.
    hits = await searchAllInboxes("newer_than:7d", maxPerBox, { perBox: maxPerBox });
  } catch (e: any) {
    return { ok: false, scanned: 0, remembered: 0, flagged: 0, errors: [`list: ${e?.message || String(e)}`] };
  }

  // Which of these are already in the brain? One batched query, so a frequent
  // cron only pays the expensive read+embed+triage on genuinely NEW mail.
  let seen = new Set<string>();
  try {
    const slugs = hits.map((h) => `email:${h.id}`);
    if (slugs.length) {
      const { data } = await db.from("agent_memory").select("slug").in("slug", slugs);
      seen = new Set(((data || []) as any[]).map((r) => r.slug));
    }
  } catch { /* if the pre-check fails, fall through and re-remember (deduped anyway) */ }

  const errors: string[] = [];
  let remembered = 0;
  for (const h of hits) {
    if (seen.has(`email:${h.id}`)) continue; // already known; skip the costly read
    try {
      const full = await readEmail(h.id, h.mailbox);
      const from = full?.from ?? h.from;
      const subject = full?.subject ?? h.subject;
      const body = full?.body ?? h.snippet;
      const u = await classifyEmailUrgency(from, subject, body);
      await rememberEmail({ id: h.id, from, subject, date: full?.date ?? h.date, body, urgent: u.urgent, category: u.category, reason: u.reason });
      remembered++;
    } catch (e: any) {
      errors.push(`remember ${h.id}: ${e?.message || String(e)}`);
    }
  }

  // ALERT PASS: ping Nur on urgent mail. Covers both the mail triaged this run and
  // any urgent mail whose ping was deferred by quiet hours on an earlier run.
  // pushEmailAlert dedups per gmail id, so an email pings at most once.
  let flagged = 0;
  try {
    const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data: urgentRows } = await db
      .from("agent_memory")
      .select("slug,title,metadata,created_at")
      .eq("source_type", "email")
      .filter("metadata->>urgent", "eq", "true")
      .gte("created_at", since)
      .limit(50);
    for (const row of (urgentRows || []) as any[]) {
      const gid = String(row.slug || "").replace(/^email:/, "");
      if (!gid) continue;
      const r = await pushEmailAlert(db, {
        gmailId: gid,
        from: row.metadata?.from ?? null,
        subject: String(row.title || "").replace(/^Email:\s*/, ""),
        gist: row.metadata?.reason ?? null,
      });
      if (r.pinged) flagged++;
    }
  } catch (e: any) {
    errors.push(`alert: ${e?.message || String(e)}`);
  }

  return { ok: errors.length === 0, scanned: hits.length, remembered, flagged, errors: errors.length ? errors : undefined };
}
