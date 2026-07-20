// THE PRIVACY WALL (asymmetric, one-way). The 727 serves two principals, but
// they are NOT symmetric:
//   - Taona is the OWNER (auth role "builder", WhatsApp rank "owner"). His line
//     is private: nothing he types, says, or is told on the 727 reaches Nur
//     unless Taona explicitly tells Sasa to tell her (message_person).
//   - Nur is the FOUNDER. Everything she does is visible to Taona on request.
// This is the single source of truth for WHO the owner is and WHICH data is
// owner-private, so every leak surface (inbox, search_history, the brain) reads
// the same answer. Extend-beside law: one helper, every consumer uses it.
import { phoneKey } from "./whatsapp";

// The memory kind that holds Taona's owner-private notes. Never in
// ORG_GROUNDING_KINDS, so it is excluded from every non-owner recall by default
// (see lib/memory.ts recall()).
export const OWNER_PRIVATE_KIND = "owner_private";

// The owner's WhatsApp keys, from env (same source operatorOf + notify read).
// Empty if OWNER_WHATSAPP is unset.
export function ownerKeys(): string[] {
  return (process.env.OWNER_WHATSAPP || "").split(",").map((x) => phoneKey(x)).filter(Boolean);
}

// Resolve the contact id(s) of the owner's WhatsApp line. Threads and messages on
// these contacts are private to the owner: a non-owner viewer (Nur, or any
// console reader who is not the owner) must never see them. Returns [] when the
// owner cannot be identified, so callers fail toward NOT over-filtering shared
// data (the inbox/search still work); the rank gate is what actually opens the
// owner's own view.
export async function ownerContactIds(db: any): Promise<string[]> {
  const keys = ownerKeys();
  if (!keys.length) return [];
  const { data } = await db.from("contacts").select("id,phone").eq("channel", "whatsapp");
  return ((data || []) as any[]).filter((c) => keys.includes(phoneKey(c.phone))).map((c) => c.id as string);
}

// The FOUNDER's (Nur's) phone keys. Hardcoded rather than read from env because
// OWNER_WHATSAPP is Taona's line, not hers, and there is no NUR_WHATSAPP var.
// Lifted here from app/admin/transcripts on 2026-07-20 when a second consumer
// (the owner mirror at app/mirror) needed the same answer: this module already
// declares itself the single source of truth for WHO each principal is, and the
// lib law is explicit that two consumers computing the same thing means the
// helper belongs here (the counts.ts precedent).
const FOUNDER_PHONE_KEYS = ["971501622716", "106274704363640"].map((x) => phoneKey(x));

// Resolve every contact row that represents the founder (Nur), by phone or by a
// name starting with "nur". Two surfaces need this and they need it to agree:
//   - /admin/transcripts EXCLUDES these ids (audit of what Sasa sent to others)
//   - /mirror INCLUDES only these ids (the owner's view of the Sasa/Nur thread)
// If the two ever disagree, a thread silently belongs to neither view. Cheap
// query: contacts is small and only ids are needed.
export async function founderContactIds(db: any): Promise<string[]> {
  const { data } = await db.from("contacts").select("id,name,phone").limit(2000);
  return ((data || []) as Array<{ id: string; name: string | null; phone: string | null }>)
    .filter((c) => (c.name || "").toLowerCase().startsWith("nur") || FOUNDER_PHONE_KEYS.includes(phoneKey(c.phone || "")))
    .map((c) => c.id);
}
