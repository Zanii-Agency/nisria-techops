// Audit #11/#10/#8 wall (2026-06-29).
// #11: relay_to_colleague must not claim "already passed that" when the prior relay was only
//      QUEUED (delivered:false) — the dedup must ignore held-not-delivered priors.
// #10: create_task must store due_on=today when only a time is given, or the timed cron
//      (which matches due_on=today) never fires the reminder the reply promises.
// #8:  the funder report must not book a Givebutter payout as a USD expense (it is already
//      the "Withdrawn from Givebutter" inflow-to-Kenya line; counting it twice overstates spend).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const S = fs.readFileSync(path.resolve(HERE, "..", "..", "lib", "smart-tools.ts"), "utf8");
const RP = fs.readFileSync(path.resolve(HERE, "..", "..", "app", "reports", "page.tsx"), "utf8");
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);

// ---- #11: relay dedup ignores a held (delivered:false) prior ----
{
  if (!/const dupe = \(\(recent \|\| \[\]\) as any\[\]\)\.some\(\(e\) => e\.payload\?\.to_hash === rh && e\.payload\?\.delivered !== false &&/.test(S))
    fail("#11 the relay dedup must require delivered !== false (a queued/held prior is NOT 'already passed')");
  else ok("#11 relay dedup ignores held-not-delivered priors (no false 'already passed')");
}

// ---- #10: timed reminder gets a due_on so the cron fires ----
{
  if (!/const effDueOn = due_on \|\| \(due_time \? n\.today : null\);/.test(S)) fail("#10a create_task must default due_on to today when only a time is given");
  else ok("#10a create_task computes effDueOn (time-only -> today)");
  if (!/due_on: effDueOn, due_time,/.test(S)) fail("#10b the task insert must store effDueOn so the timed cron (due_on=today) matches");
  else ok("#10b the insert stores effDueOn");
}

// ---- #8: payouts excluded from the report expense sum ----
{
  if (!/const paidUsd = payments\.filter\(\(p\) => p\.status === "paid" && isUsd\(p\) && p\.category !== "payout" && p\.method !== "givebutter"\)/.test(RP))
    fail("#8 the report expense sum must exclude payout/givebutter rows (already counted as the withdrawn flow)");
  else ok("#8 report expenses exclude Givebutter payouts (no double-count)");
}

if (process.exitCode) console.error("\nWALL RED.");
else console.log("\nWALL GREEN.");
