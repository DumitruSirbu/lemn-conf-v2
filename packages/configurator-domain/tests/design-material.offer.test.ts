// `designOffersFinish`: the one guard `setFinish` and `setGlobalFinish` both stand behind. Two questions
// in one answer — is the value a finish at all (`FinishSchema`), and does the design's material offer it
// or name nothing declared (ADR 0078 decisions 3 and 6). Every expected answer below is a literal.
import { describe, expect, it } from "vitest";

import { designOffersFinish } from "../src/design-material.js";
import { KITCHEN_L_DESIGN } from "../src/fixtures/kitchen-l-design.js";
import {
  FinishSchema,
  type Finish,
  type PaletteEntryId,
} from "../src/materials.js";
import {
  FINISHES_THE_SCHEMA_REFUSES,
  kitchenMadeOf,
  REFUSED_FINISH_CASES,
  UNDECLARED_MATERIAL_ID,
} from "./support/finishes-the-schema-refuses.js";

function colour(value: string): Finish {
  return { kind: "free-colour", value };
}

function entry(entryId: PaletteEntryId): Finish {
  return { kind: "palette-entry", entryId };
}

describe("designOffersFinish over values the schema admits", () => {
  it.each([
    ["PAL", "material.melamine", "its own decor", entry("pal.antracit"), true],
    ["PAL", "material.melamine", "a veneer wood", entry("veneer.nuc"), false],
    ["PAL", "material.melamine", "a free colour", colour("#b8c4a1"), false],
    ["MDF", "material.painted-mdf", "a free colour", colour("#b8c4a1"), true],
    ["MDF", "material.painted-mdf", "a PAL decor", entry("pal.alb"), false],
    ["veneer", "material.veneer", "its own wood", entry("veneer.nuc"), true],
    ["veneer", "material.veneer", "a PAL decor", entry("pal.alb"), false],
    ["veneer", "material.veneer", "a free colour", colour("#b8c4a1"), false],
    [
      "an undeclared material",
      UNDECLARED_MATERIAL_ID,
      "a free colour",
      colour("#b8c4a1"),
      true,
    ],
    [
      "an undeclared material",
      UNDECLARED_MATERIAL_ID,
      "a PAL decor",
      entry("pal.alb"),
      true,
    ],
    [
      "an undeclared material",
      UNDECLARED_MATERIAL_ID,
      "a veneer wood",
      entry("veneer.nuc"),
      true,
    ],
  ] as const)(
    "on %s (%s), %s answers %j",
    (_material, materialId, _finishName, finish, expected) => {
      expect(designOffersFinish(kitchenMadeOf(materialId), finish)).toBe(
        expected,
      );
    },
  );

  it("reads a design with no material as PAL", () => {
    expect(KITCHEN_L_DESIGN.settings?.materialTierId).toBeUndefined();

    expect(designOffersFinish(KITCHEN_L_DESIGN, entry("pal.antracit"))).toBe(
      true,
    );
    expect(designOffersFinish(KITCHEN_L_DESIGN, colour("#b8c4a1"))).toBe(false);
  });
});

describe("designOffersFinish over values the schema refuses", () => {
  it.each(FINISHES_THE_SCHEMA_REFUSES)(
    "the support table's %s really is a value FinishSchema refuses",
    (_, finish) => {
      expect(FinishSchema.safeParse(finish).success).toBe(false);
    },
  );

  it.each(REFUSED_FINISH_CASES)(
    "refuses %s on %s",
    (_finishName, _materialName, materialId, finish) => {
      expect(designOffersFinish(kitchenMadeOf(materialId), finish)).toBe(false);
    },
  );

  it("sweeps ten refused values over three materials, so no arm is empty", () => {
    expect(FINISHES_THE_SCHEMA_REFUSES).toHaveLength(10);
    expect(REFUSED_FINISH_CASES).toHaveLength(30);
  });
});
