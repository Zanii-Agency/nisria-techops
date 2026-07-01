// Daily full-inbox MEMORY sweep for Sasa. Lists the recent inbox across every
// mailbox and remembers every email (full body) to the brain, so awareness
// never depends on Nur opening a mail or the on-demand read tools firing. SILENT
// (no WhatsApp). Idempotent: rememberEmail dedups by gmail message id. Each
// capture is AWAITED (unlike readEmail's fire-and-forget) so the cron never
// returns before the writes land.
import { searchAllInboxes, readEmail } from "./gmail";
import { rememberEmail } from "./memory";

// maxPerBox default 60: sasa@nisria.co alone runs ~47 mails/week (bank advices),
// so the old 25 cap silently dropped ~half the inbox from the brain. 60 gives
// headroom over the weekly volume; tune via MAIL_SWEEP_MAX_PER_BOX without a deploy.
export async function sweepAndRememberAll(maxPerBox = 60): Promise<{ ok: boolean; scanned: number; remembered: number; errors?: string[] }> {
  let hits;
  try {
    // 7-day window: the cron runs daily, so 7d gives ample overlap to never miss
    // a mail between runs. Re-reads dedup, so the overlap costs nothing in memory.
    hits = await searchAllInboxes("newer_than:7d", maxPerBox);
  } catch (e: any) {
    return { ok: false, scanned: 0, remembered: 0, errors: [`list: ${e?.message || String(e)}`] };
  }
  const errors: string[] = [];
  let remembered = 0;
  for (const h of hits) {
    try {
      const full = await readEmail(h.id, h.mailbox);
      await rememberEmail({ id: h.id, from: full?.from ?? h.from, subject: full?.subject ?? h.subject, date: full?.date ?? h.date, body: full?.body ?? h.snippet });
      remembered++;
    } catch (e: any) {
      errors.push(`remember ${h.id}: ${e?.message || String(e)}`);
    }
  }
  return { ok: errors.length === 0, scanned: hits.length, remembered, errors: errors.length ? errors : undefined };
}
