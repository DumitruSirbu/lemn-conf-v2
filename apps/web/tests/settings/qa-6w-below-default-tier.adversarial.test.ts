// **Adversarial QA for wave 6W** — the hardware tier that prices a kitchen below its group's
// default (ADR 0092 decision 12), and the `number | undefined` `exactDelta` grew to say so.
//
// The wave's own files assert the ruling on the sample book's one inversion. Five ways that could be
// green while the wave is wrong are what this file attacks, each written against the shape of the
// refactor rather than against its seeded case:
//
// 1. **`undefined` reaching a screen.** A `number | undefined` returned from arithmetic is the
//    classic failure of this refactor: `undefined` interpolated into a badge renders the word, and
//    `undefined` entering a sum renders `NaN`. Swept over every population the seeded kitchen can be
//    cut to, through the **rendered markup** of the settings sheet, the price bar and the breakdown
//    — not through the view objects, which is where the word would still be a value rather than a
//    string.
// 2. **A rule that is not the book's.** The wave's quantifier is derived from three declared rates.
//    Derived here a second time, in **integer arithmetic with no division**, and asserted against
//    mutated books whose rates move the boundary — a float ratio agreeing with itself at the seeded
//    figures would pass the wave's own derivation and fail this one at the boundary.
// 3. **A biconditional read off one tier.** The wave's book inverts on exactly one hardware tier, so
//    a module that blanked *the tier named Hettich* would pass every seeded assertion. Books where
//    the **other** non-default tier inverts, and where **both** do, are swept here.
// 4. **A refusal laundered rather than narrowed.** `NegativeTierDeltaError`'s message is asserted
//    character for character against the template 6T shipped, and the material group is driven into
//    it on the very design the hardware rule spares.
// 5. **A tier that is listed but not choosable.** Driven through the store — select the inverting
//    tier, price the design at it, read the bar, select away again — rather than read off a view.
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  buildKitchenLBodyCatalog,
  countCabinetsWearingAChosenFinish,
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
  type PriceBook,
  type PricingResult,
} from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ro } from "../support/romanian-content";
import { describePriceBar } from "@/price/price-bar-model";
import { describePriceBreakdown } from "@/price/price-breakdown-model";
import { PriceBreakdownSurface } from "@/price/price-breakdown";
import {
  NegativeTierDeltaError,
  offerWholeKitchenTiers,
  type OfferedTierGroup,
  type WholeKitchenTierOffer,
} from "@/price/whole-kitchen-tiers";
import {
  describeGlobalSettings,
  type GlobalSettingsView,
} from "@/settings/global-settings-model";
import { GlobalSettingsSurface } from "@/settings/global-settings";
import { describeEditability } from "@/store/editability";
import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const BOOK = SAMPLE_PRICE_BOOK;
const DEFAULT_TIER_ID = BOOK.hardware.defaultTierId;
const HARDWARE_TIER_IDS = BOOK.hardware.tiers.map((tier) => tier.tierId);
const MATERIAL_TIER_IDS = BOOK.material.tiers.map((tier) => tier.tierId);
/** The tier ADR 0070's runners-only drawer figure puts below the default on a drawer-dominant
 *  design, and the only one the *shipped* book inverts on — which is why the books below move the
 *  others too. */
const INVERTING_TIER_ID = "hardware.soft-close";
const DEARER_TIER_ID = "hardware.premium";
/** One `base-drawer3-600`: three drawers, no hinge, no latch. The wave's own witness. */
const THREE_DRAWER_BASE = "base-drawer3-600";

function designOf(placements: readonly DesignPlacement[]): Design {
  return { ...KITCHEN_L_DESIGN, placements: [...placements] };
}

function soloDesign(buildId: string): Design {
  const placement = KITCHEN_L_DESIGN.placements.find(
    (candidate) => candidate.body.buildId === buildId,
  );
  if (!placement) throw new Error(`the fixture stands no "${buildId}"`);
  return designOf([placement]);
}

