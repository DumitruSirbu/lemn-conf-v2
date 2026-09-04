// **Adversarial QA for wave 6G**: the properties the example tests state on one input, swept; the
// arithmetic re-derived from a source that is not the one under test; and the two boundaries the
// shipped tests step over.
//
// Four claims this file exists to attack, each written against the way the shipped guard could be
// green while the claim is false:
//
// 1. **The delta is compared against the function that produces it.** Both sides of
//    `whole-kitchen-tiers.test.ts`'s central assertion are `priceDesign`, which is the shape
//    `docs/WORKFLOW.md` names as the commonest weak guard. The hardware delta is re-derived here
//    from the **book's rate and an independently counted handle population** — `cabinetHandleCount`
//    over `projectDesignForDisplay`, never through `priceDesign` — so an agreement is an agreement
//    between two things.
// 2. **A delta measured with the other group "held at what the design carries" could depend on the
//    held group.** If it did, the number beside *Furnir natural* would move when a customer changed
//    a hardware tier they are not looking at. Swept over the whole 3 × 3 cross product, plus the
//    unset design, in both directions.
// 3. **The `+` is arithmetic in a label unless exactly one module writes it.** Wave 6C's criterion
//    is *one* formatter; a sign is half a figure. Swept over the formatter's whole domain and
//    guarded at the source, and the rendered badge is re-derived from the measured delta rather than
//    from the view that rendered it.
// 4. **An omitted clause can be omitted from the copy and still reach the screen.** The shipped
//    guard reads the markup, which is the right place — this adds the one route markup cannot see,
//    a stylesheet `content:` declaration, and proves the markup predicate itself rejects a clause
//    hidden behind `display: none` or `aria-hidden` rather than being satisfied by one.
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  cabinetHandleCount,
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
import { describe, expect, it } from "vitest";

import { ro } from "@/content/ro";
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

const MATERIAL_TIER_IDS = SAMPLE_PRICE_BOOK.material.tiers.map(
  (tier) => tier.tierId,
);
const HARDWARE_TIER_IDS = SAMPLE_PRICE_BOOK.hardware.tiers.map(
  (tier) => tier.tierId,
);

/** Every whole-kitchen state a design can be in, including the one that names nothing. `undefined`
 *  is a member and not an omission: a fresh design carries no `settings` key at all, and that is the
 *  state every customer opens the sheet in for the first time. */
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
    // The seeded design chooses neither tier, which *is* the unset state — asserted rather than
    // assumed, so this arm cannot quietly stop being the case it is named for. Wave 6J-a made
    // `settings` always present by persisting `cabinetDepthMm`, so the two tier ids are what carry
    // the meaning; the key's own absence no longer does.
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
 * **The handle population, counted without pricing anything.**
 *
 * The one expected side that is not `priceDesign`. `whole-kitchen-tiers.test.ts` compares a measured
 * delta against a second call to the same query, which cannot fail for the reason it was written;
 * this walks the projection and asks the catalogue's own `cabinetHandleCount` per body, which is the
 * quantity ADR 0061 decision 2 defines and the number the hardware line is billed on.
 *
 * It computes no door or leaf count of its own, and it is a **test**: the seam guard's prohibition
 * is on a module under `src/` deriving one, not on a measurement re-deriving the domain's answer.
 */
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

function bookRateFor(tierId: string): number {
  const tier = SAMPLE_PRICE_BOOK.hardware.tiers.find(
    (one) => one.tierId === tierId,
  );
  if (!tier) throw new Error(`the book holds no hardware tier "${tierId}"`);
  return tier.perCabinetHandleMinor;
}

function bookWholeKitchenFor(tierId: string): number {
  const tier = SAMPLE_PRICE_BOOK.material.tiers.find(
    (one) => one.tierId === tierId,
  );
  if (!tier) throw new Error(`the book holds no material tier "${tierId}"`);
  return tier.wholeKitchenMinor;
}

function pricingOf(design: Design): PricingResult {
  return priceDesign({
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections: design.settings,
  });
}

function offerOf(design: Design): WholeKitchenTierOffer {
  return offerWholeKitchenTiers({
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections: design.settings,
  });
}

