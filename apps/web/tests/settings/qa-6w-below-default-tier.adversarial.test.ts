import { SAMPLE_DEEP_CABINET_PERCENT } from "../support/sample-deep-cabinet-percent";
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
  parsePriceBook,
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

import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";
import { createFakeProbeFactory } from "../support/fake-body-probe";
import { roundedToTenLei } from "../support/ten-lei-amounts";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const BOOK = SAMPLE_PRICE_BOOK;
const DEFAULT_TIER_ID = BOOK.hardware.defaultTierId;
const HARDWARE_TIER_IDS = BOOK.hardware.tiers.map((tier) => tier.tierId);
const MATERIAL_TIER_IDS = BOOK.material.tiers.map((tier) => tier.tierId);
/** The tier ADR 0070's runners-only drawer figure puts below the default on a drawer-dominant design; the only one
 *  the shipped book inverts on. */
const INVERTING_TIER_ID = "hardware.soft-close";
const DEARER_TIER_ID = "hardware.premium";
/** One `base-drawer3-600`: three drawers, no hinge, no latch. */
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

/** What a book's rates make this design at this tier, exact: the tier's own three rates over the design's counts. */
function exactHardwareAmountFor(
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

/** What the hardware line prints at this tier: the exact amount rounded once to ten lei (ADR 0177 A-1), which is what a
 *  tier's delta and its standing below the default are measured in. The independent side of every comparison below,
 *  never read off an offered delta. */
function hardwareAmountFor(
  book: PriceBook,
  tierId: string,
  design: Design,
): number {
  return roundedToTenLei(exactHardwareAmountFor(book, tierId, design));
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
    deepeningRows: MEASURED_DEEPENING_ROWS,
  });
}

function pricingOf(design: Design, book: PriceBook = BOOK): PricingResult {
  return priceDesign({
    design,
    catalog: CATALOG,
    book,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections: design.settings,
    deepeningRows: MEASURED_DEEPENING_ROWS,
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
    deepCabinetPercent: SAMPLE_DEEP_CABINET_PERCENT,
    content: ro,
    pricing: pricingOf(design, book),
    offer: offerOf(design, book),
    groups: projectDesignForDisplay(design, CATALOG),
    applied: design.settings ?? {},
    pending: design.settings ?? {},
    chosenColourCount: countCabinetsWearingAChosenFinish(design),
  });
}

/** This file is about a book whose tier prices below its own default, never about access. Stated rather than
 *  defaulted: `GlobalSettingsSurface.editability` is a required prop so a write surface cannot default to permitted. */
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

/** `undefined` reaches markup through interpolation and `NaN` through arithmetic, and neither belongs in any ruled
 *  string. Asserted against rendered HTML, because a view still holds the value and only the render makes the word. */
const LEAKED_WORDS = ["undefined", "NaN", "null"] as const;

function expectNoLeakedValue(markup: string, whereFrom: string): void {
  for (const word of LEAKED_WORDS) {
    expect(markup.includes(word), `${whereFrom} rendered "${word}"`).toBe(
      false,
    );
  }
}

/** Every population the seeded kitchen can be cut to; the inverting case is inside this space, so nothing is seeded. */
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

  /** The bar and the breakdown never see `exactDelta`'s new return type; measured rather than read off the imports. */
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

  /** Every rendered badge is a formatted addition: a group could avoid printing `undefined` by printing nothing.
   *  Each option carries the ruled *inclus*, a `de la +…` built from its measured delta, or nothing; never a minus
   *  sign. */
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
 * The quantifier derived a second time, in integers with no division, from the rate gaps alone. Rounding to ten lei can
 * move a tier across the boundary only where this margin is under one grain, so the module's answer is held to it
 * wherever the margin is a grain or more (`expectedDelta` below), and to the printed amounts everywhere.
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

const GRAIN_MINOR = 1_000;

/** What a hardware tier's delta must be on a design: its printed amount less the default's, stated unless that is
 *  negative; and, wherever the exact gap is a whole grain or more, the rate gaps' own verdict. */
