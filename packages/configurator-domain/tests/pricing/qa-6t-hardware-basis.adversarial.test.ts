// Adversarial QA for wave 6T — **the hardware line's new quantity basis**, attacked from outside
// the wave's own constants (ADR 0070 decision 1, ADR 0092 decisions 1–6 and 15).
//
// The wave's own reconciliation pins **totals**: 74 hinges, 5 drawers, and three amounts that meet
// ADR 0070's columns. A total is exactly the shape two compensating declaration errors survive — a
// body counted two hinges short and another two long still sums to 74, and every figure in the wave
// stays green. So the first block below pins the census **per body**, against what each row's
// builder demonstrably carries, and lets the 74 fall out of it rather than standing in for it.
//
// The rest attacks what `quantity: 1` could have hidden. The published invariant
// `amountMinor === quantity × unitAmountMinor` is trivially true at a pinned quantity, so the
// statement that has to survive is the one it used to carry: **a kitchen with different mechanisms
// is billed a different amount**, and the difference is the book's own rate times the difference in
// the count. That is asserted as a swept property over designs and over rates, not as examples.
//
// No figure here is a price (ADR 0001 decision 4); every amount is read off the book under test.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { countHardwareMechanisms } from "../../src/hardware-mechanisms.js";
import type { Design, DesignPlacement } from "../../src/design.js";
import type { HardwareTier, PriceBook } from "../../src/pricing/price-book.js";
import {
  priceDesign,
  type PriceDesignRequest,
} from "../../src/pricing/price-design.js";
import type {
  PricedDesign,
  WholeKitchenPriceLine,
} from "../../src/pricing/price-lines.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows.js";
import { NOTHING_DISABLED } from "../support/availability.js";
import { roundedToTenLei } from "../support/line-amounts.js";
import { projectDesignForDisplay } from "../../src/queries/design-projection.js";
import type { BodyCatalog } from "../../src/void-engine.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const BOOK = SAMPLE_PRICE_BOOK;

function request(
  overrides: Partial<PriceDesignRequest> = {},
): PriceDesignRequest {
  return {
    design: KITCHEN_L_DESIGN,
    catalog: CATALOG,
    book: BOOK,
    pricingVersion: BOOK.version,
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
    ...overrides,
  };
}

function priceOrFail(
  overrides: Partial<PriceDesignRequest> = {},
): PricedDesign {
  const result = priceDesign(request(overrides));
  if (!result.ok)
    throw new Error(`${result.failure.code}: ${result.failure.detail}`);
  return result.priced;
}

function refusalFrom(overrides: Partial<PriceDesignRequest>) {
  const result = priceDesign(request(overrides));
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected a refusal");
  expect(result).not.toHaveProperty("priced");
  return result.failure;
}

function hardwareLineOf(priced: PricedDesign): WholeKitchenPriceLine {
  const line = priced.lines.find(
    (candidate): candidate is WholeKitchenPriceLine =>
      candidate.kind === "hardware",
  );
  if (!line) throw new Error("the design published no hardware line");
  return line;
}

function tierOf(tierId: string): HardwareTier {
  const tier = BOOK.hardware.tiers.find(
    (candidate) => candidate.tierId === tierId,
  );
  if (!tier) throw new Error(`the book holds no "${tierId}"`);
  return tier;
}

/** A book whose hardware tiers all charge these three rates, so an amount can be read as a count.
 *  Built from the shipped book rather than authored, so a fourth rate cannot appear without this
 *  helper going stale in a way the type checker sees. */
function bookAtRates(rates: {
  readonly perHingeMinor: number;
  readonly perDrawerMinor: number;
  readonly perPushToOpenMinor: number;
}): PriceBook {
  return {
    ...BOOK,
    hardware: {
      ...BOOK.hardware,
      tiers: BOOK.hardware.tiers.map((tier) => ({ ...tier, ...rates })),
    },
  };
}

function designOf(placements: readonly DesignPlacement[]): Design {
  return { ...KITCHEN_L_DESIGN, placements: [...placements] };
}

function mechanismsIn(design: Design, catalog: BodyCatalog = CATALOG) {
  return countHardwareMechanisms(
    projectDesignForDisplay(design, catalog).flatMap((group) => group.entries),
    catalog,
  );
}

/**
 * **The seeded kitchen's mechanism census, body by body.**
 *
 * ADR 0070 published two totals — 74 hinges and 5 drawers — and a total is what a pair of
 * cancelling errors survives. Each row below is what its own builder carries, stated as the product
 * fact rather than copied from a count: the pantry's four leaves are two 1290 mm bands and two
 * 790 mm ones so it alone takes a third hinge (ADR 0092 decision 5); the hob-and-drawers base and
 * the three-drawer base are the only two drawer rows in the whole design; the hood, the open shelf,
 * the freestanding fridge and the structural base corner return open nothing at all.
 */
