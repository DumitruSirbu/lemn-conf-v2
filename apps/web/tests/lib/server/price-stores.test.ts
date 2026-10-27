import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";
import { DashboardStoreError } from "@lemnaria/persistence";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readActivePriceBook } from "@/lib/server/active-price-book";
import {
  FAKE_PRICE_BOOK_FLAG,
  FAKE_PRICE_BOOK_FLAG_ENABLED,
} from "@/lib/server/fake-price-book-flag";
import {
  getPriceStores,
  PRICE_STORES_GLOBAL_KEY,
  selectPriceStores,
} from "@/lib/server/price-stores";
import { NO_PRICE_BOOK } from "@/price/price-book-root";

// Which stores the environment asks for: the seeded fakes for development, test and the flagged e2e server, and for
// everything else the real stores, which until lane S merges them answer "unavailable" (A-10, RK-16).

function forgetTheProcessStores(): void {
  Reflect.deleteProperty(globalThis, PRICE_STORES_GLOBAL_KEY);
}

afterEach(() => {
  forgetTheProcessStores();
  vi.unstubAllEnvs();
});

describe("selecting the price stores from the environment", () => {
  it.each([
    ["development", { NODE_ENV: "development" }],
    ["test", { NODE_ENV: "test" }],
    [
      "a production build with the e2e flag",
      {
        NODE_ENV: "production",
        [FAKE_PRICE_BOOK_FLAG]: FAKE_PRICE_BOOK_FLAG_ENABLED,
      },
    ],
  ])("selects the seeded fakes for %s", (_, environment) => {
    expect(selectPriceStores(environment)).toBe("seeded-fakes");
  });

  it.each([
    ["a production build", { NODE_ENV: "production" }],
    ["an unset mode", {}],
    ["an unknown mode", { NODE_ENV: "staging" }],
    [
      "a production build with a flag that is not exactly 1",
      { NODE_ENV: "production", [FAKE_PRICE_BOOK_FLAG]: "true" },
    ],
    [
      "a production build with a padded flag",
      { NODE_ENV: "production", [FAKE_PRICE_BOOK_FLAG]: " 1" },
    ],
    [
      "the e2e flag beside a deployment's VERCEL_ENV, whatever it holds",
      {
        NODE_ENV: "production",
        [FAKE_PRICE_BOOK_FLAG]: FAKE_PRICE_BOOK_FLAG_ENABLED,
        VERCEL_ENV: "preview",
      },
    ],
    [
      "the e2e flag beside CLIENT_NETWORK_SOURCE, whatever it holds",
      {
        NODE_ENV: "production",
        [FAKE_PRICE_BOOK_FLAG]: FAKE_PRICE_BOOK_FLAG_ENABLED,
        CLIENT_NETWORK_SOURCE: "",
      },
    ],
    [
      "a development mode beside VERCEL_ENV",
      { NODE_ENV: "development", VERCEL_ENV: "production" },
    ],
    [
      "a test mode beside CLIENT_NETWORK_SOURCE",
      { NODE_ENV: "test", CLIENT_NETWORK_SOURCE: "vercel" },
    ],
  ])("selects the real stores for %s", (_, environment) => {
    expect(selectPriceStores(environment)).toBe("production");
  });
});

describe("the stores of this process", () => {
  it("hold the sample book as version 1 under test, seeded through the port, so the book is read and not shipped", async () => {
    const { priceBook } = await getPriceStores();

    const active = await priceBook.readActive();

    expect(active.kind).toBe("found");
    if (active.kind !== "found") return;
    expect(active.version.sequenceNumber).toBe(1);
    expect(active.version.book).toEqual({
      ...SAMPLE_PRICE_BOOK,
      version: active.version.versionId,
    });
  });

  it("are one world: two readers get the same version id, and a concurrent first use seeds once", async () => {
    const [first, second] = await Promise.all([
      readActivePriceBook(),
      readActivePriceBook(),
    ]);

    expect(first.kind).toBe("active");
    expect(first).toEqual(second);
    expect(await getPriceStores()).toBe(await getPriceStores());
  });

  it("are the real ones in production, and until they exist answer 'unavailable' to every call", async () => {
    vi.stubEnv("NODE_ENV", "production");
    forgetTheProcessStores();

    const { priceBook, availability } = await getPriceStores();

    await expect(priceBook.readActive()).rejects.toMatchObject({
      name: "DashboardStoreError",
      failure: "unavailable",
    });
    await expect(availability.readCurrent()).rejects.toBeInstanceOf(
      DashboardStoreError,
    );
    expect(await readActivePriceBook()).toBe(NO_PRICE_BOOK);
  });
});
