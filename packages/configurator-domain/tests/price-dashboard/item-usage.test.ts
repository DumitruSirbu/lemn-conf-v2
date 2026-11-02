// M10 M3-c, usage half: `usesItem` is the predicate the persistence usage reader's SQL must agree with. A colour or a
// handle is used when the design names it, a tier when the design chose it or is priced at it as the fallback, an
// accessory when the kitchen earns it (a linked one if and only if a placement is priced as its `linkedBuildId`).
// Each answer is checked against an oracle that does not call the module under test.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Design } from "../../src/design.js";
import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";
import { PALETTE_ENTRY_IDS, paletteFinish } from "../../src/materials.js";
import {
  buildIdsPricedAs,
  usageCountOf,
  UsageNotCountedError,
  usesItem,
} from "../../src/price-dashboard/item-usage.js";
import {
  isSameItem,
  type ItemRef,
} from "../../src/pricing/catalogue-availability.js";
import { itemsNamedBy } from "../../src/pricing/named-items.js";
import type { AccessoryPriceLine } from "../../src/pricing/price-lines.js";
import { declaresASink } from "../../src/void-engine.js";
import {
  accessory,
  BOOK,
  CATALOG,
  colour,
  CUSTOMISABLE_PLACEMENT_ID,
  handle,
  hardware,
  ITEMS_NAMED_BY_THAT_KITCHEN,
  kitchenNamingEverything,
  material,
  PLAIN_PLACEMENT_ID,
  priceUnder,
  withBodyOf,
  withSettings,
} from "../support/availability-kitchens.js";
import { NOTHING_DISABLED } from "../support/availability.js";
import {
  bookWithLinked,
  linkedRule,
  SUPPLIED_ROW_IDS,
} from "../support/linked-accessory-books.js";

const COVER = accessory("sinkProtectiveCover");
const RACK = accessory("dishDryingRack");

function uses(design: Design, item: ItemRef, book = BOOK): boolean {
  return usesItem({ design, item, catalog: CATALOG, book });
}

const ALL_TIERS: readonly ItemRef[] = [
  ...BOOK.material.tiers.map((tier) => material(tier.tierId)),
  ...BOOK.hardware.tiers.map((tier) => hardware(tier.tierId)),
];
const ALL_COLOURS_AND_HANDLES: readonly ItemRef[] = [
  ...PALETTE_ENTRY_IDS.map(colour),
  handle("steel"),
  handle("black"),
  handle("push"),
];

describe("a material or a hardware class is used by the kitchens that chose it, and by the choice-less at the fallback", () => {
  it("counts the tier a design chose and no other", () => {
    const design = withSettings({
      cabinetDepthMm: 600,
      materialTierId: "material.veneer",
      hardwareTierId: "hardware.premium",
    });

    const used = ALL_TIERS.filter((item) => uses(design, item));

    expect(used).toEqual([
      material("material.veneer"),
      hardware("hardware.premium"),
    ]);
  });

  it("counts the book's fallback tiers for a design that chose none (absent settings, A-9)", () => {
    const choiceLess = [
      { ...KITCHEN_L_DESIGN, settings: undefined },
      withSettings({ cabinetDepthMm: 600 }),
    ];

    for (const design of choiceLess) {
      const used = ALL_TIERS.filter((item) => uses(design, item));

      expect(used).toEqual([
        material(BOOK.material.defaultTierId),
        hardware(BOOK.hardware.defaultTierId),
      ]);
    }
  });

  it("still counts a stored tier id the book does not hold", () => {
    const design = withSettings({
      cabinetDepthMm: 600,
      materialTierId: "material.retired",
    });

    expect(uses(design, material("material.retired"))).toBe(true);
    expect(uses(design, material(BOOK.material.defaultTierId))).toBe(false);
  });

  it("does not mix the kinds: a material id is not a hardware class", () => {
    const design = withSettings({
      cabinetDepthMm: 600,
      materialTierId: "material.veneer",
    });

    expect(uses(design, hardware("material.veneer"))).toBe(false);
  });
});

