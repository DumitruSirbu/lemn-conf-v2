// The declaration wave 6P adds, held to the four things ADR 0071 says about it: three materials in
// price order, a different control shape per material, a palette entry that renders a human name and
// carries its supplier code as internal provenance, and a finish whose **kind is declared** rather
// than read off the string.
import { describe, expect, it } from "vitest";

import {
  DECOR_CODE_CONFIDENCES,
  DEFAULT_FINISH,
  DEFAULT_MATERIAL_ID,
  FinishSchema,
  freeColourFinish,
  MalformedColourValueError,
  MATERIAL_IDS,
  MATERIALS,
  materialById,
  PALETTE_ENTRIES,
  PALETTE_ENTRY_IDS,
  paletteEntriesOf,
  paletteFinish,
  sameFinish,
  UnknownMaterialError,
} from "../src/materials.js";

describe("three materials, price-ordered, each with its own control shape", () => {
  it("declares exactly PAL, MDF and veneer, in that order", () => {
    expect(MATERIAL_IDS).toEqual([
      "material.melamine",
      "material.painted-mdf",
      "material.veneer",
    ]);
    expect(MATERIALS.map((material) => material.materialId)).toEqual([
      ...MATERIAL_IDS,
    ]);
  });

  it("gives each material a different control shape, not one control with three lists", () => {
    expect(MATERIALS.map((material) => material.colourControl.shape)).toEqual([
      "decor-list",
      "ral-picker",
      "wood-swatches",
    ]);
  });

  it("offers no entries at all for the material whose control is a picker", () => {
    // The Special Case rather than a null: MDF's answer to "what are your decors" is *none*, and no
    // caller should need a null check to hear it.
    expect(paletteEntriesOf(materialById("material.painted-mdf"))).toEqual([]);
  });

  it("defaults to PAL and to Alb", () => {
    expect(DEFAULT_MATERIAL_ID).toBe("material.melamine");
    expect(DEFAULT_FINISH).toEqual(paletteFinish("pal.alb"));
  });

  it("resolves each material's default finish to that material's own palette", () => {
    expect(materialById("material.veneer").defaultFinish).toEqual(
      paletteFinish("veneer.stejar"),
    );
    expect(materialById("material.painted-mdf").defaultFinish.kind).toBe(
      "free-colour",
    );
  });

  it("refuses a tier id no material declares", () => {
    expect(() => materialById("material.laminate")).toThrow(
      UnknownMaterialError,
    );
  });
});

describe("a palette entry names a colour a customer can say out loud", () => {
  it("declares every entry exactly once, and every declared id", () => {
    const declared = PALETTE_ENTRIES.map((entry) => entry.entryId);

    expect(new Set(declared).size).toBe(declared.length);
    expect([...declared].sort()).toEqual([...PALETTE_ENTRY_IDS].sort());
  });

  it("offers PAL's six decors and veneer's two woods", () => {
    expect(paletteEntriesOf(materialById("material.melamine"))).toHaveLength(6);
    expect(paletteEntriesOf(materialById("material.veneer"))).toHaveLength(2);
  });

  it("declares an id and a provenance, and no word a surface could print", () => {
    // The owner's ruling — the palette is a reference, not a specification, so what a customer
    // reads is *Gri Havanna* and never *U755 ST9* — is now kept where the word is: the `finish.*`
    // catalogue leaves the app resolves `entryId` through, swept in both locales by
    // `apps/web/tests/i18n/palette-names.test.ts`. What this asserts is that no Romanian came
    // back here, which is the failure that put a Romanian decor name on a `/ru` screen.
    for (const entry of PALETTE_ENTRIES) {
      expect(Object.keys(entry).sort()).toEqual(["entryId", "supplierCode"]);
    }
  });

  it("states a code's verification for every entry that has a code", () => {
    // A required field per entry, so a seventh decor cannot be added without saying which it is.
    for (const entry of PALETTE_ENTRIES) {
      if (entry.supplierCode.kind === "none") continue;
      expect(DECOR_CODE_CONFIDENCES).toContain(entry.supplierCode.confidence);
    }
  });

  it("marks the two codes ADR 0071 could not confirm, and only those two", () => {
    // The two states must never be presented as equally settled: *Alb* and *Antracit* were not read
    // off a supplier stock list, and the other four were, on 2026-09-04.
    const unverified = PALETTE_ENTRIES.filter(
      (entry) =>
        entry.supplierCode.kind === "catalogue" &&
        entry.supplierCode.confidence === "unverified",
    ).map((entry) => entry.entryId);

    expect(unverified).toEqual(["pal.alb", "pal.antracit"]);
  });

  it("declares a natural wood as having no manufacturer's code at all", () => {
    // Stated rather than left absent: `undefined` would read as "nobody has filled this in yet",
    // which is the one distinction this field exists to keep.
    for (const wood of paletteEntriesOf(materialById("material.veneer"))) {
      expect(wood.supplierCode.kind).toBe("none");
    }
  });
});

describe("a finish is two kinds of thing and the kind is declared", () => {
  it("accepts a palette entry and a free colour", () => {
    expect(FinishSchema.safeParse(paletteFinish("pal.antracit")).success).toBe(
      true,
    );
    expect(FinishSchema.safeParse(freeColourFinish("#b8c4a1")).success).toBe(
      true,
    );
  });

  it("refuses a value whose kind is missing, however well-formed the rest is", () => {
    expect(FinishSchema.safeParse({ entryId: "pal.alb" }).success).toBe(false);
    expect(FinishSchema.safeParse({ value: "#b8c4a1" }).success).toBe(false);
    expect(FinishSchema.safeParse("oak").success).toBe(false);
  });

  it("never reads the kind off the string's shape", () => {
    // A value that *looks* like a hex code is not thereby a free colour, and a palette id is not
    // recognised by failing to parse as one. Both of these are refused because the kind says one
    // thing and the payload says another.
    expect(
      FinishSchema.safeParse({ kind: "palette-entry", entryId: "#b8c4a1" })
        .success,
    ).toBe(false);
    expect(
      FinishSchema.safeParse({ kind: "free-colour", value: "pal.alb" }).success,
    ).toBe(false);
  });

  it("admits no third kind", () => {
    expect(
      FinishSchema.safeParse({ kind: "texture", entryId: "pal.alb" }).success,
    ).toBe(false);
  });

  it("refuses a malformed colour rather than defaulting or nudging it", () => {
    for (const malformed of [
      "b8c4a1",
      "#b8c4a",
      "#b8c4a1b8c4a1",
      "#gggggg",
      "rgb(1,2,3)",
      "",
    ]) {
      expect(
        FinishSchema.safeParse({ kind: "free-colour", value: malformed })
          .success,
      ).toBe(false);
      expect(() => freeColourFinish(malformed)).toThrow(
        MalformedColourValueError,
      );
    }
  });

  it("refuses a palette id no material offers", () => {
    expect(
      FinishSchema.safeParse({ kind: "palette-entry", entryId: "pal.roz" })
        .success,
    ).toBe(false);
  });

  it("compares two finishes by value and never across kinds", () => {
    expect(sameFinish(paletteFinish("pal.alb"), paletteFinish("pal.alb"))).toBe(
      true,
    );
    expect(
      sameFinish(paletteFinish("pal.alb"), paletteFinish("veneer.nuc")),
    ).toBe(false);
    expect(
      sameFinish(freeColourFinish("#b8c4a1"), freeColourFinish("#b8c4a1")),
    ).toBe(true);
    expect(
      sameFinish(paletteFinish("pal.alb"), freeColourFinish("#b8c4a1")),
    ).toBe(false);
  });
});
