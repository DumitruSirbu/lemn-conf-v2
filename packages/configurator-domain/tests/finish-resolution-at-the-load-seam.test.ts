// **Wave 6Q-b's load half: `migrateDesign` resolves before `assertDesignValidForCatalog` refuses.**
//
// ADR 0078 decision 2 is the whole file. The refusal code `PLACEMENT_WEARS_UNOFFERED_FINISH` is a
// refusal by ADR 0069 decision 2's membership rule, `validateDesignForCatalog` is shared by the API
// write path and the load path, and the documents it would refuse **exist** — since wave 6P the
// panel still writes *Lut* and *Salvie*, free colours, onto what is by default a PAL kitchen, and
// those rows are in the preview database (ADR 0054). A load that refuses is a dead `/d/{id}` link.
//
// So the ordering that matters is asserted here rather than read off the diff: the load never
// refuses, and the load's own output validates clean. The order between the *two* normalisations is
// a separate question, and ADR 0085 decision 6 answers it — they commute, so what is asserted at the
// foot of this file is the invariant that makes them commute rather than the order itself.
import { describe, expect, it } from "vitest";
import fc from "fast-check";

import type { Design, DesignPlacement } from "../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import {
  materialById,
  materialOffersFinish,
  MATERIALS,
  PALETTE_ENTRIES,
  paletteFinish,
  sameFinish,
  type Finish,
} from "../src/materials.js";
import {
  CURRENT_SCHEMA_VERSION,
  migrateDesign,
} from "../src/migrate-design.js";
import { validateDesignForCatalog } from "../src/validate-design.js";
import {
  freeColourPairArbitrary,
  PALETTE_PAIRS,
} from "./support/material-finish-pairs.js";
import {
  CHOSEN_CLAY,
  CHOSEN_SAGE,
  finishOf,
  HOOD_PLACEMENT_ID,
  MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
  MDF_TIER_ID,
  UNFINISHED_PLACEMENT_ID,
  VENEER_TIER_ID,
} from "./support/mdf-kitchen-wearing-chosen-colours.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;

/** A finishable seeded body, and a `canFinish: false` one, so a test can ask about either. */
const FINISHABLE_ID = "p0";

/** A tier id the schema accepts and this product declares no material for — ADR 0072's reachable
 *  state, which wave 6G's recovery path leaves behind. */
const UNDECLARED_TIER_ID = "material.laminate";

/** The stored row as a load actually meets it: JSON, at the version this build writes. */
function load(design: Design): Design {
  return migrateDesign(
    CURRENT_SCHEMA_VERSION,
    JSON.parse(JSON.stringify(design)) as unknown,
    CATALOG,
  );
}

function wearing(options: {
  readonly finish?: Finish;
  readonly onId?: string;
  readonly materialTierId?: string;
}): Design {
  const onId = options.onId ?? FINISHABLE_ID;
  const settings =
    options.materialTierId === undefined
      ? KITCHEN_L_DESIGN.settings
      : {
          ...KITCHEN_L_DESIGN.settings,
          materialTierId: options.materialTierId,
        };
  return {
    ...KITCHEN_L_DESIGN,
    settings,
    placements: KITCHEN_L_DESIGN.placements.map((placement) =>
      placement.id === onId && options.finish
        ? { ...placement, body: { ...placement.body, finish: options.finish } }
        : placement,
    ),
  };
}

