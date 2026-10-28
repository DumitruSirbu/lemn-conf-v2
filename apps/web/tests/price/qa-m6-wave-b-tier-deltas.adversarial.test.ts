// Adversarial QA for M6 remediation wave B, surface half: a tier's delta is addressed by **group and
// id**, never by id alone (M6-AUD-003).
//
// `whole-kitchen-tier-group-keys.test.ts` asserts the anti-invariant — no material tier shows an
// amount that appears in the hardware set. This file asserts the positive one, which is the stronger
// statement and the one a customer reads: **every published delta is the amount measured for that
// tier, in that group.** An anti-invariant over a set of amounts passes trivially the moment the
// deltas are absent, and with the parser refusing a cross-group collision that is exactly what the
// collided book now produces.
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  priceDesign,
  SAMPLE_PRICE_BOOK,
  type HardwareTier,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  offerWholeKitchenTiers,
  type WholeKitchenTierOffer,
} from "@/price/whole-kitchen-tiers";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";
import { NOTHING_DISABLED } from "../support/availability";

const BOOK = SAMPLE_PRICE_BOOK;

function measure(book: PriceBook = BOOK): WholeKitchenTierOffer {
  return offerWholeKitchenTiers({
    design: KITCHEN_L_DESIGN,
    catalog: KITCHEN_L_BODY_CATALOG,
    book,
    pricingVersion: BOOK.version,
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
    selections: KITCHEN_L_DESIGN.settings,
  });
}

/** The seeded kitchen's total under one overriding selection, measured the way the module measures
 *  it: the pure query, with the other group left at what the design carries. */
function totalAt(selection: {
  readonly materialTierId?: string;
  readonly hardwareTierId?: string;
}): number {
  const result = priceDesign({
    design: KITCHEN_L_DESIGN,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: BOOK,
    pricingVersion: BOOK.version,
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
    selections: { ...KITCHEN_L_DESIGN.settings, ...selection },
  });
  if (!result.ok)
    throw new Error(`the seeded kitchen did not price: ${result.failure.code}`);
  return result.priced.totalMinor;
}

describe("every published delta is the amount measured for that tier in that group", () => {
  it("gives each material tier the difference its own group's baseline makes", () => {
    const baselineMinor = totalAt({
      materialTierId: BOOK.material.defaultTierId,
    });
    const offered = measure().material.tiers;

    const measured = offered.map((tier) => ({
      tierId: tier.tierId,
      deltaMinor: tier.deltaMinor,
    }));

    expect(measured).toEqual(
      BOOK.material.tiers.map((tier) => ({
        tierId: tier.tierId,
        deltaMinor: totalAt({ materialTierId: tier.tierId }) - baselineMinor,
      })),
    );
  });

  it("gives each hardware tier the difference its own group's baseline makes", () => {
    const baselineMinor = totalAt({
      hardwareTierId: BOOK.hardware.defaultTierId,
    });
    const offered = measure().hardware.tiers;

    const measured = offered.map((tier) => ({
      tierId: tier.tierId,
      deltaMinor: tier.deltaMinor,
    }));

    expect(measured).toEqual(
      BOOK.hardware.tiers.map((tier) => {
        const deltaMinor =
          totalAt({ hardwareTierId: tier.tierId }) - baselineMinor;
        // A hardware tier that prices this design below its group's default is offered with no
        // badge rather than with a minus sign (`BelowDefaultTierRule`).
        return deltaMinor < 0
          ? { tierId: tier.tierId, deltaMinor: undefined }
          : { tierId: tier.tierId, deltaMinor };
      }),
    );
  });

  it("names the two groups' deltas apart even where both offer the same amounts", () => {
    // The group-keyed map's own property, exercised without a collided book: a material tier and a
    // hardware tier that happen to measure to the **same** amount must still each read their own
    // group's map. A single flattened map keyed on the bare id could satisfy the anti-invariant
    // test and still be wrong here the moment two ids matched.
    const offer = measure();

    const materialIds = new Set(
      offer.material.tiers.map((tier) => tier.tierId),
    );
    const hardwareIds = new Set(
      offer.hardware.tiers.map((tier) => tier.tierId),
    );

    expect([...materialIds].some((tierId) => hardwareIds.has(tierId))).toBe(
      false,
    );
    expect(offer.material.tierIds).toEqual(
      BOOK.material.tiers.map((tier) => tier.tierId),
    );
    expect(offer.hardware.tierIds).toEqual(
      BOOK.hardware.tiers.map((tier) => tier.tierId),
    );
  });
});

describe("a cross-group tier-id collision costs the numbers and never the choice", () => {
  function bookCollidingTierIds(): {
    readonly book: PriceBook;
    readonly tierId: string;
  } {
    const collided = BOOK.material.tiers[2];
    if (!collided)
      throw new Error("the sample offers fewer than three material tiers");
    const tiers: readonly HardwareTier[] = BOOK.hardware.tiers.map(
      (tier, index) =>
        index === 1 ? { ...tier, tierId: collided.tierId } : tier,
    );
    return {
      book: { ...BOOK, hardware: { ...BOOK.hardware, tiers } },
      tierId: collided.tierId,
    };
  }

  it("publishes no delta at all once the parser refuses the collided book", () => {
    // The consequence the second layer is no longer reachable through: `parsePriceBook` refuses the
    // collided book, so every one of the six evaluations fails and the whole set degrades. Recorded
    // so a later relaxation of the parser rule is visible here rather than silent.
    const { book } = bookCollidingTierIds();

    const offer = measure(book);

    expect(
      [...offer.material.tiers, ...offer.hardware.tiers].every(
        (tier) => tier.deltaMinor === undefined,
      ),
    ).toBe(true);
  });

  it("still offers both groups' full tier lists, which is the control that repairs the book", () => {
    const { book } = bookCollidingTierIds();

    const offer = measure(book);

    expect(() => measure(book)).not.toThrow();
    expect(offer.material.tierIds).toEqual(
      BOOK.material.tiers.map((tier) => tier.tierId),
    );
    expect(offer.hardware.tierIds).toHaveLength(BOOK.hardware.tiers.length);
  });

  it("never shows a material tier an amount measured for a hardware one", () => {
    const { book, tierId } = bookCollidingTierIds();
    const hardwareAmounts = new Set(
      measure().hardware.tiers.map((tier) => tier.deltaMinor),
    );

    const collided = measure(book).material.tiers.find(
      (tier) => tier.tierId === tierId,
    );

    expect(collided).toBeDefined();
    expect(hardwareAmounts.has(collided?.deltaMinor)).toBe(false);
  });
});
