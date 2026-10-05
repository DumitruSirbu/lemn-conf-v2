// The U's tall layout and its one oven (ADR 0110 *N3 revised* 4, 9, 10). Two independent fills: the
// fridge-to-free-end gap on the fridge's own wall, and the far wall's own run (overflow, the bodies
// placed after it, counted door bases, one tower, outboard pantries below 10 m, a trailing door fill).
// The bodies placed after the overflow (bottle, drawer extras) always stand before the tower; the
// caller decides which stand.
//
// `planTallEndBlock` is reused unchanged for the far wall's free-end case, so the L's behaviour there
// is untouched. RQ17's U-only lone-tower override is applied here, never inside that leaf.
import type { DesignRoom, DesignWall } from "../design.js";
import { wallLengthMm } from "../queries/overflowing-placements.js";
import { hobWithItsOwnOvenBuildId } from "./generation-priorities.js";
import {
  planLeftover,
  STORAGE_BODY_WIDTH_MM,
  type LeftoverPlan,
} from "./leftover-rule.js";
import {
  baseCountFromTheCorner,
  doorBasesFrom,
  increasingFrom,
  isLargeU,
  placedInSequence,
  SHORT_SIDE_WALL_MAX_MM,
  sumWidths,
  type UGenerationRun,
  type UPlacementPosition,
  type UPlannedGenerationBase,
} from "./run-layout.js";
import {
  DOOR_COLUMN_BUILD_ID,
  HOB_WITHOUT_ITS_OWN_OVEN_BUILD_ID,
  MAX_TALL_BLOCK_COLUMNS,
  OVEN_TOWER_BUILD_ID,
  planTallEndBlock,
  type DeclaredColumnSizes,
  type TallEndRuleInput,
} from "./tall-end-rule.js";

export interface UTallLayoutInput {
  readonly room: DesignRoom;
  readonly runs: Readonly<Record<DesignWall, UGenerationRun>>;
  readonly fridgeWall: DesignWall;
  readonly farWall: DesignWall;
  /** Where the fridge's footprint ends on `fridgeWall` when it leaves a gap to fill; `undefined` when it
   *  leaves none: the wall takes door bases from its corner (ADR 0110 N9.2), or the fridge stands at
   *  the free end with its bare remainder beyond it. */
  readonly fridgeEndMm: number | undefined;
  /** The bodies already standing on the far wall from the back wall's overflow: read, never rebuilt. */
  readonly overflowBases: readonly UPlannedGenerationBase[];
  /** The far wall's bodies that stand right after `overflowBases`, before the tower, in run order: the
   *  bottle after a far-wall hob and the drawer-extra slots (ADR 0110 N10.3 step 4). They count toward
   *  `n` and their width comes out of the span the tower or block has. */
  readonly bodiesBeforeTheTower: readonly UBodyAfterTheHob[];
  /** E3 clause 1, read off the core-run plan: whether every core role survived. */
  readonly coreSurvivedWhole: boolean;
  readonly declared: DeclaredColumnSizes;
}

/** One body that stands after the hob (the bottle or a drawer-extra slot) before its position is known;
 *  the layout gives each a wall and a start. */
export interface UBodyAfterTheHob {
  readonly id: string;
  readonly buildId: string;
  readonly widthMm: number;
}

export interface UTallLayoutResult {
  readonly bases: readonly UPlannedGenerationBase[];
  /** Which hob build id the one generated oven leaves the plan with (*N3 revised* 9, E4). */
  readonly hobBuildId: string;
  /** *N3 revised* 10's own count, or `"free-end"`; `undefined` where no tower stands (the hob keeps its
   *  own oven). */
  readonly towerPosition: UPlacementPosition | undefined;
}

/** The fridge-to-free-end gap and the far wall's own layout. The far wall's hob decision is the plan's
 *  only oven decision: the fridge wall never carries a hob or a tower (E4, *N3 revised* 9). */
