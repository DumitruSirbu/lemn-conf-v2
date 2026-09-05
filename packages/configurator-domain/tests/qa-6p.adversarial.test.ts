// **Wave 6P, attacked rather than confirmed.** Four things the wave's own suite states but does not
// try to break, and one it does not state at all.
//
// 1. **The rewrite runs pre-parse, on `unknown`.** Its stated reason is sound — parsing first would
//    refuse the very documents the arm exists to rescue — but it means a spread and a property read
//    execute on input nothing has validated. A hostile document must leave by the same gate every
//    other malformed one leaves by, carrying nothing out with it.
// 2. **The owner's ruling of 2026-09-04 is about a price, not only a colour.** The wave asserts the
//    finish a legacy value becomes; this asserts the amount it is billed at, which is the half the
//    ruling was actually taken on.
// 3. **The fixed point, at every value and not only the two the wave's fixture carries.**
// 4. **The free colour bound is one gate, and both seams reach it.**
// 5. **A body that cannot wear a finish, for a value written after the wave and not only before it.**
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Design } from "../src/design.js";
import { DesignSchema } from "../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import {
  DEFAULT_FINISH,
  FREE_COLOUR_PATTERN,
  FinishSchema,
  LEGACY_ENUM_FINISH_NAMES,
  MATERIAL_IDS,
  PALETTE_ENTRIES,
  freeColourFinish,
  paletteFinish,
  type Finish,
} from "../src/materials.js";
import {
  CURRENT_SCHEMA_VERSION,
  migrateDesign,
} from "../src/migrate-design.js";
import { priceDesign } from "../src/pricing/price-design.js";
import { SAMPLE_PRICE_BOOK } from "../src/pricing/sample-price-book.js";
import { InvalidDesignError } from "../src/repository.js";

/** Every version arm this build still carries a document forward from, plus the one it writes.
 *
 *  **4 is the arm wave 6J-a wrote and 6P inherited** — a document that already carries a cabinet
 *  depth and may still wear a string finish. It was missing here and in the wave's own suite, so
 *  re-keying the raw map's `4` to `3` left both green while turning every 6J-a row into a dead
 *  link. */
const EVERY_VERSION_ARM = [1, 2, 3, 4, CURRENT_SCHEMA_VERSION] as const;

/** A finishable seeded body, and the three the catalogue declares `canFinish: false` on. */
const FINISHABLE_ID = "p0";
const UNFINISHABLE_IDS = ["p7", "p12", "p13"] as const;

function storedWith(
  finishByPlacementId: Readonly<Record<string, unknown>>,
  materialTierId?: string,
) {
  return JSON.parse(
    JSON.stringify({
      ...KITCHEN_L_DESIGN,
      settings:
        materialTierId === undefined
          ? KITCHEN_L_DESIGN.settings
          : { ...KITCHEN_L_DESIGN.settings, materialTierId },
      placements: KITCHEN_L_DESIGN.placements.map((placement) => {
        const finish = finishByPlacementId[placement.id];
        return finish === undefined
          ? placement
          : { ...placement, body: { ...placement.body, finish } };
      }),
    }),
  ) as unknown;
}

function finishOf(design: Design, placementId: string) {
  return design.placements.find((placement) => placement.id === placementId)
    ?.body.finish;
}

