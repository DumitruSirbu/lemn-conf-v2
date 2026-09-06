// Wave 6G's measured deltas, and the book shape that keeps them measurable.
//
// **The assertion that matters is that a delta is not the book's own number.** Both hardware tiers
// that cost anything are stated *per cabinet handle* (ADR 0061 decision 2), so a surface that
// rendered `perCabinetHandleMinor` would print a per-handle rate as a whole-kitchen figure — a
// number the customer would read as the price of the upgrade and which is wrong by the number of
// handles in their kitchen. Every case below compares against a second, independent evaluation of
// `priceDesign` rather than against a literal, so nothing here can agree with the book by
// transcription.
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  priceDesign,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type Design,
  type PriceBook,
  type TierIdentity,
  type WholeKitchenSelections,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  offerWholeKitchenTiers,
  NegativeTierDeltaError,
  UnofferedDefaultTierError,
  type OfferedTierGroup,
  type WholeKitchenTierOffer,
} from "@/price/whole-kitchen-tiers";

function measure(
  design: Design = KITCHEN_L_DESIGN,
  book: PriceBook = SAMPLE_PRICE_BOOK,
): WholeKitchenTierOffer {
  return offerWholeKitchenTiers({
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    book,
    pricingVersion: book.version,
    selections: design.settings,
  });
}

/** A second, independent path to the same total — the one the deltas are supposed to be differences
 *  of. Written out here rather than imported from the module under test, so an agreement is not an
 *  agreement with itself. */
function totalAt(selections: WholeKitchenSelections): number {
  const result = priceDesign({
    design: KITCHEN_L_DESIGN,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections,
  });
  if (!result.ok) throw new Error("the seeded design was expected to price");
  return result.priced.totalMinor;
}

const SHIPPED = measure();

describe("a tier's delta is the whole kitchen, twice", () => {
  it("is the design at that tier less the design at its group's default, for material", () => {
    for (const tier of SHIPPED.material.tiers) {
      expect(tier.deltaMinor, tier.tierId).toBe(
        totalAt({ materialTierId: tier.tierId }) -
          totalAt({ materialTierId: SHIPPED.material.defaultTierId }),
      );
    }
  });

  it("is the design at that tier less the design at its group's default, for hardware", () => {
    for (const tier of SHIPPED.hardware.tiers) {
      expect(tier.deltaMinor, tier.tierId).toBe(
        totalAt({ hardwareTierId: tier.tierId }) -
          totalAt({ hardwareTierId: SHIPPED.hardware.defaultTierId }),
      );
    }
  });

  it("charges nothing for the tier a kitchen that chose nothing already has", () => {
    expect(deltaOf(SHIPPED.material, SHIPPED.material.defaultTierId)).toBe(0);
    expect(deltaOf(SHIPPED.hardware, SHIPPED.hardware.defaultTierId)).toBe(0);
  });

  it("does not print a hardware tier's per-mechanism rate as a whole-kitchen figure", () => {
    // The case this wave's open question warns about, made falsifiable: the seeded kitchen carries
    // many more than one mechanism of each kind, so a delta equal to any one of the book's own
    // three rates would mean the surface had transcribed a rate. Swept over all three since wave 6T
    // replaced the single per-handle rate with them (ADR 0070 decision 1) — checking one would
    // leave a surface that transcribed either of the others green.
    for (const tier of SAMPLE_PRICE_BOOK.hardware.tiers) {
      const deltaMinor = deltaOf(SHIPPED.hardware, tier.tierId);
      if (deltaMinor === 0) continue;
      for (const rateMinor of [
        tier.perHingeMinor,
        tier.perDrawerMinor,
        tier.perPushToOpenMinor,
      ]) {
        expect(deltaMinor, `${tier.tierId} @ ${String(rateMinor)}`).not.toBe(
          rateMinor,
        );
      }
      expect(deltaMinor, tier.tierId).toBeGreaterThan(tier.perHingeMinor);
    }
  });

  it("holds every material tier's delta to the book's own whole-kitchen amount, which is the one group where the two agree", () => {
    // The material term *is* stated per kitchen, so here the measurement and the book must land on
    // the same number. Asserted because it is the case that would hide a broken measurement: if the
    // hardware assertion above were the only one, a delta of zero everywhere would still pass it.
    for (const tier of SAMPLE_PRICE_BOOK.material.tiers) {
      expect(deltaOf(SHIPPED.material, tier.tierId), tier.tierId).toBe(
        tier.wholeKitchenMinor -
          defaultTierOf(SAMPLE_PRICE_BOOK.material).wholeKitchenMinor,
      );
    }
  });
});

describe("what the book must look like for a delta to be an addition", () => {
  it("defaults each group to its cheapest tier", () => {
    // The precondition of the refusal below. If this ever goes red, the sample book has grown a tier
    // that costs less than what a kitchen gets for free, and what a minus sign in the delta badge
    // means to a customer is an owner's decision rather than an implementer's.
    expect(cheapestDeltaTierId(SHIPPED.material)).toBe(
      SHIPPED.material.defaultTierId,
    );
    expect(cheapestDeltaTierId(SHIPPED.hardware)).toBe(
      SHIPPED.hardware.defaultTierId,
    );
  });

  it("refuses a book whose default is not its cheapest tier, rather than rendering a discount", () => {
    const inverted = withMaterialDefault("material.veneer");

    expect(() => measure(KITCHEN_L_DESIGN, inverted)).toThrow(
      NegativeTierDeltaError,
    );
  });

  it("names the tier and the shortfall, so a book fault is reported rather than guessed at", () => {
    expect(() =>
      measure(KITCHEN_L_DESIGN, withMaterialDefault("material.veneer")),
    ).toThrow(/material\.melamine/);
  });

  it("refuses a group whose declared default it does not offer", () => {
    expect(() =>
      measure(KITCHEN_L_DESIGN, withMaterialDefault("material.no-such-tier")),
    ).toThrow(UnofferedDefaultTierError);
  });
});

