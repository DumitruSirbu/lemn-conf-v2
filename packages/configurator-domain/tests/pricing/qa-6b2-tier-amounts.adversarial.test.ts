// Adversarial QA for wave 6B2 — the two **whole-kitchen tier amounts** (ADR 0062 seam 1).
//
// The sibling file attacks the cabinet coefficients. This one attacks the whole-kitchen amounts the
// same population produces and that the same guard had not been reaching: a hardware tier's three
// per-mechanism rates and `MaterialTier.wholeKitchenMinor`, read straight off a book authored
// outside TypeScript, where a declared `number` is a promise and not a fact.
//
// **Wave 6T replaced the hardware tier's single `perCabinetHandleMinor` with three rates**
// (ADR 0070 decision 1), so every hardware case below is swept over all three: a book that declares
// a usable hinge rate and an unusable drawer rate must refuse naming the *drawer*. Checking one
// field would leave the other two exactly as unguarded as the pair this file was written for.
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

import { countHardwareMechanisms } from "../../src/hardware-mechanisms.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { projectDesignForDisplay } from "../../src/queries/design-projection.js";
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

/** The seeded design's bodies in display order — the population a hardware rate is multiplied by. */
const SEEDED_ENTRIES = projectDesignForDisplay(
  KITCHEN_L_DESIGN,
  CATALOG,
).flatMap((group) => group.entries);

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

/** The three fields a hardware tier is billed by, named once so every sweep below covers all of
 *  them and a fourth rate cannot be added without appearing here. */
const HARDWARE_RATE_FIELDS = [
  "perHingeMinor",
  "perDrawerMinor",
  "perPushToOpenMinor",
] as const;

type HardwareRateField = (typeof HARDWARE_RATE_FIELDS)[number];

/** A book whose default hardware tier declares this amount **on this one rate**, leaving the other
 *  two usable. Cast, because the whole point is a value `HardwareTier` says is impossible: this is
 *  the shape ADR 0062 seam 1's population can produce and the type system cannot see.
 *
 *  The other two rates stay usable on purpose — a guard that refused only because *some* rate was
 *  malformed would pass this file while naming the wrong field. */
function bookWithHardwareAmount(
  field: HardwareRateField,
  declared: unknown,
): PriceBook {
  return {
    ...BOOK,
    hardware: {
      ...BOOK.hardware,
      tiers: BOOK.hardware.tiers.map((tier) =>
        tier.tierId === BOOK.hardware.defaultTierId
          ? ({ ...tier, [field]: declared } as HardwareTier)
          : tier,
      ),
    },
  };
}

/** What the book says this tier charges the seeded kitchen, recomposed from the tier's own three
 *  rates and the design's own three counts. Never a literal: the reconciliation to ADR 0092
 *  decision 6's table is `hardware-tier-reconciliation.test.ts`'s job, and this file asserts only
 *  that the guard publishes the number the book states rather than one of its own. */
function declaredHardwareAmount(tier: HardwareTier): number {
  const mechanisms = countHardwareMechanisms(SEEDED_ENTRIES, CATALOG);

  return (
    tier.perHingeMinor * mechanisms.hinges +
    tier.perDrawerMinor * mechanisms.drawers +
    tier.perPushToOpenMinor * mechanisms.pushToOpen
  );
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
  it("bills the seeded kitchen for at least one mechanism, so a `true` rate is not a no-op", () => {
    // The hardware line's own `quantity` is 1 (ADR 0092 decision 4), so it can no longer say this.
    // What makes a malformed rate visible is the count it multiplies, and that count is here.
    const mechanisms = countHardwareMechanisms(SEEDED_ENTRIES, CATALOG);

    expect(mechanisms.hinges + mechanisms.drawers).toBeGreaterThan(0);
    expect(lineOfKind(priceOrFail(), "hardware").amountMinor).toBeGreaterThan(
      0,
    );
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

  describe.each(
    HARDWARE_RATE_FIELDS.flatMap((field) =>
      MALFORMED_AMOUNTS.map(
        ([described, declared]) => [field, described, declared] as const,
      ),
    ),
  )("a hardware tier declaring %s as %s", (field, _described, declared) => {
    it("refuses the whole design instead of publishing a line, naming that rate", () => {
      const failure = refusalFrom({
        book: bookWithHardwareAmount(field, declared),
      });

      expect(failure.code).toBe("INVALID_AMOUNT");
      expect(failure.detail).toContain(field);
      expect(failure.id).toBe(defaultTierOf(BOOK.hardware).ruleId);
    });
  });

  /** **Every one of the three rates multiplies a non-zero count on the shipped demo**, so the sweep
   *  above is checking rates the seeded kitchen is actually billed by rather than guarding against a
   *  design nobody has built. It did not used to be: while the push count was read off the recorded
   *  handle mode the seeded kitchen answered zero latches, and a book declaring `null` for the push
   *  rate produced an amount that was exactly right anyway (ADR 0092 Amendment C). */
  it("bills the seeded kitchen by all three rates, so none of them is checked unused", () => {
    const mechanisms = countHardwareMechanisms(SEEDED_ENTRIES, CATALOG);

    expect(mechanisms.hinges).toBeGreaterThan(0);
    expect(mechanisms.drawers).toBeGreaterThan(0);
    expect(mechanisms.pushToOpen).toBeGreaterThan(0);
  });

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

      expect(line.unitAmountMinor).toBe(declaredHardwareAmount(tier));
      expect(line.quantity).toBe(1);
      expect(line.amountMinor).toBe(line.quantity * line.unitAmountMinor);
    },
  );
});
