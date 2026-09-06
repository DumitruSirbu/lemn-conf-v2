// Adversarial QA for waves 6T and 6W — **the tier that prices below its group's default**
// (ADR 0092 decision 12).
//
// **What wave 6W moved, and it is one thing.** 6T left this case throwing `NegativeTierDeltaError`
// on the settings sheet, which is the one control a customer with an unpriceable document recovers
// with. 6W rules — interim, pending owner review — that a **hardware** tier pricing below its
// group's default is *offered with no delta badge*, reusing the module's existing *"the deltas
// degrade; the choice does not"* path, while the **material** group keeps throwing. So every
// assertion here that named a throw now names what the customer sees; the designs, the arithmetic
// and the quantifier they are derived from are untouched.
//
// **Three things this file attacks:**
//
// 1. **A rule wider than the case.** The statement is a *biconditional*, now at the level of the
//    tier rather than the design: a hardware tier states no amount **exactly** where it prices the
//    design below the default, and states its measured delta everywhere else. A module that blanked
//    a whole group — or the whole sheet — fails the second half.
// 2. **A witness chosen because it is quiet.** The pinned one-body case is re-derived from the
//    book's own three rate gaps rather than restated, and the boundary the gaps predict is crossed
//    from both sides on designs built to sit either side of it, so the missing badge is shown to
//    appear *at* the predicted place rather than merely somewhere.
// 3. **A leniency that leaks.** The material group's refusal is asserted here on the same
//    drawer-dominant design, so the hardware rule cannot quietly become the module's rule.
//
// **The refusal is not weakened anywhere in this file.** `NegativeTierDeltaError` keeps its meaning
// and its message for the group whose ordering is a property of the book alone.
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
  type HardwareTier,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  NegativeTierDeltaError,
  offerWholeKitchenTiers,
  type OfferedTierGroup,
} from "@/price/whole-kitchen-tiers";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const BOOK = SAMPLE_PRICE_BOOK;
const DEFAULT_TIER_ID = BOOK.hardware.defaultTierId;
/** The tier ADR 0070's runners-only drawer figure puts below the default on a drawer-dominant
 *  design. Named once, because every derivation below reads its rates. */
const INVERTING_TIER_ID = "hardware.soft-close";

function hardwareTier(tierId: string): HardwareTier {
  const tier = BOOK.hardware.tiers.find(
    (candidate) => candidate.tierId === tierId,
  );
  if (!tier) throw new Error(`the book holds no hardware tier "${tierId}"`);
  return tier;
}

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
  const tier = hardwareTier(tierId);
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

/** **The inversion's own quantifier, derived from the three rate gaps and never restated.** Hettich
 *  costs more per hinge and more per latch than the default tier, and less per drawer — the last is
 *  ADR 0070's runners-only figure, which the owner ruled stays understated — so it prices a design
 *  below the default exactly when the drawer saving outweighs both surcharges. Written as the two
 *  coefficients a drawer count is compared against, so the form is the ADR's own
 *  *drawers > a × hinges + b × latches*; **the two-term form is false in general** (ADR 0092
 *  Amendment C) and neither coefficient's value appears here, so the derivation survives the owner
 *  replacing the drafted push figures. */
function invertsForCounts(counts: HardwareMechanismCounts): boolean {
  const standard = hardwareTier(DEFAULT_TIER_ID);
  const hettich = hardwareTier(INVERTING_TIER_ID);
  const drawerSavingMinor = standard.perDrawerMinor - hettich.perDrawerMinor;
  const hingesPerDrawer =
    (hettich.perHingeMinor - standard.perHingeMinor) / drawerSavingMinor;
  const latchesPerDrawer =
    (hettich.perPushToOpenMinor - standard.perPushToOpenMinor) /
    drawerSavingMinor;

  return (
    counts.drawers >
    hingesPerDrawer * counts.hinges + latchesPerDrawer * counts.pushToOpen
  );
}

/** What one offered tier states, `undefined` where it states nothing — the two cases the sheet has,
 *  read without a second lookup written in each test. */
function offeredDeltaFor(
  group: OfferedTierGroup,
  tierId: string,
): number | undefined {
  const tier = group.tiers.find((candidate) => candidate.tierId === tierId);
  if (!tier) throw new Error(`the offer lost hardware tier "${tierId}"`);
  return tier.deltaMinor;
}

function pricesBelowItsDefault(design: Design): boolean {
  const baseline = bookAmountFor(DEFAULT_TIER_ID, design);
  return BOOK.hardware.tiers.some(
    (tier) => bookAmountFor(tier.tierId, design) < baseline,
  );
}

