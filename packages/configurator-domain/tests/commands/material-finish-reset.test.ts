// **Wave 6Q-b's write half: ADR 0057's reset, inside `setMaterialTier`.**
//
// The load seam's half is `tests/finish-resolution-at-the-load-seam.test.ts`. This file asserts the
// three things the command owes and nothing else: which cabinets move, that the move is **one
// result carrying a count** rather than a cascade, and — the assertion that is easiest to write
// vacuously and hardest to keep true — that the reset moves *nothing else in the document*.
import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { setMaterialTier } from "../../src/commands/set-whole-kitchen-settings.js";
import type { Design, DesignPlacement } from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import {
  materialById,
  materialOffersFinish,
  MATERIALS,
  PALETTE_ENTRIES,
  paletteFinish,
  sameFinish,
  type Finish,
} from "../../src/materials.js";
import {
  CURRENT_SCHEMA_VERSION,
  migrateDesign,
} from "../../src/migrate-design.js";
import {
  deriveColumns,
  derivePlacementRecords,
  type PlacementRecord,
} from "../../src/void-engine.js";
import { OCCURRED_AT } from "../support/commands.js";
import {
  freeColourPairArbitrary,
  PALETTE_PAIRS,
} from "../support/material-finish-pairs.js";
import {
  CHOSEN_CLAY,
  CHOSEN_FINISH_BY_PLACEMENT_ID,
  CHOSEN_SAGE,
  FINISHES_RESOLVED_BY_VENEER,
  finishOf,
  HOOD_PLACEMENT_ID,
  MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
  MDF_TIER_ID,
  OFFERED_MATERIAL_TIER_IDS,
  placementOf,
  UNFINISHED_PLACEMENT_ID,
  VENEER_TIER_ID,
} from "../support/mdf-kitchen-wearing-chosen-colours.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const VENEER_DEFAULT_FINISH = materialById(VENEER_TIER_ID).defaultFinish;

/** A tier id the schema accepts and this product declares no material for — ADR 0072's reachable
 *  state, and the only route to a document mixing offered and unoffered finishes. */
const UNDECLARED_TIER_ID = "material.laminate";

