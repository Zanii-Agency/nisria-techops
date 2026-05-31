import { cache } from "react";
import { admin } from "./supabase-admin";
import { getCurrentUser } from "./auth";

// The bridge between the login identity (cookie roster in auth.ts) and the work
// directory (team_members table). A login user IS a team_member who happens to
// have a password. This resolver maps the signed-in person to their profile row,
// so tasks, attribution, and the profile surface all read one source of truth for
// "who is who." Server-only (uses the admin client). Cached per request.

export type TeamProfile = {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  member_type: string | null;
  responsibilities: string | null;
};

// First + last initial, uppercased. Single-word names take their first two
// letters. Mirrors the cookie roster's initials so the avatar never goes blank.
export function initialsOf(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const getCurrentTeamMember = cache(async (): Promise<TeamProfile | null> => {
  const user = getCurrentUser();
  if (!user?.teamEmail) return null;
  const { data } = await admin()
    .from("team_members")
    .select("id,name,role,email,member_type,responsibilities")
    .ilike("email", user.teamEmail)
    .limit(1);
  return (data && data[0]) || null;
});
