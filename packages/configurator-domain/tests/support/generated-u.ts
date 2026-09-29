// What a generated U looks like against the plan it was generated from. The U planner
// (`u-composition.ts`) decides where every body stands; `generateKitchen` must put each one there
// through `insertBody` alone, so a test of generation compares the design with the plan, base by base,
// on all three walls (ADR 0110 N11.6).
import { describe, expect, it } from "vitest";

import {
  generateKitchen,
  isUKitchenPlan,
  type DesignRoom,
  type GenerateKitchenResult,
  type UKitchenCompositionPlan,
} from "../../src/index.js";
import { createFakeProbeFactory } from "./fake-probe.js";

export const U_GENERATED_AT = "2026-09-29T12:00:00.000Z";

export function generateU(room: DesignRoom): GenerateKitchenResult {
  return generateKitchen({
    room,
    occurredAt: U_GENERATED_AT,
    probeAt: createFakeProbeFactory(),
  });
}

export type ComposedKitchen = Extract<GenerateKitchenResult, { ok: true }>;

/** `room` generated, which must have composed. */
export function composeU(room: DesignRoom): ComposedKitchen {
  const result = generateU(room);
  if (!result.ok) {
    throw new Error(`composeU: ${JSON.stringify(room)} did not compose`);
  }
  return result;
}

/** The three-wall plan a U's log carries. */
export function uPlanOf(
  result: GenerateKitchenResult,
): UKitchenCompositionPlan {
  const { plan } = result.log;
  if (!isUKitchenPlan(plan)) {
    throw new Error("uPlanOf: the log carries a two-wall plan, not a U's");
  }
  return plan;
}

/** Every planned base whose generated placement is not the plan's: not placed, on another wall, another
 *  body, another width, or another span. `[]` for a refused room, which places nothing. */
export function spanMismatchesOf(
  result: GenerateKitchenResult,
): readonly string[] {
  if (!result.ok) return [];
  const mismatches: string[] = [];
  for (const base of uPlanOf(result).bases) {
    const step = result.log.steps.find((candidate) => candidate.id === base.id);
    const placement =
      step?.status === "placed"
        ? result.design.placements.find(
            (candidate) => candidate.id === step.placementId,
          )
        : undefined;
    if (placement === undefined) {
      mismatches.push(`${base.id} was not placed`);
      continue;
    }
    const startMm = placement.alongMm - placement.body.widthMm / 2;
    const endMm = placement.alongMm + placement.body.widthMm / 2;
    const isPlanned =
      placement.wall === base.wall &&
      placement.body.buildId === base.buildId &&
      startMm === base.startMm &&
      endMm === base.endMm;
    if (!isPlanned) {
      mismatches.push(
        `${base.id}: planned ${base.buildId} ${base.wall} ${String(base.startMm)}-${String(base.endMm)}, generated ${placement.body.buildId} ${placement.wall} ${String(startMm)}-${String(endMm)}`,
      );
    }
  }
  return mismatches;
}

export interface GridSliceReport {
  readonly composed: number;
  readonly refused: number;
  /** A room that threw, or whose generated design is not its plan, named with the room. */
  readonly problems: readonly string[];
}

const GRID_STEP_MM = 100;
const GRID_SIDE_WALL_MIN_MM = 1000;
const GRID_SIDE_WALL_MAX_MM = 6000;
const GRID_HEIGHT_MM = 2600;

/** Every approved grid room (A from `fromWallAMm` to `toWallAMm`, B and C 1000-6000, step 100, h 2600)
 *  generated: none may throw, and none may differ from its plan. */
export function sweepGridSlice(
  fromWallAMm: number,
  toWallAMm: number,
): GridSliceReport {
  let composed = 0;
  let refused = 0;
  const problems: string[] = [];
  for (
    let widthMm = fromWallAMm;
    widthMm <= toWallAMm;
    widthMm += GRID_STEP_MM
  ) {
    for (
      let depthMm = GRID_SIDE_WALL_MIN_MM;
      depthMm <= GRID_SIDE_WALL_MAX_MM;
      depthMm += GRID_STEP_MM
    ) {
      for (
        let wallCMm = GRID_SIDE_WALL_MIN_MM;
        wallCMm <= GRID_SIDE_WALL_MAX_MM;
        wallCMm += GRID_STEP_MM
      ) {
        const room: DesignRoom = {
          shape: "U",
          widthMm,
          depthMm,
          wallCMm,
          heightMm: GRID_HEIGHT_MM,
        };
        const outcome = generateOrDescribeThrow(room);
        if (typeof outcome === "string") {
          problems.push(`${roomKey(room)} threw: ${outcome}`);
        } else if (outcome.ok) {
          composed += 1;
          problems.push(
            ...spanMismatchesOf(outcome).map(
              (line) => `${roomKey(room)} ${line}`,
            ),
          );
        } else {
          refused += 1;
        }
      }
    }
  }
  return { composed, refused, problems };
}

function generateOrDescribeThrow(
  room: DesignRoom,
): GenerateKitchenResult | string {
  try {
    return generateU(room);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function roomKey(room: DesignRoom): string {
  return `${String(room.widthMm)}/${String(room.depthMm)}/${String(room.wallCMm)}`;
}

/** One file's share of the approved grid. The grid is 88 434 generations, so it is cut into A-ranges
 *  that separate test files run in parallel workers. */
export function describeGridSlice(
  fromWallAMm: number,
  toWallAMm: number,
): void {
  describe(`every approved grid room with A ${String(fromWallAMm)}-${String(toWallAMm)} generates (U3b AC1, N11.6)`, () => {
    it("without a throw, and every generated body stands where the plan put it, on all three walls", () => {
      const report = sweepGridSlice(fromWallAMm, toWallAMm);

      expect(report.problems.slice(0, 10)).toStrictEqual([]);
      expect(report.composed).toBeGreaterThan(0);
    }, 300_000);
  });
}
