import { SAMPLE_DEEP_CABINET_PERCENT } from "../support/sample-deep-cabinet-percent";
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  countCabinetsWearingAChosenFinish,
  cabinetHandleCount,
  countHardwareMechanisms,
  type HardwareMechanismCounts,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type Design,
  type DisplayGroup,
  type EmptyColumn,
  type PricingResult,
  type WholeKitchenSelections,
} from "@lemnaria/configurator-domain";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/use-content", async () => {
  const { ro } = await import("../support/romanian-content");
  return { useContent: () => ro };
});

import { ro } from "../support/romanian-content";
import roMessages from "../../src/messages/ro.json";
import { authoredLiteralsIn } from "../support/icu-authored-literals";
import { SUM_CLAIM_PATTERN } from "../support/ruled-price-copy";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";
import {
  materialLineBounds,
  roundedToTenLei,
} from "../support/ten-lei-amounts";
import {
  describeAddedAmount,
  describeRoundedAmount,
} from "@/price/starting-price";
import {
  offerWholeKitchenTiers,
  type OfferedTierGroup,
  type WholeKitchenTierOffer,
} from "@/price/whole-kitchen-tiers";
import {
  describeGlobalSettings,
  type GlobalSettingsView,
  type DescribeGlobalSettingsInput,
  type TierGroupView,
} from "@/settings/global-settings-model";
import { GlobalSettingsSurface } from "@/settings/global-settings";
import { describeEditability } from "@/store/editability";

const MATERIAL_TIER_IDS = SAMPLE_PRICE_BOOK.material.tiers.map(
  (tier) => tier.tierId,
);
const HARDWARE_TIER_IDS = SAMPLE_PRICE_BOOK.hardware.tiers.map(
  (tier) => tier.tierId,
);

const GLOBAL_SETTINGS_AUTHORED_LITERALS = authoredLiteralsIn(
  roMessages.globalSettings,
);

describe("the global-settings ICU literal sweep", () => {
  it("reaches a substantial catalogue surface before applying negative rules", () => {
    expect(GLOBAL_SETTINGS_AUTHORED_LITERALS.length).toBeGreaterThanOrEqual(20);
  });

  it("detects digits and sum claims nested inside ICU branches", () => {
    const mutantLiterals = authoredLiteralsIn({
      plural: "{count, plural, one {Total 7 items} other {# items}}",
      select: "{kind, select, safe {plain words} other {sum=8}}",
    });

    expect(mutantLiterals.length).toBeGreaterThanOrEqual(4);
    expect(mutantLiterals.some((literal) => /\d/.test(literal))).toBe(true);
    expect(
      mutantLiterals.some((literal) => SUM_CLAIM_PATTERN.test(literal)),
    ).toBe(true);
  });
});

/** Every whole-kitchen state a design can be in. `undefined` is a member: a fresh design carries no tier ids, the
 *  state every customer first opens the sheet in. */
const EVERY_CARRIED_SELECTION: readonly (WholeKitchenSelections | undefined)[] =
  [
    undefined,
    ...MATERIAL_TIER_IDS.flatMap((materialTierId) =>
      HARDWARE_TIER_IDS.map((hardwareTierId) => ({
        materialTierId,
        hardwareTierId,
      })),
    ),
  ];

function designCarrying(
  selections: WholeKitchenSelections | undefined,
): Design {
  if (selections === undefined) {
    // The seeded design chooses neither tier id, which is the unset state; asserted so this arm cannot stop being it.
    expect(KITCHEN_L_DESIGN.settings?.materialTierId).toBeUndefined();
    expect(KITCHEN_L_DESIGN.settings?.hardwareTierId).toBeUndefined();
    return KITCHEN_L_DESIGN;
  }
  return { ...KITCHEN_L_DESIGN, settings: selections };
}

function measure(design: Design): WholeKitchenTierOffer {
  return offerWholeKitchenTiers({
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections: design.settings,
    deepeningRows: MEASURED_DEEPENING_ROWS,
  });
}

function deltaOf(group: OfferedTierGroup, tierId: string): number {
  const tier = group.tiers.find((one) => one.tierId === tierId);
  if (!tier) throw new Error(`the offer holds no tier "${tierId}"`);
  if (tier.deltaMinor === undefined)
    throw new Error(
      `tier "${tierId}" states no delta; the design did not price`,
    );
  return tier.deltaMinor;
}

