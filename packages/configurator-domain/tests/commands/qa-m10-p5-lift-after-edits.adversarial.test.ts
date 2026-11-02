// M10 P5 (ADR 0177 A-20), adversarial: the lift count and the lift door's hinges follow the design as it is edited. A
// resize changes the width the hinge rule reads, a swap changes whether a lift stands at all, and neither may leave a
// count behind that the kitchen no longer has. The design is read as the whole-kitchen price reads it: projected for
// display, then counted.
import { describe, expect, it } from "vitest";

import type { Design } from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { countHardwareMechanisms } from "../../src/hardware-mechanisms.js";
import { projectDesignForDisplay } from "../../src/queries/design-projection.js";
import {
  deriveColumns,
  derivePlacementRecords,
  recomputeVoids,
} from "../../src/void-engine.js";
import { insertInto, resizeTo } from "../support/commands.js";
import {
  advance,
  createWorld,
  type KitchenWorld,
} from "../support/kitchen-world.js";

const WALL_CABINET_SEEDED_ID = "p8";
const HINGES_ON_A_WIDE_LIFT_DOOR = 3;
const HINGES_ON_A_NARROW_LIFT_DOOR = 2;
const WIDE_LIFT_ABOVE_MM = 500;
const LIFT_WIDTHS_MM = [300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800];

function countsOf(design: Design) {
  return countHardwareMechanisms(
    projectDesignForDisplay(design, KITCHEN_L_BODY_CATALOG).flatMap(
      (group) => group.entries,
    ),
    KITCHEN_L_BODY_CATALOG,
  );
}

/** The mechanisms of the kitchen's lift bodies alone: a resize moves a whole column, and the bodies beside the lift
 *  change their own counts with their widths. */
function countsOfTheLiftsOf(design: Design) {
  return countHardwareMechanisms(
    projectDesignForDisplay(design, KITCHEN_L_BODY_CATALOG)
      .flatMap((group) => group.entries)
      .filter((entry) => entry.buildId === "wall-lift"),
    KITCHEN_L_BODY_CATALOG,
  );
}

function worldWithALiftInPlaceOfAWallCabinet(): {
  readonly world: KitchenWorld;
  readonly liftId: string;
} {
  const seeded = createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);
  const swapped = insertInto(
    seeded,
    { kind: "placement", id: WALL_CABINET_SEEDED_ID },
    "wall-lift",
  );
  if (!swapped.ok) throw new Error(`swap refused: ${swapped.reason.code}`);
  return {
    world: advance(seeded, swapped.design),
    liftId: swapped.effect.placementId,
  };
}

function widthOf(design: Design, placementId: string): number {
  const placement = design.placements.find(({ id }) => id === placementId);
  if (placement === undefined) throw new Error(`no placement ${placementId}`);
  return placement.body.widthMm;
}

describe("a lift swapped in for a wall cabinet", () => {
  it("adds exactly one lift to the seeded kitchen's none, and takes the wall cabinet's hinges out", () => {
    const seededCounts = countsOf(KITCHEN_L_DESIGN);
    const { world, liftId } = worldWithALiftInPlaceOfAWallCabinet();
    const wallCabinetHinges = 4;

    const counts = countsOf(world.design);

    expect(seededCounts.lifts).toBe(0);
    expect(counts.lifts).toBe(1);
    expect(counts.drawers).toBe(seededCounts.drawers);
    expect(counts.hinges).toBe(
      seededCounts.hinges -
        wallCabinetHinges +
        (widthOf(world.design, liftId) > WIDE_LIFT_ABOVE_MM
          ? HINGES_ON_A_WIDE_LIFT_DOOR
          : HINGES_ON_A_NARROW_LIFT_DOOR),
    );
  });

  it("goes back to no lift when it is swapped for a wall cabinet again", () => {
    const { world, liftId } = worldWithALiftInPlaceOfAWallCabinet();

    const back = insertInto(
      world,
      { kind: "placement", id: liftId },
      "wall-cabinet",
    );

    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(countsOf(back.design).lifts).toBe(0);
  });
});

