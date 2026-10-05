// The U's drawer units and the run that follows the hob (ADR 0110 *N3 revised* 6 and 7, N10.3, N11.2):
// how many drawer units the room is owed, which door slots after the hob become them and how they
// split between pan drawers and three-drawers, and how the bottle, the drawer extras and the far
// wall's tower share the run after the hob.
//
// Priority, first to last: the core run and the fridge wall; the tower; the pantries; the most drawer
// extras that fit before the tower; the bottle, only where it costs none of those; then the
// pan-drawer split (`panDrawerCountFor`).
import type { DesignRoom, DesignWall } from "../design.js";
import {
  BOTTLE_CARGO_BUILD_ID,
  DOOR_BASE_BUILD_ID,
  PAN_DRAWER_BASE_BUILD_ID,
  THREE_DRAWER_BASE_BUILD_ID,
} from "./body-choice.js";
import { planLeftover, STORAGE_BODY_WIDTH_MM } from "./leftover-rule.js";
import {
  basesAlongWall,
  enteredTotalMm,
  sumWidths,
  type UGenerationRun,
  type UPlannedGenerationBase,
  type WallAReadingDirection,
} from "./run-layout.js";
import type { PackedBackWall, PackingLane } from "./u-back-wall-pack.js";
import {
  DOOR_COLUMN_BUILD_ID,
  OVEN_TOWER_BUILD_ID,
  type DeclaredColumnSizes,
} from "./tall-end-rule.js";
import {
  planUTallLayout,
  type UBodyAfterTheHob,
  type UTallLayoutInput,
  type UTallLayoutResult,
} from "./u-tall-layout.js";

/** The owner-approved U's floor: wall A 2700 mm and each side wall 1000 mm (the narrowest corner's reach,
 *  `corner-assembly-size.ts`), so `T_min` is assembled from the three figures and not restated as 4700
 *  (ADR 0108 H2). */
const APPROVED_U_FLOOR_MM = { wallA: 2700, sideWall: 1000 } as const;

/** The smallest total run an approved U can have: what "beyond the minimum" means in the drawer target. */
const DRAWER_TARGET_T_MIN_MM =
  APPROVED_U_FLOOR_MM.wallA + 2 * APPROVED_U_FLOOR_MM.sideWall;

/** Every U gets 3 drawer units, one more for each 2000 mm of entered run beyond `T_min`, up to 5. */
const MIN_DRAWER_UNITS = 3;
const MAX_DRAWER_UNITS = 5;
const DRAWER_UNIT_STEP_MM = 2000;

/** `N(T) = min(5, 3 + floor(max(0, T − T_min) / 2000))` over the three entered lengths, the key the
 *  large-U threshold and the fridge-wall choice also read (ADR 0110 Amendment N, N3 revised 6). */
function drawerTargetFor(room: DesignRoom): number {
  const surplusMm = Math.max(0, enteredTotalMm(room) - DRAWER_TARGET_T_MIN_MM);
  return Math.min(
    MAX_DRAWER_UNITS,
    MIN_DRAWER_UNITS + Math.floor(surplusMm / DRAWER_UNIT_STEP_MM),
  );
}

function extrasOwedFor(room: DesignRoom, hasPreparation: boolean): number {
  return Math.max(0, drawerTargetFor(room) - (hasPreparation ? 1 : 0));
}

function isTallColumn(base: UPlannedGenerationBase): boolean {
  return (
    base.buildId === OVEN_TOWER_BUILD_ID ||
    base.buildId === DOOR_COLUMN_BUILD_ID
  );
}

function isPlainDoorBase(base: UPlannedGenerationBase): boolean {
  return base.role === "storage" && base.buildId === DOOR_BASE_BUILD_ID;
}

/** The most pan drawers (`PAN_DRAWER_BASE_BUILD_ID`) a room gets, whatever its size. */
const MAX_PAN_DRAWER_COUNT = 2;

/** The drawer-cabinet count from which the split leaves room for a second pan drawer. */
const TWO_PAN_DRAWER_MIN_CABINET_COUNT = 4;

/** How many of the extra drawer units are pan drawers, the rest being three-drawers. Keyed on the drawer
 *  cabinets the room actually gets (the preparation cabinet plus the extras that found a door slot), not on
 *  its size-derived target: three cabinets are 1 pan drawer and 2 three-drawers, four or more are 2 pan
 *  drawers, and below three pan drawers are kept first, so a lone extra is a pan drawer. */
