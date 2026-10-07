// The vocabulary a generated run is planned in: its items, how its reading order is cut across the
// corner, and the plan it becomes.
//
// A module of its own only to keep the composer's graph acyclic: `generation-priorities.ts` calls
// `optional-run-items.ts`, so the types and the one fit test both read cannot live in either. Not
// re-exported from the package index: the public types below reach it through `generation-priorities.ts`.

import type { DesignRoom, DesignWall } from "../design.js";
import { DOOR_BASE_BUILD_ID } from "./body-choice.js";
import { STORAGE_BODY_WIDTH_MM } from "./leftover-rule.js";

// This composer reads exactly two walls (`readingOrderWallsFor` never returns a third), so its exhaustive
// `Record`s stay keyed on the two it builds although `DesignWall` includes "C". A wall-C arm belongs to the
// U composer (ADR 0132 Consequences).
export type TwoWallDispatch = Extract<DesignWall, "A" | "B">;

export type GenerationCoreRole = "fridge" | "sink" | "preparation" | "hob";
export type GenerationBaseRole = GenerationCoreRole | "storage";

export const HOB_ROLE: GenerationCoreRole = "hob";

export interface GenerationPriority {
  readonly role: GenerationCoreRole;
  readonly buildId: string;
  readonly widthMm: number;
  readonly required: boolean;
}

/** A run member that is not a core role: the bottle cargo, the pan drawer or the threshold drawer. */
export interface GenerationAncillaryRunItem {
  readonly id: string;
  readonly role: "storage";
  readonly buildId: string;
  readonly widthMm: number;
}

export type GenerationRunItem = GenerationPriority | GenerationAncillaryRunItem;

/** The run in reading order and where it splits: `ordered.slice(0, cut)` reads on the prefix wall. */
export interface RunLayout {
  readonly ordered: readonly GenerationRunItem[];
  readonly cut: number;
}

export interface WallCapacities {
  readonly prefix: number;
  readonly suffix: number;
}

export interface PlannedGenerationBase {
  readonly id: string;
  readonly role: GenerationBaseRole;
  readonly buildId: string;
  readonly widthMm: number;
  readonly wall: TwoWallDispatch;
  readonly startMm: number;
  readonly endMm: number;
}

export interface KitchenCompositionPlan {
  readonly room: DesignRoom;
  /** Spatial order, corner to free end, matching the shell's tile order. */
  readonly bases: readonly PlannedGenerationBase[];
  readonly floorWidthsMm: Readonly<Record<TwoWallDispatch, readonly number[]>>;
  readonly dropped: readonly GenerationCoreRole[];
  readonly minimumMet: boolean;
  readonly remainderMm: Readonly<Record<TwoWallDispatch, number>>;
}

// The U's own three-wall plan (ADR 0110 Amendment N): a U has two corners and two side walls that never
// mirror each other, so it gets its own plan type rather than a `DesignWall` squeezed into
// `TwoWallDispatch`'s two slots.

/** One base the U planner placed: `PlannedGenerationBase`'s shape with `wall` widened to `DesignWall`,
 *  since a U plan places bases on A, B and C alike. */
export interface UPlannedGenerationBase {
  readonly id: string;
  readonly role: GenerationBaseRole;
  readonly buildId: string;
  readonly widthMm: number;
  readonly wall: DesignWall;
  readonly startMm: number;
  readonly endMm: number;
}

/** Where the fridge or the far wall's tower stands: the number of base bodies between the corner and the
 *  item, or `"free-end"` where it stands flush against the wall's free end (ADR 0110 Amendment N, N3 revised
 *  3 and 10). */
export type UPlacementPosition = "free-end" | number;

/** The direction wall A's run is read in, from the corner it shares with the fridge wall: increasing when
 *  that corner is wall A's start, decreasing when it is wall A's end. Computed once from the fridge wall
 *  (`u-fridge-wall.ts`) and read by every later decision that walks wall A in run order. */
export type WallAReadingDirection = "increasing" | "decreasing";

/** The U's own plan: `KitchenCompositionPlan`'s shape over three walls, read by `generateKitchen` to
 *  compose a U. */
export interface UKitchenCompositionPlan {
  readonly room: DesignRoom;
  /** Spatial order, corner to free end on each wall, matching the shell's tile order. */
  readonly bases: readonly UPlannedGenerationBase[];
  readonly floorWidthsMm: Readonly<Record<DesignWall, readonly number[]>>;
  readonly dropped: readonly GenerationCoreRole[];
  readonly minimumMet: boolean;
  /** Each wall's bare end, after wall A's remainder fill (ADR 0110 N11.9): wall A's is under 300 mm. */
  readonly remainderMm: Readonly<Record<DesignWall, number>>;
  /** `undefined` when the fridge was dropped. */
  readonly fridgePosition: UPlacementPosition | undefined;
  /** `undefined` when no oven tower stands (the hob keeps its own oven, E4). */
  readonly towerPosition: UPlacementPosition | undefined;
}

/** One of the three walls' free run, corner to free end: `uShellFloorRuns`'s shape, restated so
 *  `u-composition.ts` and `u-tall-layout.ts` share one type instead of each depending on the shell builder
 *  or on each other. */
export interface UGenerationRun {
  readonly wall: DesignWall;
  readonly startMm: number;
  readonly endMm: number;
}

/** The entered total run at or above which a U is "large" (A + B + C ≥ 10 m), driving the tall-cabinet, oven
 *  and back-wall rules of `u-composition.ts` and `u-tall-layout.ts`. Over the three entered lengths, never
 *  free-run capacity. Kept here so neither composer restates it for the other. see ADR 0110 Amendment N,
 *  N3 revised 1 */
