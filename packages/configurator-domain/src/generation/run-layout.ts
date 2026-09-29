// The vocabulary a generated run is planned in: its items, how its reading order is cut across the
// corner, and the plan it becomes.
//
// **A module of its own only to keep the composer's graph acyclic.** `generation-priorities.ts`
// composes the core run and builds the plan, and `optional-run-items.ts` decides the bottle, the pan
// drawer and the threshold drawer on it; the first calls the second, so the types and the one fit
// test both read cannot live in either. Not re-exported from the package index: the public types
// below reach it through `generation-priorities.ts`, under the names they always had.

import type { DesignRoom, DesignWall } from "../design.js";

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

/** The U's own plan — `KitchenCompositionPlan`'s shape over three walls instead of two. No insert
 *  happens from this type (U3a's own scope); `generateKitchen` reads it starting U3b. */
export interface UKitchenCompositionPlan {
  readonly room: DesignRoom;
  /** Spatial order, corner to free end on each wall, matching the shell's tile order. */
  readonly bases: readonly UPlannedGenerationBase[];
  readonly floorWidthsMm: Readonly<Record<DesignWall, readonly number[]>>;
  readonly dropped: readonly GenerationCoreRole[];
  readonly minimumMet: boolean;
  readonly remainderMm: Readonly<Record<DesignWall, number>>;
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

export function isLargeU(room: DesignRoom): boolean {
  if (room.wallCMm === undefined) {
    throw new Error(
      "isLargeU: the room carries no wallCMm to sum a U's total run from",
    );
  }
  return room.widthMm + room.depthMm + room.wallCMm >= LARGE_U_TOTAL_MM;
}

/** *N3 revised* 3's own table (RQ3's *"both from corner"*): `n` base cabinets stand between a
 *  corner and the fridge, or — RQ5's *"both from corner"* again — between a corner and the tower on
 *  a long far wall. One function, so `u-composition.ts`'s own count and `u-tall-layout.ts`'s cannot
 *  part on the same boundary (ADR 0102). Zero at 3000 mm or less; two at 3001-4000; three above. */
export function baseCountFromTheCorner(enteredLengthMm: number): 0 | 2 | 3 {
  if (enteredLengthMm <= 3000) return 0;
  if (enteredLengthMm <= 4000) return 2;
  return 3;
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