describe("a lift resized across every width it is built at", () => {
  it("reads the width the placement has after each resize: three hinges above 500 mm, two at and below, one lift throughout", () => {
    const { world, liftId } = worldWithALiftInPlaceOfAWallCabinet();
    const seenWidths: number[] = [];

    for (const requestedMm of [
      ...LIFT_WIDTHS_MM,
      ...[...LIFT_WIDTHS_MM].reverse(),
    ]) {
      const resized = resizeTo(world, liftId, requestedMm);
      if (!resized.ok) continue;
      const widthMm = widthOf(resized.design, liftId);
      const counts = countsOfTheLiftsOf(resized.design);
      seenWidths.push(widthMm);

      expect(counts, `${String(widthMm)} mm`).toEqual({
        hinges:
          widthMm > WIDE_LIFT_ABOVE_MM
            ? HINGES_ON_A_WIDE_LIFT_DOOR
            : HINGES_ON_A_NARROW_LIFT_DOOR,
        drawers: 0,
        pushToOpen: 0,
        lifts: 1,
      });
    }

    expect(new Set(seenWidths).size).toBeGreaterThan(4);
    expect(seenWidths.some((width) => width <= WIDE_LIFT_ABOVE_MM)).toBe(true);
    expect(seenWidths.some((width) => width > WIDE_LIFT_ABOVE_MM)).toBe(true);
  });

  it("is refused at every width off the 50 mm grid by a resize", () => {
    const { world, liftId } = worldWithALiftInPlaceOfAWallCabinet();

    for (const requestedMm of [
      301, 449, 499, 501, 503, 506, 525, 549, 551, 799,
    ]) {
      const resized = resizeTo(world, liftId, requestedMm);

      expect(resized.ok, `${String(requestedMm)} mm`).toBe(false);
    }
  });
});

describe("a lift inserted into an empty column of an off-grid width", () => {
  const BUILT_DOOR_INSET_MM = 6;

  function worldWithAnEmptyWallColumnOf(widthMm: number): KitchenWorld {
    const design: Design = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.filter(({ id }) => id !== "p14"),
      emptyColumns: [
        {
          wall: "A",
          alongMm: 1_000,
          widthMm,
          y0Mm: 1_500,
          topMm: 2_200,
          depthMm: 350,
        },
      ],
    };
    const base = createWorld(design, KITCHEN_L_BODY_CATALOG);
    const records = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);
    const columns = deriveColumns(
      records,
      { emptyColumns: design.emptyColumns },
      design.room,
    );
    return {
      ...base,
      columns,
      records,
      voids: recomputeVoids(records, columns),
    };
  }

  it.each([499, 500, 501, 503, 506, 507, 523, 549])(
    "is built at the %i mm of its opening, so the 501 to 549 mm band is reachable by insertion",
    (openingMm) => {
      const world = worldWithAnEmptyWallColumnOf(openingMm);
      const opening = world.voids.find(
        ({ w }) => Math.round(w * 1_000) === openingMm,
      );
      if (opening === undefined) throw new Error("no opening of that width");

      const inserted = insertInto(
        world,
        { kind: "void", id: opening.id },
        "wall-lift",
      );

      expect(inserted.ok).toBe(true);
      if (!inserted.ok) return;
      expect(widthOf(inserted.design, inserted.effect.placementId)).toBe(
        openingMm,
      );
    },
  );

  // Characterises the reading OQ-5a leaves open, not a ruling: the hinge rule reads the body's width, as the owner's
  // "the door is wide" is taken here. The built door is 6 mm narrower than its body, so at 501 to 506 mm the body is
  // over 500 mm and its door is not. Whoever rules OQ-5a should see this band: one comparison moves it.
  it.each([501, 503, 506])(
    "takes three hinges at %i mm by its body's width, though the door it draws is no wider than 500 mm",
    (openingMm) => {
      const world = worldWithAnEmptyWallColumnOf(openingMm);
      const opening = world.voids.find(
        ({ w }) => Math.round(w * 1_000) === openingMm,
      );
      if (opening === undefined) throw new Error("no opening of that width");
      const inserted = insertInto(
        world,
        { kind: "void", id: opening.id },
        "wall-lift",
      );
      if (!inserted.ok) throw new Error(inserted.reason.code);

      expect(countsOfTheLiftsOf(inserted.design).hinges).toBe(
        HINGES_ON_A_WIDE_LIFT_DOOR,
      );
      expect(openingMm - BUILT_DOOR_INSET_MM).toBeLessThanOrEqual(
        WIDE_LIFT_ABOVE_MM,
      );
    },
  );
});
