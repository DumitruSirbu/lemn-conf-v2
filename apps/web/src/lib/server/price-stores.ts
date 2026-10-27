import "server-only";

import {
  FAKE_PRICE_BOOK_FLAG,
  FAKE_PRICE_BOOK_FLAG_ENABLED,
} from "@/lib/server/fake-price-book-flag";
import {
  seedFakePriceStores,
  type PriceStores,
} from "@/lib/server/price-book-test-seed";
import {
  UNAVAILABLE_CATALOGUE_AVAILABILITY_STORE,
  UNAVAILABLE_PRICE_BOOK_STORE,
} from "@/lib/server/unavailable-price-stores";

export type { PriceStores };

/** What `selectPriceStores` reads of the environment, and nothing else. */
export interface PriceStoreEnvironment {
  readonly NODE_ENV?: string | undefined;
  readonly [FAKE_PRICE_BOOK_FLAG]?: string | undefined;
}

export type PriceStoreSelection = "seeded-fakes" | "production";

const DEVELOPMENT_AND_TEST_MODES: readonly string[] = ["development", "test"];

/**
 * Which stores the environment asks for, as a value. The seeded fakes serve a development server, a test run and the e2e
 * server (a production build, so by its flag alone). Anything else, including an unset `NODE_ENV`, is production: the
 * choice fails toward the real stores, never toward a book that ships with the code.
 */
export function selectPriceStores(
  environment: PriceStoreEnvironment,
): PriceStoreSelection {
  const isFlagged =
    Object.hasOwn(environment, FAKE_PRICE_BOOK_FLAG) &&
    environment[FAKE_PRICE_BOOK_FLAG] === FAKE_PRICE_BOOK_FLAG_ENABLED;
  const isDevelopmentOrTest =
    environment.NODE_ENV !== undefined &&
    DEVELOPMENT_AND_TEST_MODES.includes(environment.NODE_ENV);
  return isFlagged || isDevelopmentOrTest ? "seeded-fakes" : "production";
}

/**
 * The stores production reads. The Neon stores are lane S's (S2 `NeonPriceBookStore`, S2b `NeonCatalogueAvailabilityStore`)
 * and do not exist yet, so until they merge production holds the stores that answer every call "unavailable": every
 * price surface then renders no figure and the contact route refuses (A-10). The Neon stores replace the two members here,
 * in this function and nowhere else, and are made on first use, never at import or build, as `repository.ts` makes its own.
 */
function productionPriceStores(): PriceStores {
  return {
    priceBook: UNAVAILABLE_PRICE_BOOK_STORE,
    availability: UNAVAILABLE_CATALOGUE_AVAILABILITY_STORE,
  };
}

/**
 * The key the process-wide stores are held under. On `globalThis`, not in module scope: a development server can load
 * this module more than once, and two seeded worlds would publish two different version ids, so the editor and the contact
 * route would price one request under two versions. Exported for the tests that need a fresh world.
 */
export const PRICE_STORES_GLOBAL_KEY: unique symbol = Symbol.for(
  "lemnaria.priceStores",
);

interface HoldsPriceStores {
  [PRICE_STORES_GLOBAL_KEY]: Promise<PriceStores> | undefined;
}

/**
 * The price stores of this process. The seeding is held as a promise, so two requests that arrive before it finishes await
 * one publish instead of racing two. A seeding that fails is not kept: the next request tries again, and only the
 * request that met the failure is told of it.
 */
export function getPriceStores(): Promise<PriceStores> {
  const held = globalThis as unknown as HoldsPriceStores;
  const existing = held[PRICE_STORES_GLOBAL_KEY];
  if (existing !== undefined) return existing;
  const made = makePriceStores(process.env);
  held[PRICE_STORES_GLOBAL_KEY] = made;
  made.catch(() => {
    if (held[PRICE_STORES_GLOBAL_KEY] === made) {
      held[PRICE_STORES_GLOBAL_KEY] = undefined;
    }
  });
  return made;
}

function makePriceStores(
  environment: PriceStoreEnvironment,
): Promise<PriceStores> {
  return selectPriceStores(environment) === "seeded-fakes"
    ? seedFakePriceStores()
    : Promise.resolve(productionPriceStores());
}
