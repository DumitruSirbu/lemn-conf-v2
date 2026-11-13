// A switched-off colour under a material no code declares: the row offers the active entries of the palette that holds
// the colour, in palette order, and the sheet and the price's refusal agree on the items.
import { describe, expect, it } from "vitest";

import type { Design } from "../../src/design.js";
import {
  materialById,
  MATERIALS,
  paletteEntriesOf,
  paletteFinish,
  PALETTE_ENTRY_IDS,
  type PaletteEntryId,
} from "../../src/materials.js";
import {
  NoReplacementOptionError,
  replacementsRequired,
} from "../../src/queries/replacements-required.js";
import {
  availabilityOf,
  BOOK,
  CATALOG,
  colour,
  priceUnder,
  withSettings,
} from "../support/availability-kitchens.js";
import {
  bookHoldingMaterial,
  UNDECLARED_MATERIAL_ID,
  wearing,
} from "../support/replacement-kitchens.js";

const CREATED_MATERIAL_ID = UNDECLARED_MATERIAL_ID;
const BOOK_HOLDING_IT = bookHoldingMaterial(CREATED_MATERIAL_ID);

const PAL_ENTRY_IDS = paletteEntriesOf(materialById("material.melamine")).map(
  ({ entryId }) => entryId,
);

function wearingColour(entryId: PaletteEntryId): Design {
  return wearing(entryId, undefined, CREATED_MATERIAL_ID);
}

function rowsUnder(design: Design, switchedOff: readonly string[]) {
  return replacementsRequired({
    design,
    book: BOOK_HOLDING_IT,
    availability: availabilityOf(switchedOff.map(colour)),
    catalog: CATALOG,
  });
}

describe("a switched-off colour under a held material no code declares", () => {
  it("is offered its own palette's active entries, in palette order, without throwing", () => {
    const [row] = rowsUnder(wearingColour("pal.antracit"), ["pal.antracit"]);

    expect(row?.item).toEqual(colour("pal.antracit"));
    expect(row?.remaining).toEqual(
      PAL_ENTRY_IDS.filter((entryId) => entryId !== "pal.antracit").map(colour),
    );
  });

  it("is offered the palette of the colour it wears, whichever material owns that colour", () => {
    const [row] = rowsUnder(wearingColour("veneer.nuc"), ["veneer.nuc"]);

    expect(row?.remaining).toEqual([colour("veneer.stejar")]);
  });

  it("never offers another switched-off colour of that palette", () => {
    const [row] = rowsUnder(wearingColour("pal.antracit"), [
      "pal.antracit",
      "pal.alb",
      "pal.nuc-warmia",
    ]);

    expect(row?.remaining).toEqual(
      ["pal.stejar-bardolino", "pal.stejar-halifax", "pal.gri-havanna"].map(
        colour,
      ),
    );
  });

  it("names the same items as the refusal the price gives, so the sheet and the refusal cannot drift", () => {
    const design = wearingColour("pal.antracit");
    const availability = availabilityOf([colour("pal.antracit")]);

    const refused = priceUnder(availability, design, BOOK_HOLDING_IT);

    if (refused.ok || refused.failure.code !== "REPLACEMENT_REQUIRED") {
      throw new Error("expected REPLACEMENT_REQUIRED");
    }
    expect(rowsUnder(design, ["pal.antracit"]).map(({ item }) => item)).toEqual(
      refused.failure.items,
    );
  });

  it("throws NoReplacementOptionError only when that palette has no active entry left", () => {
    expect(() =>
      rowsUnder(wearingColour("pal.antracit"), PAL_ENTRY_IDS.slice(0, -1)),
    ).not.toThrow();
    expect(() =>
      rowsUnder(wearingColour("pal.antracit"), PAL_ENTRY_IDS),
    ).toThrow(NoReplacementOptionError);
  });
});

describe("a switched-off colour under a declared material keeps that material's palette", () => {
  it("offers the design's own material's entries, as before", () => {
    const design = withSettings({
      cabinetDepthMm: 600,
      materialTierId: "material.veneer",
      finish: paletteFinish("veneer.nuc"),
    });

    const [row] = replacementsRequired({
      design,
      book: BOOK,
      availability: availabilityOf([colour("veneer.nuc")]),
      catalog: CATALOG,
    });

    expect(row?.remaining).toEqual([colour("veneer.stejar")]);
  });

  it("gives every declared palette id exactly one owning material, which the undeclared lookup relies on", () => {
    const owners = PALETTE_ENTRY_IDS.map(
      (entryId) =>
        MATERIALS.filter((material) =>
          paletteEntriesOf(material).some((entry) => entry.entryId === entryId),
        ).length,
    );

    expect(owners).toEqual(PALETTE_ENTRY_IDS.map(() => 1));
  });
});
