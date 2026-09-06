// **Adversarial QA for wave 6Q-b's command half.** Written to falsify.
//
// The shipped `commands/material-finish-reset.test.ts` measures one direction of one fixture. What
// this file attacks is the generalisation: the count against *which placements actually moved* over
// **every** tier transition (not the two the fixture reads), the applied-versus-stored tier at every
// seam rather than at one, the "moves nothing" comparison against every target material rather than
// veneer alone, and the reset target as a **closed set** — which is the only phrasing that can see
// ADR 0078 decision 4's forbidden swatch-derived colour, since a colour built from a decor's hex is
// a finish MDF genuinely offers.
import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { setFinish } from "../src/commands/set-appearance.js";
import { setMaterialTier } from "../src/commands/set-whole-kitchen-settings.js";
import type { Design, DesignPlacement } from "../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import {
  materialById,
  materialOffersFinish,
  MATERIAL_IDS,
  MATERIALS,
  PALETTE_ENTRIES,
  paletteFinish,
  sameFinish,
  type Finish,
} from "../src/materials.js";
import {
  deriveColumns,
  derivePlacementRecords,
  type FrozenMapDocument,
  type PlacementRecord,
} from "../src/void-engine.js";
import { validateDesignForCatalog } from "../src/validate-design.js";
import { OCCURRED_AT } from "./support/commands.js";
import {
  freeColourPairArbitrary,
  PALETTE_PAIRS,
} from "./support/material-finish-pairs.js";
import {
  CHOSEN_CLAY,
  CHOSEN_SAGE,
  HOOD_PLACEMENT_ID,
  MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
  MDF_TIER_ID,
  UNFINISHED_PLACEMENT_ID,
  VENEER_TIER_ID,
} from "./support/mdf-kitchen-wearing-chosen-colours.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const PAL_TIER_ID = "material.melamine";
const UNDECLARED_TIER_ID = "material.laminate";

/** Every declared tier plus the undeclared one, so no call is refused for membership and the guard
 *  never stands in for the behaviour under test. */
const EVERY_OFFERED_TIER_ID: readonly string[] = [
  ...MATERIAL_IDS,
  UNDECLARED_TIER_ID,
];

