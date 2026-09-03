// Adversarial QA for wave 6B2 — the two **whole-kitchen tier amounts** (ADR 0062 seam 1).
//
// The sibling file attacks the cabinet coefficients. This one attacks the pair the same population
// produces and that the same guard had not been reaching: `HardwareTier.perCabinetHandleMinor` and
// `MaterialTier.wholeKitchenMinor`, read straight off a book authored outside TypeScript, where a
// declared `number` is a promise and not a fact.
//
// **Why the downstream amount guard cannot stand in for this.** `refuseUnpublishableAmount` asks
// whether the finished amount is exact and non-negative. The product of a handle count and `null`,
// `false`, `[]` or `""` is `0` — exact, non-negative, and rendered *inclus* by the breakdown, which
// is omission read as "included" on the largest single figure the book states. `true` multiplies to
// a whole material upgrade billed at one ban, and `"9000"` puts a **string** on a line field typed
// `number`. Only `undefined` was ever caught, and only by accident of `NaN`.
//
// Every amount here is read off the book under test. No figure asserted here is a price
// (ADR 0001 decision 4).
import { describe, expect, it } from "vitest";

import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import type {
  HardwareTier,
  MaterialTier,
  PriceBook,
  TierGroup,
  TierIdentity,
} from "../../src/pricing/price-book.js";
import {
  priceDesign,
  type PriceDesignRequest,
  type WholeKitchenSelections,
} from "../../src/pricing/price-design.js";
import type {
  PricedDesign,
  WholeKitchenPriceLine,
} from "../../src/pricing/price-lines.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const BOOK = SAMPLE_PRICE_BOOK;

/** Every shape of "declared, and not a number the arithmetic may be performed on" that a book
 *  assembled outside TypeScript can carry into a tier — the reviewer's table, verbatim. The first
 *  five are the quiet half: each one multiplies to an exact, non-negative amount and would be
 *  published. */
const MALFORMED_AMOUNTS: readonly (readonly [string, unknown])[] = [
  ["null", null],
  ["false", false],
  ["true", true],
  ["an empty array", []],
  ["an empty string", ""],
  ["a numeric string", "9000"],
  ["undefined", undefined],
];

function request(
  overrides: Partial<PriceDesignRequest> = {},
): PriceDesignRequest {
  return {
    design: KITCHEN_L_DESIGN,
    catalog: CATALOG,
    book: BOOK,
    pricingVersion: BOOK.version,
    ...overrides,
  };
}

function priceOrFail(
  overrides: Partial<PriceDesignRequest> = {},
): PricedDesign {
  const result = priceDesign(request(overrides));
  if (!result.ok) {
    throw new Error(`${result.failure.code}: ${result.failure.detail}`);
  }
  return result.priced;
}

function refusalFrom(overrides: Partial<PriceDesignRequest>) {
  const result = priceDesign(request(overrides));
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected a refusal");
  expect(result).not.toHaveProperty("priced");
  return result.failure;
}

function wholeKitchenLinesOf(
  priced: PricedDesign,
): readonly WholeKitchenPriceLine[] {
  return priced.lines.filter(
    (line): line is WholeKitchenPriceLine =>
      line.kind === "hardware" || line.kind === "material",
  );
}

function lineOfKind(
  priced: PricedDesign,
  kind: "hardware" | "material",
): WholeKitchenPriceLine {
  const line = wholeKitchenLinesOf(priced).find(
    (candidate) => candidate.kind === kind,
  );
  if (!line) throw new Error(`no ${kind} line`);
  return line;
}

/** The tier a group prices an unconfigured kitchen at — read off the book, never named by hand, so
 *  a book that changes its default does not silently stop being the tier under test. */
function defaultTierOf<TTier extends TierIdentity>(
  group: TierGroup<TTier>,
): TTier {
  const tier = group.tiers.find(
    (candidate) => candidate.tierId === group.defaultTierId,
  );
  if (!tier) throw new Error(`the group holds no "${group.defaultTierId}"`);
  return tier;
}

/** A book whose default hardware tier declares this amount. Cast, because the whole point is a
 *  value `HardwareTier` says is impossible: this is the shape ADR 0062 seam 1's population can
 *  produce and the type system cannot see. */
function bookWithHardwareAmount(declared: unknown): PriceBook {
  return {
    ...BOOK,
    hardware: {
      ...BOOK.hardware,
      tiers: BOOK.hardware.tiers.map((tier) =>
        tier.tierId === BOOK.hardware.defaultTierId
          ? ({ ...tier, perCabinetHandleMinor: declared } as HardwareTier)
          : tier,
      ),
    },
  };
}

