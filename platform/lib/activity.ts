// ONE activity-label primitive (R3-3 / P5). The events table is the single feed
// behind every "what is happening" surface: Mission Control's Recent activity,
// the Agents activity stream, and the live panel under the top-nav ActivityChip.
// Each of those used to carry its own copy of this label map; they now share
// this one so a new event type is described once and reads the same everywhere.

export type ActivityEvent = {
  type: string;
  source?: string | null;
  actor?: string | null;
  payload?: Record<string, any> | null;
  created_at: string;
};

// A human, no-dashes one-liner for an event. Falls back to the dotted type with
// dots turned to spaces, so an unmapped type still reads as words, never a code.
export function activityLabel(e: ActivityEvent): string {
  const p = e.payload || {};
  const via = p.via === "smart" ? " from Smart Mode" : "";
  const map: Record<string, string> = {
    "agent.decided": `Sasa drafted a ${p.kind === "donor_thankyou" ? "thank-you" : "reply"}${p.from ? ` to ${p.from}` : ""}${via}`,
    "approval.created": `${p.title || "An item"} queued for you`,
    "approval.approved": "You approved an action",
    "approval.rejected": "You declined a draft",
    "action.executed": `Sent${p.to ? ` to ${p.to}` : ""}`,
    "action.failed": "An action failed",
    "task.assigned": `Task created${p.assignee ? `, assigned to ${p.assignee}` : ""}${via}`,
    "team.member_added": `Added ${p.name || "a team member"} to the team${via}`,
    "team.task_assigned": `Task assigned${p.assignee ? ` to ${p.assignee}` : ""}`,
    "inventory.item_added": `Added ${p.name || "an item"} to inventory${via}`,
    "beneficiary.intake": `Logged a beneficiary intake${via}`,
    "grant.added": `Pursuing a grant${p.funder ? ` from ${p.funder}` : ""}`,
    "grant.prepare_queued": `Started preparing ${p.queued != null ? `${p.queued} ` : ""}grant${p.queued === 1 ? "" : "s"}${via}`,
    "grant.prepared": `Prepared a grant${p.funder ? ` for ${p.funder}` : ""}, ready for review`,
    "grant.declined": "Set a grant aside",
    "grant.status_changed": `Moved a grant to ${p.status || "a new stage"}`,
    "asset.ingested": `Filed "${p.title || "an asset"}" to the Library`,
    "payment.verified": "Payment logged",
    "autonomy.changed": `Autonomy dial changed: ${p.scope || ""} to ${p.lane || ""}`,
  };
  return map[e.type] || e.type.replace(/[._]/g, " ");
}

// Coarse category for the dot/icon tint on a live row.
export function activityTone(type: string): "teal" | "gold" | "green" | "red" | "gray" {
  if (type.startsWith("action.failed") || type === "approval.rejected") return "red";
  if (type === "approval.created" || type === "agent.decided") return "gold";
  if (type === "action.executed" || type === "approval.approved" || type === "grant.prepared") return "green";
  if (type.startsWith("grant.") || type.startsWith("task.") || type.startsWith("team.") || type.startsWith("inventory.") || type.startsWith("beneficiary.")) return "teal";
  return "gray";
}