const DRAWERS_ONLY = soloDesign(THREE_DRAWER_BASE);

function tierOf(book: PriceBook, tierId: string): HardwareTier {
  const tier = book.hardware.tiers.find(
    (candidate) => candidate.tierId === tierId,
  );
  if (!tier) throw new Error(`the book holds no hardware tier "${tierId}"`);
  return tier;
}

function mechanismsIn(design: Design): HardwareMechanismCounts {
  return countHardwareMechanisms(
    projectDesignForDisplay(design, CATALOG).flatMap((group) => group.entries),
    CATALOG,
  );
}

/** What a book charges this design at this tier, composed from the tier's own three rates. The
 *  independent side of every comparison below, never read off an offered delta. */
function hardwareAmountFor(
  book: PriceBook,
  tierId: string,
  design: Design,
): number {
  const tier = tierOf(book, tierId);
  const mechanisms = mechanismsIn(design);

  return (
    tier.perHingeMinor * mechanisms.hinges +
    tier.perDrawerMinor * mechanisms.drawers +
    tier.perPushToOpenMinor * mechanisms.pushToOpen
  );
}

function offerOf(
  design: Design,
  book: PriceBook = BOOK,
): WholeKitchenTierOffer {
  return offerWholeKitchenTiers({
    design,
    catalog: CATALOG,
    book,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections: design.settings,
  });
}

function pricingOf(design: Design, book: PriceBook = BOOK): PricingResult {
  return priceDesign({
    design,
    catalog: CATALOG,
    book,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections: design.settings,
  });
}

function offeredDeltaFor(
  group: OfferedTierGroup,
  tierId: string,
): number | undefined {
  const tier = group.tiers.find((candidate) => candidate.tierId === tierId);
  if (!tier) throw new Error(`the offer lost tier "${tierId}"`);
  return tier.deltaMinor;
}

function viewOf(design: Design, book: PriceBook = BOOK): GlobalSettingsView {
  return describeGlobalSettings({
    content: ro,
    pricing: pricingOf(design, book),
    offer: offerOf(design, book),
    groups: projectDesignForDisplay(design, CATALOG),
    applied: design.settings ?? {},
    pending: design.settings ?? {},
    chosenColourCount: countCabinetsWearingAChosenFinish(design),
  });
}

/** This file is about a book whose tier prices below its own default, never about access. Stated
 *  rather than defaulted: `GlobalSettingsSurface.editability` is a required prop precisely so a
 *  write surface cannot silently default to permitted (M6-AUD-001). */
const WRITABLE_ACCESS = describeEditability(
  {
    canWrite: true,
    saveStatus: "idle",
  },
  ro.panel,
);

function settingsMarkupOf(view: GlobalSettingsView): string {
  return renderToStaticMarkup(
    createElement(GlobalSettingsSurface, {
      id: "settings",
      view,
      editability: WRITABLE_ACCESS,
      onChoose: () => undefined,
      onChooseDepth: () => undefined,
      onCancel: () => undefined,
      onApply: () => undefined,
    }),
  );
}

/** **The two words a `number | undefined` leaks as.** `undefined` reaches markup through string
 *  interpolation and `NaN` through arithmetic; both render as themselves and neither belongs in any
 *  ruled string. Asserted against rendered HTML rather than a view object, because a view still
 *  holds the value and only the render turns it into the word. */
const LEAKED_WORDS = ["undefined", "NaN", "null"] as const;

function expectNoLeakedValue(markup: string, whereFrom: string): void {
  for (const word of LEAKED_WORDS) {
    expect(markup.includes(word), `${whereFrom} rendered "${word}"`).toBe(
      false,
    );
  }
}

/** Every population the seeded kitchen can be cut to. The inverting case is *inside* this space —
 *  the wave's own witness is a one-element subset — so nothing here has to be seeded. */
