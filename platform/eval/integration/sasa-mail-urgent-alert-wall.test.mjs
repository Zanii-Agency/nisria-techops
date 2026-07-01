// Urgent-email alert wall (2026-07-02). The inbox sweep must (1) triage each NEW
// email for urgency via forced tool-use, (2) be biased against false pings, (3)
// fail-safe to NOT-urgent on a classifier error, (4) ping Nur (not the builder)
// via the quiet-hours-aware, per-email-deduped pushEmailAlert, and (5) run more
// often than once a day so a ping is timely. Source anti-drift so a later edit
// can't quietly turn this into a spam cannon or a silent sweep again.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);
const flat = (s) => s.replace(/\s+/g, " ");
const MM = readFileSync(resolve(HERE, "../../lib/mail-memory.ts"), "utf8");
const NOTIFY = readFileSync(resolve(HERE, "../../lib/notify.ts"), "utf8");
const CFG = JSON.parse(readFileSync(resolve(HERE, "../../vercel.json"), "utf8"));

// ---- U1: sweep triages new mail with forced tool-use (not a text scrape) ----
{
  if (!/classifyEmailUrgency/.test(MM)) fail("U1a sweep must triage each email (classifyEmailUrgency)");
  else ok("U1a sweep triages each new email");
  if (!/anthropicTool</.test(MM) || !/triage_email/.test(MM)) fail("U1b triage must use forced tool-use (anthropicTool + a tool)");
  else ok("U1b triage uses forced tool-use (structured, no brittle JSON scrape)");
}

// ---- U2: biased against false pings — automated/newsletter/receipt excluded ----
{
  const sys = flat(MM.toLowerCase());
  const excludes = ["automated bank", "newsletter", "receipt"].every((w) => sys.includes(w));
  const biased = /bias hard toward urgent=false|when in doubt, it is not urgent/i.test(MM);
  if (!excludes || !biased) fail("U2 classifier must exclude automated/newsletter/receipt AND state a hard bias to not-urgent");
  else ok("U2 classifier is biased hard against false pings");
}

// ---- U3: fail-safe — a classifier failure never pings ----
{
  // on null input the classifier returns urgent:false
  if (!/if \(!input\) return \{ urgent: false/.test(MM)) fail("U3 classifier must fail-safe to urgent:false on error (never ping on failure)");
  else ok("U3 classifier fails safe to not-urgent");
}

// ---- U4: cost bound — already-remembered mail is skipped ----
{
  if (!/seen\.has\(`email:\$\{h\.id\}`\)/.test(MM) || !/continue/.test(MM)) fail("U4 sweep must skip already-remembered mail (bounds cost for a frequent cron)");
  else ok("U4 sweep skips already-known mail (bounded cost)");
}

// ---- U5: alert pass pings via pushEmailAlert and retries deferred ----
{
  if (!/pushEmailAlert/.test(MM)) fail("U5a sweep must ping via pushEmailAlert");
  else ok("U5a sweep pings urgent mail via pushEmailAlert");
  if (!/metadata->>urgent/.test(MM) || !/alert:/.test(MM)) fail("U5b alert pass must re-scan urgent mail (retries a quiet-hours-deferred ping)");
  else ok("U5b alert pass re-scans urgent mail (deferred-ping retry)");
}

// ---- U6: pushEmailAlert — Nur only, deduped per gmail id, quiet-hours aware ----
{
  const fn = NOTIFY.slice(NOTIFY.indexOf("export async function pushEmailAlert"));
  if (!/export async function pushEmailAlert/.test(NOTIFY)) fail("U6a pushEmailAlert must exist in notify.ts");
  else ok("U6a pushEmailAlert exists");
  // Nur = the operator key that is NOT an owner (never the builder)
  if (!/opsKeys\.find\(\(k\) => !owners\.includes\(k\)\)/.test(fn)) fail("U6b must target Nur (operator that isn't the owner), never the builder");
  else ok("U6b targets Nur only, not the builder");
  if (!/emailAlertSentRecently/.test(fn)) fail("U6c must dedup per gmail id (emailAlertSentRecently)");
  else ok("U6c dedups per gmail message id");
  if (!/deferredQuietHours/.test(fn) || !/email\.alert_deferred_quiet_hours/.test(fn)) fail("U6d must respect quiet hours (defer, emit deferred event)");
  else ok("U6d respects quiet hours (defers overnight, no 2am ping)");
  if (!/pushOperatorUpdate\(/.test(fn)) fail("U6e must send via pushOperatorUpdate (off-window template, logged)");
  else ok("U6e sends via the pushOperatorUpdate rail");
}

// ---- U7: scheduled more often than daily so a ping is timely ----
{
  const c = (CFG.crons || []).find((x) => x.path === "/api/cron/mail-memory");
  if (!c) fail("U7 mail-memory cron missing");
  else if (!/\*\/\d+ \* \* \*|^\d+ \*\/\d+ \* \*/.test(c.schedule)) fail(`U7 mail-memory must run more than once a day, got "${c.schedule}"`);
  else ok(`U7 mail-memory runs often enough for timely alerts (${c.schedule})`);
}

if (process.exitCode) console.error("\nsasa-mail-urgent-alert-wall: FAIL");
else console.log("\nsasa-mail-urgent-alert-wall: ALL GREEN");
