// M7B U3a slice S2 — the tall layout and the one oven (ADR 0110 *N3 revised* 4, 9, 10; N6′ RQ13,
// RQ14, RQ17). Two independent fills feed off S1's core-run plan: the fridge-to-free-end gap on the
// fridge's own wall (always pantries, at every size — RQ13), and the far wall's own run (overflow,
// the bodies placed after it, counted door bases, one tower, outboard pantries below 10 m, and a
// trailing door fill). The bodies placed after the overflow are the bottle and the drawer extras, and
// they always stand before the tower (ADR 0110 N10.3 step 4); the caller decides which stand.
//
// **`planTallEndBlock` is reused unchanged for the far wall's own ≤ 3000 mm free-end case** — the
// same free-end-block shape Amendment E already gives the L, wired through the same leaf. Its L
// behaviour is untouched; this module's only edit to `tall-end-rule.ts` was exporting an
// already-private constant (S2's own head comment there). RQ17's lone-tower-bare-remainder rule,
// which departs from that leaf's own E6.2 for a U only, is applied as a thin override **here**, never
// inside the leaf.
import type { DesignRoom, DesignWall } from "../design.js";
import { wallLengthMm } from "../queries/overflowing-placements.js";
import { DOOR_BASE_BUILD_ID } from "./body-choice.js";
import { hobWithItsOwnOvenBuildId } from "./generation-priorities.js";
import { planLeftover, STORAGE_BODY_WIDTH_MM } from "./leftover-rule.js";
import {
  baseCountFromTheCorner,
  isLargeU,
  type UGenerationRun,
  type UPlacementPosition,
  type UPlannedGenerationBase,
} from "./run-layout.js";
import {
  DOOR_COLUMN_BUILD_ID,
  HOB_WITHOUT_ITS_OWN_OVEN_BUILD_ID,
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
  /** S1's own bodies already standing on the far wall, from the back wall's overflow — read, never
   *  rebuilt, so this module places nothing S1 already placed. */
  readonly overflowBases: readonly UPlannedGenerationBase[];
  /** The far wall's bodies that must stand right after `overflowBases` and before the tower, in run
   *  order: the bottle after a far-wall hob and the drawer-extra slots (ADR 0110 N10.3 step 4). They
   *  are placed here, they count toward `n` as bodies, and their width comes out of the span the
   *  tower or block has. Empty gives exactly the layout of `84bab2e`. */
  readonly bodiesBeforeTheTower: readonly UBodyBeforeTheTower[];
  /** E3 clause 1, read off S1's own plan: whether every core role survived. */
  readonly coreSurvivedWhole: boolean;
  readonly declared: DeclaredColumnSizes;
}

/** One body `UTallLayoutInput.bodiesBeforeTheTower` asks the far wall to stand, before its position
 *  is known: the layout gives it a wall and a start. */
export interface UBodyBeforeTheTower {
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
  let cursorMm = gapStartMm;
  return widthsMm.map((widthMm, index) => {
    const base = columnBase(
      wall,
      cursorMm,
      `fridge-gap:${wall}:${String(index)}`,
      DOOR_COLUMN_BUILD_ID,
      widthMm,
    );
    cursorMm += widthMm;
    return base;
  });
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
  const {
    farWall,
    room,
    runs,
    overflowBases,
    bodiesBeforeTheTower,
    coreSurvivedWhole,
    declared,
  } = input;
  const run = runs[farWall];
  const overflowWidthMm = sumWidths(overflowBases);
  const standingBefore = placeBodiesBeforeTheTower(
    farWall,
    run.startMm + overflowWidthMm,
    bodiesBeforeTheTower,
  );
  const standing = {
    widthMm: overflowWidthMm + sumWidths(standingBefore),
    count: overflowBases.length + standingBefore.length,
  };
  const hobWithOwnOven = hobWithItsOwnOvenBuildId();
  const affordable =
    coreSurvivedWhole && room.heightMm >= declared.columnHeightMm;

  const layout = affordable
    ? affordableFarWallLayout({
        farWall,
        run,
        room,
        standing,
        declared,
        hobWithOwnOven,
      })
    : {
        bases: doorFill(
          farWall,
          run.startMm + standing.widthMm,
          run.endMm,
          "far-door",
        ),
        hobBuildId: hobWithOwnOven,
        towerPosition: undefined,
      };
  return { ...layout, bases: [...standingBefore, ...layout.bases] };
}

/** What already stands on the far wall before the tower's own layout starts: the overflowed core and
 *  the bodies placed after it. `count` is a body count, never a width over 600 — a 300 mm bottle is
 *  one of the `n` bodies from the corner (N10.3 step 4). */
interface StandingBeforeTheTower {
  readonly widthMm: number;
  readonly count: number;
}

