// What the sheet offers for a colour under a material no code declares: each colour its own palette, no borrowing
// across palettes, declared materials unchanged, a vanished material still one row, and an offer that, taken, clears the
// refusal.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { replaceColour, type Design } from "../../src/index.js";
import {
  MATERIALS,
  paletteEntriesOf,
  paletteFinish,
  PALETTE_ENTRY_IDS,
  freeColourFinish,
  type PaletteEntryId,
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
  availabilityOf,
  BOOK,
  CATALOG,
  colour,
  CUSTOMISABLE_PLACEMENT_ID,
  handle,
  material,
  priceUnder,
  withBodyOf,
  withSettings,
} from "../support/availability-kitchens.js";
import {
  bookHoldingMaterial,
  OCCURRED_AT,
  paletteFinishOf,
  wearing,
} from "../support/replacement-kitchens.js";

const EXOTIC = "material.exotic";
const BOOK_WITH_EXOTIC = bookHoldingMaterial(EXOTIC);

const PAL = paletteEntriesOf(MATERIALS[0] ?? failure()).map(
  ({ entryId }) => entryId,
);
const VENEER = paletteEntriesOf(MATERIALS[2] ?? failure()).map(
  ({ entryId }) => entryId,
);

function failure(): never {
  throw new Error("the declared materials changed shape");
}

/** The seeded kitchen wearing the given colours, under the undeclared material unless another is given. */
function wearingUnder(
  kitchen: PaletteEntryId | undefined,
  cabinet: PaletteEntryId | undefined,
  materialTierId = EXOTIC,
): Design {
  return wearing(kitchen, cabinet, materialTierId);
}

function rows(
  design: Design,
  switchedOff: readonly ItemRef[],
  book: PriceBook = BOOK_WITH_EXOTIC,
) {
  return replacementsRequired({
    design,
    book,
    availability: availabilityOf(switchedOff),
    catalog: CATALOG,
  });
}

describe("two colours from two palettes under one material no code declares", () => {
  it("offers each its own palette: the kitchen's PAL colour PAL, a cabinet's veneer wood veneer, never a mix", () => {
    const design = wearingUnder("pal.antracit", "veneer.nuc");

    const result = rows(design, [colour("pal.antracit"), colour("veneer.nuc")]);

    expect(result).toEqual([
      {
        item: colour("pal.antracit"),
        remaining: PAL.filter((entryId) => entryId !== "pal.antracit").map(
          colour,
        ),
      },
      { item: colour("veneer.nuc"), remaining: [colour("veneer.stejar")] },
    ]);
  });

  it("throws for the palette that is switched off whole, though another palette has active entries", () => {
    const design = wearingUnder("pal.antracit", "veneer.nuc");

    expect(() =>
      rows(design, VENEER.map(colour).concat(colour("pal.antracit"))),
    ).toThrow(NoReplacementOptionError);
    expect(() => rows(design, [colour("pal.antracit")])).not.toThrow();
  });

  it("does not throw while one entry of the colour's own palette stays active, whatever else is off", () => {
    const design = wearingUnder("pal.antracit", undefined);
    const everythingButAlb = PALETTE_ENTRY_IDS.filter(
      (entryId) => entryId !== "pal.alb",
    ).map(colour);

    expect(rows(design, everythingButAlb)).toEqual([
      { item: colour("pal.antracit"), remaining: [colour("pal.alb")] },
    ]);
  });
});

