// CAPABILITY COVERAGE WALL (spec: no advertised capability ships unwired).
//
// The failure this prevents: the bot is asked to do something practical and can't,
// because the capability was declared (a tool schema, a manifest entry, a line in
// the capability menu) but never wired to a real handler — or a manifest routes to
// a tool that does not exist. This wall makes that state impossible to ship.
//
// Three assertions, all structural (no DB, no model), so it runs in the gate:
//   C1  every SMART_TOOLS tool has a real handler branch in smart-tools.ts (WIRED).
//   C2  every manifest/cross-cutting tool actually exists in SMART_TOOLS (no phantom).
//   C3  every SMART_TOOLS tool is reachable from at least one manifest or cross-cutting
//       (advertised-but-unroutable: a tool nothing can ever route to is dead weight).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MANIFESTS, CROSS_CUTTING_TOOLS } from "../../lib/agents/manifests/index.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ST_SRC = fs.readFileSync(path.resolve(HERE, "..", "..", "lib", "smart-tools.ts"), "utf8");
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);

// Declared tools = each SMART_TOOLS schema literal `{ name: "X", description: ... }`.
// Parsed from source (NOT imported) so this wall never drags in smart-tools.ts's heavy
// runtime deps — it must run under plain node in the gate, not only tsx.
const declared = [...ST_SRC.matchAll(/\{\s*name:\s*"([^"]+)",\s*description:/g)].map((m) => m[1]);
// Handlers wired in smart-tools.ts: every `name === "X"` branch (covers runRead,
// runAction, runSmartTool). This is where a tool's real implementation lives.
const handled = new Set([...ST_SRC.matchAll(/name === "([^"]+)"/g)].map((m) => m[1]));

// Tools legitimately handled OUTSIDE the smart-tools dispatch. Each MUST carry a
// reason; an empty allowlist is the goal. Keep this honest — do not silence a real
// gap by parking it here.
const EXTERNAL_HANDLERS = new Set([
  // (none today — add with a one-line reason if a tool is dispatched elsewhere)
]);

const manifestTools = new Set([
  ...Object.values(MANIFESTS).flatMap((m) => m.tools),
  ...Array.from(CROSS_CUTTING_TOOLS),
]);

// C1: every advertised tool is wired.
const unwired = declared.filter((n) => !handled.has(n) && !EXTERNAL_HANDLERS.has(n));
if (unwired.length) fail(`C1 ${unwired.length} advertised tool(s) NOT wired to a handler: ${unwired.join(", ")}`);
else ok(`C1 all ${declared.length} advertised tools are wired to a handler`);

// C2: no manifest routes to a tool that does not exist.
const declaredSet = new Set(declared);
const phantom = [...manifestTools].filter((n) => !declaredSet.has(n));
if (phantom.length) fail(`C2 ${phantom.length} manifest tool(s) have no schema in SMART_TOOLS: ${phantom.join(", ")}`);
else ok(`C2 every manifest/cross-cutting tool exists in SMART_TOOLS`);

// C3: every tool is routable (in some manifest or cross-cutting), else it can never
// be reached even though it is wired — a capability the operator can never trigger.
const unroutable = declared.filter((n) => !manifestTools.has(n));
if (unroutable.length) fail(`C3 ${unroutable.length} wired tool(s) are in NO manifest, unreachable by routing: ${unroutable.join(", ")}`);
else ok(`C3 every advertised tool is routable from at least one domain`);

if (process.exitCode) console.error(`\ncapability-coverage: gaps found (see above).`);
else console.log(`\ncapability-coverage: ${declared.length} tools, all wired + routable, no phantoms.`);