const SEEDED_CENSUS: readonly (readonly [
  placementId: string,
  hinges: number,
  drawers: number,
  pushToOpen: number,
])[] = [
  // Wall A base run — a 900 mm corner with one leaf, the sink's two, the dishwasher's decor door,
  // and the two drawer rows. Every one of them stands on the floor with its bars visible.
  ["p25", 2, 0, 0],
  ["p0", 4, 0, 0],
  ["p1", 2, 0, 0],
  ["p2", 0, 2, 0],
  ["p4", 0, 3, 0],
  // Wall A wall band at 1500 — two-door and one-door boxes, and two bodies with no front at all.
  ["p8", 4, 0, 0],
  ["p10", 2, 0, 0],
  ["p11", 4, 0, 0],
  ["p12", 0, 0, 0],
  ["p13", 0, 0, 0],
  ["p14", 4, 0, 0],
  // Wall A top band at 2200 — six boxes of 394 mm leaves, none near the threshold, and every one of
  // their eleven leaves push-to-open by the slot (ADR 0092 Amendment C).
  ["p15", 4, 0, 2],
  ["p16", 2, 0, 1],
  ["p17", 4, 0, 2],
  ["p18", 4, 0, 2],
  ["p19", 4, 0, 2],
  ["p20", 4, 0, 2],
  // Wall B — the structural base return opens nothing; the wall returns carry one leaf each, and
  // **the pair is the whole `canHandle` ruling in two rows**: `p9` and `p21` declare the identical
  // `carriesHandles(1)` and the identical `canHandle: false` and differ only by the row they stand
  // on, so `p9`'s bar is visible and takes no latch while `p21`'s is hidden by the slot and takes
  // one the customer cannot turn off.
  ["p26", 0, 0, 0],
  ["p9", 2, 0, 0],
  ["p24", 4, 0, 0],
  ["p21", 2, 0, 1],
  ["p22", 4, 0, 2],
  ["p23", 4, 0, 2],
  // Wall B tall run — the oven tower's two cabinet leaves at 500 mm, the pantry's four leaves of
  // which two are over 900 mm, and a freestanding fridge that is not a cabinet.
  ["p5", 4, 0, 0],
  ["p6", 10, 0, 0],
  ["p7", 0, 0, 0],
];

describe("the 74, the 5 and the 16 are a census, not only a total", () => {
  it.each(SEEDED_CENSUS)(
    "counts %s at %i hinges, %i drawers and %i latches",
    (placementId, hinges, drawers, pushToOpen) => {
      const placement = KITCHEN_L_DESIGN.placements.find(
        (candidate) => candidate.id === placementId,
      );
      if (!placement) throw new Error(`the fixture holds no "${placementId}"`);

      expect(mechanismsIn(designOf([placement]))).toEqual({
        hinges,
        drawers,
        pushToOpen,
      });
    },
  );

  it("covers every seeded placement and sums to ADR 0070's own two figures", () => {
    expect(SEEDED_CENSUS.map(([placementId]) => placementId).sort()).toEqual(
      KITCHEN_L_DESIGN.placements.map((placement) => placement.id).sort(),
    );

    const summed = SEEDED_CENSUS.reduce(
      (totals, [, hinges, drawers, pushToOpen]) => ({
        hinges: totals.hinges + hinges,
        drawers: totals.drawers + drawers,
        pushToOpen: totals.pushToOpen + pushToOpen,
      }),
      { hinges: 0, drawers: 0, pushToOpen: 0 },
    );

    expect(summed).toEqual({ hinges: 74, drawers: 5, pushToOpen: 16 });
    expect(mechanismsIn(KITCHEN_L_DESIGN)).toEqual(summed);
  });
});

