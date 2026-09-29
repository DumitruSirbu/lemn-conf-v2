// The U's back-wall pack (ADR 0110 *N3 revised* 5): the core run — sink, dishwasher, preparation,
// hob — laid along wall A from the fridge's own corner, what does not fit continuing round the far
// corner onto the far wall, and the table of attempts that drops the dishwasher first and then the
// preparation cabinet.
import type { DesignWall } from "../design.js";
import { DISHWASHER_RUN_ITEM } from "./dishwasher-beside-the-sink.js";
import { GENERATION_PRIORITIES } from "./generation-priorities.js";
import {
  plannedBaseAt,
  type GenerationAncillaryRunItem,
  type GenerationCoreRole,
  type GenerationPriority,
  type UGenerationRun,
  type UPlannedGenerationBase,
} from "./run-layout.js";

/** The core role's own declared priority: its build id and width, read rather than restated. */
export function declaredPriority(role: GenerationCoreRole): GenerationPriority {
  const priority = GENERATION_PRIORITIES.find(
    (candidate) => candidate.role === role,
  );
  if (!priority) {
    throw new Error(
      `u-back-wall-pack: GENERATION_PRIORITIES declares no ${role}`,
    );
  }
  return priority;
}

const SINK_PRIORITY = declaredPriority("sink");
const PREPARATION_PRIORITY = declaredPriority("preparation");
const HOB_PRIORITY = declaredPriority("hob");

/** One wall's free run, read as a packing lane: how much of it there is, and where along the wall an
 *  item of a given width starts at a given reading-order offset from wherever this lane's own reading
 *  starts. */
export interface PackingLane {
  readonly wall: DesignWall;
  readonly capacityMm: number;
  readonly startMmAt: (offsetMm: number, widthMm: number) => number;
}

export function laneFromTheCorner(
  wall: DesignWall,
  run: UGenerationRun,
): PackingLane {
  return {
    wall,
    capacityMm: run.endMm - run.startMm,
    startMmAt: (offsetMm) => run.startMm + offsetMm,
  };
}

/** Wall A's own lane, read from whichever corner it shares with the fridge wall (*N3 revised* 5:
 *  "packed from the fridge corner") — increasing along-wall coordinate when the fridge is on wall B,
 *  decreasing when it is on wall C, the same "prefix wall reversed" shape `generation-priorities.ts`
 *  already reads wall A or wall B in for the L. */
export function wallALaneFromTheFridgeCorner(
  fridgeWall: DesignWall,
  runA: UGenerationRun,
): PackingLane {
  if (fridgeWall === "B") return laneFromTheCorner("A", runA);
  return {
    wall: "A",
    capacityMm: runA.endMm - runA.startMm,
    startMmAt: (offsetMm, widthMm) => runA.endMm - offsetMm - widthMm,
  };
}

export type CoreRunItem = GenerationPriority | GenerationAncillaryRunItem;

/** The sink is the first item and never leaves wall A (*N3 revised* 5, ADR 0110 N11.3, ADR 0108 H3). */
function isTheSink(item: CoreRunItem): boolean {
  return item.role === SINK_PRIORITY.role;
}

function idOf(item: CoreRunItem): string {
  return "id" in item ? item.id : item.role;
}

export interface PackedBackWall {
  readonly fits: boolean;
  readonly bases: readonly UPlannedGenerationBase[];
  /** Whether the pack ever left wall A — when it did not, wall A's own lane has an offset left to
   *  fill (the A4 correction); when it did, wall A's own remainder is already under 600 mm by
   *  construction (the item that overflowed did not fit what was left). */
  readonly hasOverflowedOnce: boolean;
  /** The offset the pack stopped at on wall A's own lane — meaningful only when it never overflowed,
   *  and the start the wall-A fill continues from. */
  readonly wallAOffsetMm: number;
}

const NOT_PACKED: PackedBackWall = {
  fits: false,
  bases: [],
  hasOverflowedOnce: false,
  wallAOffsetMm: 0,
};

export interface BackWallLanes {
  readonly wallA: PackingLane;
  readonly far: PackingLane;
}