function reserialised(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

describe("the pre-parse rewrite meets a document nothing has validated", () => {
  /** Every shape the rewrite reaches before anything has judged it: a `finish` that is not a
   *  string, a `placements` that is not a list, a body that is not an object, and the two keys a
   *  spread is asked about whenever one runs on parsed JSON. */
  const HOSTILE_DOCUMENTS: readonly (readonly [string, unknown])[] = [
    ["a null body", null],
    ["a string body", "not a design"],
    ["a number body", 7],
    ["an array body", []],
    ["a document with no placements at all", {}],
    ["placements as an object with numeric keys", { placements: { 0: {} } }],
    ["placements holding nulls", { ...KITCHEN_L_DESIGN, placements: [null] }],
    ["placements holding numbers", { ...KITCHEN_L_DESIGN, placements: [1, 2] }],
    ["placements holding arrays", { ...KITCHEN_L_DESIGN, placements: [[]] }],
    ["a null body on a placement", storedWith({ [FINISHABLE_ID]: null })],
    ["a finish that is a number", storedWith({ [FINISHABLE_ID]: 7 })],
    ["a finish that is an array", storedWith({ [FINISHABLE_ID]: ["sage"] })],
    ["a finish that is a bare object", storedWith({ [FINISHABLE_ID]: {} })],
    [
      "a finish whose colour is malformed",
      storedWith({
        [FINISHABLE_ID]: { kind: "free-colour", value: "#GGGGGG" },
      }),
    ],
    [
      "a finish naming a palette entry no material offers",
      storedWith({
        [FINISHABLE_ID]: { kind: "palette-entry", entryId: "pal.roz" },
      }),
    ],
    [
      "a __proto__ key on the document",
      JSON.parse('{"__proto__":{"pollutedByWave6P":1},"placements":[]}'),
    ],
    [
      "a __proto__ key on a placement",
      JSON.parse(
        '{"placements":[{"__proto__":{"pollutedByWave6P":1},"id":"p0","body":{"finish":"sage"}}]}',
      ),
    ],
    [
      "a __proto__ key on a body carrying a legacy finish",
      JSON.parse(
        '{"placements":[{"id":"p0","body":{"__proto__":{"pollutedByWave6P":1},"finish":"sage"}}]}',
      ),
    ],
    [
      "a constructor.prototype shape on a body carrying a legacy finish",
      JSON.parse(
        '{"placements":[{"id":"p0","body":{"constructor":{"prototype":{"pollutedByWave6P":1}},"finish":"oak"}}]}',
      ),
    ],
    [
      "a deeply nested junk document",
      JSON.parse(
        `{"placements":[{"id":"p0","body":{"finish":"sage","junk":${"[".repeat(60)}${"]".repeat(60)}}}]}`,
      ),
    ],
  ];

  it.each(HOSTILE_DOCUMENTS)(
    "refuses %s at the schema and never anywhere else",
    (_name, raw) => {
      let thrown: unknown;
      try {
        migrateDesign(3, raw, KITCHEN_L_BODY_CATALOG);
      } catch (error) {
        thrown = error;
      }

      // A refusal is fine and is the point; an unhandled `TypeError` from reading a property off
      // something that is not an object is the failure this sweep is for.
      expect(thrown).toBeInstanceOf(InvalidDesignError);
    },
  );

  it.each(HOSTILE_DOCUMENTS)("does not mutate %s", (_name, raw) => {
    const before = JSON.stringify(raw);
    try {
      migrateDesign(3, raw, KITCHEN_L_BODY_CATALOG);
    } catch {
      // The refusal is asserted above; this case is only about what the input looks like after.
    }

    expect(JSON.stringify(raw)).toBe(before);
  });

  it("pollutes no prototype, however the document spells the key", () => {
    for (const [, raw] of HOSTILE_DOCUMENTS) {
      try {
        migrateDesign(3, raw, KITCHEN_L_BODY_CATALOG);
      } catch {
        // Refusals are the sweep above's business.
      }
    }

    expect(({} as Record<string, unknown>)["pollutedByWave6P"]).toBeUndefined();
    expect(
      ([] as unknown as Record<string, unknown>)["pollutedByWave6P"],
    ).toBeUndefined();
  });

  it.each(LEGACY_ENUM_FINISH_NAMES)(
    "produces a document that still satisfies DesignSchema after carrying %s forward",
    (name) => {
      const loaded = migrateDesign(
        3,
        storedWith({ [FINISHABLE_ID]: name }),
        KITCHEN_L_BODY_CATALOG,
      );

      expect(DesignSchema.safeParse(loaded).success).toBe(true);
    },
  );

  it("hands out no reference to the declared default a caller could mutate", () => {
    // Every rescued body is given `DEFAULT_FINISH`, which is one module-level object. If the
    // document carried that object out by reference, editing one cabinet's finish would edit the
    // declaration every other document is migrated against.
    const loaded = migrateDesign(
      3,
      storedWith({ p0: "white", p1: "clay", p2: "sage" }),
      KITCHEN_L_BODY_CATALOG,
    );

    const rescued = ["p0", "p1", "p2"].map((id) => finishOf(loaded, id));
    for (const finish of rescued) {
      expect(finish).toEqual(DEFAULT_FINISH);
      expect(finish).not.toBe(DEFAULT_FINISH);
    }
    expect(new Set(rescued).size).toBe(rescued.length);
  });
});

describe("a legacy document is billed at PAL, which is the half the ruling was taken on", () => {
  function totalOf(design: Design): number {
    const result = priceDesign({
      design,
      catalog: KITCHEN_L_BODY_CATALOG,
      book: SAMPLE_PRICE_BOOK,
      pricingVersion: SAMPLE_PRICE_BOOK.version,
      // Exactly what `use-priced-design.ts` passes: the design's own settings.
      selections: design.settings,
    });
    if (!result.ok) throw new Error(`priced nothing: ${result.failure.code}`);
    return result.priced.totalMinor;
  }

  const onPal = totalOf(KITCHEN_L_DESIGN);
  const onMdf = totalOf({
    ...KITCHEN_L_DESIGN,
    settings: {
      ...KITCHEN_L_DESIGN.settings,
      materialTierId: "material.painted-mdf",
    },
  });

  it("prices the two tiers apart, so the sweep below is not comparing a value to itself", () => {
    expect(MATERIAL_IDS).toContain("material.painted-mdf");
    expect(onMdf).toBeGreaterThan(onPal);
  });

  it.each(LEGACY_ENUM_FINISH_NAMES)(
    "bills a document that was wearing %s at the PAL total and not the MDF one",
    (name) => {
      const loaded = migrateDesign(
        3,
        storedWith({ [FINISHABLE_ID]: name }),
        KITCHEN_L_BODY_CATALOG,
      );

      expect(totalOf(loaded)).toBe(onPal);
      expect(totalOf(loaded)).not.toBe(onMdf);
    },
  );

  it.each(LEGACY_ENUM_FINISH_NAMES)(
    "bills a whole kitchen wearing %s on every cabinet at the PAL total too",
    (name) => {
      const everyBodyPainted = Object.fromEntries(
        KITCHEN_L_DESIGN.placements.map((placement) => [placement.id, name]),
      );

      const loaded = migrateDesign(
        3,
        storedWith(everyBodyPainted),
        KITCHEN_L_BODY_CATALOG,
      );

      expect(totalOf(loaded)).toBe(onPal);
    },
  );
});

describe("the migration is a fixed point at every value, not only at the fixture's two", () => {
  const VERSION_AND_NAME = EVERY_VERSION_ARM.flatMap((version) =>
    LEGACY_ENUM_FINISH_NAMES.map((name) => [version, name] as const),
  );

  it.each(VERSION_AND_NAME)(
    "re-runs at version %i on its own output for %s and changes nothing",
    (version, name) => {
      const stored = storedWith({
        [FINISHABLE_ID]: name,
        p1: name,
        p12: name,
      });
      const once = migrateDesign(
        version === CURRENT_SCHEMA_VERSION ? 3 : version,
        stored,
        KITCHEN_L_BODY_CATALOG,
      );

      const twice = migrateDesign(
        version,
        reserialised(once),
        KITCHEN_L_BODY_CATALOG,
      );

      expect(reserialised(twice)).toEqual(reserialised(once));
    },
  );

  it("settles after one pass, not after three", () => {
    // A fixed point asserted only at `once → twice` would still hold for a rewrite that oscillates
    // with period two.
    const stored = storedWith({ [FINISHABLE_ID]: "sage", p1: "oak" });
    const passes = [migrateDesign(3, stored, KITCHEN_L_BODY_CATALOG)];
    for (let pass = 1; pass < 4; pass += 1) {
      passes.push(
        migrateDesign(
          CURRENT_SCHEMA_VERSION,
          reserialised(passes[pass - 1]),
          KITCHEN_L_BODY_CATALOG,
        ),
      );
    }

    for (const design of passes) {
      expect(reserialised(design)).toEqual(reserialised(passes[0]));
    }
  });

  it.each([3, CURRENT_SCHEMA_VERSION])(
    "leaves a document carrying no legacy value byte-identical at version %i",
    (version) => {
      // **Amended by wave 6Q-b.** Since ADR 0078 decision 2 the load seam also resolves a finish the
      // document's *material* does not offer, so carrying no legacy value is no longer sufficient
      // for a document to be left alone: it also has to be wearing what its material offers. One
      // document per finish kind, each on the material whose control produces that kind — which is
      // what the single mixed document above could not be, since no material offers both.
      const untouchedDocuments = [
        storedWith(
          {
            [FINISHABLE_ID]: paletteFinish("veneer.nuc"),
            p1: paletteFinish("veneer.stejar"),
          },
          "material.veneer",
        ),
        storedWith(
          {
            [FINISHABLE_ID]: freeColourFinish("#b8c4a1"),
            p1: freeColourFinish("#cbc3b8"),
          },
          "material.painted-mdf",
        ),
      ];

      for (const stored of untouchedDocuments) {
        expect(
          reserialised(migrateDesign(version, stored, KITCHEN_L_BODY_CATALOG)),
        ).toEqual(stored);
      }
    },
  );
});

describe("the free colour bound is one gate and both seams reach it", () => {
  const REFUSED = [
    "#abc",
    "#ABC",
    "#12345678",
    "#abcdefab",
    "123456",
    "0x123456",
    "#gggggg",
    "#12345g",
    " #123456",
    "#123456 ",
    "#123456\n",
    "\n#123456",
    "#12 456",
    "#12\t456",
    "＃123456",
    "#１２３４５６",
    "#12345​6",
    "",
    "#",
    `#${"a".repeat(6)}${"a".repeat(10_000)}`,
    "#123456#123456",
    "rgb(1,2,3)",
    "red",
  ];

  it.each(REFUSED)("refuses %j at the schema", (value) => {
    expect(FinishSchema.safeParse({ kind: "free-colour", value }).success).toBe(
      false,
    );
  });

  it.each(["#123456", "#ABCDEF", "#abcdef", "#AbC123", "#000000", "#ffffff"])(
    "accepts %s at the schema",
    (value) => {
      expect(
        FinishSchema.safeParse({ kind: "free-colour", value }).success,
      ).toBe(true);
    },
  );

  it("accepts exactly what the declared pattern accepts, over any string at all", () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        expect(
          FinishSchema.safeParse({ kind: "free-colour", value }).success,
        ).toBe(FREE_COLOUR_PATTERN.test(value));
      }),
      { numRuns: 2000 },
    );
  });

  it("accepts every six-digit hex a RAL picker could produce", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[0-9a-fA-F]{6}$/), (digits) => {
        expect(
          FinishSchema.safeParse({ kind: "free-colour", value: `#${digits}` })
            .success,
        ).toBe(true);
      }),
    );
  });

  it.each(EVERY_VERSION_ARM)(
    "refuses a malformed colour arriving through migrateDesign at version %i",
    (version) => {
      for (const value of ["#abc", "#gggggg", "#123456 ", ""]) {
        expect(() =>
          migrateDesign(
            version,
            storedWith({ [FINISHABLE_ID]: { kind: "free-colour", value } }),
            KITCHEN_L_BODY_CATALOG,
          ),
        ).toThrow(InvalidDesignError);
      }
    },
  );

  it.each(EVERY_VERSION_ARM)(
    "carries a well-formed colour through migrateDesign at version %i untouched",
    (version) => {
      // On MDF, whose RAL picker is the control that produces a free colour: since wave 6Q-b the
      // same colour on a PAL kitchen resolves to *Alb*, which is that wave's rule and not a
      // statement about the bound this block is measuring.
      const loaded = migrateDesign(
        version,
        storedWith(
          { [FINISHABLE_ID]: freeColourFinish("#b8c4a1") },
          "material.painted-mdf",
        ),
        KITCHEN_L_BODY_CATALOG,
      );

      expect(finishOf(loaded, FINISHABLE_ID)).toEqual(
        freeColourFinish("#b8c4a1"),
      );
    },
  );

  it("never reads a kind off a string that looks like one or the other", () => {
    expect(
      FinishSchema.safeParse({ kind: "palette-entry", entryId: "#b8c4a1" })
        .success,
    ).toBe(false);
    expect(
      FinishSchema.safeParse({ kind: "free-colour", value: "pal.alb" }).success,
    ).toBe(false);
    expect(FinishSchema.safeParse("pal.alb").success).toBe(false);
    expect(FinishSchema.safeParse("#b8c4a1").success).toBe(false);
  });
});

