import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FAKE_PRICE_BOOK_FLAG,
  FAKE_PRICE_BOOK_FLAG_ENABLED,
} from "@/lib/server/fake-price-book-flag";
import {
  selectPriceStores,
  PRICE_STORES_GLOBAL_KEY,
  type PriceStoreEnvironment,
} from "@/lib/server/price-stores";

// Adversarial QA for M10 wave R1: which stores a process holds. Fakes only for development, test and the e2e flag, anything
// else the real stores, production fails closed (A-10), and the world held on `globalThis` is seeded once however many
// requests meet it first.

const seeding = vi.hoisted(() => ({ calls: 0 }));

vi.mock("@/lib/server/price-book-test-seed", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/server/price-book-test-seed")>();
  return {
    ...original,
    seedFakePriceStores: () => {
      seeding.calls += 1;
      return original.seedFakePriceStores();
    },
  };
});

const REPOSITORY_ROOT = resolve(import.meta.dirname, "../../../../..");
const FIRST_CONCURRENT_REQUESTS = 25;

function forgetTheProcessStores(): void {
  Reflect.deleteProperty(globalThis, PRICE_STORES_GLOBAL_KEY);
}

beforeEach(() => {
  seeding.calls = 0;
  forgetTheProcessStores();
});

afterEach(() => {
  forgetTheProcessStores();
  vi.unstubAllEnvs();
  vi.resetModules();
});

function expectedSelection(environment: PriceStoreEnvironment) {
  const isFlagged = environment[FAKE_PRICE_BOOK_FLAG] === "1";
  const isDevelopmentOrTest =
    environment.NODE_ENV === "development" || environment.NODE_ENV === "test";
  return isFlagged || isDevelopmentOrTest ? "seeded-fakes" : "production";
}

describe("which stores the environment selects", () => {
  const modes = fc.oneof(
    fc.constantFrom(
      "development",
      "test",
      "production",
      "Development",
      "TEST",
      " test",
      "test ",
      "test\n",
      "dev",
      "prod",
      "staging",
      "preview",
      "",
    ),
    fc.string({ maxLength: 12 }),
    fc.constant(undefined),
  );
  const flags = fc.oneof(
    fc.constantFrom(
      "1",
      "01",
      " 1",
      "1 ",
      "true",
      "TRUE",
      "yes",
      "0",
      "",
      "11",
    ),
    fc.string({ maxLength: 6 }),
    fc.constant(undefined),
  );

  it("is the seeded fakes for exactly development, test and the flag spelled 1, over any mode and any flag", () => {
    fc.assert(
      fc.property(modes, flags, (mode, flag) => {
        const environment: PriceStoreEnvironment = {
          NODE_ENV: mode,
          [FAKE_PRICE_BOOK_FLAG]: flag,
        };

        expect(
          selectPriceStores(environment),
          JSON.stringify(environment),
        ).toBe(expectedSelection(environment));
      }),
      { numRuns: 1000 },
    );
  });

  it("does not take a flag the environment merely inherits", () => {
    const inherited = Object.create({
      [FAKE_PRICE_BOOK_FLAG]: FAKE_PRICE_BOOK_FLAG_ENABLED,
    }) as PriceStoreEnvironment;
    Object.assign(inherited, { NODE_ENV: "production" });

    expect(selectPriceStores(inherited)).toBe("production");
  });

  it("is production for an environment that says nothing", () => {
    expect(selectPriceStores({})).toBe("production");
  });
});

describe("the world a process holds", () => {
  it("is seeded once when many requests meet it first, and every one reads the same version", async () => {
    const { readActivePriceBook } = await import(
      "@/lib/server/active-price-book"
    );

    const roots = await Promise.all(
      Array.from({ length: FIRST_CONCURRENT_REQUESTS }, () =>
        readActivePriceBook(),
      ),
    );

    expect(seeding.calls).toBe(1);
    const versionIds = roots.map((root) =>
      root.kind === "active" ? root.versionId : "none",
    );
    expect(new Set(versionIds).size).toBe(1);
    expect(versionIds[0]).not.toBe("none");
  });

  it("is one world for two loads of the module, as a development server makes", async () => {
    const first = await import("@/lib/server/price-stores");
    const firstStores = await first.getPriceStores();
    vi.resetModules();
    const second = await import("@/lib/server/price-stores");

    const secondStores = await second.getPriceStores();

    expect(second).not.toBe(first);
    expect(secondStores).toBe(firstStores);
    expect(seeding.calls).toBe(1);
  });

  it("is never seeded in production, and nothing is read from it", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { readActivePriceBook } = await import(
      "@/lib/server/active-price-book"
    );

    const roots = await Promise.all(
      Array.from({ length: FIRST_CONCURRENT_REQUESTS }, () =>
        readActivePriceBook(),
      ),
    );

    expect(seeding.calls).toBe(0);
    for (const root of roots) expect(root).toStrictEqual({ kind: "none" });
  });

  it("is never seeded in production with the flag not spelled 1", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(FAKE_PRICE_BOOK_FLAG, "true");
    const { getPriceStores } = await import("@/lib/server/price-stores");

    await getPriceStores();

    expect(seeding.calls).toBe(0);
  });

  it("is seeded in a production build with the flag, which is the e2e server", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(FAKE_PRICE_BOOK_FLAG, FAKE_PRICE_BOOK_FLAG_ENABLED);
    const { getPriceStores } = await import("@/lib/server/price-stores");

    await getPriceStores();

    expect(seeding.calls).toBe(1);
  });
});

describe("the e2e flag is the e2e server's alone", () => {
  function filesUnder(directory: string): string[] {
    if (!existsSync(directory)) return [];
    return readdirSync(directory, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name));
  }

  it("is named in no environment example, no deployment configuration and no workflow", () => {
    const deployment = [
      join(REPOSITORY_ROOT, ".env.example"),
      join(REPOSITORY_ROOT, "apps/web/.env.example"),
      join(REPOSITORY_ROOT, "apps/web/vercel.json"),
      join(REPOSITORY_ROOT, "apps/web/package.json"),
      join(REPOSITORY_ROOT, "package.json"),
      ...filesUnder(join(REPOSITORY_ROOT, ".github")),
    ].filter(existsSync);

    expect(deployment.length).toBeGreaterThan(2);
    const naming = deployment.filter((path) =>
      readFileSync(path, "utf8").includes("FAKE_PRICE_BOOK"),
    );

    expect(naming).toEqual([]);
  });

  it("is named, in the application's own code, by the selection and its one definition alone", () => {
    const sourceRoot = join(REPOSITORY_ROOT, "apps/web/src");
    const naming = filesUnder(sourceRoot)
      .filter((path) => /\.(?:ts|tsx)$/.test(path))
      .filter((path) => readFileSync(path, "utf8").includes("FAKE_PRICE_BOOK"))
      .map((path) => path.slice(sourceRoot.length + 1))
      .sort();

    expect(naming).toEqual([
      "lib/server/fake-price-book-flag.ts",
      "lib/server/price-stores.ts",
    ]);
  });
});
