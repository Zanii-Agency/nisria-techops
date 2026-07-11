// Dev-origin alert reroute wall (2026-07-11, KT #206665). Law 12 (test-mode).
// LIVE LEAK this pins: a soak run from the developer line said "Add a meeting
// called Soak Review on Friday at 2pm" and create_event's pushCalendarAlert
// pinged NUR'S PERSONAL LINE ("Added to your calendar: Soak Review...") at
// 13:24:17Z. Test traffic must NEVER reach Nur or a real teammate: an alert
// caused by a developer-origin turn reroutes to devPhone via the existing
// dev plumbing (sendTextAndLog/sendTemplateAndLog/pushOperatorUpdate dev opt).
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
let failed = 0;
const ok = (m) => console.log(`PASS: ${m}`);
const fail = (m) => { failed++; console.log(`FAIL: ${m}`); };

const st = readFileSync(resolve(HERE, "../../lib/smart-tools.ts"), "utf8");
const nt = readFileSync(resolve(HERE, "../../lib/notify.ts"), "utf8");

// D1: create_event threads devOrigin from the sender into the calendar alert.
if (/pushCalendarAlert\(db,[^\n]*"added",\s*\{\s*devOrigin:\s*isDeveloperPhone\(ctx\.senderPhone \|\| ""\)\s*\}\)/.test(st))
  ok("D1 create_event passes devOrigin(senderPhone) to pushCalendarAlert");
else fail("D1 create_event must pass { devOrigin: isDeveloperPhone(ctx.senderPhone || \"\") } to pushCalendarAlert");

// D2: pushCalendarAlert forwards the flag into the operator send.
if (/pushOperatorUpdate\(db, to, nurName, text, \{ dev: opts\?\.devOrigin \}\)/.test(nt))
  ok("D2 pushCalendarAlert forwards dev:devOrigin into pushOperatorUpdate");
else fail("D2 pushCalendarAlert must call pushOperatorUpdate with { dev: opts?.devOrigin }");

// D3: pushTaskAlert forwards the flag into BOTH its send paths.
const taskSends = (nt.match(/sendTemplateAndLog\(db, to, "task_alert",[^\n]*\{ dev: opts\?\.devOrigin \}\)/g) || []).length;
if (taskSends >= 2 && /sendTextAndLog\(db, to, reminderBody, \{ dev: opts\?\.devOrigin \}\)/.test(nt))
  ok("D3 pushTaskAlert forwards dev:devOrigin on reminder + template sends");
else fail("D3 pushTaskAlert must pass { dev: opts?.devOrigin } on all its sends");

// D4: task-alert call sites in smart-tools thread devOrigin (create_task + add_task_comment).
const taskSites = (st.match(/pushTaskAlert\(db,[^\n]*"new",\s*\{\s*devOrigin:\s*isDeveloperPhone\(ctx\.senderPhone \|\| ""\)\s*\}\)/g) || []).length;
if (taskSites >= 2) ok("D4 both pushTaskAlert call sites thread devOrigin");
else fail(`D4 expected >=2 pushTaskAlert call sites threading devOrigin, found ${taskSites}`);

console.log(failed ? "WALL RED." : "sasa-dev-origin-alert-wall: ALL GREEN");
process.exit(failed ? 1 : 0);
