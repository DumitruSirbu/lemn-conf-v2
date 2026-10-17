// 8U §12 (ADR 0132): with the editor uncapped, the merge commutes with the U's reflection in x = W/2, abutting wall-A
// spaces included. `qa-m7b-u1-mirror-equivariance.property.test.ts` keeps wall-A spaces from abutting, because a
// merge capped at 800 is greedy from the wall's start; uncapped, a run within tolerance is one space from either end.
// Walls B and C swap under the reflection, so a run on each is a run on the other.
//
// A right-hand L is the left-hand document drawn in a reflection (ADR 0129), and the merge never reads
// `cornerDirection`, so its map is the stored document's by construction and is not re-asserted here.
//
// R6, through a mocked copy of the merge: the editor capped at 800 turns the property red.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { CABINETRY_MAX_WIDTH_MM } from "../src/catalog.js";
import type { Design, DesignWall, EmptyColumn } from "../src/design.js";
import { buildKitchenLBodyCatalog } from "../src/fixtures/kitchen-l-design.js";
import {
  deriveColumns,
  derivePlacementRecords,
  recomputeVoids,
  type VoidRecord,
} from "../src/void-engine.js";
import {
  comparableVoids,
  mirroredVoids,
  mirrorUDesign,
} from "./support/mirror-u-design.js";

const CATALOG = buildKitchenLBodyCatalog(600);
const NOW = "2026-10-16T12:00:00.000Z";
const RUNS = 200;
const ROOM_HEIGHT_MM = 2600;
const SHALLOWEST_DEPTH_MM = 580;
/** Each dimension spreads at most this, so no tolerance chain can let the clear order or the scan decide (§6.3). */
const SPREAD_MM = 20;

interface DrawnSpace {
  readonly widthMm: number;
  readonly floorMm: number;
  readonly topMm: number;
  readonly depthMm: number;
}

const drawnSpace: fc.Arbitrary<DrawnSpace> = fc.record({
  widthMm: fc.integer({ min: 50, max: 400 }).map((half) => half * 2),
  floorMm: fc.integer({ min: 0, max: SPREAD_MM }),
  topMm: fc.integer({ min: 0, max: SPREAD_MM }),
  depthMm: fc.integer({ min: 0, max: SPREAD_MM }),
});
const drawnRun = fc.record({
  startMm: fc.integer({ min: 0, max: 400 }).map((half) => half * 2),
  spaces: fc.array(drawnSpace, { minLength: 2, maxLength: 6 }),
});

describe("the uncapped merge commutes with the U's reflection (8U §12, ADR 0132)", () => {
  it("publishes the mirror of a U's voids for abutting runs on walls A, B and C, at any total", () => {
    let overACabinet = 0;

    fc.assert(
      fc.property(drawnRun, drawnRun, drawnRun, (onA, onB, onC) => {
        const design = uDesignWith([
          ...laidOut("A", onA),
          ...laidOut("B", onB),
          ...laidOut("C", onC),
        ]);

        expect(comparableVoids(voidsOf(mirrorUDesign(design)))).toEqual(
          mirroredVoids(voidsOf(design), design.room.widthMm),
        );
        if (totalWidthMm(onA) > CABINETRY_MAX_WIDTH_MM) overACabinet += 1;
      }),
      { numRuns: RUNS },
    );

    expect(overACabinet).toBeGreaterThan(0);
  });
});

function laidOut(
  wall: DesignWall,
  run: { readonly startMm: number; readonly spaces: readonly DrawnSpace[] },
): EmptyColumn[] {
  let leftMm = run.startMm;
  return run.spaces.map((space) => {
    const column: EmptyColumn = {
      wall,
      alongMm: leftMm + space.widthMm / 2,
      widthMm: space.widthMm,
      y0Mm: space.floorMm,
      topMm: ROOM_HEIGHT_MM - space.topMm,
      depthMm: SHALLOWEST_DEPTH_MM + space.depthMm,
    };
    leftMm += space.widthMm;
    return column;
  });
}

function totalWidthMm(run: { readonly spaces: readonly DrawnSpace[] }): number {
  return run.spaces.reduce((sum, space) => sum + space.widthMm, 0);
}

/** Every wall long enough for the longest run drawn (800 + 6 × 800), so no clip at a wall's end enters. */
function uDesignWith(emptyColumns: readonly EmptyColumn[]): Design {
  return {
    room: {
      shape: "U",
      widthMm: 6000,
      depthMm: 6000,
      wallCMm: 6000,
      heightMm: ROOM_HEIGHT_MM,
    },
    presetId: null,
    placements: [],
    emptyColumns: [...emptyColumns],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function voidsOf(design: Design): readonly VoidRecord[] {
  const records = derivePlacementRecords(design, CATALOG);
  return recomputeVoids(records, deriveColumns(records, design, design.room));
}
