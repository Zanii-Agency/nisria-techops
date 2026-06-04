// SINGLE SOURCE OF TRUTH for "which team WhatsApp groups the bot is actually in"
// (the counts.ts pattern, applied to group membership). list_groups, the
// post_to_group validation, and Sasa's per-turn snapshot ALL read this, so the bot
// can never confabulate a group it is not in, claim it posted to a group it cannot
// reach, or miss a low-traffic group it IS in.
//
// Two sources, live preferred:
//   (a) LIVE membership the group bot publishes on connect (bot_status key
//       'group_membership', from groupFetchAllParticipating). AUTHORITATIVE and
//       complete: it lists every group the number is a participant in, including
//       silent ones, and EXCLUDES groups it has left. One cheap row. When present we
//       return it directly.
//   (b) Fallback (only before the bot has ever published): derive distinct group
//       names from message history. This MUST be a true DISTINCT across ALL rows,
//       not a windowed row scan, or a low-traffic group is missed, which is exactly
//       the bug that hid the 39-message Finances group behind Nisria Admin's 7k.
import { admin } from "./supabase-admin";

export async function knownGroups(): Promise<string[]> {
  const db = admin();
  // (a) authoritative live membership
  try {
    const { data: row } = await db.from("bot_status").select("value").eq("key", "group_membership").maybeSingle();
    const live = (((row?.value as any)?.groups) || []) as any[];
    const names = live.map((g) => String(typeof g === "string" ? g : g?.name || "").trim()).filter(Boolean);
    if (names.length) return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  } catch {}
  // (b) history fallback: TRUE distinct across every group message (paged), so a
  // long-tail group is never dropped by a row-window limit.
  try {
    const set = new Set<string>();
    const step = 1000;
    for (let from = 0; from < 50000; from += step) {
      const { data } = await db
        .from("messages")
        .select("account")
        .eq("sender_type", "group")
        .not("account", "is", null)
        .range(from, from + step - 1);
      const rows = (data || []) as any[];
      for (const m of rows) {
        const n = String(m.account || "").trim();
        if (n) set.add(n);
      }
      if (rows.length < step) break;
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

// Case-insensitive EXACT membership check. Deliberately not fuzzy: a fuzzy match is
// exactly what let the bot misroute a post to the wrong group and still report it
// delivered.
export function isKnownGroup(name: string, groups: string[]): boolean {
  const n = String(name || "").toLowerCase().trim();
  return groups.some((g) => g.toLowerCase().trim() === n);
}
