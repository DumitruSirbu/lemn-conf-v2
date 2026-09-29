// The U's fridge wall (ADR 0110 *N3 revised* 2 and 3, N9.2, N11.1): which side wall carries the fridge,
// where the fridge and its door storage stand on it, and what a wall whose fridge was dropped takes
// instead. The far wall is the other side wall; the back wall reads it through the roles computed
// here, never through a wall letter.
import type { DesignRoom, DesignWall } from "../design.js";
import { wallLengthMm } from "../queries/overflowing-placements.js";
import { planLeftover, STORAGE_BODY_WIDTH_MM } from "./leftover-rule.js";
import {
  baseCountFromTheCorner,
  doorBasesFrom,
  plannedBaseAt,
  type UGenerationRun,
  type UPlacementPosition,
  type UPlannedGenerationBase,
  type WallAReadingDirection,
} from "./run-layout.js";
import { FRIDGE_PRIORITY } from "./u-core-priorities.js";

/** Door storage on the fridge wall, named `storage:${wall}:${index}`. */
const STORAGE_ID_PREFIX = "storage";

export interface FridgePlacement {
  readonly fridgeWall: DesignWall;
  readonly farWall: DesignWall;
  readonly wallADirection: WallAReadingDirection;
  readonly bases: readonly UPlannedGenerationBase[];
  readonly dropped: boolean;
  /** `undefined` where `dropped` is `true`: no fridge stands, so it has no counted position. */
  readonly position: UPlacementPosition | undefined;
}

/** *N3 revised* 2 (RQ2, RQ9): the fridge stands on the wider side wall, or the other side wall if it
 *  does not fit there, or is dropped if it fits neither. **The RQ9 fallback measures 0 rooms on the
 *  approved grid** — the two side walls share the identical "entered − 1000" free-run formula
 *  (`corner-assembly-size.ts`'s own proof that both X-legs size identically), so a side wall too
 *  short for the fridge by capacity is, provably and not merely by measurement, the **narrower** one
 *  by entered length too, and the wider one is tried first. The branch is kept anyway, with a
 *  declared witness (ADR 0123) rather than a sweep floor that would read 0 for a population that
 *  cannot exist on any orderable room. */
export function placedFridge(
  room: DesignRoom,
  runs: Readonly<Record<DesignWall, UGenerationRun>>,
): FridgePlacement {
  const { primary, secondary } = fridgeWallCandidates(room);
  const primaryOnFridgeWall = wallRoles(primary, secondary);
  return (
    placementOn(primaryOnFridgeWall, room, runs) ??
    placementOn(wallRoles(secondary, primary), room, runs) ??
    droppedFridgePlacement(primaryOnFridgeWall, runs)
  );
}

/** *N3 revised* 2: the wider side wall by entered length carries the fridge, wall B on a tie —
 *  the L's own tie rule (`generation-priorities.ts`'s *"equal walls keep wall B as the prefix"*).
 *  The other side wall is the far wall. */
interface FridgeWallCandidates {
  readonly primary: DesignWall;
  readonly secondary: DesignWall;
}

function fridgeWallCandidates(room: DesignRoom): FridgeWallCandidates {
  const wallBWiderOrEqual = wallLengthMm("B", room) >= wallLengthMm("C", room);
  return wallBWiderOrEqual
    ? { primary: "B", secondary: "C" }
    : { primary: "C", secondary: "B" };
}

interface WallRoles {
  readonly fridgeWall: DesignWall;
  readonly farWall: DesignWall;
  readonly wallADirection: WallAReadingDirection;
}

function wallRoles(fridgeWall: DesignWall, farWall: DesignWall): WallRoles {
  return {
    fridgeWall,
    farWall,
    wallADirection: wallAReadingDirectionFor(fridgeWall),
  };
}

/** Wall A is read from the corner it shares with the fridge wall: wall B's is A's own start, so the
 *  coordinate increases; wall C's is A's end, so it decreases. This is the one place that fact is
 *  read off a wall letter, and every later decision takes the direction it returns. */
function wallAReadingDirectionFor(
  fridgeWall: DesignWall,
): WallAReadingDirection {
  return fridgeWall === "B" ? "increasing" : "decreasing";
}

function placementOn(
  walls: WallRoles,
  room: DesignRoom,
  runs: Readonly<Record<DesignWall, UGenerationRun>>,
): FridgePlacement | undefined {
  const layout = fridgeWallLayout(
    walls.fridgeWall,
    room,
    runs[walls.fridgeWall],
  );
  return layout.isPlaced
    ? {
        ...walls,
        bases: layout.bases,
        dropped: false,
        position: layout.position,
      }
    : undefined;
}

