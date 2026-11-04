import {
  NeonCatalogueAvailabilityStore,
  NeonPriceBookStore,
} from "@lemnaria/persistence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readActivePriceBook } from "@/lib/server/active-price-book";
import {
  getPriceStores,
  PRICE_STORES_GLOBAL_KEY,
} from "@/lib/server/price-stores";

// Adversarial QA for M10 wave W1 with the persistence package's own Neon stores, never replaced: what making them costs,
// and what a connection string the driver refuses does to a request. No request reaches a network.

const DATABASE = "postgres://user:pass@w1-qa.database.invalid/db";
const SECRET_WORD = "w1-qa-secret-7f3a";
const SECRET_BEARING_REFUSAL = `${SECRET_WORD} is not a connection string`;

function forgetTheProcessStores(): void {
  Reflect.deleteProperty(globalThis, PRICE_STORES_GLOBAL_KEY);
}

let network: ReturnType<typeof vi.fn>;
let written: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  forgetTheProcessStores();
  network = vi.fn(() => Promise.reject(new Error("no network in this test")));
  vi.stubGlobal("fetch", network);
  vi.stubEnv("VERCEL_ENV", "production");
  written = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  forgetTheProcessStores();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("production's stores made by the persistence package", () => {
  it("are its two Neon stores, made without a request to the network", async () => {
    vi.stubEnv("DATABASE_URL", DATABASE);

    const { priceBook, availability } = await getPriceStores();

    expect(priceBook).toBeInstanceOf(NeonPriceBookStore);
    expect(availability).toBeInstanceOf(NeonCatalogueAvailabilityStore);
    expect(network).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a value that is no connection string",
      SECRET_BEARING_REFUSAL,
      SECRET_WORD,
    ],
    ["a value of only blanks", "   ", "DATABASE_URL=   "],
  ])(
    "are refused to the request that met %s, with nothing of the value in the refusal, and are made by the next request once the value is mended",
    async (_, value, leak) => {
      vi.stubEnv("DATABASE_URL", value);

      const refusal = await getPriceStores().then(
        () => undefined,
        (failure: unknown) => failure,
      );

      expect(refusal).toBeInstanceOf(Error);
      expect((refusal as Error).message).not.toContain(leak);
      vi.stubEnv("DATABASE_URL", DATABASE);
      const mended = await getPriceStores();
      expect(mended.priceBook).toBeInstanceOf(NeonPriceBookStore);
      expect(await getPriceStores()).toBe(mended);
    },
  );

  it("make a price root that is refused, not one of no book, when the driver refuses the value, and the line carries no word of it", async () => {
    vi.stubEnv("DATABASE_URL", SECRET_BEARING_REFUSAL);

    await expect(readActivePriceBook()).rejects.toThrow();

    const lines = JSON.stringify(written.mock.calls);
    expect(lines).toContain("unexpected");
    expect(lines).not.toContain(SECRET_WORD);
  });
});
