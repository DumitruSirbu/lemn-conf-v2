// M10 P4a-c: `replacementsRequired` is the replacement sheet's rows: each switched-off item the kitchen names, with the
// options that remain (ADR 0062 Amendment 3: "the relevant global setting opens showing only the remaining options").
//
// It lists only active options, agrees with the refusal `priceDesign` makes, and throws when a row has nothing to
// choose: the dashboard's last-active-option guard (A-17) makes that unreachable, and the throw is what proves it.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";
import {
  materialById,
  paletteEntriesOf,
  paletteFinish,
} from "../../src/materials.js";
import {
  isItemDisabled,
  type ItemRef,
} from "../../src/pricing/catalogue-availability.js";
import {
  NoReplacementOptionError,
  replacementsRequired,
} from "../../src/queries/replacements-required.js";
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
  priceUnder,
  withBodyOf,
  withSettings,
} from "../support/availability-kitchens.js";

const MATERIAL_ITEMS: readonly ItemRef[] = BOOK.material.tiers.map((tier) =>
  material(tier.tierId),
);
const HARDWARE_ITEMS: readonly ItemRef[] = BOOK.hardware.tiers.map((tier) =>
  hardware(tier.tierId),
);
const HANDLE_ITEMS: readonly ItemRef[] = [
  handle("steel"),
  handle("black"),
  handle("push"),
];
const VENEER_COLOUR_ITEMS: readonly ItemRef[] = paletteEntriesOf(
  materialById("material.veneer"),
).map((entry) => colour(entry.entryId));

function rowsOf(design: typeof KITCHEN_L_DESIGN, disabled: readonly ItemRef[]) {
  return replacementsRequired({
    design,
    book: BOOK,
    availability: availabilityOf(disabled),
    catalog: CATALOG,
  });
}

describe("the rows are the switched-off items the kitchen names, each with what can replace it (P4a-c)", () => {
  const kitchen = kitchenNamingEverything();

  it("offers a switched-off material the book's other materials, in the book's order", () => {
    const rows = rowsOf(kitchen, [material("material.veneer")]);

    expect(rows).toEqual([
      {
        item: material("material.veneer"),
        remaining: [
          material("material.melamine"),
          material("material.painted-mdf"),
        ],
      },
    ]);
  });

  it("offers a switched-off hardware class the others, never one already switched off", () => {
    const rows = rowsOf(kitchen, [
      hardware("hardware.premium"),
      hardware("hardware.soft-close"),
    ]);

    expect(rows).toEqual([
      {
        item: hardware("hardware.premium"),
        remaining: [hardware("hardware.standard")],
      },
    ]);
  });

  it("offers a switched-off handle the other two", () => {
    expect(rowsOf(kitchen, [handle("black")])).toEqual([
      { item: handle("black"), remaining: [handle("steel"), handle("push")] },
    ]);
  });

  it("offers a switched-off colour the active colours of the kitchen's own material", () => {
    const rows = rowsOf(kitchen, [colour("veneer.nuc")]);

    expect(rows).toEqual([
      { item: colour("veneer.nuc"), remaining: [colour("veneer.stejar")] },
    ]);
  });

  it("is one row for a colour named at two levels, whose options are the kitchen's other colours (A-16)", () => {
    const antracit = paletteFinish("pal.antracit");
    const atBothLevels = withBodyOf(
      CUSTOMISABLE_PLACEMENT_ID,
      { finish: antracit },
      withSettings({ cabinetDepthMm: 600, finish: antracit }),
    );

    const rows = rowsOf(atBothLevels, [colour("pal.antracit")]);

    expect(rows).toEqual([
      {
        item: colour("pal.antracit"),
        remaining: [
          colour("pal.alb"),
          colour("pal.stejar-bardolino"),
          colour("pal.stejar-halifax"),
          colour("pal.gri-havanna"),
          colour("pal.nuc-warmia"),
        ],
      },
    ]);
  });

  it("lists every item the price refuses on, in the same order, so the sheet and the refusal cannot disagree", () => {
    const switchedOff = [
      colour("veneer.nuc"),
      hardware("hardware.premium"),
      handle("steel"),
    ];

    const result = priceUnder(availabilityOf(switchedOff), kitchen);
    const refusedOn =
      !result.ok && result.failure.code === "REPLACEMENT_REQUIRED"
        ? result.failure.items
        : undefined;

    expect(refusedOn).toBeDefined();
    expect(rowsOf(kitchen, switchedOff).map((row) => row.item)).toEqual(
      refusedOn,
    );
  });

  it("is empty when the kitchen names nothing that is switched off", () => {
    expect(rowsOf(kitchen, [material("material.painted-mdf")])).toEqual([]);
    expect(rowsOf(KITCHEN_L_DESIGN, [])).toEqual([]);
  });

  it("never lists an accessory: it is removed with a notice, and there is nothing to choose instead", () => {
    expect(
      rowsOf(KITCHEN_L_DESIGN, [
        accessory("sinkProtectiveCover"),
        accessory("dishDryingRack"),
      ]),
    ).toEqual([]);
  });

  it("offers a switched-off fallback tier to a kitchen that chose none (A-9)", () => {
    const rows = rowsOf(KITCHEN_L_DESIGN, [
      material(BOOK.material.defaultTierId),
    ]);

    expect(rows.map((row) => row.item)).toEqual([
      material(BOOK.material.defaultTierId),
    ]);
  });
});