/** ADR 0110 N9.2: a dropped fridge leaves its wall's whole free run empty, and A4 forbids a bare run
 *  end of 600 mm or more. The wall takes door bases from its corner, and the bare remainder (< 600 mm)
 *  stays at the free end. These bases stand before the sink in run order, so they never become
 *  drawer units. */
function droppedFridgePlacement(
  walls: WallRoles,
  runs: Readonly<Record<DesignWall, UGenerationRun>>,
): FridgePlacement {
  const run = runs[walls.fridgeWall];
  const { storageCount } = planLeftover(run.endMm - run.startMm);
  return {
    ...walls,
    bases: doorBasesFrom({
      wall: walls.fridgeWall,
      startMm: run.startMm,
      count: storageCount,
      idPrefix: STORAGE_ID_PREFIX,
    }),
    dropped: true,
    position: undefined,
  };
}

interface PlacedFridgeWallLayout {
  readonly isPlaced: true;
  readonly bases: readonly UPlannedGenerationBase[];
  /** *N3 revised* 3's own count, or `"free-end"`. */
  readonly position: UPlacementPosition;
}

type FridgeWallLayout = PlacedFridgeWallLayout | { readonly isPlaced: false };

/** Where the fridge and its counted bases stand on `wall`, or nothing when even the fridge alone
 *  does not fit the wall's own free run — `n` falls by one at a time until it does, and at `n = 0`
 *  the layout degrades to *N3 revised* 3's free-end case (`fridgeAtTheFreeEnd`), whether zero was
 *  chosen outright by the wall's own length or reached by falling. */
function fridgeWallLayout(
  wall: DesignWall,
  room: DesignRoom,
  run: UGenerationRun,
): FridgeWallLayout {
  const capacityMm = run.endMm - run.startMm;
  if (capacityMm < FRIDGE_PRIORITY.widthMm) {
    return { isPlaced: false };
  }
  let n = baseCountFromTheCorner(wallLengthMm(wall, room));
  while (
    n > 0 &&
    n * STORAGE_BODY_WIDTH_MM + FRIDGE_PRIORITY.widthMm > capacityMm
  ) {
    n -= 1;
  }
  return n === 0
    ? fridgeAtTheFreeEnd(wall, run)
    : fridgeCountedFromTheCorner(wall, run, n);
}

/** *N3 revised* 3's short-wall case (ADR 0110 N11.1): door storage from the corner, the fridge directly
 *  after it, and the bare remainder (< 600 mm, A4) beyond the fridge at the free end — the L's own
 *  convention, where a fridge "at the free end" is the last body before it. That remainder stays bare:
 *  the pantry gap belongs to a counted position only, so `planUTallLayout` is given no gap here. */
function fridgeAtTheFreeEnd(
  wall: DesignWall,
  run: UGenerationRun,
): PlacedFridgeWallLayout {
  const { storageCount } = planLeftover(
    run.endMm - run.startMm - FRIDGE_PRIORITY.widthMm,
  );
  return {
    ...fridgeCountedFromTheCorner(wall, run, storageCount),
    position: "free-end",
  };
}

/** *N3 revised* 3's long-wall case: `n` bases from the corner, then the fridge. The stretch from the
 *  fridge to the free end is left unfilled here — the tall layout tiles it with `tall-pantry` columns
 *  (*N3 revised* 4), read off this plan's `remainderMm` for the fridge wall. `fridgeAtTheFreeEnd`
 *  reuses it with the count that leaves a bare remainder under one module. */
function fridgeCountedFromTheCorner(
  wall: DesignWall,
  run: UGenerationRun,
  n: number,
): PlacedFridgeWallLayout {
  const storage = doorBasesFrom({
    wall,
    startMm: run.startMm,
    count: n,
    idPrefix: STORAGE_ID_PREFIX,
  });
  const fridgeStartMm = run.startMm + n * STORAGE_BODY_WIDTH_MM;
  return {
    isPlaced: true,
    bases: [...storage, fridgeBase(wall, fridgeStartMm)],
    position: n,
  };
}

function fridgeBase(wall: DesignWall, startMm: number): UPlannedGenerationBase {
  return plannedBaseAt({
    id: FRIDGE_PRIORITY.role,
    role: FRIDGE_PRIORITY.role,
    buildId: FRIDGE_PRIORITY.buildId,
    widthMm: FRIDGE_PRIORITY.widthMm,
    wall,
    startMm,
  });
}