export function planUTallLayout(input: UTallLayoutInput): UTallLayoutResult {
  const fridgeGapBases =
    input.fridgeEndMm === undefined
      ? []
      : fridgeGapFill(input, input.fridgeEndMm);
  const far = farWallLayout(input);
  return {
    bases: [...fridgeGapBases, ...far.bases],
    hobBuildId: far.hobBuildId,
    towerPosition: far.towerPosition,
  };
}

/** The fridge-to-free-end gap: `tall-pantry` columns, or door bases in a room lower than the column,
 *  which could not hold one (ADR 0110 N11.4). */
function fridgeGapFill(
  input: UTallLayoutInput,
  gapStartMm: number,
): readonly UPlannedGenerationBase[] {
  const gapEndMm = input.runs[input.fridgeWall].endMm;
  return input.room.heightMm < input.declared.columnHeightMm
    ? doorFill(input.fridgeWall, gapStartMm, gapEndMm, "fridge-gap")
    : pantriesInGap(input.fridgeWall, gapStartMm, gapEndMm, input.declared);
}

/** The gap takes `tall-pantry` columns at every size (*N3 revised* 4, RQ13): 600 mm each, the outermost
 *  widened up to the row's declared ceiling to absorb the remainder; a gap under one module but at
 *  least the declared floor takes one pantry at its own width; under that floor stays bare. */
function pantriesInGap(
  wall: DesignWall,
  gapStartMm: number,
  gapEndMm: number,
  declared: DeclaredColumnSizes,
): readonly UPlannedGenerationBase[] {
  const widthsMm = pantryWidthsFor(gapEndMm - gapStartMm, declared);
  return placedInSequence({
    wall,
    startMmAt: increasingFrom(gapStartMm),
    bodies: widthsMm.map((widthMm, index) => ({
      id: `fridge-gap:${wall}:${String(index)}`,
      buildId: DOOR_COLUMN_BUILD_ID,
      widthMm,
    })),
  });
}

/** The pantry widths a gap fills to, corner end first, by `pantriesInGap`'s rule. Both bounds are read
 *  off `declared` rather than a literal, as `tall-end-rule.ts` does for the block's columns. */
function pantryWidthsFor(
  gapMm: number,
  declared: DeclaredColumnSizes,
): readonly number[] {
  if (gapMm < declared.doorColumnWidthMm.minMm) return [];
  const wholeModules = Math.floor(gapMm / STORAGE_BODY_WIDTH_MM);
  if (wholeModules === 0) return [gapMm];
  const remainderMm = gapMm - wholeModules * STORAGE_BODY_WIDTH_MM;
  if (remainderMm === 0) {
    return Array.from({ length: wholeModules }, () => STORAGE_BODY_WIDTH_MM);
  }
  const mergedWidthMm = STORAGE_BODY_WIDTH_MM + remainderMm;
  if (mergedWidthMm <= declared.doorColumnWidthMm.maxMm) {
    return [
      ...Array.from({ length: wholeModules - 1 }, () => STORAGE_BODY_WIDTH_MM),
      mergedWidthMm,
    ];
  }
  // The remainder cannot merge into the row's ceiling: it stays bare beyond the last whole pantry.
  return Array.from({ length: wholeModules }, () => STORAGE_BODY_WIDTH_MM);
}

interface FarWallLayout {
  readonly bases: readonly UPlannedGenerationBase[];
  readonly hobBuildId: string;
  readonly towerPosition: UPlacementPosition | undefined;
}

function farWallLayout(input: UTallLayoutInput): FarWallLayout {
  const { farWall, runs } = input;
  const run = runs[farWall];
  const standing = standingBeforeTheTower(input);
  const hobWithOwnOven = hobWithItsOwnOvenBuildId();
  const layout = isAColumnAffordable(input)
    ? affordableFarWallLayout({ ...input, run, standing, hobWithOwnOven })
    : doorFillFarWall({ farWall, run, standing, hobWithOwnOven });
  return { ...layout, bases: [...standing.bases, ...layout.bases] };
}

/** No column stands (E3 clause 1 or 4 fails): door bases from the standing bodies to the free end,
 *  and the hob keeps its own oven. */
