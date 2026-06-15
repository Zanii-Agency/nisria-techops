/**
 * Time-source abstraction for `@zanii/agent-clock`.
 *
 * A `TimeSource` is anything that hands back a JS `Date` representing "now".
 * In JS every `Date` is implicitly UTC-anchored (no naive datetimes exist),
 * so the "must be tz-aware" rule from the Python port maps to:
 *   - it must be a real `Date` instance, and
 *   - it must not be `Invalid Date`.
 */

export interface TimeSource {
  now(): Date;
}

/** Reads the real system clock. */
export class SystemTimeSource implements TimeSource {
  now(): Date {
    return new Date();
  }
}

/**
 * Deterministic source that always returns a fixed instant.
 *
 * Rejects anything that is not a real, valid `Date` instance, mirroring the
 * Python "must be timezone-aware" guard.
 */
export class FrozenTimeSource implements TimeSource {
  #fixed: Date;

  constructor(fixed: Date) {
    if (!(fixed instanceof Date) || Number.isNaN(fixed.getTime())) {
      throw new Error("FrozenTimeSource requires a valid Date instance");
    }
    this.#fixed = new Date(fixed.getTime());
  }

  get fixed(): Date {
    return new Date(this.#fixed.getTime());
  }

  /** Move the frozen instant forward (or backward) by `seconds`. */
  advance(options: { seconds: number }): void {
    this.#fixed = new Date(this.#fixed.getTime() + options.seconds * 1000);
  }

  now(): Date {
    return new Date(this.#fixed.getTime());
  }
}

/**
 * Source backed by a user-supplied `fetcher` returning the current instant.
 *
 * Extension point for *trusted* external clocks (NTP, HTTPS `Date` header,
 * roughtime, ...). The library performs no network I/O itself.
 *
 * Fails toward distrust: if the fetcher returns anything that is not a real,
 * valid `Date`, `now()` throws rather than silently substituting an
 * unverified local clock.
 */
export class CallableTimeSource implements TimeSource {
  readonly #fetcher: () => Date;

  constructor(fetcher: () => Date) {
    if (typeof fetcher !== "function") {
      throw new TypeError("CallableTimeSource requires a callable fetcher");
    }
    this.#fetcher = fetcher;
  }

  now(): Date {
    const moment = this.#fetcher();
    if (!(moment instanceof Date)) {
      throw new Error(
        `CallableTimeSource fetcher must return a Date, got ${typeof moment}`,
      );
    }
    if (Number.isNaN(moment.getTime())) {
      throw new Error(
        "CallableTimeSource fetcher must return a valid Date",
      );
    }
    return moment;
  }
}

/**
 * Resolve `timezone` to a concrete IANA zone identifier.
 *
 * `undefined` / `null` auto-detects via `Intl.DateTimeFormat().resolvedOptions().timeZone`.
 * A non-empty string is validated against the Intl runtime and returned as-is.
 * Throws if the runtime does not recognise the zone.
 */
export function resolveTimezone(timezone?: string | null): string {
  if (timezone === undefined || timezone === null) {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return resolved || "UTC";
  }
  if (typeof timezone !== "string" || timezone.length === 0) {
    throw new Error(`Unknown timezone: ${JSON.stringify(timezone)}`);
  }
  try {
    // Throws RangeError on unknown zone.
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    throw new Error(`Unknown timezone: ${JSON.stringify(timezone)}`);
  }
  return timezone;
}
