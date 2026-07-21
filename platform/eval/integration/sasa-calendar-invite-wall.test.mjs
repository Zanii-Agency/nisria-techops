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
console.log(failed?`\n${failed} FAILED`:"\nALL PASS");
process.exit(failed?1:0);