function panDrawerCountFor(args: {
  readonly extraCount: number;
  readonly hasPreparation: boolean;
}): number {
  const { extraCount, hasPreparation } = args;
  const cabinetCount = extraCount + (hasPreparation ? 1 : 0);
  const panbankCap =
    cabinetCount >= TWO_PAN_DRAWER_MIN_CABINET_COUNT ? MAX_PAN_DRAWER_COUNT : 1;
  return Math.min(extraCount, panbankCap);
}

/** The extra drawer units are never confined to wall A: they take door slots in run order, continuing
 *  round the far corner onto the far wall's own door bases, and always stand before the tower (a slot after
 *  the first tall column is never converted). Applied once the whole plan's bases are known, since the far
 *  wall's bases are `u-tall-layout.ts`'s output. The fridge wall is never a candidate: it stands before
 *  the sink in run order. `extraCount` is what the run after the hob was found able to hold, and that
 *  capacity-limited number is what `panDrawerCountFor` splits. see ADR 0110 Amendment N, N10.3 step 4 */
export function withDrawerUnitsAfterTheHob(
  bases: readonly UPlannedGenerationBase[],
  args: {
    readonly wallADirection: WallAReadingDirection;
    readonly farWall: DesignWall;
    readonly extraCount: number;
    readonly hasPreparation: boolean;
  },
): readonly UPlannedGenerationBase[] {
  const { wallADirection, farWall, extraCount, hasPreparation } = args;
  const runOrder = runOrderedBases(bases, wallADirection, farWall);
  const extraIds = drawerSlotIds(runOrder, extraCount);
  const panbankCount = panDrawerCountFor({
    extraCount: extraIds.length,
    hasPreparation,
  });
  const buildIdById = new Map(
    extraIds.map((id, index) => [
      id,
      index < panbankCount
        ? PAN_DRAWER_BASE_BUILD_ID
        : THREE_DRAWER_BASE_BUILD_ID,
    ]),
  );
  return bases.map((base) => {
    const buildId = buildIdById.get(base.id);
    return buildId === undefined ? base : { ...base, buildId };
  });
}

/** The ids of the first `extraCount` plain door bases after the hob and before the first tall column,
 *  in run order: the slots that become drawer extras. */
function drawerSlotIds(
  runOrder: readonly UPlannedGenerationBase[],
  extraCount: number,
): readonly string[] {
  const hobIndex = runOrder.findIndex((base) => base.role === "hob");
  if (hobIndex === -1) return [];
  const afterTheHob = runOrder.slice(hobIndex + 1);
  const towerIndex = afterTheHob.findIndex(isTallColumn);
  const beforeTheTower =
    towerIndex === -1 ? afterTheHob : afterTheHob.slice(0, towerIndex);
  return beforeTheTower
    .filter(isPlainDoorBase)
    .slice(0, extraCount)
    .map((base) => base.id);
}

/** The plan's bases in the run's reading order: wall A read from whichever corner the fridge wall shares
 *  with it, then the far wall from its own corner (the direction `wallALaneFromTheFridgeCorner` reads a
 *  lane in, over already-placed bases). */
function runOrderedBases(
  bases: readonly UPlannedGenerationBase[],
  wallADirection: WallAReadingDirection,
  farWall: DesignWall,
): readonly UPlannedGenerationBase[] {
  const onA = basesAlongWall(bases, "A");
  const aInRunOrder = wallADirection === "increasing" ? onA : onA.reverse();
  return [...aInRunOrder, ...basesAlongWall(bases, farWall)];
}

/** What the far wall keeps whatever stands before its tower (N10.3 steps 2 and 3), read off the layout
 *  with nothing added. */
interface FarWallKeeps {
  readonly hasTower: boolean;
  readonly pantryCount: number;
}

function farWallKeepsOf(
  layout: UTallLayoutResult,
  farWall: DesignWall,
): FarWallKeeps {
  return {
    hasTower: layout.towerPosition !== undefined,
    pantryCount: layout.bases.filter(
      (base) => base.wall === farWall && base.buildId === DOOR_COLUMN_BUILD_ID,
    ).length,
  };
}

/** The far wall's layout with nothing added, and what it must go on keeping. */
interface FarWallFit {
  readonly tallInput: UTallLayoutInput;
  readonly keeps: FarWallKeeps;
}

function farWallFitOf(tallInput: UTallLayoutInput): FarWallFit {
  return {
    tallInput,
    keeps: farWallKeepsOf(planUTallLayout(tallInput), tallInput.farWall),
  };
}

/** Whether the far wall takes `bodies` after its overflow and still stands as it does with nothing
 *  added: every body inside the run, the tower standing exactly when it stood (never lost, never
 *  gained), and no pantry fewer. The bottle is 300 mm against a door's 600, so a tower the far wall
 *  could not fit before can become reachable once the bottle stands — that room stays without one. */
