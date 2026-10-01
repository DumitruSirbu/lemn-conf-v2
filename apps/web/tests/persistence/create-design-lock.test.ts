// M7 wave 7E3b S6 (ADR 0114 Amendment H6, D2): `withCreateDesignLock` itself, isolated from
// `FetchConfigurationRepository` — that file's own tests assert it is wired into `mint()`, never
// a save, a load or a share call; these assert the lock primitive's own contract (S6 criteria 2/3).
import { afterEach, describe, expect, it, vi } from "vitest";

import { withCreateDesignLock } from "../../src/persistence/create-design-lock";

/** A `navigator.locks`-shaped fake, exclusive-mode only (the one mode this module ever requests).
 *  Grants immediately when free; otherwise queues, FIFO, and grants the next waiter only once the
 *  holder's own callback has settled — the same ordering guarantee the real API makes. An aborted
 *  signal while queued rejects that waiter with the same `AbortError` the real API raises, without
 *  disturbing the holder or the rest of the queue. */
class FakeLockManager {
  private held = false;
  private readonly queue: (() => void)[] = [];

  async request<T>(
    name: string,
    options: { readonly mode: "exclusive"; readonly signal: AbortSignal },
    callback: () => Promise<T>,
  ): Promise<T> {
    await this.acquire(options.signal);
    try {
      return await callback();
    } finally {
      this.release();
    }
  }

  private acquire(signal: AbortSignal): Promise<void> {
    if (!this.held) {
      this.held = true;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const grant = (): void => {
        signal.removeEventListener("abort", onAbort);
        this.held = true;
        resolve();
      };
      const onAbort = (): void => {
        const index = this.queue.indexOf(grant);
        if (index !== -1) this.queue.splice(index, 1);
        reject(new DOMException("The request was aborted.", "AbortError"));
      };
      signal.addEventListener("abort", onAbort);
      this.queue.push(grant);
    });
  }

  private release(): void {
    this.held = false;
    const next = this.queue.shift();
    if (next) next();
  }
}

/** Resolves and rejects only when told to — every "started but not yet settled" assertion in this
 *  file needs one. */
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("withCreateDesignLock", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("runs immediately, unlocked, when navigator.locks is absent (S6 criterion 3)", async () => {
    vi.stubGlobal("navigator", {});
    let started = false;

    const result = await withCreateDesignLock(() => {
      started = true;
      return Promise.resolve("unlocked");
    });

    expect(started).toBe(true);
    expect(result).toBe("unlocked");
  });

  it("runs immediately, unlocked, when navigator itself is absent (a non-browser caller)", async () => {
    vi.stubGlobal("navigator", undefined);

    await expect(
      withCreateDesignLock(() => Promise.resolve("ok")),
    ).resolves.toBe("ok");
  });

  // S6 criterion 2 (serialisation) is proved against Node's own real `LockManager`, not this
  // file's fake, in `qa-7e3b-create-design-lock-real-locks.adversarial.test.ts` (QA round 2,
  // finding Q9): a single `await Promise.resolve()` here could not tell "the second run waited"
  // from "the fake granted it a tick sooner than the real API ever would", so a version of this
  // test once stayed green against a `withCreateDesignLock` that released the lock as soon as the
  // held run *started* rather than once it *settled*. Removed rather than patched, so nothing in
  // this file claims a property only the real-lock suite actually holds it to.

  it("a request held longer than the acquire timeout proceeds unlocked, without waiting for the holder (S6 criterion 3)", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", { locks: new FakeLockManager() });
    const holder = deferred<string>();

    // Never resolved in this test — the point is that the *waiter* gives up, not that the holder
    // ever finishes.
    const holderCall = withCreateDesignLock(() => holder.promise);
    await vi.advanceTimersByTimeAsync(0);

    let waiterStarted = false;
    const waiterCall = withCreateDesignLock(() => {
      waiterStarted = true;
      return Promise.resolve("unlocked-after-timeout");
    });

    await vi.advanceTimersByTimeAsync(9_999);
    expect(waiterStarted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await expect(waiterCall).resolves.toBe("unlocked-after-timeout");
    expect(waiterStarted).toBe(true);

    holder.resolve("held");
    await holderCall;
  });

  it("propagates an error the locked run throws, rather than swallowing or retrying it", async () => {
    vi.stubGlobal("navigator", { locks: new FakeLockManager() });
    const failure = new Error("mint failed inside the lock");

    await expect(
      withCreateDesignLock(() => Promise.reject(failure)),
    ).rejects.toBe(failure);
  });

  it("releases the lock when the held run throws, so the next request is still granted", async () => {
    vi.stubGlobal("navigator", { locks: new FakeLockManager() });

    await expect(
      withCreateDesignLock(() => Promise.reject(new Error("first fails"))),
    ).rejects.toThrow("first fails");

    let secondStarted = false;
    await withCreateDesignLock(() => {
      secondStarted = true;
      return Promise.resolve("second");
    });

    expect(secondStarted).toBe(true);
  });
});
