// C1 auth wall (2026-06-29). The PLURAL portal feed /api/groups/messages returns up to
// 500 group chat rows + freshly signed beneficiary media URLs. It must be session-gated.
// The bug: middleware bypassed the session gate for `pathname.startsWith("/api/group")`,
// which ALSO matches "/api/groups/messages" (string prefix), so the feed was reachable
// unauthenticated by anyone with a `g=` param. Fix = tighten the bypass to "/api/group/"
// (the singular bot routes all live under /api/group/<x>) AND guard the route itself.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const MW = fs.readFileSync(path.resolve(HERE, "..", "..", "middleware.ts"), "utf8");
const R = fs.readFileSync(path.resolve(HERE, "..", "..", "app", "api", "groups", "messages", "route.ts"), "utf8");
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);

// ---- A1: the middleware session-bypass must NOT match the plural feed ----
{
  // the bypass entry must be the trailing-slash form; the bare-prefix form leaks /api/groups
  if (/startsWith\("\/api\/group"\)/.test(MW)) fail("A1a middleware must NOT bypass the session gate with the bare '/api/group' prefix (it also matches '/api/groups')");
  else ok("A1a middleware no longer carries the leaky bare '/api/group' bypass");
  if (!/startsWith\("\/api\/group\/"\)/.test(MW)) fail("A1b middleware must bypass only the singular bot routes via '/api/group/' (trailing slash)");
  else ok("A1b middleware bypass is scoped to '/api/group/' (singular bot routes only)");
}

// ---- A2: the feed route guards itself (defense in depth) ----
{
  if (!/cookies\(\)\.get\("nisria_session"\)\?\.value === process\.env\.SESSION_TOKEN/.test(R))
    fail("A2a /api/groups/messages must verify the nisria_session cookie itself");
  else ok("A2a feed route verifies the session cookie (defense in depth)");
  // the guard must run BEFORE the data fetch, so an unauthed caller never reaches the DB / signed URLs
  const guardIdx = R.indexOf("nisria_session");
  const fetchIdx = R.indexOf('.from("messages")');
  const signIdx = R.indexOf("createSignedUrls");
  if (!(guardIdx > 0 && fetchIdx > guardIdx)) fail("A2b the session guard must run before the messages query");
  else ok("A2b session guard precedes the messages query");
  if (!(guardIdx > 0 && signIdx > guardIdx)) fail("A2c the session guard must run before media is signed");
  else ok("A2c session guard precedes the media signing (no signed beneficiary URLs for anon)");
  if (!/if \(!authed\) return/.test(R)) fail("A2d an unauthed caller must get an early return, never the feed");
  else ok("A2d unauthed callers get an early return (no leak)");
}

if (process.exitCode) console.error("\nWALL RED.");
else console.log("\nWALL GREEN.");