const anyPopulation = fc
  .subarray([...KITCHEN_L_DESIGN.placements], { minLength: 0 })
  .map((placements) => designOf(placements));

describe("the optional delta never reaches a screen as a word", () => {
  propertyTest.prop([anyPopulation])(
    "renders the settings sheet for every population without printing undefined or NaN",
    (design) => {
      expectNoLeakedValue(
        settingsMarkupOf(viewOf(design)),
        "the settings sheet",
      );
    },
  );

  /** The two surfaces the wave did not touch, asserted anyway: `exactDelta`'s new return type is
   *  reachable from `useWholeKitchenTierOffer` alone, and the claim that the bar and the breakdown
   *  never see it is worth a measurement rather than a reading of the imports. */
  it("renders the price bar and the breakdown for the inverting design, at every hardware tier", () => {
    for (const hardwareTierId of HARDWARE_TIER_IDS) {
      const design: Design = {
        ...DRAWERS_ONLY,
        settings: { ...DRAWERS_ONLY.settings, hardwareTierId },
      };
      const pricing = pricingOf(design);
      const bar = describePriceBar({ pricing, content: ro });
      const breakdown = describePriceBreakdown({
        content: ro,
        pricing,
        groups: projectDesignForDisplay(design, CATALOG),
      });

      expect(bar.kind, hardwareTierId).toBe("priced");
      expect(breakdown.kind, hardwareTierId).toBe("available");
      if (breakdown.kind !== "available")
        throw new Error("the witness design must produce a breakdown");
      expectNoLeakedValue(JSON.stringify(bar), `the bar at ${hardwareTierId}`);
      expectNoLeakedValue(
        renderToStaticMarkup(
          createElement(PriceBreakdownSurface, {
            id: "breakdown",
            view: breakdown,
            onClose: () => undefined,
          }),
        ),
        `the breakdown at ${hardwareTierId}`,
      );
    }
  });

  /** **Every badge that *is* rendered is a formatted addition**, which is the other half of "no
   *  word leaked": a group could avoid printing `undefined` by printing nothing at all. Each option
   *  either carries the ruled *inclus*, or a `de la +…` built from its own measured delta, or
   *  nothing — and never a minus sign, which the mockups have no form for. */
  propertyTest.prop([anyPopulation])(
    "states inclus, a signed addition, or nothing at all — never a discount",
    (design) => {
      const view = viewOf(design);
      for (const group of view.groups) {
        for (const option of group.options) {
          if (option.deltaText === undefined) continue;
          expect(option.deltaText, option.tierId).not.toContain("-");
          expect(
            option.deltaText === ro.priceBreakdown.included ||
              option.deltaText.startsWith(
                ro.price.startingPrefix.toLowerCase(),
              ),
            `${option.tierId}: ${option.deltaText}`,
          ).toBe(true);
        }
      }
    },
  );
});

/**
 * **The wave's quantifier, derived a second time and in integers.**
 *
 * The wave writes it as *drawers > a × hinges + b × latches* with both coefficients divided out of
 * the rate gaps. That form is the ADR's, and it is also the form that can disagree with the module
 * at the boundary: two divisions and two multiplications in binary floating point do not have to
 * land on the same side of an equality that the exact integers do. Written here without a division,
 * so an agreement is an agreement between two arithmetics rather than one repeated.
 */
function invertsInIntegers(book: PriceBook, tierId: string, design: Design) {
  const standard = tierOf(book, DEFAULT_TIER_ID);
  const tier = tierOf(book, tierId);
  const counts = mechanismsIn(design);
  const surchargeMinor =
    (tier.perHingeMinor - standard.perHingeMinor) * counts.hinges +
    (tier.perPushToOpenMinor - standard.perPushToOpenMinor) * counts.pushToOpen;
  const savingMinor =
    (standard.perDrawerMinor - tier.perDrawerMinor) * counts.drawers;

  return savingMinor > surchargeMinor;
}

