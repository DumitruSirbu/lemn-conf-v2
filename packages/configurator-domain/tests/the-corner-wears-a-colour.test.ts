// **The owner's corner ruling of 2026-09-09, in the document** — *"the corner cabinets — that column
// specifically — miss custom color setting; need to add it, and to support setting custom color for
// all corner cabinet parts."*
//
// Two halves, and this file is the first: a corner **may be given a colour of its own**, and where it
// has been given none it goes on following the kitchen. The second half — that every visible part of
// it actually changes colour on screen — is `three-adapter/tests/the-corner-wears-a-colour.test.ts`,
// because only that package holds meshes.
//
// **This reverses ADR 0099 decision 8 and Amendment B for four bodies.** Both records read
// `canFinish: false` on `STRUCTURAL_CORNER` as a ruling about colour. It never was one: §13.1's list
// is *replace, delete, width donor*, and the flag sat beside those three because the four bodies were
// declared in one shape, not because anybody decided a corner should be uncolourable. The four are
// on `CHOOSES_ITS_OWN_COLOUR` now and the three refusals §13.1 does name are untouched — asserted
// here, so "colour only" is a checked claim rather than an intention.
//
// **Every document claim is key presence** (`"finish" in body`), never a resolved value — ADR 0093,
// and ADR 0099 decision 2's point: a corner following the kitchen and a corner that chose the
// identical colour render alike, are different documents, and only the second stops tracking the
// next global change. Following must not quietly write the key.
import { describe, expect, it } from "vitest";

import {
  bodyFinishRuleOf,
  CHOOSES_ITS_OWN_COLOUR,
} from "../src/body-finish-rule.js";
import { setFinish } from "../src/commands/set-appearance.js";
import { setGlobalFinish } from "../src/commands/set-whole-kitchen-settings.js";
import type { Design, DesignPlacement } from "../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import { materialById, paletteFinish, type Finish } from "../src/materials.js";
import { describeSelection } from "../src/queries/describe-selection.js";
import { createWorld } from "./support/kitchen-world.js";
import { derivePlacementRecords } from "../src/void-engine.js";

const OCCURRED_AT = "2026-09-09T18:00:00.000Z";

/** Veneer, not melamine: its declared default is a tinted oak, so *following the kitchen* and *left
 *  on the material's white* are different values. Melamine's default is `pal.alb`, the same hex the
 *  kit gives an unpainted door — the coincidence ADR 0099 Amendment A section 3 records as having
 *  made an acceptance criterion vacuous. */
const VENEER_ID = "material.veneer";
const VENEER_DEFAULT = materialById(VENEER_ID).defaultFinish;

const PAL_ID = "material.melamine";
const ANTRACIT = paletteFinish("pal.antracit");
const GRI_HAVANNA = paletteFinish("pal.gri-havanna");
const NUC_WARMIA = paletteFinish("pal.nuc-warmia");

/** An ordinary base cabinet drawn in the same design: the witness that a claim about a corner is
 *  about *that corner* and not about a design that resolved everything to one value. */
const ORDINARY_ID = "p1";

interface Corner {
  readonly placementId: string;
  readonly buildId: string;
}

/** **The four corner bodies, named.** The seeded kitchen holds four and not two: a corner base X, a
 *  corner base return, and *two* wall corner returns — the run and its top row. `STRUCTURAL_CORNER`
 *  declares all four together, so the ruling reaches all four or none, and the premise below re-reads
 *  that membership out of the catalogue rather than trusting this list. */
const CORNERS: readonly Corner[] = [
  { placementId: "p25", buildId: "base-corner-x-900" },
  { placementId: "p26", buildId: "base-corner-return-320" },
  { placementId: "p9", buildId: "wall-corner-return-570" },
  { placementId: "p21", buildId: "wall-corner-return-570-top" },
];

function onMaterial(materialTierId: string): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: { ...KITCHEN_L_DESIGN.settings, materialTierId },
    placements: KITCHEN_L_DESIGN.placements.map(withNoFinishOfItsOwn),
  };
}

function withNoFinishOfItsOwn(placement: DesignPlacement): DesignPlacement {
  const body = { ...placement.body };
  delete body.finish;
  return { ...placement, body };
}

