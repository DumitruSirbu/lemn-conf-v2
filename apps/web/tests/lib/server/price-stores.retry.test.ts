import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getPriceStores,
  PRICE_STORES_GLOBAL_KEY,
  type PriceStores,
} from "@/lib/server/price-stores";

// A seeding that fails is not kept on `globalThis`: the next request tries again (development and test, where the fakes
// are seeded). Only the request that met the failure is told of it.

const seeding = vi.hoisted(() => ({ seed: vi.fn() }));

vi.mock("@/lib/server/price-book-test-seed", () => ({
  seedFakePriceStores: seeding.seed,
}));

const A_WORLD = { priceBook: {}, availability: {} } as unknown as PriceStores;

function forgetTheProcessStores(): void {
  Reflect.deleteProperty(globalThis, PRICE_STORES_GLOBAL_KEY);
}

beforeEach(() => {
  seeding.seed.mockReset();
  forgetTheProcessStores();
});

afterEach(forgetTheProcessStores);

describe("a failed seeding", () => {
  it("is told to the request that met it and tried again by the next", async () => {
    seeding.seed
      .mockRejectedValueOnce(new Error("the seed failed"))
      .mockResolvedValueOnce(A_WORLD);

    await expect(getPriceStores()).rejects.toThrow("the seed failed");
    const next = await getPriceStores();

    expect(next).toBe(A_WORLD);
    expect(seeding.seed).toHaveBeenCalledTimes(2);
  });

  it("is one failure for the requests that were awaiting it, and one fresh try for the one after", async () => {
    seeding.seed
      .mockRejectedValueOnce(new Error("the seed failed"))
      .mockResolvedValueOnce(A_WORLD);

    const waiting = await Promise.allSettled([
      getPriceStores(),
      getPriceStores(),
    ]);
    const afterwards = await getPriceStores();

    expect(waiting.map(({ status }) => status)).toEqual([
      "rejected",
      "rejected",
    ]);
    expect(seeding.seed).toHaveBeenCalledTimes(2);
    expect(afterwards).toBe(A_WORLD);
  });

  it("keeps a world that was seeded, for every later request", async () => {
    seeding.seed.mockResolvedValue(A_WORLD);

    await getPriceStores();
    await getPriceStores();

    expect(seeding.seed).toHaveBeenCalledTimes(1);
  });
});
