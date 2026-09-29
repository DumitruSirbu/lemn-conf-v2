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
