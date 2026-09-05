// **Wave 6Q-c's query, attacked rather than confirmed** (ADR 0081 decision 1, ADR 0086).
//
// `chosen-finishes.test.ts` asserts the wave's criteria. This file goes after the ways the same
// query could answer **zero for the wrong reason** and pass beside a confirmation that never opens:
// comparing against a hard-wired default instead of the design's own material, folding case where
// no case fold was declared, reading `settings` in a way that breaks when the key is absent
// altogether, and counting placements rather than finishes.
//
// **The grid is the centre of it.** Every declared material against every declared palette entry is
// twenty-four cells with a hand-derivable answer, and both arms of the answer are counted as
// literals — a query that always answered zero, always answered one, or always compared against
// PAL's *Alb* lands on a different pair of literals.
//
// It also pins the three inputs ADR 0086 measured the **withdrawn** inequality false on, so a later
// reader who finds `chosenCount ≤ resolvedCount` attractive is shown the counterexamples rather
// than told about them.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { countCabinetsWearingAChosenFinish } from "../src/chosen-finishes.js";
import { setMaterialTier } from "../src/commands/set-whole-kitchen-settings.js";
import type { Design } from "../src/design.js";
import { KITCHEN_L_DESIGN } from "../src/fixtures/kitchen-l-design.js";
import {
  DEFAULT_MATERIAL_ID,
  freeColourFinish,
  MATERIAL_IDS,
  MATERIALS,
  PALETTE_ENTRIES,
  paletteEntriesOf,
  paletteFinish,
  sameFinish,
  type Finish,
  type Material,
} from "../src/materials.js";
import {
  FINISHES_RESOLVED_BY_VENEER,
  MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
  MDF_TIER_ID,
} from "./support/mdf-kitchen-wearing-chosen-colours.js";

const OCCURRED_AT = "2026-09-05T12:00:00.000Z";

/** A tier id the schema accepts and this product declares no material for (ADR 0072). */
const UNDECLARED_TIER_ID = "material.laminate";

/** A finishable seeded body, and the seeded population it belongs to. `KITCHEN_L_DESIGN` carries no
 *  finish on any placement, which the wave's own suite asserts, so painting one is the whole edit. */
const FINISHABLE_ID = "p0";
const SEEDED_PLACEMENT_COUNT = KITCHEN_L_DESIGN.placements.length;

/** MDF's declared white, spelled as `materials.ts` spells it — lower case. */
const MDF_DEFAULT_COLOUR = "#eceeeb";

function designOn(materialTierId: string | undefined): Design {
  return materialTierId === undefined
    ? withoutSettings(KITCHEN_L_DESIGN)
    : {
        ...KITCHEN_L_DESIGN,
        settings: { ...KITCHEN_L_DESIGN.settings, materialTierId },
      };
}

/** A document with **no `settings` key at all** — the shape `design.settings?.` exists for, and one
 *  no fixture in this repository holds. Built by omission rather than by writing `undefined` into
 *  the key, because those are two different documents and only this one is the optional field's
 *  absent case. `qa-5b5-fixed-width.adversarial.test.ts`'s `catalogWithout` is the same move. */
function withoutSettings(design: Design): Design {
  return Object.fromEntries(
    Object.entries(design).filter(([field]) => field !== "settings"),
  ) as Design;
}

function wearing(design: Design, id: string, finish: Finish): Design {
  return {
    ...design,
    placements: design.placements.map((placement) =>
      placement.id === id
        ? { ...placement, body: { ...placement.body, finish } }
        : placement,
    ),
  };
}

function allWearing(design: Design, finish: Finish): Design {
  return {
    ...design,
    placements: design.placements.map((placement) => ({
      ...placement,
      body: { ...placement.body, finish },
    })),
  };
}

describe("every declared material against every declared palette entry", () => {
  interface Cell {
    readonly materialId: string;
    readonly finish: Finish;
    readonly counted: number;
    readonly expected: number;
  }

  /** Twenty-four cells: one cabinet painted, on each material, in each declared entry. The expected
   *  answer is derived from `sameFinish` against **that** material's own default — which is the one
   *  thing an implementation reaching for `DEFAULT_FINISH` gets wrong on two thirds of the grid. */
  const GRID: readonly Cell[] = MATERIALS.flatMap((material) =>
    PALETTE_ENTRIES.map((entry) => {
      const finish = paletteFinish(entry.entryId);
      return {
        materialId: material.materialId,
        finish,
        counted: countCabinetsWearingAChosenFinish(
          wearing(designOn(material.materialId), FINISHABLE_ID, finish),
        ),
        expected: sameFinish(finish, material.defaultFinish) ? 0 : 1,
      };
    }),
  );

  it("answers every cell as the material's own default decides", () => {
    expect(GRID).toHaveLength(MATERIALS.length * PALETTE_ENTRIES.length);
    for (const cell of GRID) {
      expect(
        cell.counted,
        `${cell.materialId} wearing ${JSON.stringify(cell.finish)}`,
      ).toBe(cell.expected);
    }
  });

  it("lands on both arms, in the literal proportion the declaration forces", () => {
    // Two cells sit at a default and twenty-two do not: PAL's *Alb* on PAL and veneer's *Stejar* on
    // veneer. MDF's default is a free colour, so **no** palette entry is MDF's default — which is
    // why an implementation comparing every material against PAL's *Alb* produces three silent
    // cells rather than two and fails here rather than in the copy.
    expect(GRID.filter((cell) => cell.counted === 0)).toHaveLength(2);
    expect(GRID.filter((cell) => cell.counted === 1)).toHaveLength(22);
  });
});