describe("a declared material keeps the colours it offers, and only those", () => {
  it("veneer wearing a hand-edited PAL colour offers veneer's woods, not the colour's own palette", () => {
    const design = wearingUnder("pal.antracit", undefined, "material.veneer");

    expect(rows(design, [colour("pal.antracit")], BOOK)).toEqual([
      { item: colour("pal.antracit"), remaining: VENEER.map(colour) },
    ]);
  });

  it("melamine wearing a hand-edited veneer wood offers PAL, not veneer", () => {
    const design = wearingUnder("veneer.nuc", undefined, "material.melamine");

    expect(rows(design, [colour("veneer.nuc")], BOOK)).toEqual([
      { item: colour("veneer.nuc"), remaining: PAL.map(colour) },
    ]);
  });

  it("painted MDF wearing a palette colour still throws: a material that offers no entries is not an undeclared one", () => {
    const design = wearingUnder(
      "pal.antracit",
      undefined,
      "material.painted-mdf",
    );

    expect(() => rows(design, [colour("pal.antracit")], BOOK)).toThrow(
      NoReplacementOptionError,
    );
  });

  it("no material in the settings at all follows the book's default, a declared material", () => {
    const design = withSettings({
      cabinetDepthMm: 600,
      finish: paletteFinish("veneer.nuc"),
    });

    expect(rows(design, [colour("veneer.nuc")], BOOK)).toEqual([
      { item: colour("veneer.nuc"), remaining: PAL.map(colour) },
    ]);
  });
});

describe("a design with no material of its own, under a book whose default material is veneer", () => {
  const bookDefaultingToVeneer: PriceBook = {
    ...BOOK,
    material: { ...BOOK.material, defaultTierId: "material.veneer" },
  };
  const design = withSettings({
    cabinetDepthMm: 600,
    finish: paletteFinish("pal.antracit"),
  });
  const rowOfTheColour = () => {
    const [row] = rows(
      design,
      [colour("pal.antracit")],
      bookDefaultingToVeneer,
    );
    if (row === undefined)
      throw new Error("no row for the switched-off colour");
    return row;
  };

  it("offers the colour row the book default's woods, which is what the sheet reads today", () => {
    expect(rowOfTheColour().remaining).toEqual(VENEER.map(colour));
  });

  // The command reads a design with no `materialTierId` as melamine (`DEFAULT_MATERIAL_ID`), the sheet as the book's
  // default: a row of woods the command then refuses. Flips to an ordinary `it` once the two agree.
  it.fails("a colour row offers only options replaceColour accepts", () => {
    for (const option of rowOfTheColour().remaining) {
      if (option.kind !== "finish")
        throw new Error("a colour row offers colours");
      const result = replaceColour({
        design,
        from: paletteFinish("pal.antracit"),
        to: paletteFinishOf(option.finishId),
        occurredAt: OCCURRED_AT,
      });

      expect(result.ok).toBe(true);
    }
  });
});

describe("a vanished material stays one material row and opens no colour row", () => {
  it("lists the vanished tier alone, offering every active tier, though the design also wears a switched-off colour", () => {
    const design = wearingUnder(
      "pal.antracit",
      "veneer.nuc",
      "material.unobtainium",
    );

    const result = rows(design, [colour("pal.antracit"), colour("veneer.nuc")]);

    expect(result).toEqual([
      {
        item: material("material.unobtainium"),
        remaining: BOOK_WITH_EXOTIC.material.tiers.map(({ tierId }) =>
          material(tierId),
        ),
      },
    ]);
  });
});

describe("a colour that is not an item never opens a row", () => {
  it("a free colour at every level, under every palette entry switched off, names nothing under an undeclared material", () => {
    const design = withBodyOf(
      CUSTOMISABLE_PLACEMENT_ID,
      { finish: freeColourFinish("#336699") },
      withSettings({
        cabinetDepthMm: 600,
        materialTierId: EXOTIC,
        finish: freeColourFinish("#eceeeb"),
      }),
    );

    expect(rows(design, PALETTE_ENTRY_IDS.map(colour))).toEqual([]);
  });
});

