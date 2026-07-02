// Mirror routing wall (2026-07-01, Taona: "Nur can see the mirror of all the team
// members too, the way I can see hers and all the team"). The asymmetric wall:
//   - Taona (OWNER_WHATSAPP[0]) sees EVERY Sasa thread except his own.
//   - Nur (NUR_WHATSAPP) sees every TEAM thread — everyone except Taona's line and her own.
// Mirrors fire at three seams: inbound (webhook), free-form outbound (send), template
// outbound (sendTemplateAndLog). A mirror payload must never be re-mirrored (loop guard).
// This wall mirrors the mirrorRecipients() logic byte-for-byte and asserts the three
// seams call the shared helpers (anti-drift; .mjs can't import the .ts primitive).
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);

const OWNER = "48462"; // Taona (last-5 stand-ins; only equality matters here)
const NUR = "22716";
const TEAM = "19486"; // e.g. Mark
// mirror of lib/whatsapp.ts mirrorRecipients (keep in step)
const phoneKey = (s) => String(s || "").replace(/[^\d]/g, "");
const mirrorRecipients = (otherKey) => {
  const o = phoneKey(otherKey);
  const out = [];
  if (OWNER && o && o !== OWNER) out.push(OWNER);
  if (NUR && o && o !== NUR && o !== OWNER) out.push(NUR);
  return [...new Set(out)];
};
const isMirrorPayload = (b) => /^\s*\[Sasa (?:mirror|→|template →)/.test(String(b || ""));

// ---- M1: a TEAM thread mirrors to BOTH Taona and Nur ----
{
  const r = mirrorRecipients(TEAM);
  if (!(r.includes(OWNER) && r.includes(NUR) && r.length === 2)) fail(`M1 team thread must mirror to [Taona, Nur], got ${JSON.stringify(r)}`);
  else ok("M1 team-member thread mirrors to both Taona and Nur");
}

// ---- M2: Taona's own thread mirrors to NOBODY (Nur never sees Taona) ----
{
  const r = mirrorRecipients(OWNER);
  if (r.length !== 0) fail(`M2 Taona's own thread must mirror to nobody, got ${JSON.stringify(r)}`);
  else ok("M2 Taona's thread mirrors to nobody (Nur never sees his line)");
}

// ---- M3: Nur's own thread mirrors to Taona only (not back to Nur) ----
{
  const r = mirrorRecipients(NUR);
  if (!(r.length === 1 && r[0] === OWNER)) fail(`M3 Nur's thread must mirror to Taona only, got ${JSON.stringify(r)}`);
  else ok("M3 Nur's thread mirrors to Taona only");
}

// ---- M4: the loop guard recognises every mirror marker ----
{
  for (const b of ["[Sasa mirror] Mark: hi", "[Sasa → Cynthia] on it", "[Sasa template → Grace] Good morning"])
    if (!isMirrorPayload(b)) fail(`M4 must treat "${b}" as a mirror payload (no re-mirror)`);
  if (isMirrorPayload("Send it to Mark")) fail("M4 a normal message must NOT be a mirror payload");
  ok("M4 mirror markers detected; normal messages are not");
}

// ---- M5: all three seams use the shared helpers (anti-drift) ----
{
  const WA = readFileSync(resolve(HERE, "../../lib/whatsapp.ts"), "utf8");
  const WH = readFileSync(resolve(HERE, "../../app/api/whatsapp/webhook/route.ts"), "utf8");
  if (!/export function mirrorRecipients/.test(WA)) fail("M5a mirrorRecipients must be defined+exported in whatsapp.ts");
  else ok("M5a mirrorRecipients defined + exported");
  if (!/const _isMir = isMirrorPayload\(String\(_body \|\| ""\)\) \|\| isMirrorPayload\(_cap\)/.test(WA) || !/!_isMir/.test(WA)) fail("M5b send() mirror must guard on !isMirrorPayload for BOTH text body and media caption (loop-safe)");
  else ok("M5b send() mirror is loop-guarded (text + media caption)");
  // M5f/M5g: MEDIA (document/image) sends are mirrored too, not just text
  if (!/_mediaType = _doc \? "document"/.test(WA) || !/sent a \$\{_mediaType\}/.test(WA)) fail("M5f a document/image send must be mirrored to watchers (was text-only)");
  else ok("M5f media sends (PDF/photo) are mirrored to watchers");
  if (!/await sendDocument\(dest, String\(_doc\.link\)/.test(WA)) fail("M5g the actual file should be forwarded to watchers (marker caption stops re-mirror)");
  else ok("M5g the real file is forwarded to watchers (recursion-guarded)");
  if (!/for \(const dest of mirrorRecipients\(_rec\)\)/.test(WA)) fail("M5c send() must fan out via mirrorRecipients");
  else ok("M5c free-form outbound fans out to mirror recipients");
  if (!/for \(const dest of mirrorRecipients\(_to\)\)/.test(WA)) fail("M5d sendTemplateAndLog must fan out via mirrorRecipients");
  else ok("M5d template outbound fans out to mirror recipients");
  if (!/for \(const dest of mirrorRecipients\(senderKey\)\)/.test(WH)) fail("M5e webhook inbound must fan out via mirrorRecipients");
  else ok("M5e inbound fans out to mirror recipients");
}

if (process.exitCode) console.error("\nsasa-mirror-routing-wall: FAIL");
else console.log("\nsasa-mirror-routing-wall: ALL GREEN");