describe("the count still moves the money, though the quantity is pinned at 1", () => {
  const anySubset = fc
    .subarray([...KITCHEN_L_DESIGN.placements], { minLength: 0 })
    .map((placements) => designOf(placements));

  /** Rates a design's counts can be read back out of: powers far enough apart that no combination
   *  of the three counts can alias one mechanism for another. The seeded kitchen's largest count is
   *  74, so a base of 1 000 separates them with room to spare. The smallest rate is one ten-lei grain, because the
   *  hardware line is rounded to ten lei (ADR 0177 A-1) and a smaller one would be rounded away. */
  const GRAIN_MINOR = 1_000;
  const SEPARABLE_RATES = {
    perHingeMinor: GRAIN_MINOR,
    perDrawerMinor: 1_000 * GRAIN_MINOR,
    perPushToOpenMinor: 1_000_000 * GRAIN_MINOR,
  } as const;

  propertyTest.prop([anySubset])(
    "bills every population the book's own three rates times its own three counts",
    (design) => {
      const counts = mechanismsIn(design);
      for (const tier of BOOK.hardware.tiers) {
        const line = hardwareLineOf(
          priceOrFail({
            design,
            selections: { hardwareTierId: tier.tierId },
          }),
        );

        expect(line.quantity).toBe(1);
        expect(line.amountMinor).toBe(line.quantity * line.unitAmountMinor);
        // The three rates over the three counts, rounded once to ten lei.
        expect(line.amountMinor).toBe(
          roundedToTenLei(
            tier.perHingeMinor * counts.hinges +
              tier.perDrawerMinor * counts.drawers +
              tier.perPushToOpenMinor * counts.pushToOpen,
          ),
        );
      }
    },
  );

  /** **What `quantity: 1` could have hidden.** The line no longer publishes a count anywhere, so the
   *  only thing left saying the count reached the money is that the amount is recoverable from it.
   *  Priced against separable rates, the amount decodes back to the three counts exactly. */
  propertyTest.prop([anySubset])(
    "publishes an amount the three counts can be read back out of",
    (design) => {
      const counts = mechanismsIn(design);
      const amount = hardwareLineOf(
        priceOrFail({ design, book: bookAtRates(SEPARABLE_RATES) }),
      ).amountMinor;

      const grains = amount / GRAIN_MINOR;

      expect(grains % 1_000).toBe(counts.hinges);
      expect(Math.floor(grains / 1_000) % 1_000).toBe(counts.drawers);
      expect(Math.floor(grains / 1_000_000)).toBe(counts.pushToOpen);
    },
  );

  /** Two designs that differ by one drawer body differ by exactly that body's drawers at the rate,
   *  at every tier — the statement the old per-handle `quantity` carried and that a pinned quantity
   *  cannot. */
  propertyTest.prop([anySubset])(
    "charges one more three-drawer base at exactly three times the drawer rate",
    (design) => {
      const extra: DesignPlacement = {
        id: "qa-extra-drawers",
        wall: "A",
        alongMm: 1_300,
        y0Mm: 0,
        body: { buildId: "base-3drawer", widthMm: 600, heightMm: 820 },
      };
      const enlarged = designOf([...design.placements, extra]);

      expect(mechanismsIn(enlarged).drawers).toBe(
        mechanismsIn(design).drawers + 3,
      );
      for (const tier of BOOK.hardware.tiers) {
        const at = (one: Design): number =>
          hardwareLineOf(
            priceOrFail({
              design: one,
              selections: { hardwareTierId: tier.tierId },
            }),
          ).amountMinor;

        // Each side is rounded to ten lei once, so the difference is the three drawers to within one grain.
        expect(
          Math.abs(at(enlarged) - at(design) - 3 * tier.perDrawerMinor),
        ).toBeLessThan(2 * GRAIN_MINOR);
      }
      // At a rate that is a whole number of grains the difference is exact.
      const exactBook = bookAtRates({
        perHingeMinor: 0,
        perDrawerMinor: 2 * GRAIN_MINOR,
        perPushToOpenMinor: 0,
      });
      const exactlyAt = (one: Design): number =>
        hardwareLineOf(priceOrFail({ design: one, book: exactBook }))
          .amountMinor;

      expect(exactlyAt(enlarged) - exactlyAt(design)).toBe(6 * GRAIN_MINOR);
    },
  );

  it("prices a design of a single body, and prices it as that body's own mechanisms", () => {
    const solo = designOf([
      {
        id: "solo",
        wall: "A",
        alongMm: 1_300,
        y0Mm: 0,
        body: { buildId: "base-cabinet", widthMm: 600, heightMm: 820 },
      },
    ]);
    const tier = tierOf("hardware.premium");

    expect(mechanismsIn(solo)).toEqual({
      hinges: 4,
      drawers: 0,
      pushToOpen: 0,
    });
    expect(
      hardwareLineOf(
        priceOrFail({
          design: solo,
          selections: { hardwareTierId: tier.tierId },
        }),
      ).amountMinor,
    ).toBe(4 * tier.perHingeMinor);
  });
});

