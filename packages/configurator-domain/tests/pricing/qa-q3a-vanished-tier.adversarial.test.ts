// Counterexample hunting against "a chosen tier the book does not hold is a replacement" (see ADR 0178 decision 1).
// `q3a-vanished-tier-is-a-replacement.test.ts` sweeps a vanished id the sample book dropped or nobody held, over books
// that drop tiers. This adds what it lacks: an id another GROUP holds, the claim that
// `UNKNOWN_TIER` is unreachable over every design and availability, byte determinism, the full order of a refusal
// written out by hand, and the colour row beside a vanished material.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { HandleSchema } from "../../src/design.js";
import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";
import {
  CURRENT_SCHEMA_VERSION,
  migrateDesign,
} from "../../src/migrate-design.js";
import {
  materialById,
  paletteEntriesOf,
  paletteFinish,
  PALETTE_ENTRY_IDS,
} from "../../src/materials.js";
import { type ItemRef } from "../../src/pricing/catalogue-availability.js";
import {
  disabledItemsNamedBy,
  itemsNamedBy,
} from "../../src/pricing/named-items.js";
import type { PriceBook } from "../../src/pricing/price-book.js";
import {
  NoReplacementOptionError,
  replacementsRequired,
} from "../../src/queries/replacements-required.js";
import {
  fatalDesignValidationIssues,
  validateDesignForCatalog,
} from "../../src/validate-design.js";
import {
  availabilityOf,
  BOOK,
  CATALOG,
  colour,
  handle,
  hardware,
  material,
  priceUnder,
  withSettings,
} from "../support/availability-kitchens.js";
import { NOTHING_DISABLED } from "../support/availability.js";

const MATERIAL_TIER_IDS = BOOK.material.tiers.map(({ tierId }) => tierId);
const HARDWARE_TIER_IDS = BOOK.hardware.tiers.map(({ tierId }) => tierId);
const EVERY_SWITCHABLE_ITEM: readonly ItemRef[] = [
  ...MATERIAL_TIER_IDS.map(material),
  ...HARDWARE_TIER_IDS.map(hardware),
  ...PALETTE_ENTRY_IDS.map(colour),
  ...HandleSchema.options.map(handle),
];

/** What availability may switch off without emptying a group (A-17): every tier but each group's default. */
const NON_DEFAULT_TIERS: readonly ItemRef[] = [
  ...MATERIAL_TIER_IDS.filter((id) => id !== BOOK.material.defaultTierId).map(
    material,
  ),
  ...HARDWARE_TIER_IDS.filter((id) => id !== BOOK.hardware.defaultTierId).map(
    hardware,
  ),
];

function failureCodeOf(result: ReturnType<typeof priceUnder>): string {
  return result.ok ? "OK" : result.failure.code;
}

function itemsOfRefusal(result: ReturnType<typeof priceUnder>): ItemRef[] {
  if (result.ok || result.failure.code !== "REPLACEMENT_REQUIRED") {
    throw new Error(
      `expected REPLACEMENT_REQUIRED, got ${failureCodeOf(result)}`,
    );
  }
  return [...result.failure.items];
}

describe("a tier id that ANOTHER group holds is a vanished tier of this group", () => {
  const arbitraryChoice = fc.oneof(
    fc.record({
      kind: fc.constant("material" as const),
      tierId: fc.constantFrom(...HARDWARE_TIER_IDS),
    }),
    fc.record({
      kind: fc.constant("hardware" as const),
      tierId: fc.constantFrom(...MATERIAL_TIER_IDS),
    }),
  );

  it("is refused as the choosing group's replacement and offered that group's own tiers, whatever is switched off", () => {
    fc.assert(
      fc.property(
        arbitraryChoice,
        fc.subarray([...NON_DEFAULT_TIERS]),
        ({ kind, tierId }, switchedOff) => {
          const design = withSettings({
            cabinetDepthMm: 600,
            ...(kind === "material"
              ? { materialTierId: tierId }
              : { hardwareTierId: tierId }),
          });
          const availability = availabilityOf(switchedOff);
          const vanished: ItemRef = { kind, tierId };

          const refused = itemsOfRefusal(priceUnder(availability, design));
          const [row] = replacementsRequired({
            design,
            book: BOOK,
            availability,
            catalog: CATALOG,
          }).filter(
            ({ item }) =>
              item.kind === kind && "tierId" in item && item.tierId === tierId,
          );

          expect(refused).toContainEqual(vanished);
          expect(row?.remaining.every((option) => option.kind === kind)).toBe(
            true,
          );
          expect(row?.remaining).not.toContainEqual(vanished);
        },
      ),
    );
  });
});