describe("the free-colour half of the grid", () => {
  it("counts a free colour on a decor-list kitchen, because kinds do not compare equal", () => {
    // PAL's default is a palette entry; `sameFinish` across two kinds is false by construction, so a
    // free colour on PAL is always a chosen colour. The mirror of the `#ECEEEB` over-warn.
    expect(
      countCabinetsWearingAChosenFinish(
        wearing(
          designOn(DEFAULT_MATERIAL_ID),
          FINISHABLE_ID,
          freeColourFinish(MDF_DEFAULT_COLOUR),
        ),
      ),
    ).toBe(1);
  });

  it("folds no case: of sixty-four spellings of MDF's white, exactly one is silent", () => {
    // Six hex letters, each in either case — the whole space, not two examples. ADR 0081 decision 1
    // takes `sameFinish` and no second, case-folding equality, so every spelling but the declared
    // one is a chosen colour. The error is in the safe direction and this is its exact size.
    const spellings = caseVariantsOf(MDF_DEFAULT_COLOUR);
    const silent = spellings.filter(
      (value) =>
        countCabinetsWearingAChosenFinish(
          wearing(
            designOn(MDF_TIER_ID),
            FINISHABLE_ID,
            freeColourFinish(value),
          ),
        ) === 0,
    );

    expect(spellings).toHaveLength(64);
    expect(silent).toEqual([MDF_DEFAULT_COLOUR]);
  });
});

describe("the boundaries of the population it counts", () => {
  it("answers zero for a design holding no placements at all", () => {
    expect(
      countCabinetsWearingAChosenFinish({
        ...KITCHEN_L_DESIGN,
        placements: [],
      }),
    ).toBe(0);
  });

  it("answers the whole population when every cabinet wears a chosen colour", () => {
    // The maximum, so a query short-circuiting or counting distinct colours instead of cabinets is
    // visible. Twenty-six placements, one colour, twenty-six chosen.
    expect(
      countCabinetsWearingAChosenFinish(
        allWearing(
          designOn(DEFAULT_MATERIAL_ID),
          paletteFinish("pal.antracit"),
        ),
      ),
    ).toBe(SEEDED_PLACEMENT_COUNT);
  });

  it("reads a document carrying no settings key as the default material's", () => {
    // `design.settings` is optional and every fixture here supplies one, so the absent-key arm is
    // reachable in production and asserted nowhere else. It must resolve to PAL, not to *undeclared*.
    const bare = withoutSettings(KITCHEN_L_DESIGN);

    expect(bare.settings).toBeUndefined();
    expect(
      countCabinetsWearingAChosenFinish(
        wearing(bare, FINISHABLE_ID, paletteFinish("pal.alb")),
      ),
    ).toBe(0);
    expect(
      countCabinetsWearingAChosenFinish(
        wearing(bare, FINISHABLE_ID, paletteFinish("pal.antracit")),
      ),
    ).toBe(1);
  });

  it("counts every carried finish on an undeclared material, including the defaults", () => {
    // A design fully painted in PAL's *Alb* under a tier this product does not declare: an
    // implementation quietly falling back to melamine answers zero here and passes the single-cabinet
    // case, because one is the count either way once it has fallen back wrong.
    expect(
      countCabinetsWearingAChosenFinish(
        allWearing(designOn(UNDECLARED_TIER_ID), paletteFinish("pal.alb")),
      ),
    ).toBe(SEEDED_PLACEMENT_COUNT);
  });
});

