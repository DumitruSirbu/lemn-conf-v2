// M10 M3, adversarial: `usesItem` against what the price does, not against the list it is built from. The developer's
// oracle (`itemsNamedBy`) shares code with the predicate; these use the price itself (a switched-off item the kitchen
// uses refuses it, an accessory the kitchen earns is a line), and the raw document read by hand.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Design, DesignSettings, Handle } from "../../src/design.js";
import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";
import {
  stampedSettingsOf,
  type NewKitchenSettings,
} from "../../src/generation/new-kitchen-settings.js";
import {
  freeColourFinish,
  PALETTE_ENTRY_IDS,
  paletteFinish,
  type Finish,
} from "../../src/materials.js";
import {
  usesItem,
  UsageNotCountedError,
  usageCountOf,
  type ItemUsageCounts,
} from "../../src/price-dashboard/item-usage.js";
import { canDelete } from "../../src/price-dashboard/item-lifecycle.js";
import {
  isSameItem,
  type ItemRef,
} from "../../src/pricing/catalogue-availability.js";
import type { AccessoryPriceLine } from "../../src/pricing/price-lines.js";
import type { PriceBook } from "../../src/pricing/price-book.js";
import {
  accessory,
  availabilityOf,
  BOOK,
  CATALOG,
  colour,
  handle,
  priceUnder,
  withSettings,
} from "../support/availability-kitchens.js";
import { UnknownBodyError } from "../../src/void-engine.js";
import { NOTHING_DISABLED } from "../support/availability.js";
import {
  bookWithLinked,
  linkedRule,
  SUPPLIED_ROW_IDS,
} from "../support/linked-accessory-books.js";

import {
  ARM_FLOOR,
  BUILT_IN_ACCESSORY_ITEMS,
  COLOUR_ITEMS,
  deepFrozen,
  elementAt,
  HANDLE_ITEMS,
  HARDWARE_ITEMS,
  MATERIAL_ITEMS,
} from "./qa-m3-support.js";

const HANDLES: readonly Handle[] = ["steel", "black", "push"];
const MATERIAL_IDS = BOOK.material.tiers.map((tier) => tier.tierId);
const HARDWARE_IDS = BOOK.hardware.tiers.map((tier) => tier.tierId);

function uses(design: Design, item: ItemRef, book: PriceBook = BOOK): boolean {
  return usesItem({ design, item, catalog: CATALOG, book });
}

// ---------------------------------------------------------------------------------------------------------------
// Generators: a subset of the shipped kitchen's bodies, a kitchen's choices, and a choice of each cabinet's own.
// ---------------------------------------------------------------------------------------------------------------

const optionally = <Value>(
  values: readonly Value[],
): fc.Arbitrary<Value | undefined> => fc.constantFrom(undefined, ...values);

const aPaletteFinish = fc.constantFrom(...PALETTE_ENTRY_IDS).map(paletteFinish);

interface KitchenChoices {
  readonly materialTierId?: string;
  readonly hardwareTierId?: string;
  readonly finish?: Finish;
  readonly handle?: Handle;
  readonly topRowHandle?: Handle;
}

const aSetOfKitchenChoices: fc.Arbitrary<KitchenChoices> = fc
  .record({
    materialTierId: optionally(MATERIAL_IDS),
    hardwareTierId: optionally(HARDWARE_IDS),
    finish: optionally(PALETTE_ENTRY_IDS.map(paletteFinish)),
    handle: optionally(HANDLES),
    topRowHandle: optionally(HANDLES),
  })
  .map((choices) =>
    Object.fromEntries(
      Object.entries(choices).filter(([, value]) => value !== undefined),
    ),
  );

interface CabinetChoice {
  readonly finish?: Finish;
  readonly handle?: Handle;
}

const aCabinetChoice: fc.Arbitrary<CabinetChoice> = fc
  .record({
    finish: fc.option(aPaletteFinish, { nil: undefined, freq: 4 }),
    handle: fc.option(fc.constantFrom(...HANDLES), { nil: undefined, freq: 4 }),
  })
  .map((choice) =>
    Object.fromEntries(
      Object.entries(choice).filter(([, value]) => value !== undefined),
    ),
  );

