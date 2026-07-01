// Morning-brief schedule wall (2026-07-01, Taona: "every morning the bot should text
// team members using template at 8am Nairobi time"). The /api/cron/reminders cron sends
// operators a text brief and bot_access team members the daily_brief TEMPLATE (out-of-window
// safe) of their due-today tasks. Nairobi is EAT = UTC+3 all year, so 8am Nairobi = 05:00
// UTC -> schedule "0 5 * * *". expire-tasks must run BEFORE the brief (so lapsed tasks stop
// nagging), i.e. earlier than 05:00 UTC. This wall pins both so the time can't silently drift.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);
const cfg = JSON.parse(readFileSync(resolve(HERE, "../../vercel.json"), "utf8"));
const crons = cfg.crons || [];
const find = (p) => crons.find((c) => c.path === p);

// ---- B1: reminders (the morning brief) runs at 05:00 UTC = 08:00 Nairobi ----
{
  const r = find("/api/cron/reminders");
  if (!r) fail("B1 /api/cron/reminders cron missing");
  else if (r.schedule !== "0 5 * * *") fail(`B1 morning brief must be "0 5 * * *" (08:00 Nairobi), got "${r.schedule}"`);
  else ok("B1 morning brief scheduled 05:00 UTC (08:00 Nairobi)");
}

// ---- B2: expire-tasks runs BEFORE the brief (earlier than 05:00 UTC) ----
{
  const e = find("/api/cron/expire-tasks");
  if (!e) fail("B2 /api/cron/expire-tasks cron missing");
  else {
    const [min, hr] = e.schedule.split(" ");
    const mins = parseInt(hr, 10) * 60 + parseInt(min, 10);
    if (!(mins < 5 * 60)) fail(`B2 expire-tasks must run before 05:00 UTC so lapsed tasks don't nag the brief, got "${e.schedule}"`);
    else ok("B2 expire-tasks runs before the morning brief");
  }
}

// ---- B3: the brief actually texts bot_access team members via the daily_brief template ----
{
  const src = readFileSync(resolve(HERE, "../../app/api/cron/reminders/route.ts"), "utf8");
  if (!/m\.bot_access !== true\) continue/.test(src)) fail("B3 team-member template loop (bot_access gate) missing");
  else if (!/pushDailyBrief\(db, phoneKey\(m\.phone\), mine\.length\)/.test(src)) fail("B3 pushDailyBrief (daily_brief template) call missing");
  else ok("B3 bot_access team members get the daily_brief template of their due tasks");
}

if (process.exitCode) console.error("\nsasa-morning-brief-schedule-wall: FAIL");
else console.log("\nsasa-morning-brief-schedule-wall: ALL GREEN");