function doorFillFarWall(args: {
  readonly farWall: DesignWall;
  readonly run: UGenerationRun;
  readonly standing: StandingBeforeTheTower;
  readonly hobWithOwnOven: string;
}): FarWallLayout {
  const { farWall, run, standing, hobWithOwnOven } = args;
  return {
    bases: doorFill(
      farWall,
      run.startMm + standing.widthMm,
      run.endMm,
      "far-door",
    ),
    hobBuildId: hobWithOwnOven,
    towerPosition: undefined,
  };
}

/** E3 clauses 1 and 4: the full core survived, and the room is at least as tall as the column. */
function isAColumnAffordable(input: UTallLayoutInput): boolean {
  return (
    input.coreSurvivedWhole &&
    input.room.heightMm >= input.declared.columnHeightMm
  );
}

/** What already stands on the far wall before the tower's own layout: the overflowed core and the
 *  bodies placed after it. `count` is a body count, never a width over 600: a 300 mm bottle is one of
 *  the `n` bodies (N10.3 step 4). */
interface StandingBeforeTheTower {
  /** The bodies placed after the overflow; the overflow itself is already in the plan. */
  readonly bases: readonly UPlannedGenerationBase[];
  readonly widthMm: number;
  readonly count: number;
}

function standingBeforeTheTower(
  input: UTallLayoutInput,
): StandingBeforeTheTower {
  const { farWall, runs, overflowBases, bodiesBeforeTheTower } = input;
  const overflowWidthMm = sumWidths(overflowBases);
  const bases = placedInSequence({
    wall: farWall,
    startMmAt: increasingFrom(runs[farWall].startMm + overflowWidthMm),
    bodies: bodiesBeforeTheTower,
  });
  return {
    bases,
    widthMm: overflowWidthMm + sumWidths(bases),
    count: overflowBases.length + bases.length,
  };
}

function affordableFarWallLayout(args: {
  readonly farWall: DesignWall;
  readonly run: UGenerationRun;
  readonly room: DesignRoom;
  readonly standing: StandingBeforeTheTower;
  readonly declared: DeclaredColumnSizes;
  readonly hobWithOwnOven: string;
}): FarWallLayout {
  const { farWall, room, standing } = args;
  return wallLengthMm(farWall, room) <= SHORT_SIDE_WALL_MAX_MM
    ? towerAtTheFreeEnd({ ...args, standingWidthMm: standing.widthMm })
    : towerCountedFromTheCorner(args);
}

/** *N3 revised* 10's short-far-wall case (RQ17): the tower or block stands at the free end,
 *  `planTallEndBlock`'s free-end shape reused whole. Where that leaf's E6.2 would refuse a lone tower
 *  because its remainder cannot merge, this U-only override stands it anyway and leaves the remainder
 *  bare (at most 599 mm); the leaf must not learn that, since the L stays at E6.2. */
function towerAtTheFreeEnd(args: {
  readonly farWall: DesignWall;
  readonly run: UGenerationRun;
  readonly standingWidthMm: number;
  readonly room: DesignRoom;
  readonly declared: DeclaredColumnSizes;
  readonly hobWithOwnOven: string;
}): FarWallLayout {
  const { farWall, run, standingWidthMm, room } = args;
  const leftover = planLeftover(
    Math.max(0, run.endMm - run.startMm - standingWidthMm),
  );
  const blockStorageCount = blockStorageCountFor(room, leftover.storageCount);
  const block = freeEndBlockOf({ ...args, leftover, blockStorageCount });
  const doorCount =
    leftover.storageCount - blockStorageCount + block.storageCount;
  return {
    bases: freeEndBases({
      farWall,
      startMm: run.startMm + standingWidthMm,
      doorCount,
      columns: block.columns,
    }),
    hobBuildId: block.hobBuildId,
    towerPosition: block.columns.some(isTheOvenTower) ? "free-end" : undefined,
  };
}

function isTheOvenTower(column: { readonly buildId: string }): boolean {
  return column.buildId === OVEN_TOWER_BUILD_ID;
}