const PLACEMENT_COUNT = KITCHEN_L_DESIGN.placements.length;

const aKitchen: fc.Arbitrary<Design> = fc
  .tuple(
    fc.subarray([...KITCHEN_L_DESIGN.placements]),
    fc.array(aCabinetChoice, {
      minLength: PLACEMENT_COUNT,
      maxLength: PLACEMENT_COUNT,
    }),
    aSetOfKitchenChoices,
  )
  .map(([placements, choices, kitchen]) => ({
    ...KITCHEN_L_DESIGN,
    settings: { cabinetDepthMm: 600, ...kitchen } as DesignSettings,
    placements: placements.map((placement) => ({
      ...placement,
      body: {
        ...placement.body,
        ...choices[KITCHEN_L_DESIGN.placements.indexOf(placement)],
      },
    })),
  }));

// ---------------------------------------------------------------------------------------------------------------
// Oracles that do not call the module under test or the list it reads.
// ---------------------------------------------------------------------------------------------------------------

/** The colours and handles the raw document stores where a body can wear one, read by hand. */
function namedByTheRawDocument(design: Design): readonly ItemRef[] {
  const named: ItemRef[] = [];
  const addColour = (finish: Finish | undefined): void => {
    if (finish?.kind === "palette-entry") named.push(colour(finish.entryId));
  };
  const addHandle = (given: Handle | undefined): void => {
    if (given !== undefined) named.push({ kind: "handle", handle: given });
  };
  addColour(design.settings?.finish);
  addHandle(design.settings?.handle);
  addHandle(design.settings?.topRowHandle);
  for (const { body } of design.placements) {
    const definition = CATALOG.get(body.buildId);
    if (definition?.canFinish === true) addColour(body.finish);
    if (definition?.canHandle === true) addHandle(body.handle);
  }
  return named;
}

function refusedItemsWhenOff(
  design: Design,
  item: ItemRef,
): readonly ItemRef[] {
  const result = priceUnder(availabilityOf([item]), design);
  if (result.ok) return [];
  return result.failure.code === "REPLACEMENT_REQUIRED"
    ? result.failure.items
    : [];
}

function billedAccessoryIds(
  design: Design,
  book: PriceBook,
  disabled: readonly ItemRef[] = [],
): readonly string[] {
  const result = priceUnder(availabilityOf(disabled), design, book);
  if (!result.ok) throw new Error(`refused: ${result.failure.code}`);
  return result.priced.lines
    .filter((line): line is AccessoryPriceLine => line.kind === "accessory")
    .map((line) => line.accessoryId);
}

function isPriceable(design: Design, book: PriceBook = BOOK): boolean {
  return priceUnder(NOTHING_DISABLED, design, book).ok;
}

// ---------------------------------------------------------------------------------------------------------------

