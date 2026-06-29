// Third-pass page/flow wall — batch 1 (2026-06-29).
// H-1: the Memory page is a read-only Brain viewer — it must NOT host the DispatchBox (which
//      creates tasks + emails staff), or "save a memory" silently fires the wrong action.
// H-4: the Workspace send must not mark the inbound thread answered when the email send failed.
// M-1: the inbox "+ Add account" must point at /settings (where the connect action lives), not /team.
// L-1: team/[id] must 404 an unknown id, not render a phantom profile bound to a dead id.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const rd = (...p) => fs.readFileSync(path.resolve(HERE, "..", "..", ...p), "utf8");
const MEM = rd("app", "memory", "page.tsx");
const WS = rd("app", "workspace", "actions.ts");
const INB = rd("app", "inbox", "page.tsx");
const TM = rd("app", "team", "[id]", "page.tsx");
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);

// ---- H-1 ----
{
  if (/<DispatchBox\s*\/>/.test(MEM)) fail("H-1a the Memory viewer must NOT render <DispatchBox/> (it creates tasks + emails staff)");
  else ok("H-1a Memory page no longer renders DispatchBox");
  if (/import DispatchBox/.test(MEM)) fail("H-1b drop the now-unused DispatchBox import from the Memory page");
  else ok("H-1b DispatchBox import removed");
}

// ---- H-4 ----
{
  if (!/if \(contact_id && status !== "failed"\) await admin\(\)\.from\("messages"\)\.update\(\{ status: "replied" \}\)/.test(WS))
    fail("H-4 workspace sendChat must only close the inbound thread when the send did not fail");
  else ok("H-4 workspace send closes the thread only on a non-failed send");
}

// ---- M-1 ----
{
  if (/<a href="\/team"[^>]*>\+ Add account<\/a>/.test(INB)) fail("M-1a inbox '+ Add account' must not point at /team (no connect UI there)");
  else ok("M-1a inbox '+ Add account' no longer points at /team");
  if (!/<a href="\/settings"[^>]*title="Connect another mailbox or channel"[^>]*>\+ Add account<\/a>/.test(INB)) fail("M-1b inbox '+ Add account' must point at /settings");
  else ok("M-1b inbox '+ Add account' points at /settings");
}

// ---- L-1 ----
{
  if (!/import \{ notFound \} from "next\/navigation";/.test(TM)) fail("L-1a team/[id] must import notFound");
  else ok("L-1a team/[id] imports notFound");
  if (!/if \(!row\) notFound\(\);/.test(TM)) fail("L-1b team/[id] must 404 an unknown id, not render a phantom profile");
  else ok("L-1b team/[id] 404s an unknown id");
}

if (process.exitCode) console.error("\nWALL RED.");
else console.log("\nWALL GREEN.");