describe("a body that cannot wear a finish never receives one, and one that can never loses one", () => {
  const EVERY_KIND = [
    ["a legacy name", "sage"],
    ["a palette entry", paletteFinish("pal.alb")],
    ["a free colour", freeColourFinish("#b8c4a1")],
  ] as const;

  const UNFINISHABLE_AND_KIND = UNFINISHABLE_IDS.flatMap((placementId) =>
    EVERY_KIND.map(([label, finish]) => [placementId, label, finish] as const),
  );

  it.each(UNFINISHABLE_AND_KIND)(
    "strips %s wearing %s",
    (placementId, _label, finish) => {
      const loaded = migrateDesign(
        3,
        storedWith({ [placementId]: finish }),
        KITCHEN_L_BODY_CATALOG,
      );

      expect(finishOf(loaded, placementId)).toBeUndefined();
    },
  );

  it.each([1, 2, 3] as const)(
    "strips a frontless body carried forward from version %i",
    (version) => {
      const loaded = migrateDesign(
        version,
        storedWith({ p12: "oak" }),
        KITCHEN_L_BODY_CATALOG,
      );

      expect(finishOf(loaded, "p12")).toBeUndefined();
    },
  );

  // **This was a QA finding. It is fixed, and the case below is what holds the fix in place.**
  //
  // As first delivered, `dropFinishFromBodiesThatCannotWearOne` was registered in
  // `NORMALISATIONS_BY_VERSION_OWING_THEM` under key `3`. `carryForward` walks `schemaVersion` up
  // to `CURRENT_SCHEMA_VERSION - 1`, so a document already at the current version walked no
  // normalisation and the strip never ran on it — while the function's own comment claimed it held
  // for *every* arm.
  //
  // Measured rather than argued: `PUT /api/designs/[id]` accepted and persisted a current-version
  // document carrying a finish on `p12` (a hood, `canFinish: false`), and every later load left it
  // there. `validate-design.ts` asks nothing about `canFinish`, and the only two enforcement sites
  // are command-time — `setFinish` refuses a frontless body, `insertBody` does not carry one across
  // a swap — so nothing else would have removed it.
  //
  // The fix was to stop keying it by version at all: it is now called unconditionally in
  // `migrateDesign`, after every arm, and the reasoning lives on
  // `dropFinishFromBodiesThatCannotWearOne`'s own doc comment. **Re-keying it into the version
  // table is the refactor that would silently undo this**, and it is the reason the case below
  // stays — a later arm would not help either, because the walk is ascending and an arm above the
  // strip runs after it, with its output never re-checked.
  it("strips a frontless body at the current version too", () => {
    const loaded = migrateDesign(
      CURRENT_SCHEMA_VERSION,
      storedWith({ p12: paletteFinish("veneer.nuc") }),
      KITCHEN_L_BODY_CATALOG,
    );

    expect(finishOf(loaded, "p12")).toBeUndefined();
  });

  it.each(EVERY_VERSION_ARM)(
    "keeps a finishable body's declared finish at version %i",
    (version) => {
      const loaded = migrateDesign(
        version,
        storedWith({ [FINISHABLE_ID]: paletteFinish("pal.gri-havanna") }),
        KITCHEN_L_BODY_CATALOG,
      );

      expect(finishOf(loaded, FINISHABLE_ID)).toEqual(
        paletteFinish("pal.gri-havanna"),
      );
    },
  );
});