describe("the query is a query", () => {
  it("answers the same twice and leaves the document it read unchanged", () => {
    const design = wearing(
      designOn(MDF_TIER_ID),
      FINISHABLE_ID,
      freeColourFinish("#cbc3b8"),
    );
    const before = JSON.stringify(design);

    expect(countCabinetsWearingAChosenFinish(design)).toBe(
      countCabinetsWearingAChosenFinish(design),
    );
    expect(JSON.stringify(design)).toBe(before);
  });

  it("moves by exactly one, or not at all, for each cabinet painted", () => {
    // The count as a function of one edit rather than as a recomputation of itself: painting a bare
    // cabinet a colour the material does not declare as its default adds one, and painting it the
    // default adds nothing. A sweep, because which entry is a material's default differs per
    // material and a two-example version would miss the material whose default is a free colour.
    fc.assert(
      fc.property(paintArbitrary(), ({ material, finish, placementId }) => {
        const before = designOn(material.materialId);
        const after = wearing(before, placementId, finish);
        const step = sameFinish(finish, material.defaultFinish) ? 0 : 1;

        expect(
          countCabinetsWearingAChosenFinish(after) -
            countCabinetsWearingAChosenFinish(before),
        ).toBe(step);
      }),
    );
  });
});

describe("the inequality ADR 0086 withdrew, on the three inputs it measured false", () => {
  /** `chosenCount` and `resolvedFinishCount` for one switch, so each row below reads as the pair it
   *  is. Kept together because the finding is about the two numbers, never about either alone. */
  function bothCountsFor(design: Design, tierId: string): [number, number] {
    const applied = setMaterialTier({
      design,
      tierId,
      availableTierIds: MATERIAL_IDS,
      occurredAt: OCCURRED_AT,
    });
    if (!applied.ok) throw new Error(`setMaterialTier refused "${tierId}"`);
    return [
      countCabinetsWearingAChosenFinish(design),
      applied.effect.resolvedFinishCount,
    ];
  }

  it("is false on the fixture the wave reuses, on a PAL kitchen, and on an undeclared one", () => {
    // Pinned so nobody restores `chosenCount ≤ resolvedCount` as a general criterion: it fails for a
    // **correct** implementation on all three, and the fix an implementer reaches for is to weaken
    // the code. The relation holds only under ADR 0086 decision 1's three preconditions, which is
    // where `chosen-finishes.test.ts` asserts it.
    expect(
      bothCountsFor(MDF_KITCHEN_WEARING_CHOSEN_COLOURS, "material.veneer"),
    ).toEqual([4, FINISHES_RESOLVED_BY_VENEER]);
    expect(
      bothCountsFor(
        wearing(
          designOn(DEFAULT_MATERIAL_ID),
          FINISHABLE_ID,
          paletteFinish("pal.antracit"),
        ),
        DEFAULT_MATERIAL_ID,
      ),
    ).toEqual([1, 0]);
    expect(
      bothCountsFor(
        wearing(
          designOn(UNDECLARED_TIER_ID),
          FINISHABLE_ID,
          paletteFinish("pal.alb"),
        ),
        DEFAULT_MATERIAL_ID,
      ),
    ).toEqual([1, 0]);
  });
});

/** Every upper/lower spelling of a hex colour's letters — the six in `#eceeeb`, so sixty-four. */
function caseVariantsOf(colour: string): readonly string[] {
  const letterPositions = [];
  for (let at = 0; at < colour.length; at += 1) {
    if (/[a-f]/.test(colour.charAt(at))) letterPositions.push(at);
  }
  const variants = new Set<string>();
  for (let mask = 0; mask < 2 ** letterPositions.length; mask += 1) {
    let spelling = colour;
    letterPositions.forEach((at, bit) => {
      if (((mask >> bit) & 1) === 0) return;
      spelling = `${spelling.slice(0, at)}${spelling.charAt(at).toUpperCase()}${spelling.slice(at + 1)}`;
    });
    variants.add(spelling);
  }
  return [...variants];
}

interface Paint {
  readonly material: Material;
  readonly finish: Finish;
  readonly placementId: string;
}

/** A material, one finish that material offers, and a seeded placement to put it on. The finish
 *  space is `paletteEntriesOf` for a list or a swatch pair and the declared free-colour pattern for
 *  a picker, so MDF's default enters the sweep by being generatable rather than by being written. */
function paintArbitrary(): fc.Arbitrary<Paint> {
  return fc.constantFrom(...MATERIALS).chain((material) => {
    const entries = paletteEntriesOf(material);
    const finish: fc.Arbitrary<Finish> =
      entries.length === 0
        ? fc.constantFrom(
            freeColourFinish(MDF_DEFAULT_COLOUR),
            freeColourFinish("#cbc3b8"),
            freeColourFinish("#8d9a84"),
          )
        : fc.constantFrom(
            ...entries.map((entry) => paletteFinish(entry.entryId)),
          );
    return fc.record({
      material: fc.constant(material),
      finish,
      placementId: fc.constantFrom(
        ...KITCHEN_L_DESIGN.placements.map((placement) => placement.id),
      ),
    });
  });
}