describe("what the offer publishes", () => {
  it("lists every id the book offers, in the book's own order", () => {
    expect(SHIPPED.material.tierIds).toEqual(
      SAMPLE_PRICE_BOOK.material.tiers.map((tier) => tier.tierId),
    );
    expect(SHIPPED.hardware.tierIds).toEqual(
      SAMPLE_PRICE_BOOK.hardware.tiers.map((tier) => tier.tierId),
    );
  });

  it("carries each tier's own name and description, and composes neither", () => {
    for (const tier of SAMPLE_PRICE_BOOK.material.tiers) {
      const offered = SHIPPED.material.tiers.find(
        (one) => one.tierId === tier.tierId,
      );
      expect(offered?.name).toBe(tier.name);
      expect(offered?.description).toBe(tier.description);
    }
  });

  it("still lists every tier for a design the book cannot price, stating no delta", () => {
    // A version the book does not carry: `priceDesign` refuses the whole request, so there is no
    // baseline to subtract from and no honest delta to state — **and the tiers are still offered.**
    // The list is the one control that could put a broken document right, so a pricing failure
    // costs the customer numbers and never the choice.
    const offer = offerWholeKitchenTiers({
      design: KITCHEN_L_DESIGN,
      catalog: KITCHEN_L_BODY_CATALOG,
      book: SAMPLE_PRICE_BOOK,
      pricingVersion: `${SAMPLE_PRICE_BOOK_VERSION}-retired`,
    });

    expect(offer.material.tierIds).toEqual(
      SAMPLE_PRICE_BOOK.material.tiers.map((tier) => tier.tierId),
    );
    for (const group of [offer.material, offer.hardware])
      for (const tier of group.tiers)
        expect(tier.deltaMinor, tier.tierId).toBeUndefined();
  });

  it("drops both groups' deltas together when only one of them could be measured", () => {
    // A withdrawn *material* id fails every hardware evaluation — each holds material at what the
    // design carries — while every material evaluation succeeds by overriding the bad key. Half a
    // set would put two groups on one screen measured against different kitchens.
    const withdrawn: Design = {
      ...KITCHEN_L_DESIGN,
      settings: { materialTierId: "material.withdrawn" },
    };
    const offer = measure(withdrawn);

    for (const group of [offer.material, offer.hardware])
      for (const tier of group.tiers)
        expect(tier.deltaMinor, tier.tierId).toBeUndefined();
  });

  it("still refuses a book whose group does not offer its own default, priced or not", () => {
    // The default is what an unset choice resolves to, so it has to exist with or without a price.
    expect(() =>
      offerWholeKitchenTiers({
        design: KITCHEN_L_DESIGN,
        catalog: KITCHEN_L_BODY_CATALOG,
        book: withMaterialDefault("material.no-such-tier"),
        pricingVersion: `${SAMPLE_PRICE_BOOK_VERSION}-retired`,
      }),
    ).toThrow(UnofferedDefaultTierError);
  });

  it("measures an empty kitchen without refusing it", () => {
    // The boundary the settings surface is reachable at: a design with no bodies still has a
    // material and a hardware class, and both groups' deltas are whatever the book makes of zero
    // cabinets rather than an error.
    const empty: Design = { ...KITCHEN_L_DESIGN, placements: [] };

    expect(measure(empty).material.tiers.length).toBe(
      SAMPLE_PRICE_BOOK.material.tiers.length,
    );
  });
});

function deltaOf(group: OfferedTierGroup, tierId: string): number {
  const tier = group.tiers.find((one) => one.tierId === tierId);
  if (!tier) throw new Error(`the offer holds no tier "${tierId}"`);
  if (tier.deltaMinor === undefined)
    throw new Error(
      `tier "${tierId}" states no delta; the design did not price`,
    );
  return tier.deltaMinor;
}

function cheapestDeltaTierId(group: OfferedTierGroup): string {
  const cheapest = [...group.tiers]
    .map((tier) => ({
      tierId: tier.tierId,
      delta: deltaOf(group, tier.tierId),
    }))
    .sort((left, right) => left.delta - right.delta)[0];
  if (!cheapest) throw new Error("the offer holds no tiers at all");
  return cheapest.tierId;
}

function defaultTierOf<TTier extends TierIdentity>(group: {
  readonly defaultTierId: string;
  readonly tiers: readonly TTier[];
}): TTier {
  const tier = group.tiers.find((one) => one.tierId === group.defaultTierId);
  if (!tier) throw new Error("the book defaults to a tier it does not offer");
  return tier;
}

/** The sample book with one group's default moved, which is the only way to reach the two refusals
 *  from a book this repository actually ships. */
function withMaterialDefault(defaultTierId: string): PriceBook {
  return {
    ...SAMPLE_PRICE_BOOK,
    material: { ...SAMPLE_PRICE_BOOK.material, defaultTierId },
  };
}
