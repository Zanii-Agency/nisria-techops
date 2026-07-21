// Edit-in-place wall (2026-07-22). Operator: "Nur can't edit a calendar, it always has to be
// deleted then done again — fix that class, not just calendar, for anything else."
//
// THE CLASS. An entity the operator created must be EDITABLE in place — changing a detail must
// never require delete-and-recreate. Calendar events had NO editor for title/location/notes
// (move_event only changed date/time), and grants could only change status/award. Both are
// closed here; the high-frequency editors (task, payment) are pinned so the class can't regress.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
let failed = 0;
const ok = (m) => console.log("PASS:", m);
const fail = (m) => { failed++; console.log("FAIL:", m); };
const st = readFileSync(resolve(HERE, "../../lib/smart-tools.ts"), "utf8");
const mf = readFileSync(resolve(HERE, "../../lib/agents/manifests/index.ts"), "utf8");

// ---- CALENDAR: edit_event ----
// C1: the handler edits title/location/notes IN PLACE (the fields move_event never touched).
if (/name === "edit_event"/.test(st)
    && /changes\.title = input\.new_title\.trim\(\)/.test(st)
    && /changes\.location = input\.new_location\.trim\(\)/.test(st)
    && /changes\.notes = input\.new_notes\.trim\(\)/.test(st))
  ok("C1 edit_event changes title/location/notes in place (not only date/time)");
else fail("C1 edit_event must edit title/location/notes, closing the calendar delete-recreate gap");
// C2: only the supplied fields change (partial patch), and it syncs the same edit to Google.
if (/from\("calendar_events"\)\.update\(changes\)\.eq\("id", e\.id\)/.test(st)
    && /const merged = \{ \.\.\.e, \.\.\.changes \}/.test(st)
    && /gcalPatch\(e\.gcal_event_id, merged\)/.test(st))
  ok("C2 edit_event patches only the changed fields and mirrors the edit to Google");
else fail("C2 edit_event must partial-patch the row and sync the merged event to gcal");
// C3: reachable — registered in WORK_MANIFEST + FIELD_SAFE_TOOLS (team can edit their events).
if (/WORK_MANIFEST[\s\S]*?"edit_event"/.test(mf) && /FIELD_SAFE_TOOLS[\s\S]*?"edit_event"/.test(mf))
  ok("C3 edit_event is registered in WORK_MANIFEST + FIELD_SAFE_TOOLS");
else fail("C3 edit_event must be in WORK_MANIFEST and FIELD_SAFE_TOOLS or the model/team can't reach it");
// C4: the schema tells the model NEVER to delete-and-recreate to edit.
if (/EDIT an existing calendar event IN PLACE[\s\S]{0,400}?NEVER delete-and-recreate/.test(st))
  ok("C4 edit_event schema forbids the delete-and-recreate workaround");
else fail("C4 edit_event schema must instruct: never delete-and-recreate to change an event");

// ---- GRANTS: update_grant_status is now a full editor ----
// G1: a grant's program/requested/deadline/notes are editable, not just status/award.
if (/patch\.program = input\.new_program/.test(st)
    && /patch\.amount_requested = input\.amount_requested/.test(st)
    && /patch\.deadline = String\(input\.deadline\)/.test(st)
    && /patch\.notes = input\.new_notes/.test(st))
  ok("G1 update_grant_status edits program/requested/deadline/notes in place");
else fail("G1 grants must be editable beyond status/award (was the same delete-recreate gap)");

// ---- THE CLASS HOLDS for the high-frequency editors (regression guard) ----
// K1: a task is fully editable in place — rename, reassign, reschedule.
if (/patch\.title = String\(input\.new_title\)/.test(st) && /patch\.due_on = input\.due_on/.test(st) && /patch\.assignee_id = m\.id/.test(st))
  ok("K1 update_task edits title + due date + assignee in place");
else fail("K1 update_task must edit title/due/assignee (class regression)");
// K2: a payment is fully editable in place — amount + payee.
if (/patch\.amount =/.test(st) && /patch\.payee =/.test(st))
  ok("K2 update_payment edits amount + payee in place");
else fail("K2 update_payment must edit amount/payee (class regression)");

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
