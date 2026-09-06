// **Wave 6Q-a's deliverable: whether a material offers a finish, asserted over every pair rather
// than over the pairs a fixture happens to contain** — ADR 0057 decision 4, finally expressible now
// that ADR 0078 decision 1 has ruled what *"offers"* means across two kinds of finish.
//
// The pair space is generated in `support/material-finish-pairs.ts` from `MATERIALS` and
// `PALETTE_ENTRIES`, so nothing below enumerates it. What is written down here — and written down
// on purpose — is the **expected-miss table**, which imports nothing it pins. This project has
// shipped two boundary greps that matched nothing while reporting green, and wave 6P shipped three
// assertions that compared a value against the code that produced it: a sweep that reads
// `paletteEntriesOf` to decide what it expects is wrong in exactly the same direction as the query
// it is checking, and would agree with it forever.
import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { setFinish } from "../src/commands/set-appearance.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import {
  LEGACY_ENUM_FINISHES,
  MATERIALS,
  materialById,
  materialOffersFinish,
  PALETTE_ENTRIES,
  paletteFinish,
  type MaterialId,
  type PaletteEntryId,
} from "../src/materials.js";
import { clearBodies, insertInto, OCCURRED_AT } from "./support/commands.js";
import { createWorld } from "./support/kitchen-world.js";
import {
  freeColourArbitrary,
  freeColourPairArbitrary,
  PALETTE_PAIRS,
} from "./support/material-finish-pairs.js";

/** **Written out by hand, from ADR 0078 decision 1's table and nothing else.** Every entry a
 *  material does **not** offer, named rather than counted, so a query that is wrong about *which*
 *  two PAL misses cannot pass by missing the right number of them.
 *
 *  Read straight off the products: PAL is pre-manufactured decor and offers no wood veneer; veneer
 *  is natural wood and offers no printed decor; MDF is painted and offers no board finish at all. */
const EXPECTED_MISSED_ENTRY_IDS: Readonly<
  Record<MaterialId, readonly PaletteEntryId[]>
> = {
  "material.melamine": ["veneer.stejar", "veneer.nuc"],
  "material.painted-mdf": [
    "pal.alb",
    "pal.stejar-bardolino",
    "pal.stejar-halifax",
    "pal.antracit",
    "pal.gri-havanna",
    "pal.nuc-warmia",
    "veneer.stejar",
    "veneer.nuc",
  ],
  "material.veneer": [
    "pal.alb",
    "pal.stejar-bardolino",
    "pal.stejar-halifax",
    "pal.antracit",
    "pal.gri-havanna",
    "pal.nuc-warmia",
  ],
};

/** The same table again as three counts, so a hand-edit that drops a line from the lists above is
 *  caught by the numbers instead of quietly shrinking what is expected. Two, eight and six. */
const EXPECTED_MISS_COUNTS: Readonly<Record<MaterialId, number>> = {
  "material.melamine": 2,
  "material.painted-mdf": 8,
  "material.veneer": 6,
};

/** **Only the RAL picker offers a free colour, and it offers every one the schema admits** — the
 *  half of the offer that has no list to enumerate. */
const OFFERS_EVERY_FREE_COLOUR: Readonly<Record<MaterialId, boolean>> = {
  "material.melamine": false,
  "material.painted-mdf": true,
  "material.veneer": false,
};

const DECLARED_MATERIAL_COUNT = 3;
const DECLARED_PALETTE_ENTRY_COUNT = 8;
const EXPECTED_PALETTE_PAIRS = 24;
const EXPECTED_PALETTE_MISSES = 16;
const EXPECTED_PALETTE_OFFERS = 8;

/** Enough draws that a per-material branch cannot be reached zero times by luck; the property below
 *  runs fast-check's own count on top of this. */
const FREE_COLOUR_SAMPLE_SIZE = 50;

describe("the pair space itself, before anything is asserted over it", () => {
  // The "not a vacuous sweep" convention `catalog.test.ts` and `front-population.test.ts` already
  // use: a list that empties, or a rename that filters everything out, must fail loudly rather than
  // pass over nothing.
  it("is three materials, eight palette entries and twenty-four palette pairs", () => {
    expect(MATERIALS).toHaveLength(DECLARED_MATERIAL_COUNT);
    expect(PALETTE_ENTRIES).toHaveLength(DECLARED_PALETTE_ENTRY_COUNT);
    expect(PALETTE_PAIRS).toHaveLength(EXPECTED_PALETTE_PAIRS);
  });

  it("pairs every material with every entry, including the ones it does not own", () => {
    for (const material of MATERIALS) {
      const forThisMaterial = PALETTE_PAIRS.filter(
        (pair) => pair.material.materialId === material.materialId,
      );
      expect(forThisMaterial).toHaveLength(DECLARED_PALETTE_ENTRY_COUNT);
    }
  });
});