describe("the sheet's offer, taken, resolves the refusal under a material no code declares", () => {
  const aSpec = fc.record({
    kitchen: fc.option(fc.constantFrom(...PALETTE_ENTRY_IDS), {
      nil: undefined,
    }),
    cabinet: fc.option(fc.constantFrom(...PALETTE_ENTRY_IDS), {
      nil: undefined,
    }),
    off: fc
      .tuple(
        ...[PAL, VENEER].map((palette) =>
          fc.shuffledSubarray([...palette], {
            minLength: 0,
            maxLength: palette.length - 1,
          }),
        ),
      )
      .map((palettes) => palettes.flat()),
  });

  it("replaces row after row by the first option offered until the price stops refusing, in at most one step per colour", () => {
    let walked = 0;
    fc.assert(
      fc.property(aSpec, ({ kitchen, cabinet, off }) => {
        const switchedOff = off.map(colour);
        const availability = availabilityOf(switchedOff);
        let design = wearingUnder(kitchen, cabinet);
        const owed = (current: Design) =>
          disabledItemsNamedBy(
            {
              design: current,
              catalog: CATALOG,
              book: BOOK_WITH_EXOTIC,
              chosen: current.settings,
            },
            availability,
          );
        const steps = owed(design).length;
        expect(steps).toBeLessThanOrEqual(2);

        for (let step = 0; step <= steps; step += 1) {
          const [row] = rows(design, switchedOff);
          if (row === undefined) break;
          const [option] = row.remaining;
          if (row.item.kind !== "finish" || option?.kind !== "finish") {
            throw new Error("a colour row offers colours");
          }
          const result = replaceColour({
            design,
            from: paletteFinishOf(row.item.finishId),
            to: paletteFinishOf(option.finishId),
            occurredAt: OCCURRED_AT,
          });
          if (!result.ok) throw new Error(`refused ${result.reason.code}`);
          expect(owed(result.design)).not.toContainEqual(row.item);
          design = result.design;
          walked += 1;
        }

        expect(rows(design, switchedOff)).toEqual([]);
        expect(priceUnder(availability, design, BOOK_WITH_EXOTIC).ok).toBe(
          true,
        );
      }),
      { numRuns: 300 },
    );
    expect(walked).toBeGreaterThan(100);
  });
});

describe("the items a design names are not changed by building the sheet or replacing a colour", () => {
  const design = withBodyOf(
    CUSTOMISABLE_PLACEMENT_ID,
    { finish: paletteFinish("veneer.nuc"), handle: "black" },
    withSettings({
      cabinetDepthMm: 600,
      materialTierId: EXOTIC,
      finish: paletteFinish("pal.antracit"),
      handle: "steel",
    }),
  );
  const query = {
    design,
    catalog: CATALOG,
    book: BOOK_WITH_EXOTIC,
    chosen: design.settings,
  };

  it("itemsNamedBy names the material, the colours and the handles as stored, none of what a row would offer", () => {
    const named = itemsNamedBy(query);

    expect(named).toContainEqual(material(EXOTIC));
    expect(named).toContainEqual(colour("pal.antracit"));
    expect(named).toContainEqual(colour("veneer.nuc"));
    expect(named).toContainEqual(handle("steel"));
    expect(named).toContainEqual(handle("black"));
    expect(named).not.toContainEqual(colour("pal.alb"));
    expect(named).not.toContainEqual(colour("veneer.stejar"));
    expect(named).not.toContainEqual(handle("push"));
  });

  it("is the same answer after the sheet is built and a replacement made over a copy: both are pure", () => {
    const before = itemsNamedBy(query);

    rows(design, [colour("pal.antracit"), colour("veneer.nuc")]);
    const replaced = replaceColour({
      design,
      from: paletteFinish("pal.antracit"),
      to: paletteFinish("pal.alb"),
      occurredAt: OCCURRED_AT,
    });

    expect(itemsNamedBy(query)).toEqual(before);
    if (!replaced.ok) throw new Error("refused");
    const after = itemsNamedBy({
      ...query,
      design: replaced.design,
      chosen: replaced.design.settings,
    });
    expect(after).toContainEqual(colour("pal.alb"));
    expect(after).not.toContainEqual(colour("pal.antracit"));
    expect(after).toContainEqual(colour("veneer.nuc"));
  });
});