describe("the sheet states an amount exactly where the rates make one an addition", () => {
  const anyPlacementSubset = fc
    .subarray([...KITCHEN_L_DESIGN.placements], { minLength: 0 })
    .map((placements) => designOf(placements));

  /** **Both halves, on one sweep, and per tier rather than per design.** Where the book's rates make
   *  a tier an addition it states that addition exactly; where they make it a reduction it states
   *  nothing at all. A module that blanked the group, blanked the sheet, or published a negative
   *  fails one half or the other — and so would a book that inverted somewhere the rates do not
   *  predict. **Every population is offered**, which is 6W's own criterion: the sheet renders. */
  propertyTest.prop([anyPlacementSubset])(
    "offers every population, and states each tier's delta exactly where it is an addition",
    (design) => {
      const hardware = offerOf(design).hardware;
      const baseline = bookAmountFor(DEFAULT_TIER_ID, design);

      expect(hardware.tiers.map((tier) => tier.tierId)).toEqual(
        BOOK.hardware.tiers.map((tier) => tier.tierId),
      );
      for (const tier of hardware.tiers) {
        const amountMinor = bookAmountFor(tier.tierId, design) - baseline;
        expect(tier.deltaMinor, tier.tierId).toBe(
          amountMinor < 0 ? undefined : amountMinor,
        );
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
   *  kitchen, and the inversion is the same understated drawer rate in each.
   *
   *  **The design and the shortfall are 6T's, unchanged; the last line is 6W's.** The sheet is
   *  offered, every tier the book holds is on it, and the inverting one carries no amount. */
  it.each([
    [THREE_DRAWER_BASE, 3],
    [HOB_AND_TWO_DRAWERS, 2],
  ])(
    "offers a lone %s of %i drawers with no amount on the inverting tier",
    (buildId, drawers) => {
      const design = soloDesign(buildId);
      const standard = hardwareTier(DEFAULT_TIER_ID);
      const hettich = hardwareTier(INVERTING_TIER_ID);

      expect(mechanismsIn(design)).toEqual({
        hinges: 0,
        drawers,
        pushToOpen: 0,
      });
      // Re-derived from the two rates rather than pinned as a figure: the shortfall is the drawer
      // gap the owner's Hettich ruling creates, times this body's own drawers.
      expect(
        bookAmountFor(INVERTING_TIER_ID, design) -
          bookAmountFor(DEFAULT_TIER_ID, design),
      ).toBe(drawers * (hettich.perDrawerMinor - standard.perDrawerMinor));

      const hardware = offerOf(design).hardware;

      expect(hardware.tierIds).toEqual(
        BOOK.hardware.tiers.map((tier) => tier.tierId),
      );
      expect(offeredDeltaFor(hardware, INVERTING_TIER_ID)).toBeUndefined();
      expect(offeredDeltaFor(hardware, DEFAULT_TIER_ID)).toBe(0);
    },
  );

  /** **The one design the wave pinned, and the amount it is pinned at** (ADR 0092 decision 12): one
   *  `base-3drawer` stands at `y0` 0 recording no mode, so it carries 3 drawers, 0 hinges and 0
   *  latches, and Hettich prices it exactly 4 200 minor below the default. The witness itself did
   *  not move at 6W; only what is asserted of the sheet did. */
  it("puts the pinned witness 4 200 minor below the default, and still offers it every tier", () => {
    const design = soloDesign(THREE_DRAWER_BASE);

    expect(
      bookAmountFor(INVERTING_TIER_ID, design) -
        bookAmountFor(DEFAULT_TIER_ID, design),
    ).toBe(-4_200);

    const hardware = offerOf(design).hardware;

    expect(hardware.tiers.map((tier) => tier.tierId)).toEqual(hardware.tierIds);
    expect(offeredDeltaFor(hardware, INVERTING_TIER_ID)).toBeUndefined();
  });

  /** **The material group is not made lenient by the hardware group's rule.** Asked on the same
   *  drawer-dominant design, so this is the leak it would take to weaken the refusal by accident:
   *  a book whose material default is not its cheapest material tier still throws, and still says
   *  which tier and by how much. */
  it("keeps refusing a material book whose default is not its cheapest tier, on the very design the hardware rule spares", () => {
    const design = soloDesign(THREE_DRAWER_BASE);
    const invertedMaterial = {
      ...BOOK,
      material: { ...BOOK.material, defaultTierId: "material.veneer" },
    };

    expect(() =>
      offerWholeKitchenTiers({
        design,
        catalog: CATALOG,
        book: invertedMaterial,
        pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
        selections: design.settings,
      }),
    ).toThrow(NegativeTierDeltaError);
  });

  /** **The boundary the quantifier names, crossed from both sides — with hinges on both sides of
   *  it.** A design of four three-drawer bases and *m* one-door wall boxes carries 12 drawers and
   *  2 *m* hinges, so it inverts while the quantifier says so and stops the moment it does not. The
   *  transition is found from the rate gaps rather than typed, and both neighbours carry a positive
   *  hinge count — a boundary crossed at zero hinges would only be showing that a drawer-only
   *  design inverts, which the block above already says. */
  it("stops omitting the amount at exactly the population the rate gaps predict", () => {
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

    const invertsAt = (doorBoxes: number): boolean =>
      invertsForCounts(mechanismsIn(populationWith(doorBoxes)));
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
    // What crosses the boundary is one badge: on the inverting side the tier states no amount, and
    // one body further along it states its own measured addition.
    expect(
      offeredDeltaFor(
        offerOf(populationWith(lastInverting)).hardware,
        INVERTING_TIER_ID,
      ),
    ).toBeUndefined();
    const measured = offerOf(populationWith(lastInverting + 1)).hardware;

    expect(offeredDeltaFor(measured, INVERTING_TIER_ID)).toBe(
      bookAmountFor(INVERTING_TIER_ID, populationWith(lastInverting + 1)) -
        bookAmountFor(DEFAULT_TIER_ID, populationWith(lastInverting + 1)),
    );
  });

  /** The seeded kitchen itself is nowhere near the boundary, which is the reason nobody found this
   *  before the rates existed — and the reason a fixture change could reach it silently. */
  it("leaves the shipped kitchen far on the measurable side of the boundary", () => {
    const seeded = mechanismsIn(KITCHEN_L_DESIGN);

    expect(invertsForCounts(seeded)).toBe(false);
    expect(pricesBelowItsDefault(KITCHEN_L_DESIGN)).toBe(false);
    for (const tier of offerOf(KITCHEN_L_DESIGN).hardware.tiers) {
      expect(tier.deltaMinor, tier.tierId).toBeGreaterThanOrEqual(0);
    }
  });
});
