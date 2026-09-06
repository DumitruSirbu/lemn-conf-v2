// **Wave 6Q-c's query: how many cabinets wear a colour somebody chose** (ADR 0081 decision 1,
// ADR 0086).
//
// **The branch that matters is the one nothing else exercises.** Every shipped fixture in this
// repository sits at its material's declared default or wears nothing at all, so a query that
// answered zero for the wrong reason — or one hard-wired to zero — would pass beside a confirmation
// that never opens. So both arms are counted here with a floor on each, and the interesting arm is
// pinned as a literal on 6Q-b's own veneer fixture rather than derived from it.
//
// **Two things in this file are about different inputs and must not be read as one.** The literal
// four is measured on `MDF_KITCHEN_WEARING_CHOSEN_COLOURS`, which is **deliberately outside** the
// inequality's preconditions — it carries veneer woods on an MDF kitchen, so `4 ≤ 2` is false there
// and correctly so (ADR 0086's measurement section). The inequality is asserted at the foot of this
// file over a generator whose **constraints are the preconditions**, never over that fixture.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { countCabinetsWearingAChosenFinish } from "../src/chosen-finishes.js";
import { toInsertableBody, type InsertableBody } from "../src/catalog.js";
import { carriedAppearance } from "../src/commands/insert-body.js";
import { setMaterialTier } from "../src/commands/set-whole-kitchen-settings.js";
import type { Design, DesignPlacement } from "../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import {
  freeColourFinish,
  MATERIAL_IDS,
  MATERIALS,
  paletteEntriesOf,
  paletteFinish,
  sameFinish,
  type Finish,
  type Material,
} from "../src/materials.js";
import {
  CURRENT_SCHEMA_VERSION,
  migrateDesign,
} from "../src/migrate-design.js";
import { projectDesignForDisplay } from "../src/queries/design-projection.js";
import {
  derivePlacementRecords,
  type PlacementRecord,
} from "../src/void-engine.js";
import { freeColourArbitrary } from "./support/material-finish-pairs.js";
import {
  FINISHES_RESOLVED_BY_VENEER,
  HOOD_PLACEMENT_ID,
  MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
  MDF_TIER_ID,
  VENEER_TIER_ID,
} from "./support/mdf-kitchen-wearing-chosen-colours.js";

const OCCURRED_AT = "2026-09-05T12:00:00.000Z";

/** A tier id the schema accepts and this product declares no material for — ADR 0072's reachable
 *  state, the one wave 6G's recovery path leaves behind. */
const UNDECLARED_TIER_ID = "material.laminate";

/** A finishable seeded body. */
const FINISHABLE_ID = "p0";

/**
 * **The three numbers of ADR 0086 decision 1, pinned in one place, pairwise distinct.**
 *
 * They are confusable in exactly one direction: the displayed body count and the chosen-colour count
 * are both counts of cabinets and are both derivable where the confirmation is composed. Pinning all
 * three as literals is what turns "the copy used the nearer number" into a failure rather than into
 * an expectation that agrees with whatever was written.
 *
 * **The displayed count is measured, not quoted.** Wave 6Q-c's plan carries fourteen from an earlier
 * seeded kitchen; the projection answers twenty-six for the design shipped today, and the point of
 * the pin is that all three differ rather than what any one of them is.
 */
const DISPLAYED_BODY_COUNT = 26;
const CHOSEN_COLOURS_ON_THE_MDF_FIXTURE = 4;

function designWearing(finish: Finish, materialTierId?: string): Design {
  return {
    ...KITCHEN_L_DESIGN,
    ...(materialTierId === undefined
      ? {}
      : { settings: { ...KITCHEN_L_DESIGN.settings, materialTierId } }),
    placements: KITCHEN_L_DESIGN.placements.map((placement) =>
      placement.id === FINISHABLE_ID
        ? { ...placement, body: { ...placement.body, finish } }
        : placement,
    ),
  };
}

/** Every placement wearing the same finish, so "nothing was chosen" is asserted on a document that
 *  is fully painted rather than on one that is bare. */
function designAllWearing(finish: Finish, materialTierId?: string): Design {
  return {
    ...KITCHEN_L_DESIGN,
    ...(materialTierId === undefined
      ? {}
      : { settings: { ...KITCHEN_L_DESIGN.settings, materialTierId } }),
    placements: KITCHEN_L_DESIGN.placements.map((placement) => ({
      ...placement,
      body: { ...placement.body, finish },
    })),
  };
}

