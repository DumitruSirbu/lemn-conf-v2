import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FAKE_PRICE_BOOK_FLAG,
  FAKE_PRICE_BOOK_FLAG_ENABLED,
} from "@/lib/server/fake-price-book-flag";
import type { PriceStores } from "@/lib/server/price-stores";
import {
  UNAVAILABLE_CATALOGUE_AVAILABILITY_STORE,
  UNAVAILABLE_PRICE_BOOK_STORE,
} from "@/lib/server/unavailable-price-stores";

import {
  AN_UNREACHABLE_DATABASE_URL,
  forgetHeldPriceStores,
} from "../../support/held-price-stores";
import { sourceFilesMatching } from "./server-source-support";

// Adversarial QA of which stores a process holds once production's are the database's. The Neon constructors are
// counted and the seeding is a sentinel, so the choice is read off what was made and never off a driver.

const world = vi.hoisted(() => ({
  priceBookStores: [] as object[],
  availabilityStores: [] as object[],
  seedings: 0,
  refusals: [] as (() => void)[],
  seedWith: undefined as undefined | (() => Promise<unknown>),
}));

vi.mock("@lemnaria/persistence", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lemnaria/persistence")>()),
  NeonPriceBookStore: vi.fn(function PriceBookStore(this: object) {
    world.refusals.shift()?.();
    world.priceBookStores.push(this);
  }),
  NeonCatalogueAvailabilityStore: vi.fn(function AvailabilityStore(
    this: object,
  ) {
    world.refusals.shift()?.();
    world.availabilityStores.push(this);
  }),
}));
vi.mock("@/lib/server/price-book-test-seed", () => ({
  seedFakePriceStores: () => {
    world.seedings += 1;
    return world.seedWith?.() ?? Promise.resolve(SEEDED_STORES);
  },
}));

const SEEDED_STORES: PriceStores = {
  priceBook: Object.freeze({}) as PriceStores["priceBook"],
  availability: Object.freeze({}) as PriceStores["availability"],
  defaults: Object.freeze({}) as PriceStores["defaults"],
  usage: Object.freeze({}) as PriceStores["usage"],
  notices: Object.freeze({}) as PriceStores["notices"],
};

const { getPriceStores, PRICE_STORES_GLOBAL_KEY } = await import(
  "@/lib/server/price-stores"
);

const madeByImporting = [
  world.priceBookStores.length,
  world.availabilityStores.length,
];

function stubEnvironment(
  environment: Record<string, string | undefined>,
): void {
  for (const [name, value] of Object.entries(environment)) {
    vi.stubEnv(name, value);
  }
}

beforeEach(() => {
  world.priceBookStores = [];
  world.availabilityStores = [];
  world.seedings = 0;
  world.refusals = [];
  world.seedWith = undefined;
  forgetHeldPriceStores();
});

afterEach(() => {
  forgetHeldPriceStores();
  vi.unstubAllEnvs();
});

describe("the stores of every environment a process can be started in", () => {
  const VERCEL_ENVS = [undefined, "", "production", "preview"];
  const NETWORK_SOURCES = [undefined, "", "vercel"];
  const FLAGS = [undefined, FAKE_PRICE_BOOK_FLAG_ENABLED, "true", " 1"];
  const MODES = [undefined, "development", "test", "production", "staging"];
  const DATABASES = [undefined, "", AN_UNREACHABLE_DATABASE_URL];

  function isSeeded(
    vercelEnv: string | undefined,
    source: string | undefined,
    flag: string | undefined,
    mode: string | undefined,
  ): boolean {
    if (vercelEnv !== undefined) return false;
    if (flag === FAKE_PRICE_BOOK_FLAG_ENABLED) return true;
    return (mode === "development" || mode === "test") && source === undefined;
  }

  it.each(VERCEL_ENVS)(
    "hold the seeded sample only where nothing names a deployment and the e2e flag or a development or test mode asks, with VERCEL_ENV %j",
    async (vercelEnv) => {
      for (const source of NETWORK_SOURCES) {
        for (const flag of FLAGS) {
          for (const mode of MODES) {
            for (const database of DATABASES) {
              world.priceBookStores = [];
              world.availabilityStores = [];
              world.seedings = 0;
              forgetHeldPriceStores();
              const environment = {
                VERCEL_ENV: vercelEnv,
                CLIENT_NETWORK_SOURCE: source,
                [FAKE_PRICE_BOOK_FLAG]: flag,
                NODE_ENV: mode,
                DATABASE_URL: database,
              };
              stubEnvironment(environment);
              const label = JSON.stringify(environment);

              const stores = await getPriceStores();

              if (isSeeded(vercelEnv, source, flag, mode)) {
                expect(stores, label).toBe(SEEDED_STORES);
                expect(world.priceBookStores, label).toHaveLength(0);
              } else if (database) {
                expect(world.seedings, label).toBe(0);
                expect(world.priceBookStores, label).toHaveLength(1);
                expect(world.availabilityStores, label).toHaveLength(1);
                expect(stores.priceBook, label).toBe(world.priceBookStores[0]);
                expect(stores.availability, label).toBe(
                  world.availabilityStores[0],
                );
              } else {
                expect(world.seedings, label).toBe(0);
                expect(stores.priceBook, label).toBe(
                  UNAVAILABLE_PRICE_BOOK_STORE,
                );
                expect(stores.availability, label).toBe(
                  UNAVAILABLE_CATALOGUE_AVAILABILITY_STORE,
                );
                expect(world.priceBookStores, label).toHaveLength(0);
                expect(world.availabilityStores, label).toHaveLength(0);
              }
            }
          }
        }
      }
    },
  );
});

