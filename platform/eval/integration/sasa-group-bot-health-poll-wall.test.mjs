// Group-bot health false-alarm wall (2026-07-21).
//
// The health check trips on bot_status.group_membership staleness. But membership
// only refreshes once per CONNECT (groupFetchAllParticipating fires on connect), so a
// stably-connected bot's membership timestamp ages past 30 min while the bot is alive —
// firing "Group bot looks dead: restart the userbot on Railway" at Nur/Taona several
// times a day. group_poll is the ~4s heartbeat and is the real liveness signal. A fresh
// poll must VETO the alarm.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
let failed = 0;
const ok = (m) => console.log(`PASS: ${m}`);
const fail = (m) => { failed++; console.log(`FAIL: ${m}`); };

const src = readFileSync(resolve(HERE, "../../app/api/cron/group-bot-health/route.ts"), "utf8");

// H1: the check reads group_poll (the real heartbeat), not just group_membership.
if (/\.eq\("key", "group_poll"\)/.test(src)) ok("H1 the check reads the group_poll heartbeat");
else fail("H1 the health check must consult bot_status.group_poll (the real liveness signal)");

// H2: a fresh poll vetoes the alarm — tripped requires !pollAlive.
if (/const tripped = membershipStale && !pollAlive && inWakingWindow/.test(src))
  ok("H2 a fresh poll heartbeat vetoes the alarm (tripped requires !pollAlive)");
else fail("H2 tripped must require !pollAlive so a live bot's aging membership can't alarm");

// H3: pollAlive requires a PRESENT, fresh poll — missing poll (=0) must NOT veto,
// so a genuinely dead bot with no heartbeat still alarms (fails safe).
if (/const pollAlive = pollUpdatedAt !== 0 && pollStaleMs < pollMax/.test(src))
  ok("H3 pollAlive fails safe: a missing/stale heartbeat does not suppress a real dead-bot alert");
else fail("H3 pollAlive must require a present AND fresh heartbeat (missing poll must not veto)");

// H4: observability — the decision inputs are emitted so a future false/true alarm is debuggable.
if (/poll_alive: pollAlive/.test(src) && /poll_stale_min:/.test(src))
  ok("H4 poll_alive + poll_stale_min are emitted for observability");
else fail("H4 the health event must emit poll_alive and poll_stale_min");

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
