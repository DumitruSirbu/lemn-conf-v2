// M10 Q3b, R4a4's hand-off arm, end to end over the fake world: a hardware class published inactive (A-17: a created item
// is logged switched off) leaves every offered delta measured. Before this wave the tier offer priced the switched-off
// tier too, one refusal blanked its group, and the all-or-nothing rule blanked both (R4a4 recorded the gap).
//
// Stand-in, stated: the sample book holds no created class, so a shipped non-default hardware tier is logged inactive
// through the same fake call a publish makes for a created item (`appendInactive`). The root, the availability read and
// the offer are the production path.
import {
  buildKitchenLBodyCatalog,
  DEFAULT_CABINET_DEPTH_MM,
  KITCHEN_L_DESIGN,
  SAMPLE_PRICE_BOOK,
  tierRef,
} from "@lemnaria/configurator-domain";
import { FakeCatalogueAvailabilityStore } from "@lemnaria/persistence";
import { describe, expect, it } from "vitest";

import { readActivePriceBook } from "@/lib/server/active-price-book";
import { seedFakePriceStores } from "@/lib/server/price-book-test-seed";
import { offerTiersAgainstBook } from "@/price/price-book-root";

const PUBLISHED_INACTIVE = "hardware.premium";

async function offerWithAClassPublishedInactive() {
  const stores = await seedFakePriceStores();
  if (!(stores.availability instanceof FakeCatalogueAvailabilityStore))
    throw new Error("the seeded availability store is not the fake");
  stores.availability.appendInactive(tierRef("hardware", PUBLISHED_INACTIVE));
  const root = await readActivePriceBook(stores);
  if (root.kind !== "active") throw new Error("the seeded book was not read");
  return offerTiersAgainstBook(
    root,
    KITCHEN_L_DESIGN,
    buildKitchenLBodyCatalog(DEFAULT_CABINET_DEPTH_MM),
  );
}

describe("a class published inactive", () => {
  it("is in the book the root reads, so the test measures the switch and not an absent tier", () => {
    expect(
      SAMPLE_PRICE_BOOK.hardware.tiers.map((tier) => tier.tierId),
    ).toContain(PUBLISHED_INACTIVE);
  });

  it("is not offered, and is handed over unmeasured", async () => {
    const offer = await offerWithAClassPublishedInactive();

    expect(offer.hardware.tierIds).not.toContain(PUBLISHED_INACTIVE);
    expect(offer.hardware.switchedOffTiers.map((tier) => tier.tierId)).toEqual([
      PUBLISHED_INACTIVE,
    ]);
  });

  it("leaves every offered delta in both groups measured", async () => {
    const offer = await offerWithAClassPublishedInactive();

    for (const tier of [...offer.material.tiers, ...offer.hardware.tiers])
      expect(tier.deltaMinor, tier.tierId).toEqual(expect.any(Number));
    expect(offer.material.tiers.length).toBeGreaterThan(1);
    expect(offer.hardware.tiers.length).toBeGreaterThan(1);
  });
});
