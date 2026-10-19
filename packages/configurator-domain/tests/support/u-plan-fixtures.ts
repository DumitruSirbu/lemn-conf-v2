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
import { DOOR_BASE_BUILD_ID } from "../../src/generation/body-choice.js";
import {
  countedBodyIdsOf,
  withTheFreeEndsFilled,
} from "../../src/generation/free-end-fill.js";
import { planUKitchenComposition } from "../../src/generation/u-composition.js";
import {
  risesIntoWallRow,
  WALL_CABINET_BUILD_ID,
} from "../../src/generation/upper-policy.js";
import type { URuns } from "./u-plan-invariants.js";

/** The catalogue's declared column sizes, as `generateKitchen` hands them to the planner. */
export const DECLARED_COLUMNS = declaredColumnSizes(
  buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN)),
);

const PLANNING_CATALOG = buildKitchenLBodyCatalog(
  cabinetDepthMmOf(KITCHEN_L_DESIGN),
);

/** ADR 0167 D2: the narrowest width both bodies of a filled column share, read from the catalogue. A remainder
 *  of at least this takes a fill, so what a filled plan leaves bare is under it. */
export const FILL_FLOOR_MM = Math.max(
  ...[DOOR_BASE_BUILD_ID, WALL_CABINET_BUILD_ID].map(declaredMinWidthMm),
);

function declaredMinWidthMm(buildId: string): number {
  const minWidthMm = PLANNING_CATALOG.get(buildId)?.minWidthMm;
  if (minWidthMm === undefined) {
    throw new Error(`${buildId} declares no width floor`);
  }
  return minWidthMm;
}

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

/** The plan `generateKitchen` builds from: the U planner's, then every free end of at least the catalogue's
 *  narrowest cabinet filled (ADR 0167). `planFor` stays the composer alone, which leaves those ends bare.
 *  The same wiring as `generateKitchen`'s own, which `generate-kitchen.u.test.ts` compares against `log.plan`. */
export function filledPlanFor(
  room: DesignRoom,
  runs: URuns = uShellFloorRuns(room),
): UKitchenCompositionPlan {
  const composed = planFor(room, runs);
  return withTheFreeEndsFilled(composed, {
    floorMm: FILL_FLOOR_MM,
    isFullHeight: (buildId) => risesIntoWallRow(PLANNING_CATALOG, buildId),
    runs,
    countedIds: countedBodyIdsOf(composed),
  });
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