function expectedDelta(
  book: PriceBook,
  tierId: string,
  design: Design,
): number | undefined {
  const printedGapMinor =
    hardwareAmountFor(book, tierId, design) -
    hardwareAmountFor(book, DEFAULT_TIER_ID, design);
  const exactGapMinor =
    exactHardwareAmountFor(book, tierId, design) -
    exactHardwareAmountFor(book, DEFAULT_TIER_ID, design);
  if (Math.abs(exactGapMinor) >= GRAIN_MINOR) {
    // A margin of a whole grain cannot be rounded across zero.
    expect(printedGapMinor < 0, `${tierId} by the rates`).toBe(
      invertsInIntegers(book, tierId, design),
    );
  }
  return printedGapMinor < 0 ? undefined : printedGapMinor;
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

/** Books whose inversion is somewhere other than where the shipped book puts it: a module keyed to *Hettich* or
 *  to the seeded rates is red here. */
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

      for (const tierId of HARDWARE_TIER_IDS) {
        expect(offeredDeltaFor(hardware, tierId), tierId).toBe(
          expectedDelta(BOOK, tierId, design),
        );
      }
    },
  );

  it.each(MUTATED_BOOKS.map(({ name, book }) => [name, book] as const))(
    "tracks the book when %s",
    (_name, book) => {
      // Swept over the same population space, so the claim is that the module follows *these* rates.
      for (const design of everyOneAndTwoBodyPopulation()) {
        const hardware = offerOf(design, book).hardware;

        for (const tierId of HARDWARE_TIER_IDS) {
          expect(
            offeredDeltaFor(hardware, tierId),
            `${tierId} on ${design.placements.map((one) => one.body.buildId).join("+")}`,
          ).toBe(expectedDelta(book, tierId, design));
        }
      }
    },
  );

  /** The mutated books are only worth sweeping if they move the case; asserted, so a rate edit that stopped inverting
   *  anything fails here rather than passing the sweep vacuously. */
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
    // The shipped book inverts here on three drawers, and still does with the latch surcharge reversed.
    expect(
      offeredDeltaFor(
        offerOf(DRAWERS_ONLY, latchReversed.book).hardware,
        INVERTING_TIER_ID,
      ),
    ).toBeUndefined();
  });

  /** A book that inverts on every non-default hardware tier: two silent options at once, which the seeded case cannot
   *  reach. The sheet still renders and offers all three, and the default still states `0`. */
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

  /** The hardware rule is per group: a rule leaking across groups would change a material amount when a hardware rate
   *  changed. */
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
  /** An inverted material book, as the cut-over leaves it reachable: the default tier is a dear one. The parser refuses
   *  it (the default material is the 0 % reference, A-8), so pricing refuses it, so the sheet offers every tier and
   *  states no amount; a discount is never printed and the settings sheet, the recovery path, is never closed (P3-d).
   *  Since a parsed book's material percentages are all at least the reference's, `NegativeTierDeltaError` from the
   *  material group guards a book the parser has already refused. */
  const invertedMaterial: PriceBook = {
    ...BOOK,
    material: { ...BOOK.material, defaultTierId: "material.veneer" },
  };

  it("refuses an inverted material book at the parser, and offers every tier with no amount rather than a discount", () => {
    const parsed = parsePriceBook(invertedMaterial);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.failure.code).toBe("INVALID_PRICE_BOOK");
    expect(parsed.failure.detail).toContain("material.veneer");

    const offer = offerOf(DRAWERS_ONLY, invertedMaterial);
    expect(offer.material.tierIds).toEqual(MATERIAL_TIER_IDS);
    expect(offer.hardware.tierIds).toEqual(HARDWARE_TIER_IDS);
    for (const group of [offer.material, offer.hardware]) {
      for (const tier of group.tiers) {
        expect(tier.deltaMinor, tier.tierId).toBeUndefined();
      }
    }
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

  /** The inverted material book asked on every population: refused whole whatever the hardware does, and never a
   *  throw. */
  propertyTest.prop([anyPopulation])(
    "answers an inverted material book at every population without a throw and without a figure",
    (design) => {
      expect(() => offerOf(design, invertedMaterial)).not.toThrow();
      expect(pricingOf(design, invertedMaterial).ok).toBe(false);
    },
  );

  /** The hardware group never raises it on any reachable book: one that made it throw would mean the refusal was
   *  moved rather than narrowed. */
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
   * A hardware tier cheaper than the default on all three rates prices every design with a mechanism below the
   * default, so no design can put it right and nothing at runtime reports it. Recorded as a characterisation; the guard
   * is a test on the sample book (`whole-kitchen-tiers.test.ts`'s *defaults each group to its cheapest tier*).
   */
  it("absorbs a hardware tier that is cheaper on all three rates, and no runtime rule reports it", () => {
    const dominated = bookWithHardwareRates(INVERTING_TIER_ID, {
      // One grain under on each rate: a bani under would be rounded away, and the tier would price at the default.
      perHingeMinor: STANDARD.perHingeMinor - GRAIN_MINOR,
      perDrawerMinor: STANDARD.perDrawerMinor - GRAIN_MINOR,
      perPushToOpenMinor: STANDARD.perPushToOpenMinor - GRAIN_MINOR,
    });

    // The guard that catches it is a suite assertion over the *sample* book, not a runtime rule: asked to price the
    // seeded kitchen under this book, pricing answers at both tiers and puts the dominated one below the default.
    // Priced by the product, because a total this file composed from the rates says nothing about what it charges.
    const totalMinorAt = (hardwareTierId: string): number => {
      const pricing = pricingOf(
        {
          ...KITCHEN_L_DESIGN,
          settings: { ...KITCHEN_L_DESIGN.settings, hardwareTierId },
        },
        dominated,
      );
      if (!pricing.ok) throw new Error(`pricing refused "${hardwareTierId}"`);
      return pricing.priced.totalMinor;
    };

    expect(INVERTING_TIER_ID).not.toBe(dominated.hardware.defaultTierId);
    expect(totalMinorAt(INVERTING_TIER_ID)).toBeLessThan(
      totalMinorAt(dominated.hardware.defaultTierId),
    );

    // Every population carrying a mechanism prices below the default at this tier, and every one is offered in silence.
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
    // The kitchen genuinely costs less here, and the customer sees a coherent figure rather than a refusal.
    expect(chosen.priced.totalMinor).toBe(
      atDefault.priced.totalMinor +
        hardwareAmountFor(BOOK, INVERTING_TIER_ID, DRAWERS_ONLY) -
        hardwareAmountFor(BOOK, DEFAULT_TIER_ID, DRAWERS_ONLY),
    );
    expect(chosen.priced.totalMinor).toBeLessThan(atDefault.priced.totalMinor);
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

  /** The state the click above leaves the customer in: a delta measured against "what the design carries" could
   *  quietly re-baseline itself onto the chosen tier. */
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
    // Selected and silent at once: the state a "selected tiers always show inclus" rule would break.
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

    // The anchor still names what the remaining amounts are measured against; dropping it would leave two figures with
    // nothing saying what they are against.
    expect(group.anchor).toBe(ro.globalSettings.groupAnchors.hardware);
    expectNoLeakedValue(settingsMarkupOf(view), "the sheet at the silent tier");
  });

  /** Silent is not unpriced: a design that cannot be priced silences every tier and drops the anchor, while one tier
   *  pricing below the default keeps it. */
  it("distinguishes one silent tier from a sheet that could not be priced at all", () => {
    const unpriceable = describeGlobalSettings({
      deepCabinetPercent: SAMPLE_DEEP_CABINET_PERCENT,
      content: ro,
      pricing: priceDesign({
        design: DRAWERS_ONLY,
        catalog: CATALOG,
        book: BOOK,
        pricingVersion: `${SAMPLE_PRICE_BOOK_VERSION}-retired`,
        deepeningRows: MEASURED_DEEPENING_ROWS,
      }),
      offer: offerWholeKitchenTiers({
        design: DRAWERS_ONLY,
        catalog: CATALOG,
        book: BOOK,
        pricingVersion: `${SAMPLE_PRICE_BOOK_VERSION}-retired`,
        deepeningRows: MEASURED_DEEPENING_ROWS,
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

  /** The groups do not interfere: one group omitting a single amount leaves the other group's amounts intact. */
  it("keeps every material tier stating its own amount while a hardware tier states none", () => {
    const material = offerOf(DRAWERS_ONLY).material;

    expect(material.tierIds).toEqual(MATERIAL_TIER_IDS);
    for (const tierId of MATERIAL_TIER_IDS)
      expect(offeredDeltaFor(material, tierId), tierId).toBeGreaterThanOrEqual(
        0,
      );
  });
});
