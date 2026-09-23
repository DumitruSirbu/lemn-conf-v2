// M7 wave 7E3b S6 adversarial QA (ADR 0114 Amendment H6): `withCreateDesignLock` against Node 24's
// **real** `LockManager`, which `tests/support/vitest.setup.ts` shadows for every other test. The
// fake in `create-design-lock.test.ts` encodes the Web Locks spec as its author read it; these hold
// the module to the implementation that actually ships, including the case the fake cannot
// disagree with by construction: the acquire timer firing *after* the lock was granted.
import { afterEach, describe, expect, it, vi } from "vitest";

import { withCreateDesignLock } from "../../src/persistence/create-design-lock";

/** Node's own `navigator.locks`: the setup file's own-property shadow is lifted just long enough
 *  to read the inherited getter, then put back exactly as it was. */
function realLockManager(): LockManager {
  const shadow = Object.getOwnPropertyDescriptor(navigator, "locks");
  Reflect.deleteProperty(navigator, "locks");
  const locks = navigator.locks as LockManager | undefined;
  if (shadow !== undefined) Object.defineProperty(navigator, "locks", shadow);
  if (locks === undefined) throw new Error("this Node has no navigator.locks");
  return locks;
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("withCreateDesignLock over Node's real LockManager", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("serialises two calls: the second run starts only after the first settles", async () => {
    vi.stubGlobal("navigator", { locks: realLockManager() });
    const order: string[] = [];
    const first = deferred<string>();

    const firstCall = withCreateDesignLock(async () => {
      order.push("first-started");
      const value = await first.promise;
      order.push("first-settled");
      return value;
    });
    const secondCall = withCreateDesignLock(() => {
      order.push("second-started");
      return Promise.resolve("second");
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(order).toEqual(["first-started"]);

    first.resolve("first");

    await expect(Promise.all([firstCall, secondCall])).resolves.toEqual([
      "first",
      "second",
    ]);
    expect(order).toEqual(["first-started", "first-settled", "second-started"]);
  });

  it("a granted run that outlives the 10 s acquire timer runs once — the late abort never triggers a second, unlocked mint", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal("navigator", { locks: realLockManager() });
    const held = deferred<string>();
    let runs = 0;

    const call = withCreateDesignLock(() => {
      runs += 1;
      return held.promise;
    });
    await vi.advanceTimersByTimeAsync(15_000);
    held.resolve("minted-once");

    await expect(call).resolves.toBe("minted-once");
    expect(runs).toBe(1);
  });

  it("a waiter behind a holder past 10 s runs unlocked, exactly once", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal("navigator", { locks: realLockManager() });
    const holder = deferred<string>();
    const holderCall = withCreateDesignLock(() => holder.promise);
    await vi.advanceTimersByTimeAsync(0);
    let waiterRuns = 0;

    const waiterCall = withCreateDesignLock(() => {
      waiterRuns += 1;
      return Promise.resolve("unlocked");
    });
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(waiterCall).resolves.toBe("unlocked");
    holder.resolve("held");
    await holderCall;
    await vi.advanceTimersByTimeAsync(0);
    expect(waiterRuns).toBe(1);
  });

  it("a thrown run releases the real lock and rethrows the same error", async () => {
    const locks = realLockManager();
    vi.stubGlobal("navigator", { locks });
    const failure = new Error("mint failed");

    await expect(
      withCreateDesignLock(() => Promise.reject(failure)),
    ).rejects.toBe(failure);
    const snapshot = await locks.query();

    expect(snapshot.held ?? []).toEqual([]);
    await expect(
      withCreateDesignLock(() => Promise.resolve("next")),
    ).resolves.toBe("next");
  });
});
