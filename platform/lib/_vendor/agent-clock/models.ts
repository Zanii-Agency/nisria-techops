/**
 * Models and enums for `@zanii/agent-clock`.
 *
 * `TrustedTime` is the central immutable snapshot of a single moment, rendered
 * in both human-friendly and machine-readable forms. It is what gets
 * serialised into prompts so the LLM can reason about "now" without guessing.
 */

/** Days of the week in ISO order (Monday=0 to match Python's datetime.weekday()). */
export const Weekday = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
} as const;

export type Weekday = (typeof Weekday)[keyof typeof Weekday];

const WEEKDAY_ORDER: readonly Weekday[] = [
  Weekday.MONDAY,
  Weekday.TUESDAY,
  Weekday.WEDNESDAY,
  Weekday.THURSDAY,
  Weekday.FRIDAY,
  Weekday.SATURDAY,
  Weekday.SUNDAY,
];

/**
 * Get the Weekday for a JS Date interpreted in a specific IANA zone.
 * The caller passes the weekday index where Monday=0 (Python convention).
 */
export function weekdayFromMondayIndex(mondayIndex: number): Weekday {
  const value = WEEKDAY_ORDER[mondayIndex];
  if (value === undefined) {
    throw new RangeError(`Invalid weekday index ${mondayIndex}`);
  }
  return value;
}

/** Clock options governing how the time line is rendered. */
export interface TimeFormatOptions {
  /** 24 (default) or 12 hour clock. */
  readonly hourClock?: 12 | 24;
  /** Include `:SS` in the rendered time. */
  readonly showSeconds?: boolean;
}

/**
 * Presentation options for the trusted-time line.
 *
 * Defaults reproduce the byte-identical output of the historical Python
 * rendering: `HH:MM <abbrev>` on a 24-hour clock with no seconds.
 */
export class TimeFormat {
  readonly hourClock: 12 | 24;
  readonly showSeconds: boolean;

  constructor(options: TimeFormatOptions = {}) {
    this.hourClock = options.hourClock ?? 24;
    this.showSeconds = options.showSeconds ?? false;
    Object.freeze(this);
  }

  get isDefault(): boolean {
    return this.hourClock === 24 && !this.showSeconds;
  }

  /**
   * Render the clock portion (without the zone abbreviation) for the given
   * parts. `parts` must already represent the moment in the desired zone.
   */
  formatTime(parts: {
    hour: number;
    minute: number;
    second: number;
  }): string {
    const { hour, minute, second } = parts;
    if (this.hourClock === 24) {
      const hh = String(hour).padStart(2, "0");
      const mm = String(minute).padStart(2, "0");
      if (this.showSeconds) {
        const ss = String(second).padStart(2, "0");
        return `${hh}:${mm}:${ss}`;
      }
      return `${hh}:${mm}`;
    }
    // 12-hour
    const period = hour >= 12 ? "PM" : "AM";
    let h12 = hour % 12;
    if (h12 === 0) h12 = 12;
    const hh = String(h12).padStart(2, "0");
    const mm = String(minute).padStart(2, "0");
    if (this.showSeconds) {
      const ss = String(second).padStart(2, "0");
      return `${hh}:${mm}:${ss} ${period}`;
    }
    return `${hh}:${mm} ${period}`;
  }
}

/** Immutable, fully-rendered view of a single trusted moment. */
export interface TrustedTime {
  /** Multi-line human form, e.g. "Wednesday June 10 2026\n17:55 +04". */
  readonly humanReadable: string;
  /** Date portion only, e.g. "Wednesday June 10 2026". */
  readonly dateLine: string;
  /** Time portion only, e.g. "17:55 +04". */
  readonly timeLine: string;
  /** Same instant in UTC as an ISO-8601 string. */
  readonly utcIso: string;
  /** Instant in the configured zone as ISO-8601 (with offset). */
  readonly localIso: string;
  /** IANA / zone label, e.g. "Asia/Dubai". */
  readonly timezone: string;
  /** Offset from UTC, e.g. "+04:00". */
  readonly utcOffset: string;
  /** Day of week for the local instant. */
  readonly weekday: Weekday;
  /** Zone abbreviation, e.g. "+04", "EDT", "UTC". */
  readonly abbreviation: string;
  /** POSIX timestamp (seconds since the Unix epoch). */
  readonly epoch: number;
}
