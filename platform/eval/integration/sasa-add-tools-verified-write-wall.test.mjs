// Add-tools verified-write wall (2026-06-21, KT #336). add_team_member /
// add_inventory_item inserted WITHOUT checking the insert error, then returned
// ok:true "Added X" regardless — so a failed write (RLS, constraint, network)
// would tell Nur "Added" when nobody was added. Caught live when add_team_member
// returned ok:true "Added __verify_contractor__" while NO row landed. No tool may
// claim a write it did not verify (the "no lies, each tool returns successful"
// doctrine). The DB write itself is fine (prod insert -> HTTP 201); the bug is the
// missing error check.
//
// Fix: destructure { error } from the insert and return ok:false (honest "I could
// not add … so I have not") when it fails — never a fake "Added".
//
// Seams:
//   S1  add_team_member destructures the insert error and guards (no fake Added)
//   S2  add_inventory_item destructures the insert error and guards
//   S3  both failure guards return ok:false (not ok:true)
//
// Pure local.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SMART = fs.readFileSync(path.resolve(HERE, "..", "..", "lib", "smart-tools.ts"), "utf8");
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);

function regionOf(marker) {
  const i = SMART.indexOf(marker);
  return i >= 0 ? SMART.slice(i, i + 1100) : "";
}

// ---- S1: add_team_member checks the insert error + guards ----
{
  const r = regionOf('name === "add_team_member"');
  if (!/insert\([\s\S]*?error:\s*\w+\s*\}/.test(r) && !/\{\s*data:\s*member\s*,\s*error:/.test(r)) fail("S1 add_team_member must destructure the insert error");
  else if (!/if\s*\(\s*\w*[Ee]rr\s*\|\|\s*!member\s*\)\s*return\s*\{\s*ok:\s*false/.test(r.replace(/\s+/g, " "))) fail("S1 add_team_member must return ok:false when the insert fails (no fake 'Added')");
  else ok("S1 add_team_member verifies its write, refuses to fake-Added");
}

// ---- S2: add_inventory_item checks the insert error + guards ----
{
  const r = regionOf('name === "add_inventory_item"');
  if (!/\{\s*data:\s*item\s*,\s*error:/.test(r)) fail("S2 add_inventory_item must destructure the insert error");
  else if (!/if\s*\(\s*\w*[Ee]rr\s*\|\|\s*!item\s*\)\s*return\s*\{\s*ok:\s*false/.test(r.replace(/\s+/g, " "))) fail("S2 add_inventory_item must return ok:false when the insert fails");
  else ok("S2 add_inventory_item verifies its write");
}

// ---- S3: the old unchecked pattern is gone for these two ----
{
  const tm = regionOf('name === "add_team_member"');
  const inv = regionOf('name === "add_inventory_item"');
  if (/const \{ data: member \} = await db\.from\("team_members"\)\.insert/.test(tm)) fail("S3 add_team_member still uses the unchecked `{ data: member }` insert");
  else if (/const \{ data: item \} = await db\.from\("inventory"\)\.insert/.test(inv)) fail("S3 add_inventory_item still uses the unchecked `{ data: item }` insert");
  else ok("S3 unchecked-insert pattern removed from both add tools");
}

if (process.exitCode) console.error("\nWALL RED.");
else console.log("\nWALL GREEN.");
