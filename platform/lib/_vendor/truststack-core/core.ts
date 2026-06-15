export const HealthState = {
  HEALTHY: "healthy",
  DEGRADED: "degraded",
  UNHEALTHY: "unhealthy",
} as const;

export type HealthState = (typeof HealthState)[keyof typeof HealthState];

export interface HealthStatus {
  readonly component: string;
  readonly state: HealthState;
  readonly detail?: string;
  readonly checkedAt: string;
}

export interface ComponentMetrics {
  readonly component: string;
  readonly counters: Readonly<Record<string, number>>;
  readonly gauges: Readonly<Record<string, number>>;
  readonly capturedAt: string;
}

export class MetricRegistry {
  #counters = new Map<string, number>();
  #gauges = new Map<string, number>();

  incr(name: string, by = 1): void {
    this.#counters.set(name, (this.#counters.get(name) ?? 0) + by);
  }

  set(name: string, value: number): void {
    this.#gauges.set(name, value);
  }

  snapshot(component: string): ComponentMetrics {
    return Object.freeze({
      component,
      counters: Object.freeze(Object.fromEntries(this.#counters)),
      gauges: Object.freeze(Object.fromEntries(this.#gauges)),
      capturedAt: new Date().toISOString(),
    });
  }
}

export abstract class BaseTrustComponent {
  readonly componentName: string;
  readonly componentVersion: string;
  protected readonly registry = new MetricRegistry();

  constructor(componentName: string, componentVersion = "0.1.0") {
    this.componentName = componentName;
    this.componentVersion = componentVersion;
  }

  protected abstract _checkHealth(): Promise<Omit<HealthStatus, "checkedAt">>;

  async healthCheck(): Promise<HealthStatus> {
    const status = await this._checkHealth();
    return Object.freeze({ ...status, checkedAt: new Date().toISOString() });
  }

  metrics(): ComponentMetrics {
    return this.registry.snapshot(this.componentName);
  }

  version(): string {
    return this.componentVersion;
  }
}