describe("a colour or a handle is used when the design names it, at any level a body can carry one", () => {
  it("counts every item the everything-kitchen names, once at either level", () => {
    const design = kitchenNamingEverything();

    for (const item of ITEMS_NAMED_BY_THAT_KITCHEN) {
      expect(uses(design, item), JSON.stringify(item)).toBe(true);
    }
  });

  it("does not count the colours and handles the design does not name", () => {
    const design = kitchenNamingEverything();
    const unnamed = ALL_COLOURS_AND_HANDLES.filter(
      (item) => !ITEMS_NAMED_BY_THAT_KITCHEN.some((n) => isSameItem(n, item)),
    );

    expect(unnamed.length).toBeGreaterThan(0);
    for (const item of unnamed) {
      expect(uses(design, item), JSON.stringify(item)).toBe(false);
    }
  });

  it("counts a cabinet's own colour and handle when the kitchen names neither", () => {
    const design = withBodyOf(CUSTOMISABLE_PLACEMENT_ID, {
      finish: paletteFinish("pal.antracit"),
      handle: "black",
    });

    expect(uses(design, colour("pal.antracit"))).toBe(true);
    expect(uses(design, handle("black"))).toBe(true);
  });

  it("does not count a colour stored on a body that cannot wear one", () => {
    const design = withBodyOf(PLAIN_PLACEMENT_ID, {
      finish: paletteFinish("pal.antracit"),
      handle: "black",
    });

    expect(uses(design, colour("pal.antracit"))).toBe(false);
    expect(uses(design, handle("black"))).toBe(false);
  });

  it("does not count what a design follows without storing: the default colour and the slot's handle", () => {
    expect(uses(KITCHEN_L_DESIGN, colour("pal.alb"))).toBe(false);
    expect(uses(KITCHEN_L_DESIGN, handle("steel"))).toBe(false);
    expect(uses(KITCHEN_L_DESIGN, handle("push"))).toBe(false);
  });

  it("agrees with the list the refusal and the replacement sheet are built from, for every item and several kitchens", () => {
    const kitchens = [
      KITCHEN_L_DESIGN,
      kitchenNamingEverything(),
      withSettings({ cabinetDepthMm: 600, materialTierId: "material.veneer" }),
      withBodyOf(CUSTOMISABLE_PLACEMENT_ID, { handle: "black" }),
    ];

    for (const design of kitchens) {
      const named = itemsNamedBy({
        design,
        catalog: CATALOG,
        book: BOOK,
        chosen: design.settings,
      });
      for (const item of [...ALL_TIERS, ...ALL_COLOURS_AND_HANDLES]) {
        expect(uses(design, item), JSON.stringify(item)).toBe(
          named.some((candidate) => isSameItem(candidate, item)),
        );
      }
    }
  });
});

describe("a built-in accessory is used when the kitchen earns it", () => {
  const kitchenWithoutASink: Design = {
    ...KITCHEN_L_DESIGN,
    placements: KITCHEN_L_DESIGN.placements.filter(
      (placement) => !declaresASink(CATALOG.get(placement.body.buildId)),
    ),
  };

  function billedAccessoryIds(design: Design): readonly string[] {
    const result = priceUnder(NOTHING_DISABLED, design);
    if (!result.ok) throw new Error(`refused: ${result.failure.code}`);
    return result.priced.lines
      .filter((line): line is AccessoryPriceLine => line.kind === "accessory")
      .map((line) => line.accessoryId);
  }

  it("is true for exactly the accessories the price bills, with a sink and without one", () => {
    for (const design of [KITCHEN_L_DESIGN, kitchenWithoutASink]) {
      const billed = billedAccessoryIds(design);

      expect(uses(design, COVER)).toBe(billed.includes("sinkProtectiveCover"));
      expect(uses(design, RACK)).toBe(billed.includes("dishDryingRack"));
    }
  });

  it("has a shipped kitchen that earns both and a variant that earns neither, so the check is not vacuous", () => {
    expect(uses(KITCHEN_L_DESIGN, COVER)).toBe(true);
    expect(uses(KITCHEN_L_DESIGN, RACK)).toBe(true);
    expect(uses(kitchenWithoutASink, COVER)).toBe(false);
    expect(uses(kitchenWithoutASink, RACK)).toBe(false);
  });

  it("is false for an accessory the book does not state", () => {
    expect(uses(KITCHEN_L_DESIGN, accessory("not-an-accessory"))).toBe(false);
  });
});

/** The row a placement is priced as, from the catalogue's declarations alone (ADR 0022). */
function pricedAsRow(buildId: string): string {
  const definition = CATALOG.get(buildId);
  if (definition === undefined) throw new Error(`unknown body ${buildId}`);
  const equivalentId =
    definition.insertable === true ? buildId : definition.catalogEquivalentId;
  return equivalentId !== undefined &&
    CATALOG.get(equivalentId)?.insertable === true
    ? equivalentId
    : buildId;
}

const aKitchenOfSomePlacements = fc
  .subarray([...KITCHEN_L_DESIGN.placements])
  .map((placements): Design => ({ ...KITCHEN_L_DESIGN, placements }));

const aSuppliedRow = fc.constantFrom(...SUPPLIED_ROW_IDS);

/** Runs a sweep must land on each side of an iff before it certifies the side that did not move. */
const ARM_FLOOR = 10;