/** The free-end case's bases: `doorCount` door bases from `startMm`, then the block's columns. */
function freeEndBases(args: {
  readonly farWall: DesignWall;
  readonly startMm: number;
  readonly doorCount: number;
  readonly columns: ReturnType<typeof planTallEndBlock>["columns"];
}): readonly UPlannedGenerationBase[] {
  const { farWall, startMm, doorCount, columns } = args;
  const doors = doorBasesFrom({
    wall: farWall,
    startMm,
    count: doorCount,
    idPrefix: "far-door",
  });
  const columnBodies = columns.map((column, index) => ({
    id: `column:${farWall}:${String(index)}`,
    buildId: column.buildId,
    widthMm: column.widthMm,
  }));
  const columnsStartMm = startMm + doorCount * STORAGE_BODY_WIDTH_MM;
  return [
    ...doors,
    ...placedInSequence({
      wall: farWall,
      startMmAt: increasingFrom(columnsStartMm),
      bodies: columnBodies,
    }),
  ];
}

/** At 10 m or more the tower stands alone with no pantry (*N3 revised* 10), the gate
 *  `towerAndPantriesFrom` applies to its outboard pantries. The leftover count is capped at one module
 *  *before* `planTallEndBlock` sees it so its merge arithmetic runs on the capped scenario; the freed
 *  modules stand as door storage, never dropped. */
function blockStorageCountFor(room: DesignRoom, storageCount: number): number {
  return isLargeU(room) ? Math.min(1, storageCount) : storageCount;
}

function freeEndBlockOf(args: {
  readonly room: DesignRoom;
  readonly declared: DeclaredColumnSizes;
  readonly hobWithOwnOven: string;
  readonly leftover: LeftoverPlan;
  readonly blockStorageCount: number;
}): ReturnType<typeof planTallEndBlock> {
  const { room, declared, hobWithOwnOven, leftover, blockStorageCount } = args;
  const blockInput: TallEndRuleInput = {
    coreSurvivedWhole: true,
    // *N3 revised* 7 / RQ11: a U's tall block never needs the hob on this same wall.
    hobStandsOnTheFreeEndWall: true,
    freeEndStorageCount: blockStorageCount,
    freeEndRemainderMm: leftover.remainderMm,
    roomHeightMm: room.heightMm,
    hobWithItsOwnOvenBuildId: hobWithOwnOven,
    declared,
  };
  return withRQ17Override(planTallEndBlock(blockInput), blockInput);
}

/** RQ17: a lone tower that `planTallEndBlock`'s E6.2 would refuse (its remainder cannot merge into the
 *  door column's declared bound, or the block is one fixed-width column) stands anyway on a U, with the
 *  remainder left bare. Applied only where E3 clause 3 (a whole module to give up) and clause 4 (room
 *  height) hold; the caller already ruled out clause 1 and the hob's wall. */
function withRQ17Override(
  block: ReturnType<typeof planTallEndBlock>,
  input: TallEndRuleInput,
): ReturnType<typeof planTallEndBlock> {
  if (block.columns.length > 0) return block;
  const wasAffordable =
    input.freeEndStorageCount >= 1 &&
    input.roomHeightMm >= input.declared.columnHeightMm;
  if (!wasAffordable) return block;
  return {
    columns: [
      { buildId: OVEN_TOWER_BUILD_ID, widthMm: input.declared.columnWidthMm },
    ],
    storageCount: input.freeEndStorageCount - 1,
    remainderMm: input.freeEndRemainderMm,
    hobBuildId: HOB_WITHOUT_ITS_OWN_OVEN_BUILD_ID,
  };
}

/** The pantries outboard of the tower: the block's other columns (E2, E12, RQ11). */
const OUTBOARD_PANTRY_MAX_COUNT = MAX_TALL_BLOCK_COLUMNS - 1;

/** *N3 revised* 10's long-far-wall case. The reported position is `n` (RQ5, both from the corner), never
 *  the door count actually placed: overflowed bodies and the bodies placed after them (N10.3 step 4)
 *  count toward `n` as bodies, and the tower follows them directly where they already exceed it, so
 *  `n` is a floor. Then the tower; below 10 m up to two outboard pantries; then a trailing door fill
 *  with no merge at its end, an ordinary `planLeftover` remainder (A4). */