describe("the boundaries the wave plan names", () => {
  /** **A tier that costs nothing is still a line.** The breakdown renders a zero as *inclus*, and
   *  omission read as "included" is the one reading `priceWholeKitchen` exists to prevent — so the
   *  zero has to be present rather than absent, at both ends of the design. */
  it.each([
    ["a book charging nothing for any mechanism", { design: KITCHEN_L_DESIGN }],
    ["a kitchen with no bodies at all", { design: designOf([]) }],
  ] as const)("still publishes a hardware line for %s", (_described, over) => {
    const priced = priceOrFail({
      ...over,
      book: bookAtRates({
        perHingeMinor: 0,
        perDrawerMinor: 0,
        perPushToOpenMinor: 0,
      }),
    });
    // **Selected by membership, not by `!== "cabinet"`.** Wave 6T2 added `accessory` lines, which the
    // seeded kitchen earns two of; this block is about the two whole-kitchen lines still being
    // published when every rate is zero, and the negation stopped naming exactly those two.
    const wholeKitchen = priced.lines.filter(
      (line) => line.kind === "hardware" || line.kind === "material",
    );

    expect(wholeKitchen.map((line) => line.kind)).toEqual([
      "hardware",
      "material",
    ]);
    expect(hardwareLineOf(priced).amountMinor).toBe(0);
    expect(hardwareLineOf(priced).quantity).toBe(1);
  });

  /** An empty kitchen against the **shipped** rates: no body means no mechanism, and the tier that
   *  now costs the seeded kitchen 450 240 costs this one nothing — which is the count reaching the
   *  money from the other end. */
  it("bills an empty kitchen nothing at every tier, and still lists one line for each", () => {
    for (const tier of BOOK.hardware.tiers) {
      const priced = priceOrFail({
        design: designOf([]),
        selections: { hardwareTierId: tier.tierId },
      });

      expect(hardwareLineOf(priced).amountMinor).toBe(0);
      expect(hardwareLineOf(priced).tierId).toBe(tier.tierId);
    }
  });

  /** **A missing rule is never a zero.** A tier with the field deleted outright — the shape a book
   *  assembled outside TypeScript reaches this seam in — refuses the whole design naming the field,
   *  rather than multiplying `undefined` into a line. */
  it.each(["perHingeMinor", "perDrawerMinor", "perPushToOpenMinor"] as const)(
    "refuses a hardware tier with no %s at all, naming it",
    (field) => {
      const withoutRate: PriceBook = {
        ...BOOK,
        hardware: {
          ...BOOK.hardware,
          tiers: BOOK.hardware.tiers.map((tier) => {
            if (tier.tierId !== BOOK.hardware.defaultTierId) return tier;
            // Rebuilt without the key rather than with it set to `undefined`: the two are
            // different objects at this seam, and the absent one is the shape a hand-authored
            // book actually arrives in.
            return Object.fromEntries(
              Object.entries(tier).filter(([key]) => key !== field),
            ) as unknown as HardwareTier;
          }),
        },
      };
      const failure = refusalFrom({ book: withoutRate });

      expect(failure.code).toBe("INVALID_AMOUNT");
      expect(failure.detail).toContain(field);
      expect(failure.id).toBe(tierOf(BOOK.hardware.defaultTierId).ruleId);
    },
  );

  /** A design of nothing but doors, and one of nothing but drawers. Each is billed on the one rate
   *  it has mechanisms for, so a query that had folded the two counts together would price one of
   *  them at the wrong rate rather than at none. */
  it.each([
    ["doors and no drawer", "wall-cabinet", { hinges: 4, drawers: 0 }],
    ["drawers and no door", "base-3drawer", { hinges: 0, drawers: 3 }],
  ] as const)(
    "prices a kitchen of %s off its own rate",
    (_described, buildId, expected) => {
      const design = designOf([
        {
          id: "solo",
          wall: "A",
          alongMm: 1_300,
          y0Mm: expected.hinges > 0 ? 1_500 : 0,
          body: {
            buildId,
            widthMm: 600,
            heightMm: expected.hinges > 0 ? 700 : 820,
          },
        },
      ]);
      const tier = tierOf("hardware.soft-close");

      expect(mechanismsIn(design)).toEqual({ ...expected, pushToOpen: 0 });
      expect(
        hardwareLineOf(
          priceOrFail({ design, selections: { hardwareTierId: tier.tierId } }),
        ).amountMinor,
      ).toBe(
        roundedToTenLei(
          expected.hinges * tier.perHingeMinor +
            expected.drawers * tier.perDrawerMinor,
        ),
      );
    },
  );

  /** **The defect the wave exists to remove, at its smallest.** One push-to-open body carries
   *  mechanisms and no handle, so the superseded basis billed it at exactly zero. It is billed above
   *  the same body with a handle, at every tier, and the difference is the latch rate times its
   *  fronts. */
  it.each(["hardware.standard", "hardware.soft-close", "hardware.premium"])(
    "bills a single push-to-open body more than the same body with a handle, at %s",
    (tierId) => {
      const body = { buildId: "base-3drawer", widthMm: 600, heightMm: 820 };
      const handled = designOf([
        { id: "solo", wall: "A", alongMm: 1_300, y0Mm: 0, body },
      ]);
      const pushed = designOf([
        {
          id: "solo",
          wall: "A",
          alongMm: 1_300,
          y0Mm: 0,
          body: { ...body, handle: "push" as const },
        },
      ]);
      const tier = tierOf(tierId);
      const at = (design: Design): number =>
        hardwareLineOf(
          priceOrFail({ design, selections: { hardwareTierId: tierId } }),
        ).amountMinor;

      expect(mechanismsIn(pushed).pushToOpen).toBe(3);
      expect(at(handled)).toBeGreaterThan(0);
      expect(at(pushed) - at(handled)).toBe(3 * tier.perPushToOpenMinor);
      expect(tier.perPushToOpenMinor).toBeGreaterThan(0);
    },
  );
});