/**
 * The hardware population counted without pricing anything, so the expected delta is independent of `priceDesign`.
 * It counts mechanisms (ADR 0070 decision 1), not handles: `base-panbank`'s two handles are drawers and a `push`
 * body carries none. A test may derive this; the seam guard only forbids a `src/` module doing so.
 */
function countMechanismsIn(design: Design): HardwareMechanismCounts {
  return countHardwareMechanisms(
    projectDesignForDisplay(design, KITCHEN_L_BODY_CATALOG).flatMap(
      (group) => group.entries,
    ),
    KITCHEN_L_BODY_CATALOG,
  );
}

/** The superseded handle-count denominator, kept only so an assertion can say the mechanism count is not it. */
function countHandlesIn(design: Design): number {
  return projectDesignForDisplay(design, KITCHEN_L_BODY_CATALOG)
    .flatMap((group) => group.entries)
    .reduce(
      (handles, entry) =>
        handles +
        cabinetHandleCount({
          buildId: entry.buildId,
          rule: KITCHEN_L_BODY_CATALOG.get(entry.buildId)?.cabinetHandles,
          widthMm: entry.widthMm,
        }),
      0,
    );
}

/** Every mechanism in the design, as one number — the denominator the assertions below name. */
function totalMechanismsIn(design: Design): number {
  const counts = countMechanismsIn(design);
  return counts.hinges + counts.drawers + counts.pushToOpen;
}

/** What the hardware line prints for this design at this tier: three rates against three counts, composed here rather
 *  than read off a line, rounded once to ten lei (ADR 0177 A-1). The independent side. */
function bookAmountFor(tierId: string, design: Design): number {
  const tier = SAMPLE_PRICE_BOOK.hardware.tiers.find(
    (one) => one.tierId === tierId,
  );
  if (!tier) throw new Error(`the book holds no hardware tier "${tierId}"`);
  const mechanisms = countMechanismsIn(design);

  return roundedToTenLei(
    tier.perHingeMinor * mechanisms.hinges +
      tier.perDrawerMinor * mechanisms.drawers +
      tier.perPushToOpenMinor * mechanisms.pushToOpen,
  );
}

/** What the material line prints for this design at this tier, read off the priced design's own line: the one amount a
 *  material tier moves, and so what its delta must be. */
function materialLineFor(tierId: string, design: Design) {
  const result = priceDesign({
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections: { ...design.settings, materialTierId: tierId },
    deepeningRows: MEASURED_DEEPENING_ROWS,
  });
  if (!result.ok) throw new Error("the design was expected to price");
  const line = result.priced.lines.find((one) => one.kind === "material");
  if (line === undefined) throw new Error("no material line");
  return { amountMinor: line.amountMinor, lines: result.priced.lines };
}

function percentOf(tierId: string): number {
  const tier = SAMPLE_PRICE_BOOK.material.tiers.find(
    (one) => one.tierId === tierId,
  );
  if (!tier) throw new Error(`the book holds no material tier "${tierId}"`);
  return tier.percentOfCabinets;
}

function pricingOf(design: Design): PricingResult {
  return priceDesign({
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections: design.settings,
    deepeningRows: MEASURED_DEEPENING_ROWS,
  });
}

function offerOf(design: Design): WholeKitchenTierOffer {
  return offerWholeKitchenTiers({
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections: design.settings,
    deepeningRows: MEASURED_DEEPENING_ROWS,
  });
}

function viewOf(
  design: Design,
  overrides: Partial<DescribeGlobalSettingsInput> = {},
): GlobalSettingsView {
  const view = describeGlobalSettings({
    deepCabinetPercent: SAMPLE_DEEP_CABINET_PERCENT,
    content: ro,
    pricing: pricingOf(design),
    offer: offerOf(design),
    groups: projectDesignForDisplay(design, KITCHEN_L_BODY_CATALOG),
    applied: design.settings ?? {},
    pending: design.settings ?? {},
    chosenColourCount: countCabinetsWearingAChosenFinish(design),
    ...overrides,
  });
  return view;
}

