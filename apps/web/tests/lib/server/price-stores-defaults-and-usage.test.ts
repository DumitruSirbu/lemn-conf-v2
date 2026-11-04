import {
  FakeKitchenDefaultsStore,
  NONE_SAVED,
  type KitchenDefaultsStore,
} from "@lemnaria/persistence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FAKE_PRICE_BOOK_FLAG,
  FAKE_PRICE_BOOK_FLAG_ENABLED,
} from "@/lib/server/fake-price-book-flag";
import {
  UNAVAILABLE_KITCHEN_DEFAULTS_STORE,
  UNAVAILABLE_KITCHEN_USAGE_READER,
} from "@/lib/server/unavailable-price-stores";

import {
  AN_UNREACHABLE_DATABASE_URL,
  forgetHeldPriceStores,
} from "../../support/held-price-stores";

// The defaults store and the usage reader beside the price book and the availability store: production makes the
// database's on first use, once for the process; without a connection both answer "unavailable"; the seeded world holds
// one fake that serves both ports.

const made = vi.hoisted(() => ({
  defaults: [] as object[],
  usage: [] as object[],
}));

vi.mock("@lemnaria/persistence", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lemnaria/persistence")>()),
  NeonKitchenDefaultsStore: vi.fn(function DefaultsStore(this: object) {
    made.defaults.push(this);
  }),
  NeonKitchenUsageReader: vi.fn(function UsageReader(this: object) {
    made.usage.push(this);
  }),
}));

const { getPriceStores } = await import("@/lib/server/price-stores");

function stubProductionEnvironment(databaseUrl: string | undefined): void {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DATABASE_URL", databaseUrl);
  vi.stubEnv("VERCEL_ENV", undefined);
  vi.stubEnv("CLIENT_NETWORK_SOURCE", undefined);
  vi.stubEnv(FAKE_PRICE_BOOK_FLAG, undefined);
}

beforeEach(() => {
  made.defaults = [];
  made.usage = [];
  forgetHeldPriceStores();
});

afterEach(() => {
  forgetHeldPriceStores();
  vi.unstubAllEnvs();
});

describe("production with a database", () => {
  beforeEach(() => {
    stubProductionEnvironment(AN_UNREACHABLE_DATABASE_URL);
  });

  it("makes nothing at import, and one of each on the first use", async () => {
    expect(made.defaults).toHaveLength(0);
    expect(made.usage).toHaveLength(0);

    const stores = await getPriceStores();

    expect(made.defaults).toEqual([stores.defaults]);
    expect(made.usage).toEqual([stores.usage]);
  });

  it("holds two different objects for the two ports", async () => {
    const stores = await getPriceStores();

    expect(stores.defaults).not.toBe(stores.usage);
  });

  it("makes them once for the process however many requests meet the first use together", async () => {
    const stores = await Promise.all(
      Array.from({ length: 25 }, () => getPriceStores()),
    );
    await getPriceStores();

    expect(made.defaults).toHaveLength(1);
    expect(made.usage).toHaveLength(1);
    for (const held of stores) expect(held).toBe(stores[0]);
  });
});

describe("production without a database", () => {
  beforeEach(() => {
    stubProductionEnvironment(undefined);
  });

  it.each([
    ["undefined", undefined],
    ["empty", ""],
  ])(
    "holds the stores that answer unavailable when DATABASE_URL is %s",
    async (_description, url) => {
      stubProductionEnvironment(url);

      const stores = await getPriceStores();

      expect(stores.defaults).toBe(UNAVAILABLE_KITCHEN_DEFAULTS_STORE);
      expect(stores.usage).toBe(UNAVAILABLE_KITCHEN_USAGE_READER);
      expect(made.defaults).toHaveLength(0);
      expect(made.usage).toHaveLength(0);
    },
  );

  it("refuses every call of both with the store's own unavailable", async () => {
    const stores = await getPriceStores();

    const unavailable = {
      name: "DashboardStoreError",
      failure: "unavailable",
    };
    await expect(stores.defaults.read()).rejects.toMatchObject({
      ...unavailable,
      operation: "read the kitchen defaults",
    });
    await expect(
      stores.defaults.save({} as Parameters<KitchenDefaultsStore["save"]>[0]),
    ).rejects.toMatchObject({
      ...unavailable,
      operation: "save the kitchen defaults",
    });
    await expect(stores.usage.countEach([])).rejects.toMatchObject({
      ...unavailable,
      operation: "count the kitchens using an item",
    });
  });
});

describe("the seeded world", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
  });

  it("serves both ports from one fake that has saved nothing and counts no kitchen", async () => {
    const stores = await getPriceStores();

    expect(stores.defaults).toBeInstanceOf(FakeKitchenDefaultsStore);
    expect(stores.usage).toBe(stores.defaults);
    expect(await stores.defaults.read()).toBe(NONE_SAVED);
    expect(await stores.usage.countEach([])).toEqual({
      counts: [],
      unreadableDesigns: 0,
    });
    expect(made.defaults).toHaveLength(0);
  });

  it("serves them from the e2e server's flag as well", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(FAKE_PRICE_BOOK_FLAG, FAKE_PRICE_BOOK_FLAG_ENABLED);

    const stores = await getPriceStores();

    expect(stores.usage).toBe(stores.defaults);
    expect(made.defaults).toHaveLength(0);
    expect(made.usage).toHaveLength(0);
  });
});
