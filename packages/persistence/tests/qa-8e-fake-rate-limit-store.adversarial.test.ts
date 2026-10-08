import { describe, expect, it } from "vitest";

import { FakeRateLimitStore } from "../src/fake-rate-limit-store.js";
import { RateLimitWindowConflictError } from "../src/rate-limit-store.js";
import { markersFoundOn } from "./support/leaked-connection-markers.js";

/**
 * Adversarial QA of M8 wave 8E: what the fake does where the shared contract suite is silent. The live file asks the
 * Neon store the same question about a second caller's end, and the two must agree.
 */
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const KEY = "c".repeat(64);
const BYSTANDER_KEY = "d".repeat(64);
const STARTS_AT = new Date("1990-06-01T00:00:00.000Z");
const HOUR = {
  startsAt: STARTS_AT,
  endsAt: new Date(STARTS_AT.getTime() + HOUR_MS),
};
const DAY = {
  startsAt: STARTS_AT,
  endsAt: new Date(STARTS_AT.getTime() + DAY_MS),
};

function expectAConflictNamingNothing(refusal: unknown): void {
  expect(refusal).toBeInstanceOf(RateLimitWindowConflictError);
  expect((refusal as Error).cause).toBeUndefined();
  expect(
    markersFoundOn(refusal, [
      KEY,
      BYSTANDER_KEY,
      "1990",
      String(STARTS_AT.getTime()),
    ]),
  ).toEqual([]);
}

describe("QA 8E: FakeRateLimitStore beyond the shared contract", () => {
  it("refuses a shorter end than the stored one, counts no bucket of the request, and a prune at the shorter end removes nothing", async () => {
    const store = new FakeRateLimitStore();
    const stored = { key: KEY, window: DAY };
    const bystander = { key: BYSTANDER_KEY, window: HOUR };
    await store.recordHits([stored]);
    await store.recordHits([stored]);

    const refusal = await store
      .recordHits([bystander, { key: KEY, window: HOUR }])
      .catch((error: unknown) => error);
    const removedAtTheShorterEnd = await store.pruneExpired(HOUR.endsAt);
    const countsAfter = await store.recordHits([stored, bystander]);

    expectAConflictNamingNothing(refusal);
    expect(removedAtTheShorterEnd).toBe(0);
    expect(countsAfter).toEqual([3, 1]);
  });

  it("refuses a longer end than the stored one, counts no bucket of the request, and the stored window still expires at its own end", async () => {
    const store = new FakeRateLimitStore();
    const stored = { key: KEY, window: HOUR };
    const bystander = { key: BYSTANDER_KEY, window: DAY };
    await store.recordHits([stored]);
    await store.recordHits([stored]);

    const refusal = await store
      .recordHits([{ key: KEY, window: DAY }, bystander])
      .catch((error: unknown) => error);
    const countsAfter = await store.recordHits([stored]);
    const removedJustBeforeItsEnd = await store.pruneExpired(
      new Date(HOUR.endsAt.getTime() - 1),
    );
    const removedAtItsEnd = await store.pruneExpired(HOUR.endsAt);
    const bystanderCount = await store.recordHits([bystander]);

    expectAConflictNamingNothing(refusal);
    expect(countsAfter).toEqual([3]);
    expect([removedJustBeforeItsEnd, removedAtItsEnd]).toEqual([0, 1]);
    expect(bystanderCount).toEqual([1]);
  });

  it.each([-1, 1, HOUR_MS, 1 - HOUR_MS, 365 * DAY_MS])(
    "refuses an end %i ms from the stored one, and counts on from the stored count afterwards",
    async (differenceMs) => {
      const store = new FakeRateLimitStore();
      await store.recordHits([{ key: KEY, window: HOUR }]);
      const other = {
        startsAt: STARTS_AT,
        endsAt: new Date(HOUR.endsAt.getTime() + differenceMs),
      };

      const refusal = await store
        .recordHits([{ key: KEY, window: other }])
        .catch((error: unknown) => error);

      expectAConflictNamingNothing(refusal);
      expect(await store.recordHits([{ key: KEY, window: HOUR }])).toEqual([2]);
    },
  );

  it("gives the same error class and message as the Neon store's conflict, so a caller cannot tell the two apart", async () => {
    const store = new FakeRateLimitStore();
    await store.recordHits([{ key: KEY, window: HOUR }]);

    const refusal = await store
      .recordHits([{ key: KEY, window: DAY }])
      .catch((error: unknown) => error);

    expect((refusal as Error).message).toBe(
      new RateLimitWindowConflictError().message,
    );
    expect((refusal as Error).name).toBe("RateLimitWindowConflictError");
  });

  it("refuses an empty list as a plain refusal, and goes on counting from where it was", async () => {
    const store = new FakeRateLimitStore();
    await store.recordHits([{ key: KEY, window: HOUR }]);

    const refusal = await store.recordHits([]).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(Error);
    expect(refusal).not.toBeInstanceOf(RateLimitWindowConflictError);
    expect((refusal as Error).message).toMatch(/lists no bucket/);
    expect(await store.recordHits([{ key: KEY, window: HOUR }])).toEqual([2]);
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