describe("a tier, a colour and a handle are used exactly when switching them off would refuse the kitchen's price", () => {
  it("holds for every such item over random kitchens, on both arms", () => {
    const arms = { used: 0, unused: 0 };
    const items: readonly ItemRef[] = [
      ...MATERIAL_ITEMS,
      ...HARDWARE_ITEMS,
      ...COLOUR_ITEMS,
      ...HANDLE_ITEMS,
    ];

    fc.assert(
      fc.property(aKitchen, (design) => {
        fc.pre(isPriceable(design));
        for (const item of items) {
          const refused = refusedItemsWhenOff(design, item).some((named) =>
            isSameItem(named, item),
          );
          arms[refused ? "used" : "unused"] += 1;
          expect(uses(design, item), JSON.stringify(item)).toBe(refused);
        }
      }),
      { numRuns: 150 },
    );

    expect(arms.used).toBeGreaterThanOrEqual(ARM_FLOOR);
    expect(arms.unused).toBeGreaterThanOrEqual(ARM_FLOOR);
  });

  it("agrees, for colours and handles, with the raw document read by hand (a body that cannot wear one names none)", () => {
    fc.assert(
      fc.property(aKitchen, (design) => {
        const named = namedByTheRawDocument(design);
        for (const item of [...COLOUR_ITEMS, ...HANDLE_ITEMS]) {
          expect(uses(design, item), JSON.stringify(item)).toBe(
            named.some((candidate) => isSameItem(candidate, item)),
          );
        }
      }),
      { numRuns: 300 },
    );
  });

  it("names exactly one material and one hardware class for any kitchen: the chosen tier, or the book's fallback", () => {
    fc.assert(
      fc.property(aKitchen, (design) => {
        const usedMaterials = MATERIAL_ITEMS.filter((item) =>
          uses(design, item),
        );
        const usedHardware = HARDWARE_ITEMS.filter((item) =>
          uses(design, item),
        );

        expect(usedMaterials).toHaveLength(1);
        expect(usedHardware).toHaveLength(1);
      }),
    );
  });

  const noBodies = (settings: NonNullable<Design["settings"]>): Design => ({
    ...withSettings(settings),
    placements: [],
  });

  it("counts a stored kitchen handle that no cabinet wears (the architect's ruling), and only that handle", () => {
    const design = noBodies({ cabinetDepthMm: 600, handle: "black" });

    expect(HANDLE_ITEMS.filter((item) => uses(design, item))).toEqual([
      handle("black"),
    ]);
  });

  it("counts a stored top-row handle in a kitchen with no bodies at all, and only that handle", () => {
    const design = noBodies({ cabinetDepthMm: 600, topRowHandle: "black" });

    expect(HANDLE_ITEMS.filter((item) => uses(design, item))).toEqual([
      handle("black"),
    ]);
  });

  it("never counts a free colour, which is not a catalogue entry", () => {
    const design = noBodies({
      cabinetDepthMm: 600,
      finish: freeColourFinish("#abcdef"),
    });

    expect(COLOUR_ITEMS.filter((item) => uses(design, item))).toEqual([]);
  });

  it("does not count the handles a body wears without being told: the slot's defaults", () => {
    const stored = withSettings({ cabinetDepthMm: 600 });

    expect(HANDLE_ITEMS.filter((item) => uses(stored, item))).toEqual([]);
  });
});

