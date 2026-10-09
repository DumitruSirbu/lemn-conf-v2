import { describe, expect, it } from "vitest";

import { RateLimitWindowConflictError } from "../../src/rate-limit-store.js";
import type {
  RateLimitBucket,
  RateLimitStore,
  RateLimitWindow,
} from "../../src/rate-limit-store.js";

const HOUR_MS = 3_600_000;
/** Far in the past, so a prune at these instants can reach nothing a real run wrote. */
const FIRST_WINDOW_START_MS = Date.UTC(2001, 0, 1);
/** The right length and alphabet but for the case: the table's check admits lowercase only. */
const UPPERCASE_DIGEST = "A".repeat(64);

export interface RateLimitStoreContractSubject {
  readonly createStore: () => RateLimitStore;
  /** A digest no earlier test used, so a test's counts never start from another's. */
  readonly newKey: () => string;
}

/** The hour window that holds `instantMs`, half-open: the instant `endsAt` is in the next one. */
export function hourWindowContaining(instantMs: number): RateLimitWindow {
  const index = Math.floor((instantMs - FIRST_WINDOW_START_MS) / HOUR_MS);
  const startsAtMs = FIRST_WINDOW_START_MS + index * HOUR_MS;
  return {
    startsAt: new Date(startsAtMs),
    endsAt: new Date(startsAtMs + HOUR_MS),
  };
}

function hourWindowNumber(index: number): RateLimitWindow {
  return hourWindowContaining(FIRST_WINDOW_START_MS + index * HOUR_MS);
}