/** The sample book with one hardware tier's three rates replaced. The only way to reach a book that
 *  inverts on a tier other than the one ADR 0070's Hettich figure inverts. */
function bookWithHardwareRates(
  tierId: string,
  rates: {
    readonly perHingeMinor: number;
    readonly perDrawerMinor: number;
    readonly perPushToOpenMinor: number;
  },
): PriceBook {
  return {
    ...BOOK,
    hardware: {
      ...BOOK.hardware,
      tiers: BOOK.hardware.tiers.map((tier) =>
        tier.tierId === tierId ? { ...tier, ...rates } : tier,
      ),
    },
  };
}

const STANDARD = tierOf(BOOK, DEFAULT_TIER_ID);

/** Books whose inversion is somewhere other than where the shipped book puts it. Each is named by
 *  what it moves, and none of them is the sample book — so a module keyed to *Hettich*, or to the
 *  seeded rate figures, is red in this sweep and green in the wave's own. */
const MUTATED_BOOKS: readonly {
  readonly name: string;
  readonly book: PriceBook;
}[] = [
  {
    name: "the dearer tier made drawer-cheap, so the other non-default tier inverts",
    book: bookWithHardwareRates(DEARER_TIER_ID, {
      perHingeMinor: STANDARD.perHingeMinor + 5_000,
      perDrawerMinor: STANDARD.perDrawerMinor - 3_000,
      perPushToOpenMinor: STANDARD.perPushToOpenMinor + 1_000,
    }),
  },
  {
    name: "Hettich's drawer figure corrected, so the shipped inversion disappears",
    book: bookWithHardwareRates(INVERTING_TIER_ID, {
      perHingeMinor: 8_500,
      perDrawerMinor: STANDARD.perDrawerMinor + 1_400,
      perPushToOpenMinor: 12_000,
    }),
  },
  {
    name: "the latch surcharge reversed, which moves the boundary without moving a drawer rate",
    book: bookWithHardwareRates(INVERTING_TIER_ID, {
      perHingeMinor: 8_500,
      perDrawerMinor: 62_600,
      perPushToOpenMinor: STANDARD.perPushToOpenMinor - 3_500,
    }),
  },
];

