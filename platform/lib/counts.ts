// SINGLE SOURCE OF TRUTH for every count shown on a surface.
//
// The whole "Inbox says 0 but 2 need replies" / "Open tasks 0" class of bugs
// came from each component computing its own count with a slightly different
// filter (status="new" on the dashboard vs new|drafted on the inbox vs all
// pending on the bell). This module defines each count ONCE so the dashboard,
// inbox header and notification bell can never disagree.
//
// Definitions (canonical):
//   needsReply : inbound + sender_type individual + status in ('new','drafted')
//   openTasks  : tasks where status != 'done'   (real head:true count, not list.length)
//   needsYou   : approvals where status = 'pending'
//   donors     : all donor rows
//
// All counts use head:true exact counts — never list.length on a truncated query.
import { admin } from "./supabase-admin";

export type Counts = {
  needsReply: number;
  openTasks: number;
  needsYou: number;
  donors: number;
};

// The one true "needs a reply" filter. Anything that wants this number must
// route through here (or getCounts) so the definition stays in exactly one place.
export async function needsReplyCount(db: any = admin()): Promise<number> {
  const { count } = await db
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("direction", "in")
    .in("status", ["new", "drafted"])
    .eq("sender_type", "individual");
  return count || 0;
}

export async function openTasksCount(db: any = admin()): Promise<number> {
  const { count } = await db
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .neq("status", "done");
  return count || 0;
}

export async function needsYouCount(db: any = admin()): Promise<number> {
  const { count } = await db
    .from("approvals")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return count || 0;
}

export async function donorsCount(db: any = admin()): Promise<number> {
  const { count } = await db
    .from("donors")
    .select("id", { count: "exact", head: true });
  return count || 0;
}

// One call, one snapshot. Used by the dashboard so every KPI agrees with the
// inbox and the bell.
export async function getCounts(db: any = admin()): Promise<Counts> {
  const [needsReply, openTasks, needsYou, donors] = await Promise.all([
    needsReplyCount(db),
    openTasksCount(db),
    needsYouCount(db),
    donorsCount(db),
  ]);
  return { needsReply, openTasks, needsYou, donors };
}