function towerCountedFromTheCorner(args: {
  readonly farWall: DesignWall;
  readonly run: UGenerationRun;
  readonly room: DesignRoom;
  readonly standing: StandingBeforeTheTower;
  readonly declared: DeclaredColumnSizes;
  readonly hobWithOwnOven: string;
}): FarWallLayout {
  const { farWall, run, room, standing, hobWithOwnOven } = args;
  const n = baseCountFromTheCorner(wallLengthMm(farWall, room));
  const doors = doorsBeforeTheTower({ ...args, n });
  const startMm = run.startMm + standing.widthMm + sumWidths(doors);
  const tower = towerAndPantriesFrom({ ...args, startMm });
  const tailStartMm = startMm + sumWidths(tower);
  const towerStood = tower.length > 0;
  return {
    bases: [
      ...doors,
      ...tower,
      ...doorFill(farWall, tailStartMm, run.endMm, "far-tail"),
    ],
    hobBuildId: towerStood ? HOB_WITHOUT_ITS_OWN_OVEN_BUILD_ID : hobWithOwnOven,
    towerPosition: towerStood ? n : undefined,
  };
}

/** The counted door bases that bring the bodies before the tower up to `n`, as many as the run holds. */
function doorsBeforeTheTower(args: {
  readonly farWall: DesignWall;
  readonly run: UGenerationRun;
  readonly standing: StandingBeforeTheTower;
  readonly n: number;
}): readonly UPlannedGenerationBase[] {
  const { farWall, run, standing, n } = args;
  const startMm = run.startMm + standing.widthMm;
  const wantedCount = Math.max(0, n - standing.count);
  const fittingCount = Math.max(
    0,
    Math.floor((run.endMm - startMm) / STORAGE_BODY_WIDTH_MM),
  );
  return doorBasesFrom({
    wall: farWall,
    startMm,
    count: Math.min(wantedCount, fittingCount),
    idPrefix: "far-n",
  });
}

/** The tower at `startMm` and, below 10 m, up to two pantries outboard of it as the run holds them;
 *  nothing where the tower itself does not fit. */
function towerAndPantriesFrom(args: {
  readonly farWall: DesignWall;
  readonly startMm: number;
  readonly run: UGenerationRun;
  readonly room: DesignRoom;
  readonly declared: DeclaredColumnSizes;
}): readonly UPlannedGenerationBase[] {
  const { farWall, startMm, run, room, declared } = args;
  const towerEndMm = startMm + declared.columnWidthMm;
  if (towerEndMm > run.endMm) return [];
  const pantryCount = isLargeU(room)
    ? 0
    : outboardPantryCount(run.endMm - towerEndMm);
  const tower = {
    id: `column:${farWall}:0`,
    buildId: OVEN_TOWER_BUILD_ID,
    widthMm: declared.columnWidthMm,
  };
  const pantries = Array.from({ length: pantryCount }, (_, index) => ({
    id: `column:${farWall}:${String(index + 1)}`,
    buildId: DOOR_COLUMN_BUILD_ID,
    widthMm: STORAGE_BODY_WIDTH_MM,
  }));
  return placedInSequence({
    wall: farWall,
    startMmAt: increasingFrom(startMm),
    bodies: [tower, ...pantries],
  });
}

/** How many pantry modules the run holds outboard of the tower, at most the block's other columns. */
function outboardPantryCount(spaceMm: number): number {
  const fittingCount = Math.floor(spaceMm / STORAGE_BODY_WIDTH_MM);
  return Math.min(OUTBOARD_PANTRY_MAX_COUNT, Math.max(0, fittingCount));
}

/** Door bases from `startMm` as far as `endMm` holds whole modules; the bare remainder (< 600 mm, A4)
 *  stays at the end. */
function doorFill(
  wall: DesignWall,
  startMm: number,
  endMm: number,
  idPrefix: string,
): readonly UPlannedGenerationBase[] {
  return doorBasesFrom({
    wall,
    startMm,
    count: planLeftover(Math.max(0, endMm - startMm)).storageCount,
    idPrefix,
  });
}
