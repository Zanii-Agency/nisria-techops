/**
 * The `ClockInjector`, the heart of `@zanii/agent-clock`.
 *
 * Renders a trusted moment in time and prepends it to prompts so an LLM always
 * knows the real "now" instead of hallucinating a stale training-cutoff date.
 */

import {
  BaseTrustComponent,
  HealthState,
  type HealthStatus,
} from "../truststack-core/index.js";

import {
  TimeFormat,
  Weekday,
  weekdayFromMondayIndex,
  type TrustedTime,
} from "./models.js";
import {
  SystemTimeSource,
  resolveTimezone,
  type TimeSource,
} from "./sources.js";

const TRUSTED_BLOCK_HEADER = "Current trusted datetime:";
const USER_REQUEST_HEADER = "User requests:";

const MONTH_NAMES: readonly string[] = [
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

interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** Weekday with Monday=0 (Python convention). */
  mondayWeekday: number;
  /** Short tz name as produced by Intl, e.g. "GMT+4" or "EDT". */
  shortName: string;
  /** Offset minutes from UTC, positive east of UTC. */
  offsetMinutes: number;
}

/**
 * Extract calendar parts of `instant` as observed in `timeZone`, including the
 * UTC offset and the short tz-name string.
 */
function getZonedParts(instant: Date, timeZone: string): ZonedParts {
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

  const get = (type: string): string => {
    const p = parts.find((x) => x.type === type);
    return p ? p.value : "";
  };

  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  // h23 returns 00-23, but at midnight some runtimes emit "24", clamp.
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  const minute = Number(get("minute"));
  const second = Number(get("second"));
  const weekdayName = get("weekday");
  const shortName = get("timeZoneName");

  // Map English weekday name to Monday=0 index.
  const enToMondayIdx: Readonly<Record<string, number>> = {
    Monday: 0,
    Tuesday: 1,
    Wednesday: 2,
    Thursday: 3,
    Friday: 4,
    Saturday: 5,
    Sunday: 6,
  };
  const mondayWeekday = enToMondayIdx[weekdayName] ?? 0;

  // Compute UTC offset: build a UTC timestamp from these civil parts, compare
  // to the actual instant.
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMinutes = Math.round((asUtc - instant.getTime()) / 60000);

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    mondayWeekday,
    shortName,
    offsetMinutes,
  };
}

/**
 * Format a UTC offset in minutes as a signed `+HH:MM` string.
 */
