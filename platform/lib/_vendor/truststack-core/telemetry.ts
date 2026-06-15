export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEvent {
  level: LogLevel;
  component: string;
  message: string;
  fields?: Record<string, unknown>;
}

export interface SpanRecord {
  name: string;
  component: string;
  durationMs: number;
  ok: boolean;
  error?: { name: string; message: string };
  attributes?: Record<string, unknown>;
}

export interface TelemetrySink {
  log(event: LogEvent): void;
  span(record: SpanRecord): void;
}

export class ConsoleTelemetrySink implements TelemetrySink {
  log(event: LogEvent): void {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...event });
    if (event.level === "error" || event.level === "warn") {
      console.error(line);
    } else {
      console.log(line);
    }
  }
  span(record: SpanRecord): void {
    console.log(JSON.stringify({ ts: new Date().toISOString(), kind: "span", ...record }));
  }
}

export class NullTelemetrySink implements TelemetrySink {
  log(): void {}
  span(): void {}
}

let GLOBAL_SINK: TelemetrySink = new NullTelemetrySink();

export function setGlobalTelemetry(sink: TelemetrySink): void {
  GLOBAL_SINK = sink;
}

export function getGlobalTelemetry(): TelemetrySink {
  return GLOBAL_SINK;
}

export function traced<TArgs extends unknown[], TResult>(
  spanName: string,
  component: string,
  fn: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    const start = performance.now();
    try {
      const result = await fn(...args);
      GLOBAL_SINK.span({
        name: spanName,
        component,
        durationMs: performance.now() - start,
        ok: true,
      });
      return result;
    } catch (err) {
      const e = err as Error;
      GLOBAL_SINK.span({
        name: spanName,
        component,
        durationMs: performance.now() - start,
        ok: false,
        error: { name: e.name, message: e.message },
      });
      throw err;
    }
  };
}