function applyTier(design: Design, tierId: string): Design {
  const result = setMaterialTier({
    design,
    tierId,
    availableTierIds: [...OFFERED_MATERIAL_TIER_IDS, tierId],
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok)
    throw new Error(`setMaterialTier refused: ${result.reason.code}`);
  return result.design;
}

function resolvedCountFor(design: Design, tierId: string): number {
  const result = setMaterialTier({
    design,
    tierId,
    availableTierIds: [...OFFERED_MATERIAL_TIER_IDS, tierId],
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok)
    throw new Error(`setMaterialTier refused: ${result.reason.code}`);
  return result.effect.resolvedFinishCount;
}

describe("the fixture the destructive path is measured on", () => {
  // Without this the table in the fixture's own head comment is a claim rather than a fact.
  it("stands the declared finishes on the bodies it says it does", () => {
    for (const [id, finish] of Object.entries(CHOSEN_FINISH_BY_PLACEMENT_ID)) {
      expect(finishOf(MDF_KITCHEN_WEARING_CHOSEN_COLOURS, id)).toEqual(finish);
    }
    expect(
      finishOf(MDF_KITCHEN_WEARING_CHOSEN_COLOURS, UNFINISHED_PLACEMENT_ID),
    ).toBeUndefined();
  });

  it("wears two different free colours, so a collapse to one value is visible", () => {
    expect(sameFinish(CHOSEN_CLAY, CHOSEN_SAGE)).toBe(false);
  });

  // ADR 0084 decision 2b: the hood is here bare, because that is the state every loaded design
  // presents it in, and `canFinish` is no part of this command's contract.
  it("carries the frontless body the catalogue declares, wearing nothing", () => {
    const hood = placementOf(
      MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
      HOOD_PLACEMENT_ID,
    );

    expect(CATALOG.get(hood.body.buildId)?.canFinish).toBe(false);
    expect(hood.body.finish).toBeUndefined();
  });

  it("leaves at least one body that can wear a finish wearing none", () => {
    const unfinished = placementOf(
      MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
      UNFINISHED_PLACEMENT_ID,
    );
    expect(CATALOG.get(unfinished.body.buildId)?.canFinish).toBe(true);
  });

  // **The drift guard the duplicate copy in `apps/web/tests/support/` is held to as well**
  // (ADR 0084 decision 6). Each copy checks *its own* placements against the public offer query, so
  // a finish table that drifts fails in the package where it drifted — no cross-package coupling,
  // and not circular with `setMaterialTier`, whose behaviour is what the rest of this file measures.
  it("holds exactly FINISHES_RESOLVED_BY_VENEER finishes veneer refuses", () => {
    const veneer = materialById(VENEER_TIER_ID);
    const refused = MDF_KITCHEN_WEARING_CHOSEN_COLOURS.placements.filter(
      (placement) =>
        placement.body.finish !== undefined &&
        !materialOffersFinish(veneer, placement.body.finish),
    );

    expect(refused.map((placement) => placement.id)).toEqual(["p0", "p1"]);
    expect(refused).toHaveLength(FINISHES_RESOLVED_BY_VENEER);
  });
});

describe("setMaterialTier resolves the finishes the new material does not offer", () => {
  it("rewrites exactly the unoffered ones to the new material's declared default", () => {
    const after = applyTier(MDF_KITCHEN_WEARING_CHOSEN_COLOURS, VENEER_TIER_ID);

    expect(finishOf(after, "p0")).toEqual(VENEER_DEFAULT_FINISH);
    expect(finishOf(after, "p1")).toEqual(VENEER_DEFAULT_FINISH);
  });

  // Four would be "reset everything wearing a finish". The count alone no longer separates the two
  // directions (ADR 0084 decision 3), which is why the test above names *which* placements landed on
  // veneer's default and the one below names which came back untouched.
  it("reports the count in one effect, and the count is two", () => {
    expect(
      resolvedCountFor(MDF_KITCHEN_WEARING_CHOSEN_COLOURS, VENEER_TIER_ID),
    ).toBe(FINISHES_RESOLVED_BY_VENEER);
  });

  // `toBe`, not `toEqual`: the placement object itself, so a command that rebuilt every placement
  // and happened to copy the finish across fails here.
  it("hands an offered finish through as the very placement that went in", () => {
    const after = applyTier(MDF_KITCHEN_WEARING_CHOSEN_COLOURS, VENEER_TIER_ID);

    for (const id of ["p4", "p5"]) {
      expect(placementOf(after, id)).toBe(
        placementOf(MDF_KITCHEN_WEARING_CHOSEN_COLOURS, id),
      );
    }
  });

  // ADR 0078 decision 5. The naive phrasing — "every placement wears an offered finish" — passes
  // for a resolution that helpfully fills a default onto every frontless body in the kitchen.
  it("adds no finish to a body that was wearing none", () => {
    const after = applyTier(MDF_KITCHEN_WEARING_CHOSEN_COLOURS, VENEER_TIER_ID);

    expect(finishOf(after, UNFINISHED_PLACEMENT_ID)).toBeUndefined();
    const carriedNone = KITCHEN_L_DESIGN.placements.filter(
      (placement) => CHOSEN_FINISH_BY_PLACEMENT_ID[placement.id] === undefined,
    );
    expect(carriedNone.length).toBeGreaterThan(0);
    for (const placement of carriedNone) {
      expect(finishOf(after, placement.id)).toBeUndefined();
    }
  });

  // "Setting the tier that is already set is not a refusal" must not become "…and is a silent
  // skip": the document arrived carrying two finishes MDF does offer and two it does not.
  //
  // **The two directions resolve the same number and different placements** (ADR 0084 decision 3), so
  // this test names the placements rather than the count: MDF's RAL picker offers every free colour
  // and no palette entry, so the two woods move and the two chosen colours stay — the exact mirror
  // of the veneer direction above.
  it("resolves against the tier being applied even when it is the tier already stored", () => {
    const after = applyTier(MDF_KITCHEN_WEARING_CHOSEN_COLOURS, MDF_TIER_ID);
    const mdfDefault = materialById(MDF_TIER_ID).defaultFinish;

    expect(finishOf(after, "p4")).toEqual(mdfDefault);
    expect(finishOf(after, "p5")).toEqual(mdfDefault);
    expect(finishOf(after, "p0")).toEqual(CHOSEN_CLAY);
    expect(finishOf(after, "p1")).toEqual(CHOSEN_SAGE);
    for (const id of ["p0", "p1"]) {
      expect(placementOf(after, id)).toBe(
        placementOf(MDF_KITCHEN_WEARING_CHOSEN_COLOURS, id),
      );
    }
    expect(
      resolvedCountFor(MDF_KITCHEN_WEARING_CHOSEN_COLOURS, MDF_TIER_ID),
    ).toBe(2);
  });

  // ADR 0078 decision 3: the caller's book may offer a tier this product declares no material for,
  // and a document is not corrected against a material nobody can look up.
  it("resolves nothing and throws nothing on a tier the domain declares no material for", () => {
    const result = setMaterialTier({
      design: MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
      tierId: UNDECLARED_TIER_ID,
      availableTierIds: [UNDECLARED_TIER_ID],
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effect.resolvedFinishCount).toBe(0);
    expect(result.design.placements).toBe(
      MDF_KITCHEN_WEARING_CHOSEN_COLOURS.placements,
    );
  });

  // **The reachability discharge, at the command seam** (ADR 0084 decision 5). There is exactly one
  // route to a document mixing finishes a target material offers with finishes it refuses: a stored
  // `materialTierId` naming no declared material — ADR 0072's state, which ADR 0078 decision 3 and
  // wave 6G's recovery path require to keep loading. On it the load seam resolves nothing,
  // `setFinish` offers everything, and the hood is still bare because the strip consults no material.
  // Applying veneer to such a document gives the same answer the in-memory fixture does, which is
  // what retires the "your fixture is unreachable" objection permanently.
  it("gives the same answer on a document a recovery-state load can actually produce", () => {
    const stored = migrateDesign(
      CURRENT_SCHEMA_VERSION,
      JSON.parse(
        JSON.stringify({
          ...MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
          settings: {
            ...MDF_KITCHEN_WEARING_CHOSEN_COLOURS.settings,
            materialTierId: UNDECLARED_TIER_ID,
          },
        }),
      ) as unknown,
      CATALOG,
    );

    // The load left the mixture intact, which is the premise the rest of this test rests on.
    expect(finishOf(stored, "p0")).toEqual(CHOSEN_CLAY);
    expect(finishOf(stored, "p4")).toEqual(paletteFinish("veneer.stejar"));
    expect(finishOf(stored, HOOD_PLACEMENT_ID)).toBeUndefined();

    const result = setMaterialTier({
      design: stored,
      tierId: VENEER_TIER_ID,
      availableTierIds: OFFERED_MATERIAL_TIER_IDS,
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effect.resolvedFinishCount).toBe(FINISHES_RESOLVED_BY_VENEER);
    expect(finishOf(result.design, "p0")).toEqual(VENEER_DEFAULT_FINISH);
    expect(finishOf(result.design, "p1")).toEqual(VENEER_DEFAULT_FINISH);
    for (const id of ["p4", "p5"]) {
      expect(placementOf(result.design, id)).toBe(placementOf(stored, id));
    }
    expect(finishOf(result.design, HOOD_PLACEMENT_ID)).toBeUndefined();
    expect(finishOf(result.design, UNFINISHED_PLACEMENT_ID)).toBeUndefined();
  });

  it("reports a count of zero and rewrites no placement when nothing is owed", () => {
    const result = setMaterialTier({
      design: KITCHEN_L_DESIGN,
      tierId: VENEER_TIER_ID,
      availableTierIds: OFFERED_MATERIAL_TIER_IDS,
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effect.resolvedFinishCount).toBe(0);
    expect(result.design.placements).toBe(KITCHEN_L_DESIGN.placements);
  });
});

// **"The finish reset moves nothing else", asserted as a whole-document comparison with named
// exclusions rather than as a list of fields a reader has to keep complete.** A list of fields
// cannot be wrong about a field nobody added it to; this can only be wrong by naming a new
// exclusion, which is a visible edit.
describe("the reset moves the finish, the setting and the clock, and nothing else", () => {
  const before = MDF_KITCHEN_WEARING_CHOSEN_COLOURS;
  const after = applyTier(before, VENEER_TIER_ID);

  /** The three things this wave is allowed to move, neutralised to one value on both sides. */
  const NEUTRALISED = "«neutralised»";

  function neutralisedDocument(design: Design): unknown {
    return {
      ...design,
      updatedAt: NEUTRALISED,
      settings: { ...design.settings, materialTierId: NEUTRALISED },
      placements: design.placements.map(withoutFinish),
    };
  }

  function withoutFinish(placement: DesignPlacement): DesignPlacement {
    const body = { ...placement.body };
    delete body.finish;
    return { ...placement, body };
  }

  /** **Both colour fields, because since ADR 0099 Amendment A section 3 a record carries two.**
   *  `finishKey` is the cabinet's own choice and `drawnFinish` is `resolvedFinishOf`'s answer over
   *  it, the whole-kitchen colour and the material's default — so a material change moves the
   *  second for exactly the reasons it is allowed to move the first. Nothing else is neutralised:
   *  a reset that quietly moved a depth, seat or frame still lands. */
  function withoutEitherFinish(record: PlacementRecord): PlacementRecord {
    const stripped = { ...record };
    delete stripped.finishKey;
    delete stripped.drawnFinish;
    return stripped;
  }

  function recordsOf(design: Design): PlacementRecord[] {
    return derivePlacementRecords(design, CATALOG);
  }

  it("leaves every other field of the stored document deep-equal", () => {
    expect(neutralisedDocument(after)).toEqual(neutralisedDocument(before));
  });

  it("moves exactly the three fields the exclusions name", () => {
    expect(after.updatedAt).toBe(OCCURRED_AT);
    expect(after.settings?.materialTierId).toBe(VENEER_TIER_ID);
    expect(finishOf(after, "p0")).not.toEqual(finishOf(before, "p0"));
  });

  // The derived half, because `Column.d` is not in the document: a reset that quietly changed a
  // body's depth, seat or frame would pass the comparison above and show up here.
  it("derives the same placement records once both finish fields are neutralised", () => {
    expect(recordsOf(after).map(withoutEitherFinish)).toEqual(
      recordsOf(before).map(withoutEitherFinish),
    );
  });

  it("derives the same columns, with nothing neutralised at all", () => {
    expect(deriveColumns(recordsOf(after), {}, after.room)).toEqual(
      deriveColumns(recordsOf(before), {}, before.room),
    );
  });
});

// ADR 0057 decision 4, over the pair space rather than over what this file's fixture happens to
// hold: three materials × (eight declared palette entries ∪ generated free colours).
describe("no design setMaterialTier produced holds a finish its material does not offer", () => {
  /** A design wearing `finish` on a body that can wear one, beside a body wearing nothing — so the
   *  property's second half has something to be false about. */
  function wearing(finish: Finish): Design {
    return {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.map((placement) =>
        placement.id === "p0"
          ? { ...placement, body: { ...placement.body, finish } }
          : placement,
      ),
    };
  }

  function assertEveryCarriedFinishIsOffered(
    design: Design,
    tierId: string,
  ): void {
    const after = applyTier(design, tierId);
    const material = materialById(tierId);
    for (const placement of after.placements) {
      const carried = placement.body.finish;
      if (carried === undefined) continue;
      expect(materialOffersFinish(material, carried)).toBe(true);
    }
    // The half a resolution filling in defaults would break: absence survives the command.
    expect(finishOf(after, UNFINISHED_PLACEMENT_ID)).toBeUndefined();
  }

  it("holds over every material against every declared palette entry", () => {
    expect(PALETTE_PAIRS.length).toBe(
      MATERIALS.length * PALETTE_ENTRIES.length,
    );
    for (const pair of PALETTE_PAIRS) {
      assertEveryCarriedFinishIsOffered(
        wearing(pair.finish),
        pair.material.materialId,
      );
    }
  });

  it("holds over every material against a generated free colour", () => {
    fc.assert(
      fc.property(freeColourPairArbitrary(), (pair) => {
        assertEveryCarriedFinishIsOffered(
          wearing(pair.finish),
          pair.material.materialId,
        );
      }),
    );
  });
});