function groupNamed(
  view: GlobalSettingsView,
  key: "material" | "hardware",
): TierGroupView {
  const group = view.groups.find((one) => one.key === key);
  if (!group) throw new Error(`no ${key} group was described`);
  return group;
}

/** These fixtures are not about access: stated rather than defaulted, because `editability` is a required prop so
 *  a write surface cannot silently default to permitted. */
const WRITABLE_ACCESS = describeEditability(
  {
    canWrite: true,
    saveStatus: "idle",
  },
  ro.panel,
);

function markupOf(view: GlobalSettingsView): string {
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

describe("a delta cannot depend on a setting the customer is not looking at", () => {
  it("gives a material tier the same delta under every hardware tier the design could carry", () => {
    for (const tierId of MATERIAL_TIER_IDS) {
      const measured = EVERY_CARRIED_SELECTION.map((selections) =>
        deltaOf(measure(designCarrying(selections)).material, tierId),
      );

      expect(new Set(measured).size, `${tierId}: ${measured.join(", ")}`).toBe(
        1,
      );
    }
  });

  it("gives a hardware tier the same delta under every material tier the design could carry", () => {
    for (const tierId of HARDWARE_TIER_IDS) {
      const measured = EVERY_CARRIED_SELECTION.map((selections) =>
        deltaOf(measure(designCarrying(selections)).hardware, tierId),
      );

      expect(new Set(measured).size, `${tierId}: ${measured.join(", ")}`).toBe(
        1,
      );
    }
  });

  it("measures against the book's default rather than against the tier the design already carries", () => {
    // Characterisation: the baseline is the group's `defaultTierId`, so a customer already on *Furnir natural* still
    // reads a *de la +…* beside the tier they own. Pinned so moving it is a decision rather than an unread diff.
    const carrying = designCarrying({ materialTierId: "material.veneer" });
    const onVeneer = measure(carrying);
    const veneerLine = materialLineFor("material.veneer", carrying);
    const { nearMinor, toleranceMinor } = materialLineBounds(
      veneerLine.lines,
      percentOf("material.veneer"),
    );

    // The delta is the material line the tier prints (the reference's is nothing), which is the book's percentage of the
    // kitchen's cabinets to within the per-cabinet rounding.
    expect(deltaOf(onVeneer.material, "material.veneer")).toBe(
      veneerLine.amountMinor -
        materialLineFor(SAMPLE_PRICE_BOOK.material.defaultTierId, carrying)
          .amountMinor,
    );
    expect(
      Math.abs(deltaOf(onVeneer.material, "material.veneer") - nearMinor),
    ).toBeLessThanOrEqual(toleranceMinor);
    expect(
      deltaOf(onVeneer.material, SAMPLE_PRICE_BOOK.material.defaultTierId),
    ).toBe(0);
  });

  it("reads that consequence on the page, in the words a customer would see", () => {
    const carrying = designCarrying({ materialTierId: "material.veneer" });
    const view = viewOf(carrying);
    const material = groupNamed(view, "material");

    // The words are the ruled ones around a figure rounded up to the thousand from the tier's own material line: the
    // reference is *inclus* and the others *de la +…* from what they add.
    expect(
      material.options.map((option) => [option.tierId, option.deltaText]),
    ).toEqual([
      ["material.melamine", "inclus"],
      [
        "material.painted-mdf",
        `de la ${describeAddedAmount(materialLineFor("material.painted-mdf", carrying).amountMinor)}`,
      ],
      [
        "material.veneer",
        `de la ${describeAddedAmount(materialLineFor("material.veneer", carrying).amountMinor)}`,
      ],
    ]);
  });
});

describe("the arithmetic, re-derived from something that is not priceDesign", () => {
  it("bills a hardware delta at the book's rates times a mechanism population counted from the catalogue", () => {
    // The independent expected side; the shipped test only asserts the delta exceeds one mechanism's rate.
    const mechanisms = totalMechanismsIn(KITCHEN_L_DESIGN);
    const hardware = measure(KITCHEN_L_DESIGN).hardware;

    // The denominators this would still pass under if wrong: the body count and the superseded handle count.
    expect(mechanisms).not.toBe(KITCHEN_L_DESIGN.placements.length);
    expect(mechanisms).not.toBe(countHandlesIn(KITCHEN_L_DESIGN));
    expect(mechanisms).toBeGreaterThan(1);
    for (const tierId of HARDWARE_TIER_IDS) {
      expect(deltaOf(hardware, tierId), tierId).toBe(
        bookAmountFor(tierId, KITCHEN_L_DESIGN) -
          bookAmountFor(
            SAMPLE_PRICE_BOOK.hardware.defaultTierId,
            KITCHEN_L_DESIGN,
          ),
      );
    }
  });

  it("keeps that denominator when the kitchen loses bodies, rather than holding a shipped constant", () => {
    // A second population, so the agreement above is not one arithmetic coincidence.
    const wallBOnly: Design = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.filter(
        (placement) => placement.wall === "B",
      ),
    };
    expect(totalMechanismsIn(wallBOnly)).toBeLessThan(
      totalMechanismsIn(KITCHEN_L_DESIGN),
    );
    for (const tierId of HARDWARE_TIER_IDS) {
      expect(deltaOf(measure(wallBOnly).hardware, tierId), tierId).toBe(
        bookAmountFor(tierId, wallBOnly) -
          bookAmountFor(SAMPLE_PRICE_BOOK.hardware.defaultTierId, wallBOnly),
      );
    }
  });

  it("charges nothing for any hardware tier in a kitchen with no bodies, and says so in words", () => {
    const empty: Design = { ...KITCHEN_L_DESIGN, placements: [] };

    expect(totalMechanismsIn(empty)).toBe(0);
    for (const tierId of HARDWARE_TIER_IDS)
      expect(deltaOf(measure(empty).hardware, tierId), tierId).toBe(0);
    expect(
      groupNamed(viewOf(empty), "hardware").options.map(
        (option) => option.deltaText,
      ),
    ).toEqual(["inclus", "inclus", "inclus"]);
  });

  it("charges a material nothing in a kitchen with no cabinets, since it is a percentage of nothing, and charges it in one with cabinets", () => {
    // Without the second half, an all-zero material delta is also what a measurement that stopped measuring looks like.
    const empty: Design = { ...KITCHEN_L_DESIGN, placements: [] };

    expect(deltaOf(measure(empty).material, "material.veneer")).toBe(0);
    expect(
      groupNamed(viewOf(empty), "material").options.map(
        (option) => option.deltaText,
      ),
    ).toEqual(["inclus", "inclus", "inclus"]);
    expect(
      deltaOf(measure(KITCHEN_L_DESIGN).material, "material.veneer"),
    ).toBeGreaterThan(0);
  });
});

