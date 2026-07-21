// Calendar invite + team-sync wall (2026-07-21). create_event can now INVITE people:
// attendees resolve name->email, ride the gcal create with sendUpdates=all, so Google emails
// each an invite and the event lands on their calendar (the team-sync ask). Honest sync state:
// a gcal failure no longer swallowed silently, and the reply never implies invites went out
// when sync failed or an attendee has no email.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
let failed=0; const ok=(m)=>console.log("PASS:",m); const fail=(m)=>{failed++;console.log("FAIL:",m);};
const st = readFileSync(resolve(HERE,"../../lib/smart-tools.ts"),"utf8");
const gc = readFileSync(resolve(HERE,"../../lib/gcal.ts"),"utf8");

// I1: gcal actually emails invites (sendUpdates=all)
if (/events\?sendUpdates=all/.test(gc)) ok("I1 createEvent uses sendUpdates=all (Google emails the invites)");
else fail("I1 createEvent must set sendUpdates=all or no invite email is sent");
// I2: attendees are put on the gcal resource
if (/attendees.*\.filter\(\(e\) => e && e\.includes\("@"\)\)\.map\(\(email\) => \(\{ email \}\)\)/.test(gc)) ok("I2 toResource attaches attendees to the event resource");
else fail("I2 toResource must add attendees to the gcal event");
// C1: create_event resolves names to emails
if (/const m = await resolveRecipient\(db, v\);[\s\S]{0,120}?attendeeEmails\.push\(m\.email\)/.test(st)) ok("C1 attendee names resolve to emails via resolveRecipient");
else fail("C1 create_event must resolve attendee names to emails");
// C2: attendees threaded into the gcal create
if (/gcalCreate\(\{ \.\.\.row, attendees: attendeeEmails\.length \? attendeeEmails : null \}/.test(st)) ok("C2 attendees threaded into gcalCreate");
else fail("C2 create_event must pass attendees to gcalCreate");
// C3: the silent catch is GONE — a gcal failure is logged, not swallowed
if (/catch \(e: any\) \{ gcalErr = String[\s\S]{0,120}?calendar\.gcal_sync_failed/.test(st)) ok("C3 a gcal failure is logged (no more silent /* link not live yet */)");
else fail("C3 the gcal catch must surface the error, not swallow it");
// C4: honest — never imply invites went out when sync failed
if (/could not send the invites just now \(calendar sync failed\)/.test(st)) ok("C4 sync failure => honest 'not notified', never a false invite claim");
else fail("C4 must not imply invites sent when gcal sync failed");
// C5: a named attendee with no email is reported, not silently dropped as invited
if (/No email on file for/.test(st)) ok("C5 an attendee with no email is reported, not silently 'invited'");
else fail("C5 must report an attendee that could not be invited");

// ---- INVITE TO AN EXISTING MEETING (2026-07-21). "send calendar invites for these meetings
// to X" used to be denied ("I can't send calendar invites") because create_event only invites
// on CREATE. invite_to_event adds a guest to a meeting already on the calendar. ----
// I3: addAttendeesToEvent MERGES (PATCH replaces the whole attendee list, so it must GET first
// and union — otherwise it wipes the existing guests) and emails via sendUpdates=all.
if (/export async function addAttendeesToEvent/.test(gc) && /\[\.\.\.new Set\(\[\.\.\.existing, \.\.\.add\]\)\]/.test(gc) && /\$\{base\}\?sendUpdates=all/.test(gc))
  ok("I3 addAttendeesToEvent GETs+merges existing guests then PATCHes with sendUpdates=all");
else fail("I3 addAttendeesToEvent must merge existing attendees (not replace) and email via sendUpdates=all");
// E1: the handler exists and only invites to meetings SYNCED to Google (has a gcal_event_id).
if (/name === "invite_to_event"/.test(st) && /\.not\("gcal_event_id", "is", null\)/.test(st) && /addAttendeesToEvent\(e\.gcal_event_id, emails\)/.test(st))
  ok("E1 invite_to_event finds synced events (gcal_event_id) and adds the guest to each");
else fail("E1 invite_to_event must target only gcal-synced events and call addAttendeesToEvent");
// E2: honest — if nothing sent, it does NOT claim an invite went out.
if (/if \(!invited\.length\) return \{ ok: false[\s\S]{0,160}?couldn't send the invite/.test(st))
  ok("E2 invite_to_event: no false invite claim when nothing was sent");
else fail("E2 invite_to_event must not imply an invite was sent on failure");
// E3: the capability is reachable — registered in the manifest AND the field-safe set (team can invite).
const mf = readFileSync(resolve(HERE,"../../lib/agents/manifests/index.ts"),"utf8");
const inWork = /WORK_MANIFEST[\s\S]*?"invite_to_event"/.test(mf);
const inField = /FIELD_SAFE_TOOLS[\s\S]*?"invite_to_event"/.test(mf);
if (inWork && inField) ok("E3 invite_to_event is registered in WORK_MANIFEST and FIELD_SAFE_TOOLS (team-reachable)");
else fail("E3 invite_to_event must be in WORK_MANIFEST and FIELD_SAFE_TOOLS or the model/team can't reach it");
// E4: the schema tells the model it CAN send invites, killing the old "I can't" denial.
if (/You CAN send calendar invites, never say you can't/.test(st))
  ok("E4 the tool schema asserts the capability (never deny 'I can't send invites')");
else fail("E4 the invite_to_event schema must assert the capability so Sasa stops denying it");

console.log(failed?`\n${failed} FAILED`:"\nALL PASS");
process.exit(failed?1:0);
