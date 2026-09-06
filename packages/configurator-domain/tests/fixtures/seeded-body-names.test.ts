// M6 wave 6A2 / ADR 0064: **a body's name does not change when its `buildId` migrates on resize.**
//
// The seeded pantry used to read *"Coloană"* until the customer's first resize rebuilt it through
// `tall-pantry` (`resolve-column-members.ts`) and *"Coloană cămară 2 uși"* after — one cabinet, two
// names, in what 6D turns into a priced document.
//
// Every comparison below is **derived on both sides**. The name now exists on the seeded row and on
// its catalogue equivalent, and a table of expected strings would be a third copy — and would keep
// passing while a new seeded row is added without its two fields.
import { describe, expect, it } from "vitest";

import {
  describeBodyLabelAt,
  describeKindLabel,
  isKnownKind,
  UNKNOWN_KIND_LABEL_RO,
} from "../../src/catalog.js";
import type { DesignPlacement } from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { describeSelection } from "../../src/queries/describe-selection.js";
import { buildSeededBodyDefinitions } from "../../src/fixtures/kitchen-l-design.js";
import type { BodyDefinition } from "../../src/void-engine.js";
import { resizeTo } from "../support/commands.js";
import { declaredWorktopDepthsMm } from "../../src/worktop-depth.js";
import {
  advanceWithColumns,
  createWorld,
  type KitchenWorld,
} from "../support/kitchen-world.js";

const PANTRY_PLACEMENT_ID = "p6";

function definitionOf(buildId: string): BodyDefinition {
  const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
  if (!definition) throw new Error(`fixture has no entry "${buildId}"`);
  return definition;
}

/** The name the customer reads for this placement, off the panel header — the surface the defect was
 *  found on, and the one `describeBodyLabelAt` is called from. */
function labelOf(world: KitchenWorld, placementId: string): string | undefined {
  return describeSelection({
    records: world.records,
    voids: world.voids,
    catalog: world.catalog,
    target: { kind: "placement", id: placementId },
  })?.label;
}

function placementOf(
  world: KitchenWorld,
  placementId: string,
): DesignPlacement {
  const placement = world.design.placements.find(
    (candidate) => candidate.id === placementId,
  );
  if (!placement) throw new Error(`design has no placement "${placementId}"`);
  return placement;
}

/** ADR 0031 resizes the whole **column** the placement stands in, so a round trip through a second
 *  width migrates every member of that column and returns them all to the width they started at. */
function resizedThereAndBack(
  world: KitchenWorld,
  placementId: string,
  viaWidthMm: number,
  backToWidthMm: number,
): KitchenWorld {
  return [viaWidthMm, backToWidthMm].reduce((current, widthMm) => {
    const result = resizeTo(current, placementId, widthMm);
    if (!result.ok) {
      throw new Error(
        `resize of ${placementId} to ${String(widthMm)} mm was refused: ${result.reason.code}`,
      );
    }
    return advanceWithColumns(current, result.design, result.effect.columns);
  }, world);
}

const seededKitchen = (): KitchenWorld =>
  createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);