function placeBodiesBeforeTheTower(
  wall: DesignWall,
  startMm: number,
  bodies: readonly UBodyBeforeTheTower[],
): readonly UPlannedGenerationBase[] {
  let cursorMm = startMm;
  return bodies.map((body) => {
    const placed = columnBase(
      wall,
      cursorMm,
      body.id,
      body.buildId,
      body.widthMm,
    );
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
  const { farWall, run, room, standing, declared, hobWithOwnOven } = args;
  return wallLengthMm(farWall, room) <= 3000
    ? towerAtTheFreeEnd({
        farWall,
        run,
        standingWidthMm: standing.widthMm,
        room,
        declared,
        hobWithOwnOven,
      })
    : towerCountedFromTheCorner({
        farWall,
        run,
        room,
        standing,
        declared,
        hobWithOwnOven,
      });
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
  const { farWall, run, standingWidthMm, room, declared, hobWithOwnOven } =
    args;
  const availableMm = Math.max(0, run.endMm - run.startMm - standingWidthMm);
  const leftover = planLeftover(availableMm);
  // *N3 revised* 10: at 10 m or more the tower stands alone, with no pantry generated — the same
  // gate `towerCountedFromTheCorner` applies to its own outboard pantries, read here too so the
  // free-end case cannot grow the block past the tower on a large U. The block's own leftover count
  // is capped to at most one module *before* `planTallEndBlock` sees it, so its own merge arithmetic
  // still runs correctly on the capped scenario; the modules this frees up stand as ordinary door
  // storage instead, never dropped.
  const blockStorageCountMm = isLargeU(room)
    ? Math.min(1, leftover.storageCount)
    : leftover.storageCount;
  const extraStorageCount = leftover.storageCount - blockStorageCountMm;
  const blockInput: TallEndRuleInput = {
    coreSurvivedWhole: true,
    // *N3 revised* 7 / RQ11: a U's tall block never needs the hob on this same wall.
    hobStandsOnTheFreeEndWall: true,
    freeEndStorageCount: blockStorageCountMm,
    freeEndRemainderMm: leftover.remainderMm,
    roomHeightMm: room.heightMm,
    hobWithItsOwnOvenBuildId: hobWithOwnOven,
    declared,
  };
  const block = withRQ17Override(planTallEndBlock(blockInput), blockInput);

  let cursorMm = run.startMm + standingWidthMm;
  const bases: UPlannedGenerationBase[] = [];
  for (let index = 0; index < extraStorageCount; index += 1) {
    bases.push(
      storageBase(farWall, cursorMm, `far-door:${farWall}:${String(index)}`),
    );
    cursorMm += STORAGE_BODY_WIDTH_MM;
  }
  for (
    let index = extraStorageCount;
    index < extraStorageCount + block.storageCount;
    index += 1
  ) {
    bases.push(
      storageBase(farWall, cursorMm, `far-door:${farWall}:${String(index)}`),
    );
    cursorMm += STORAGE_BODY_WIDTH_MM;
  }
  for (const [index, column] of block.columns.entries()) {
    bases.push(
      columnBase(
        farWall,
        cursorMm,
        `column:${farWall}:${String(index)}`,
        column.buildId,
        column.widthMm,
      ),
    );
    cursorMm += column.widthMm;
  }
  const towerStood = block.columns.some(
    (column) => column.buildId === OVEN_TOWER_BUILD_ID,
  );
  return {
    bases,
    hobBuildId: block.hobBuildId,
    towerPosition: towerStood ? "free-end" : undefined,
  };
}

/** RQ17: a lone tower `planTallEndBlock`'s own E6.2 would refuse — its merge with the free end's
 *  remainder falls outside the door column's declared bound, or the block is a single fixed-width
 *  column that cannot merge at all — stands anyway on a U, with that remainder left bare. Applied
 *  only where the leaf's own clauses (E3 1, 3, 4) already held; a genuinely unaffordable block is
 *  left exactly as the leaf answered it. */
function withRQ17Override(
  block: ReturnType<typeof planTallEndBlock>,
  input: TallEndRuleInput,
): ReturnType<typeof planTallEndBlock> {
  if (block.columns.length > 0) return block;
  const wasAffordable =
    input.coreSurvivedWhole &&
    input.hobStandsOnTheFreeEndWall &&
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

/** *N3 revised* 10's long-far-wall case: `n` counted door bases from the corner (item 3's own table,
 *  reused for the tower's own count — RQ5's *"both from corner"*), the overflowed bodies and the
 *  bodies placed after them (N10.3 step 4) counting toward `n` as bodies, and the tower following
 *  them directly where they already exceed it — `n` is a floor, not an exact place; then the tower;
 *  then, below 10 m, up to two more pantry columns outboard of it (E2, E12, RQ11); then a trailing
 *  door fill for the rest of the run (RQ14). No merge is attempted at the trailing fill's own end —
 *  it is an ordinary `planLeftover` remainder, A4's rule holding as it does everywhere else the tall
 *  block does not reach a wall's own free end. */
function towerCountedFromTheCorner(args: {
  readonly farWall: DesignWall;
  readonly run: UGenerationRun;
  readonly room: DesignRoom;
  readonly standing: StandingBeforeTheTower;
  readonly declared: DeclaredColumnSizes;
  readonly hobWithOwnOven: string;
}): FarWallLayout {
  const { farWall, run, room, standing, declared, hobWithOwnOven } = args;
  const enteredMm = wallLengthMm(farWall, room);
  const n = baseCountFromTheCorner(enteredMm);
  const extraDoorsBeforeTower = Math.max(0, n - standing.count);

  let cursorMm = run.startMm + standing.widthMm;
  const bases: UPlannedGenerationBase[] = [];
  for (let index = 0; index < extraDoorsBeforeTower; index += 1) {
    if (cursorMm + STORAGE_BODY_WIDTH_MM > run.endMm) break;
    bases.push(
      storageBase(farWall, cursorMm, `far-n:${farWall}:${String(index)}`),
    );
    cursorMm += STORAGE_BODY_WIDTH_MM;
  }

  let towerStood = false;
  let hobBuildId = hobWithOwnOven;
  if (cursorMm + declared.columnWidthMm <= run.endMm) {
    bases.push(
      columnBase(
        farWall,
        cursorMm,
        `column:${farWall}:0`,
        OVEN_TOWER_BUILD_ID,
        declared.columnWidthMm,
      ),
    );
    cursorMm += declared.columnWidthMm;
    towerStood = true;
    hobBuildId = HOB_WITHOUT_ITS_OWN_OVEN_BUILD_ID;

    if (!isLargeU(room)) {
      for (let index = 1; index <= 2; index += 1) {
        if (cursorMm + STORAGE_BODY_WIDTH_MM > run.endMm) break;
        bases.push(
          columnBase(
            farWall,
            cursorMm,
            `column:${farWall}:${String(index)}`,
            DOOR_COLUMN_BUILD_ID,
            STORAGE_BODY_WIDTH_MM,
          ),
        );
        cursorMm += STORAGE_BODY_WIDTH_MM;
      }
    }
  }

  bases.push(...doorFill(farWall, cursorMm, run.endMm, "far-tail"));
  return {
    bases,
    hobBuildId: towerStood ? hobBuildId : hobWithOwnOven,
    // *N3 revised* 10 (RQ5, "both from corner"): `n`, not the door count actually placed before it —
    // an overflowed body counts toward `n` too, so a tower that stood right after the overflow, with
    // `extraDoorsBeforeTower === 0`, still stands at `n` bases from the corner. N10.3 keeps this the
    // reported category: it never reports how many bodies stand before the tower.
    towerPosition: towerStood ? n : undefined,
  };
}

/** *N3 revised* 3's own table, read again here for the tower's own count on the far wall (RQ5:
 *  *"both from corner"*) — imported from `u-composition.ts` rather than restated, so the fridge's own
 *  count and the tower's own count cannot part on the same boundary. */

function doorFill(
  wall: DesignWall,
  startMm: number,
  endMm: number,
  idPrefix: string,
): readonly UPlannedGenerationBase[] {
  const leftover = planLeftover(Math.max(0, endMm - startMm));
  let cursorMm = startMm;
  const bases: UPlannedGenerationBase[] = [];
  for (let index = 0; index < leftover.storageCount; index += 1) {
    bases.push(
      storageBase(wall, cursorMm, `${idPrefix}:${wall}:${String(index)}`),
    );
    cursorMm += STORAGE_BODY_WIDTH_MM;
  }
  return bases;
}

function storageBase(
  wall: DesignWall,
  startMm: number,
  id: string,
): UPlannedGenerationBase {
  return {
    id,
    role: "storage",
    buildId: DOOR_BASE_BUILD_ID,
    widthMm: STORAGE_BODY_WIDTH_MM,
    wall,
    startMm,
    endMm: startMm + STORAGE_BODY_WIDTH_MM,
  };
}

function columnBase(
  wall: DesignWall,
  startMm: number,
  id: string,
  buildId: string,
  widthMm: number,
): UPlannedGenerationBase {
  return {
    id,
    role: "storage",
    buildId,
    widthMm,
    wall,
    startMm,
    endMm: startMm + widthMm,
  };
}

function sumWidths(bases: readonly UPlannedGenerationBase[]): number {
  return bases.reduce((sum, base) => sum + base.widthMm, 0);
}
