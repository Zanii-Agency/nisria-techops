import { admin } from "../../lib/supabase-admin";
import WorkspaceHome from "../../components/WorkspaceHome";

export const dynamic = "force-dynamic";

// The Workspace: the third space (Command Center -> Launchpad -> Workspace). It
// holds your active working set (open tabs) and the LIVE OPS stream — the comms
// nerve centre where WhatsApp, email and replies surface as they arrive. Built now
// off the messages/events tables; it fills out further the moment the WhatsApp
// token lands (inbound messages already write to `messages`).
export default async function WorkspacePage() {
  const db = admin();
  const [{ data: messages }, { data: events }, { data: approvals }] = await Promise.all([
    db.from("messages").select("id,subject,body,channel,direction,created_at,status,contact:contacts(name)").order("created_at", { ascending: false }).limit(14),
    db.from("events").select("type,actor,subject_type,payload,created_at").order("created_at", { ascending: false }).limit(10),
    db.from("approvals").select("id,status").eq("status", "pending"),
  ]);
  return (
    <WorkspaceHome
      messages={messages || []}
      events={events || []}
      pendingApprovals={(approvals || []).length}
    />
  );
}
