// **Adversarial QA for wave 6Q-a's offer query.** Everything here tries to make
// `materialOffersFinish` answer wrongly while `materials.offer.test.ts` stays green.
//
// Two devices, both deliberately different from the shipped suite's:
//
//   1. **A truth table keyed by the declared shape, written out here and imported from nowhere.**
//      The shipped file writes its expectation per `MaterialId`; this one writes it per
//      `ColourControl.shape`, so the two would not both be wrong in the same direction if the
//      declaration moved a material from one control to another.
//   2. **Synthetic materials the declaration does not contain.** The shipped suite can only see the
//      three shipped materials, on which "reads the shape" and "counts the entries" are the same
//      function — measured: a query rewritten to branch on `paletteEntriesOf(material).length === 0`
//      passes the whole shipped file. The synthetics below separate them, which is what makes
//      acceptance criterion 1's *"never an entry count"* falsifiable at all.
import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  FinishSchema,
  FREE_COLOUR_PATTERN,
  freeColourFinish,
  MATERIALS,
  materialById,
  materialOffersFinish,
  PALETTE_ENTRY_IDS,
  paletteEntriesOf,
  paletteFinish,
  sameFinish,
  type ColourControl,
  type Finish,
  type Material,
  type MaterialId,
  type PaletteEntryId,
} from "../src/materials.js";

/** **The offer, written out per entry id and per material, independently of the shipped table.**
 *  Read off ADR 0078 decision 1 and the products themselves: PAL's six printed decors are PAL's,
 *  veneer's two woods are veneer's, and painted MDF has no board finish to offer.
 *
 *  Stated as what each material **offers** — the shipped file states what each material **misses** —
 *  so a hand-edit that drifts one table cannot silently drift the other into agreement. */
const OFFERED_ENTRY_IDS: Readonly<
  Record<MaterialId, readonly PaletteEntryId[]>
> = {
  "material.melamine": [
    "pal.alb",
    "pal.stejar-bardolino",
    "pal.stejar-halifax",
    "pal.antracit",
    "pal.gri-havanna",
    "pal.nuc-warmia",
  ],
  "material.painted-mdf": [],
  "material.veneer": ["veneer.stejar", "veneer.nuc"],
};

/** The same rule again, keyed on the **control shape** rather than on the material — the axis
 *  ADR 0078 decision 1's table is actually written on. */
const SHAPE_OFFERS_FREE_COLOUR: Readonly<
  Record<ColourControl["shape"], boolean>
> = {
  "decor-list": false,
  "ral-picker": true,
  "wood-swatches": false,
};

const EXPECTED_TOTAL_OFFERS = 8;
const EXPECTED_TOTAL_REFUSALS = 16;

/** Hex digits at both case boundaries and both value boundaries, plus the two the declaration
 *  itself uses. `#eceeeb` is MDF's default and `#8d9a84` is *Salvie*, the value the panel still
 *  writes. */
const BOUNDARY_FREE_COLOURS = [
  "#000000",
  "#ffffff",
  "#FFFFFF",
  "#FfFfFf",
  "#ABCDEF",
  "#abcdef",
  "#AbCdEf",
  "#012345",
  "#eceeeb",
  "#8d9a84",
] as const;

function everyPaletteFinish(): readonly Finish[] {
  return PALETTE_ENTRY_IDS.map((entryId) => paletteFinish(entryId));
}

/** A material with the given control, standing on a real declared material's id so nothing here
 *  invents a `MaterialId` the union does not carry. The control is the only thing under test. */
function materialWithControl(control: ColourControl): Material {
  return { ...materialById("material.melamine"), colourControl: control };
}

describe("the pair space this file sweeps is the whole one, before anything is asserted", () => {
  it("carries three materials and eight entry ids, so a shrunken declaration fails loudly", () => {
    expect(MATERIALS).toHaveLength(3);
    expect(PALETTE_ENTRY_IDS).toHaveLength(8);
    expect(everyPaletteFinish()).toHaveLength(8);
  });

  it("names every declared material in the expected-offer table and nothing else", () => {
    expect(Object.keys(OFFERED_ENTRY_IDS).sort()).toEqual(
      MATERIALS.map((material) => material.materialId).sort(),
    );
  });

  it("names every control shape the declaration can carry", () => {
    expect(Object.keys(SHAPE_OFFERS_FREE_COLOUR).sort()).toEqual(
      [...new Set(MATERIALS.map((m) => m.colourControl.shape))].sort(),
    );
  });
});

