// Secret-redaction wall (2026-07-01). Nur can save a login by WhatsApp
// ("save my Mailchimp login, user X password Y"); save_vault_resource seals the
// password AES-256 into the vault (admin/owner only). But the raw inbound must NEVER
// sit in plaintext in the messages log NOR be mirrored to Taona. The webhook logs +
// mirrors a REDACTED copy while the worker gets the raw text via the job payload.
// This wall pins the masker + that the webhook uses it (and still passes raw to the worker).
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { redactSecrets, looksLikeSecret } from "../../lib/redact.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);

// ---- R1: passwords/pins/keys following a keyword are masked ----
{
  const out = redactSecrets("save my Mailchimp login, user nur@nisria.co password Hunter2!");
  if (/Hunter2!/.test(out)) fail("R1a password must be masked from the log/mirror copy");
  else if (!/user nur@nisria\.co/.test(out)) fail("R1b the username (non-secret) may stay for context");
  else ok("R1 password masked, username kept");
  for (const [t, secret] of [["pwd S3cr3t!!", "S3cr3t!!"], ["my pin is 4821", "4821"], ["the api key is sk-abc123", "sk-abc123"], ["token: ghp_xyz789", "ghp_xyz789"]])
    if (redactSecrets(t).includes(secret)) fail(`R1c "${t}" must be masked`);
  ok("R1c pin / api key / token values masked");
}

// ---- R2: normal messages + password QUESTIONS (no value) are untouched ----
{
  for (const t of ["lets meet at 3pm about the grant", "what is my Mailchimp password?", "the water tank costs 5000", "Cynthia prepare the report by Friday"]) {
    if (redactSecrets(t) !== t) fail(`R2 "${t}" must be left unchanged (no secret value present)`);
  }
  if (looksLikeSecret("what is my password?")) fail("R2b a password QUESTION with no value must not be flagged as a secret");
  ok("R2 normal messages + value-less password questions are untouched");
}

// ---- R3: the webhook redacts the LOG/MIRROR but passes RAW to the worker ----
{
  const WH = readFileSync(resolve(HERE, "../../app/api/whatsapp/webhook/route.ts"), "utf8");
  if (!/const body = redactSecrets\(rawBody\)/.test(WH)) fail("R3a webhook must log/mirror the REDACTED body");
  else ok("R3a webhook logs + mirrors the redacted body");
  // the job payload text must be the RAW caption (so the worker can extract + seal it)
  if (!/enqueueJob\("whatsapp\.reply", contactId, \{\s*from, name: contactName, text: reactionEmoji \|\| caption/.test(WH.replace(/\s+/g, " ")))
    fail("R3b the worker job payload must carry the RAW caption (not the redacted body) so save_vault_resource can seal the password");
  else ok("R3b worker still receives the raw text via the job payload");
  // credential tools must be admin/owner only (team can never save/read secrets)
  const SA = readFileSync(resolve(HERE, "../../lib/agents/sasa.ts"), "utf8");
  const teamSet = (SA.match(/TEAM_TOOL_NAMES = new Set\(\[([\s\S]*?)\]\)/) || [, ""])[1];
  if (/save_vault_resource|get_credential/.test(teamSet)) fail("R3c credential tools must NOT be in the team-tier allowlist");
  else ok("R3c credential tools are admin/owner only (not team-tier)");
}

if (process.exitCode) console.error("\nsasa-secret-redaction-wall: FAIL");
else console.log("\nsasa-secret-redaction-wall: ALL GREEN");
