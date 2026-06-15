// Test-runtime ESM twin of @zanii/agent-clock ClockInjector (KT #283).
//
// Why this exists: Next/Vercel resolve .ts via the bundler, but our
// node-native test runner (node --test) cannot import .ts. tsx is not in
// devDeps and the brief said do not add new devDeps without flagging.
// The brief's explicit fallback was "pre-built .js". This file IS that.
//
// Surface kept tight: ClockInjector with constructor + .render() + .block().
// Anything else used in prod (telemetry, healthCheck, inject, ainject) is
// out of scope because the eval test only validates the block() contract.
// Logic mirrors lib/_vendor/agent-clock/injector.ts byte for byte for the
// covered surface. When the .ts is updated, update this twin in lockstep.

const TRUSTED_BLOCK_HEADER = "Current trusted datetime:";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAY_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function getZonedParts(instant, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
  const parts = fmt.formatToParts(instant);
  const get = (type) => {
    const p = parts.find((x) => x.type === type);
    return p ? p.value : "";
  };
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  const minute = Number(get("minute"));
  const second = Number(get("second"));
  const weekdayName = get("weekday");
  const shortName = get("timeZoneName");
  const enToMondayIdx = {
    Monday: 0,
    Tuesday: 1,
    Wednesday: 2,
    Thursday: 3,
    Friday: 4,
    Saturday: 5,
    Sunday: 6,
  };
  const mondayWeekday = enToMondayIdx[weekdayName] ?? 0;
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMinutes = Math.round((asUtc - instant.getTime()) / 60000);
  return { year, month, day, hour, minute, second, mondayWeekday, shortName, offsetMinutes };
}

function formatOffset(offsetMinutes) {
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const total = Math.abs(offsetMinutes);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatOffsetCompact(offsetMinutes) {
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const total = Math.abs(offsetMinutes);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (minutes === 0) return `${sign}${String(hours).padStart(2, "0")}`;
  return `${sign}${String(hours).padStart(2, "0")}${String(minutes).padStart(2, "0")}`;
}

function pythonTzname(shortName, offsetMinutes) {
  if (!shortName) return formatOffsetCompact(offsetMinutes);
  const m = /^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(shortName);
  if (m) {
    const sign = m[1];
    const hours = Number(m[2]);
    const minutes = m[3] !== undefined ? Number(m[3]) : 0;
    if (minutes === 0) return `${sign}${String(hours).padStart(2, "0")}`;
    return `${sign}${String(hours).padStart(2, "0")}${String(minutes).padStart(2, "0")}`;
  }
  if (shortName === "GMT") return "UTC";
  return shortName;
}

function resolveTimezone(timezone) {
  if (timezone === undefined || timezone === null) {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return resolved || "UTC";
  }
  if (typeof timezone !== "string" || timezone.length === 0) {
    throw new Error(`Unknown timezone: ${JSON.stringify(timezone)}`);
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    throw new Error(`Unknown timezone: ${JSON.stringify(timezone)}`);
  }
  return timezone;
}

export class ClockInjector {
  #timezone;
  #source;

  constructor(options = {}) {
    this.#timezone = resolveTimezone(options.timezone ?? null);
    this.#source = options.timeSource ?? { now: () => new Date() };
  }

  get timezone() {
    return this.#timezone;
  }

  render() {
    const instant = this.#source.now();
    if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) {
      throw new Error("TimeSource.now() must return a valid Date");
    }
    const parts = getZonedParts(instant, this.#timezone);
    const abbreviation = pythonTzname(parts.shortName, parts.offsetMinutes);
    const monthName = MONTH_NAMES[parts.month - 1];
    const weekday = WEEKDAY_ORDER[parts.mondayWeekday];
    const dateLine = `${weekday} ${monthName} ${parts.day} ${parts.year}`;
    const hh = String(parts.hour).padStart(2, "0");
    const mm = String(parts.minute).padStart(2, "0");
    const timeLine = `${hh}:${mm} ${abbreviation}`;
    return Object.freeze({
      dateLine,
      timeLine,
      timezone: this.#timezone,
      utcOffset: formatOffset(parts.offsetMinutes),
      weekday,
      abbreviation,
      epoch: instant.getTime() / 1000,
    });
  }

  block(trusted) {
    const t = trusted ?? this.render();
    return (
      `${TRUSTED_BLOCK_HEADER}\n` +
      `${t.dateLine}\n` +
      `${t.timeLine}\n` +
      `Timezone: ${t.timezone}\n` +
      `UTC Offset: ${t.utcOffset}`
    );
  }
}
