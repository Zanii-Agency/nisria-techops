import crypto from "node:crypto";
import { cookies } from "next/headers";

// Multi-user auth on top of the existing cookie gate. The middleware still
// proves "is logged in" via nisria_session === SESSION_TOKEN. This module adds
// WHO is logged in: a signed nisria_user cookie carries the user id, signed with
// USER_COOKIE_SECRET so it cannot be forged without logging in.
//
// Two users today (founder + builder). Identifiers are not secret; passwords are
// read from env so they never live in the repo. Falls back to "not configured"
// if the env is missing, matching the old login behaviour.

export type Role = "founder" | "builder";

export type User = {
  id: string;
  name: string;
  org: string;
  initials: string;
  role: Role;
  // identifiers a person may type at login (lower-cased, matched loosely)
  identifiers: string[];
};

// The roster. Passwords are NOT here; they come from env (see passwordFor).
const ROSTER: User[] = [
  {
    id: "nur",
    name: "Nur M'nasria",
    org: "By Nisria Inc",
    initials: "N",
    role: "founder",
    identifiers: ["nur", "sasa", "sasa@nisria.co"],
  },
  {
    id: "taona",
    name: "Taona",
    org: "By Nisria Inc",
    initials: "T",
    role: "builder",
    identifiers: ["taona", "tech@nisria.co"],
  },
];

function passwordFor(id: string): string | undefined {
  if (id === "nur") return process.env.NUR_PASSWORD;
  if (id === "taona") return process.env.TAONA_PASSWORD;
  return undefined;
}

export function userById(id: string): User | undefined {
  return ROSTER.find((u) => u.id === id);
}

// Constant-time string compare that tolerates differing lengths (timingSafeEqual
// throws on unequal-length buffers, so we hash both sides to a fixed width first).
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function verifyCredentials(identifier: string, password: string): User | null {
  const id = (identifier || "").trim().toLowerCase();
  if (!id || !password) return null;
  const user = ROSTER.find((u) => u.identifiers.includes(id));
  if (!user) return null;
  const expected = passwordFor(user.id);
  if (!expected) return null; // env not configured for this user
  return safeEqual(password, expected) ? user : null;
}

// ---- signed identity cookie -------------------------------------------------

function secret(): string | undefined {
  return process.env.USER_COOKIE_SECRET || process.env.SESSION_TOKEN;
}

function sign(id: string): string | null {
  const s = secret();
  if (!s) return null;
  const sig = crypto.createHmac("sha256", s).update(id).digest("base64url");
  return `${id}.${sig}`;
}

function verify(value: string | undefined): string | null {
  if (!value) return null;
  const s = secret();
  if (!s) return null;
  const dot = value.lastIndexOf(".");
  if (dot < 1) return null;
  const id = value.slice(0, dot);
  const expected = crypto.createHmac("sha256", s).update(id).digest("base64url");
  return safeEqual(value.slice(dot + 1), expected) ? id : null;
}

export const USER_COOKIE = "nisria_user";

export function identityCookieValue(id: string): string | null {
  return sign(id);
}

// Read the current user from the signed identity cookie (server components,
// server actions, route handlers). Returns null if absent/forged/unknown.
export function getCurrentUser(): User | null {
  const raw = cookies().get(USER_COOKIE)?.value;
  const id = verify(raw);
  if (!id) return null;
  return userById(id) || null;
}
