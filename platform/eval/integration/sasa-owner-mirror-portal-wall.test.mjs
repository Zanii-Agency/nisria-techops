// Owner mirror portal surface wall (2026-07-20).
//
// WHAT THIS PROTECTS. The WhatsApp mirror push cannot carry a conversation: a
// watcher never replies, so his 24h Meta window is permanently closed, so every
// relay fell through to the system_alert template, which is incident-framed,
// newline-stripped and capped at 300 chars. Taona's feed arrived as fake alarms
// cut mid-word. The portal is now the full-fidelity surface and WhatsApp keeps
// only the nudge. These checks pin the properties that make /mirror trustworthy.
//
// The failure modes worth a wall, in order of blast radius:
//   1. It leaks. This page shows the founder's own conversation. If the role gate
//      slips, or the contact filter goes unbounded, it becomes a firehose of every
//      thread in the system to whoever loads it.
//   2. It truncates. If a slice or a single-direction filter creeps in, the page
//      silently becomes the thing it replaced.
//   3. The two audit surfaces drift. /admin/transcripts EXCLUDES Nur and /mirror
//      INCLUDES only Nur. Two copies of "which contacts are Nur" that disagree
//      leave a thread visible in NEITHER view.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
let failed = 0;
const ok = (m) => console.log(`PASS: ${m}`);
const fail = (m) => { failed++; console.log(`FAIL: ${m}`); };

const mirror = readFileSync(resolve(HERE, "../../app/mirror/page.tsx"), "utf8");
const transcripts = readFileSync(resolve(HERE, "../../app/admin/transcripts/page.tsx"), "utf8");
const privacy = readFileSync(resolve(HERE, "../../lib/privacy.ts"), "utf8");
const nowLib = readFileSync(resolve(HERE, "../../lib/now.ts"), "utf8");
const launchpad = readFileSync(resolve(HERE, "../../components/Launchpad.tsx"), "utf8");

// ---- M1: owner-only. The founder must not be able to load her own mirror ----
if (/getCurrentUser\(\)/.test(mirror) && /user\.role !== "builder"/.test(mirror) && /redirect\("\/"\)/.test(mirror))
  ok("M1 /mirror is gated to the owner (role builder), everyone else redirects");
else
  fail("M1 /mirror must gate on role === 'builder' and redirect otherwise");

// ---- M2: unauthenticated bounces to login before any query ----
if (/if \(!user\) redirect\("\/login"\)/.test(mirror))
  ok("M2 unauthenticated visitors bounce to /login");
else
  fail("M2 /mirror must redirect unauthenticated visitors to /login");

// ---- M3: FAIL CLOSED. No founder contact resolved means show nothing ----
// The dangerous shape is querying `messages` with an empty .in() filter or with
// the filter omitted, which returns every thread in the system.
if (/if \(nurIds\.length > 0\)/.test(mirror) && /let rows: any\[\] = \[\]/.test(mirror))
  ok("M3 fails closed: no founder contact resolved means no rows, not all rows");
else
  fail("M3 /mirror must fail closed when founderContactIds returns empty");

// ---- M4: the query is scoped to the founder's contacts ----
if (/\.in\("contact_id", nurIds\)/.test(mirror))
  ok("M4 query is scoped to the founder's contact ids");
else
  fail("M4 /mirror must scope the messages query with .in('contact_id', nurIds)");

// ---- M5: BOTH directions. A mirror with one side is not a mirror ----
if (!/\.eq\("direction"/.test(mirror))
  ok("M5 no direction filter: both inbound and outbound are shown");
else
  fail("M5 /mirror must NOT filter on direction, it needs both sides");

// ---- M6: no truncation of the body. This is the whole reason the page exists ----
if (!/body[^\n]{0,40}\.slice\(/.test(mirror) && /whiteSpace: "pre-wrap"/.test(mirror))
  ok("M6 body rendered in full with pre-wrap (no slice, newlines preserved)");
else
  fail("M6 /mirror must render the full body with pre-wrap and never slice it");

// ---- M7: ONE source of truth for who the founder is ----
if (/export async function founderContactIds/.test(privacy)
    && /founderContactIds/.test(mirror)
    && /founderContactIds/.test(transcripts))
  ok("M7 both audit surfaces read founderContactIds from lib/privacy");
else
  fail("M7 founderContactIds must live in lib/privacy and be used by BOTH surfaces");

// ---- M8: the surfaces stay opposite. transcripts excludes, mirror includes ----
if (/\.not\("contact_id", "in"/.test(transcripts) && /\.in\("contact_id", nurIds\)/.test(mirror))
  ok("M8 transcripts EXCLUDES the founder, mirror INCLUDES only the founder");
else
  fail("M8 the two surfaces must stay complementary (exclude vs include)");

// ---- M9: the Dubai-midnight boundary fix is shared, not copy-pasted ----
// rangeStart encodes a real bug fix (server-local midnight is 04:00 Dubai on a
// UTC box). A page-local copy is how that bug returns.
if (/export async function rangeStart/.test(nowLib)
    && !/async function rangeStart/.test(transcripts)
    && !/async function rangeStart/.test(mirror))
  ok("M9 rangeStart lives only in lib/now.ts, not re-declared in any page");
else
  fail("M9 rangeStart must live in lib/now.ts and never be copied into a page");

// ---- M10: the owner-only tile is hidden from the founder, search included ----
// A tile that renders for the founder and bounces on click is a dead end, and a
// search box that surfaces it defeats the point of hiding it.
if (/ownerOnly\?: boolean/.test(launchpad)
    && /!a\.ownerOnly \|\| role === "builder"/.test(launchpad)
    && /visible\.filter\(\(a\) => a\.label/.test(launchpad))
  ok("M10 owner-only tiles are filtered from the grid AND from search");
else
  fail("M10 Launchpad must filter ownerOnly tiles by role for both grid and search");

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