describe("UNKNOWN_TIER is unreachable from any stored design under a book that holds its own defaults", () => {
  const arbitraryTierId = fc.oneof(
    fc.constantFrom(...MATERIAL_TIER_IDS, ...HARDWARE_TIER_IDS),
    fc.string({ maxLength: 32 }),
    fc.constantFrom(
      "",
      " ",
      "material.",
      "MATERIAL.VENEER",
      "material.veneer ",
    ),
  );

  it("holds over any tier ids, chosen or not, and any availability", () => {
    fc.assert(
      fc.property(
        fc.option(arbitraryTierId, { nil: undefined }),
        fc.option(arbitraryTierId, { nil: undefined }),
        fc.subarray([...EVERY_SWITCHABLE_ITEM]),
        (materialTierId, hardwareTierId, switchedOff) => {
          const design = withSettings({
            cabinetDepthMm: 600,
            ...(materialTierId === undefined ? {} : { materialTierId }),
            ...(hardwareTierId === undefined ? {} : { hardwareTierId }),
          });

          const result = priceUnder(availabilityOf(switchedOff), design);

          expect(failureCodeOf(result)).not.toBe("UNKNOWN_TIER");
        },
      ),
      { numRuns: 400 },
    );
  });

  it("names the empty and the near-miss ids as vanished, never as the held tier they resemble", () => {
    for (const lookalike of ["", " ", "MATERIAL.VENEER", "material.veneer "]) {
      const design = withSettings({
        cabinetDepthMm: 600,
        materialTierId: lookalike,
      });

      expect(itemsOfRefusal(priceUnder(NOTHING_DISABLED, design))).toEqual([
        material(lookalike),
      ]);
    }
  });
});

describe("the refusal is the same bytes whatever order availability lists its items or the design lists its bodies", () => {
  const design = withSettings({
    cabinetDepthMm: 600,
    materialTierId: "material.ghost",
    hardwareTierId: "hardware.ghost",
    finish: paletteFinish("pal.antracit"),
    handle: "black",
  });
  const switchedOff = [
    material("material.ghost"),
    hardware("hardware.ghost"),
    colour("pal.antracit"),
    handle("black"),
  ];
  const reference = JSON.stringify(
    priceUnder(availabilityOf(switchedOff), design),
  );

  it("holds for every order of availability's list", () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray(switchedOff, { minLength: switchedOff.length }),
        (listed) => {
          expect(
            JSON.stringify(priceUnder(availabilityOf(listed), design)),
          ).toBe(reference);
        },
      ),
    );
  });

  it("holds when the design's placements are written in the opposite order", () => {
    const reversed = {
      ...design,
      placements: [...design.placements].reverse(),
    };

    expect(
      JSON.stringify(priceUnder(availabilityOf(switchedOff), reversed)),
    ).toBe(reference);
  });
});