function formatOffset(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const total = Math.abs(offsetMinutes);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Convert an Intl short tz-name into the Python `tzname()`-style abbreviation.
 *
 * Python's `zoneinfo` returns:
 *   - For modern fixed-offset zones (Asia/Dubai etc.): `"+04"`, `"+0530"`.
 *   - For zones with traditional abbreviations (New York, London): `"EDT"`, `"GMT"`, `"BST"`.
 *
 * Intl returns:
 *   - For Asia/Dubai: `"GMT+4"`.
 *   - For America/New_York summer: `"EDT"`.
 *   - For UTC: `"UTC"`.
 *
 * We normalise: if the short name matches `GMT[+-]offset`, rewrite to Python
 * format. Otherwise return as-is.
 */
function pythonTzname(shortName: string, offsetMinutes: number): string {
  if (!shortName) {
    return formatOffsetCompact(offsetMinutes);
  }
  // Match "GMT+4", "GMT-4", "GMT+5:30", "UTC+4" patterns.
  const m = /^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(shortName);
  if (m) {
    const sign = m[1] as "+" | "-";
    const hours = Number(m[2]);
    const minutes = m[3] !== undefined ? Number(m[3]) : 0;
    if (minutes === 0) {
      return `${sign}${String(hours).padStart(2, "0")}`;
    }
    return `${sign}${String(hours).padStart(2, "0")}${String(minutes).padStart(2, "0")}`;
  }
  // Bare "GMT" → "UTC" alias from Intl for UTC zone.
  if (shortName === "GMT") {
    return "UTC";
  }
  return shortName;
}

function formatOffsetCompact(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const total = Math.abs(offsetMinutes);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (minutes === 0) {
    return `${sign}${String(hours).padStart(2, "0")}`;
  }
  return `${sign}${String(hours).padStart(2, "0")}${String(minutes).padStart(2, "0")}`;
}

function localIsoString(parts: ZonedParts): string {
  const offset = formatOffset(parts.offsetMinutes);
  const y = String(parts.year).padStart(4, "0");
  const mo = String(parts.month).padStart(2, "0");
  const d = String(parts.day).padStart(2, "0");
  const h = String(parts.hour).padStart(2, "0");
  const mi = String(parts.minute).padStart(2, "0");
  const s = String(parts.second).padStart(2, "0");
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${offset}`;
}

export interface ClockInjectorOptions {
  /** IANA timezone name (e.g. `"Asia/Dubai"`). Defaults to system local. */
  readonly timezone?: string | null;
  /** Source of the current instant. Defaults to `SystemTimeSource`. */
  readonly timeSource?: TimeSource;
  /** Presentation options for the rendered time line. */
  readonly timeFormat?: TimeFormat;
}

/**
 * Render trusted temporal context and inject it into prompts.
 *
 * @example
 *   const clock = new ClockInjector({ timezone: "Asia/Dubai" });
 *   console.log(clock.inject("What day is it tomorrow?"));
 */
export class ClockInjector extends BaseTrustComponent {
  static readonly COMPONENT_NAME = "agent-clock";
  static readonly COMPONENT_VERSION = "0.1.0";

  readonly #timezone: string;
  readonly #source: TimeSource;
  readonly #timeFormat: TimeFormat;

  constructor(options: ClockInjectorOptions = {}) {
    super(ClockInjector.COMPONENT_NAME, ClockInjector.COMPONENT_VERSION);
    this.#timezone = resolveTimezone(options.timezone ?? null);
    this.#source = options.timeSource ?? new SystemTimeSource();
    this.#timeFormat = options.timeFormat ?? new TimeFormat();
  }

  /** The resolved display timezone (IANA name). */
  get timezone(): string {
    return this.#timezone;
  }

  /** The presentation options used to render the time line. */
  get timeFormat(): TimeFormat {
    return this.#timeFormat;
  }

  /** Render the current trusted moment as a `TrustedTime`. */
  render(): TrustedTime {
    const instant = this.#source.now();
    if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) {
      throw new Error("TimeSource.now() must return a valid Date");
    }

    const parts = getZonedParts(instant, this.#timezone);
    const abbreviation = pythonTzname(parts.shortName, parts.offsetMinutes);
    const monthName = MONTH_NAMES[parts.month - 1];
    const weekday = weekdayFromMondayIndex(parts.mondayWeekday);

    const dateLine = `${weekday} ${monthName} ${parts.day} ${parts.year}`;
    const timeLine = `${this.#timeFormat.formatTime({
      hour: parts.hour,
      minute: parts.minute,
      second: parts.second,
    })} ${abbreviation}`;

    const trusted: TrustedTime = Object.freeze({
      humanReadable: `${dateLine}\n${timeLine}`,
      dateLine,
      timeLine,
      utcIso: instant.toISOString(),
      localIso: localIsoString(parts),
      timezone: this.#timezone,
      utcOffset: formatOffset(parts.offsetMinutes),
      weekday,
      abbreviation,
      epoch: instant.getTime() / 1000,
    });

    // BaseTrustComponent in @zanii/truststack-core exposes a protected
    // `registry` of type MetricRegistry (incr / set / snapshot).
    // Access via the parent class binding.
    this.recordRender(trusted.epoch);
    return trusted;
  }

  private recordRender(epoch: number): void {
    // `registry` is a protected field on BaseTrustComponent.
    // TypeScript with `protected` allows subclass access through `this`.
    const reg = (this as unknown as { registry: { incr: (n: string, by?: number) => void; set: (n: string, v: number) => void } }).registry;
    reg.incr("renders");
    reg.set("last_epoch", epoch);
  }

  private recordInjection(): void {
    const reg = (this as unknown as { registry: { incr: (n: string, by?: number) => void } }).registry;
    reg.incr("injections");
  }

  /** Return the formatted `Current trusted datetime:` block as a string. */
  block(trusted?: TrustedTime): string {
    const t = trusted ?? this.render();
    return (
      `${TRUSTED_BLOCK_HEADER}\n` +
      `${t.dateLine}\n` +
      `${t.timeLine}\n` +
      `Timezone: ${t.timezone}\n` +
      `UTC Offset: ${t.utcOffset}`
    );
  }

  /**
   * Prepend the trusted-time block to `prompt` and return the new prompt.
   *
   * Output is the block, a blank line, then `User requests:` followed by
   * the original prompt.
   */
  inject(prompt: string): string {
    const trusted = this.render();
    const result = this.compose(prompt, trusted);
    this.recordInjection();
    return result;
  }

  /** Async variant of `inject`. (Symmetry with the Python `ainject` API.) */
  async ainject(prompt: string): Promise<string> {
    return this.inject(prompt);
  }

  private compose(prompt: string, trusted: TrustedTime): string {
    return `${this.block(trusted)}\n\n${USER_REQUEST_HEADER}\n${prompt}`;
  }

  protected async _checkHealth(): Promise<Omit<HealthStatus, "checkedAt">> {
    try {
      this.render();
    } catch (exc) {
      return {
        component: this.componentName,
        state: HealthState.UNHEALTHY,
        detail: `clock render failed: ${(exc as Error).message}`,
      };
    }
    return {
      component: this.componentName,
      state: HealthState.HEALTHY,
      detail: `zone=${this.#timezone}`,
    };
  }
}
