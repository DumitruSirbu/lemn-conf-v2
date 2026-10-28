// M10 P4a-a and P4a-b: a design naming an item availability has switched off has no price, and availability reaches
// the answer only through the items the design names (ADR 0062 Amendment 3 and the 2026-10-26 Amendment, A-16, A-17).
//
// The refusal is `REPLACEMENT_REQUIRED` listing every such item, never `UNKNOWN_TIER` for a tier the book still holds.
// Availability is an input beside the book: the book has no flag for it and no member of it is read.
import fc from "fast-check";
import { describe, expect, expectTypeOf, it } from "vitest";

import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";
import {
  freeColourFinish,
  paletteFinish,
  PALETTE_ENTRIES,
  MATERIAL_IDS,
} from "../../src/materials.js";
import {
  isSameItem,
  type CatalogueAvailability,
  type ItemRef,
} from "../../src/pricing/catalogue-availability.js";
import type {
  AccessoryRule,
  HardwareTier,
  MaterialTier,
  PriceBook,
} from "../../src/pricing/price-book.js";
import type { PriceDesignRequest } from "../../src/pricing/price-design.js";
import type {
  PricingFailure,
  ReplacementRequiredFailure,
} from "../../src/pricing/price-lines.js";
import { itemsNamedBy } from "../../src/pricing/replacements.js";
import {
  accessory,
  availabilityOf,
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

function refusalOf(result: ReturnType<typeof priceUnder>): PricingFailure {
  if (result.ok) throw new Error("expected a refusal, got a price");
  return result.failure;
}

function itemsOf(failure: PricingFailure): readonly ItemRef[] {
  if (failure.code !== "REPLACEMENT_REQUIRED") {
    throw new Error(`expected REPLACEMENT_REQUIRED, got ${failure.code}`);
  }
  return failure.items;
}

describe("a tier the design chose, switched off, refuses the price (P4a-a)", () => {
  it("refuses a switched-off material with REPLACEMENT_REQUIRED naming it, and never UNKNOWN_TIER", () => {
    const design = withSettings({
      cabinetDepthMm: 600,
      materialTierId: "material.veneer",
    });

    const failure = refusalOf(
      priceUnder(availabilityOf([material("material.veneer")]), design),
    );

    expect(failure.code).toBe("REPLACEMENT_REQUIRED");
    expect(itemsOf(failure)).toEqual([material("material.veneer")]);
  });

  it("refuses a switched-off hardware class the same way", () => {
    const design = withSettings({
      cabinetDepthMm: 600,
      hardwareTierId: "hardware.soft-close",
    });

    const failure = refusalOf(
      priceUnder(availabilityOf([hardware("hardware.soft-close")]), design),
    );

    expect(itemsOf(failure)).toEqual([hardware("hardware.soft-close")]);
  });

  it("refuses a design that chose nothing when the book's fallback tier is the one switched off (A-9)", () => {
    const failure = refusalOf(
      priceUnder(availabilityOf([material(BOOK.material.defaultTierId)])),
    );

    expect(itemsOf(failure)).toEqual([material(BOOK.material.defaultTierId)]);
  });

  it("does not refuse a design for a tier it did not choose, switched off or not", () => {
    const design = withSettings({
      cabinetDepthMm: 600,
      materialTierId: "material.painted-mdf",
    });

    const result = priceUnder(
      availabilityOf([
        material("material.veneer"),
        hardware("hardware.premium"),
      ]),
      design,
    );

    expect(result.ok).toBe(true);
  });

  it("leaves a tier the book does not hold to UNKNOWN_TIER, whatever availability says", () => {
    const design = withSettings({
      cabinetDepthMm: 600,
      materialTierId: "material.unobtainium",
    });

    const failure = refusalOf(
      priceUnder(availabilityOf([material("material.unobtainium")]), design),
    );

    expect(failure.code).toBe("UNKNOWN_TIER");
  });

  it("fails whole: a refusal carries no price", () => {
    const result = priceUnder(
      availabilityOf([material(BOOK.material.defaultTierId)]),
    );

    expect(result).not.toHaveProperty("priced");
  });
});

describe("a colour or a handle the design stores, switched off, refuses the price (P4a-a)", () => {
  it("refuses the kitchen's colour", () => {
    const design = withSettings({
      cabinetDepthMm: 600,
      finish: paletteFinish("pal.antracit"),
    });

    const failure = refusalOf(
      priceUnder(availabilityOf([colour("pal.antracit")]), design),
    );

    expect(itemsOf(failure)).toEqual([colour("pal.antracit")]);
  });

  it("refuses one cabinet's own colour and own handle", () => {
    const design = withBodyOf(CUSTOMISABLE_PLACEMENT_ID, {
      finish: paletteFinish("pal.gri-havanna"),
      handle: "black",
    });

    const failure = refusalOf(
      priceUnder(
        availabilityOf([colour("pal.gri-havanna"), handle("black")]),
        design,
      ),
    );

    expect(itemsOf(failure)).toEqual([
      colour("pal.gri-havanna"),
      handle("black"),
    ]);
  });

  it("refuses the kitchen's handle and its top-row handle", () => {
    const design = withSettings({
      cabinetDepthMm: 600,
      handle: "push",
      topRowHandle: "black",
    });

    const failure = refusalOf(
      priceUnder(availabilityOf([handle("push"), handle("black")]), design),
    );

    expect(itemsOf(failure)).toEqual([handle("black"), handle("push")]);
  });

  it("never reads a free colour as an item: nothing can switch one off", () => {
    const design = withSettings({
      cabinetDepthMm: 600,
      finish: freeColourFinish("#b8c4a1"),
    });

    expect(itemsNamedBy({ design, catalog: CATALOG, book: BOOK })).toEqual([
      material(BOOK.material.defaultTierId),
      hardware(BOOK.hardware.defaultTierId),
    ]);
  });

  it("reads no colour or handle off a body whose catalogue row cannot wear one", () => {
    const design = withBodyOf(PLAIN_PLACEMENT_ID, {
      finish: paletteFinish("pal.antracit"),
      handle: "black",
    });

    const result = priceUnder(
      availabilityOf([colour("pal.antracit"), handle("black")]),
      design,
    );

    expect(result.ok).toBe(true);
  });

  it("does not default: a design that names no colour and no handle is not refused for the slot's default", () => {
    const result = priceUnder(
      availabilityOf([
        handle("steel"),
        handle("push"),
        colour("pal.alb"),
        colour("veneer.stejar"),
      ]),
    );

    expect(result.ok).toBe(true);
  });
});

describe("the refusal lists every switched-off item the design names, once, in one order (P4a-a)", () => {
  const kitchen = kitchenNamingEverything();

  it("names all seven items of a kitchen that names seven", () => {
    expect(
      itemsNamedBy({
        design: kitchen,
        catalog: CATALOG,
        book: BOOK,
        chosen: kitchen.settings,
      }),
    ).toEqual(ITEMS_NAMED_BY_THAT_KITCHEN);
  });

  it("lists each one once although two are named at two levels", () => {
    const failure = refusalOf(
      priceUnder(availabilityOf(ITEMS_NAMED_BY_THAT_KITCHEN), kitchen),
    );

    expect(itemsOf(failure)).toEqual(ITEMS_NAMED_BY_THAT_KITCHEN);
  });

  it("lists only the ones that are switched off", () => {
    const failure = refusalOf(
      priceUnder(
        availabilityOf([
          colour("veneer.stejar"),
          hardware("hardware.premium"),
          handle("black"),
          colour("pal.alb"),
        ]),
        kitchen,
      ),
    );

    expect(itemsOf(failure)).toEqual([
      hardware("hardware.premium"),
      colour("veneer.stejar"),
      handle("black"),
    ]);
  });

  it("carries the items as the refusal's own member and nowhere else is the list needed", () => {
    const failure = refusalOf(
      priceUnder(availabilityOf([material("material.veneer")]), kitchen),
    );

    expect(Object.keys(failure).sort()).toEqual(["code", "detail", "items"]);
  });
});

describe("availability reaches the answer only through the items the design names (P4a-b)", () => {
  const kitchen = kitchenNamingEverything();
  const NAMED = ITEMS_NAMED_BY_THAT_KITCHEN;
  const SINK_EXTRAS: readonly ItemRef[] = [
    accessory("sinkProtectiveCover"),
    accessory("dishDryingRack"),
  ];
  const LINES_THE_KITCHEN_EARNS = SINK_EXTRAS;

  /** Everything the shipped catalogue and book can switch off that the kitchen neither names nor earns, plus ids no
   *  book holds: switching any of them off must change nothing. */
  const isNeitherNamedNorEarned = (item: ItemRef): boolean =>
    ![...NAMED, ...LINES_THE_KITCHEN_EARNS].some((used) =>
      isSameItem(used, item),
    );
  const UNUSED: readonly ItemRef[] = [
    ...MATERIAL_IDS.map(material),
    ...BOOK.hardware.tiers.map((tier) => hardware(tier.tierId)),
    ...PALETTE_ENTRIES.map((entry) => colour(entry.entryId)),
    accessory("accessory.linked-that-no-book-holds"),
    material("material.the-book-never-held"),
  ].filter(isNeitherNamedNorEarned);

  const aSubsetOf = (items: readonly ItemRef[]) =>
    fc.shuffledSubarray([...items], { minLength: 0, maxLength: items.length });
  const aRevision = fc.string({ minLength: 1, maxLength: 12 });

  it("the unused universe really excludes everything the kitchen names or earns", () => {
    const used = [...NAMED, ...LINES_THE_KITCHEN_EARNS];

    expect(
      UNUSED.filter((item) => used.some((named) => isSameItem(named, item))),
    ).toEqual([]);
    expect(UNUSED.length).toBeGreaterThan(10);
  });

  it("gives byte-identical results for two availabilities that differ only in items the design does not use", () => {
    fc.assert(
      fc.property(
        aSubsetOf([...NAMED, ...LINES_THE_KITCHEN_EARNS]),
        aSubsetOf(UNUSED),
        aSubsetOf(UNUSED),
        aRevision,
        aRevision,
        (
          usedAndSwitchedOff,
          oneUnused,
          otherUnused,
          oneRevision,
          otherRevision,
        ) => {
          const one = priceUnder(
            availabilityOf([...oneUnused, ...usedAndSwitchedOff], oneRevision),
            kitchen,
          );
          const other = priceUnder(
            availabilityOf(
              [...usedAndSwitchedOff, ...otherUnused],
              otherRevision,
            ),
            kitchen,
          );

          expect(JSON.stringify(one)).toBe(JSON.stringify(other));
        },
      ),
    );
  });

  it("gives byte-identical results however availability orders the items it lists", () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray([...NAMED], {
          minLength: 2,
          maxLength: NAMED.length,
        }),
        fc.nat(),
        (switchedOff, seed) => {
          const reversed = [...switchedOff].reverse();
          const rotated = [
            ...switchedOff.slice(seed % switchedOff.length),
            ...switchedOff.slice(0, seed % switchedOff.length),
          ];

          const reference = JSON.stringify(
            priceUnder(availabilityOf(switchedOff), kitchen),
          );

          expect(
            JSON.stringify(priceUnder(availabilityOf(reversed), kitchen)),
          ).toBe(reference);
          expect(
            JSON.stringify(priceUnder(availabilityOf(rotated), kitchen)),
          ).toBe(reference);
        },
      ),
    );
  });

  it("lists an item twice in availability as once in the refusal", () => {
    const failure = refusalOf(
      priceUnder(
        availabilityOf([handle("black"), handle("black"), handle("black")]),
        kitchen,
      ),
    );

    expect(itemsOf(failure)).toEqual([handle("black")]);
  });

  it("leaves a design that names nothing switched off priced exactly as under an empty availability", () => {
    const untouched = priceUnder(NOTHING_DISABLED, kitchen);

    expect(untouched.ok).toBe(true);
    fc.assert(
      fc.property(aSubsetOf(UNUSED), aRevision, (unused, revision) => {
        expect(priceUnder(availabilityOf(unused, revision), kitchen)).toEqual(
          untouched,
        );
      }),
    );
  });
});