describe("what a refusal lists, written out by hand", () => {
  it("lists a vanished material, a vanished hardware class and a handle in kind order, and not the colour of the vanished material", () => {
    const design = withSettings({
      cabinetDepthMm: 600,
      materialTierId: "material.ghost",
      hardwareTierId: "hardware.ghost",
      finish: paletteFinish("pal.antracit"),
      handle: "black",
    });
    const availability = availabilityOf([
      handle("black"),
      colour("pal.antracit"),
    ]);

    expect(itemsOfRefusal(priceUnder(availability, design))).toEqual([
      { kind: "material", tierId: "material.ghost" },
      { kind: "hardware", tierId: "hardware.ghost" },
      { kind: "handle", handle: "black" },
    ]);
  });

  it("names the switched-off fallback of the group the design chose nothing for, beside the vanished choice (A-9)", () => {
    const design = withSettings({
      cabinetDepthMm: 600,
      materialTierId: "material.ghost",
    });
    const availability = availabilityOf([
      hardware(BOOK.hardware.defaultTierId),
    ]);

    expect(itemsOfRefusal(priceUnder(availability, design))).toEqual([
      material("material.ghost"),
      hardware(BOOK.hardware.defaultTierId),
    ]);
  });

  // A vanished chosen tier is decided before `selectTier` reads the fallback, so a kitchen
  // that has both a vanished choice and a book whose OTHER group's fallback is missing is a replacement, and the book
  // fault surfaces only after the customer replaces it.
  it("is a replacement, not the book fault, when a vanished choice meets a missing fallback of the other group", () => {
    const faulty: PriceBook = {
      ...BOOK,
      hardware: { ...BOOK.hardware, defaultTierId: "hardware.retired" },
    };
    const design = withSettings({
      cabinetDepthMm: 600,
      materialTierId: "material.ghost",
    });

    expect(
      itemsOfRefusal(priceUnder(NOTHING_DISABLED, design, faulty)),
    ).toEqual([material("material.ghost")]);
    expect(
      failureCodeOf(
        priceUnder(
          NOTHING_DISABLED,
          withSettings({ cabinetDepthMm: 600 }),
          faulty,
        ),
      ),
    ).toBe("UNKNOWN_TIER");
  });
});

describe("the only empty-set answer is NoReplacementOptionError", () => {
  it("throws it for a vanished tier whose group has every tier switched off, and for no other reason", () => {
    const design = withSettings({
      cabinetDepthMm: 600,
      materialTierId: "material.ghost",
    });

    expect(() =>
      replacementsRequired({
        design,
        book: BOOK,
        availability: availabilityOf(MATERIAL_TIER_IDS.map(material)),
        catalog: CATALOG,
      }),
    ).toThrow(NoReplacementOptionError);
    expect(() =>
      replacementsRequired({
        design,
        book: BOOK,
        availability: availabilityOf(MATERIAL_TIER_IDS.slice(1).map(material)),
        catalog: CATALOG,
      }),
    ).not.toThrow();
  });
});

describe("a vanished material the code still declares, wearing a switched-off colour", () => {
  // The realistic deletion: a publish removed `material.veneer`, which the palette code still declares.
  const bookWithoutVeneer: PriceBook = {
    ...BOOK,
    material: {
      ...BOOK.material,
      tiers: BOOK.material.tiers.filter(
        ({ tierId }) => tierId !== "material.veneer",
      ),
    },
  };
  const design = withSettings({
    cabinetDepthMm: 600,
    materialTierId: "material.veneer",
    finish: paletteFinish("veneer.nuc"),
  });

  it("builds the material's row alone, from the book's tiers: the colour row is omitted while its material is replaced (ADR 0057)", () => {
    const rows = replacementsRequired({
      design,
      book: bookWithoutVeneer,
      availability: availabilityOf([colour("veneer.nuc")]),
      catalog: CATALOG,
    });

    expect(rows.map(({ item }) => item)).toEqual([material("material.veneer")]);
    expect(rows[0]?.remaining).toEqual([
      material("material.melamine"),
      material("material.painted-mdf"),
    ]);
  });
});

describe("a vanished undeclared material wearing a palette colour is a kitchen a stored document can be", () => {
  const ghostWearingAPaletteColour = withSettings({
    cabinetDepthMm: 600,
    materialTierId: "material.ghost",
    finish: paletteFinish("pal.antracit"),
  });

  it("passes the write seam (ADR 0078: an undeclared material reports no unoffered finish)", () => {
    expect(
      fatalDesignValidationIssues(
        validateDesignForCatalog(ghostWearingAPaletteColour, CATALOG),
      ),
    ).toEqual([]);
  });

  it("is kept as it is by the load seam: an undeclared material resolves nothing and keeps its colour (ADR 0078 decision 3)", () => {
    const raw: unknown = JSON.parse(JSON.stringify(ghostWearingAPaletteColour));

    const loaded = migrateDesign(CURRENT_SCHEMA_VERSION, raw, CATALOG);

    expect(loaded.settings?.finish).toEqual(paletteFinish("pal.antracit"));
    expect(loaded.settings?.materialTierId).toBe("material.ghost");
  });

  it("is refused by the price with the vanished material alone: its switched-off colour is not listed (the material change resets it, ADR 0057)", () => {
    expect(
      itemsOfRefusal(
        priceUnder(
          availabilityOf([colour("pal.antracit")]),
          ghostWearingAPaletteColour,
        ),
      ),
    ).toEqual([material("material.ghost")]);
  });

  it("is a replacement for the material alone when the colour is not switched off", () => {
    expect(
      replacementsRequired({
        design: ghostWearingAPaletteColour,
        book: BOOK,
        availability: NOTHING_DISABLED,
        catalog: CATALOG,
      }).map(({ item }) => item),
    ).toEqual([material("material.ghost")]);
  });

  it("is named the same by the sheet's list and the refusal's, the two sharing one reader", () => {
    const availability = availabilityOf([colour("pal.antracit")]);

    expect(
      disabledItemsNamedBy(
        {
          design: ghostWearingAPaletteColour,
          catalog: CATALOG,
          book: BOOK,
          chosen: ghostWearingAPaletteColour.settings,
        },
        availability,
      ),
    ).toEqual(
      itemsOfRefusal(priceUnder(availability, ghostWearingAPaletteColour)),
    );
  });
});

