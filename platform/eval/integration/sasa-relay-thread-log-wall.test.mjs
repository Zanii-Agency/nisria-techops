// Relay-thread-log wall (2026-07-02). THE class fix for the "Sasa has no memory of
// what it relayed" bug (Nakuru letter -> Mark -> Sasa asks "what was received?").
// Root: relays sent via raw sendText only emitted an event, never wrote the
// recipient's messages thread, and historyFor() reads that thread. Fix: every
// person-directed relay routes through sendTextAndLog (the logging chokepoint) with
// contactId:null so it resolves the RECIPIENT and logs to THEIR thread. Source
// anti-drift so a later edit can't silently revert a relay to raw sendText.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);
const ST = readFileSync(resolve(HERE, "../../lib/smart-tools.ts"), "utf8");
const WA = readFileSync(resolve(HERE, "../../lib/whatsapp.ts"), "utf8");

// slice each relay tool body so assertions are scoped to the right tool
const mpIdx = ST.indexOf('if (name === "message_person")');
const rcIdx = ST.indexOf('if (name === "relay_to_colleague")');
const mp = mpIdx >= 0 ? ST.slice(mpIdx, mpIdx + 14000) : "";
const rc = rcIdx >= 0 ? ST.slice(rcIdx, rcIdx + 8000) : "";

// ---- L1: sendTextAndLog is imported (the logging chokepoint) ----
{
  if (!/import\s*\{[^}]*\bsendTextAndLog\b[^}]*\}\s*from\s*"\.\/whatsapp"/.test(ST)) fail("L1 smart-tools must import sendTextAndLog");
  else ok("L1 sendTextAndLog imported");
}

// ---- L2: message_person relays via sendTextAndLog, not raw sendText ----
{
  if (!/sendTextAndLog\(db, number, text/.test(mp)) fail("L2a message_person must send via sendTextAndLog (logs recipient thread)");
  else ok("L2a message_person routes through the logging chokepoint");
  // and it must resolve the RECIPIENT (contactId:null -> resolveContact(number)), not log to the sender
  if (!/sendTextAndLog\(db, number, text, \{[^}]*contactId: null/.test(mp)) fail("L2b message_person must pass contactId:null so it logs the RECIPIENT's thread, not the sender's");
  else ok("L2b message_person logs the recipient's thread (contactId:null)");
}

// ---- L3: relay_to_colleague relays via sendTextAndLog ----
{
  if (!/sendTextAndLog\(db, number, body/.test(rc)) fail("L3a relay_to_colleague must send via sendTextAndLog");
  else ok("L3a relay_to_colleague routes through the logging chokepoint");
  if (!/sendTextAndLog\(db, number, body, \{[^}]*contactId: null/.test(rc)) fail("L3b relay_to_colleague must pass contactId:null (recipient's thread)");
  else ok("L3b relay_to_colleague logs the recipient's thread");
}

// ---- L4: the chokepoint actually writes a messages row on the recipient thread ----
{
  const fn = WA.slice(WA.indexOf("export async function sendTextAndLog"));
  const resolves = /contactIdResolved = opts\?\.contactId \?\? \(await resolveContact\(db, to\)\)/.test(fn);
  const writes = /from\("messages"\)\.insert\(\{[\s\S]{0,200}?direction: "out"[\s\S]{0,200}?contact_id: contactIdResolved/.test(fn);
  if (!resolves) fail("L4a sendTextAndLog must resolve the recipient contact when contactId is not given");
  else ok("L4a sendTextAndLog resolves the recipient contact");
  if (!writes) fail("L4b sendTextAndLog must write an out messages row on the recipient's contact_id");
  else ok("L4b sendTextAndLog writes the recipient's thread (the substrate historyFor reads)");
}

// ---- L5: historyFor still reads the messages thread (read side unchanged) ----
{
  const RT = readFileSync(resolve(HERE, "../../app/api/whatsapp/worker/route.ts"), "utf8");
  if (!/async function historyFor[\s\S]{0,900}?from\("messages"\)[\s\S]{0,300}?eq\("contact_id", contactId\)/.test(RT)) fail("L5 historyFor must still read the per-contact messages thread");
  else ok("L5 historyFor reads the per-contact thread (now populated for relays too)");
}

if (process.exitCode) console.error("\nsasa-relay-thread-log-wall: FAIL");
else console.log("\nsasa-relay-thread-log-wall: ALL GREEN");
