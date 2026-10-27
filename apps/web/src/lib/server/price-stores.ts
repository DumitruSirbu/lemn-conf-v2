import "server-only";

import type {
  CatalogueAvailabilityStore,
  PriceBookStore,
} from "@lemnaria/persistence";

import {
  FAKE_PRICE_BOOK_FLAG,
  FAKE_PRICE_BOOK_FLAG_ENABLED,
} from "@/lib/server/fake-price-book-flag";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import {
  UNAVAILABLE_CATALOGUE_AVAILABILITY_STORE,
  UNAVAILABLE_PRICE_BOOK_STORE,
} from "@/lib/server/unavailable-price-stores";

/** The two stores a price reader needs, whichever environment made them. */
export interface PriceStores {
  readonly priceBook: PriceBookStore;
  readonly availability: CatalogueAvailabilityStore;
}

/** What `selectPriceStores` reads of the environment, and nothing else. */
export interface PriceStoreEnvironment {
  readonly NODE_ENV?: string | undefined;
  readonly [FAKE_PRICE_BOOK_FLAG]?: string | undefined;
  readonly VERCEL_ENV?: string | undefined;
  readonly [CLIENT_NETWORK_SOURCE_VARIABLE]?: string | undefined;
}

export type PriceStoreSelection = "seeded-fakes" | "production";

const DEVELOPMENT_AND_TEST_MODES: readonly string[] = ["development", "test"];

/**
 * Which stores the environment asks for, as a value. The seeded fakes serve a development server, a test run and the e2e
 * server (a production build, so by its flag alone). Anything else, including an unset `NODE_ENV`, is production: the
 * choice fails toward the real stores, never toward a book that ships with the code.
 *
 * `VERCEL_ENV` vetoes every request for the fakes, the flag included: production is the choice that refuses to price
 * rather than prices from a sample. `CLIENT_NETWORK_SOURCE`, the owner's own marker of a deployment, vetoes a
 * development or test mode but not the flag, because the e2e harness's second servers name a network source to prove the
 * figures of a production deployment and still have to read the sample book to render a page. That differs from
 * `choosePolicy`, which refuses its e2e policy beside either variable.
 */
export function selectPriceStores(
  environment: PriceStoreEnvironment,
): PriceStoreSelection {
  if (isNamed(environment, "VERCEL_ENV")) return "production";
  if (isFlagged(environment)) return "seeded-fakes";
  const isDevelopmentOrTest =
    environment.NODE_ENV !== undefined &&
    DEVELOPMENT_AND_TEST_MODES.includes(environment.NODE_ENV);
  const isNamingNetworkSource = isNamed(
    environment,
    CLIENT_NETWORK_SOURCE_VARIABLE,
  );
  return isDevelopmentOrTest && !isNamingNetworkSource
    ? "seeded-fakes"
    : "production";
}

function isFlagged(environment: PriceStoreEnvironment): boolean {
  return (
    Object.hasOwn(environment, FAKE_PRICE_BOOK_FLAG) &&
    environment[FAKE_PRICE_BOOK_FLAG] === FAKE_PRICE_BOOK_FLAG_ENABLED
  );
}

/** Named at all, whatever it holds: an own member, never one the environment merely inherits. */
function isNamed(
  environment: PriceStoreEnvironment,
  name: "VERCEL_ENV" | typeof CLIENT_NETWORK_SOURCE_VARIABLE,
): boolean {
  return Object.hasOwn(environment, name);
}

/**
 * The stores production reads. Until the real stores exist it holds the stores that answer every call "unavailable", so
 * every price surface renders no figure and the contact route refuses (A-10). The real stores replace the two members here
 * and nowhere else, made on first use and never at import or build, as `repository.ts` makes its own.
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

/** The seeding helper is loaded only on the branch that seeds, so a production build's graph never reaches the sample. */
async function makePriceStores(
  environment: PriceStoreEnvironment,
): Promise<PriceStores> {
  if (selectPriceStores(environment) === "production") {
    return productionPriceStores();
  }
  const { seedFakePriceStores } = await import(
    "@/lib/server/price-book-test-seed"
  );
  return seedFakePriceStores();
}
