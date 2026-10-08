import { describe, expect, it } from "vitest";

import { FakeRateLimitStore } from "../src/fake-rate-limit-store.js";

/**
 * Adversarial QA of M8 wave 8E: what the fake does where the shared contract suite is silent. The live file asks the
 * Neon store the same question about a second caller's end, and the two must agree.
 */
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const KEY = "c".repeat(64);
const STARTS_AT = new Date("1990-06-01T00:00:00.000Z");
const HOUR = {
  startsAt: STARTS_AT,
  endsAt: new Date(STARTS_AT.getTime() + HOUR_MS),
};
const DAY = {
  startsAt: STARTS_AT,
  endsAt: new Date(STARTS_AT.getTime() + DAY_MS),
};

describe("QA 8E: FakeRateLimitStore beyond the shared contract", () => {
  it("keeps a live window's count when a second caller stated a shorter end for the same key and start", async () => {
    const store = new FakeRateLimitStore();
    await store.recordHits([{ key: KEY, window: HOUR }]);
    await store.recordHits([{ key: KEY, window: DAY }]);

    await store.pruneExpired(HOUR.endsAt);
    const [dayCountAfterThePrune] = await store.recordHits([
      { key: KEY, window: DAY },
    ]);

    // The day window is live at the hour's end, so criterion 5 says the prune leaves it and its count goes on.
    expect(dayCountAfterThePrune).toBeGreaterThan(1);
  });

  it("keeps the first caller's end when a later one is shorter, as the Neon store does", async () => {
    const store = new FakeRateLimitStore();
    await store.recordHits([{ key: KEY, window: DAY }]);
    await store.recordHits([{ key: KEY, window: HOUR }]);

    const removedAtTheHoursEnd = await store.pruneExpired(HOUR.endsAt);
    const removedAtTheDaysEnd = await store.pruneExpired(DAY.endsAt);

    expect([removedAtTheHoursEnd, removedAtTheDaysEnd]).toEqual([0, 1]);
  });

  it("reads a window's instants when the hit is recorded, not when the caller's dates change later", async () => {
    const store = new FakeRateLimitStore();
    const window = {
      startsAt: new Date(STARTS_AT),
      endsAt: new Date(HOUR.endsAt),
    };
    await store.recordHits([{ key: KEY, window }]);
    window.startsAt.setTime(STARTS_AT.getTime() + DAY_MS);
    window.endsAt.setTime(STARTS_AT.getTime() + 2 * DAY_MS);

    const counts = await store.recordHits([{ key: KEY, window: HOUR }]);
    const removed = await store.pruneExpired(HOUR.endsAt);

    expect([counts, removed]).toEqual([[2], 1]);
  });

  it("counts nothing of a request it refuses for its last bucket", async () => {
    const store = new FakeRateLimitStore();
    const good = { key: KEY, window: HOUR };

    await expect(
      store.recordHits([good, { key: "203.0.113.7", window: HOUR }]),
    ).rejects.toThrow(/Refusing/);

    expect(await store.recordHits([good])).toEqual([1]);
  });

  it("removes a window at its end and at no instant before, for every millisecond of the last ten", async () => {
    for (let early = 10; early >= 1; early -= 1) {
      const store = new FakeRateLimitStore();
      await store.recordHits([{ key: KEY, window: HOUR }]);

      const removedEarly = await store.pruneExpired(
        new Date(HOUR.endsAt.getTime() - early),
      );
      const removedAtTheEnd = await store.pruneExpired(HOUR.endsAt);

      expect([removedEarly, removedAtTheEnd]).toEqual([0, 1]);
    }
  });
});
