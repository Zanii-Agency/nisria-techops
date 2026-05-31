// Ensure every login user (auth.ts roster) has a team_members profile row, so the
// login identity bridges cleanly to the work directory (lib/profile.ts). Nur is
// already in the 2026 directory seed; Taona (the external platform builder) is not.
// Idempotent: upserts by email, never duplicates. Prints both profile ids.
import fs from "node:fs";

const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => {
  const m = env.match(new RegExp(`^${k}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^"|"$/g, "") : "";
};
const URL_ = get("SUPABASE_URL");
const KEY = get("SUPABASE_SERVICE_KEY");
if (!URL_ || !KEY) { console.error("missing url/key in .env.local"); process.exit(1); }

const h = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function findByEmail(email) {
  const r = await fetch(`${URL_}/rest/v1/team_members?email=ilike.${encodeURIComponent(email)}&select=id,name,role`, { headers: h });
  const rows = await r.json();
  return Array.isArray(rows) ? rows[0] : null;
}

async function insert(row) {
  const r = await fetch(`${URL_}/rest/v1/team_members`, {
    method: "POST",
    headers: { ...h, Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  const out = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(out));
  return out[0];
}

// The login roster, mirrored from auth.ts. Each entry is the profile we want to exist.
const LOGINS = [
  { teamEmail: "nur@nisria.co", create: null }, // Nur already exists in the directory seed; never duplicate.
  {
    teamEmail: "tech@nisria.co",
    create: {
      name: "Taona",
      email: "tech@nisria.co",
      role: "Platform & Tech Lead (SEV7EN)",
      status: "active",
      member_type: "contractor",
      responsibilities: "Builds and runs the Nisria Command Center. Platform engineering, integrations, data, automation.",
      tags: ["2026 directory", "Platform"],
    },
  },
];

for (const l of LOGINS) {
  const existing = await findByEmail(l.teamEmail);
  if (existing) {
    console.log(`OK  ${l.teamEmail} -> ${existing.id} (${existing.name}, ${existing.role})`);
    continue;
  }
  if (!l.create) {
    console.log(`MISS ${l.teamEmail} -> not found and no create template (expected to exist via seed)`);
    continue;
  }
  const made = await insert(l.create);
  console.log(`NEW ${l.teamEmail} -> ${made.id} (${made.name}, ${made.role})`);
}