describe("a process that makes its stores on first use", () => {
  beforeEach(() => {
    stubEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: AN_UNREACHABLE_DATABASE_URL,
      VERCEL_ENV: undefined,
      CLIENT_NETWORK_SOURCE: undefined,
      [FAKE_PRICE_BOOK_FLAG]: undefined,
    });
  });

  it("makes one pair however many requests meet the first use together, and hands every one that pair", async () => {
    const requests = Array.from({ length: 25 }, () => getPriceStores());

    const pairs = await Promise.all(requests);

    expect(world.priceBookStores).toHaveLength(1);
    expect(world.availabilityStores).toHaveLength(1);
    for (const pair of pairs) expect(pair).toBe(pairs[0]);
  });

  it("makes no second pair for the next request, nor for a module loaded twice as a development server does", async () => {
    const first = await getPriceStores();
    vi.resetModules();
    const reloaded = await import("@/lib/server/price-stores");

    const second = await reloaded.getPriceStores();

    expect(reloaded.getPriceStores).not.toBe(getPriceStores);
    expect(second).toBe(first);
    expect(world.priceBookStores).toHaveLength(1);
  });

  it("keeps no refusal: every request that met it is refused, and the next makes the pair again", async () => {
    world.refusals = [
      () => {
        throw new Error("refused by the driver");
      },
    ];

    const [first, second] = await Promise.allSettled([
      getPriceStores(),
      getPriceStores(),
    ]);

    expect(first).toMatchObject({ status: "rejected" });
    expect(second).toMatchObject({ status: "rejected" });
    expect(world.priceBookStores).toHaveLength(0);
    const recovered = await getPriceStores();
    expect(recovered.priceBook).toBe(world.priceBookStores[0]);
    expect(await getPriceStores()).toBe(recovered);
  });

  it("hands out no half of a pair: when the second store is refused the first is dropped with it", async () => {
    world.refusals = [
      () => undefined,
      () => {
        throw new Error("refused by the driver");
      },
    ];

    await expect(getPriceStores()).rejects.toThrow("refused by the driver");
    const recovered = await getPriceStores();

    expect(world.priceBookStores).toHaveLength(2);
    expect(recovered.priceBook).toBe(world.priceBookStores[1]);
    expect(recovered.availability).toBe(world.availabilityStores[0]);
    expect(await getPriceStores()).toBe(recovered);
  });
});

describe("a refusal that arrives after a newer attempt has succeeded", () => {
  it("does not take the success's place", async () => {
    stubEnvironment({
      NODE_ENV: "test",
      VERCEL_ENV: undefined,
      CLIENT_NETWORK_SOURCE: undefined,
      [FAKE_PRICE_BOOK_FLAG]: undefined,
    });
    let refuseTheSlowOne: (reason: Error) => void = () => undefined;
    world.seedWith = () =>
      new Promise((_, reject) => {
        refuseTheSlowOne = reject;
      });
    const slow = getPriceStores();
    const slowOutcome = slow.then(
      () => "made",
      () => "refused",
    );
    await vi.waitFor(() => {
      expect(world.seedings).toBe(1);
    });
    forgetHeldPriceStores();
    world.seedWith = undefined;
    const newer = await getPriceStores();

    refuseTheSlowOne(new Error("the slow seeding failed"));

    expect(await slowOutcome).toBe("refused");
    expect(await getPriceStores()).toBe(newer);
    expect(world.seedings).toBe(2);
  });
});

describe("importing what reads the stores", () => {
  const READERS_OF_THE_STORES =
    /price-stores"|active-price-book"|with-active-price-book"/;
  const ENTRY_MODULES_OF_THE_BUILD = /^app\/.*\b(?:page|route|layout)\.tsx?$/;

  // Loads every route, page and layout module with a fresh module registry: about 25 s alone, more under load.
  it("makes no store in any module that imports the price stores or the price root, nor in any page, route or layout, so a build opens no connection", async () => {
    // `VERCEL_ENV` is what makes this process production's: a production `NODE_ENV` would load React's runtime without
    // the development JSX the pages are compiled to.
    stubEnvironment({
      DATABASE_URL: AN_UNREACHABLE_DATABASE_URL,
      VERCEL_ENV: "production",
    });
    const readers = [
      ...sourceFilesMatching(READERS_OF_THE_STORES),
      ...sourceFilesMatching(/./).filter((path) =>
        ENTRY_MODULES_OF_THE_BUILD.test(path),
      ),
    ]
      .filter((path) => !path.endsWith(".d.ts"))
      .map((path) => `@/${path.replace(/\.(?:ts|tsx)$/, "")}`);
    expect(new Set(readers).size).toBeGreaterThan(40);

    for (const reader of new Set(readers)) {
      vi.resetModules();
      try {
        await import(/* @vite-ignore */ reader);
      } catch (failure) {
        throw new Error(`could not load ${reader}`, { cause: failure });
      }
    }

    expect(world.priceBookStores).toHaveLength(0);
    expect(world.availabilityStores).toHaveLength(0);
    expect(world.seedings).toBe(0);
    expect(madeByImporting).toEqual([0, 0]);
    expect(
      (globalThis as Record<symbol, unknown>)[PRICE_STORES_GLOBAL_KEY],
    ).toBeUndefined();
  }, 120_000);
});