export const LARGE_U_TOTAL_MM = 10_000;

/** The three entered lengths of a U, summed: the key `isLargeU` and the drawer target both read. */
export function enteredTotalMm(room: DesignRoom): number {
  if (room.wallCMm === undefined) {
    throw new Error(
      "enteredTotalMm: the room carries no wallCMm to sum a U's total run from",
    );
  }
  return room.widthMm + room.depthMm + room.wallCMm;
}

export function isLargeU(room: DesignRoom): boolean {
  return enteredTotalMm(room) >= LARGE_U_TOTAL_MM;
}

/** Whether the back wall, wall A, carries no wall-row or top-row body in this room, the hood and the top
 *  cabinet over it aside. Only a large U's does: its wall-A strips are tiled and nothing else stands above
 *  its base row. Read by the shell (which pieces stand over a corner, which rows wall A's run starts past)
 *  and by the upper policy (which bases are owed an upper), so the two cannot disagree. see ADR 0110
 *  Amendment N, N3 revised 11 */
export function isBackWallBaseOnly(room: DesignRoom): boolean {
  return room.shape === "U" && isLargeU(room);
}

/** Boundaries on a wall's entered length: at most 3000 mm is a short wall, up to 4000 mm a middle one,
 *  beyond that a long one. The fridge wall's count from the corner and the far wall's tower both read them
 *  (N3 revised 3). */
export const SHORT_SIDE_WALL_MAX_MM = 3000;
export const MIDDLE_SIDE_WALL_MAX_MM = 4000;

/** `n` base cabinets stand between a corner and the fridge, or between a corner and the tower on a long
 *  far wall. One function so `u-composition.ts`'s count and `u-tall-layout.ts`'s cannot part on a boundary:
 *  zero at 3000 mm or less, two at 3001–4000, three above. */
export function baseCountFromTheCorner(enteredLengthMm: number): 0 | 2 | 3 {
  if (enteredLengthMm <= SHORT_SIDE_WALL_MAX_MM) return 0;
  if (enteredLengthMm <= MIDDLE_SIDE_WALL_MAX_MM) return 2;
  return 3;
}

/** The one place a `UPlannedGenerationBase` literal is built: a base's end is always its start plus
 *  its width. */
export function plannedBaseAt(
  spec: Omit<UPlannedGenerationBase, "endMm">,
): UPlannedGenerationBase {
  const { id, role, buildId, widthMm, wall, startMm } = spec;
  return {
    id,
    role,
    buildId,
    widthMm,
    wall,
    startMm,
    endMm: startMm + widthMm,
  };
}

/** `count` plain door bases side by side from `startMm` in increasing along-wall order, each named
 *  `${idPrefix}:${wall}:${index}`. */
export function doorBasesFrom(spec: {
  readonly wall: DesignWall;
  readonly startMm: number;
  readonly count: number;
  readonly idPrefix: string;
}): readonly UPlannedGenerationBase[] {
  const { wall, startMm, count, idPrefix } = spec;
  return Array.from({ length: count }, (_, index) =>
    plannedBaseAt({
      id: `${idPrefix}:${wall}:${String(index)}`,
      role: "storage",
      buildId: DOOR_BASE_BUILD_ID,
      widthMm: STORAGE_BODY_WIDTH_MM,
      wall,
      startMm: startMm + index * STORAGE_BODY_WIDTH_MM,
    }),
  );
}

/** A body to place: what `plannedBaseAt` takes besides its role, wall and start. */
type BodyToPlace = Pick<UPlannedGenerationBase, "id" | "buildId" | "widthMm">;

/** `bodies` one after another on `wall` as storage, each starting where `startMmAt` says for its
 *  reading-order offset and width. The start function is the only thing that differs between a wall read
 *  in increasing coordinates and one read from its far end. */
export function placedInSequence(spec: {
  readonly wall: DesignWall;
  readonly bodies: readonly BodyToPlace[];
  readonly startMmAt: (offsetMm: number, widthMm: number) => number;
}): readonly UPlannedGenerationBase[] {
  const { wall, bodies, startMmAt } = spec;
  let offsetMm = 0;
  return bodies.map((body) => {
    const placed = plannedBaseAt({
      id: body.id,
      role: "storage",
      buildId: body.buildId,
      widthMm: body.widthMm,
      wall,
      startMm: startMmAt(offsetMm, body.widthMm),
    });
    offsetMm += body.widthMm;
    return placed;
  });
}

/** A start function for a wall read in increasing along-wall coordinates from `startMm`. */
export function increasingFrom(startMm: number): (offsetMm: number) => number {
  return (offsetMm) => startMm + offsetMm;
}

/** The bases standing on `wall`, in the order they were given. */
export function basesOnWall(
  bases: readonly UPlannedGenerationBase[],
  wall: DesignWall,
): UPlannedGenerationBase[] {
  return bases.filter((base) => base.wall === wall);
}

/** The bases standing on `wall`, in increasing along-wall order. */
export function basesAlongWall(
  bases: readonly UPlannedGenerationBase[],
  wall: DesignWall,
): UPlannedGenerationBase[] {
  return basesOnWall(bases, wall).sort(
    (left, right) => left.startMm - right.startMm,
  );
}

export function fitsAcrossTheCorner(
  readingOrder: readonly GenerationRunItem[],
  cut: number,
  capacityMm: WallCapacities,
): boolean {
  return (
    sumWidths(readingOrder.slice(0, cut)) <= capacityMm.prefix &&
    sumWidths(readingOrder.slice(cut)) <= capacityMm.suffix
  );
}

export function sumWidths(
  items: readonly Pick<GenerationPriority, "widthMm">[],
): number {
  return items.reduce((sum, item) => sum + item.widthMm, 0);
}
