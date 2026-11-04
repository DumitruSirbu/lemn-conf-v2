import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FAKE_PRICE_BOOK_FLAG,
  FAKE_PRICE_BOOK_FLAG_ENABLED,
} from "@/lib/server/fake-price-book-flag";

import { readSource } from "./server-source-support";

// What production's price stores are: the database's, made on the first request that needs them and never when the
// module is loaded or the application built, and never the seeded sample.

const world = vi.hoisted(() => ({
  priceBookStores: 0,
  availabilityStores: 0,
  seedings: 0,
}));

vi.mock("@lemnaria/persistence", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lemnaria/persistence")>()),
  NeonPriceBookStore: vi.fn(function PriceBookStore() {
    world.priceBookStores += 1;
  }),
  NeonCatalogueAvailabilityStore: vi.fn(function AvailabilityStore() {
    world.availabilityStores += 1;
  }),
}));
vi.mock("@/lib/server/price-book-test-seed", () => ({
  seedFakePriceStores: () => {
    world.seedings += 1;
    return Promise.reject(new Error("the sample was reached"));
  },
}));

const { getPriceStores, PRICE_STORES_GLOBAL_KEY } = await import(
  "@/lib/server/price-stores"
);

const storesMadeByImporting = [world.priceBookStores, world.availabilityStores];

function forgetTheProcessStores(): void {
  Reflect.deleteProperty(globalThis, PRICE_STORES_GLOBAL_KEY);
}

beforeEach(() => {
  world.priceBookStores = 0;
  world.availabilityStores = 0;
  world.seedings = 0;
  forgetTheProcessStores();
});

afterEach(() => {
  forgetTheProcessStores();
  vi.unstubAllEnvs();
});

describe("the stores of a production process", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@database.test.invalid/db");
  });

  it("are the database's two stores, one each", async () => {
    const { priceBook, availability } = await getPriceStores();

    expect(priceBook).toBeInstanceOf(
      (await import("@lemnaria/persistence")).NeonPriceBookStore,
    );
    expect(availability).toBeInstanceOf(
      (await import("@lemnaria/persistence")).NeonCatalogueAvailabilityStore,
    );
    expect([world.priceBookStores, world.availabilityStores]).toEqual([1, 1]);
  });

  it("are made on the first use and held for every use after, so a second request opens no second connection", async () => {
    expect([world.priceBookStores, world.availabilityStores]).toEqual([0, 0]);

    const first = await getPriceStores();
    const [second, third] = await Promise.all([
      getPriceStores(),
      getPriceStores(),
    ]);

    expect(second).toBe(first);
    expect(third).toBe(first);
    expect([world.priceBookStores, world.availabilityStores]).toEqual([1, 1]);
  });

  it.each([
    ["a bare production build", {}],
    ["a deployment", { VERCEL_ENV: "production" }],
    [
      "a deployment that sets the e2e flag",
      {
        VERCEL_ENV: "preview",
        [FAKE_PRICE_BOOK_FLAG]: FAKE_PRICE_BOOK_FLAG_ENABLED,
      },
    ],
    ["a flag that is not exactly 1", { [FAKE_PRICE_BOOK_FLAG]: "true" }],
  ])("never reach the seeded sample: %s", async (_, variables) => {
    for (const [name, value] of Object.entries(variables)) {
      vi.stubEnv(name, value);
    }

    await getPriceStores();

    expect(world.seedings).toBe(0);
    expect(world.priceBookStores).toBe(1);
  });

  it.each([
    ["unset", undefined],
    ["empty", ""],
  ])(
    "are the unavailable ones, made without a store, never the sample, when DATABASE_URL is %s",
    async (_, value) => {
      vi.stubEnv("DATABASE_URL", value);

      const { priceBook, availability } = await getPriceStores();

      await expect(priceBook.readActive()).rejects.toMatchObject({
        name: "DashboardStoreError",
        failure: "unavailable",
      });
      await expect(availability.readCurrent()).rejects.toMatchObject({
        failure: "unavailable",
      });
      expect([world.priceBookStores, world.availabilityStores]).toEqual([0, 0]);
      expect(world.seedings).toBe(0);
    },
  );

  it("is a failure of the request, not the unavailable stores, when the driver refuses the connection, and the next request tries again", async () => {
    const { NeonPriceBookStore } = await import("@lemnaria/persistence");
    vi.mocked(NeonPriceBookStore).mockImplementationOnce(function Refusing() {
      throw new Error("refused");
    });

    await expect(getPriceStores()).rejects.toThrow("refused");
    const { priceBook } = await getPriceStores();

    expect(priceBook).toBeInstanceOf(NeonPriceBookStore);
    expect(world.seedings).toBe(0);
  });
});

describe("importing the price stores", () => {
  it("makes no store, so a build opens no connection", () => {
    expect(storesMadeByImporting).toEqual([0, 0]);
  });

  it("reads source: makes each Neon store inside the production getter alone", () => {
    const source = readSource("lib/server/price-stores.ts");

    expect(source.match(/new NeonPriceBookStore\(/g)).toHaveLength(1);
    expect(source.match(/new NeonCatalogueAvailabilityStore\(/g)).toHaveLength(
      1,
    );
    const [, afterGetter = ""] = source.split(
      "function productionPriceStores(",
    );
    const [getterBody = ""] = afterGetter.split("\n}\n");
    expect(getterBody).toContain("new NeonPriceBookStore()");
    expect(getterBody).toContain("new NeonCatalogueAvailabilityStore()");
  });
});