function withKitchenColour(design: Design, finish: Finish): Design {
  return { ...design, settings: { ...design.settings, finish } };
}

function recordFor(design: Design, placementId: string) {
  const record = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG).find(
    (candidate) => candidate.id === placementId,
  );
  if (!record) throw new Error(`No record for placement "${placementId}"`);
  return record;
}

function bodyOf(design: Design, placementId: string) {
  const placement = design.placements.find(
    (candidate) => candidate.id === placementId,
  );
  if (!placement) throw new Error(`No placement "${placementId}"`);
  return placement.body;
}

/** The corner given a colour through the **command**, not by hand: the point of the ruling is that a
 *  customer can now do this, so a hand-written `finish` would prove the resolver and skip the gate. */
function afterChoosing(design: Design, placementId: string, finish: Finish) {
  const result = setFinish({
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    target: { kind: "placement", id: placementId },
    finish,
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) throw new Error(`setFinish refused "${placementId}"`);
  return result.design;
}

describe("the corner ruling — the premise: the catalogue declares it, not this file", () => {
  /** Both directions. A corner leaving the class, or an ordinary body joining it, fails here by name
   *  rather than silently changing what every assertion below sweeps. */
  it("names every seeded corner, and nothing else", () => {
    const declared = derivePlacementRecords(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    ).filter(
      (record) =>
        KITCHEN_L_BODY_CATALOG.get(record.buildId)?.structuralReason ===
        "corner",
    );

    expect(declared.map((record) => record.id).sort()).toEqual(
      CORNERS.map((corner) => corner.placementId).sort(),
    );
    expect(declared.map((record) => record.buildId).sort()).toEqual(
      CORNERS.map((corner) => corner.buildId).sort(),
    );
  });

  it.each(CORNERS)("$buildId chooses its own colour", (corner) => {
    const definition = KITCHEN_L_BODY_CATALOG.get(corner.buildId);
    expect(definition, corner.buildId).toBeDefined();

    expect(
      bodyFinishRuleOf({
        buildId: corner.buildId,
        rule: definition?.finishRule,
        canFinish: definition?.canFinish ?? false,
      }),
      corner.buildId,
    ).toBe(CHOOSES_ITS_OWN_COLOUR);
  });

  /** **Colour is the only capability that moved.** §13.1's three refusals are re-read here from the
   *  panel's own query, so a future widening of the corner's offer — a swap list, a delete, a width —
   *  fails on the body it was widened for. */
  it.each(CORNERS)(
    "$buildId still refuses replace, delete and width",
    (corner) => {
      const world = createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);
      const meta = describeSelection({
        ...world,
        target: { kind: "placement", id: corner.placementId },
      });

      expect(
        {
          canReplace: meta?.canReplace,
          canDelete: meta?.canDelete,
          canWidth: meta?.canWidth,
          canFinish: meta?.canFinish,
          structuralReason: meta?.structuralReason,
        },
        corner.buildId,
      ).toEqual({
        canReplace: false,
        canDelete: false,
        canWidth: false,
        canFinish: true,
        structuralReason: "corner",
      });
    },
  );
});

