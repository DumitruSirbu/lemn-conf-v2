// M7C wave C5 slices S1 and S2 — what a kitchen BUILT from a room the owner's Q6 changed must keep, read off the
// design (criteria 2 and 3): the upper and the top cabinet over the widened cabinet at its width, the wall depth
// beside the moved fridge (C7's invariant), nothing past the fridge, no cabinet over 800, the 100 mm side-wall
// reserve, no overflow, no invalid design and no strip of unrecorded floor. Shared by the L's and the U's tests.
import { expect } from "vitest";

import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  deriveColumns,
  derivePlacementRecords,
  findOverflowingPlacementIds,
  generateKitchen,
  KITCHEN_L_DESIGN,
  validateDesignForCatalog,
  wallLengthMm,
  type Design,
  type DesignPlacement,
  type DesignRoom,
  type DesignWall,
} from "../../src/index.js";
import { createFakeProbeFactory } from "./fake-probe.js";
import { unrecordedFloorStripsMm } from "./floor-coverage.js";
import {
  DOOR_CABINET,
  OWNERS_CABINET_CEILING_MM,
} from "./fridge-end-leftover.js";
import { CAPPED_SEAT_AT_600_MM } from "./span-overlap-fixtures.js";

const OCCURRED_AT = "2026-10-05T12:00:00.000Z";
const CATALOG = buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN));
const SIDE_WALL_RESERVE_MM = 100;

export function labelOf(room: DesignRoom): string {
  return `${String(room.widthMm)}x${String(room.depthMm)}x${String(room.heightMm)}`;
}

export function composed(room: DesignRoom): Design {
  const result = generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
  if (!result.ok) throw new Error(`${labelOf(room)} did not compose`);
  return result.design;
}

export function fridgeOf(design: Design, wall: DesignWall): DesignPlacement {
  const found = design.placements.find(
    (placement) =>
      placement.wall === wall && placement.body.buildId === "fridge-free",
  );
  if (!found) throw new Error(`no fridge on wall ${wall}`);
  return found;
}

export function spanOf(placement: DesignPlacement): readonly [number, number] {
  const halfMm = placement.body.widthMm / 2;
  return [placement.alongMm - halfMm, placement.alongMm + halfMm];
}

function isInTheWallRow(placement: DesignPlacement): boolean {
  return placement.y0Mm >= 1500 && placement.body.buildId === "wall-cabinet";
}

/** What the built kitchen must be, wherever the rule changed it: criteria 2 and 3 read off the design. */
export function expectABuiltKitchenThatKeepsEveryRule(
  changed: { readonly room: DesignRoom; readonly wall: DesignWall },
  design: Design,
): void {
  const { room, wall } = changed;
  const where = `${labelOf(room)} wall ${wall}`;
  const onTheWall = design.placements.filter(
    (placement) => placement.wall === wall,
  );
  const fridge = fridgeOf(design, wall);
  const [fridgeStart, fridgeEnd] = spanOf(fridge);
  const cabinet = onTheWall.find(
    (placement) =>
      placement.y0Mm === 0 &&
      placement.body.buildId === DOOR_CABINET &&
      spanOf(placement)[1] === fridgeStart,
  );
  expect(
    cabinet,
    `${where}: a base cabinet stands flush to the fridge`,
  ).toBeDefined();
  if (!cabinet) return;
  const [cabinetStart, cabinetEnd] = spanOf(cabinet);

  // Criterion 3: the upper, and the top cabinet over it, have the base's own width and centre.
  const over = onTheWall.filter(
    (placement) =>
      isInTheWallRow(placement) && placement.alongMm === cabinet.alongMm,
  );
  expect(over.map((placement) => placement.y0Mm).sort(), where).toEqual(
    room.heightMm >= 2600 ? [1500, 2200] : [1500],
  );
  for (const upper of over) {
    expect(upper.body.widthMm, `${where} y0 ${String(upper.y0Mm)}`).toBe(
      cabinet.body.widthMm,
    );
  }

  // Criterion 2: a cabinet over 800; wall bodies deeper than the wall depth beside the moved fridge.
  expect(cabinet.body.widthMm, where).toBeLessThanOrEqual(
    OWNERS_CABINET_CEILING_MM,
  );
  for (const wallBody of onTheWall.filter(isInTheWallRow)) {
    const [start, end] = spanOf(wallBody);
    const standsBesideTheFridge = end === fridgeStart || start === fridgeEnd;
    if (standsBesideTheFridge) {
      expect(
        wallBody.body.seatDepthMm,
        `${where}: a wall cabinet beside the fridge takes the wall depth`,
      ).toBe(CAPPED_SEAT_AT_600_MM);
    }
  }
  expect(
    onTheWall.filter((placement) => spanOf(placement)[0] >= fridgeEnd),
    `${where}: nothing stands past the fridge`,
  ).toEqual([]);
  if (wall !== "A") {
    // A side wall's free run already stops short of the wall by the slide reserve (ADR 0110 F7); the moved
    // fridge never spends it. Wall A of an L or a U has none.
    expect(fridgeEnd, `${where}: the 100 mm reserve`).toBeLessThanOrEqual(
      wallLengthMm(wall, room) - SIDE_WALL_RESERVE_MM,
    );
  }
  expect(cabinetEnd, where).toBe(fridgeStart);
  expect(cabinetStart, where).toBeLessThan(cabinetEnd);

  // Nothing overflows, nothing is invalid, and the floor holds no strip of its own.
  expect(findOverflowingPlacementIds(design), where).toEqual([]);
  expect(validateDesignForCatalog(design, CATALOG), where).toEqual([]);
  const columns = deriveColumns(
    derivePlacementRecords(design, CATALOG),
    design,
    design.room,
  );
  for (const stripWall of ["A", "B", "C"] as const) {
    expect(unrecordedFloorStripsMm(columns, stripWall), where).toEqual([]);
  }
}
