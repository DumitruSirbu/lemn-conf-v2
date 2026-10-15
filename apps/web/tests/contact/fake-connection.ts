import type {
  ConnectionEvent,
  ConnectionPort,
} from "@/contact/retry-when-online";

/** A connection the test moves: `online` and `offline` are fired by the test, and listeners are counted by event. */
export class FakeConnection implements ConnectionPort {
  private isConnected = true;
  /** A listener that is not let go when asked, as one is not between an answer and the page drawing it. */
  private readonly keepsLeftListeners: boolean;
  private readonly listeners: Record<ConnectionEvent, Set<() => void>> = {
    online: new Set(),
    offline: new Set(),
  };

  constructor(options: { readonly keepsLeftListeners?: boolean } = {}) {
    this.keepsLeftListeners = options.keepsLeftListeners ?? false;
  }

  readonly isOnline = (): boolean => this.isConnected;

  readonly listen = (
    event: ConnectionEvent,
    listener: () => void,
  ): (() => void) => {
    this.listeners[event].add(listener);
    return () => {
      if (!this.keepsLeftListeners) this.listeners[event].delete(listener);
    };
  };

  listenerCount(event: ConnectionEvent): number {
    return this.listeners[event].size;
  }

  /** Fires the event as the browser does, once for each listener, and does it outside any `act`. */
  fire(event: ConnectionEvent): void {
    this.isConnected = event === "online";
    [...this.listeners[event]].forEach((listener) => {
      listener();
    });
  }
}