describe("an accessory is used exactly when its line is on the price, built-in or linked, seeded or not", () => {
  const aLinkedBook: fc.Arbitrary<PriceBook> = fc
    .subarray([...SUPPLIED_ROW_IDS])
    .map((rows) =>
      bookWithLinked(
        rows.map((row) => linkedRule(`lk-${row}`, { linkedBuildId: row })),
      ),
    );

  const aSuppliedRowOfTheBook = fc.constantFrom(...SUPPLIED_ROW_IDS);

  function accessoryItemsOf(book: PriceBook): readonly ItemRef[] {
    return [
      ...BUILT_IN_ACCESSORY_ITEMS,
      ...book.linkedAccessories.map((rule) => accessory(rule.accessoryId)),
    ];
  }

  it("holds over random kitchens and random linked books, on both arms", () => {
    const arms = { used: 0, unused: 0 };

    fc.assert(
      fc.property(aKitchen, aLinkedBook, (design, book) => {
        fc.pre(isPriceable(design, book));
        const billed = billedAccessoryIds(design, book);
        for (const item of accessoryItemsOf(book)) {
          if (item.kind !== "accessory") continue;
          const expected = billed.includes(item.accessoryId);
          arms[expected ? "used" : "unused"] += 1;
          expect(uses(design, item, book), JSON.stringify(item)).toBe(expected);
        }
      }),
      { numRuns: 150 },
    );

    expect(arms.used).toBeGreaterThanOrEqual(ARM_FLOOR);
    expect(arms.unused).toBeGreaterThanOrEqual(ARM_FLOOR);
  });

  it("stays used when availability has switched the accessory off: the kitchen earns it, the price just drops the line", () => {
    fc.assert(
      fc.property(aKitchen, aLinkedBook, (design, book) => {
        fc.pre(isPriceable(design, book));
        const billed = billedAccessoryIds(design, book);
        for (const item of accessoryItemsOf(book)) {
          if (item.kind !== "accessory") continue;
          const offBilled = billedAccessoryIds(design, book, [item]);
          expect(offBilled).not.toContain(item.accessoryId);
          expect(uses(design, item, book)).toBe(
            billed.includes(item.accessoryId),
          );
        }
      }),
      { numRuns: 60 },
    );
  });

  it("agrees with the cabinet lines the price resolved through the catalogue's equivalents, a path the earning rule does not share", () => {
    const arms = { used: 0, unused: 0 };

    fc.assert(
      fc.property(aKitchen, aSuppliedRowOfTheBook, (design, row) => {
        const book = bookWithLinked([linkedRule("lk", { linkedBuildId: row })]);
        const priced = priceUnder(NOTHING_DISABLED, design, book);
        fc.pre(priced.ok);
        const placedAsTheRow = priced.priced.lines.filter(
          (line) => line.kind === "cabinet" && line.pricedAsBuildId === row,
        ).length;
        const billedLine = priced.priced.lines.some(
          (line) => line.kind === "accessory" && line.accessoryId === "lk",
        );
        arms[placedAsTheRow > 0 ? "used" : "unused"] += 1;

        expect(uses(design, accessory("lk"), book)).toBe(placedAsTheRow > 0);
        expect(billedLine).toBe(placedAsTheRow > 0);
      }),
      { numRuns: 150 },
    );

    expect(arms.used).toBeGreaterThanOrEqual(ARM_FLOOR);
    expect(arms.unused).toBeGreaterThanOrEqual(ARM_FLOOR);
  });

  it("is false for every accessory of a kitchen with no bodies", () => {
    const empty: Design = { ...KITCHEN_L_DESIGN, placements: [] };
    const book = bookWithLinked([linkedRule("lk", {})]);

    for (const item of [...BUILT_IN_ACCESSORY_ITEMS, accessory("lk")]) {
      expect(uses(empty, item, book), JSON.stringify(item)).toBe(false);
    }
  });

  it("is false for an id that is a colour, a handle or a tier id: the namespaces do not meet", () => {
    for (const id of ["black", "pal.alb", "material.melamine"]) {
      expect(uses(KITCHEN_L_DESIGN, accessory(id))).toBe(false);
    }
  });
});

describe("a design placing a body the catalogue does not hold", () => {
  const withAStranger: Design = {
    ...KITCHEN_L_DESIGN,
    placements: [
      ...KITCHEN_L_DESIGN.placements,
      {
        ...elementAt(KITCHEN_L_DESIGN.placements, 0),
        id: "stranger",
        body: {
          ...elementAt(KITCHEN_L_DESIGN.placements, 0).body,
          buildId: "no-such-body",
        },
      },
    ],
  };

  it("still answers for tiers, colours and handles, which are facts about the document", () => {
    for (const item of [...MATERIAL_ITEMS, ...COLOUR_ITEMS, ...HANDLE_ITEMS]) {
      expect(
        () => uses(withAStranger, item),
        JSON.stringify(item),
      ).not.toThrow();
    }
  });

  it("refuses to answer for an accessory, built-in or linked, rather than guess that the kitchen earns none", () => {
    const book = bookWithLinked([linkedRule("lk")]);

    for (const id of ["sinkProtectiveCover", "dishDryingRack", "lk"]) {
      expect(() => uses(withAStranger, accessory(id), book), id).toThrow(
        UnknownBodyError,
      );
    }
  });
});

