// Adversarial QA for wave 6T — **the negative tier delta the per-mechanism rates make reachable**
// (ADR 0092 decision 12, handed forward as wave 6W).
//
// The wave's own sweep in `global-settings.adversarial.test.ts` guards the case with a predicate
// over the book's rates and asserts the refusal where that predicate is true. **Two things that
// guard could be and must not be** are what this file attacks:
//
// 1. **A predicate wider than the defect**, which would make the refusal look like the rule and the
//    priced case like the exception. So the statement here is a *biconditional*: the sheet refuses
//    **exactly** where a hardware tier prices below the default, and is measured everywhere else.
//    A guard that over-claimed would fail the second half.
// 2. **A witness chosen because it is quiet.** The pinned one-body case is re-derived from the
//    book's own two rate gaps rather than restated, and the boundary the gaps predict — the ratio
//    at which the order inverts — is crossed from both sides on designs built to sit either side
//    of it, so the refusal is shown to fire *at* the predicted place rather than merely somewhere.
//
// **The refusal is not weakened anywhere in this file.** Nothing here asserts that a drawer-dominant
// kitchen is measurable; it asserts that the one design a customer can reach it with throws, and
// that the throw is the sheet's own `NegativeTierDeltaError` and not an unrelated failure.
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  countHardwareMechanisms,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type Design,
  type DesignPlacement,
  type HardwareMechanismCounts,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  NegativeTierDeltaError,
  offerWholeKitchenTiers,
} from "@/price/whole-kitchen-tiers";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const BOOK = SAMPLE_PRICE_BOOK;
const DEFAULT_TIER_ID = BOOK.hardware.defaultTierId;

function designOf(placements: readonly DesignPlacement[]): Design {
  return { ...KITCHEN_L_DESIGN, placements: [...placements] };
}

function mechanismsIn(design: Design): HardwareMechanismCounts {
  return countHardwareMechanisms(
    projectDesignForDisplay(design, CATALOG).flatMap((group) => group.entries),
    CATALOG,
  );
}

/** What the book charges this design at this tier, composed from the tier's own three rates — the
 *  independent side, never read off an offered delta. */
function bookAmountFor(tierId: string, design: Design): number {
  const tier = BOOK.hardware.tiers.find(
    (candidate) => candidate.tierId === tierId,
  );
  if (!tier) throw new Error(`the book holds no hardware tier "${tierId}"`);
  const mechanisms = mechanismsIn(design);

  return (
    tier.perHingeMinor * mechanisms.hinges +
    tier.perDrawerMinor * mechanisms.drawers +
    tier.perPushToOpenMinor * mechanisms.pushToOpen
  );
}

function offerOf(design: Design) {
  return offerWholeKitchenTiers({
    design,
    catalog: CATALOG,
    book: BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections: design.settings,
  });
}

/** **The inversion's own quantifier, derived from the two rate gaps and never restated.** Hettich
 *  costs more per hinge and less per drawer than the default tier — the second is ADR 0070's
 *  runners-only figure, which the owner ruled stays understated — so it prices a design below the
 *  default exactly when the drawers outweigh the hinges by the ratio of the two gaps. */
function drawersPerHingeToInvert(): number {
  const standard = BOOK.hardware.tiers.find(
    (tier) => tier.tierId === DEFAULT_TIER_ID,
  );
  const hettich = BOOK.hardware.tiers.find(
    (tier) => tier.tierId === "hardware.soft-close",
  );
  if (!standard || !hettich) throw new Error("the book lost a hardware tier");

  return (
    (hettich.perHingeMinor - standard.perHingeMinor) /
    (standard.perDrawerMinor - hettich.perDrawerMinor)
  );
}

function pricesBelowItsDefault(design: Design): boolean {
  const baseline = bookAmountFor(DEFAULT_TIER_ID, design);
  return BOOK.hardware.tiers.some(
    (tier) => bookAmountFor(tier.tierId, design) < baseline,
  );
}

describe("the sheet refuses exactly where the rates predict, and nowhere else", () => {
  const anyPlacementSubset = fc
    .subarray([...KITCHEN_L_DESIGN.placements], { minLength: 0 })
    .map((placements) => designOf(placements));

  /** **Both halves, on one sweep.** The wave's own property asserts the refusal where the predicate
   *  holds; this adds the half that keeps the predicate honest — where it does not hold, the offer
   *  is produced and every delta is a measured, non-negative number. A guard that refused too
   *  widely, or a book that inverted somewhere the rates do not predict, fails here. */
  propertyTest.prop([anyPlacementSubset])(
    "offers a measurable delta for every population the rates do not invert",
    (design) => {
      if (pricesBelowItsDefault(design)) {
        expect(() => offerOf(design)).toThrow(NegativeTierDeltaError);
        return;
      }

      const hardware = offerOf(design).hardware;
      const baseline = bookAmountFor(DEFAULT_TIER_ID, design);
      for (const tier of hardware.tiers) {
        expect(tier.deltaMinor, tier.tierId).toBe(
          bookAmountFor(tier.tierId, design) - baseline,
        );
        expect(tier.deltaMinor, tier.tierId).toBeGreaterThanOrEqual(0);
      }
    },
  );

  /** The whole-design totals are what `exactDelta` actually subtracts, and the hardware line is the
   *  only one a hardware tier moves. Asserted rather than assumed, because the predicate above is
   *  computed on the hardware amounts alone and would mispredict if a cabinet or material line
   *  varied with the hardware choice. */
  propertyTest.prop([anyPlacementSubset])(
    "moves nothing but the hardware line when the hardware tier changes",
    (design) => {
      const totalAt = (hardwareTierId: string): number | undefined => {
        const result = priceDesign({
          design,
          catalog: CATALOG,
          book: BOOK,
          pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
          selections: { hardwareTierId },
        });
        return result.ok ? result.priced.totalMinor : undefined;
      };
      const baselineTotal = totalAt(DEFAULT_TIER_ID);
      if (baselineTotal === undefined) return;

      for (const tier of BOOK.hardware.tiers) {
        expect(totalAt(tier.tierId), tier.tierId).toBe(
          baselineTotal +
            bookAmountFor(tier.tierId, design) -
            bookAmountFor(DEFAULT_TIER_ID, design),
        );
      }
    },
  );
});