describe("what states an amount is the book's arithmetic, not the tier's name", () => {
  propertyTest.prop([anyPopulation])(
    "states a hardware tier's delta exactly where the integer arithmetic makes it an addition",
    (design) => {
      const hardware = offerOf(design).hardware;
      const baseline = hardwareAmountFor(BOOK, DEFAULT_TIER_ID, design);

      for (const tierId of HARDWARE_TIER_IDS) {
        const amountMinor = hardwareAmountFor(BOOK, tierId, design) - baseline;
        expect(offeredDeltaFor(hardware, tierId), tierId).toBe(
          invertsInIntegers(BOOK, tierId, design) ? undefined : amountMinor,
        );
      }
    },
  );

  it.each(MUTATED_BOOKS.map(({ name, book }) => [name, book] as const))(
    "tracks the book when %s",
    (_name, book) => {
      // Swept over the same population space as the property above, deterministically, so the claim
      // is that the module follows *these* rates rather than that it follows some rates once.
      for (const design of everyOneAndTwoBodyPopulation()) {
        const hardware = offerOf(design, book).hardware;
        const baseline = hardwareAmountFor(book, DEFAULT_TIER_ID, design);

        for (const tierId of HARDWARE_TIER_IDS) {
          const amountMinor =
            hardwareAmountFor(book, tierId, design) - baseline;
          expect(
            offeredDeltaFor(hardware, tierId),
            `${tierId} on ${design.placements.map((one) => one.body.buildId).join("+")}`,
          ).toBe(
            invertsInIntegers(book, tierId, design) ? undefined : amountMinor,
          );
        }
      }
    },
  );

  /** The mutated books are only worth sweeping if they actually move the case. Asserted, so a rate
   *  edit that stopped inverting anything would show up as this going red rather than as the sweep
   *  above passing vacuously. */
  it("moves the inversion off Hettich and off the shipped rates", () => {
    const [otherTierInverts, correctedAway, latchReversed] = MUTATED_BOOKS;
    if (!otherTierInverts || !correctedAway || !latchReversed)
      throw new Error("the mutated book list lost an entry");

    expect(
      offeredDeltaFor(
        offerOf(DRAWERS_ONLY, otherTierInverts.book).hardware,
        DEARER_TIER_ID,
      ),
    ).toBeUndefined();
    expect(
      offeredDeltaFor(
        offerOf(DRAWERS_ONLY, correctedAway.book).hardware,
        INVERTING_TIER_ID,
      ),
    ).toBeGreaterThan(0);
    // The shipped book inverts here on three drawers; with the latch surcharge reversed it still
    // does, and the wave's own float derivation and this integer one must agree on both.
    expect(
      offeredDeltaFor(
        offerOf(DRAWERS_ONLY, latchReversed.book).hardware,
        INVERTING_TIER_ID,
      ),
    ).toBeUndefined();
  });

  /** **A book that inverts on *every* non-default hardware tier**, which is the state the wave's
   *  seeded case cannot reach: two silent options at once. The sheet must still render and still
   *  offer all three, and the default must still state `0`. */
  it("offers every tier when two of them price below the default at once", () => {
    const bothInvert = bookWithHardwareRates(DEARER_TIER_ID, {
      perHingeMinor: STANDARD.perHingeMinor,
      perDrawerMinor: STANDARD.perDrawerMinor - 10_000,
      perPushToOpenMinor: STANDARD.perPushToOpenMinor,
    });
    const hardware = offerOf(DRAWERS_ONLY, bothInvert).hardware;

    expect(hardware.tierIds).toEqual(HARDWARE_TIER_IDS);
    expect(offeredDeltaFor(hardware, DEFAULT_TIER_ID)).toBe(0);
    expect(offeredDeltaFor(hardware, INVERTING_TIER_ID)).toBeUndefined();
    expect(offeredDeltaFor(hardware, DEARER_TIER_ID)).toBeUndefined();

    const view = viewOf(DRAWERS_ONLY, bothInvert);
    const markup = settingsMarkupOf(view);
    for (const tier of BOOK.hardware.tiers)
      expect(markup, tier.tierId).toContain(tier.name);
    expectNoLeakedValue(markup, "the two-inversion sheet");
  });

  /** **A material tier's delta never moves under any of it.** The hardware rule is per group, and a
   *  rule that leaked across groups would show here as a material amount that changed when a
   *  hardware rate did. */
  it("leaves every material delta exactly where the shipped book puts it", () => {
    const shipped = offerOf(DRAWERS_ONLY).material;
    for (const { name, book } of MUTATED_BOOKS) {
      const measured = offerOf(DRAWERS_ONLY, book).material;
      expect(measured.tiers, name).toEqual(shipped.tiers);
    }
  });
});

/** Every design of one or two of the seeded kitchen's bodies. Small enough to sweep exhaustively and
 *  wide enough to cross the boundary in both directions — a lone drawer base inverts, and the same
 *  base beside a door box does not. */
function everyOneAndTwoBodyPopulation(): readonly Design[] {
  const placements = KITCHEN_L_DESIGN.placements;
  const designs: Design[] = [designOf([])];
  for (let first = 0; first < placements.length; first += 1) {
    const one = placements[first];
    if (!one) continue;
    designs.push(designOf([one]));
    for (let second = first + 1; second < placements.length; second += 1) {
      const two = placements[second];
      if (two) designs.push(designOf([one, two]));
    }
  }
  return designs;
}