describe("a row never offers a switched-off item, for any set switched off (P4a-c)", () => {
  const kitchen = kitchenNamingEverything();
  /** A set that leaves at least one option active in every group, so no row is without a way forward. */
  const aSetLeavingEveryGroupAnOption = fc
    .tuple(
      ...[
        MATERIAL_ITEMS,
        HARDWARE_ITEMS,
        HANDLE_ITEMS,
        VENEER_COLOUR_ITEMS,
      ].map((group) =>
        fc.shuffledSubarray([...group], {
          minLength: 0,
          maxLength: group.length - 1,
        }),
      ),
    )
    .map((parts) => parts.flat());

  it("lists only active options, and only items the kitchen names as rows", () => {
    fc.assert(
      fc.property(aSetLeavingEveryGroupAnOption, (switchedOff) => {
        const availability = availabilityOf(switchedOff);

        const rows = rowsOf(kitchen, switchedOff);

        for (const row of rows) {
          expect(isItemDisabled(availability, row.item)).toBe(true);
          expect(row.remaining.length).toBeGreaterThan(0);
          for (const option of row.remaining) {
            expect(isItemDisabled(availability, option)).toBe(false);
          }
        }
        expect(rows.map((row) => row.item)).toEqual(
          ITEMS_NAMED_BY_THAT_KITCHEN.filter((item) =>
            isItemDisabled(availability, item),
          ),
        );
      }),
    );
  });
});

describe("a row with nothing to choose is a thrown defect, never a sheet (P4a-c)", () => {
  const kitchen = kitchenNamingEverything();

  it.each([
    ["material", MATERIAL_ITEMS],
    ["hardware", HARDWARE_ITEMS],
    ["handle", HANDLE_ITEMS],
    ["colour", VENEER_COLOUR_ITEMS],
  ])("throws when every %s option is switched off", (_group, items) => {
    expect(() => rowsOf(kitchen, items)).toThrow(NoReplacementOptionError);
  });

  it("names the item it could not replace", () => {
    try {
      rowsOf(kitchen, HANDLE_ITEMS);
      expect.unreachable("every handle is off, so a row has no option");
    } catch (error) {
      expect(error).toBeInstanceOf(NoReplacementOptionError);
      expect((error as NoReplacementOptionError).item).toEqual(handle("black"));
    }
  });

  it("throws for a colour on a material that offers no palette entry, where no option can be named", () => {
    const freeColourKitchen = withSettings({
      cabinetDepthMm: 600,
      materialTierId: "material.painted-mdf",
      finish: paletteFinish("pal.antracit"),
    });

    expect(() => rowsOf(freeColourKitchen, [colour("pal.antracit")])).toThrow(
      NoReplacementOptionError,
    );
  });
});