/** Where the pack has got to: the lane it is filling and the offset in it. */
interface PackCursor {
  readonly lane: PackingLane;
  readonly offsetMm: number;
  readonly hasOverflowedOnce: boolean;
  readonly bases: readonly UPlannedGenerationBase[];
}

/** *N3 revised* 5: the back wall packed from the fridge corner, in fixed reading order; what does
 *  not fit continues round the far corner onto the far wall, from its own corner. Detected by
 *  simulating the pack rather than a combined-capacity sum, because two 600 mm items can waste up to
 *  599 mm of a lane's own tail (A4) without a sum test ever seeing it. */
export function packBackWallAndOverflow(
  items: readonly CoreRunItem[],
  lanes: BackWallLanes,
): PackedBackWall {
  let cursor: PackCursor = {
    lane: lanes.wallA,
    offsetMm: 0,
    hasOverflowedOnce: false,
    bases: [],
  };
  for (const item of items) {
    const next = packedAfter(cursor, item, lanes);
    if (next === undefined) return NOT_PACKED;
    cursor = next;
  }
  const { hasOverflowedOnce, offsetMm, bases } = cursor;
  return {
    fits: true,
    bases,
    hasOverflowedOnce,
    wallAOffsetMm: hasOverflowedOnce ? 0 : offsetMm,
  };
}

function packedAfter(
  cursor: PackCursor,
  item: CoreRunItem,
  lanes: BackWallLanes,
): PackCursor | undefined {
  const at = fitsTheLane(cursor, item)
    ? cursor
    : overflowedOnto(lanes.far, cursor, item);
  return at === undefined ? undefined : placed(at, item);
}

function fitsTheLane(cursor: PackCursor, item: CoreRunItem): boolean {
  return cursor.offsetMm + item.widthMm <= cursor.lane.capacityMm;
}

/** The pack continuing at the start of the far lane, or `undefined` where it may not: only one
 *  overflow is allowed, the sink never leaves wall A, and the item must fit the far lane. */
function overflowedOnto(
  farLane: PackingLane,
  cursor: PackCursor,
  item: CoreRunItem,
): PackCursor | undefined {
  if (cursor.hasOverflowedOnce || isTheSink(item)) return undefined;
  const onTheFarWall = {
    ...cursor,
    lane: farLane,
    offsetMm: 0,
    hasOverflowedOnce: true,
  };
  return fitsTheLane(onTheFarWall, item) ? onTheFarWall : undefined;
}

function placed(cursor: PackCursor, item: CoreRunItem): PackCursor {
  const { lane, offsetMm } = cursor;
  const base = plannedBaseAt({
    id: idOf(item),
    role: item.role,
    buildId: item.buildId,
    widthMm: item.widthMm,
    wall: lane.wall,
    startMm: lane.startMmAt(offsetMm, item.widthMm),
  });
  return {
    ...cursor,
    offsetMm: offsetMm + item.widthMm,
    bases: [...cursor.bases, base],
  };
}

/** One attempt at the back wall's core run. `hasPreparation` is what the attempt keeps of the
 *  preparation cabinet, and so what it drops of it. */
export interface BackWallAttempt {
  readonly hasPreparation: boolean;
  readonly items: readonly CoreRunItem[];
}

/** *N3 revised* 5's three attempts, in the owner's own drop order: the dishwasher first, then the
 *  preparation cabinet. The sink and the hob are never attempted without each other — ADR 0110 A2's
 *  minimum kitchen — so the last attempt is the floor tried before refusing. */
export const BACK_WALL_ATTEMPTS: readonly BackWallAttempt[] = [
  {
    hasPreparation: true,
    items: [
      SINK_PRIORITY,
      DISHWASHER_RUN_ITEM,
      PREPARATION_PRIORITY,
      HOB_PRIORITY,
    ],
  },
  {
    hasPreparation: true,
    items: [SINK_PRIORITY, PREPARATION_PRIORITY, HOB_PRIORITY],
  },
  { hasPreparation: false, items: [SINK_PRIORITY, HOB_PRIORITY] },
];