describe("a seeded body's name across a resize", () => {
  it("does not change when the resize migrates its buildId", () => {
    const before = seededKitchen();
    const pantryBefore = placementOf(before, PANTRY_PLACEMENT_ID);

    const after = resizedThereAndBack(before, PANTRY_PLACEMENT_ID, 500, 600);

    // The migration is real, so the names below are not equal by having stayed on one definition.
    const pantryAfter = placementOf(after, PANTRY_PLACEMENT_ID);
    expect(pantryAfter.body.buildId).not.toBe(pantryBefore.body.buildId);
    expect(pantryAfter.body.widthMm).toBe(pantryBefore.body.widthMm);

    for (const placement of before.design.placements) {
      expect([placement.id, labelOf(after, placement.id)]).toEqual([
        placement.id,
        labelOf(before, placement.id),
      ]);
    }
  });

  it("is the name its catalogue equivalent renders at the same width", () => {
    // The whole fixture, not only the column a resize can reach: a migration is expressible for any
    // row that declares an equivalent, and a row that forgot its two fields fails here.
    let compared = 0;

    for (const placement of KITCHEN_L_DESIGN.placements) {
      const seeded = definitionOf(placement.body.buildId);
      const equivalentId = seeded.catalogEquivalentId;
      if (equivalentId === undefined) continue;
      compared += 1;

      const widthMm = placement.body.widthMm;
      expect([placement.id, describeBodyLabelAt(seeded, widthMm)]).toEqual([
        placement.id,
        describeBodyLabelAt(definitionOf(equivalentId), widthMm),
      ]);
    }

    expect(compared).toBeGreaterThan(0);
  });

  it("leaves a row with no catalogue equivalent on its kind's name", () => {
    // ADR 0022: the corner returns have no equivalent, so there is nothing to copy — and nothing can
    // migrate them either, because a resize rebuilds through the equivalent. ADR 0025 already gave
    // their kinds real names, which is what they keep reading.
    const world = seededKitchen();
    let checked = 0;

    for (const placement of KITCHEN_L_DESIGN.placements) {
      const seeded = definitionOf(placement.body.buildId);
      if (seeded.catalogEquivalentId !== undefined) continue;
      checked += 1;

      expect([
        placement.id,
        seeded.label,
        seeded.doorCountFollowsWidth,
      ]).toEqual([placement.id, undefined, undefined]);
      expect([placement.id, labelOf(world, placement.id)]).toEqual([
        placement.id,
        describeKindLabel(seeded.kind),
      ]);
    }

    expect(checked).toBeGreaterThan(0);
  });

  it("never renders the unknown-kind fallback, before or after the migration", () => {
    // §11 row 24 renders no replace section at all for an unknown kind, so this is a larger problem
    // than a name and is asserted at both ends rather than assumed from today's kind table.
    const before = seededKitchen();
    const after = resizedThereAndBack(before, PANTRY_PLACEMENT_ID, 500, 600);

    for (const world of [before, after]) {
      for (const placement of world.design.placements) {
        const kind = definitionOf(placement.body.buildId).kind;
        expect([placement.id, isKnownKind(kind)]).toEqual([placement.id, true]);
        expect([placement.id, labelOf(world, placement.id)]).not.toEqual([
          placement.id,
          UNKNOWN_KIND_LABEL_RO,
        ]);
      }
    }
  });
});

describe("a seeded body's name does not depend on the cabinet depth", () => {
  // **The property M6 wave 6I relies on, asserted rather than assumed.** `catalogEquivalentNamer`
  // resolves each seeded row's `label` and `doorCountFollowsWidth` against the §7 catalogue built at
  // *the same depth the seeded map is being built at*, so that a catalogue built at 700 is not
  // quietly half-built at 600.
  //
  // That is only safe while names are depth-independent, which they are in every §7 row today —
  // which is exactly why nobody would notice if one stopped being. Pinning the lookup to the shipped
  // depth would have hidden the question; this asks it. If a label ever does start following the
  // setting, this test says so instead of a constant deciding silently.
  //
  // Read off the depth map rather than written out here: `worktop-depth.ts` names `800 -> 500` as a
  // plausible next row, and a hand-written pair would sweep two of three depths the day a third is
  // declared — quietly narrowing the guarantee ADR 0064's amendment rests on.
  const DECLARED_DEPTHS_MM = declaredWorktopDepthsMm();

  function namesAt(
    cabinetDepthMm: number,
  ): readonly (readonly [string, string | undefined, boolean | undefined])[] {
    return buildSeededBodyDefinitions(cabinetDepthMm).map(
      ([buildId, definition]) =>
        [buildId, definition.label, definition.doorCountFollowsWidth] as const,
    );
  }

  it("gives every seeded row the same label and door-count flag at every declared depth", () => {
    const [shallowestMm, ...deeperDepthsMm] = DECLARED_DEPTHS_MM;
    if (shallowestMm === undefined) {
      throw new Error(
        "the depth map declares no depth, so there is nothing to compare",
      );
    }

    const shallowestNames = namesAt(shallowestMm);
    for (const cabinetDepthMm of deeperDepthsMm) {
      expect([cabinetDepthMm, namesAt(cabinetDepthMm)]).toEqual([
        cabinetDepthMm,
        shallowestNames,
      ]);
    }

    // A single declared depth would make the loop above compare nothing.
    expect(deeperDepthsMm.length).toBeGreaterThan(0);
  });

  // Guards the assertion above from passing vacuously: eighteen rows carry a name read off their
  // catalogue equivalent, and the four corner rows deliberately carry none (ADR 0022).
  it("has eighteen named rows to compare, and four deliberately unnamed", () => {
    const named = namesAt(600).filter(([, label]) => label !== undefined);

    expect(named).toHaveLength(18);
    expect(namesAt(600)).toHaveLength(22);
  });
});