describe("colour never moves a price, even when every cabinet wears a different one", () => {
  // **The half the wave's own property cannot reach.** `finish-never-prices.test.ts` repaints every
  // body with *one* generated finish, so a coefficient keyed on the **variety** of finishes in a
  // design — a "mixed decors surcharge", the sort of rule a manufacturer really does quote — passes
  // it untouched. This paints each placement independently, from both kinds.
  const anyLegalFinish: fc.Arbitrary<Finish> = fc.oneof(
    fc
      .constantFrom(...PALETTE_ENTRIES.map((entry) => entry.entryId))
      .map(paletteFinish),
    fc
      .stringMatching(/^[0-9a-fA-F]{6}$/)
      .map((digits) => freeColourFinish(`#${digits}`)),
  );

  const PLACEMENT_COUNT = KITCHEN_L_DESIGN.placements.length;

  const oneFinishPerBody = fc.array(anyLegalFinish, {
    minLength: PLACEMENT_COUNT,
    maxLength: PLACEMENT_COUNT,
  });

  function repaintedPerBody(finishes: readonly Finish[]): Design {
    return {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.map((placement, index) => {
        const finish = finishes[index];
        return finish === undefined
          ? placement
          : { ...placement, body: { ...placement.body, finish } };
      }),
    };
  }

  function pricedJson(design: Design): string {
    return JSON.stringify(
      priceDesign({
        design,
        catalog: KITCHEN_L_BODY_CATALOG,
        book: SAMPLE_PRICE_BOOK,
        pricingVersion: SAMPLE_PRICE_BOOK.version,
        selections: design.settings,
      }),
    );
  }

  const unpainted = pricedJson(KITCHEN_L_DESIGN);

  it("generates designs actually holding more than one distinct finish", () => {
    // Without this the sweep below could be a slower way of running the uniform one: an arbitrary
    // that collapsed to a single value would satisfy it while testing nothing new.
    const mixed = fc
      .sample(oneFinishPerBody, 50)
      .filter(
        (finishes) =>
          new Set(finishes.map((finish) => JSON.stringify(finish))).size > 1,
      );

    expect(mixed.length).toBeGreaterThan(45);
  });

  it("returns a byte-identical PricedDesign whatever mix of finishes a design wears", () => {
    fc.assert(
      fc.property(oneFinishPerBody, (finishes) => {
        expect(pricedJson(repaintedPerBody(finishes))).toBe(unpainted);
      }),
      { numRuns: 300 },
    );
  });

  it("holds when every body wears a distinct palette entry, not only under a random mix", () => {
    // The worst case for a variety-keyed coefficient: as many distinct decors as the palette can
    // supply, cycled across the kitchen.
    const everyEntryInTurn = KITCHEN_L_DESIGN.placements.map(
      (_placement, index) =>
        paletteFinish(
          PALETTE_ENTRIES[index % PALETTE_ENTRIES.length]?.entryId ?? "pal.alb",
        ),
    );

    expect(pricedJson(repaintedPerBody(everyEntryInTurn))).toBe(unpainted);
  });
});