function apply(design: Design, tierId: string) {
  const result = setMaterialTier({
    design,
    tierId,
    availableTierIds: EVERY_OFFERED_TIER_ID,
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) {
    throw new Error(`setMaterialTier refused: ${result.reason.code}`);
  }
  return result;
}

function finishOn(design: Design, id: string): Finish | undefined {
  return design.placements.find((placement) => placement.id === id)?.body
    .finish;
}

/** Which placements' finishes actually differ, by id — the observation a count cannot fake. */
function movedIds(before: Design, after: Design): readonly string[] {
  return after.placements
    .filter((placement, index) => {
      const was = before.placements[index]?.body.finish;
      const now = placement.body.finish;
      if (was === undefined || now === undefined) return was !== now;
      return !sameFinish(was, now);
    })
    .map((placement) => placement.id);
}

// **Attack 1 — the count is the number of placements that moved, over every transition.**
//
// ADR 0084 decision 3 records that with the hood bare the count alone no longer separates
// "applied" from "stored", and moves the discrimination onto *which* placements moved. That is
// asserted for two transitions in the shipped suite. There are nine.
describe("resolvedFinishCount names exactly the placements that moved, for every transition", () => {
  const startingPoints: readonly (readonly [string, Design])[] = [
    [
      "the MDF kitchen wearing chosen colours",
      MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
    ],
    [
      "the same kitchen already resolved onto veneer",
      apply(MDF_KITCHEN_WEARING_CHOSEN_COLOURS, VENEER_TIER_ID).design,
    ],
    [
      "the same kitchen already resolved onto PAL",
      apply(MDF_KITCHEN_WEARING_CHOSEN_COLOURS, PAL_TIER_ID).design,
    ],
  ];

  it.each(
    startingPoints.flatMap(([label, design]) =>
      MATERIAL_IDS.map((tierId) => [label, tierId, design] as const),
    ),
  )("from %s to %s", (_label, tierId, design) => {
    const result = apply(design, tierId);

    expect(result.effect.resolvedFinishCount).toBe(
      movedIds(design, result.design).length,
    );
  });

  // The transitions are not all zero — the sweep above would pass vacuously on an implementation
  // that never resolves anything. Both branches counted, both non-empty.
  it("is a sweep with both branches populated", () => {
    const counts = startingPoints.flatMap(([, design]) =>
      MATERIAL_IDS.map(
        (tierId) => apply(design, tierId).effect.resolvedFinishCount,
      ),
    );

    expect(counts.filter((count) => count > 0).length).toBeGreaterThan(0);
    expect(counts.filter((count) => count === 0).length).toBeGreaterThan(0);
    expect(Math.max(...counts)).toBeGreaterThanOrEqual(2);
  });
});

// **Attack 2 — the applied tier wins over the stored one, at every combination and not only where
// the fixture happens to disagree.**
//
// The mutation the implementer ran (resolve against `design.settings.materialTierId`) is verified
// independently here by asserting the *value* every moved placement lands on: it is always the
// **applied** material's declared default, for every stored material.
describe("the resolution runs against the tier being applied", () => {
  it.each(
    MATERIAL_IDS.flatMap((storedId) =>
      MATERIAL_IDS.map((appliedId) => [storedId, appliedId] as const),
    ),
  )("stored %s, applied %s", (storedId, appliedId) => {
    const stored = apply(MDF_KITCHEN_WEARING_CHOSEN_COLOURS, storedId).design;
    const result = apply(stored, appliedId);
    const appliedDefault = materialById(appliedId).defaultFinish;

    for (const id of movedIds(stored, result.design)) {
      const landed = finishOn(result.design, id);
      expect({
        id,
        landedOnAppliedDefault: landed && sameFinish(landed, appliedDefault),
      }).toEqual({
        id,
        landedOnAppliedDefault: true,
      });
    }
    // And the end state is judged against the applied material, never the stored one.
    for (const placement of result.design.placements) {
      const carried = placement.body.finish;
      if (carried === undefined) continue;
      expect({
        id: placement.id,
        offered: materialOffersFinish(materialById(appliedId), carried),
      }).toEqual({ id: placement.id, offered: true });
    }
  });

  // "Setting the tier that is already set is not a refusal, and must not become a silent skip
  // either" — asserted on a document that is *already violating*, which is the only case where the
  // skip and the resolution differ.
  it("resolves a document already carrying an unoffered finish when the tier is re-applied", () => {
    const violating: Design = {
      ...MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
      settings: {
        ...MDF_KITCHEN_WEARING_CHOSEN_COLOURS.settings,
        materialTierId: VENEER_TIER_ID,
      },
    };

    const result = apply(violating, VENEER_TIER_ID);

    expect(result.effect.resolvedFinishCount).toBe(2);
    expect(finishOn(result.design, "p0")).toEqual(
      materialById(VENEER_TIER_ID).defaultFinish,
    );
    expect(finishOn(result.design, "p1")).toEqual(
      materialById(VENEER_TIER_ID).defaultFinish,
    );
  });
});

// **Attack 3 — the reset target is a closed set of two values, which is what forbids the swatch.**
//
// ADR 0078 decision 4 forbids constructing a free colour from a palette entry's swatch hex. Such a
// colour is *offered* by MDF, so "every carried finish is offered" cannot see it. What sees it is:
// a placement carries either the finish it already wore or the applied material's declared
// `defaultFinish`, and there is no third possibility.
describe("no path produces a finish that is neither the declared default nor the one already worn", () => {
  function designWearing(finish: Finish): Design {
    return {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.map((placement) =>
        placement.id === "p0"
          ? { ...placement, body: { ...placement.body, finish } }
          : placement,
      ),
    };
  }

  function assertClosed(before: Design, tierId: string): void {
    const after = apply(before, tierId).design;
    const declaredDefault = materialById(tierId).defaultFinish;

    for (const [index, placement] of after.placements.entries()) {
      const carried = placement.body.finish;
      if (carried === undefined) continue;
      const was = before.placements[index]?.body.finish;
      const isUnchanged = was !== undefined && sameFinish(carried, was);
      expect({
        id: placement.id,
        closed: isUnchanged || sameFinish(carried, declaredDefault),
      }).toEqual({ id: placement.id, closed: true });
    }
  }

  it("holds over every declared pair", () => {
    expect(PALETTE_PAIRS.length).toBe(
      MATERIALS.length * PALETTE_ENTRIES.length,
    );
    for (const pair of PALETTE_PAIRS) {
      assertClosed(designWearing(pair.finish), pair.material.materialId);
    }
  });

  it("holds over a generated free colour on every material", () => {
    fc.assert(
      fc.property(freeColourPairArbitrary(), (pair) => {
        assertClosed(designWearing(pair.finish), pair.material.materialId);
      }),
    );
  });

  it("holds over the wave's own fixture, into every material", () => {
    for (const tierId of MATERIAL_IDS) {
      assertClosed(MDF_KITCHEN_WEARING_CHOSEN_COLOURS, tierId);
    }
  });
});

// **Attack 4 — absence stays absence, phrased so a helpful default cannot pass.**
//
// Over the generated pair space, and asserted as *set equality of the bare ids*, not as a count.
describe("every placement carrying no finish still carries none", () => {
  function bareIds(design: Design): readonly string[] {
    return design.placements
      .filter((placement) => placement.body.finish === undefined)
      .map((placement) => placement.id);
  }

  it("holds over every declared pair, on a document with fourteen bare bodies", () => {
    for (const pair of PALETTE_PAIRS) {
      const before: Design = {
        ...KITCHEN_L_DESIGN,
        placements: KITCHEN_L_DESIGN.placements.map((placement) =>
          placement.id === "p0"
            ? { ...placement, body: { ...placement.body, finish: pair.finish } }
            : placement,
        ),
      };
      expect(bareIds(before).length).toBeGreaterThan(10);

      expect(bareIds(apply(before, pair.material.materialId).design)).toEqual(
        bareIds(before),
      );
    }
  });

  it("holds over a generated free colour", () => {
    fc.assert(
      fc.property(freeColourPairArbitrary(), (pair) => {
        const before: Design = {
          ...KITCHEN_L_DESIGN,
          placements: KITCHEN_L_DESIGN.placements.map((placement) =>
            placement.id === "p0"
              ? {
                  ...placement,
                  body: { ...placement.body, finish: pair.finish },
                }
              : placement,
          ),
        };

        expect(bareIds(apply(before, pair.material.materialId).design)).toEqual(
          bareIds(before),
        );
      }),
    );
  });

  it("leaves the frontless body and the bare finishable body bare, into every material", () => {
    for (const tierId of MATERIAL_IDS) {
      const after = apply(MDF_KITCHEN_WEARING_CHOSEN_COLOURS, tierId).design;

      expect(finishOn(after, HOOD_PLACEMENT_ID)).toBeUndefined();
      expect(finishOn(after, UNFINISHED_PLACEMENT_ID)).toBeUndefined();
    }
  });
});

// **Attack 5 — "the reset moves nothing", against every target material and with the design's own
// frozen map fed to `deriveColumns` rather than an empty one.**
//
// The shipped assertion passes `{}` as the stored `FrozenMapDocument`, which neutralises
// `columnExtents` — the one document field a depth or width change would show up in. This runs the
// same comparison with the design's real map and over all three materials.
describe("the reset moves the finish, the setting and the clock, and nothing else", () => {
  const NEUTRALISED = "«neutralised»";

  function withoutFinish(placement: DesignPlacement): DesignPlacement {
    const body = { ...placement.body };
    delete body.finish;
    return { ...placement, body };
  }

  function neutralisedDocument(design: Design): unknown {
    return {
      ...design,
      updatedAt: NEUTRALISED,
      settings: { ...design.settings, materialTierId: NEUTRALISED },
      placements: design.placements.map(withoutFinish),
    };
  }

  function withoutFinishKey(record: PlacementRecord): PlacementRecord {
    const stripped = { ...record };
    delete stripped.finishKey;
    return stripped;
  }

  function recordsOf(design: Design): PlacementRecord[] {
    return derivePlacementRecords(design, CATALOG);
  }

  /** The document's **own** frozen map, rather than the `{}` the shipped comparison passes. `{}`
   *  neutralises `columnExtents` and `emptyColumns` — the two document fields a width or depth change
   *  would land in — so the columns comparison it feeds is blind to exactly the fields the criterion
   *  wants proved unmoved. */
  function frozenMapOf(design: Design): FrozenMapDocument {
    return {
      emptyColumns: design.emptyColumns,
      columnExtents: design.columnExtents,
    };
  }

  it.each(MATERIAL_IDS)(
    "into %s, the rest of the document is deep-equal",
    (tierId) => {
      const before = MDF_KITCHEN_WEARING_CHOSEN_COLOURS;
      const after = apply(before, tierId).design;

      expect(neutralisedDocument(after)).toEqual(neutralisedDocument(before));
    },
  );

  it.each(MATERIAL_IDS)(
    "into %s, the derived records match once finishKey is neutralised",
    (tierId) => {
      const before = MDF_KITCHEN_WEARING_CHOSEN_COLOURS;
      const after = apply(before, tierId).design;

      expect(recordsOf(after).map(withoutFinishKey)).toEqual(
        recordsOf(before).map(withoutFinishKey),
      );
    },
  );

  it.each(MATERIAL_IDS)(
    "into %s, the columns match with nothing neutralised",
    (tierId) => {
      const before = MDF_KITCHEN_WEARING_CHOSEN_COLOURS;
      const after = apply(before, tierId).design;

      expect(
        deriveColumns(recordsOf(after), frozenMapOf(after), after.room),
      ).toEqual(
        deriveColumns(recordsOf(before), frozenMapOf(before), before.room),
      );
    },
  );

  // Named fields, as a second reading of the same claim: nothing a geometry wave owns may move.
  it.each(MATERIAL_IDS)(
    "into %s, no width, seat depth, position or extent moves",
    (tierId) => {
      const before = MDF_KITCHEN_WEARING_CHOSEN_COLOURS;
      const after = apply(before, tierId).design;

      const geometryOf = (design: Design) =>
        design.placements.map((placement) => ({
          id: placement.id,
          wall: placement.wall,
          alongMm: placement.alongMm,
          y0Mm: placement.y0Mm,
          widthMm: placement.body.widthMm,
          heightMm: placement.body.heightMm,
          seatDepthMm: placement.body.seatDepthMm,
          buildId: placement.body.buildId,
        }));

      expect(geometryOf(after)).toEqual(geometryOf(before));
      expect(after.emptyColumns).toEqual(before.emptyColumns);
      expect(after.columnExtents).toEqual(before.columnExtents);
      expect(after.room).toEqual(before.room);
      expect(after.createdAt).toBe(before.createdAt);
    },
  );

  // One `updatedAt` across the whole document — a per-cabinet cascade writing its own clock would
  // show up as more than one. The document holds one field, so the observable is that the resolution
  // did not stamp a different value than the settings write did.
  it("stamps exactly one updatedAt, the caller's occurredAt", () => {
    const after = apply(
      MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
      VENEER_TIER_ID,
    ).design;

    expect(after.updatedAt).toBe(OCCURRED_AT);
  });
});

// **Attack 6 — the seams where the resolution must not run at all.**
describe("nothing is resolved where nothing may be", () => {
  it("hands the caller's own design back untouched when the tier is refused", () => {
    const result = setMaterialTier({
      design: MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
      tierId: VENEER_TIER_ID,
      availableTierIds: [MDF_TIER_ID],
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(false);
    expect(result.design).toBe(MDF_KITCHEN_WEARING_CHOSEN_COLOURS);
  });

  it("hands the caller's own design back untouched when the timestamp is refused", () => {
    const result = setMaterialTier({
      design: MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
      tierId: VENEER_TIER_ID,
      availableTierIds: EVERY_OFFERED_TIER_ID,
      occurredAt: "not a timestamp",
    });

    expect(result.ok).toBe(false);
    expect(result.design).toBe(MDF_KITCHEN_WEARING_CHOSEN_COLOURS);
  });

  // ADR 0078 decision 3: the caller's book offered the id, the domain declares nothing for it, so
  // the setting is written and no finish is corrected against a material nobody can look up.
  it("writes the setting and resolves nothing under an undeclared tier", () => {
    const result = apply(
      MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
      UNDECLARED_TIER_ID,
    );

    expect(result.effect.resolvedFinishCount).toBe(0);
    expect(result.design.settings?.materialTierId).toBe(UNDECLARED_TIER_ID);
    expect(finishOn(result.design, "p0")).toEqual(CHOSEN_CLAY);
    expect(finishOn(result.design, "p1")).toEqual(CHOSEN_SAGE);
    expect(finishOn(result.design, "p4")).toEqual(
      paletteFinish("veneer.stejar"),
    );
  });

  // "Returns the design it was given when nothing is owed — including its `placements` array by
  // identity". Unlike the load seam, this claim *is* observable here, because the command is a pure
  // function of an object the caller already holds.
  it("returns the applied design's placements array by identity when nothing is owed", () => {
    const bare = apply(KITCHEN_L_DESIGN, VENEER_TIER_ID);

    expect(bare.effect.resolvedFinishCount).toBe(0);
    expect(bare.design.placements).toBe(KITCHEN_L_DESIGN.placements);
  });

  it("returns the placements array by identity under an undeclared tier too", () => {
    const result = apply(
      MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
      UNDECLARED_TIER_ID,
    );

    expect(result.design.placements).toBe(
      MDF_KITCHEN_WEARING_CHOSEN_COLOURS.placements,
    );
  });
});

// **Attack 7 — the two seams that decide "offered" must agree, or the product writes documents its
// own write seam refuses.**
//
// `setFinish`'s `designOffersFinish` and `validate-design.ts`'s `findUnofferedFinishIssues` are two
// separately written readers of the same rule, including the same `?? DEFAULT_MATERIAL_ID` fallback
// and the same undeclared-is-permissive branch. ADR 0084 decision 2d accepts that `PUT` refuses a
// payload no command produces; that acceptance is only safe while **no command produces one**. This
// is that claim, swept over the pair space rather than argued.
describe("no command produces a document the write seam refuses", () => {
  function paletteKitchen(materialTierId: string | undefined): Design {
    return {
      ...KITCHEN_L_DESIGN,
      settings:
        materialTierId === undefined
          ? KITCHEN_L_DESIGN.settings
          : { ...KITCHEN_L_DESIGN.settings, materialTierId },
    };
  }

  function refusalCodesFor(design: Design): readonly string[] {
    return validateDesignForCatalog(design, CATALOG)
      .filter((issue) => issue.code === "PLACEMENT_WEARS_UNOFFERED_FINISH")
      .map((issue) => issue.code);
  }

  it("holds for setFinish over every declared pair, in both directions", () => {
    let accepted = 0;
    let refused = 0;

    for (const pair of PALETTE_PAIRS) {
      const result = setFinish({
        design: paletteKitchen(pair.material.materialId),
        target: { kind: "placement", id: "p0" } as const,
        finish: pair.finish,
        catalog: CATALOG,
        occurredAt: OCCURRED_AT,
      });

      if (result.ok) {
        accepted += 1;
        expect(refusalCodesFor(result.design)).toEqual([]);
      } else {
        refused += 1;
        expect(result.reason.code).toBe("FINISH_NOT_OFFERED");
      }
    }

    // Not a vacuous sweep: the expected-miss table is 16 refused of 24 (PAL misses the two woods,
    // MDF all eight, veneer six), written down rather than derived from `paletteEntriesOf`.
    expect({ accepted, refused }).toEqual({ accepted: 8, refused: 16 });
  });

  it("holds for setFinish over a generated free colour", () => {
    fc.assert(
      fc.property(freeColourPairArbitrary(), (pair) => {
        const result = setFinish({
          design: paletteKitchen(pair.material.materialId),
          target: { kind: "placement", id: "p0" } as const,
          finish: pair.finish,
          catalog: CATALOG,
          occurredAt: OCCURRED_AT,
        });

        if (result.ok) expect(refusalCodesFor(result.design)).toEqual([]);
        else expect(result.reason.code).toBe("FINISH_NOT_OFFERED");
      }),
    );
  });

  it("holds for setMaterialTier's own output, into every declared material", () => {
    for (const tierId of MATERIAL_IDS) {
      expect(
        refusalCodesFor(
          apply(MDF_KITCHEN_WEARING_CHOSEN_COLOURS, tierId).design,
        ),
      ).toEqual([]);
    }
  });

  // The one place the two seams could disagree and do not: an undeclared tier is permissive at both,
  // so a document a recovery-state `setFinish` wrote still saves.
  it("agrees on an undeclared tier, where both are permissive", () => {
    const result = setFinish({
      design: paletteKitchen(UNDECLARED_TIER_ID),
      target: { kind: "placement", id: "p0" } as const,
      finish: paletteFinish("veneer.nuc"),
      catalog: CATALOG,
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(refusalCodesFor(result.design)).toEqual([]);
  });

  // And the fallback both readers share: a document with no `materialTierId` is judged as PAL by
  // each of them, so the two cannot part company on the seeded kitchen.
  it("agrees on a document carrying no materialTierId at all", () => {
    const result = setFinish({
      design: paletteKitchen(undefined),
      target: { kind: "placement", id: "p0" } as const,
      finish: paletteFinish("veneer.nuc"),
      catalog: CATALOG,
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("FINISH_NOT_OFFERED");
  });
});