describe("the load seam resolves a finish the document's material does not offer", () => {
  it("rewrites it to that material's declared default", () => {
    const stored = wearing({
      finish: paletteFinish("pal.antracit"),
      materialTierId: VENEER_TIER_ID,
    });

    expect(finishOf(load(stored), FINISHABLE_ID)).toEqual(
      materialById(VENEER_TIER_ID).defaultFinish,
    );
  });

  it("leaves a finish the material does offer exactly as it was stored", () => {
    const stored = wearing({
      finish: paletteFinish("veneer.nuc"),
      materialTierId: VENEER_TIER_ID,
    });

    expect(finishOf(load(stored), FINISHABLE_ID)).toEqual(
      paletteFinish("veneer.nuc"),
    );
  });

  // ADR 0078 decision 5, and the phrasing matters: "every placement wears an offered finish" is
  // true of a resolution that filled a default onto all fourteen bodies wearing nothing.
  it("adds no finish to a placement that stored none", () => {
    const loaded = load(KITCHEN_L_DESIGN);

    expect(loaded.placements.some((placement) => placement.body.finish)).toBe(
      false,
    );
    expect(loaded.placements).toHaveLength(KITCHEN_L_DESIGN.placements.length);
  });

  // ADR 0078 decision 3. `DesignSettingsSchema` validates `materialTierId` for shape only, so this
  // row is reachable, and wave 6G's recovery path stands on it loading.
  it("resolves nothing and throws nothing under a material the product does not declare", () => {
    const stored = wearing({
      finish: paletteFinish("pal.antracit"),
      materialTierId: UNDECLARED_TIER_ID,
    });

    const loaded = load(stored);

    expect(loaded.settings?.materialTierId).toBe(UNDECLARED_TIER_ID);
    expect(finishOf(loaded, FINISHABLE_ID)).toEqual(
      paletteFinish("pal.antracit"),
    );
  });

  // A load that changes nothing must not rewrite the object a later save is diffed against, so the
  // resolution is a fixed point on its own output — for a document it left alone and, below, for one
  // it rewrote.
  it("changes nothing on a document already wearing what its material offers", () => {
    const stored = wearing({
      finish: paletteFinish("veneer.stejar"),
      materialTierId: VENEER_TIER_ID,
    });

    expect(load(stored)).toEqual(stored);
  });

  it("is a fixed point on its own output for every material", () => {
    for (const material of MATERIALS) {
      const stored = wearing({
        finish: paletteFinish("pal.gri-havanna"),
        materialTierId: material.materialId,
      });
      const once = load(stored);

      expect(migrateDesign(CURRENT_SCHEMA_VERSION, once, CATALOG)).toEqual(
        once,
      );
    }
  });
});

// **A `canFinish: false` body is outside the pair space, and stays outside it.**
//
// The end state is what these assert, deliberately: the strip is unconditional and runs on every
// load, so swapping the two normalisations would put `veneer.stejar` on the hood and then take it
// straight off again — the same document. What is *not* interchangeable is where the pair sits
// relative to `assertDesignValidForCatalog`, and the sweep at the foot of this file is what measures
// that. The order between the strip and the resolution is **not** load-bearing today (ADR 0085
// decision 6) — the two commute, and the invariant that makes them commute is asserted at the foot
// of this file rather than defended by a comment.
describe("a frontless body loads carrying no finish, whatever the material offers", () => {
  it("loads a hood stored wearing a PAL decor on a veneer kitchen carrying no finish at all", () => {
    const stored = wearing({
      finish: paletteFinish("pal.alb"),
      onId: HOOD_PLACEMENT_ID,
      materialTierId: VENEER_TIER_ID,
    });

    const loaded = load(stored);

    expect(finishOf(loaded, HOOD_PLACEMENT_ID)).toBeUndefined();
    expect(finishOf(loaded, HOOD_PLACEMENT_ID)).not.toEqual(
      materialById(VENEER_TIER_ID).defaultFinish,
    );
  });

  it("strips a frontless body's finish whatever the material would have resolved it to", () => {
    for (const material of MATERIALS) {
      const stored = wearing({
        finish: paletteFinish("pal.nuc-warmia"),
        onId: HOOD_PLACEMENT_ID,
        materialTierId: material.materialId,
      });

      expect(finishOf(load(stored), HOOD_PLACEMENT_ID)).toBeUndefined();
    }
  });

  // **The reachability discharge, asserted rather than argued** (ADR 0084 decisions 1 and 5). The
  // reason `setMaterialTier`'s fixture may hold a bare hood — and the reason the command needs no
  // `BodyCatalog` to reach a count of two — is that *no document reaching it has a frontless body
  // wearing a finish*. The guarantee is this one, and it is only a guarantee if it holds at **every**
  // version: keyed at a version the strip would miss the documents this build itself writes, which is
  // precisely the defect wave 6P's QA measured.
  it.each([1, 2, 3, 4, CURRENT_SCHEMA_VERSION])(
    "loads a frontless body bare at schema version %i, whatever it stored",
    (version) => {
      for (const material of MATERIALS) {
        const stored = wearing({
          finish: paletteFinish("pal.alb"),
          onId: HOOD_PLACEMENT_ID,
          materialTierId: material.materialId,
        });

        const loaded = migrateDesign(
          version,
          JSON.parse(JSON.stringify(stored)) as unknown,
          CATALOG,
        );

        expect(finishOf(loaded, HOOD_PLACEMENT_ID)).toBeUndefined();
      }
    },
  );

  it("strips every frontless body the catalogue declares, not only the hood", () => {
    const frontless = KITCHEN_L_DESIGN.placements.filter(
      (placement) => CATALOG.get(placement.body.buildId)?.canFinish === false,
    );
    expect(frontless.length).toBeGreaterThan(1);

    for (const placement of frontless) {
      const stored = wearing({
        finish: paletteFinish("pal.alb"),
        onId: placement.id,
        materialTierId: VENEER_TIER_ID,
      });

      expect(finishOf(load(stored), placement.id)).toBeUndefined();
    }
  });
});