describe("the sign is part of the figure, and the figure rounds exactly once", () => {
  const anyDelta = fc.integer({ min: 0, max: 9_007_199_254_740_000 });

  propertyTest.prop([anyDelta])(
    "is the rounded amount with the mockups' mark in front of it, and nothing else",
    (deltaMinor) => {
      expect(describeAddedAmount(deltaMinor)).toBe(
        `+${describeRoundedAmount(deltaMinor)}`,
      );
    },
  );

  propertyTest.prop([anyDelta])(
    "never carries a mark on a figure that did not round up to the thousand",
    (deltaMinor) => {
      const badge = describeAddedAmount(deltaMinor);
      const signedThousands = Number(badge.replace(/[+ ]/g, ""));

      expect(badge.startsWith("+")).toBe(true);
      expect(signedThousands % 1000).toBe(0);
      expect(signedThousands * 100).toBeGreaterThanOrEqual(deltaMinor);
      expect((signedThousands - 1000) * 100).toBeLessThan(
        Math.max(deltaMinor, 1),
      );
    },
  );

  it("refuses a delta that is not a whole non-negative count of minor units, rather than signing it", () => {
    for (const deltaMinor of [
      -1,
      -1000,
      -0.5,
      0.5,
      Number.EPSILON,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(
        () => describeAddedAmount(deltaMinor),
        `${String(deltaMinor)} was signed rather than refused`,
      ).toThrow(RangeError);
    }
  });

  it("would sign a zero, and the model is what keeps that off the screen", () => {
    // `describeAddedAmount(0)` is `"+0"`, a number that is not a price. `describeDelta` short-circuits above the
    // formatter, so both halves are asserted: the formatter's behaviour, and that nothing reaches it with a zero.
    expect(describeAddedAmount(0)).toBe("+0");
    for (const view of [viewOf(KITCHEN_L_DESIGN)]) {
      for (const group of view.groups) {
        for (const option of group.options) {
          expect(option.deltaText, option.tierId).not.toContain("+0");
        }
      }
    }
  });

  it("prints every badge as the measured delta formatted by the one formatter, never as the view's own string", () => {
    // Expected text is built from the measured delta through the published formatter and actual text is read off the
    // rendered page, so neither side comes from the model.
    const view = viewOf(KITCHEN_L_DESIGN);
    const offer = measure(KITCHEN_L_DESIGN);
    const markup = markupOf(view);

    for (const [key, group] of [
      ["material", offer.material],
      ["hardware", offer.hardware],
    ] as const) {
      for (const tier of group.tiers) {
        if (tier.deltaMinor === undefined)
          throw new Error("the seeded design was expected to price");
        const expected =
          tier.deltaMinor === 0
            ? ro.priceBreakdown.included
            : `de la ${describeAddedAmount(tier.deltaMinor)}`;
        expect(
          groupNamed(view, key).options.find(
            (option) => option.tierId === tier.tierId,
          )?.deltaText,
          tier.tierId,
        ).toBe(expected);
        expect(markup, tier.tierId).toContain(`>${expected}</span>`);
      }
    }
  });
});

describe("the sign, the step and the separator live in one module and no other", () => {
  const SOURCE_ROOT = resolve(import.meta.dirname, "../../src");
  const THIS_SURFACE = [
    "price/whole-kitchen-tiers.ts",
    "settings/global-settings-model.ts",
    "settings/global-settings.tsx",
  ];

  function sourceOf(path: string): string {
    return readFileSync(resolve(SOURCE_ROOT, path), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
  }

  it("writes no arithmetic on a displayed amount anywhere in the three modules this wave added", () => {
    // The seam guard refuses `Math.*`; these are the other spellings of a second rounding site, none naming `Math`.
    for (const path of THIS_SURFACE) {
      const source = sourceOf(path);
      expect(source, path).not.toMatch(/toFixed|toPrecision|Intl\./);
      expect(source, path).not.toMatch(/Minor\s*\/|\/\s*100/);
      expect(source, path).not.toMatch(/\*\*/);
    }
  });

  it("leaves the delta's sign in the formatter, so no label authors arithmetic of its own", () => {
    // A `+` before an interpolated amount composes a figure outside the one allowed module; matched on that shape so
    // an error message joining two strings is not mistaken for one.
    for (const path of THIS_SURFACE) {
      expect(sourceOf(path), path).not.toMatch(/\+\s*\$\{/);
    }
    expect(sourceOf("price/starting-price.ts")).toContain(
      'ADDED_AMOUNT_SIGN = "+"',
    );
  });

  it("keeps the sign out of the copy module, where a plus is a claim rather than a figure", () => {
    for (const copy of GLOBAL_SETTINGS_AUTHORED_LITERALS)
      expect(copy, copy).not.toContain("+");
  });
});

describe("the two words on the badge cannot drift from the two above the figure", () => {
  propertyTest.prop([fc.string()])(
    "puts the lowercased prefix in front of whatever amount it is handed, and adds no third word",
    (amountText) => {
      expect(ro.globalSettings.tierDelta(amountText)).toBe(
        `de la ${amountText}`,
      );
    },
  );

  it("renders the badge's words on the page rather than only in the model", () => {
    // The badge of a tier above the reference, in the words the page prints, from the tier's own material line.
    const upgradeId = "material.painted-mdf";
    const badge = `de la ${describeAddedAmount(materialLineFor(upgradeId, KITCHEN_L_DESIGN).amountMinor)}`;

    expect(markupOf(viewOf(KITCHEN_L_DESIGN))).toContain(`>${badge}<`);
  });

  // Exact Romanian CLDR boundaries and Gate O1 wording belong to
  // `tests/i18n/content.test.ts`; the population-to-resolved-message seam is swept below.
});

describe("how many bodies, and which part of the document says so", () => {
  /** The projection maps `placements` one-to-one, so the projected count equals `placements.length` for any design
   *  that projects; the sweeps measure whether the sheet follows the projection when the document grows non-body
   *  space. */
  const anyPlacementSubset = fc
    .subarray([...KITCHEN_L_DESIGN.placements], { minLength: 0 })
    .map((placements) => ({ ...KITCHEN_L_DESIGN, placements }));

  function statedCount(view: GlobalSettingsView): number {
    const stated = /celor (\d+) /.exec(view.appliesTo);
    if (stated) return Number(stated[1]);
    if (view.appliesTo === ro.globalSettings.appliesTo(1)) return 1;
    throw new Error(`no count is stated in "${view.appliesTo}"`);
  }

  /**
   * Whether any hardware tier prices below the default for this design, asked of the book's rates. Hettich's drawer
   * figure is runners-only and stays understated against Standard, so a drawer-dominant design renders the sheet with
   * no badge on the tier below the default (ADR 0092 decision 12).
   */
  function pricesAnyTierBelowItsDefault(design: Design): boolean {
    const defaultAmount = bookAmountFor(
      SAMPLE_PRICE_BOOK.hardware.defaultTierId,
      design,
    );
    return HARDWARE_TIER_IDS.some(
      (tierId) => bookAmountFor(tierId, design) < defaultAmount,
    );
  }

  propertyTest.prop([anyPlacementSubset])(
    "states the number of bodies the projection holds, at every population the seeded design can be cut to",
    (design) => {
      const projected = projectDesignForDisplay(
        design,
        KITCHEN_L_BODY_CATALOG,
      ).reduce((count, group) => count + group.entries.length, 0);

      const view = viewOf(design);
      expect(statedCount(view)).toBe(projected);

      // Exactly the populations the book inverts on carry a hardware option with no badge, and no others.
      const silentOptions = groupNamed(view, "hardware").options.filter(
        (option) => option.deltaText === undefined,
      );
      expect(silentOptions.length > 0).toBe(
        pricesAnyTierBelowItsDefault(design),
      );
    },
  );

  /** One `base-drawer3-600` (three drawers, no hinge) prices Hettich below Standard by three drawers' rate gap, to within
   *  the ten-lei grain each printed amount is rounded to: the sheet renders, every tier stays choosable, and only that
   *  tier states no amount. */
  it("renders the sheet for a drawer-dominant design, with no amount on the tier that prices below the default", () => {
    const drawersOnly: Design = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.filter(
        (placement) => placement.body.buildId === "base-drawer3-600",
      ),
    };

    expect(drawersOnly.placements).toHaveLength(1);
    expect(countMechanismsIn(drawersOnly)).toEqual({
      hinges: 0,
      drawers: 3,
      pushToOpen: 0,
    });
    const drawerGapMinor =
      3 *
      ((SAMPLE_PRICE_BOOK.hardware.tiers.find(
        (one) => one.tierId === "hardware.soft-close",
      )?.perDrawerMinor ?? Number.NaN) -
        (SAMPLE_PRICE_BOOK.hardware.tiers.find(
          (one) => one.tierId === SAMPLE_PRICE_BOOK.hardware.defaultTierId,
        )?.perDrawerMinor ?? Number.NaN));
    const printedGapMinor =
      bookAmountFor("hardware.soft-close", drawersOnly) -
      bookAmountFor(SAMPLE_PRICE_BOOK.hardware.defaultTierId, drawersOnly);
    expect(drawerGapMinor).toBeLessThan(0);
    expect(Math.abs(printedGapMinor - drawerGapMinor)).toBeLessThan(1_000);
    expect(printedGapMinor).toBeLessThan(0);

    const view = viewOf(drawersOnly);
    const hardware = groupNamed(view, "hardware");

    // On the page, not only in the model: every tier's name is shown whether or not it states an amount.
    const markup = markupOf(view);
    for (const tier of SAMPLE_PRICE_BOOK.hardware.tiers) {
      expect(markup, tier.tierId).toContain(tier.name);
    }

    expect(hardware.tierIds).toEqual(HARDWARE_TIER_IDS);
    expect(hardware.options.map((option) => option.tierId)).toEqual(
      HARDWARE_TIER_IDS,
    );
    const dearerTierId = "hardware.premium";
    expect(
      hardware.options.map((option) => [option.tierId, option.deltaText]),
    ).toEqual([
      [SAMPLE_PRICE_BOOK.hardware.defaultTierId, ro.priceBreakdown.included],
      ["hardware.soft-close", undefined],
      // The tier above the default still states its amount, so only the one tier's badge is missing.
      [
        dearerTierId,
        ro.globalSettings.tierDelta(
          describeAddedAmount(
            bookAmountFor(dearerTierId, drawersOnly) -
              bookAmountFor(
                SAMPLE_PRICE_BOOK.hardware.defaultTierId,
                drawersOnly,
              ),
          ),
        ),
      ],
    ]);
  });

  it("does not count empty columns, and does not count the space a column map freezes", () => {
    // `emptyColumns` and `columnExtents` are space in the scene but carry no entry, label or price, so a count taken
    // from the projection ignores them.
    const space: EmptyColumn = {
      wall: "A",
      alongMm: 3_000,
      widthMm: 600,
      y0Mm: 0,
      topMm: 2_100,
      depthMm: 600,
    };
    const withSpace: Design = {
      ...KITCHEN_L_DESIGN,
      emptyColumns: [space, { ...space, alongMm: 3_700 }],
      columnExtents: [{ ...space, alongMm: 4_400 }],
    };

    expect(statedCount(viewOf(withSpace))).toBe(
      statedCount(viewOf(KITCHEN_L_DESIGN)),
    );
  });

  it("renders the empty kitchen's own sentence on the page, not only in the model", () => {
    const empty: Design = { ...KITCHEN_L_DESIGN, placements: [] };

    expect(markupOf(viewOf(empty))).toContain(ro.globalSettings.appliesTo(0));
  });

  it("renders the single body's own sentence on the page, where the drawn wording is ungrammatical", () => {
    const groups = projectDesignForDisplay(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    );
    const first = groups[0];
    if (!first) throw new Error("the seeded design projects to no groups");
    const oneBody: readonly DisplayGroup[] = [
      { ...first, entries: first.entries.slice(0, 1) },
    ];

    const markup = markupOf(viewOf(KITCHEN_L_DESIGN, { groups: oneBody }));

    expect(markup).toContain(ro.globalSettings.appliesTo(1));
    expect(markup).not.toContain("tuturor celor 1");
  });
});

describe("wave 6F's clause is absent, and cannot be put back by anything that paints", () => {
  const CLAUSE_WORDS = /finisaj|per corp|limit/i;

  it("is in neither the copy nor the page", () => {
    for (const copy of GLOBAL_SETTINGS_AUTHORED_LITERALS)
      expect(copy, copy).not.toMatch(CLAUSE_WORDS);
    expect(markupOf(viewOf(KITCHEN_L_DESIGN))).not.toMatch(/finisaj/i);
  });

  it("cannot be injected by the sheet's own stylesheet, which no markup assertion can see", () => {
    // The one route past a markup guard: `::after { content: "…" }`. `starting-price.adversarial.test.ts` holds the
    // other stylesheets. An empty `content: ""` is allowed (the pill's 44 px hit area, ADR 0104 decision 5); every
    // other value fails.
    const declarations = readFileSync(
      resolve(
        import.meta.dirname,
        "../../src/settings/global-settings.module.css",
      ),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replaceAll('content: "";', "");

    expect(declarations).not.toMatch(/[^-]content:/);
  });

  it("would fail the markup assertion if it were hidden rather than omitted", () => {
    // A clause behind `display: none` or `aria-hidden` is still in the markup, so the shipped predicate must refuse
    // both shapes. The literals are spelled out because the clause was removed from the catalogue: no leaf to name.
    const hidden = [
      /* eslint-disable no-restricted-syntax -- 6B-j allow-list: markup probes for a clause wave 6F removed from the catalogue, so there is no leaf to name. */
      '<p style="display:none">și poate limita unele finisaje per corp</p>',
      '<p aria-hidden="true">și poate limita unele finisaje per corp</p>',
      '<p hidden="">și poate limita unele finisaje per corp</p>',
      /* eslint-enable no-restricted-syntax */
    ];

    for (const markup of hidden) expect(markup).toMatch(/finisaj/i);
  });
});
