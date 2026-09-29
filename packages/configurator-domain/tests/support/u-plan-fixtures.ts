// The U planner's shared test fixtures: a room, the plan the planner makes of it, and the bases a plan
// stands on one wall. Nine test files used to carry a private copy of each.
//
// `u-plan-invariants.ts` deliberately does not import this module. It is the independent oracle — it
// re-derives the run order, the drawer target and the tower from the room and the runs alone, and takes
// its plan from its caller — so it keeps its own wall reader rather than share the planner's route.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredColumnSizes,
  KITCHEN_L_DESIGN,
  uShellFloorRuns,
  type DesignRoom,
  type DesignWall,
  type UKitchenCompositionPlan,
  type UPlannedGenerationBase,
} from "../../src/index.js";
import { planUKitchenComposition } from "../../src/generation/u-composition.js";
import type { URuns } from "./u-plan-invariants.js";

/** The catalogue's declared column sizes, as `generateKitchen` hands them to the planner. */
export const DECLARED_COLUMNS = declaredColumnSizes(
  buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN)),
);

const DEFAULT_ROOM_HEIGHT_MM = 2600;
const DEFAULT_ROOM: DesignRoom = {
  shape: "U",
  widthMm: 3600,
  depthMm: 2400,
  wallCMm: 2200,
  heightMm: DEFAULT_ROOM_HEIGHT_MM,
};

/** A U room from its three entered wall lengths, 2600 mm high unless told otherwise. */
export function uRoom(
  widthMm: number,
  depthMm: number,
  wallCMm: number,
  heightMm = DEFAULT_ROOM_HEIGHT_MM,
): DesignRoom {
  return { shape: "U", widthMm, depthMm, wallCMm, heightMm };
}

/** A U room that is 3600 × 2400 × 2200 (A, B, C) and 2600 mm high, with `overrides` applied: for a test
 *  that names only the dimension it varies. */
export function uRoomOverriding(
  overrides: Partial<DesignRoom> = {},
): DesignRoom {
  return { ...DEFAULT_ROOM, ...overrides };
}

/** The plan the U planner makes of `room` on its shell's own free runs, or on `runs` when a test
 *  hands it others. */
export function planFor(
  room: DesignRoom,
  runs: URuns = uShellFloorRuns(room),
): UKitchenCompositionPlan {
  return planUKitchenComposition({ room, runs, columns: DECLARED_COLUMNS });
}

/** The bases a plan stands on `wall`, in increasing along-wall order. */
export function basesOn(
  plan: UKitchenCompositionPlan,
  wall: DesignWall,
): UPlannedGenerationBase[] {
  return plan.bases
    .filter((base) => base.wall === wall)
    .sort((left, right) => left.startMm - right.startMm);
}