describe("a linked accessory is used if and only if a placement is priced as its row (M3-c)", () => {
  it("holds over any subset of the shipped kitchen's placements and any supplied row, on both arms", () => {
    const arms = { used: 0, unused: 0 };

    fc.assert(
      fc.property(aKitchenOfSomePlacements, aSuppliedRow, (design, row) => {
        const book = bookWithLinked([
          linkedRule("linked", { linkedBuildId: row }),
        ]);

        const expected = design.placements.some(
          (placement) => pricedAsRow(placement.body.buildId) === row,
        );
        arms[expected ? "used" : "unused"] += 1;

        expect(uses(design, accessory("linked"), book)).toBe(expected);
      }),
    );

    expect(arms.used).toBeGreaterThanOrEqual(ARM_FLOOR);
    expect(arms.unused).toBeGreaterThanOrEqual(ARM_FLOOR);
  });

  it("counts a seeded body through the row it is priced as", () => {
    const seeded = KITCHEN_L_DESIGN.placements.find(
      (placement) =>
        pricedAsRow(placement.body.buildId) !== placement.body.buildId,
    );
    if (seeded === undefined)
      throw new Error("the kitchen seeds no equivalent");
    const row = pricedAsRow(seeded.body.buildId);
    const design: Design = { ...KITCHEN_L_DESIGN, placements: [seeded] };

    const book = bookWithLinked([linkedRule("linked", { linkedBuildId: row })]);

    expect(uses(design, accessory("linked"), book)).toBe(true);
    expect(uses(design, accessory(row), book)).toBe(false);
  });

  it("is told apart from its neighbours: another linked accessory, and the same id as a row id", () => {
    const book = bookWithLinked([
      linkedRule("on-drawers", { linkedBuildId: "base-3drawer" }),
      linkedRule("on-sink", { linkedBuildId: "base-sink" }),
    ]);
    const onlyDrawers: Design = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.filter(
        (placement) => pricedAsRow(placement.body.buildId) === "base-3drawer",
      ),
    };

    expect(uses(onlyDrawers, accessory("on-drawers"), book)).toBe(true);
    expect(uses(onlyDrawers, accessory("on-sink"), book)).toBe(false);
  });
});

describe("buildIdsPricedAs is the set the usage reader's SQL is given", () => {
  it("is every catalogue id priced as the row, and nothing else, for every supplied row", () => {
    for (const row of SUPPLIED_ROW_IDS) {
      const expected = [...CATALOG.keys()].filter(
        (buildId) => pricedAsRow(buildId) === row,
      );

      expect(buildIdsPricedAs(CATALOG, row)).toEqual(expected);
      expect(buildIdsPricedAs(CATALOG, row)).toContain(row);
    }
  });

  it("agrees with the usage predicate for any subset of placements and any supplied row, on both arms", () => {
    const arms = { used: 0, unused: 0 };

    fc.assert(
      fc.property(aKitchenOfSomePlacements, aSuppliedRow, (design, row) => {
        const book = bookWithLinked([
          linkedRule("linked", { linkedBuildId: row }),
        ]);
        const ids = new Set(buildIdsPricedAs(CATALOG, row));

        const bySet = design.placements.some((placement) =>
          ids.has(placement.body.buildId),
        );
        arms[bySet ? "used" : "unused"] += 1;

        expect(bySet).toBe(uses(design, accessory("linked"), book));
      }),
    );

    expect(arms.used).toBeGreaterThanOrEqual(ARM_FLOOR);
    expect(arms.unused).toBeGreaterThanOrEqual(ARM_FLOOR);
  });

  it("includes a seeded body that has an equivalent, and is empty for a row the catalogue does not hold", () => {
    const seededIds = [...CATALOG.keys()].filter(
      (buildId) => pricedAsRow(buildId) !== buildId,
    );

    expect(seededIds.length).toBeGreaterThan(0);
    for (const seededId of seededIds) {
      expect(buildIdsPricedAs(CATALOG, pricedAsRow(seededId))).toContain(
        seededId,
      );
    }
    expect(buildIdsPricedAs(CATALOG, "no-such-row")).toEqual([]);
  });
});

describe("the counts a judgement is made against", () => {
  const counts = [
    { item: material("material.veneer"), designCount: 23 },
    { item: handle("black"), designCount: 0 },
  ];

  it("reads the count of the item asked about", () => {
    expect(usageCountOf(counts, material("material.veneer"))).toBe(23);
    expect(usageCountOf(counts, handle("black"))).toBe(0);
  });

  it("throws for an item nobody counted, instead of reading it as unused", () => {
    expect(() => usageCountOf(counts, hardware("material.veneer"))).toThrow(
      UsageNotCountedError,
    );
    expect(() => usageCountOf([], material("material.veneer"))).toThrow(
      UsageNotCountedError,
    );
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])(
    "throws for a count of %s, which is not a number of designs",
    (designCount) => {
      expect(() =>
        usageCountOf(
          [{ item: material("material.veneer"), designCount }],
          material("material.veneer"),
        ),
      ).toThrow(UsageNotCountedError);
    },
  );
});