function viewOf(
  design: Design,
  overrides: Partial<DescribeGlobalSettingsInput> = {},
): GlobalSettingsView {
  const view = describeGlobalSettings({
    pricing: pricingOf(design),
    offer: offerOf(design),
    groups: projectDesignForDisplay(design, KITCHEN_L_BODY_CATALOG),
    applied: design.settings ?? {},
    pending: design.settings ?? {},
    rejection: null,
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

function markupOf(view: GlobalSettingsView): string {
  return renderToStaticMarkup(
    createElement(GlobalSettingsSurface, {
      id: "settings",
      view,
      onChoose: () => undefined,
      onCancel: () => undefined,
      onApply: () => undefined,
    }),
  );
}

describe("a delta cannot depend on a setting the customer is not looking at", () => {
  it("gives a material tier the same delta under every hardware tier the design could carry", () => {
    // The whole cross product, plus the unset design. If the held group did not cancel out, this is
    // where the number beside *Furnir natural* would move when a hardware chip changed.
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
    // **Characterisation, and the wave's one product question.** The baseline is the group's
    // `defaultTierId`, so a customer who has already applied *Furnir natural* re-opens the sheet and
    // reads *de la +18 000* beside the tier they own and *inclus* beside the one that would make
    // their kitchen cheaper. That is the module's stated rule — the badge is a price-list delta from
    // what a kitchen gets for free, not the cost of the change in front of the customer — and it is
    // pinned here so moving it is a decision somebody takes rather than a diff nobody reads.
    const onVeneer = measure(
      designCarrying({ materialTierId: "material.veneer" }),
    );

    expect(deltaOf(onVeneer.material, "material.veneer")).toBe(
      bookWholeKitchenFor("material.veneer") -
        bookWholeKitchenFor(SAMPLE_PRICE_BOOK.material.defaultTierId),
    );
    expect(
      deltaOf(onVeneer.material, SAMPLE_PRICE_BOOK.material.defaultTierId),
    ).toBe(0);
  });

  it("reads that consequence on the page, in the words a customer would see", () => {
    const view = viewOf(designCarrying({ materialTierId: "material.veneer" }));
    const material = groupNamed(view, "material");

    expect(
      material.options.map((option) => [option.tierId, option.deltaText]),
    ).toEqual([
      ["material.melamine", "inclus"],
      ["material.painted-mdf", "de la +9 000"],
      ["material.veneer", "de la +18 000"],
    ]);
  });
});

describe("the arithmetic, re-derived from something that is not priceDesign", () => {
  it("bills a hardware delta at the book's rate times a handle population counted from the catalogue", () => {
    // The independent expected side. `whole-kitchen-tiers.test.ts` only asserts the delta is
    // *larger* than the per-handle rate, which a delta computed on any denominator above one would
    // satisfy; this names the denominator.
    const handles = countHandlesIn(KITCHEN_L_DESIGN);
    const defaultRate = bookRateFor(SAMPLE_PRICE_BOOK.hardware.defaultTierId);
    const hardware = measure(KITCHEN_L_DESIGN).hardware;

    // The denominator this assertion would still pass under if it were wrong. A handle count that
    // happened to equal the body count would make the two readings indistinguishable, and the
    // measurement above would prove nothing about which one the hardware line is billed on.
    expect(handles).not.toBe(KITCHEN_L_DESIGN.placements.length);
    expect(handles).toBeGreaterThan(1);
    for (const tierId of HARDWARE_TIER_IDS) {
      expect(deltaOf(hardware, tierId), tierId).toBe(
        (bookRateFor(tierId) - defaultRate) * handles,
      );
    }
  });

  it("keeps that denominator when the kitchen loses bodies, rather than holding a shipped constant", () => {
    // A second population, so the agreement above cannot be one arithmetic coincidence: half the
    // kitchen has half the handles and every hardware delta follows it.
    const wallBOnly: Design = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.filter(
        (placement) => placement.wall === "B",
      ),
    };
    const handles = countHandlesIn(wallBOnly);
    const defaultRate = bookRateFor(SAMPLE_PRICE_BOOK.hardware.defaultTierId);

    expect(handles).toBeLessThan(countHandlesIn(KITCHEN_L_DESIGN));
    for (const tierId of HARDWARE_TIER_IDS) {
      expect(deltaOf(measure(wallBOnly).hardware, tierId), tierId).toBe(
        (bookRateFor(tierId) - defaultRate) * handles,
      );
    }
  });

  it("charges nothing for any hardware tier in a kitchen with no bodies, and says so in words", () => {
    // The boundary the sheet is reachable at. No body means no handle, so every hardware tier is
    // billed on zero and the badge is the ruled word rather than a *de la +0*.
    const empty: Design = { ...KITCHEN_L_DESIGN, placements: [] };

    expect(countHandlesIn(empty)).toBe(0);
    for (const tierId of HARDWARE_TIER_IDS)
      expect(deltaOf(measure(empty).hardware, tierId), tierId).toBe(0);
    expect(
      groupNamed(viewOf(empty), "hardware").options.map(
        (option) => option.deltaText,
      ),
    ).toEqual(["inclus", "inclus", "inclus"]);
  });

  it("still charges the material tiers in that empty kitchen, which is what makes the zero above a measurement", () => {
    // Without this, "every hardware delta is zero" would also be what a measurement that had stopped
    // measuring looks like.
    const empty: Design = { ...KITCHEN_L_DESIGN, placements: [] };

    expect(deltaOf(measure(empty).material, "material.veneer")).toBe(
      bookWholeKitchenFor("material.veneer"),
    );
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
    // `describeAddedAmount(0)` is `"+0"`, which is the number-that-is-not-a-price ADR 0001 decision 4
    // rules out. The formatter is not where that is decided — `describeDelta` short-circuits above
    // it — so both halves are stated: the formatter's behaviour, and the fact that nothing reaches
    // it with a zero.
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
    // Both sides deliberately do not come from the model: the expected text is built from the
    // **measured** delta through the published formatter, and the actual text is read off the
    // rendered page. A second rounding rule inside the model would show up here as a mismatch.
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
    // The shipped seam guard refuses `Math.*`. These are the other spellings a second rounding site
    // takes — a division by the minor-unit base, a fixed-point format, a locale formatter — none of
    // which names `Math` at all.
    for (const path of THIS_SURFACE) {
      const source = sourceOf(path);
      expect(source, path).not.toMatch(/toFixed|toPrecision|Intl\./);
      expect(source, path).not.toMatch(/Minor\s*\/|\/\s*100/);
      expect(source, path).not.toMatch(/\*\*/);
    }
  });

  it("leaves the delta's sign in the formatter, so no label authors arithmetic of its own", () => {
    // A `+` written in front of an interpolated amount is a figure being composed outside the one
    // module allowed to compose one, and it is invisible to a guard that only looks for rounding.
    // Matched on that exact shape rather than on any `+`, so a developer error message that joins
    // two strings is not mistaken for one.
    for (const path of THIS_SURFACE) {
      expect(sourceOf(path), path).not.toMatch(/\+\s*\$\{/);
    }
    expect(sourceOf("price/starting-price.ts")).toContain(
      'ADDED_AMOUNT_SIGN = "+"',
    );
  });

  it("keeps the sign out of the copy module, where a plus is a claim rather than a figure", () => {
    for (const copy of everyLeafUnder(ro.globalSettings))
      expect(copy, copy).not.toContain("+");
  });
});

/** Every leaf string in a copy section, a composing template contributing its body — the sweep
 *  `starting-price.adversarial.test.ts` performs, restated over one section so this file's own
 *  assertions do not depend on that file's ordering. */
function everyLeafUnder(section: unknown): string[] {
  if (typeof section === "string") return [section];
  if (typeof section === "function")
    return [String(section as () => string).replace(/^[^=]*=>/, "")];
  if (typeof section !== "object" || section === null) return [];
  return Object.values(section).flatMap(everyLeafUnder);
}

describe("the two words on the badge cannot drift from the two above the figure", () => {
  propertyTest.prop([fc.string()])(
    "puts the lowercased prefix in front of whatever amount it is handed, and adds no third word",
    (amountText) => {
      expect(ro.globalSettings.tierDelta(amountText)).toBe(
        `de la ${amountText}`,
      );
    },
  );

  it("pins both spellings by literal, so the composition cannot change either silently", () => {
    expect(ro.price.startingPrefix).toBe("De la");
    expect(ro.globalSettings.tierDelta("+9 000")).toBe("de la +9 000");
    expect(ro.globalSettings.tierDelta("+9 000")).toBe(
      `${ro.price.startingPrefix.toLowerCase()} +9 000`,
    );
  });

  it("renders the badge's words on the page rather than only in the model", () => {
    expect(markupOf(viewOf(KITCHEN_L_DESIGN))).toContain(">de la +9 000<");
  });

  it("pins the count phrase at every band Romanian counts in, including the two the catalogue can reach", () => {
    // The singular is a separate sentence, so it is a separate pin; the *de* band starts at 0 and at
    // 20 and stops at 101, and a rule written for a catalogue that has never reached twenty is a
    // rule nothing else would notice going wrong.
    const applied = (bodyCount: number): string =>
      ro.globalSettings.appliesTo(bodyCount);

    expect(applied(0)).toBe(
      "Se aplică tuturor celor 0 de corpuri. Nu se setează pe fiecare corp în parte.",
    );
    expect(applied(1)).toBe(
      "Se aplică singurului corp din bucătărie. Nu se setează pe fiecare corp în parte.",
    );
    expect(applied(2)).toContain("tuturor celor 2 corpuri");
    expect(applied(19)).toContain("tuturor celor 19 corpuri");
    expect(applied(20)).toContain("tuturor celor 20 de corpuri");
    expect(applied(21)).toContain("tuturor celor 21 de corpuri");
    expect(applied(101)).toContain("tuturor celor 101 corpuri");
  });
});

describe("how many bodies, and which part of the document says so", () => {
  /** `projectDesignForDisplay` maps `placements` one-to-one, so the projected count and
   *  `placements.length` are **equal for every design that projects at all** — the criterion's two
   *  candidate sources cannot be told apart by their answer. What can be told apart is whether the
   *  sheet follows the projection when the document grows space that is not a body, which is what
   *  the two sweeps below measure. */
  const anyPlacementSubset = fc
    .subarray([...KITCHEN_L_DESIGN.placements], { minLength: 0 })
    .map((placements) => ({ ...KITCHEN_L_DESIGN, placements }));

  function statedCount(view: GlobalSettingsView): number {
    const stated = /celor (\d+) /.exec(view.appliesTo);
    if (stated) return Number(stated[1]);
    if (view.appliesTo.includes("singurului corp")) return 1;
    throw new Error(`no count is stated in "${view.appliesTo}"`);
  }

  propertyTest.prop([anyPlacementSubset])(
    "states the number of bodies the projection holds, at every population the seeded design can be cut to",
    (design) => {
      const projected = projectDesignForDisplay(
        design,
        KITCHEN_L_BODY_CATALOG,
      ).reduce((count, group) => count + group.entries.length, 0);

      expect(statedCount(viewOf(design))).toBe(projected);
    },
  );

  it("does not count empty columns, and does not count the space a column map freezes", () => {
    // The half of the criterion that is falsifiable: `emptyColumns` and `columnExtents` are space
    // the customer can see in the scene and cannot see in this count, because neither carries a
    // catalogue entry, a label or a price. A count taken from anywhere but the projection would have
    // to decide what to do with them; this one does not have to.
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

    expect(markupOf(viewOf(empty))).toContain(
      "Se aplică tuturor celor 0 de corpuri. Nu se setează pe fiecare corp în parte.",
    );
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

    expect(markup).toContain("Se aplică singurului corp din bucătărie.");
    expect(markup).not.toContain("tuturor celor 1");
  });
});

describe("wave 6F's clause is absent, and cannot be put back by anything that paints", () => {
  const CLAUSE_WORDS = /finisaj|per corp|limit/i;

  it("is in neither the copy nor the page", () => {
    for (const copy of everyLeafUnder(ro.globalSettings))
      expect(copy, copy).not.toMatch(CLAUSE_WORDS);
    expect(markupOf(viewOf(KITCHEN_L_DESIGN))).not.toMatch(/finisaj/i);
  });

  it("cannot be injected by the sheet's own stylesheet, which no markup assertion can see", () => {
    // The one route past a guard that reads rendered markup: `::after { content: "…" }` puts words
    // on the screen that are in no string and in no element. `starting-price.adversarial.test.ts`
    // already holds the three stylesheets that render the *De la* label to this rule; this wave
    // added a fourth that renders customer-visible copy and was not in that list.
    const declarations = readFileSync(
      resolve(
        import.meta.dirname,
        "../../src/settings/global-settings.module.css",
      ),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");

    expect(declarations).not.toMatch(/[^-]content:/);
  });

  it("would fail the markup assertion if it were hidden rather than omitted", () => {
    // The guard's own falsifiability. A clause behind `display: none` or `aria-hidden` is still in
    // the markup, so the shipped predicate refuses it rather than being satisfied by it — asserted
    // by running that predicate over exactly those two shapes.
    const hidden = [
      '<p style="display:none">și poate limita unele finisaje per corp</p>',
      '<p aria-hidden="true">și poate limita unele finisaje per corp</p>',
      '<p hidden="">și poate limita unele finisaje per corp</p>',
    ];

    for (const markup of hidden) expect(markup).toMatch(/finisaj/i);
  });
});
