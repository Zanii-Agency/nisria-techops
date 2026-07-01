// Task-ops misfire wall (2026-06-22, KT #371). LIVE, repeatedly, Taona + Nur: "Save this
// and remind me to work on it with Malek as the deadline for proposals is August 17 <url>
// ... Send it to Malek as well." → Sasa answered "'Meet with Deso and work on Kepenzi pitch
// deck' is already todo, no change needed." every single time — a wrong-task hallucination.
// Two root causes in parseTaskOps.mjs: (1) parseStateTransition classified the long
// create/reminder/send message as a state transition (matchTitleAsStatus matched "...Malek
// AS the deadline..." with an incidental status word in the long tail); (2) fuzzyMatchTasks
// counted SCAFFOLD words ("work","with") as overlap → false-matched the unrelated task.
// Fix: bail on create/remind/send intent + a link; require a SHORT status phrase; match
// only on DISTINCTIVE words. These are the REAL exported functions (pure .mjs), not a mirror.
import { parseStateTransition, fuzzyMatchTasks, parseTaskPriority } from "../../app/api/whatsapp/worker/parseTaskOps.mjs";
import { parseTasks } from "../../app/api/whatsapp/worker/parseTasks.mjs";
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);

const LIVE = "Save this and remind me to work on it with Malek as the deadline for proposals is August 17 https://dubaiculture.gov.ae/en/events/Sikka-Open-Call---2027 And this should be a proposal for a Maisha Art Installation. Send it to Malek as well.";
const DESO = [{ id: "t1", title: "Meet with Deso and work on Kepenzi pitch deck", status: "todo", created_at: "2026-06-20T00:00:00Z" }];

// ---- M1: the live message is NOT a state transition ----
{
  if (parseStateTransition(LIVE) !== null) fail("M1a the Sikka/Malek reminder must NOT parse as a state transition (the hallucination)");
  else ok("M1a the create/remind/send message is not a state op (bails to parseTasks/brain)");
  if (parseStateTransition("remind me to work on it with Malek") !== null) fail("M1b 'remind me to ...' must bail (creation intent)");
  else ok("M1b 'remind me to ...' bails");
  if (parseStateTransition("Send it to Malek as well") !== null) fail("M1c 'send it to ...' must bail (send intent, not 'as <status>')");
  else ok("M1c 'send it to ...' bails");
  if (parseStateTransition("work on it with Malek as the deadline for proposals is August 17") !== null) fail("M1d a long 'X as <long clause>' must NOT be a status (status phrase too long)");
  else ok("M1d a long clause after 'as' is not a status transition");
}

// ---- M2: the wrong-task match is dead (distinctive-word overlap only) ----
{
  if (fuzzyMatchTasks("work on it with Malek", DESO).length !== 0)
    fail("M2a 'work on it with Malek' must NOT match 'Meet with Deso and work on Kepenzi pitch deck' (scaffold-only overlap)");
  else ok("M2a scaffold-only overlap ('work','with') no longer false-matches");
  if (fuzzyMatchTasks("Sikka Maisha installation proposal", DESO).length !== 0)
    fail("M2b an unrelated distinctive fragment must not match the Deso task");
  else ok("M2b unrelated distinctive words → no match");
}

// ---- M3: LEGIT state ops + matches still work (no over-correction) ----
{
  const st = parseStateTransition("mark the Kepenzi pitch deck as done");
  if (!st || st.intent !== "transition_status" || st.status !== "done") fail("M3a 'mark X as done' must still parse");
  else ok("M3a 'mark the Kepenzi pitch deck as done' still parses as done");
  if (fuzzyMatchTasks("Kepenzi pitch deck", DESO).length !== 1)
    fail("M3b a DISTINCTIVE fragment ('Kepenzi pitch deck') must still match its task");
  else ok("M3b distinctive fragment still matches the right task");
  const ab = parseStateTransition("abandon the Kepenzi deck because it is cancelled");
  if (!ab || ab.status !== "abandoned") fail("M3c 'abandon X because Y' must still parse");
  else ok("M3c 'abandon X because Y' still parses");
  const rev = parseStateTransition("mark Kepenzi deck as in review");
  if (!rev || rev.status !== "in_review") fail("M3d 'mark X as in review' must still parse");
  else ok("M3d 'mark X as in review' still parses");
}