describe("the three numbers wave 6Q-c must not confuse", () => {
  it("are pairwise distinct, so wiring the wrong one into the copy fails", () => {
    const three = [
      DISPLAYED_BODY_COUNT,
      CHOSEN_COLOURS_ON_THE_MDF_FIXTURE,
      FINISHES_RESOLVED_BY_VENEER,
    ];

    expect(new Set(three).size).toBe(three.length);
  });

  it("counts the bodies the projection holds, as the sheet's own line does", () => {
    const groups = projectDesignForDisplay(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    );

    expect(
      groups.reduce((count, group) => count + group.entries.length, 0),
    ).toBe(DISPLAYED_BODY_COUNT);
  });

  it("counts four chosen colours on the fixture, and two finishes resolved by veneer", () => {
    // The literal, on the fixture the wave reuses. **This fixture is deliberately outside the
    // inequality's preconditions** — it carries veneer woods on an MDF kitchen — so `4 ≤ 2` is false
    // here and that is the measurement, not a defect. The inequality lives at the foot of this file.
    expect(
      countCabinetsWearingAChosenFinish(MDF_KITCHEN_WEARING_CHOSEN_COLOURS),
    ).toBe(CHOSEN_COLOURS_ON_THE_MDF_FIXTURE);

    const applied = setMaterialTier({
      design: MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
      tierId: VENEER_TIER_ID,
      availableTierIds: [MDF_TIER_ID, VENEER_TIER_ID],
      occurredAt: OCCURRED_AT,
    });

    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.effect.resolvedFinishCount).toBe(
      FINISHES_RESOLVED_BY_VENEER,
    );
  });
});

describe("both branches of the predicate, counted, with a floor on each", () => {
  /** Named designs and what each is here to catch. A set-membership sweep that landed entirely on
   *  the arm nobody changed would certify nothing, so the arms are counted rather than assumed. */
  const CASES: readonly { readonly what: string; readonly design: Design }[] = [
    {
      what: "the seeded kitchen, wearing nothing at all",
      design: KITCHEN_L_DESIGN,
    },
    {
      what: "a PAL kitchen painted entirely in PAL's declared default",
      design: designAllWearing(paletteFinish("pal.alb")),
    },
    {
      what: "a PAL kitchen with one cabinet set to Antracit",
      design: designWearing(paletteFinish("pal.antracit")),
    },
    {
      what: "an MDF kitchen wearing four chosen colours",
      design: MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
    },
    {
      what: "an MDF kitchen sitting at MDF's own declared white",
      design: designAllWearing(freeColourFinish("#eceeeb"), MDF_TIER_ID),
    },
    {
      what: "a design carrying a material this product does not declare",
      design: designWearing(paletteFinish("pal.alb"), UNDECLARED_TIER_ID),
    },
  ];

  it("puts at least one design on each arm, and every design on one of them", () => {
    const counted = CASES.map((one) => ({
      ...one,
      chosen: countCabinetsWearingAChosenFinish(one.design),
    }));
    const confirming = counted.filter((one) => one.chosen > 0);
    const silent = counted.filter((one) => one.chosen === 0);

    expect(confirming.length).toBeGreaterThanOrEqual(1);
    expect(silent.length).toBeGreaterThanOrEqual(1);
    expect(confirming.length + silent.length).toBe(CASES.length);
  });

  it("is silent where every cabinet already sits at its material's declared default", () => {
    // Both shapes of "nothing was chosen": a bare document and a fully painted one. The second is
    // what separates *"counts a chosen colour"* from *"counts a finish"*.
    expect(countCabinetsWearingAChosenFinish(KITCHEN_L_DESIGN)).toBe(0);
    expect(
      countCabinetsWearingAChosenFinish(
        designAllWearing(paletteFinish("pal.alb")),
      ),
    ).toBe(0);
  });

  it("counts a cabinet the customer moved off the default", () => {
    expect(
      countCabinetsWearingAChosenFinish(
        designWearing(paletteFinish("pal.antracit")),
      ),
    ).toBe(1);
  });
});