/** What a `RateLimitStore` promises, asserted once and run against the fake and against the Neon store. */
export function describeRateLimitStoreContract({
  createStore,
  newKey,
}: RateLimitStoreContractSubject): void {
  const bucket = (window: RateLimitWindow): RateLimitBucket => ({
    key: newKey(),
    window,
  });

  describe("recordHits", () => {
    it("counts 1, 2, 3 for three hits on one bucket and window", async () => {
      const store = createStore();
      const only = bucket(hourWindowNumber(0));

      const counts = [
        ...(await store.recordHits([only])),
        ...(await store.recordHits([only])),
        ...(await store.recordHits([only])),
      ];

      expect(counts).toEqual([1, 2, 3]);
    });

    it("returns each bucket's own count in the order the request listed them", async () => {
      const store = createStore();
      const window = hourWindowNumber(0);
      const first = bucket(window);
      const second = bucket(window);
      await store.recordHits([second]);
      await store.recordHits([second]);

      const counts = await store.recordHits([first, second]);

      expect(counts).toEqual([1, 3]);
    });

    it("refuses an empty request, since no counts would read as nothing over the limit", async () => {
      await expect(createStore().recordHits([])).rejects.toThrow(
        /lists no bucket/,
      );
    });

    it("counts a hit one millisecond before a window's end and one at the next window's start apart", async () => {
      const store = createStore();
      const key = newKey();
      const firstWindow = hourWindowNumber(0);
      const atItsStart = hourWindowContaining(firstWindow.startsAt.getTime());
      const justBeforeItsEnd = hourWindowContaining(
        firstWindow.endsAt.getTime() - 1,
      );
      const atTheNextStart = hourWindowContaining(firstWindow.endsAt.getTime());

      const counts = [
        ...(await store.recordHits([{ key, window: atItsStart }])),
        ...(await store.recordHits([{ key, window: justBeforeItsEnd }])),
        ...(await store.recordHits([{ key, window: atTheNextStart }])),
      ];

      expect(counts).toEqual([1, 2, 1]);
    });

    it("starts a new window at 1 while an expired window of the same bucket is still stored", async () => {
      const store = createStore();
      const key = newKey();
      const expired = { key, window: hourWindowNumber(0) };
      for (let hit = 0; hit < 5; hit += 1) await store.recordHits([expired]);

      const [firstHitOfNewWindow] = await store.recordHits([
        { key, window: hourWindowNumber(1) },
      ]);

      expect(firstHitOfNewWindow).toBe(1);
    });

    it("refuses a second end for one key and start, counting nothing of the request and leaving the row as it was", async () => {
      const store = createStore();
      const startsAt = hourWindowNumber(2).startsAt;
      const hour = { startsAt, endsAt: new Date(startsAt.getTime() + HOUR_MS) };
      const day = {
        startsAt,
        endsAt: new Date(startsAt.getTime() + 24 * HOUR_MS),
      };
      const stored = bucket(day);
      const bystander = bucket(hourWindowNumber(3));
      await store.recordHits([stored]);

      const refusal = await store
        .recordHits([bystander, { key: stored.key, window: hour }])
        .catch((error: unknown) => error);
      const afterTheRefusal = await store.recordHits([bystander, stored]);
      await store.pruneExpired(hour.endsAt);
      const afterThePrune = await store.recordHits([stored]);

      expect(refusal).toBeInstanceOf(RateLimitWindowConflictError);
      expect((refusal as Error).message).not.toContain(stored.key);
      expect(afterTheRefusal).toEqual([1, 2]);
      expect(afterThePrune).toEqual([3]);
    });

    it("counts a hit that states the stored end, however many times it is stated", async () => {
      const store = createStore();
      const only = bucket(hourWindowNumber(0));

      const counts = await Promise.all([
        store.recordHits([only]),
        store.recordHits([{ ...only, window: { ...only.window } }]),
      ]);

      expect(counts.flat().sort()).toEqual([1, 2]);
    });

    it("refuses a key that is not a lowercase SHA-256 digest, counting nothing", async () => {
      const store = createStore();
      const window = hourWindowNumber(0);
      const good = bucket(window);

      await expect(
        store.recordHits([good, { key: "203.0.113.7", window }]),
      ).rejects.toThrow(/64-character lowercase hex SHA-256 digest/);
      await expect(
        store.recordHits([{ key: UPPERCASE_DIGEST, window }]),
      ).rejects.toThrow(/digest/);

      expect(await store.recordHits([good])).toEqual([1]);
    });

    it("refuses a window that ends where it starts, and a bucket listed twice", async () => {
      const store = createStore();
      const startsAt = hourWindowNumber(0).startsAt;
      const duplicated = bucket(hourWindowNumber(0));

      await expect(
        store.recordHits([bucket({ startsAt, endsAt: startsAt })]),
      ).rejects.toThrow(/must end after it starts/);
      await expect(store.recordHits([duplicated, duplicated])).rejects.toThrow(
        /same bucket in the same window twice/,
      );

      expect(await store.recordHits([duplicated])).toEqual([1]);
    });
  });

  describe("pruneExpired", () => {
    it("removes a window at its end and not a millisecond before", async () => {
      const store = createStore();
      const window = hourWindowNumber(0);
      const hit = bucket(window);
      await store.recordHits([hit]);

      await store.pruneExpired(new Date(window.endsAt.getTime() - 1));
      const stillCounting = await store.recordHits([hit]);
      await store.pruneExpired(window.endsAt);
      const afterItsEnd = await store.recordHits([hit]);

      expect([stillCounting, afterItsEnd]).toEqual([[2], [1]]);
    });

    it("keeps a live window while it removes the expired one", async () => {
      const store = createStore();
      const expired = bucket(hourWindowNumber(0));
      const live = bucket(hourWindowNumber(1));
      await store.recordHits([expired, live]);

      const removed = await store.pruneExpired(hourWindowNumber(0).endsAt);

      expect(removed).toBeGreaterThanOrEqual(1);
      expect(await store.recordHits([expired, live])).toEqual([1, 2]);
    });

    it("is safe to run twice: the second run removes nothing and a live count goes on", async () => {
      const store = createStore();
      const live = bucket(hourWindowNumber(1));
      await store.recordHits([bucket(hourWindowNumber(0)), live]);
      const now = hourWindowNumber(0).endsAt;

      const first = await store.pruneExpired(now);
      const second = await store.pruneExpired(now);

      expect(first).toBeGreaterThanOrEqual(1);
      expect(second).toBe(0);
      expect(await store.recordHits([live])).toEqual([2]);
    });
  });

  describe("totalsOfWindow", () => {
    // The windows are ones no other test of the contract uses. Every assertion is a difference from a reading taken
    // first, so rows an interrupted earlier run left in the same windows cannot move it.
    const FIGURE = 3;

    async function hit(
      store: RateLimitStore,
      planted: RateLimitBucket,
      times: number,
    ): Promise<void> {
      for (let count = 0; count < times; count += 1) {
        await store.recordHits([planted]);
      }
    }

    it("counts the buckets of one window, those above the figure, and the largest count", async () => {
      const store = createStore();
      const window = hourWindowNumber(20);
      const before = await store.totalsOfWindow(window, FIGURE);
      for (const times of [1, 3, 4, 6]) {
        await hit(store, bucket(window), times);
      }

      const after = await store.totalsOfWindow(window, FIGURE);

      expect(after.buckets - before.buckets).toBe(4);
      expect(after.aboveFigure - before.aboveFigure).toBe(2);
      expect(after.largestCount).toBe(Math.max(before.largestCount, 6));
    });

    it("counts a bucket at the figure as not above it, and above a figure one lower", async () => {
      const store = createStore();
      const window = hourWindowNumber(21);
      const atTheFigure = await store.totalsOfWindow(window, FIGURE);
      const oneLower = await store.totalsOfWindow(window, FIGURE - 1);

      await hit(store, bucket(window), FIGURE);
      const afterAtFigure = await store.totalsOfWindow(window, FIGURE);
      const afterOneLower = await store.totalsOfWindow(window, FIGURE - 1);

      expect(afterAtFigure.aboveFigure).toBe(atTheFigure.aboveFigure);
      expect(afterOneLower.aboveFigure - oneLower.aboveFigure).toBe(1);
    });

    it("holds only the rows of the window's own start and end, not a longer one from its start", async () => {
      const store = createStore();
      const hour = hourWindowNumber(22);
      const day = {
        startsAt: hour.startsAt,
        endsAt: new Date(hour.startsAt.getTime() + 24 * HOUR_MS),
      };
      const nextHour = hourWindowNumber(23);
      const [hourBefore, dayBefore, nextBefore] = await Promise.all(
        [hour, day, nextHour].map((window) =>
          store.totalsOfWindow(window, FIGURE),
        ),
      );

      await hit(store, bucket(hour), 1);
      await hit(store, bucket(day), 2);
      await hit(store, bucket(nextHour), 5);
      const [hourAfter, dayAfter, nextAfter] = await Promise.all(
        [hour, day, nextHour].map((window) =>
          store.totalsOfWindow(window, FIGURE),
        ),
      );

      expect(hourAfter?.buckets).toBe((hourBefore?.buckets ?? 0) + 1);
      expect(dayAfter?.buckets).toBe((dayBefore?.buckets ?? 0) + 1);
      expect(nextAfter?.buckets).toBe((nextBefore?.buckets ?? 0) + 1);
      expect(hourAfter?.aboveFigure).toBe(hourBefore?.aboveFigure);
      expect(dayAfter?.aboveFigure).toBe(dayBefore?.aboveFigure);
    });

    it("counts a bucket once however many keys share its window, and reads without counting a hit itself", async () => {
      const store = createStore();
      const window = hourWindowNumber(24);
      const only = bucket(window);
      await hit(store, only, 1);
      const first = await store.totalsOfWindow(window, FIGURE);

      const second = await store.totalsOfWindow(window, FIGURE);

      expect(second).toEqual(first);
      expect(await store.recordHits([only])).toEqual([2]);
    });

    it("answers a window that no row has as three noughts", async () => {
      const store = createStore();
      const unused = hourWindowContaining(Date.UTC(2001, 0, 1) + 100 * HOUR_MS);

      expect(await store.totalsOfWindow(unused, FIGURE)).toEqual({
        buckets: 0,
        aboveFigure: 0,
        largestCount: 0,
      });
    });

    it("refuses a window that ends where it starts and a figure that is not a whole number", async () => {
      const store = createStore();
      const startsAt = hourWindowNumber(0).startsAt;

      await expect(
        store.totalsOfWindow({ startsAt, endsAt: startsAt }, FIGURE),
      ).rejects.toThrow(/Refusing/);
      await expect(
        store.totalsOfWindow(hourWindowNumber(0), 1.5),
      ).rejects.toThrow(/Refusing/);
      await expect(
        store.totalsOfWindow(hourWindowNumber(0), -1),
      ).rejects.toThrow(/Refusing/);
    });
  });
}
