// The approved U grid, generated whole and checked against each room's plan and the U's rules for its
// uppers (U3b AC1, N11.6, N11.8). The grid is 88 434 generations, so it is cut into A-ranges that
// separate test files run in parallel workers.
import { describe, expect, it } from "vitest";

import type { DesignRoom, GenerateKitchenResult } from "../../src/index.js";
import { generateU, spanMismatchesOf } from "./generated-u.js";
import { upperFindings } from "./generated-u-uppers.js";
import { gateVerdictFor } from "./u-gate-verdict.js";

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
        } else if (outcome.ok !== gateVerdictFor(room).ok) {
          problems.push(
            `${roomKey(room)} the U gate and the generator disagree`,
          );
        } else if (outcome.ok) {
          composed += 1;
          problems.push(
            ...[
              ...spanMismatchesOf(outcome),
              ...upperFindings(room, outcome),
            ].map((line) => `${roomKey(room)} ${line}`),
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
    it("without a throw, every body stands where the plan put it on all three walls, the uppers keep the U's rules, and the minimum-kitchen gate agrees with the generator", () => {
      const report = sweepGridSlice(fromWallAMm, toWallAMm);

      expect(report.problems.slice(0, 10)).toStrictEqual([]);
      expect(report.composed).toBeGreaterThan(0);
    }, 300_000);
  });
}