function farWallTakes(
  fit: FarWallFit,
  bodies: readonly UBodyAfterTheHob[],
): boolean {
  const { tallInput, keeps } = fit;
  const layout = planUTallLayout({
    ...tallInput,
    bodiesBeforeTheTower: bodies,
  });
  const now = farWallKeepsOf(layout, tallInput.farWall);
  const runEndMm = tallInput.runs[tallInput.farWall].endMm;
  const isInsideTheRun = layout.bases.every(
    (base) => base.wall !== tallInput.farWall || base.endMm <= runEndMm,
  );
  return (
    isInsideTheRun &&
    now.hasTower === keeps.hasTower &&
    now.pantryCount >= keeps.pantryCount
  );
}

/** A drawer-extra slot on the far wall: a door base until `withDrawerUnitsAfterTheHob` gives it its
 *  drawer build id, once the run's whole count is known. */
function extraSlotsOn(
  wall: DesignWall,
  count: number,
): readonly UBodyAfterTheHob[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `far-extra:${wall}:${String(index)}`,
    buildId: DOOR_BASE_BUILD_ID,
    widthMm: STORAGE_BODY_WIDTH_MM,
  }));
}

/** The most extras, up to `owed`, the far wall takes after `standingFirst` — N10.3 step 4 — or
 *  `undefined` when it refuses `standingFirst` even with no extras behind it. */
function mostExtrasAfter(
  fit: FarWallFit,
  standingFirst: readonly UBodyAfterTheHob[],
  owed: number,
): number | undefined {
  for (let count = owed; count >= 0; count -= 1) {
    const bodies = [
      ...standingFirst,
      ...extraSlotsOn(fit.tallInput.farWall, count),
    ];
    if (farWallTakes(fit, bodies)) return count;
  }
  return undefined;
}

function mostExtrasOnTheFarWall(fit: FarWallFit, owed: number): number {
  return alwaysTaken(mostExtrasAfter(fit, [], owed));
}

/** With no bottle the far wall is offered the layout it already has, which it takes; `undefined`
 *  there is a defect in `farWallTakes`, not a room to plan around. */
function alwaysTaken<Taken>(taken: Taken | undefined): Taken {
  if (taken === undefined) {
    throw new Error(
      "u-drawer-units: the far wall refused the layout it already has",
    );
  }
  return taken;
}

/** How the run after the hob stands, once fitted. */
export interface RunAfterTheHob {
  /** Wall A's bodies right after the hob, when the hob stands on wall A. */
  readonly wallAAfterTheHob: readonly UBodyAfterTheHob[];
  /** The far wall's bodies between its overflow and its tower. */
  readonly farWallBeforeTheTower: readonly UBodyAfterTheHob[];
  /** The drawer extras standing in run order after the hob, on both walls together. */
  readonly extraCount: number;
  /** Of `extraCount`, those standing on the hob's own wall. */
  readonly hobWallExtraCount: number;
}

interface RunAfterTheHobProblem {
  readonly fit: FarWallFit;
  /** The drawer target, less the preparation cabinet where it stands. */
  readonly extrasOwed: number;
  readonly bottle: UBodyAfterTheHob;
  /** Run that follows the hob on the hob's own wall. */
  readonly freeAfterTheHobMm: number;
}

/** The single step deciding whether the bottle stays: only where it costs no drawer unit the owner
 *  protects (ADR 0110 N10.3 step 5 (iii), N11.2):
 *  - the room keeps at least the drawer count it would have without the bottle (a drawer cabinet
 *    outranks the bottle), and
 *  - the hob's wall is not emptied of drawers by it: where the wall holds a drawer unit after the hob
 *    without the bottle and none with it, the drawer takes the place; where the bottle leaves the wall
 *    one drawer or more, the bottle stays with the drawers after it.
 *  To lift either rule, change this function alone. */
function bottleCostsNoDrawerUnit(args: {
  readonly withBottle: RunAfterTheHob;
  readonly withoutBottle: RunAfterTheHob;
}): boolean {
  const { withBottle, withoutBottle } = args;
  const costsTheRoomADrawer = withBottle.extraCount < withoutBottle.extraCount;
  const emptiesTheHobWall =
    withoutBottle.hobWallExtraCount >= 1 && withBottle.hobWallExtraCount === 0;
  return !costsTheRoomADrawer && !emptiesTheHobWall;
}

function keepTheBottleOnlyIfItCostsNoDrawerUnit(args: {
  readonly withoutBottle: RunAfterTheHob;
  readonly withBottle: RunAfterTheHob | undefined;
}): RunAfterTheHob {
  const { withoutBottle, withBottle } = args;
  if (withBottle === undefined) return withoutBottle;
  return bottleCostsNoDrawerUnit({ withBottle, withoutBottle })
    ? withBottle
    : withoutBottle;
}