describe("the refusal is narrowed, not laundered", () => {
  /** The message 6T shipped, rebuilt from the same two facts the constructor interpolates. Asserted
   *  character for character: "unchanged in meaning **and message**" is the wave's own criterion,
   *  and a message that lost the tier id or the shortfall would still be a `NegativeTierDeltaError`
   *  to a `toThrow(NegativeTierDeltaError)`. */
  it("keeps NegativeTierDeltaError's exact sentence for the material group", () => {
    const invertedMaterial: PriceBook = {
      ...BOOK,
      material: { ...BOOK.material, defaultTierId: "material.veneer" },
    };
    const cheapest = BOOK.material.tiers.find(
      (tier) => tier.tierId === "material.melamine",
    );
    const veneer = BOOK.material.tiers.find(
      (tier) => tier.tierId === "material.veneer",
    );
    if (!cheapest || !veneer) throw new Error("the book lost a material tier");
    const shortfallMinor =
      veneer.wholeKitchenMinor - cheapest.wholeKitchenMinor;

    expect(() => offerOf(DRAWERS_ONLY, invertedMaterial)).toThrow(
      new NegativeTierDeltaError("material.melamine", -shortfallMinor),
    );
    expect(() => offerOf(DRAWERS_ONLY, invertedMaterial)).toThrow(
      `Tier "material.melamine" prices the kitchen below its group's default by ` +
        `${String(shortfallMinor)} minor units; a tier delta is an addition, never a discount`,
    );
  });

  /** The error's own construction, independent of any book — so the sentence is pinned even if no
   *  book in the repository can reach it. */
  it("names the tier and the shortfall as a positive figure", () => {
    const error = new NegativeTierDeltaError("some.tier", -4_200);

    expect(error.name).toBe("NegativeTierDeltaError");
    expect(error.message).toBe(
      'Tier "some.tier" prices the kitchen below its group\'s default by ' +
        "4200 minor units; a tier delta is an addition, never a discount",
    );
  });

  /** **The leak the hardware rule could have opened**: the material refusal asked on every
   *  population, including the ones the hardware rule spares. A `BelowDefaultTierRule` wired the
   *  wrong way round, or read from the wrong group, is red here at once. */
  propertyTest.prop([anyPopulation])(
    "refuses an inverted material book at every population, whether or not the hardware inverts",
    (design) => {
      const invertedMaterial: PriceBook = {
        ...BOOK,
        material: { ...BOOK.material, defaultTierId: "material.veneer" },
      };

      expect(() => offerOf(design, invertedMaterial)).toThrow(
        NegativeTierDeltaError,
      );
    },
  );

  /** **The hardware group never raises it, on any book reachable here** — including the ones above
   *  that invert on a tier the shipped book does not. The rule is "hardware offers", and a book that
   *  made it throw would mean the refusal had been moved rather than narrowed. */
  it("never raises it from the hardware group, on any of the mutated books", () => {
    for (const { name, book } of [
      { name: "the shipped book", book: BOOK },
      ...MUTATED_BOOKS,
    ]) {
      for (const design of everyOneAndTwoBodyPopulation()) {
        expect(() => offerOf(design, book), name).not.toThrow();
      }
    }
  });

  /**
   * **The one thing the hardware rule now absorbs, pinned as what it is.**
   *
   * A hardware tier that is cheaper than the default on *all three* rates is not a fact about a
   * customer's kitchen: it prices **every** design with a mechanism below the default, so no design
   * can put it right and the wave's own reasoning for the hardware rule (*"which tier is cheapest is
   * a property of the customer's own kitchen"*) does not describe it. Nothing at runtime reports it.
   *
   * Recorded as a characterisation rather than asserted as a failure — the wave rules the hardware
   * group offers rather than refuses, and this is the price of that ruling, not a departure from it.
   * Its guard is a test on the sample book (`whole-kitchen-tiers.test.ts`'s *defaults each group to
   * its cheapest tier*), which is exercised below so the guard is known to fire.
   */
  it("absorbs a hardware tier that is cheaper on all three rates, and no runtime rule reports it", () => {
    const dominated = bookWithHardwareRates(INVERTING_TIER_ID, {
      perHingeMinor: STANDARD.perHingeMinor - 1,
      perDrawerMinor: STANDARD.perDrawerMinor - 1,
      perPushToOpenMinor: STANDARD.perPushToOpenMinor - 1,
    });

    // Every population carrying any mechanism at all prices below the default at this tier, and
    // every one of them is offered in silence.
    let silent = 0;
    for (const design of everyOneAndTwoBodyPopulation()) {
      const counts = mechanismsIn(design);
      if (counts.hinges + counts.drawers + counts.pushToOpen === 0) continue;
      expect(
        offeredDeltaFor(offerOf(design, dominated).hardware, INVERTING_TIER_ID),
      ).toBeUndefined();
      silent += 1;
    }
    expect(silent).toBeGreaterThan(0);

    // The guard that does catch it is a suite assertion over the *sample* book, not a runtime rule:
    // the dominated tier is the cheapest at the seeded kitchen, and its own default is not.
    const cheapestAtSeeded = [...BOOK.hardware.tiers]
      .map((tier) => ({
        tierId: tier.tierId,
        amountMinor: hardwareAmountFor(
          dominated,
          tier.tierId,
          KITCHEN_L_DESIGN,
        ),
      }))
      .sort((left, right) => left.amountMinor - right.amountMinor)[0];
    expect(cheapestAtSeeded?.tierId).toBe(INVERTING_TIER_ID);
    expect(cheapestAtSeeded?.tierId).not.toBe(dominated.hardware.defaultTierId);
  });
});