describe("the seeded kitchen is untouched by the new rule", () => {
  it("prices as before when it chose no tier and the book holds its defaults", () => {
    expect(priceUnder(NOTHING_DISABLED, KITCHEN_L_DESIGN).ok).toBe(true);
  });
});

// `itemsNamedBy` stays "a switchable item the book holds", so the dashboard's switch universe does not move; only
// `disabledItemsNamedBy` gains the vanished tier. Without this pin, moving the change into `itemsNamedBy` instead leaves
// every other test green.
describe("itemsNamedBy keeps its meaning: a switchable item the book holds", () => {
  it("leaves out a chosen tier the book does not hold, while disabledItemsNamedBy lists it", () => {
    const design = withSettings({
      cabinetDepthMm: 600,
      materialTierId: "material.ghost",
      hardwareTierId: "hardware.premium",
    });
    const query = {
      design,
      catalog: CATALOG,
      book: BOOK,
      chosen: design.settings,
    };

    expect(itemsNamedBy(query)).toEqual([hardware("hardware.premium")]);
    expect(disabledItemsNamedBy(query, NOTHING_DISABLED)).toEqual([
      material("material.ghost"),
    ]);
  });
});

// A book that HOLDS a material tier no code declares (a created class) has the same sheet defect with no vanished tier at
// all: the colour group is the palette the code declares for the material, and it declares none. Q5a's ruling 5 fixed
// it: the row offers the palette holding the colour itself.
describe("a held material no code declares, wearing a switched-off palette colour", () => {
  const createdMaterial = {
    ...BOOK.material.tiers[0],
    tierId: "material.created",
    ruleId: "material.created",
    nameKey: undefined,
    descriptionKey: undefined,
  };
  const bookHoldingIt = {
    ...BOOK,
    material: {
      ...BOOK.material,
      tiers: [...BOOK.material.tiers, createdMaterial],
    },
  } as unknown as PriceBook;
  const wearingItWithAPaletteColour = withSettings({
    cabinetDepthMm: 600,
    materialTierId: "material.created",
    finish: paletteFinish("pal.antracit"),
  });

  it("is a book the pricing engine accepts, and a kitchen that prices", () => {
    expect(
      priceUnder(NOTHING_DISABLED, wearingItWithAPaletteColour, bookHoldingIt)
        .ok,
    ).toBe(true);
  });

  it("is refused by the price for the switched-off colour alone", () => {
    expect(
      itemsOfRefusal(
        priceUnder(
          availabilityOf([colour("pal.antracit")]),
          wearingItWithAPaletteColour,
          bookHoldingIt,
        ),
      ),
    ).toEqual([colour("pal.antracit")]);
  });

  it("builds a sheet whose colour row offers the palette that holds the colour, instead of throwing (Q5a ruling 5)", () => {
    const rows = replacementsRequired({
      design: wearingItWithAPaletteColour,
      book: bookHoldingIt,
      availability: availabilityOf([colour("pal.antracit")]),
      catalog: CATALOG,
    });

    expect(rows.map((row) => row.item)).toEqual([colour("pal.antracit")]);
    expect(rows[0]?.remaining).toEqual(
      paletteEntriesOf(materialById("material.melamine"))
        .filter((entry) => entry.entryId !== "pal.antracit")
        .map((entry) => colour(entry.entryId)),
    );
  });
});
