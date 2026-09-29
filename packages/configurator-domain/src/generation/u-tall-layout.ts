// The U's tall layout and its one oven (ADR 0110 *N3 revised* 4, 9, 10; N6′ RQ13, RQ14, RQ17). Two
// independent fills feed off the core-run plan: the fridge-to-free-end gap on the fridge's own wall
// (pantries at every size — RQ13 — or door bases in a room lower than the column, N11.4), and the far
// wall's own run (overflow, the bodies placed after it, counted door bases, one tower, outboard
// pantries below 10 m, and a trailing door fill). The bodies placed after the overflow are the bottle
// and the drawer extras, and they always stand before the tower (ADR 0110 N10.3 step 4); the caller
// decides which stand.
//
// **`planTallEndBlock` is reused unchanged for the far wall's own ≤ 3000 mm free-end case** — the
// same free-end-block shape Amendment E already gives the L, wired through the same leaf. The L's
// behaviour there is untouched: the leaf only exports the hob build id it already used and carries
// the declared bottle width, and states no new rule. RQ17's lone-tower-bare-remainder rule, which
// departs from that leaf's own E6.2 for a U only, is applied as a thin override **here**, never
// inside the leaf.
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
  isLargeU,
  plannedBaseAt,
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
  /** Where the fridge's own footprint ends on `fridgeWall` when it leaves a gap to fill, or `undefined`
   *  when it leaves none: *N3 revised* 2 dropped it (that wall takes door bases from its corner instead,
   *  ADR 0110 N9.2), or it stands at the free end with its bare remainder beyond it (N11.1). */
  readonly fridgeEndMm: number | undefined;
  /** The bodies already standing on the far wall, from the back wall's overflow — read, never
   *  rebuilt, so this module places nothing the pack already placed. */
  readonly overflowBases: readonly UPlannedGenerationBase[];
  /** The far wall's bodies that must stand right after `overflowBases` and before the tower, in run
   *  order: the bottle after a far-wall hob and the drawer-extra slots (ADR 0110 N10.3 step 4). They
   *  are placed here, they count toward `n` as bodies, and their width comes out of the span the
   *  tower or block has. Empty gives the layout with nothing added. */
  readonly bodiesBeforeTheTower: readonly UBodyAfterTheHob[];
  /** E3 clause 1, read off the core-run plan: whether every core role survived. */
  readonly coreSurvivedWhole: boolean;
  readonly declared: DeclaredColumnSizes;
}

/** One body that stands after the hob — the bottle, or a drawer-extra slot — before its position is
 *  known. `UTallLayoutInput.bodiesBeforeTheTower` asks the far wall to stand these; the layout gives
 *  each a wall and a start, and wall A's fill places the ones that stand on wall A. */
export interface UBodyAfterTheHob {
  readonly id: string;
  readonly buildId: string;
  readonly widthMm: number;
}

export interface UTallLayoutResult {
  readonly bases: readonly UPlannedGenerationBase[];
  /** *N3 revised* 9 (E4 unchanged): which hob build id the one generated oven leaves the plan with. */
  readonly hobBuildId: string;
  /** *N3 revised* 10's own count, or `"free-end"` — `undefined` where no tower stands at all (E4's
   *  other branch, the hob keeps its own oven). AC3 reads this instead of re-deriving it from the
   *  bases a plan already returned. */
  readonly towerPosition: UPlacementPosition | undefined;
}

/** The fridge-to-free-end gap and the far wall's own layout, together — the far wall's own hob
 *  decision is the plan's only oven decision (E4, *N3 revised* 9): the fridge wall never carries a
 *  hob and never a tower. */
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

/** The fridge-to-free-end gap: `tall-pantry` columns, or — in a room lower than the column — A4's door
 *  bases, since E3 clause 4's reason (a column the room cannot hold would be refused at insert time)
 *  reaches every generated full-height column (ADR 0110 N11.4). */
function fridgeGapFill(
  input: UTallLayoutInput,
  gapStartMm: number,
): readonly UPlannedGenerationBase[] {
  const gapEndMm = input.runs[input.fridgeWall].endMm;
  return input.room.heightMm < input.declared.columnHeightMm
    ? doorFill(input.fridgeWall, gapStartMm, gapEndMm, "fridge-gap")
    : pantriesInGap(input.fridgeWall, gapStartMm, gapEndMm, input.declared);
}

/** *N3 revised* 4 (RQ13): the fridge-to-free-end gap takes `tall-pantry` columns at every size,
 *  below 10 m and above it alike — 600 mm each, the outermost (nearest the free end) widened up to
 *  the row's own declared ceiling to absorb the remainder; a gap under one whole module but at
 *  least the row's own declared floor takes one pantry at its own width; under that floor stays
 *  bare. */
