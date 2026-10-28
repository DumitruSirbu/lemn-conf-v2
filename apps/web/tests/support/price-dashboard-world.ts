import {
  SAMPLE_PRICE_BOOK,
  type CabinetPriceRule,
  type MaterialTier,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import {
  FakeCatalogueAvailabilityStore,
  FakeDashboardAuditLedger,
  FakePriceBookStore,
  FakeRevisionHead,
} from "@lemnaria/persistence";

import { IDLE_LIFETIME_SECONDS_BY_ROLE } from "@/lib/server/account/session-lifetimes";
import { stampedWithItsVersionId } from "@/lib/server/price-book-test-seed";
import type { PriceStores } from "@/lib/server/price-stores";

import { currentAccountWorld } from "./account-world";
import { signedInAs } from "./staff-world";

// The price dashboard routes' world for a test: the persistence package's fake price-book and availability stores, joined to
// the account world's sessions the way the database joins them (a write's actor is the account of the live session the
// cookie names, and the audit row commits with the write or not at all). A test mocks `@/lib/server/price-stores` with
// `priceStoresModule()` and calls `freshPriceDashboardWorld()` after `freshAccountWorld()` (and `freshStaffWorld()`, whose
// audit store the read's `price-catalogue-viewed` row goes to).
//
// The sample book is the flat form, in which no cabinet price is editable, so the world publishes `ANCHORED_BOOK`: the same
// rows with the anchored formulas, percentage material tiers and a depth rule of the form the dashboard edits.

export interface PriceDashboardWorld {
  readonly stores: PriceStores;
  readonly priceBook: FakePriceBookStore;
  /** The audit log every draft write commits its row to. */
  readonly ledger: FakeDashboardAuditLedger;
  /** The id of the version the world published, or `undefined` while none was. */
  readonly versionId: string | undefined;
}

let current: PriceDashboardWorld | undefined;

export function currentPriceDashboardWorld(): PriceDashboardWorld {
  if (current === undefined) {
    throw new Error(
      "No price dashboard world: call freshPriceDashboardWorld() in beforeEach",
    );
  }
  return current;
}

/** How many times a route asked for the stores: a request refused before any store is read leaves it at 0. */
export const priceStoreAsks = { count: 0 };

export function priceStoresModule() {
  return {
    getPriceStores: () => {
      priceStoreAsks.count += 1;
      return Promise.resolve(currentPriceDashboardWorld().stores);
    },
  };
}

export interface PriceDashboardWorldOptions {
  /** Whether the book is published as version 1. `false` is the state before the first version. */
  readonly isPublished?: boolean;
  /**
   * The book published as version 1. `ANCHORED_BOOK` by default: the draft routes only parse a candidate. A publish also
   * judges it against the catalogue, which `ANCHORED_BOOK` does not pass (it anchors the corner rows), so a test that
   * publishes passes a book that does, such as the sample book.
   */
  readonly book?: PriceBook;
}

export async function freshPriceDashboardWorld({
  isPublished = true,
  book = ANCHORED_BOOK,
}: PriceDashboardWorldOptions = {}): Promise<PriceDashboardWorld> {
  const { sessions, now } = currentAccountWorld();
  const ledger = new FakeDashboardAuditLedger({ sessions, now });
  const availability = new FakeCatalogueAvailabilityStore({
    head: new FakeRevisionHead(),
    ledger,
  });
  const priceBook = new FakePriceBookStore({ ledger, availability, now });
  const versionId = isPublished
    ? await publishFirstVersion(priceBook, book)
    : undefined;
  const world: PriceDashboardWorld = {
    stores: { priceBook: stampedWithItsVersionId(priceBook), availability },
    priceBook,
    ledger,
    versionId,
  };
  current = world;
  priceStoreAsks.count = 0;
  return world;
}

/** Publishes `book` as version 1, as an administrator's seed does. */
async function publishFirstVersion(
  store: FakePriceBookStore,
  book: PriceBook,
): Promise<string> {
  const publisher = await signedInAs(
    { role: "administrator" },
    "price-publisher@example.test",
  );
  const published = await store.publish({
    expectedDraftRevision: "0",
    expectedActiveSequence: 0,
    expectedAvailabilityRevision: "0",
    createdItems: [],
    label: "Version 1",
    note: "",
    book,
    changeSummary: [],
    audit: {
      session: {
        sessionTokenHash: publisher.session.tokenHash,
        idleLifetimeSeconds: IDLE_LIFETIME_SECONDS_BY_ROLE,
      },
      entry: {
        action: "price-published",
        detail: { provisional: book.amountsProvisional },
      },
    },
  });
  if (published.kind !== "ok") throw new Error("seed: publish refused");
  return published.versionId;
}

// ---------------------------------------------------------------------------------------------------------------------
// The book

const ANCHOR_WIDTH_MM = 600;
const FIXED_SIZES_RULE_BUILD_ID = "base-panbank";
const FIXED_SIZES = [
  { widthMm: 400, amountMinor: 120_000 },
  { widthMm: 600, amountMinor: 140_000 },
];

function anchoredRules(): readonly CabinetPriceRule[] {
  let manufacturerRows = 0;
  return SAMPLE_PRICE_BOOK.cabinetRules.map((rule) => {
    if (rule.suppliedBy === "customer") return rule;
    const anchorMinor = 100_000 + manufacturerRows * 10_000;
    manufacturerRows += 1;
    const formula =
      rule.buildId === FIXED_SIZES_RULE_BUILD_ID
        ? { shape: "price-per-size" as const, sizes: FIXED_SIZES }
        : {
            shape: "anchored-width" as const,
            anchorWidthMm: ANCHOR_WIDTH_MM,
            anchorMinor,
            perStepWiderMinor: 8_000,
            perStepNarrowerMinor: 6_000,
          };
    return { ...rule, formula };
  });
}

function percentageTiers(): readonly MaterialTier[] {
  const percents = [0, 25, 60];
  return SAMPLE_PRICE_BOOK.material.tiers.map((tier, index) => {
    return {
      ...tier,
      percentOfCabinets: percents[index] ?? 0,
    } as unknown as MaterialTier;
  });
}

export const ANCHORED_BOOK: PriceBook = {
  ...SAMPLE_PRICE_BOOK,
  cabinetRules: anchoredRules(),
  material: {
    defaultTierId: SAMPLE_PRICE_BOOK.material.defaultTierId,
    tiers: percentageTiers(),
  },
  depthRule: { deepCabinetPercent: 15 },
};

function ruleIdOfShape(shape: string): string {
  const rule = ANCHORED_BOOK.cabinetRules.find(
    (row) => row.formula.shape === shape,
  );
  if (rule === undefined) throw new Error(`the book has no ${shape} row`);
  return rule.ruleId;
}

function customerRuleId(): string {
  const rule = ANCHORED_BOOK.cabinetRules.find(
    (row) => row.suppliedBy === "customer",
  );
  if (rule === undefined) throw new Error("the book has no customer row");
  return rule.ruleId;
}

/** A manufacturer row priced by an anchored formula: its `anchorMinor` is an editable cabinet price. */
export const ANCHORED_RULE_ID = ruleIdOfShape("anchored-width");
/** A manufacturer row that lists fixed sizes: its prices are addressed by width. */
export const FIXED_SIZES_RULE_ID = ruleIdOfShape("price-per-size");
/** A row the customer supplies, which has no price to edit. */
export const CUSTOMER_RULE_ID = customerRuleId();
