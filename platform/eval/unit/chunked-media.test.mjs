// WALL: oversized media must have a route in, and the numbers must actually clear the
// edge limit that caused the loss.
//
// Vercel rejects a serverless request body over 4.5MB BEFORE the route runs. The bot
// base64s media into JSON (4/3 inflation), so media over ~3MB returned 413 and the
// receipt was dropped. Measured on prod 2026-07-20: 4MB body reaches the route, 4.5MB
// does not. These checks fail if anyone raises a chunk size back over the cliff.
import { readFileSync } from "fs";

let failed = 0;
const ok = (n) => console.log(`PASS: ${n}`);
const bad = (n, d) => { console.log(`FAIL: ${n}${d ? " — " + d : ""}`); failed++; };
const check = (n, cond, d) => (cond ? ok(n) : bad(n, d));

const VERCEL_BODY_LIMIT = 4_500_000;
const B64 = 4 / 3;                    // base64 inflation
const JSON_OVERHEAD = 1_000;          // field names, ids, mime

const route = readFileSync(new URL("../../app/api/group/ingest/chunk/route.ts", import.meta.url), "utf8");
const ingest = readFileSync(new URL("../../app/api/group/ingest/route.ts", import.meta.url), "utf8");

const num = (src, name) => {
  const m = new RegExp(`${name}\\s*=\\s*([0-9_]+)`).exec(src);
  return m ? Number(m[1].replace(/_/g, "")) : NaN;
};

// C1 the endpoint exists and is authed the same way as the main ingest
check("C1 chunk endpoint requires the group secret", /timingSafeEqual/.test(route));

// C2 a single part, once base64'd, must fit under the edge limit with room to spare
const maxPart = num(route, "MAX_PART_BYTES");
check("C2 max part fits under the Vercel body limit once base64'd",
  Number.isFinite(maxPart) && maxPart * B64 + JSON_OVERHEAD < VERCEL_BODY_LIMIT,
  `MAX_PART_BYTES=${maxPart} -> ${Math.round(maxPart * B64)} bytes encoded`);

// C3 parts x size must cover the bot's own 15MB ceiling, or big files still die
const maxParts = num(route, "MAX_PARTS");
check("C3 parts cover the bot's 15MB media cap",
  Number.isFinite(maxParts) && maxParts * 2 * 1024 * 1024 >= 15 * 1024 * 1024,
  `MAX_PARTS=${maxParts}`);

// C4 the main ingest must accept a path, else assembled files are unreachable
check("C4 ingest resolves media_path into bytes",
  /media_path/.test(ingest) && /mediaB64\s*=\s*Buffer\.from\(await blob\.arrayBuffer\(\)\)\.toString\("base64"\)/.test(ingest));

// C5 mediaB64 must be reassignable, or the path branch cannot populate it
check("C5 mediaB64 is a let, not a const", /let mediaB64\s*=/.test(ingest));

// C6 a truncated upload must fail loudly, never assemble a partial receipt
check("C6 assembly verifies every part is present", /incomplete upload: have/.test(route));

// C7 orphaned parts from a dropped chunk must be swept, not left forever
check("C7 orphaned parts are swept", /sweepOrphans/.test(route) && /PART_TTL_MS/.test(route));

// C8 parts are removed once assembled
check("C8 parts are deleted after assembly", /storage\.from\(BUCKET\)\.remove\(/.test(route));

if (failed) { console.log(`\nchunked-media: ${failed} check(s) failed.`); process.exit(1); }
console.log("\nchunked-media: all checks passed.");
