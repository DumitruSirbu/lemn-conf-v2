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
}