describe("a kitchen is used by what it was stamped with from the new-kitchen defaults", () => {
  const aDefaultsSet: fc.Arbitrary<NewKitchenSettings> = fc
    .record({
      materialTierId: optionally(MATERIAL_IDS),
      hardwareTierId: optionally(HARDWARE_IDS),
      finish: optionally([
        ...PALETTE_ENTRY_IDS.map(paletteFinish),
        freeColourFinish("#123456"),
      ]),
      handle: optionally(HANDLES),
      topRowHandle: optionally(HANDLES),
    })
    .map(
      (defaults) =>
        Object.fromEntries(
          Object.entries(defaults).filter(([, value]) => value !== undefined),
        ) as NewKitchenSettings,
    );

  function stampedKitchen(defaults: NewKitchenSettings): Design {
    return { ...KITCHEN_L_DESIGN, settings: stampedSettingsOf(defaults) };
  }

  it("uses every tier, handle and palette colour the stamp wrote, and the one tier each of material and hardware", () => {
    fc.assert(
      fc.property(aDefaultsSet, (defaults) => {
        const design = stampedKitchen(defaults);
        const written = design.settings;

        expect(
          uses(design, {
            kind: "material",
            tierId: written?.materialTierId ?? BOOK.material.defaultTierId,
          }),
        ).toBe(true);
        expect(
          uses(design, {
            kind: "hardware",
            tierId: written?.hardwareTierId ?? BOOK.hardware.defaultTierId,
          }),
        ).toBe(true);
        for (const stored of [written?.handle, written?.topRowHandle]) {
          if (stored !== undefined) {
            expect(uses(design, { kind: "handle", handle: stored })).toBe(true);
          }
        }
        if (written?.finish?.kind === "palette-entry") {
          expect(uses(design, colour(written.finish.entryId))).toBe(true);
        }
      }),
    );
  });

  it("does not use the colour the stamp replaced, and uses the colour it replaced it with", () => {
    const defaults: NewKitchenSettings = {
      materialTierId: "material.veneer",
      finish: paletteFinish("pal.antracit"),
    };

    const design = stampedKitchen(defaults);

    expect(uses(design, colour("pal.antracit"))).toBe(false);
    expect(uses(design, colour("veneer.stejar"))).toBe(true);
  });

  it("does not use the fallback tiers a stamped material and hardware replaced", () => {
    const design = stampedKitchen({
      materialTierId: "material.veneer",
      hardwareTierId: "hardware.premium",
    });

    expect(
      uses(design, { kind: "material", tierId: "material.melamine" }),
    ).toBe(false);
    expect(
      uses(design, { kind: "hardware", tierId: BOOK.hardware.defaultTierId }),
    ).toBe(false);
  });

  it("uses the fallback tiers when nothing was stamped for them", () => {
    const design = stampedKitchen({ handle: "black" });

    expect(
      uses(design, { kind: "material", tierId: BOOK.material.defaultTierId }),
    ).toBe(true);
    expect(
      uses(design, { kind: "hardware", tierId: BOOK.hardware.defaultTierId }),
    ).toBe(true);
  });
});

describe("usage never mutates what it reads", () => {
  it("accepts deep-frozen design, item, catalogue-independent book and answers the same", () => {
    const frozenDesign = deepFrozen(structuredClone(KITCHEN_L_DESIGN));
    const frozenBook = deepFrozen(structuredClone(BOOK));
    const item = deepFrozen(accessory("sinkProtectiveCover"));

    const before = JSON.stringify([frozenDesign, frozenBook, item]);
    const answers = [
      uses(frozenDesign, item, frozenBook),
      uses(frozenDesign, deepFrozen(colour("pal.alb")), frozenBook),
      uses(frozenDesign, deepFrozen(elementAt(MATERIAL_ITEMS, 0)), frozenBook),
    ];

    expect(answers).toEqual([
      uses(KITCHEN_L_DESIGN, item),
      uses(KITCHEN_L_DESIGN, colour("pal.alb")),
      uses(KITCHEN_L_DESIGN, elementAt(MATERIAL_ITEMS, 0)),
    ]);
    expect(JSON.stringify([frozenDesign, frozenBook, item])).toBe(before);
  });
});

