// LID-phantom identity wall (2026-06-23, KT #380). From the 727 cartography (identity cell
// TAG 7): a WhatsApp LID ("53631290212404") for Cynthia Mwangi spawned a SECOND contact
// because phone-matching can't link a LID to her real MSISDN (+254111741123); the phantom
// then blocked reading her thread. Fix = resolveContact, before creating, asks lid-identity:
// attach ONLY when exactly ONE same-name contact holds a real org number; otherwise flag,
// never silent-mis-route. Pure decision (lib/lid-identity.mjs) imported by code AND wall.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isOrgMsisdn, normName, resolveLid } from "../../lib/lid-identity.mjs";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const WA = fs.readFileSync(path.resolve(HERE, "..", "..", "lib", "whatsapp.ts"), "utf8");
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);
const CCS = ["254", "971"];

// ---- L1: a real org MSISDN is NOT treated as a LID; the bogus LID IS ----
{
  if (!isOrgMsisdn("254111741123", CCS)) fail("L1a a real +254 number must read as an org MSISDN (no LID path)");
  else ok("L1a real org MSISDN → not LID");
  if (isOrgMsisdn("53631290212404", CCS)) fail("L1b the 14-digit LID must NOT read as an org MSISDN");
  else ok("L1b LID (53631290212404) → not an org MSISDN (enters the LID path)");
  if (!isOrgMsisdn("971501168462", CCS)) fail("L1c a +971 owner number must read as org MSISDN");
  else ok("L1c +971 → org MSISDN");
}

// ---- L2: the LIVE case — LID for "Cynthia Mwangi" with ONE same-name MSISDN → ATTACH ----
{
  const cands = [{ id: "real", name: "Cynthia Mwangi", phone: "+254111741123" }];
  const d = resolveLid(cands, "cynthia mwangi", CCS);
  if (d.action !== "attach" || d.id !== "real") fail("L2 a LID matching ONE same-name org-MSISDN contact must ATTACH to it");
  else ok("L2 LID → exactly one same-name MSISDN → attach (Cynthia unblocked, no phantom)");
}

// ---- L3 (INVERSE-SAFETY): TWO real same-name people → FLAG, never silent-attach ----
{
  const cands = [{ id: "a", name: "Cynthia Mwangi", phone: "+254111741123" },
                 { id: "b", name: "Cynthia Mwangi", phone: "+254700999000" }];
  const d = resolveLid(cands, "cynthia mwangi", CCS);
  if (d.action !== "flag") fail("L3 two same-name org-MSISDN contacts must FLAG (ambiguous), NOT auto-attach (no mis-route)");
  else ok("L3 two same-name people → flag, never silent mis-route (identity-before-collapse, KT #375)");
}

// ---- L4 (INVERSE-SAFETY): name matches but the other contact has NO org number → CREATE ----
{
  // a same-name contact that only has a foreign/LID-ish phone is not a confident anchor
  const cands = [{ id: "x", name: "Cynthia Mwangi", phone: "99887766554433" }];
  if (resolveLid(cands, "cynthia mwangi", CCS).action !== "create")
    fail("L4 a same-name contact WITHOUT a real org number is not a safe anchor → create fresh");
  else ok("L4 same-name but no org MSISDN → create (no false attach)");
  // different name → create
  if (resolveLid([{ id: "y", name: "Eliza Kariuki", phone: "+254111741123" }], "cynthia mwangi", CCS).action !== "create")
    fail("L4b a different-name contact must never be an attach target");
  else ok("L4b different name → create");
}

// ---- L5: normName is case/space-insensitive ----
{
  if (normName("  Cynthia   MWANGI ") !== "cynthia mwangi") fail("L5 normName must lowercase + collapse whitespace");
  else ok("L5 normName normalizes case + whitespace");
}

// ---- L6: resolveContact is wired to the shared decision + emits, before the bare insert ----
{
  if (!/import \{ isOrgMsisdn, normName, resolveLid \} from "\.\/lid-identity\.mjs";/.test(WA))
    fail("L6a whatsapp.ts must import the shared lid-identity decision");
  else ok("L6a whatsapp.ts imports lid-identity");
  const i = WA.indexOf("LID-PHANTOM PREVENTION");
  const region = i >= 0 ? WA.slice(i, i + 1400) : "";
  if (!/resolveLid\(\(byName \|\| \[\]\) as any\[\], nmKey, ccs\)/.test(region)) fail("L6b must call resolveLid before creating a contact");
  else ok("L6b resolveContact calls resolveLid before the create");
  if (!/decision\.action === "attach"/.test(region) || !/contact\.lid_attached/.test(region)) fail("L6c attach branch must return the existing id + emit lid_attached");
  else ok("L6c attach → returns existing contact + audit event");
  if (!/contact\.duplicate_suspected/.test(region)) fail("L6d the flag branch must emit duplicate_suspected (surfaces for merge, no silent phantom)");
  else ok("L6d ambiguous → fresh contact + duplicate_suspected (no silent mis-route)");
  // the decision must sit BEFORE the bare insert (so a confident attach short-circuits it)
  const decIdx = WA.indexOf("resolveLid((byName");
  const insIdx = WA.indexOf('.insert({ name: name || stored, phone: stored, channel: "whatsapp" })');
  if (!(decIdx > 0 && insIdx > decIdx)) fail("L6e the LID decision must run BEFORE the contact insert");
  else ok("L6e LID decision precedes the insert");
}

if (process.exitCode) console.error("\nWALL RED.");
else console.log("\nWALL GREEN.");
