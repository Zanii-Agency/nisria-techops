// Golden-path soak wall (2026-07-01). The synthetic-Nur daily soak must (1) cover all 8
// golden paths + the brain/DB infra, (2) be SAFE — never write to prod, (3) alert Taona
// (pushIncident) on any red, (4) be scheduled before the 8am brief. Source anti-drift so
// a future edit can't quietly drop a path or add a write.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);
const SRC = readFileSync(resolve(HERE, "../../app/api/cron/golden-soak/route.ts"), "utf8");
const CFG = JSON.parse(readFileSync(resolve(HERE, "../../vercel.json"), "utf8"));

// ---- K1: all 8 golden paths + brain + DB are checked ----
{
  const need = ["brain_key", "database", "task_create", "task_assign", "payment_log", "group_post", "brain_save", "wishlist_add", "email_send", "calendar_event"];
  const missing = need.filter((p) => !new RegExp(`add\\("${p}"`).test(SRC));
  if (missing.length) fail(`K1 soak missing checks: ${missing.join(", ")}`);
  else ok("K1 all 8 golden paths + brain + DB are health-checked");
}

// ---- K2: SAFE — the soak must NEVER write to prod ----
{
  // real Supabase writes only (not crypto's .update(body)): insert/upsert/delete, or from(...).update(
  if (/\.(insert|upsert|delete)\(|from\([^)]*\)[\s\S]{0,80}?\.update\(/.test(SRC)) fail("K2 the soak must not write/mutate prod data — no insert/upsert/delete/table-update");
  else ok("K2 soak is read-only on prod data (crypto .update is not a DB write)");
}

// ---- K3: it checks real routing + real dependencies (not just tool names) ----
{
  if (!/parseTasks\(/.test(SRC) || !/parsePaymentAll\(/.test(SRC)) fail("K3a soak must run the real parsers (deploy-regression check)");
  else ok("K3a soak runs the real parsers (task_create + payment_log routing)");
  if (!/group_poll/.test(SRC) || !/ANTHROPIC_API_KEY/.test(SRC)) fail("K3b soak must ping live deps (group bot heartbeat + brain key)");
  else ok("K3b soak pings live dependencies (group bot heartbeat, brain key)");
}

// ---- K4: any red alerts Taona + emits an event ----
{
  if (!/pushIncident\("Golden-path soak"/.test(SRC)) fail("K4a a failing path must pushIncident to the owner");
  else ok("K4a red paths alert Taona via pushIncident");
  if (!/golden_soak\.failed/.test(SRC) || !/golden_soak\.ok/.test(SRC)) fail("K4b soak must emit ok/failed events (observable)");
  else ok("K4b soak emits golden_soak.ok / golden_soak.failed");
}

// ---- K5: scheduled before the 8am (05:00 UTC) brief ----
{
  const c = (CFG.crons || []).find((x) => x.path === "/api/cron/golden-soak");
  if (!c) fail("K5 golden-soak cron not scheduled in vercel.json");
  else {
    const [min, hr] = c.schedule.split(" ");
    const mins = parseInt(hr, 10) * 60 + parseInt(min, 10);
    if (!(mins < 5 * 60)) fail(`K5 soak must run before the 05:00 UTC brief, got "${c.schedule}"`);
    else ok("K5 soak scheduled before the morning brief");
  }
}

// ---- K6: HMAC webhook to the owner's bot (preferred delivery) + WhatsApp fallback ----
{
  if (!/SOAK_WEBHOOK_URL/.test(SRC) || !/SOAK_WEBHOOK_SECRET/.test(SRC)) fail("K6a soak must support a configurable webhook (SOAK_WEBHOOK_URL/SECRET)");
  else ok("K6a soak can POST results to a configurable webhook");
  if (!/createHmac\("sha256", hookSecret\)/.test(SRC) || !/"x-signature": `sha256=/.test(SRC)) fail("K6b webhook must be HMAC-SHA256 signed with an x-signature header");
  else ok("K6b webhook payload is HMAC-SHA256 signed");
  if (!/red\.length \|\| \(hookUrl && !webhookDelivered\)/.test(SRC)) fail("K6c must fall back to the WhatsApp incident on red OR undelivered webhook (never silent)");
  else ok("K6c WhatsApp fallback fires on red or a failed webhook delivery");
}

if (process.exitCode) console.error("\nsasa-golden-soak-wall: FAIL");
else console.log("\nsasa-golden-soak-wall: ALL GREEN");
