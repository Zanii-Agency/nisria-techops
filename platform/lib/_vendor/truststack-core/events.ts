import { randomUUID } from "node:crypto";

export interface TrustEvent {
  readonly id: string;
  readonly name: string;
  readonly occurredAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export type EventHandler = (event: TrustEvent) => void | Promise<void>;

export class EventBus {
  #handlers = new Map<string, Set<EventHandler>>();

  subscribe(name: string, handler: EventHandler): () => void {
    let set = this.#handlers.get(name);
    if (!set) {
      set = new Set();
      this.#handlers.set(name, set);
    }
    set.add(handler);
    return () => {
      const current = this.#handlers.get(name);
      current?.delete(handler);
      if (current && current.size === 0) this.#handlers.delete(name);
    };
  }

  async emit(name: string, payload: Record<string, unknown> = {}): Promise<TrustEvent> {
    const event: TrustEvent = Object.freeze({
      id: randomUUID(),
      name,
      occurredAt: new Date().toISOString(),
      payload: Object.freeze({ ...payload }),
    });
    const targets: EventHandler[] = [];
    const exact = this.#handlers.get(name);
    if (exact) targets.push(...exact);
    const wildcard = this.#handlers.get("*");
    if (wildcard) targets.push(...wildcard);
    await Promise.all(
      targets.map(async (h) => {
        try {
          await h(event);
        } catch {
        }
      })
    );
    return event;
  }
}
