// tz-convert.mjs — deterministic wall-clock conversion between IANA zones.
//
// Pure: no env, no I/O, no deps. Imported by BOTH the .ts call sites
// (smart-tools.ts) and the wall test (sasa-timezone-convert-wall) so the
// asserted behaviour and the shipped behaviour can never drift — the same
// agent-clock / whatsapp-format pattern already used in this repo.
//
// WHY THIS EXISTS (KT #206540, "deterministic route for actions, grounded LLM
// for understanding"): the model must NEVER do timezone math in its own head.
// It got Nairobi(UTC+3) -> Dubai(UTC+4) wrong (applied +2, said 14:00, the
// truth is 13:00) because timezone conversion is arithmetic, and the model is
// not a reliable calculator. Arithmetic lives in code. The model's only job is
// to report the time AS SPOKEN and name the zone it was spoken in.

// Offset (ms) of `tz` at a given UTC instant. Uses Intl so the offset comes
// from the IANA database, never a hardcoded integer — a hardcoded "+2" is
// exactly how this bug was born.
export function tzOffsetMs(instant, tz) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = {};
  for (const part of dtf.formatToParts(instant)) p[part.type] = part.value;
  const hour = p.hour === "24" ? "00" : p.hour; // some engines emit "24" at midnight
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +hour, +p.minute, +p.second);
  return asUTC - instant.getTime();
}

// Convert a wall-clock (`date` = YYYY-MM-DD, `time` = HH:MM) spoken in `fromTz`
// to the equivalent wall-clock in `toTz`. Returns { date, time } as strings —
// the date can roll over (e.g. a late Nairobi time can be the next day in a
// zone further east, or the prior day going west).
//
// Exact for fixed-offset zones (Africa/Nairobi, Asia/Dubai — neither observes
// DST). For DST zones it is exact except inside the ~1h/yr fold/gap, which is
// acceptable for human calendar entry.
export function convertWallClock(date, time, fromTz, toTz) {
  // Treat the wall-clock as if it were UTC, then subtract fromTz's offset at
  // that instant to recover the true UTC instant.
  const guess = new Date(`${date}T${time}:00Z`);
  if (Number.isNaN(guess.getTime())) return { date, time }; // malformed -> pass through; caller validates shape
  const instant = new Date(guess.getTime() - tzOffsetMs(guess, fromTz));
  const out = new Intl.DateTimeFormat("en-CA", {
    timeZone: toTz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const p = {};
  for (const part of out.formatToParts(instant)) p[part.type] = part.value;
  const hour = p.hour === "24" ? "00" : p.hour;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${hour}:${p.minute}` };
}
