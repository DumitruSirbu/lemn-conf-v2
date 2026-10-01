// The vocabulary a generated run is planned in: its items, how its reading order is cut across the
// corner, and the plan it becomes.
//
// **A module of its own only to keep the composer's graph acyclic.** `generation-priorities.ts`
// composes the core run and builds the plan, and `optional-run-items.ts` decides the bottle, the pan
// drawer and the threshold drawer on it; the first calls the second, so the types and the one fit
// test both read cannot live in either. Not re-exported from the package index: the public types
// below reach it through `generation-priorities.ts`, under the names they always had.

import type { DesignRoom, DesignWall } from "../design.js";
import { DOOR_BASE_BUILD_ID } from "./body-choice.js";
import { STORAGE_BODY_WIDTH_MM } from "./leftover-rule.js";

// M7B U1 slice S1's minimal type-level fix: `DesignWall` widened to include `"C"` (ADR 0132), but
// this composer reads exactly two walls — `readingOrderWallsFor` never returns a third — so its own
// exhaustive `Record`s stay keyed on the two it actually builds. Wiring a wall-C arm into this
// composer is U3's (ADR 0132 *Consequences*), not this narrowing.
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

// M7B U3a slice S1: the U's own three-wall plan (ADR 0110 Amendment N). A three-wall composition is
// a different shape of thing from the L's two-wall reading order and cut — a U has two corners and
// two side walls that never mirror each other (ADR 0132 Q-U5) — so it gets its own plan type rather
// than a `DesignWall` squeezed into `TwoWallDispatch`'s two slots. `TwoWallDispatch` and
// `KitchenCompositionPlan` are untouched; nothing above this line changed for the U.

/** One base the U planner placed, on whichever of the three walls it stands on — `PlannedGenerationBase`'s
 *  own shape, `wall` widened to `DesignWall` since a U plan places bases on A, B and C alike. */
export interface UPlannedGenerationBase {
  readonly id: string;
  readonly role: GenerationBaseRole;
  readonly buildId: string;
  readonly widthMm: number;
  readonly wall: DesignWall;
  readonly startMm: number;
  readonly endMm: number;
}

/** Where the fridge or the far wall's tower stands, read as *N3 revised* 3 and 10 count it: the
 *  number of base bodies between the corner and the item, or `"free-end"` where the item stands
 *  flush against the wall's own free end instead (fixes RQ18's stop-and-report, AC3: a position
 *  field replaces the heuristic classifiers `u-composition.test.ts` and `u-tall-layout.test.ts` used
 *  to read a plan's own bases back apart). */
export type UPlacementPosition = "free-end" | number;

/** The direction wall A's run is read in, from the corner it shares with the fridge wall: the
 *  along-wall coordinate increases when that corner is wall A's own start, and decreases when it is
 *  wall A's end (*N3 revised* 5's "packed from the fridge corner"). Computed once, from the fridge
 *  wall (`u-fridge-wall.ts`), and read by every later decision that walks wall A in run order. */
export type WallAReadingDirection = "increasing" | "decreasing";

/** The U's own plan — `KitchenCompositionPlan`'s shape over three walls instead of two, which
 *  `generateKitchen` reads to compose a U. */
export interface UKitchenCompositionPlan {
  readonly room: DesignRoom;
  /** Spatial order, corner to free end on each wall, matching the shell's tile order. */
  readonly bases: readonly UPlannedGenerationBase[];
  readonly floorWidthsMm: Readonly<Record<DesignWall, readonly number[]>>;
  readonly dropped: readonly GenerationCoreRole[];
  readonly minimumMet: boolean;
  /** Each wall's bare end, after wall A's remainder fill (ADR 0110 N11.9): wall A's is under 300 mm. */
  readonly remainderMm: Readonly<Record<DesignWall, number>>;
  /** `undefined` when the fridge was dropped (*N3 revised* 2's RQ9 branch). */
  readonly fridgePosition: UPlacementPosition | undefined;
  /** `undefined` when no oven tower stands (E4's other branch: the hob keeps its own oven). */
  readonly towerPosition: UPlacementPosition | undefined;
}

/** One of the three walls' free run, corner to free end — `uShellFloorRuns`'s own shape
 *  (`shell-design.ts:806-830`), restated here so `u-composition.ts` and `u-tall-layout.ts` share one
 *  type rather than each naming a dependency on the shell builder, or on each other. */
export interface UGenerationRun {
  readonly wall: DesignWall;
  readonly startMm: number;
  readonly endMm: number;
}

/** ADR 0110 *N3 revised* 1: the entered total run at or above which a U is "large", driving the
 *  tall-cabinet, oven and back-wall rules `u-composition.ts` and `u-tall-layout.ts` own. Owner,
 *  relayed (N1.3's follow-up): *"one 'large U' threshold, A + B + C ≥ 10 m"*. Ten metres over the
 *  three **entered** lengths — never the free-run capacity, the same "entered, not capacity" key ADR
 *  0120 E2 ruled for the L's own wall assignment. Kept here rather than in either composer, so
 *  neither restates it for the other (ADR 0102). */
export const LARGE_U_TOTAL_MM = 10_000;

/** The three **entered** lengths of a U, summed: the key `isLargeU` and the drawer target both read. */
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

/** *N3 revised* 11 (and C2, Q8 (iii)): whether the back wall, wall A, carries no wall-row or top-row body
 *  in this room. Only a large U's does: its wall-A strips are tiled and its hood is the one body above
 *  its base row. Read by the shell, for which pieces stand over a corner and which rows its wall-A run
 *  starts past, and by the upper policy, for which bases are owed an upper, so the two cannot disagree
 *  (ADR 0102). */
export function isBackWallBaseOnly(room: DesignRoom): boolean {
  return room.shape === "U" && isLargeU(room);
}

/** *N3 revised* 3's boundaries on a wall's entered length: at most 3000 mm is a short wall, up to
 *  4000 mm a middle one, and beyond that a long one. The fridge wall's count from the corner and the
 *  far wall's tower both read them, so they are stated once. */
export const SHORT_SIDE_WALL_MAX_MM = 3000;
export const MIDDLE_SIDE_WALL_MAX_MM = 4000;

/** *N3 revised* 3's own table (RQ3's *"both from corner"*): `n` base cabinets stand between a
 *  corner and the fridge, or — RQ5's *"both from corner"* again — between a corner and the tower on
 *  a long far wall. One function, so `u-composition.ts`'s own count and `u-tall-layout.ts`'s cannot
 *  part on the same boundary (ADR 0102). Zero at 3000 mm or less; two at 3001-4000; three above. */
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
 *  reading-order offset from the first body's own start and its width. The start function is the
 *  only thing that differs between a wall read in increasing coordinates and one read from its far
 *  end. */
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
