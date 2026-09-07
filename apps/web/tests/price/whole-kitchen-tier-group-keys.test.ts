// Wave 6-B of the M6 audit remediation: a tier's delta is addressed by **group and id**, never by
// id alone (M6-AUD-003).
//
// `measureEveryDelta` used to compute the two groups' deltas separately and then flatten them —
// `new Map([...material, ...hardware])` — while `offeredGroup` looked up the bare `tierId`. A
// hardware id equal to a material one therefore overwrote the material amount, and the audit's
// measured witness was an 18 000 MDL veneer upgrade displayed as the 6 197,60 a hardware tier costs:
//
//     normal:   { hardwareSoftClose: 619760, materialVeneer: 1800000 }
//     collided: { hardware: 619760,          material: 619760 }
//
// **Two layers protect this, and this file exercises both ends of the composition.** `parsePriceBook`
// refuses a book that repeats a tier id across the groups, so the collided book can no longer be
// priced at all; and the surface keys by group regardless, so a future relaxation of that rule cannot
// turn into wrong money. What is asserted here is the property that must hold either way: **no
// material tier ever displays an amount measured for a hardware tier.**
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  SAMPLE_PRICE_BOOK,
  type HardwareTier,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  offerWholeKitchenTiers,
  type WholeKitchenTierOffer,
} from "@/price/whole-kitchen-tiers";

const BOOK = SAMPLE_PRICE_BOOK;

function measure(book: PriceBook = BOOK): WholeKitchenTierOffer {
  return offerWholeKitchenTiers({
    design: KITCHEN_L_DESIGN,
    catalog: KITCHEN_L_BODY_CATALOG,
    book,
    pricingVersion: BOOK.version,
    selections: KITCHEN_L_DESIGN.settings,
  });
}

/** The audit's collided book: the second hardware tier renamed onto the third material tier's id,
 *  with its rule id left alone so the collision is the tier id and nothing else. */
function bookCollidingTierIds(): {
  readonly book: PriceBook;
  readonly tierId: string;
} {
  const tierId = BOOK.material.tiers[2]?.tierId ?? "";
  const tiers: readonly HardwareTier[] = BOOK.hardware.tiers.map(
    (tier, index) => (index === 1 ? { ...tier, tierId } : tier),
  );
  return { book: { ...BOOK, hardware: { ...BOOK.hardware, tiers } }, tierId };
}

describe("a material tier never shows a hardware tier's amount", () => {
  it("prices the shipped book's veneer upgrade at the book's own whole-kitchen amount", () => {
    // The `normal` half of the witness. Read off the book rather than written as a literal, so a
    // repriced sample moves the expectation with it.
    const veneer = BOOK.material.tiers[2];
    if (!veneer)
      throw new Error("the sample offers fewer than three material tiers");
    const offered = measure().material.tiers.find(
      (tier) => tier.tierId === veneer.tierId,
    );

    expect(offered?.deltaMinor).toBe(veneer.wholeKitchenMinor);
  });

  it("shows no material tier a hardware amount when the two groups collide on an id", () => {
    const { book, tierId } = bookCollidingTierIds();
    const hardwareAmounts = new Set(
      measure().hardware.tiers.map((tier) => tier.deltaMinor),
    );

    const offered = measure(book).material.tiers.find(
      (tier) => tier.tierId === tierId,
    );

    expect(offered).toBeDefined();
    expect(
      offered?.deltaMinor === undefined ||
        !hardwareAmounts.has(offered.deltaMinor),
    ).toBe(true);
  });

  it("answers the collided book without raising, so the settings sheet still offers the choice", () => {
    // The module's own standing rule: a pricing failure costs the customer the numbers, never the
    // control that could put the document right.
    const { book } = bookCollidingTierIds();

    expect(() => measure(book)).not.toThrow();
    expect(measure(book).material.tierIds).toEqual(
      BOOK.material.tiers.map((tier) => tier.tierId),
    );
  });
});