describe("materialOffersFinish over the exhaustive palette half", () => {
  it("offers exactly the entry ids this file names, material by material", () => {
    for (const material of MATERIALS) {
      const offered = everyPaletteFinish()
        .filter((finish) => materialOffersFinish(material, finish))
        .map((finish) =>
          finish.kind === "palette-entry" ? finish.entryId : "free",
        );

      expect([...offered].sort()).toEqual(
        [...OFFERED_ENTRY_IDS[material.materialId]].sort(),
      );
    }
  });

  it("splits twenty-four pairs eight/sixteen, with both halves non-empty", () => {
    const answers = MATERIALS.flatMap((material) =>
      everyPaletteFinish().map((finish) =>
        materialOffersFinish(material, finish),
      ),
    );

    expect(answers).toHaveLength(24);
    expect(answers.filter(Boolean)).toHaveLength(EXPECTED_TOTAL_OFFERS);
    expect(answers.filter((one) => !one)).toHaveLength(EXPECTED_TOTAL_REFUSALS);
  });

  it("offers an entry if and only if that entry is one the material declares", () => {
    // The one place this file does read `paletteEntriesOf` — as a cross-check against the
    // hand-written table above, not as the source of it, so the two must agree with each other and
    // with the query for the sweep to pass.
    for (const material of MATERIALS) {
      for (const finish of everyPaletteFinish()) {
        const declared = paletteEntriesOf(material).some((entry) =>
          sameFinish(paletteFinish(entry.entryId), finish),
        );
        expect(materialOffersFinish(material, finish)).toBe(declared);
      }
    }
  });
});

describe("materialOffersFinish over the free-colour half", () => {
  it.each(BOUNDARY_FREE_COLOURS)(
    "answers %s by the control's shape, at both case and value boundaries",
    (value) => {
      for (const material of MATERIALS) {
        expect(materialOffersFinish(material, freeColourFinish(value))).toBe(
          SHAPE_OFFERS_FREE_COLOUR[material.colourControl.shape],
        );
      }
    },
  );

  it("holds over every colour the schema admits, swept against the declared pattern", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...MATERIALS),
        fc.stringMatching(FREE_COLOUR_PATTERN),
        (material, value) => {
          // The generator is held to the schema rather than trusted: an unanchored pattern would
          // draw values `FinishSchema` refuses and the sweep would be exercising nothing real.
          expect(
            FinishSchema.safeParse({ kind: "free-colour", value }).success,
          ).toBe(true);
          expect(materialOffersFinish(material, freeColourFinish(value))).toBe(
            SHAPE_OFFERS_FREE_COLOUR[material.colourControl.shape],
          );
        },
      ),
      { numRuns: 500 },
    );
  });

  it("draws both hex cases and every hex digit, so the case claim is not asserted over nothing", () => {
    const drawn = fc.sample(fc.stringMatching(FREE_COLOUR_PATTERN), 2_000);
    const digits = new Set(
      drawn.flatMap((value) => value.slice(1).match(/./gu) ?? []),
    );

    expect(drawn.some((value) => /[A-F]/.test(value.slice(1)))).toBe(true);
    expect(drawn.some((value) => /[a-f]/.test(value.slice(1)))).toBe(true);
    expect([...digits].sort().join("")).toBe("0123456789ABCDEFabcdef");
  });

  it("is anchored at both ends, and refuses the four shapes an unanchored one would admit", () => {
    // The classic version of this bug: an unanchored pattern makes the generator draw values with a
    // prefix or a suffix, `FinishSchema` accept them, and the whole free-colour half of the offer
    // become a claim about strings no control can produce. **A trailing newline is the one JavaScript
    // itself would let through if `$` were ever paired with the `m` flag.**
    for (const rejected of [
      "x#abcdef",
      "#abcdefx",
      "#abcdef\n",
      "\n#abcdef",
      "#abcde",
      "#abcdef0",
      "abcdef",
      "#abcdeg",
      "",
    ]) {
      expect(FREE_COLOUR_PATTERN.test(rejected)).toBe(false);
      expect(
        FinishSchema.safeParse({ kind: "free-colour", value: rejected })
          .success,
      ).toBe(false);
      expect(() => freeColourFinish(rejected)).toThrow();
    }
  });

  it("carries no global flag, so testing the same value twice answers the same twice", () => {
    // A `g` regex keeps `lastIndex` between `.test()` calls, and this one object is shared by
    // `freeColourFinish`, the schema and every generator that draws against it — alternating answers
    // would make the offer depend on how many colours were validated before it.
    expect(FREE_COLOUR_PATTERN.flags).toBe("");
    expect(FREE_COLOUR_PATTERN.test("#abcdef")).toBe(true);
    expect(FREE_COLOUR_PATTERN.test("#abcdef")).toBe(true);
  });

  it("never offers a free colour to a material that declares any entry at all", () => {
    for (const material of MATERIALS) {
      if (paletteEntriesOf(material).length === 0) continue;
      for (const value of BOUNDARY_FREE_COLOURS) {
        expect(materialOffersFinish(material, freeColourFinish(value))).toBe(
          false,
        );
      }
    }
  });
});