describe("the wave's own fixture, through the load seam", () => {
  const loaded = load(MDF_KITCHEN_WEARING_CHOSEN_COLOURS);
  const mdfDefault = materialById(MDF_TIER_ID).defaultFinish;

  it("keeps the two chosen free colours, which MDF's picker offers", () => {
    expect(finishOf(loaded, "p0")).toEqual(CHOSEN_CLAY);
    expect(finishOf(loaded, "p1")).toEqual(CHOSEN_SAGE);
  });

  it("resolves the two woods, which MDF's picker offers none of", () => {
    expect(finishOf(loaded, "p4")).toEqual(mdfDefault);
    expect(finishOf(loaded, "p5")).toEqual(mdfDefault);
  });

  it("leaves the hood bare and the unfinished body bare", () => {
    expect(finishOf(loaded, HOOD_PLACEMENT_ID)).toBeUndefined();
    expect(finishOf(loaded, UNFINISHED_PLACEMENT_ID)).toBeUndefined();
  });
});

// **The refusal is unreachable from the load path by construction.** This is the constraint that is
// not recoverable by a follow-up commit: if the refusal shipped without the resolution ordered
// before it, every stored row already holding an unoffered finish would become a dead link.
describe("no stored document is refused for wearing a finish its material does not offer", () => {
  function assertLoadsAndValidatesClean(design: Design): void {
    const loaded = load(design);
    expect(validateDesignForCatalog(loaded, CATALOG)).toEqual([]);
  }

  it("holds over every material against every declared palette entry", () => {
    expect(PALETTE_PAIRS.length).toBe(
      MATERIALS.length * PALETTE_ENTRIES.length,
    );
    for (const pair of PALETTE_PAIRS) {
      assertLoadsAndValidatesClean(
        wearing({
          finish: pair.finish,
          materialTierId: pair.material.materialId,
        }),
      );
    }
  });

  it("holds over every material against a generated free colour", () => {
    fc.assert(
      fc.property(freeColourPairArbitrary(), (pair) => {
        assertLoadsAndValidatesClean(
          wearing({
            finish: pair.finish,
            materialTierId: pair.material.materialId,
          }),
        );
      }),
    );
  });

  // The property in the phrasing that a helpful resolution cannot pass: every finish a placement
  // **carries** is offered, and every placement carrying none still carries none.
  it("carries only offered finishes, and leaves every bare placement bare", () => {
    const bareBefore = (design: Design): readonly string[] =>
      design.placements
        .filter((placement) => placement.body.finish === undefined)
        .map((placement) => placement.id);

    for (const pair of PALETTE_PAIRS) {
      const stored = wearing({
        finish: pair.finish,
        materialTierId: pair.material.materialId,
      });
      const loaded = load(stored);

      for (const placement of loaded.placements) {
        assertCarriedFinishIsOffered(placement, pair.material.materialId);
      }
      expect(bareBefore(loaded)).toEqual(bareBefore(stored));
      expect(bareBefore(stored).length).toBeGreaterThan(0);
    }
  });

  function assertCarriedFinishIsOffered(
    placement: DesignPlacement,
    materialTierId: string,
  ): void {
    const carried = placement.body.finish;
    if (carried === undefined) return;
    expect(materialOffersFinish(materialById(materialTierId), carried)).toBe(
      true,
    );
  }
});

