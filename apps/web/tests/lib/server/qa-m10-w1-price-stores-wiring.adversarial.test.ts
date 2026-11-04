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

import { sourceFilesMatching } from "./server-source-support";

// Adversarial QA for M10 wave W1: which stores a process holds once production's are the database's. The Neon
// constructors are counted and the seeding is a sentinel, so the choice is read off what was made and never off a driver.

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
};
const DATABASE = "postgres://user:pass@w1-qa.database.invalid/db";

const { getPriceStores, selectPriceStores, PRICE_STORES_GLOBAL_KEY } =
  await import("@/lib/server/price-stores");

const madeByImporting = [
  world.priceBookStores.length,
  world.availabilityStores.length,
];

function forgetTheProcessStores(): void {
  Reflect.deleteProperty(globalThis, PRICE_STORES_GLOBAL_KEY);
}

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
  forgetTheProcessStores();
});

afterEach(() => {
  forgetTheProcessStores();
  vi.unstubAllEnvs();
});

describe("the stores of every environment a process can be started in", () => {
  const VERCEL_ENVS = [undefined, "", "production", "preview"];
  const NETWORK_SOURCES = [undefined, "", "vercel"];
  const FLAGS = [undefined, FAKE_PRICE_BOOK_FLAG_ENABLED, "true", " 1"];
  const MODES = [undefined, "development", "test", "production", "staging"];
  const DATABASES = [undefined, "", DATABASE];

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
              forgetTheProcessStores();
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

  it("choose without asking whether a database is named", () => {
    for (const database of DATABASES) {
      for (const mode of MODES) {
        const without = selectPriceStores({ NODE_ENV: mode });
        const within = selectPriceStores({
          NODE_ENV: mode,
          DATABASE_URL: database,
        });
        expect(within, `${String(mode)} ${String(database)}`).toBe(without);
      }
    }
  });
});

describe("the members of the environment the choice reads", () => {
  const DECLARED = new Set([
    "NODE_ENV",
    FAKE_PRICE_BOOK_FLAG,
    "VERCEL_ENV",
    "CLIENT_NETWORK_SOURCE",
    "DATABASE_URL",
  ]);

  function recordingEnvironment(
    base: Record<string, string | undefined>,
    reads: Set<string>,
  ): Record<string, string | undefined> {
    return new Proxy(base, {
      get: (target, name, receiver) => {
        if (typeof name === "string") reads.add(name);
        return Reflect.get(target, name, receiver) as string | undefined;
      },
      has: (target, name) => {
        if (typeof name === "string") reads.add(name);
        return Reflect.has(target, name);
      },
      getOwnPropertyDescriptor: (target, name) => {
        if (typeof name === "string") reads.add(name);
        return Reflect.getOwnPropertyDescriptor(target, name);
      },
      ownKeys: (target) => {
        reads.add("<ownKeys>");
        return Reflect.ownKeys(target);
      },
    });
  }

  it("is, for the selection, no more than the four it declares and never the database", () => {
    const reads = new Set<string>();
    const environment = recordingEnvironment(
      { NODE_ENV: "production", DATABASE_URL: DATABASE, SECRET_OTHER: "x" },
      reads,
    );

    selectPriceStores(environment);

    expect([...reads].filter((name) => !DECLARED.has(name))).toEqual([]);
    expect(reads.has("DATABASE_URL")).toBe(false);
  });

  it("is, for the whole choice of a production process, no more than the five it declares", async () => {
    stubEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: DATABASE,
      VERCEL_ENV: undefined,
      CLIENT_NETWORK_SOURCE: undefined,
      [FAKE_PRICE_BOOK_FLAG]: undefined,
    });
    const reads = new Set<string>();
    const realEnvironment = process.env;
    Object.defineProperty(process, "env", {
      value: recordingEnvironment({ ...realEnvironment }, reads),
      configurable: true,
    });
    let pending: Promise<PriceStores>;
    try {
      pending = getPriceStores();
    } finally {
      Object.defineProperty(process, "env", { value: realEnvironment });
    }
    await pending;

    expect(process.env).toBe(realEnvironment);
    expect([...reads].filter((name) => !DECLARED.has(name))).toEqual([]);
    expect(reads.has("DATABASE_URL")).toBe(true);
    expect(world.priceBookStores).toHaveLength(1);
  });
});

describe("a process that makes its stores on first use", () => {
  beforeEach(() => {
    stubEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: DATABASE,
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
    forgetTheProcessStores();
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

  it("makes no store in any module that imports the price stores or the price root, so a build opens no connection", async () => {
    // `VERCEL_ENV` is what makes this process production's: a production `NODE_ENV` would load React's runtime without
    // the development JSX the pages are compiled to.
    stubEnvironment({ DATABASE_URL: DATABASE, VERCEL_ENV: "production" });
    const readers = sourceFilesMatching(READERS_OF_THE_STORES)
      .filter((path) => !path.endsWith(".d.ts"))
      .map((path) => `@/${path.replace(/\.(?:ts|tsx)$/, "")}`);
    expect(readers.length).toBeGreaterThan(8);

    for (const reader of readers) {
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
  });
});