function pantriesInGap(
  wall: DesignWall,
  gapStartMm: number,
  gapEndMm: number,
  declared: DeclaredColumnSizes,
): readonly UPlannedGenerationBase[] {
  const widthsMm = pantryWidthsFor(gapEndMm - gapStartMm, declared);
  return placedInSequence(
    wall,
    gapStartMm,
    widthsMm.map((widthMm, index) => ({
      id: `fridge-gap:${wall}:${String(index)}`,
      buildId: DOOR_COLUMN_BUILD_ID,
      widthMm,
    })),
  );
}

/** The pantry widths a gap of `gapMm` fills to, corner end first: whole 600 mm modules, the last one
 *  widened up to the row's own declared ceiling to absorb what does not divide evenly, or a single
 *  custom-width pantry for a gap under one whole module but at least the row's own declared floor.
 *  Under that floor returns no pantry at all — the gap stays bare, exactly as `planLeftover`'s own
 *  remainder does everywhere else (A4). Both bounds are the catalogue's own — reading them off
 *  `declared` rather than a literal is criterion 23's own rule, the same one `tall-end-rule.ts`
 *  states for the block's columns. */
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
  // The remainder cannot merge into the row's own ceiling: it stays bare beyond the last whole
  // pantry, the same "give up the last millimetre" shape the shell's own odd spans take.
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

/** What already stands on the far wall before the tower's own layout starts: the overflowed core and
 *  the bodies placed after it. `count` is a body count, never a width over 600 — a 300 mm bottle is
 *  one of the `n` bodies from the corner (N10.3 step 4). */
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
  const bases = placedInSequence(
    farWall,
    runs[farWall].startMm + overflowWidthMm,
    bodiesBeforeTheTower,
  );
  return {
    bases,
    widthMm: overflowWidthMm + sumWidths(bases),
    count: overflowBases.length + bases.length,
  };
}

/** `bodies` side by side from `startMm`, in increasing along-wall order. */
function placedInSequence(
  wall: DesignWall,
  startMm: number,
  bodies: readonly UBodyAfterTheHob[],
): readonly UPlannedGenerationBase[] {
  let cursorMm = startMm;
  return bodies.map((body) => {
    const placed = plannedBaseAt({
      id: body.id,
      role: "storage",
      buildId: body.buildId,
      widthMm: body.widthMm,
      wall,
      startMm: cursorMm,
    });
    cursorMm += body.widthMm;
    return placed;
  });
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

/** *N3 revised* 10's short-far-wall case (RQ17): the tower, or the block, stands at the free end —
 *  `planTallEndBlock`'s own free-end shape, reused whole. Where that leaf's own E6.2 would refuse a
 *  lone tower because its remainder cannot merge, this U-only override stands the tower anyway and
 *  leaves that remainder bare (≤ 599 mm, A4), which the leaf itself must not be taught to do — its L
 *  behaviour stays exactly E6.2's own. */
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
  return [...doors, ...placedInSequence(farWall, columnsStartMm, columnBodies)];
}

/** *N3 revised* 10: at 10 m or more the tower stands alone, with no pantry generated — the same
 *  gate `towerAndPantriesFrom` applies to its own outboard pantries, read here too so the free-end
 *  case cannot grow the block past the tower on a large U. The block's own leftover count is capped
 *  to at most one module *before* `planTallEndBlock` sees it, so its own merge arithmetic still runs
 *  correctly on the capped scenario; the modules this frees up stand as ordinary door storage
 *  instead, never dropped. */
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

/** RQ17: a lone tower `planTallEndBlock`'s own E6.2 would refuse — its merge with the free end's
 *  remainder falls outside the door column's declared bound, or the block is a single fixed-width
 *  column that cannot merge at all — stands anyway on a U, with that remainder left bare. Applied
 *  only where the leaf's own clauses already held: the far wall's caller has already ruled out E3
 *  clauses 1 and the hob's wall, so what is read here is clause 3 (a whole module to give up) and
 *  clause 4 (the room's height); a genuinely unaffordable block is left exactly as the leaf answered
 *  it. */
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

/** *N3 revised* 10's long-far-wall case. The position reported is `n` (RQ5, "both from corner"), not
 *  the door count actually placed before the tower: an overflowed body counts toward `n` too, so a
 *  tower that stood right after the overflow, with no door before it, still stands at `n` bases from
 *  the corner. N10.3 keeps this the reported category: it never reports how many bodies stand before
 *  the tower.
 *
 *  `n` counted door bases from the corner (item 3's own table,
 *  reused for the tower's own count — RQ5's *"both from corner"*), the overflowed bodies and the
 *  bodies placed after them (N10.3 step 4) counting toward `n` as bodies, and the tower following
 *  them directly where they already exceed it — `n` is a floor, not an exact place; then the tower;
 *  then, below 10 m, up to two more pantry columns outboard of it; then a trailing door fill for the
 *  rest of the run (RQ14). No merge is attempted at the trailing fill's own end — it is an ordinary
 *  `planLeftover` remainder, A4's rule holding as it does everywhere else the tall block does not
 *  reach a wall's own free end. */
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
  return placedInSequence(farWall, startMm, [tower, ...pantries]);
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