describe("the criterion the three shipped materials cannot separate: shape, never entry count", () => {
  // **Measured, not supposed.** Rewriting the query to branch on
  // `paletteEntriesOf(material).length === 0` instead of on `shape === "ral-picker"` leaves every
  // test in `materials.offer.test.ts` green, because the only material with no entries today is the
  // only picker today. The four synthetics below are the whole of the difference.
  it("refuses a free colour to an empty decor list, which an entry count would offer", () => {
    const emptyDecorList = materialWithControl({
      shape: "decor-list",
      entries: [],
    });

    expect(
      materialOffersFinish(emptyDecorList, freeColourFinish("#8d9a84")),
    ).toBe(false);
    expect(materialOffersFinish(emptyDecorList, paletteFinish("pal.alb"))).toBe(
      false,
    );
  });

  it("refuses a free colour to an empty swatch set for the same reason", () => {
    const emptySwatches = materialWithControl({
      shape: "wood-swatches",
      entries: [],
    });

    expect(
      materialOffersFinish(emptySwatches, freeColourFinish("#eceeeb")),
    ).toBe(false);
  });

  it("still refuses every palette entry to a picker, which carries no entries to count", () => {
    const picker = materialWithControl({ shape: "ral-picker" });

    for (const finish of everyPaletteFinish()) {
      expect(materialOffersFinish(picker, finish)).toBe(false);
    }
    expect(materialOffersFinish(picker, freeColourFinish("#000000"))).toBe(
      true,
    );
  });

  it("answers a one-entry decor list and a one-entry swatch set identically", () => {
    // ADR 0071 decision 3's own words — two swatches and a list of two are the same array and
    // different products — so the array may not be what decides.
    const entry = paletteEntriesOf(materialById("material.melamine"))[0];
    expect(entry).toBeDefined();
    if (!entry) return;

    const asList = materialWithControl({
      shape: "decor-list",
      entries: [entry],
    });
    const asSwatches = materialWithControl({
      shape: "wood-swatches",
      entries: [entry],
    });

    for (const finish of [
      ...everyPaletteFinish(),
      freeColourFinish("#8d9a84"),
    ]) {
      expect(materialOffersFinish(asList, finish)).toBe(
        materialOffersFinish(asSwatches, finish),
      );
    }
  });
});

describe("the query is a query", () => {
  it("returns the same answer every time and mutates neither argument", () => {
    for (const material of MATERIALS) {
      const before = JSON.stringify(material);
      for (const finish of [
        ...everyPaletteFinish(),
        freeColourFinish("#abcdef"),
      ]) {
        const finishBefore = JSON.stringify(finish);
        const first = materialOffersFinish(material, finish);
        expect(materialOffersFinish(material, finish)).toBe(first);
        expect(JSON.stringify(finish)).toBe(finishBefore);
      }
      expect(JSON.stringify(material)).toBe(before);
    }
  });

  it("offers every material its own declared default and no other material's", () => {
    for (const material of MATERIALS) {
      expect(materialOffersFinish(material, material.defaultFinish)).toBe(true);

      for (const other of MATERIALS) {
        if (other.materialId === material.materialId) continue;
        // Every default a material does not own is refused — except that MDF's default is a free
        // colour and every free colour is MDF's, which is the asymmetry the table encodes.
        expect(materialOffersFinish(material, other.defaultFinish)).toBe(
          other.defaultFinish.kind === "free-colour" &&
            material.colourControl.shape === "ral-picker",
        );
      }
    }
  });

  it("answers true only for finishes the schema itself admits", () => {
    for (const material of MATERIALS) {
      for (const finish of [
        ...everyPaletteFinish(),
        freeColourFinish("#000000"),
      ]) {
        if (!materialOffersFinish(material, finish)) continue;
        expect(FinishSchema.safeParse(finish).success).toBe(true);
      }
    }
  });
});