describe("the tier that states nothing is still a tier a customer can choose", () => {
  const OCCURRED_AT = "2026-09-06T12:00:00.000Z";

  function freshStore(design: Design) {
    return createConfiguratorStore({
      design,
      catalogAt: buildKitchenLBodyCatalog,
      probeAt: createFakeProbeFactory(),
      now: () => OCCURRED_AT,
    });
  }

  /** The whole round trip, driven the way a customer drives it: open the sheet on the design that
   *  inverts, choose the silent tier, and read what the kitchen then costs. */
  it("takes the choice, prices the kitchen lower for it, and lets the customer choose back", () => {
    const store = freshStore(DRAWERS_ONLY);
    const atDefault = pricingOf(DRAWERS_ONLY);
    if (!atDefault.ok) throw new Error("the witness design must price");

    store.getState().setHardwareTier(INVERTING_TIER_ID, HARDWARE_TIER_IDS);

    expect(store.getState().lastRejection).toBeNull();
    expect(store.getState().design.settings?.hardwareTierId).toBe(
      INVERTING_TIER_ID,
    );

    const chosen = pricingOf(store.getState().design);
    if (!chosen.ok) throw new Error("the chosen tier must still price");
    // The point of the wave: the kitchen genuinely costs less here, and the customer is shown a
    // coherent figure rather than a refusal.
    expect(chosen.priced.totalMinor).toBe(atDefault.priced.totalMinor - 4_200);
    const bar = describePriceBar({ pricing: chosen, content: ro });
    expect(bar.kind).toBe("priced");
    if (bar.kind !== "priced") throw new Error("unreachable");
    expect(bar.figure.label).toBe(ro.price.startingPrefix);
    expect(bar.figure.amountText).toMatch(/\d/);

    // And back again: the choice is not a trap.
    store.getState().setHardwareTier(DEFAULT_TIER_ID, HARDWARE_TIER_IDS);
    expect(store.getState().design.settings?.hardwareTierId).toBe(
      DEFAULT_TIER_ID,
    );
    expect(store.getState().lastRejection).toBeNull();
  });

  /** **The sheet the customer sees *while standing on* the silent tier.** Every seeded assertion in
   *  the wave measures a design that carries no hardware choice; this is the state the customer is
   *  left in by the click above, and the one where a delta measured against "what the design
   *  carries" could quietly re-baseline itself onto the chosen tier. */
  it("still measures every delta against the book's default once the silent tier is applied", () => {
    const carried: Design = {
      ...DRAWERS_ONLY,
      settings: { ...DRAWERS_ONLY.settings, hardwareTierId: INVERTING_TIER_ID },
    };
    const view = viewOf(carried);
    const group = view.groups.find((one) => one.key === "hardware");
    if (!group) throw new Error("no hardware group was described");
    const baseline = hardwareAmountFor(BOOK, DEFAULT_TIER_ID, carried);

    expect(group.options.map((option) => option.tierId)).toEqual(
      HARDWARE_TIER_IDS,
    );
    expect(group.options.find((option) => option.isSelected)?.tierId).toBe(
      INVERTING_TIER_ID,
    );
    // Selected and silent at once — the state a "selected tiers always show inclus" rule would
    // break, and the one the anchor sentence has to keep being true above.
    expect(
      group.options.find((option) => option.tierId === INVERTING_TIER_ID)
        ?.deltaText,
    ).toBeUndefined();
    expect(
      group.options.find((option) => option.tierId === DEFAULT_TIER_ID)
        ?.deltaText,
    ).toBe(ro.priceBreakdown.included);
    expect(offeredDeltaFor(offerOf(carried).hardware, DEARER_TIER_ID)).toBe(
      hardwareAmountFor(BOOK, DEARER_TIER_ID, carried) - baseline,
    );

    // The anchor still names what the remaining amounts are measured against, because there are
    // still amounts on the group. A sheet that dropped it here would leave two figures on screen
    // with nothing saying what they are against.
    expect(group.anchor).toBe(ro.globalSettings.groupAnchors.hardware);
    expectNoLeakedValue(settingsMarkupOf(view), "the sheet at the silent tier");
  });

  /** **Silent is not the same state as unpriced**, and the difference has to be visible. When the
   *  whole design cannot be priced every tier is silent *and* the anchor is gone; when one tier
   *  prices below the default the anchor stays. */
  it("distinguishes one silent tier from a sheet that could not be priced at all", () => {
    const unpriceable = describeGlobalSettings({
      content: ro,
      pricing: priceDesign({
        design: DRAWERS_ONLY,
        catalog: CATALOG,
        book: BOOK,
        pricingVersion: `${SAMPLE_PRICE_BOOK_VERSION}-retired`,
      }),
      offer: offerWholeKitchenTiers({
        design: DRAWERS_ONLY,
        catalog: CATALOG,
        book: BOOK,
        pricingVersion: `${SAMPLE_PRICE_BOOK_VERSION}-retired`,
      }),
      groups: projectDesignForDisplay(DRAWERS_ONLY, CATALOG),
      applied: {},
      pending: {},
      chosenColourCount: countCabinetsWearingAChosenFinish(DRAWERS_ONLY),
    });
    const silentGroup = viewOf(DRAWERS_ONLY).groups.find(
      (one) => one.key === "hardware",
    );
    const blankGroup = unpriceable.groups.find((one) => one.key === "hardware");

    expect(silentGroup?.anchor).toBe(ro.globalSettings.groupAnchors.hardware);
    expect(blankGroup?.anchor).toBeUndefined();
    for (const option of blankGroup?.options ?? [])
      expect(option.deltaText, option.tierId).toBeUndefined();
  });

  /** Every material id stays offered under the silent hardware tier too — the groups do not
   *  interfere, which is what "all-or-nothing across both groups" leaves room to get wrong now that
   *  one group can omit a single amount. */
  it("keeps every material tier stating its own amount while a hardware tier states none", () => {
    const material = offerOf(DRAWERS_ONLY).material;

    expect(material.tierIds).toEqual(MATERIAL_TIER_IDS);
    for (const tierId of MATERIAL_TIER_IDS)
      expect(offeredDeltaFor(material, tierId), tierId).toBeGreaterThanOrEqual(
        0,
      );
  });
});
