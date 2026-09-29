// M7B U3b S1, criterion 1 — the composition property. Over the engine's U range, at the approved
// heights 2200, 2600 and 3900, `generateKitchen` either refuses exactly the rooms U3a's plan refuses,
// or composes a design that: breaks none of the plan's rules (`uPlanFindings`, re-derived from the room
// and the runs), overflows nowhere, is deterministic, replays from its own log, carries exactly one
// oven, leaves under 600 mm bare (under 300 mm on wall A), and puts every body where the plan put it.
// The composed count is checked so the property cannot pass by landing on refusals.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  findOverflowingPlacementIds,
  replayGenerationLog,
  uShellFloorRuns,
  type DesignRoom,
} from "../../src/index.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";
import {
  composeU,
  generateU,
  spanMismatchesOf,
  uPlanOf,
} from "../support/generated-u.js";
import { engineUWallBounds } from "../support/room-input.js";
import { uPlanFindings } from "../support/u-plan-invariants.js";

const RUNS = 300;
const APPROVED_HEIGHTS_MM = [2200, 2600, 3900] as const;
const OVEN_BUILD_IDS = ["tall-oven-tower", "base-hob-oven"];

const engineRoomArb = (() => {
  const walls = engineUWallBounds();
  return fc
    .tuple(
      fc.integer({ min: walls.wallA.minMm, max: walls.wallA.maxMm }),
      fc.integer({ min: walls.wallB.minMm, max: walls.wallB.maxMm }),
      fc.integer({ min: walls.wallC.minMm, max: walls.wallC.maxMm }),
      fc.constantFrom(...APPROVED_HEIGHTS_MM),
    )
    .map(
      ([widthMm, depthMm, wallCMm, heightMm]): DesignRoom => ({
        shape: "U",
        widthMm,
        depthMm,
        wallCMm,
        heightMm,
      }),
    );
})();

/** Every rule the property holds, for one room; the number of rooms composed is the return value. */
function checkGeneratedU(room: DesignRoom): "composed" | "refused" {
  const label = JSON.stringify(room);
  const result = generateU(room);
  const plan = uPlanOf(result);
  if (!result.ok) {
    expect(plan.minimumMet, label).toBe(false);
    return "refused";
  }
  const { design } = result;
  const runs = uShellFloorRuns(room);

  expect(uPlanFindings({ room, runs, plan }), label).toStrictEqual([]);
  expect(findOverflowingPlacementIds(design), label).toStrictEqual([]);
  expect(spanMismatchesOf(result), label).toStrictEqual([]);
  expect(
    design.placements.filter((placement) =>
      OVEN_BUILD_IDS.includes(placement.body.buildId),
    ),
    label,
  ).toHaveLength(1);
  expect(plan.remainderMm.A, label).toBeLessThan(300);
  expect(plan.remainderMm.B, label).toBeLessThan(600);
  expect(plan.remainderMm.C, label).toBeLessThan(600);
  expect(composeU(room), label).toStrictEqual(result);
  expect(
    replayGenerationLog({ log: result.log, probeAt: createFakeProbeFactory() }),
    label,
  ).toStrictEqual(design);
  return "composed";
}

describe("generateKitchen over the engine U range (U3b AC1)", () => {
  it("composes exactly the rooms the plan composes, and each is its plan, over 300 samples", () => {
    const outcomes = { composed: 0, refused: 0 };
    fc.assert(
      fc.property(engineRoomArb, (room) => {
        outcomes[checkGeneratedU(room)] += 1;
      }),
      { numRuns: RUNS },
    );

    expect(outcomes.composed).toBeGreaterThanOrEqual(150);
  }, 120_000);

  it.each(APPROVED_HEIGHTS_MM)(
    "holds at %i mm over the engine band's own boundary rooms",
    (heightMm) => {
      const walls = engineUWallBounds();
      const edgesMm = (bounds: {
        readonly minMm: number;
        readonly maxMm: number;
      }) => [bounds.minMm, bounds.minMm + 1, bounds.maxMm];
      for (const widthMm of edgesMm(walls.wallA)) {
        for (const depthMm of edgesMm(walls.wallB)) {
          for (const wallCMm of edgesMm(walls.wallC)) {
            checkGeneratedU({
              shape: "U",
              widthMm,
              depthMm,
              wallCMm,
              heightMm,
            });
          }
        }
      }
    },
  );
});
