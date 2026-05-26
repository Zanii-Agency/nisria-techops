"use server";
import { admin } from "../../lib/supabase-admin";
import { emit } from "../../lib/events";
import { rememberUpsert } from "../../lib/memory";
import { BRAIN_SECTIONS, type SectionKey } from "../../lib/brain";
import { revalidatePath } from "next/cache";

export async function addAccount(fd: FormData) {
  const address = String(fd.get("address") || "").trim().toLowerCase();
  const label = String(fd.get("label") || "") || null;
  const brand = String(fd.get("brand") || "nisria");
  const channel = String(fd.get("channel") || "email");
  if (!address) return;
  await admin().from("email_accounts").upsert({ address, label, brand, channel, active: true }, { onConflict: "address" });
  await emit({ type: "account.added", source: "settings", actor: "Nur", payload: { address, channel } });
  revalidatePath("/settings");
  revalidatePath("/inbox");
}

// Save ONE onboarding section of the Brain. Each section saves independently and
// is fully re-editable later (this overwrites in place, never piles up). Writes
// to org_profile (the editable source of truth) AND mirrors into agent_memory so
// the EXISTING recall() surfaces it to every agent. Empty content clears the
// section (and removes its grounding) so the completeness meter stays truthful.
export async function saveBrainSection(fd: FormData) {
  const section = String(fd.get("section") || "") as SectionKey;
  const spec = BRAIN_SECTIONS.find((s) => s.key === section);
  if (!spec) return;
  const content = String(fd.get("content") || "").trim();
  const db = admin();

  if (!content) {
    // cleared: drop the profile body + its memory grounding
    const { data: prof } = await db
      .from("org_profile")
      .select("memory_id")
      .eq("section", section)
      .maybeSingle();
    if (prof?.memory_id) await db.from("agent_memory").delete().eq("id", prof.memory_id);
    await db
      .from("org_profile")
      .upsert({ section, content: "", data: {}, memory_id: null, updated_by: "Nur", updated_at: new Date().toISOString() }, { onConflict: "section" });
    revalidatePath("/settings");
    return;
  }

  // mirror into the brain so agents can recall it (upsert by slug => no dup facts)
  const memId = await rememberUpsert({
    kind: spec.memKind,
    brand: section === "voice" ? "nisria" : null,
    title: spec.memTitle,
    content,
    source_type: "org_profile",
    slug: `org_profile:${section}`,
    metadata: { section },
  });

  await db
    .from("org_profile")
    .upsert(
      { section, content, data: {}, memory_id: memId, updated_by: "Nur", updated_at: new Date().toISOString() },
      { onConflict: "section" }
    );

  await emit({
    type: "brain.updated",
    source: "settings",
    actor: "Nur",
    subject_type: "org_profile",
    payload: { section, kind: spec.memKind },
  });
  revalidatePath("/settings");
}