describe("the boundary the two rules meet at", () => {
  it("does not count a cabinet set explicitly to the colour that is already the default", () => {
    // A real choice the customer made, landing on PAL's *Alb*. The product cannot tell it from a
    // cabinet nobody touched and, under ADR 0081 decision 1, it does not try.
    expect(
      countCabinetsWearingAChosenFinish(
        designWearing(paletteFinish("pal.alb")),
      ),
    ).toBe(0);
  });

  it("counts #ECEEEB on an MDF kitchen, which is the deliberate over-warn", () => {
    // `sameFinish` compares a free colour's value by string equality and no second, case-folding
    // equality is introduced (ADR 0081 decision 1). The error is in the safe direction: it
    // over-warns, never under-warns.
    expect(
      countCabinetsWearingAChosenFinish(
        designWearing(freeColourFinish("#ECEEEB"), MDF_TIER_ID),
      ),
    ).toBe(1);
    expect(
      countCabinetsWearingAChosenFinish(
        designWearing(freeColourFinish("#eceeeb"), MDF_TIER_ID),
      ),
    ).toBe(0);
  });
});

describe("a material the product does not declare", () => {
  it("counts every carried finish rather than throwing", () => {
    // ADR 0081 decision 1b: an undeclared material declares no default, so nothing is comparable and
    // every carried finish is counted. 6G's recovery path keeps working (ADR 0072, ADR 0078
    // decision 3).
    const design = designWearing(paletteFinish("pal.alb"), UNDECLARED_TIER_ID);

    expect(() => countCabinetsWearingAChosenFinish(design)).not.toThrow();
    expect(countCabinetsWearingAChosenFinish(design)).toBe(1);
  });

  it("counts the whole finish-carrying population of the fixture", () => {
    const design: Design = {
      ...MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
      settings: {
        ...MDF_KITCHEN_WEARING_CHOSEN_COLOURS.settings,
        materialTierId: UNDECLARED_TIER_ID,
      },
    };
    const wearingSomething = design.placements.filter(
      (placement) => placement.body.finish !== undefined,
    ).length;

    expect(countCabinetsWearingAChosenFinish(design)).toBe(wearingSomething);
  });
});

describe("absence is not a chosen colour", () => {
  it("never counts a placement carrying no finish key", () => {
    expect(
      countCabinetsWearingAChosenFinish(
        designWearing(paletteFinish("pal.antracit")),
      ),
    ).toBe(1);
    expect(countCabinetsWearingAChosenFinish(KITCHEN_L_DESIGN)).toBe(0);
  });

  /** **The two guarantees this query stands on, asserted rather than assumed** (ADR 0084 decision 4).
   *  The query takes no catalogue, so a `canFinish: false` body is excluded by carrying nothing —
   *  not by a branch here. The day either guarantee moves, this query's silence about it is loud. */
  it("is upheld at the load seam, which strips a finish from a body that cannot wear one", () => {
    const stored = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.map((placement) =>
        placement.id === HOOD_PLACEMENT_ID
          ? {
              ...placement,
              body: {
                ...placement.body,
                finish: paletteFinish("pal.antracit"),
              },
            }
          : placement,
      ),
    };

    const loaded = migrateDesign(
      CURRENT_SCHEMA_VERSION,
      JSON.parse(JSON.stringify(stored)) as unknown,
      KITCHEN_L_BODY_CATALOG,
    );
    const hood = placementOf(loaded, HOOD_PLACEMENT_ID);

    expect(hood.body.finish).toBeUndefined();
    expect(countCabinetsWearingAChosenFinish(loaded)).toBe(0);
  });

  it("is upheld on insert, which refuses to carry a finish onto such a body", () => {
    // Real catalogue entries and a real record, not a hand-shaped pair: the guarantee is about what
    // the shipped declaration says, and a literal `canFinish: false` written here would assert only
    // that this test agrees with itself. The finishable body is the positive control — without it,
    // an implementation that carried nothing at all would pass.
    const painted = designWearing(paletteFinish("pal.antracit"));
    const wornRecord = recordOf(painted, FINISHABLE_ID);

    expect(wornRecord.finishKey).toBeDefined();
    expect(
      carriedAppearance(insertableBody("open-shelf"), wornRecord).finish,
    ).toBeUndefined();
    expect(
      carriedAppearance(insertableBody("base-cabinet"), wornRecord).finish,
    ).toEqual(paletteFinish("pal.antracit"));
  });
});

/**
 * **ADR 0086 decision 1's relation, under the three preconditions it is true beneath.**
 *
 * For a design **D** whose material resolves to a declared **M**, where every finish D carries is one
 * M offers, and for a declared target **T ≠ M**:
 *
 * ```
 * chosenCount(D) ≤ resolvedFinishCount(setMaterialTier(D, T))
 * resolvedFinishCount − chosenCount = the cabinets sitting exactly at M's declared default
 * ```
 *
 * **The preconditions are constraints on the generator, never a filter after it.** A filter that
 * rejected every case would leave a property passing vacuously, which is this project's own recorded
 * failure mode. The floor per arm below is the other half: at least one design where the difference
 * is zero and at least one where it is positive.
 */