describe("the corner ruling — a corner with no colour of its own follows the kitchen", () => {
  it.each(CORNERS)("$buildId is drawn in the kitchen's colour", (corner) => {
    const design = withKitchenColour(onMaterial(PAL_ID), ANTRACIT);

    expect(
      recordFor(design, corner.placementId).drawnFinish,
      corner.buildId,
    ).toEqual(ANTRACIT);
    expect(recordFor(design, ORDINARY_ID).drawnFinish).toEqual(ANTRACIT);
  });

  /** **And its document did not grow a key.** Key presence, not value: a corner that follows and a
   *  corner that chose the same colour are different documents, and writing the current global value
   *  into the key is exactly the conversion ADR 0099 decision 2 forbids. */
  it.each(CORNERS)(
    "$buildId keeps its finish key absent while following",
    (corner) => {
      const design = withKitchenColour(onMaterial(PAL_ID), ANTRACIT);

      expect(
        "finish" in bodyOf(design, corner.placementId),
        corner.buildId,
      ).toBe(false);
    },
  );

  /** Two successive kitchen colours, not one: a single change is satisfiable by writing the value
   *  into the key, and the second change is what catches a corner that stopped tracking. */
  it.each(CORNERS)(
    "$buildId tracks two successive kitchen colours",
    (corner) => {
      const first = setGlobalFinish({
        design: onMaterial(PAL_ID),
        finish: ANTRACIT,
        occurredAt: OCCURRED_AT,
      });
      expect(first.ok, corner.buildId).toBe(true);
      if (!first.ok) return;
      const second = setGlobalFinish({
        design: first.design,
        finish: GRI_HAVANNA,
        occurredAt: OCCURRED_AT,
      });
      expect(second.ok, corner.buildId).toBe(true);
      if (!second.ok) return;

      expect(recordFor(second.design, corner.placementId).drawnFinish).toEqual(
        GRI_HAVANNA,
      );
      expect("finish" in bodyOf(second.design, corner.placementId)).toBe(false);
    },
  );

  /** With no kitchen colour it falls back to the material's declared default, like any other cabinet
   *  — on veneer, where that default is a tinted oak and not the kit's own white. */
  it.each(CORNERS)(
    "$buildId falls back to the material's default",
    (corner) => {
      expect(
        recordFor(onMaterial(VENEER_ID), corner.placementId).drawnFinish,
        corner.buildId,
      ).toEqual(VENEER_DEFAULT);
    },
  );
});

describe("the corner ruling — a corner may be given a colour of its own", () => {
  /** The half that did not exist before: `setFinish` refused every corner, which is why §9 rendered
   *  no *Finisaj* section and the owner had nothing to click. */
  it.each(CORNERS)("$buildId accepts setFinish", (corner) => {
    const result = setFinish({
      design: withKitchenColour(onMaterial(PAL_ID), ANTRACIT),
      catalog: KITCHEN_L_BODY_CATALOG,
      target: { kind: "placement", id: corner.placementId },
      finish: NUC_WARMIA,
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok, corner.buildId).toBe(true);
  });

  /** The command wrote the key **and** the chosen colour is what gets drawn, over the kitchen's. Both
   *  in one test, because the key without the colour is a document nobody sees and the colour without
   *  the key is a corner that will silently revert on the next global change. */
  it.each(CORNERS)(
    "$buildId wears its own colour over the kitchen's",
    (corner) => {
      const design = afterChoosing(
        withKitchenColour(onMaterial(PAL_ID), ANTRACIT),
        corner.placementId,
        NUC_WARMIA,
      );

      expect(
        "finish" in bodyOf(design, corner.placementId),
        corner.buildId,
      ).toBe(true);
      expect(
        recordFor(design, corner.placementId).drawnFinish,
        corner.buildId,
      ).toEqual(NUC_WARMIA);
      // The witness: the neighbour in the same design is still on the kitchen's colour, so this is
      // one corner overriding rather than the whole kitchen having moved.
      expect(recordFor(design, ORDINARY_ID).drawnFinish).toEqual(ANTRACIT);
    },
  );

  /** **A chosen colour survives the next global change**, which is what makes the key mean anything.
   *  Without this, "wears its own colour" is satisfied by a design that has simply not been touched
   *  since. */
  it.each(CORNERS)(
    "$buildId keeps its own colour when the kitchen moves",
    (corner) => {
      const chosen = afterChoosing(
        withKitchenColour(onMaterial(PAL_ID), ANTRACIT),
        corner.placementId,
        NUC_WARMIA,
      );
      const moved = setGlobalFinish({
        design: chosen,
        finish: GRI_HAVANNA,
        occurredAt: OCCURRED_AT,
      });
      expect(moved.ok, corner.buildId).toBe(true);
      if (!moved.ok) return;

      expect(
        recordFor(moved.design, corner.placementId).drawnFinish,
        corner.buildId,
      ).toEqual(NUC_WARMIA);
      expect(recordFor(moved.design, ORDINARY_ID).drawnFinish).toEqual(
        GRI_HAVANNA,
      );
    },
  );
});
