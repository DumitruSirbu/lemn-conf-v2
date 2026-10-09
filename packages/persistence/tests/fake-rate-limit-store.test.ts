import { describe, expect, it } from "vitest";

import { FakeRateLimitStore } from "../src/fake-rate-limit-store.js";
import {
  describeRateLimitStoreContract,
  hourWindowContaining,
} from "./support/rate-limit-store-contract.js";

let keyCounter = 0;
function newKey(): string {
  keyCounter += 1;
  return keyCounter.toString(16).padStart(64, "0");
}

describe("FakeRateLimitStore", () => {
  describeRateLimitStoreContract({
    createStore: () => new FakeRateLimitStore(),
    newKey,
  });

  describe("beyond the contract the Neon store can only meet at least", () => {
    it("prunes exactly the expired windows and reports how many", async () => {
      const store = new FakeRateLimitStore();
      const window = hourWindowContaining(Date.UTC(2001, 0, 1));
      const next = hourWindowContaining(window.endsAt.getTime());
      await store.recordHits([
        { key: newKey(), window },
        { key: newKey(), window },
        { key: newKey(), window: next },
      ]);

      const removed = await store.pruneExpired(window.endsAt);
      const removedAgain = await store.pruneExpired(window.endsAt);

      expect([removed, removedAgain]).toEqual([2, 0]);
    });

    it("totals exactly the window's own buckets, in three numbers and no key", async () => {
      const store = new FakeRateLimitStore();
      const window = hourWindowContaining(Date.UTC(2001, 0, 1));
      const other = hourWindowContaining(window.endsAt.getTime());
      const busy = { key: newKey(), window };
      await store.recordHits([busy, { key: newKey(), window }]);
      await store.recordHits([busy]);
      await store.recordHits([busy]);
      await store.recordHits([{ key: newKey(), window: other }]);

      const totals = await store.totalsOfWindow(window, 2);

      expect(totals).toEqual({ buckets: 2, aboveFigure: 1, largestCount: 3 });
      expect(Reflect.ownKeys(totals)).toEqual([
        "buckets",
        "aboveFigure",
        "largestCount",
      ]);
    });

    it("keeps one store's counts out of another's", async () => {
      const key = newKey();
      const window = hourWindowContaining(Date.UTC(2001, 0, 1));
      await new FakeRateLimitStore().recordHits([{ key, window }]);

      const counts = await new FakeRateLimitStore().recordHits([
        { key, window },
      ]);

      expect(counts).toEqual([1]);
    });
  });
});