function canHoldTheBottle(problem: RunAfterTheHobProblem): boolean {
  return problem.freeAfterTheHobMm >= problem.bottle.widthMm;
}

/** The hob went round the corner: the bottle, if it stands, and the extras all stand on the far
 *  wall, before its tower. */
function runAfterAFarWallHob(problem: RunAfterTheHobProblem): RunAfterTheHob {
  return keepTheBottleOnlyIfItCostsNoDrawerUnit({
    withoutBottle: alwaysTaken(farWallRunWith(problem, [])),
    withBottle: canHoldTheBottle(problem)
      ? farWallRunWith(problem, [problem.bottle])
      : undefined,
  });
}

function farWallRunWith(
  problem: RunAfterTheHobProblem,
  standingFirst: readonly UBodyAfterTheHob[],
): RunAfterTheHob | undefined {
  const { fit, extrasOwed } = problem;
  const extraCount = mostExtrasAfter(fit, standingFirst, extrasOwed);
  if (extraCount === undefined) return undefined;
  return {
    wallAAfterTheHob: [],
    farWallBeforeTheTower: [
      ...standingFirst,
      ...extraSlotsOn(fit.tallInput.farWall, extraCount),
    ],
    extraCount,
    hobWallExtraCount: extraCount,
  };
}

/** The hob stands on wall A: the bottle, if it stands, and the extras take wall A's door slots
 *  first, and the extras still owed stand before the far wall's tower. */
function runAfterAWallAHob(problem: RunAfterTheHobProblem): RunAfterTheHob {
  return keepTheBottleOnlyIfItCostsNoDrawerUnit({
    withoutBottle: wallARunWith(problem, []),
    withBottle: canHoldTheBottle(problem)
      ? wallARunWith(problem, [problem.bottle])
      : undefined,
  });
}

function wallARunWith(
  problem: RunAfterTheHobProblem,
  standingFirst: readonly UBodyAfterTheHob[],
): RunAfterTheHob {
  const { fit, extrasOwed, freeAfterTheHobMm } = problem;
  const doorSlotsOnWallA = planLeftover(
    Math.max(0, freeAfterTheHobMm - sumWidths(standingFirst)),
  ).storageCount;
  const wallAExtraCount = Math.min(extrasOwed, doorSlotsOnWallA);
  const farWallExtraCount = mostExtrasOnTheFarWall(
    fit,
    extrasOwed - wallAExtraCount,
  );
  return {
    wallAAfterTheHob: standingFirst,
    farWallBeforeTheTower: extraSlotsOn(
      fit.tallInput.farWall,
      farWallExtraCount,
    ),
    extraCount: wallAExtraCount + farWallExtraCount,
    hobWallExtraCount: wallAExtraCount,
  };
}

/** Wall A's free run once the core stands, or the far wall's run after the hob — whichever wall the
 *  hob is on. The hob is the last core item, so it is on the far wall exactly when the pack
 *  overflowed. */
function freeAfterTheHobMm(args: {
  readonly packed: PackedBackWall;
  readonly laneA: PackingLane;
  readonly farRun: UGenerationRun;
}): number {
  const { packed, laneA, farRun } = args;
  if (!packed.hasOverflowedOnce) {
    return laneA.capacityMm - packed.wallAOffsetMm;
  }
  const hob = packed.bases.find((base) => base.role === "hob");
  return hob === undefined ? 0 : farRun.endMm - hob.endMm;
}

export interface HobRunContext {
  readonly room: DesignRoom;
  readonly columns: DeclaredColumnSizes;
  readonly packed: PackedBackWall;
  readonly laneA: PackingLane;
  readonly farRun: UGenerationRun;
  readonly hasPreparation: boolean;
}

/** Fits the run after the hob (N10.3): which wall the bottle and the drawer extras stand on, given the
 *  far wall's layout with nothing added, `tallInput`. */
export function runAfterTheHobFor(
  context: HobRunContext,
  tallInput: UTallLayoutInput,
): RunAfterTheHob {
  const problem: RunAfterTheHobProblem = {
    fit: farWallFitOf(tallInput),
    extrasOwed: extrasOwedFor(context.room, context.hasPreparation),
    bottle: {
      id: "bottle",
      buildId: BOTTLE_CARGO_BUILD_ID,
      widthMm: context.columns.bottleWidthMm,
    },
    freeAfterTheHobMm: freeAfterTheHobMm(context),
  };
  return context.packed.hasOverflowedOnce
    ? runAfterAFarWallHob(problem)
    : runAfterAWallAHob(problem);
}