/** The material half of the same, on the tier the reviewer mutated. */
function bookWithMaterialAmount(declared: unknown): PriceBook {
  return {
    ...BOOK,
    material: {
      ...BOOK.material,
      tiers: BOOK.material.tiers.map((tier) =>
        tier.tierId === BOOK.material.defaultTierId
          ? ({ ...tier, wholeKitchenMinor: declared } as MaterialTier)
          : tier,
      ),
    },
  };
}

describe("whole-kitchen tier amounts are held to being amounts", () => {
  it("bills the seeded kitchen for at least one handle, so a `true` amount is not a no-op", () => {
    expect(lineOfKind(priceOrFail(), "hardware").quantity).toBeGreaterThan(0);
  });

  describe.each(MALFORMED_AMOUNTS)(
    "a material tier declaring %s",
    (_described, declared) => {
      it("refuses the whole design instead of publishing a line", () => {
        const failure = refusalFrom({ book: bookWithMaterialAmount(declared) });

        expect(failure.code).toBe("INVALID_AMOUNT");
        expect(failure.detail).toContain("wholeKitchenMinor");
        expect(failure.id).toBe(defaultTierOf(BOOK.material).ruleId);
      });
    },
  );

  describe.each(MALFORMED_AMOUNTS)(
    "a hardware tier declaring %s",
    (_described, declared) => {
      it("refuses the whole design instead of publishing a line", () => {
        const failure = refusalFrom({ book: bookWithHardwareAmount(declared) });

        expect(failure.code).toBe("INVALID_AMOUNT");
        expect(failure.detail).toContain("perCabinetHandleMinor");
        expect(failure.id).toBe(defaultTierOf(BOOK.hardware).ruleId);
      });
    },
  );

  /** The defect said in the terms it was found in: not "a refusal is missing" but "a number nobody
   *  authored was quoted". Guarding the field is what makes this assertion possible at all. */
  it("never publishes a zero material line for an amount that was never declared", () => {
    const result = priceDesign(request({ book: bookWithMaterialAmount(null) }));

    expect(result.ok).toBe(false);
  });
});

describe("a published tier amount is the checked number", () => {
  it("publishes a number on every whole-kitchen line of the shipped book", () => {
    for (const line of wholeKitchenLinesOf(priceOrFail())) {
      expect(typeof line.unitAmountMinor).toBe("number");
      expect(Number.isSafeInteger(line.unitAmountMinor)).toBe(true);
    }
  });

  /** `"9000"` is the case a downstream amount check can never reach: JavaScript coerces the string
   *  in the multiply, so the *amount* is a perfectly exact integer while the **unit** is still a
   *  string — which is why the line must publish the checked number and not the declaration. */
  it("refuses a numeric string rather than publishing it on a number field", () => {
    const failure = refusalFrom({ book: bookWithMaterialAmount("9000") });

    expect(failure.code).toBe("INVALID_AMOUNT");
    expect(failure.detail).toContain('"9000"');
  });
});

describe("the guard changes no amount the shipped book states", () => {
  /** Every tier the book offers, priced, with each line's amount checked against the book's own
   *  declaration. A zero tier is a real answer and stays one — `inclus` is a price, and only an
   *  *undeclared* amount is a refusal. */
  it.each(BOOK.material.tiers.map((tier) => [tier.tierId, tier] as const))(
    "prices material tier %s at the amount the book declares",
    (_tierId, tier) => {
      const selections: WholeKitchenSelections = {
        materialTierId: tier.tierId,
      };
      const line = lineOfKind(priceOrFail({ selections }), "material");

      expect(line.unitAmountMinor).toBe(tier.wholeKitchenMinor);
      expect(line.amountMinor).toBe(tier.wholeKitchenMinor);
    },
  );

  it.each(BOOK.hardware.tiers.map((tier) => [tier.tierId, tier] as const))(
    "prices hardware tier %s at the amount the book declares",
    (_tierId, tier) => {
      const selections: WholeKitchenSelections = {
        hardwareTierId: tier.tierId,
      };
      const line = lineOfKind(priceOrFail({ selections }), "hardware");

      expect(line.unitAmountMinor).toBe(tier.perCabinetHandleMinor);
      expect(line.amountMinor).toBe(line.quantity * tier.perCabinetHandleMinor);
    },
  );
});