describe("materialOffersFinish, over every (material, palette entry) pair", () => {
  it("misses exactly the entries the hand-written table names, material by material", () => {
    for (const material of MATERIALS) {
      const missed = PALETTE_PAIRS.filter(
        (pair) =>
          pair.material.materialId === material.materialId &&
          !materialOffersFinish(pair.material, pair.finish),
      ).map((pair) =>
        pair.finish.kind === "palette-entry" ? pair.finish.entryId : "free",
      );

      expect([...missed].sort()).toEqual(
        [...EXPECTED_MISSED_ENTRY_IDS[material.materialId]].sort(),
      );
      expect(missed).toHaveLength(EXPECTED_MISS_COUNTS[material.materialId]);
    }
  });

  it("meets both branches — sixteen misses and eight offers, and neither is empty", () => {
    const offers = PALETTE_PAIRS.filter((pair) =>
      materialOffersFinish(pair.material, pair.finish),
    );
    const misses = PALETTE_PAIRS.filter(
      (pair) => !materialOffersFinish(pair.material, pair.finish),
    );

    expect(offers.length).toBeGreaterThan(0);
    expect(misses.length).toBeGreaterThan(0);
    expect(offers).toHaveLength(EXPECTED_PALETTE_OFFERS);
    expect(misses).toHaveLength(EXPECTED_PALETTE_MISSES);
  });

  it("offers each material exactly its own declared default", () => {
    // ADR 0078 decision 4's reset target has to be a finish the material it belongs to offers, or
    // the resolution 6Q-b builds would write the violation it exists to clear.
    for (const material of MATERIALS) {
      expect(materialOffersFinish(material, material.defaultFinish)).toBe(true);
    }
  });

  it("reads the control's shape and not its entry count", () => {
    // ADR 0071 decision 3's reason, held to: veneer's two swatches and a hypothetical two-decor PAL
    // list are the same array and different products. A veneer wood is refused by PAL even though
    // both controls carry entries, and MDF refuses a palette entry while carrying none at all.
    expect(
      materialOffersFinish(
        materialById("material.melamine"),
        paletteFinish("veneer.nuc"),
      ),
    ).toBe(false);
    expect(
      materialOffersFinish(
        materialById("material.painted-mdf"),
        paletteFinish("pal.alb"),
      ),
    ).toBe(false);
  });
});

describe("materialOffersFinish, over generated free colours", () => {
  it("answers by the control's shape for every colour the schema admits", () => {
    fc.assert(
      fc.property(freeColourPairArbitrary(), (pair) => {
        expect(materialOffersFinish(pair.material, pair.finish)).toBe(
          OFFERS_EVERY_FREE_COLOUR[pair.material.materialId],
        );
      }),
    );
  });

  it("meets both branches over a sample: MDF offers every draw, the other two miss every draw", () => {
    const colours = fc.sample(freeColourArbitrary(), FREE_COLOUR_SAMPLE_SIZE);
    expect(colours).toHaveLength(FREE_COLOUR_SAMPLE_SIZE);

    for (const material of MATERIALS) {
      const offered = colours.filter((finish) =>
        materialOffersFinish(material, finish),
      );
      const expected = OFFERS_EVERY_FREE_COLOUR[material.materialId]
        ? FREE_COLOUR_SAMPLE_SIZE
        : 0;
      expect(offered).toHaveLength(expected);
    }
  });
});

describe("the two states that are outside the pair space entirely", () => {
  // **Absence is not a violation** (ADR 0078 decision 5). The query is never asked about a body
  // wearing nothing, and nothing in this wave may start filling one in — a rule phrased as "every
  // placement's finish is offered" would pass while a helpful default was written onto fourteen
  // bodies.
  it("adds a finish to no placement when the command refuses one", () => {
    const wearingNothing = KITCHEN_L_DESIGN.placements.filter(
      (placement) => placement.body.finish === undefined,
    );
    expect(wearingNothing.length).toBeGreaterThan(0);

    // *Salvie*: a free colour, and PAL is a decor list — the named interim ADR 0078 decision 6
    // accepts until wave 6R makes the panel's offer the control's own.
    const result = setFinish({
      design: KITCHEN_L_DESIGN,
      catalog: KITCHEN_L_BODY_CATALOG,
      target: { kind: "placement", id: "p0" },
      finish: LEGACY_ENUM_FINISHES.sage,
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("FINISH_NOT_OFFERED");
    expect(result.design).toBe(KITCHEN_L_DESIGN);
    expect(
      result.design.placements.filter(
        (placement) => placement.body.finish === undefined,
      ),
    ).toHaveLength(wearingNothing.length);
  });

  // **A `canFinish: false` body never reaches the offer question at all.** It is refused for what
  // it is, not for what it was asked to wear, so both an offered and an unoffered finish produce
  // the same code — which is what keeps such a body out of the sweep rather than in it with a
  // second answer.
  it("refuses a body with no doors for having no doors, whatever it was asked to wear", () => {
    const world = createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);
    const cleared = clearBodies(world, ["p8"]);
    const slot = cleared.voids.find((record) => record.col === "A|0.30");
    const shelf = insertInto(
      cleared,
      { kind: "void", id: slot?.id ?? "" },
      "open-shelf",
    );
    expect(shelf.ok).toBe(true);
    if (!shelf.ok) return;

    for (const finish of [
      paletteFinish("pal.alb"),
      LEGACY_ENUM_FINISHES.sage,
    ]) {
      const result = setFinish({
        design: shelf.design,
        catalog: KITCHEN_L_BODY_CATALOG,
        target: { kind: "placement", id: shelf.effect.placementId },
        finish,
        occurredAt: OCCURRED_AT,
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.code).toBe("FINISH_NOT_SUPPORTED");
    }
  });
});