// ---- M4: "Set/Add these tasks for today to me: <bullets>" CREATES tasks ----
// (2026-07-01 Nur incident). Her create request fell through every create
// pattern (only "assign" was recognized) and got mis-routed to the priority
// parser, which answered "I don't see an open task matching '- Java proposal,
// this' to change priority on." Now the create verbs are broadened, the header
// date + per-bullet "urgent" are parsed, and titles are clean.
{
  const ROSTER = [{ id: "nur", name: "Nur M’nasria", phone: "971501622716", status: "active" }];
  const TODAY = new Date("2026-07-01T00:00:00Z");
  // Nur's EXACT message, including the WhatsApp invisibles between • and text.
  const NUR = "Set these tasks for today to me:\n•⁠  ⁠Java proposal, this is urgent\n•⁠  ⁠⁠BHF proposal, this is urgent";
  const p = parseTasks({ body: NUR, team_members: ROSTER, sender_contact_id: "c1", source_message_id: "m1", sender_rank: "founder", sender_role: "admin", sender_team_member: ROSTER[0] });
  const tasks = (p && p.tasks) || [];
  if (tasks.length !== 2) fail(`M4a "Set these tasks for today to me:" must create 2 tasks, got ${tasks.length}`);
  else ok("M4a create-verb 'Set ... these tasks ... to me:' produces 2 tasks");
  const titles = tasks.map((t) => t.title);
  if (!titles.includes("Java proposal") || !titles.includes("BHF proposal"))
    fail(`M4b titles must be clean ("Java proposal","BHF proposal"), got ${JSON.stringify(titles)}`);
  else ok("M4b titles are clean (bullet glyph + 'this is urgent' stripped)");
  if (!tasks.every((t) => t.assignee_id === "nur")) fail("M4c both tasks must assign to Nur ('to me')");
  else ok("M4c 'to me' resolves to the sender (Nur)");
  if (!tasks.every((t) => t.due_on === "2026-07-01")) fail("M4d 'for today' header date must apply to both");
  else ok("M4d 'for today' sets due_on today on both");
  if (!tasks.every((t) => t.priority === "high" && t.important === true)) fail("M4e 'this is urgent' must set high priority + important");
  else ok("M4e 'this is urgent' -> high priority + important");
}

// ---- M5: create-verb variants + no over-correction into an UPDATE ----
{
  const ROSTER = [{ id: "nur", name: "Nur M’nasria", phone: "971501622716", status: "active" }];
  const opt = { team_members: ROSTER, sender_contact_id: "c1", source_message_id: "m2", sender_rank: "founder", sender_role: "admin", sender_team_member: ROSTER[0] };
  for (const verb of ["Add", "Create", "Make"]) {
    const body = `${verb} these tasks to me:\n- alpha proposal\n- beta proposal`;
    const t = (parseTasks({ ...opt, body }).tasks) || [];
    if (t.length !== 2) fail(`M5a "${verb} these tasks to me:" must create 2 tasks, got ${t.length}`);
  }
  ok("M5a Add/Create/Make ... these tasks to me: all create");
  // A genuine single-line priority UPDATE must still be a priority op (not stolen
  // by the create pattern, which requires 'these tasks ... :' + a bullet block).
  const up = parseTaskPriority("set the Java proposal to high priority");
  if (!up || up.intent !== "set_priority") fail("M5b 'set the X to high priority' must still parse as a priority update");
  else ok("M5b single-line 'set X to high priority' still a priority update (create pattern not over-reaching)");
  // And that same update must NOT be seen as a create (no bullet block).
  const notCreate = (parseTasks({ ...opt, body: "set the Java proposal to high priority" }).tasks) || [];
  if (notCreate.length !== 0) fail("M5c a single-line priority update must NOT create a task");
  else ok("M5c single-line priority update creates nothing");
}

if (process.exitCode) console.error("\nWALL RED.");
else console.log("\nWALL GREEN.");