/**
 * **`UNDECLARED_FRONT_POPULATION`, which the wave adds and nothing else in the tree exercises.**
 *
 * The row is *present* — a row the catalogue does not hold at all is `UNKNOWN_BODY`, refused
 * earlier and for a different reason — and declares no `fronts`. That is the shape a definition
 * assembled outside TypeScript reaches this seam in, and the one ADR 0092 decision 1 says must
 * never be read as zero mechanisms.
 */
describe("a body whose fronts cannot be read fails the design whole", () => {
  const PANTRY_ID = "tall-pantry-600";

  /** The shipped catalogue with one row's front declaration removed and everything else — its
   *  pricing row, its depth rule, its handles — left exactly as it ships, so what is under test is
   *  the missing declaration and not a half-built definition. */
  const WITHOUT_THE_PANTRY_FRONTS: BodyCatalog = new Map(
    [...CATALOG].map(([buildId, definition]) => {
      if (buildId !== PANTRY_ID) return [buildId, definition];
      const stripped: Record<string, unknown> = { ...definition };
      delete stripped["fronts"];
      return [buildId, stripped as unknown as typeof definition];
    }),
  );

  it("refuses naming both the placement and the build id, and publishes nothing", () => {
    const failure = refusalFrom({ catalog: WITHOUT_THE_PANTRY_FRONTS });

    expect(failure.code).toBe("UNDECLARED_FRONT_POPULATION");
    expect(failure.id).toBe(PANTRY_ID);
    expect(failure.placementId).toBe("p6");
  });

  /** **Never read as zero mechanisms**, said as the arithmetic rather than as the code: the row
   *  carries ten of the kitchen's seventy-four hinges, so a silent zero would publish a total
   *  short by exactly that and look complete. */
  it("does not publish the rest of the kitchen at the unreadable body's expense", () => {
    const withoutThatBody = designOf(
      KITCHEN_L_DESIGN.placements.filter((placement) => placement.id !== "p6"),
    );

    expect(mechanismsIn(KITCHEN_L_DESIGN).hinges).toBe(
      mechanismsIn(withoutThatBody).hinges + 10,
    );
    expect(
      priceDesign(request({ catalog: WITHOUT_THE_PANTRY_FRONTS })).ok,
    ).toBe(false);
  });

  /** A design that does not stand the unreadable body prices normally, so the refusal above is
   *  about the body and not about the catalogue being unusable. */
  it("still prices a design that does not stand the unreadable body", () => {
    const elsewhere = designOf(
      KITCHEN_L_DESIGN.placements.filter((placement) => placement.id !== "p6"),
    );

    expect(
      hardwareLineOf(
        priceOrFail({
          design: elsewhere,
          catalog: WITHOUT_THE_PANTRY_FRONTS,
        }),
      ).amountMinor,
    ).toBeGreaterThan(0);
  });
});

describe("a rate that would publish a negative line is refused", () => {
  /** `usableCoefficientOf` does not ask about the sign, so the book parser does: a negative tier rate is
   *  refused as an invalid book, and the design is refused whole rather than quoted a discount. */
  it("refuses the seeded kitchen priced at a negative hinge rate", () => {
    const failure = refusalFrom({
      book: bookAtRates({
        perHingeMinor: -1,
        perDrawerMinor: 0,
        perPushToOpenMinor: 0,
      }),
    });

    expect(failure.code).toBe("INVALID_PRICE_BOOK");
  });
});