describe("a deletion is refused whenever any saved kitchen uses the item (M3-a, second bullet, as a property)", () => {
  const DELETABLE: readonly ItemRef[] = [
    ...MATERIAL_ITEMS,
    ...HARDWARE_ITEMS,
    ...BUILT_IN_ACCESSORY_ITEMS,
  ];

  function deletable(
    item: ItemRef,
  ): item is Extract<ItemRef, { kind: "hardware" | "material" | "accessory" }> {
    return (
      item.kind === "hardware" ||
      item.kind === "material" ||
      item.kind === "accessory"
    );
  }

  function countsOver(designs: readonly Design[]): ItemUsageCounts {
    return DELETABLE.map((item) => ({
      item,
      designCount: designs.filter((design) => uses(design, item)).length,
    }));
  }

  it("is false for any item with a design using it, for any set of kitchens and any defaults", () => {
    const arms = { used: 0, unused: 0 };

    fc.assert(
      fc.property(fc.array(aKitchen, { maxLength: 4 }), (designs) => {
        const usage = countsOver(designs);
        for (const item of DELETABLE) {
          if (!deletable(item)) continue;
          const isUsed = designs.some((design) => uses(design, item));
          arms[isUsed ? "used" : "unused"] += 1;
          if (isUsed) {
            expect(canDelete({ item, usage, book: BOOK, defaults: {} })).toBe(
              false,
            );
          }
        }
      }),
      { numRuns: 100 },
    );

    expect(arms.used).toBeGreaterThanOrEqual(ARM_FLOOR);
    expect(arms.unused).toBeGreaterThanOrEqual(ARM_FLOOR);
  });

  it("allows deleting an unused non-default item and refuses one used by a single kitchen, on the boundary 0 and 1", () => {
    const veneerKitchen = withSettings({
      cabinetDepthMm: 600,
      materialTierId: "material.veneer",
    });
    const usage = countsOver([veneerKitchen]);
    const veneer = MATERIAL_ITEMS.find((item) =>
      isSameItem(item, { kind: "material", tierId: "material.veneer" }),
    );
    const mdf = MATERIAL_ITEMS.find((item) =>
      isSameItem(item, { kind: "material", tierId: "material.painted-mdf" }),
    );
    if (
      veneer === undefined ||
      mdf === undefined ||
      !deletable(veneer) ||
      !deletable(mdf)
    ) {
      throw new Error("the book lacks the tiers");
    }

    expect(canDelete({ item: veneer, usage, book: BOOK, defaults: {} })).toBe(
      false,
    );
    expect(canDelete({ item: mdf, usage, book: BOOK, defaults: {} })).toBe(
      true,
    );
  });
});

describe("the counts a deletion is judged against are read strictly", () => {
  const SOMEWHERE = { kind: "hardware", tierId: "hardware.premium" } as const;

  type Outcome = "allowed" | "refused" | "counts-refused";

  function outcomeOf(usage: ItemUsageCounts): Outcome {
    try {
      return canDelete({ item: SOMEWHERE, usage, book: BOOK, defaults: {} })
        ? "allowed"
        : "refused";
    } catch (error) {
      if (error instanceof UsageNotCountedError) return "counts-refused";
      throw error;
    }
  }

  it.each([
    ["an unused entry first, a used one after", [0, 5]],
    ["a used entry first, an unused one after", [5, 0]],
  ])(
    "does not allow the deletion when two entries for one item disagree: %s",
    (_, designCounts) => {
      const usage = designCounts.map((designCount) => ({
        item: SOMEWHERE,
        designCount,
      }));

      expect(outcomeOf(usage)).not.toBe("allowed");
    },
  );

  it("does allow it when every entry for the item says unused, and refuses it when any entry says used", () => {
    const entries = (...counts: number[]): ItemUsageCounts =>
      counts.map((designCount) => ({ item: SOMEWHERE, designCount }));

    expect(outcomeOf(entries(0))).toBe("allowed");
    expect(outcomeOf(entries(1))).toBe("refused");
    expect(outcomeOf([])).toBe("counts-refused");
  });

  it("counts are read for the item asked about, not for a neighbour of another kind with the same id", () => {
    const usage: ItemUsageCounts = [
      {
        item: { kind: "material", tierId: "hardware.premium" },
        designCount: 9,
      },
    ];

    expect(outcomeOf(usage)).toBe("counts-refused");
    expect(() => usageCountOf(usage, SOMEWHERE)).toThrow(UsageNotCountedError);
  });
});