describe("the book carries no availability and no active flag, and none is read from it (P4a-b)", () => {
  it("makes availability a required member of the request, so a caller that has not read it does not compile", () => {
    expectTypeOf<
      PriceDesignRequest["availability"]
    >().toEqualTypeOf<CatalogueAvailability>();
  });

  it("declares no availability member on the book and no active member on a tier or an accessory rule", () => {
    expectTypeOf<PriceBook>().not.toHaveProperty("availability");
    expectTypeOf<PriceBook>().not.toHaveProperty("disabled");
    expectTypeOf<HardwareTier>().not.toHaveProperty("active");
    expectTypeOf<MaterialTier>().not.toHaveProperty("active");
    expectTypeOf<AccessoryRule>().not.toHaveProperty("active");
  });

  it("does not compile a read of availability off the book", () => {
    // @ts-expect-error -- availability is not a field of a book (A-17); adding one turns this line red
    const read: unknown = BOOK.availability;

    expect(read).toBeUndefined();
  });

  it("is not told to refuse by a list stuffed into the book, nor by a tier flagged inactive in it", () => {
    const stuffed = {
      ...BOOK,
      availability: availabilityOf([material(BOOK.material.defaultTierId)]),
      material: {
        ...BOOK.material,
        tiers: BOOK.material.tiers.map((tier) => ({ ...tier, active: false })),
      },
    } as unknown as PriceBook;

    const under = priceUnder(NOTHING_DISABLED, KITCHEN_L_DESIGN, stuffed);

    expect(under.ok ? "priced" : under.failure.code).not.toBe(
      "REPLACEMENT_REQUIRED",
    );
  });

  it("is a REPLACEMENT_REQUIRED arm that carries items, and no other arm does", () => {
    expectTypeOf<
      Extract<PricingFailure, { code: "REPLACEMENT_REQUIRED" }>
    >().toEqualTypeOf<ReplacementRequiredFailure>();
    expectTypeOf<
      Exclude<PricingFailure, ReplacementRequiredFailure>
    >().not.toHaveProperty("items");
  });
});
