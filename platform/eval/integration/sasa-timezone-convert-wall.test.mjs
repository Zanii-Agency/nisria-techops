#!/usr/bin/env node
// Sasa timezone-convert wall (Nairobi <-> Dubai bug, 2026-06-22).
//
// Nur saw Sasa say a 12:00 PM Nairobi Zoom call was "2:00 PM Dubai time" and
// store it at 14:00. Dubai (UTC+4) is exactly 1 hour ahead of Nairobi (UTC+3),
// all year (neither observes DST). 12:00 Nairobi = 13:00 Dubai, NOT 14:00.
//
// Root cause: the model did the conversion in its own head and applied +2.
// Fix: code converts deterministically via lib/tz-convert.mjs; the model only
// reports the time as-spoken + the source zone. This wall pins the arithmetic
// so a future regression (or a model that "helpfully" converts) fails here.
//
// Pure local. No DB, no Anthropic spend, no network.

import { convertWallClock, tzOffsetMs } from "../../lib/tz-convert.mjs";

const NAIROBI = "Africa/Nairobi";
const DUBAI = "Asia/Dubai";

const tests = [];
function check(name, fn) {
  tests.push({ name, fn });
}
function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) return `${label}: expected ${e}, got ${a}`;
  return null;
}

// ─── the exact reported bug ────────────────────────────────────────────────

check("12:00 Nairobi -> 13:00 Dubai (the bug Nur caught, NOT 14:00)", () => {
  const r = convertWallClock("2026-06-23", "12:00", NAIROBI, DUBAI);
  return eq(r, { date: "2026-06-23", time: "13:00" }, "Mwangi call");
});

check("explicitly NOT 14:00 (the +2 mistake)", () => {
  const r = convertWallClock("2026-06-23", "12:00", NAIROBI, DUBAI);
  if (r.time === "14:00") return "regressed to the +2 bug: produced 14:00";
  return null;
});

// ─── offset sanity: the gap is exactly 1 hour, always ──────────────────────

check("Dubai is exactly 1h ahead of Nairobi (fixed-offset, no DST)", () => {
  // Pick a winter and a summer instant; the gap must be 3,600,000 ms both times.
  for (const iso of ["2026-01-15T09:00:00Z", "2026-07-15T09:00:00Z"]) {
    const inst = new Date(iso);
    const gap = tzOffsetMs(inst, DUBAI) - tzOffsetMs(inst, NAIROBI);
    if (gap !== 60 * 60 * 1000) return `gap at ${iso} was ${gap}ms, expected 3600000`;
  }
  return null;
});

// ─── reverse direction ─────────────────────────────────────────────────────

check("13:00 Dubai -> 12:00 Nairobi (round-trips)", () => {
  const r = convertWallClock("2026-06-23", "13:00", DUBAI, NAIROBI);
  return eq(r, { date: "2026-06-23", time: "12:00" }, "reverse");
});

// ─── idempotence: same zone is a no-op (protects the common Dubai path) ─────

check("Dubai -> Dubai is a no-op", () => {
  const r = convertWallClock("2026-06-23", "14:00", DUBAI, DUBAI);
  return eq(r, { date: "2026-06-23", time: "14:00" }, "same-zone");
});

// ─── date rollover across midnight ─────────────────────────────────────────

check("late Nairobi time rolls the Dubai date forward", () => {
  // 23:30 Nairobi = 00:30 Dubai the NEXT day.
  const r = convertWallClock("2026-06-23", "23:30", NAIROBI, DUBAI);
  return eq(r, { date: "2026-06-24", time: "00:30" }, "rollover fwd");
});

check("early Dubai time rolls the Nairobi date back", () => {
  // 00:30 Dubai = 23:30 Nairobi the PRIOR day.
  const r = convertWallClock("2026-06-23", "00:30", DUBAI, NAIROBI);
  return eq(r, { date: "2026-06-22", time: "23:30" }, "rollover back");
});

// ─── malformed input passes through (caller validates HH:MM shape) ─────────

check("malformed time passes through untouched", () => {
  const r = convertWallClock("2026-06-23", "not-a-time", NAIROBI, DUBAI);
  return eq(r, { date: "2026-06-23", time: "not-a-time" }, "malformed");
});

// ─── run ───────────────────────────────────────────────────────────────────

let failed = 0;
for (const t of tests) {
  let err = null;
  try {
    err = t.fn();
  } catch (e) {
    err = `threw: ${e?.message || e}`;
  }
  if (err) {
    failed++;
    console.log(`  FAIL  ${t.name}\n        ${err}`);
  } else {
    console.log(`  PASS  ${t.name}`);
  }
}

console.log(`\nsasa-timezone-convert-wall: ${tests.length - failed}/${tests.length} passed`);
if (failed > 0) {
  console.log("WALL RED");
  process.exit(1);
}
console.log("WALL GREEN");
process.exit(0);