describe("the witness is where the rates put it, not where a fixture is quiet", () => {
  const THREE_DRAWER_BASE = "base-drawer3-600";
  const HOB_AND_TWO_DRAWERS = "base-hob-2drawer-600";

  function soloDesign(buildId: string): Design {
    const placement = KITCHEN_L_DESIGN.placements.find(
      (candidate) => candidate.body.buildId === buildId,
    );
    if (!placement) throw new Error(`the fixture stands no "${buildId}"`);
    return designOf([placement]);
  }

  /** **Every drawer-only body the seeded design can be cut to is a witness**, not just the one the
   *  wave pinned. Both are single placements a customer reaches by deleting the rest of the
   *  kitchen, and the inversion is the same understated drawer rate in each. */
  it.each([
    [THREE_DRAWER_BASE, 3],
    [HOB_AND_TWO_DRAWERS, 2],
  ])("refuses the sheet for a lone %s of %i drawers", (buildId, drawers) => {
    const design = soloDesign(buildId);
    const standard = BOOK.hardware.tiers.find(
      (tier) => tier.tierId === DEFAULT_TIER_ID,
    );
    const hettich = BOOK.hardware.tiers.find(
      (tier) => tier.tierId === "hardware.soft-close",
    );
    if (!standard || !hettich) throw new Error("the book lost a hardware tier");

    expect(mechanismsIn(design)).toEqual({ hinges: 0, drawers, pushToOpen: 0 });
    // Re-derived from the two rates rather than pinned as a figure: the shortfall is the drawer
    // gap the owner's Hettich ruling creates, times this body's own drawers.
    expect(
      bookAmountFor("hardware.soft-close", design) -
        bookAmountFor(DEFAULT_TIER_ID, design),
    ).toBe(drawers * (hettich.perDrawerMinor - standard.perDrawerMinor));
    expect(() => offerOf(design)).toThrow(NegativeTierDeltaError);
  });

  /** **The boundary the quantifier names, crossed from both sides — with hinges on both sides of
   *  it.** A design of four three-drawer bases and *m* one-door wall boxes carries 12 drawers and
   *  2 *m* hinges, so it inverts while `12 > ratio × 2m` and stops the moment it does not. The
   *  transition is found from the ratio rather than typed, and both neighbours carry a positive
   *  hinge count — a boundary crossed at zero hinges would only be showing that a drawer-only
   *  design inverts, which the block above already says. */
  it("stops refusing at exactly the population the rate gaps predict", () => {
    const drawerBase = KITCHEN_L_DESIGN.placements.find(
      (candidate) => candidate.body.buildId === THREE_DRAWER_BASE,
    );
    const doorBox = KITCHEN_L_DESIGN.placements.find(
      (candidate) => candidate.body.buildId === "wall-1door-300",
    );
    if (!drawerBase || !doorBox) throw new Error("the fixture lost a row");

    const DRAWER_BASES = 4;
    const populationWith = (doorBoxes: number): Design =>
      designOf([
        ...Array.from({ length: DRAWER_BASES }, (_unused, index) => ({
          ...drawerBase,
          id: `qa-drawers-${String(index)}`,
          alongMm: 300 + index * 600,
        })),
        ...Array.from({ length: doorBoxes }, (_unused, index) => ({
          ...doorBox,
          id: `qa-door-${String(index)}`,
          alongMm: 300 + index * 300,
        })),
      ]);

    const ratio = drawersPerHingeToInvert();
    const invertsAt = (doorBoxes: number): boolean => {
      const counts = mechanismsIn(populationWith(doorBoxes));
      return counts.drawers > ratio * counts.hinges;
    };
    const boxesEitherSide = [0, 1, 2, 3, 4, 5, 6];
    const lastInverting = Math.max(...boxesEitherSide.filter(invertsAt));

    // The transition is interior to the sweep and carries hinges on both sides of it, so what is
    // being crossed is the ratio and not the presence of a door.
    expect(lastInverting).toBeGreaterThan(0);
    expect(lastInverting).toBeLessThan(Math.max(...boxesEitherSide));
    expect(mechanismsIn(populationWith(lastInverting)).hinges).toBeGreaterThan(
      0,
    );

    expect(pricesBelowItsDefault(populationWith(lastInverting))).toBe(true);
    expect(pricesBelowItsDefault(populationWith(lastInverting + 1))).toBe(
      false,
    );
    expect(() => offerOf(populationWith(lastInverting))).toThrow(
      NegativeTierDeltaError,
    );
    expect(() => offerOf(populationWith(lastInverting + 1))).not.toThrow();
  });

  /** The seeded kitchen itself is nowhere near the boundary, which is the reason nobody found this
   *  before the rates existed — and the reason a fixture change could reach it silently. */
  it("leaves the shipped kitchen far on the measurable side of the boundary", () => {
    const seeded = mechanismsIn(KITCHEN_L_DESIGN);

    expect(seeded.drawers).toBeLessThan(
      drawersPerHingeToInvert() * seeded.hinges,
    );
    expect(pricesBelowItsDefault(KITCHEN_L_DESIGN)).toBe(false);
    expect(() => offerOf(KITCHEN_L_DESIGN)).not.toThrow();
  });
});