describe("the two counts, tied together under their preconditions", () => {
  function finishArbitraryFor(material: Material): fc.Arbitrary<Finish> {
    const entries = paletteEntriesOf(material);
    if (entries.length === 0) return freeColourArbitrary();
    return fc.constantFrom(
      ...entries.map((entry) => paletteFinish(entry.entryId)),
    );
  }

  interface GeneratedPair {
    readonly current: Material;
    readonly target: Material;
    readonly worn: readonly (Finish | undefined)[];
  }

  function pairArbitrary(): fc.Arbitrary<GeneratedPair> {
    return fc.constantFrom(...MATERIALS).chain((current) =>
      fc.record({
        current: fc.constant(current),
        target: fc.constantFrom(
          ...MATERIALS.filter(
            (candidate) => candidate.materialId !== current.materialId,
          ),
        ),
        worn: fc.array(
          fc.option(finishArbitraryFor(current), { nil: undefined }),
          {
            minLength: KITCHEN_L_DESIGN.placements.length,
            maxLength: KITCHEN_L_DESIGN.placements.length,
          },
        ),
      }),
    );
  }

  function designFrom(pair: GeneratedPair): Design {
    return {
      ...KITCHEN_L_DESIGN,
      settings: {
        ...KITCHEN_L_DESIGN.settings,
        materialTierId: pair.current.materialId,
      },
      // The seeded placements carry no finish of their own — asserted below — so *not* painting one
      // leaves the placement bare rather than leaving a stale colour behind.
      placements: KITCHEN_L_DESIGN.placements.map((placement, index) => {
        const finish = pair.worn[index];
        return finish === undefined
          ? placement
          : { ...placement, body: { ...placement.body, finish } };
      }),
    };
  }

  it("starts from a seeded kitchen that carries no finish of its own", () => {
    // The generator paints; it does not overwrite. Without this the *"not painted"* arm would be
    // asserting about whatever colour the fixture happened to arrive wearing.
    expect(
      KITCHEN_L_DESIGN.placements.filter(
        (placement) => placement.body.finish !== undefined,
      ),
    ).toEqual([]);
  });

  it("holds over the generated pair space, with both arms non-empty", () => {
    const differences: number[] = [];

    fc.assert(
      fc.property(pairArbitrary(), (pair) => {
        const design = designFrom(pair);
        const chosen = countCabinetsWearingAChosenFinish(design);
        const applied = setMaterialTier({
          design,
          tierId: pair.target.materialId,
          availableTierIds: MATERIAL_IDS,
          occurredAt: OCCURRED_AT,
        });

        expect(applied.ok).toBe(true);
        if (!applied.ok) return;
        const resolved = applied.effect.resolvedFinishCount;
        const atDeclaredDefault = design.placements.filter(
          (placement) =>
            placement.body.finish !== undefined &&
            sameFinish(placement.body.finish, pair.current.defaultFinish),
        ).length;

        expect(chosen).toBeLessThanOrEqual(resolved);
        expect(resolved - chosen).toBe(atDeclaredDefault);
        differences.push(atDeclaredDefault);
      }),
    );

    expect(
      differences.filter((one) => one === 0).length,
    ).toBeGreaterThanOrEqual(1);
    expect(differences.filter((one) => one > 0).length).toBeGreaterThanOrEqual(
      1,
    );
  });
});

/** A catalogue entry as the insert command holds it, thrown rather than `undefined` so a build id
 *  that stopped being insertable fails at the lookup instead of passing an assertion about nothing. */
function insertableBody(buildId: string): InsertableBody {
  const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
  if (!definition) throw new Error(`the catalogue holds no "${buildId}"`);
  const body = toInsertableBody(buildId, definition);
  if (!body) throw new Error(`"${buildId}" is not an insertable body`);
  return body;
}

function recordOf(design: Design, id: string): PlacementRecord {
  const record = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG).find(
    (candidate) => candidate.id === id,
  );
  if (!record) throw new Error(`no placement record "${id}" in this design`);
  return record;
}

function placementOf(design: Design, id: string): DesignPlacement {
  const placement = design.placements.find((candidate) => candidate.id === id);
  if (!placement) throw new Error(`no placement "${id}" in this design`);
  return placement;
}