// **The invariant that makes the strip/resolution ordering immaterial** — ADR 0085 decision 6 and
// its acceptance criterion 6.
//
// Wave 6Q-b's suite carried a "never reset" criterion saying the strip must run first. QA swapped
// the two normalisations and measured zero new failures, correctly: the two commute on every input,
// because `resolveFinishesTheMaterialDoesNotOffer` only ever maps a new value over placements that
// already carry a `finish` key — it adds none and removes none (ADR 0078 decision 5) — and the
// strip's predicate reads a finish's *presence* and never its value. A criterion no test can fail is
// not a criterion; this is what replaces it, and it can fail.
//
// **Measured at the load seam, on documents the strip provably does not touch.** Nothing exports the
// resolution on its own, and it does not need to be: a document whose only finishes sit on bodies
// the catalogue says can wear one leaves the strip a no-op, so every change to the set of placements
// carrying a `finish` key between the stored row and the loaded one is the resolution's. That the
// strip is a no-op is asserted rather than assumed, below.
describe("the resolution changes the set of placements carrying a finish key not at all", () => {
  /** Split by the strip's own predicate, so the two sets are exactly its reach and its complement. */
  const FINISHABLE_IDS = KITCHEN_L_DESIGN.placements
    .filter(
      (placement) => CATALOG.get(placement.body.buildId)?.canFinish !== false,
    )
    .map((placement) => placement.id);
  const FRONTLESS_IDS = KITCHEN_L_DESIGN.placements
    .filter(
      (placement) => CATALOG.get(placement.body.buildId)?.canFinish === false,
    )
    .map((placement) => placement.id);

  /** Pinned as literals so the sweep cannot pass over nothing: a fixture that stopped carrying
   *  finishes, or a catalogue that stopped declaring a frontless body, fails here rather than
   *  passing vacuously. */
  const FINISHABLE_COUNT = 23;
  const FRONTLESS_COUNT = 3;

  /** The seeded kitchen wearing one finish on every body that can take one, and none anywhere else.
   *  Both branches of the invariant are present in a single document: 23 keys to preserve and 3
   *  absences to preserve.
   *
   *  **They were 19 and 7 until the owner's corner ruling of 2026-09-09.** The four corner bodies
   *  gained `canFinish`, so they moved from the strip's reach into its complement; the three that
   *  stay behind are the open shelf, the hood and the freestanding fridge. The split is derived from
   *  the catalogue above and only these two totals are literal, so the move shows up here as two
   *  numbers rather than as a silently smaller sweep. */
  function wearingOnEveryFinishableBody(
    finish: Finish,
    materialTierId: string,
  ): Design {
    return {
      ...KITCHEN_L_DESIGN,
      settings: { ...KITCHEN_L_DESIGN.settings, materialTierId },
      placements: KITCHEN_L_DESIGN.placements.map((placement) =>
        FINISHABLE_IDS.includes(placement.id)
          ? { ...placement, body: { ...placement.body, finish } }
          : placement,
      ),
    };
  }

  function idsCarryingAFinish(design: Design): readonly string[] {
    return design.placements
      .filter((placement) => placement.body.finish !== undefined)
      .map((placement) => placement.id);
  }

  /** One document through the seam, and what each branch of the invariant did on it. */
  function measureOnePair(pair: {
    readonly material: { readonly materialId: string };
    readonly finish: Finish;
  }): { readonly rewritten: number; readonly absencesPreserved: number } {
    const stored = wearingOnEveryFinishableBody(
      pair.finish,
      pair.material.materialId,
    );
    expect(idsCarryingAFinish(stored)).toEqual(FINISHABLE_IDS);

    const loaded = load(stored);
    expect(idsCarryingAFinish(loaded)).toEqual(idsCarryingAFinish(stored));

    const rewritten = loaded.placements.filter((placement) => {
      const carried = placement.body.finish;
      return carried !== undefined && !sameFinish(carried, pair.finish);
    }).length;
    const absencesPreserved = FRONTLESS_IDS.filter(
      (id) => finishOf(loaded, id) === undefined,
    ).length;
    return { rewritten, absencesPreserved };
  }

  it("splits the seeded kitchen into the counts these sweeps depend on", () => {
    expect(FINISHABLE_IDS).toHaveLength(FINISHABLE_COUNT);
    expect(FRONTLESS_IDS).toHaveLength(FRONTLESS_COUNT);
    expect(KITCHEN_L_DESIGN.placements).toHaveLength(
      FINISHABLE_COUNT + FRONTLESS_COUNT,
    );
  });

  it("preserves every key and every absence over the whole declared pair space", () => {
    expect(PALETTE_PAIRS).toHaveLength(
      MATERIALS.length * PALETTE_ENTRIES.length,
    );

    const measured = PALETTE_PAIRS.map((pair) => ({
      offered: materialOffersFinish(pair.material, pair.finish),
      ...measureOnePair(pair),
    }));

    // **Per pair, and predicted from the offer rather than from a list kept beside it.** A pair the
    // material offers moves nothing; a pair it does not moves all 23 keys. Neither branch may move a
    // key *count*, which is the invariant, and neither may be empty.
    for (const pair of measured) {
      expect({
        rewritten: pair.rewritten,
        absences: pair.absencesPreserved,
      }).toEqual({
        rewritten: pair.offered ? 0 : FINISHABLE_COUNT,
        absences: FRONTLESS_COUNT,
      });
    }

    // **The split itself, pinned, so one surviving pair cannot carry the sweep.** Eight of the
    // twenty-four are offered — melamine's six PAL decors and veneer's two veneer decors, MDF
    // offering no palette entry at all — so sixteen rewrite every key and eight rewrite none.
    // Measured 2026-09-05.
    expect(
      measured.filter((pair) => pair.rewritten === FINISHABLE_COUNT),
    ).toHaveLength(16);
    expect(measured.filter((pair) => pair.rewritten === 0)).toHaveLength(8);
  });

  it("preserves every key and every absence over a generated free colour on every material", () => {
    fc.assert(
      fc.property(freeColourPairArbitrary(), (pair) => {
        const measured = measureOnePair(pair);

        // Predicted from the offer here too: MDF's picker offers a free colour and moves nothing,
        // the two decor lists offer none and move all 23 keys. Either way the 3 absences survive.
        expect({
          rewritten: measured.rewritten,
          absences: measured.absencesPreserved,
        }).toEqual({
          rewritten: materialOffersFinish(pair.material, pair.finish)
            ? 0
            : FINISHABLE_COUNT,
          absences: FRONTLESS_COUNT,
        });
      }),
    );
  });
});
