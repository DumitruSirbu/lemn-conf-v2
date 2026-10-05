// The U's composition plan (ADR 0110 Amendment N, *N3 revised* 1-10): a pure, no-insert plan across
// three walls, assembled from four parts. `u-fridge-wall.ts` chooses the fridge wall and places the
// fridge on it. `u-back-wall-pack.ts` packs the core run along wall A from the fridge's corner, with
// overflow onto the far wall. `u-drawer-units.ts` fits the run after the hob: the bottle, the drawer
// extras and the tower. `u-tall-layout.ts` lays out the fridge gap and the far wall. This module runs
// the attempts in order and assembles what they return, then finishes wall A in two steps: its bodies
// are justified to its low end (ADR 0110 N11.8), and its remainder of 300-599 mm takes a door base
// (N11.9). Both come last, so nothing upstream reads them. The plan's last step is the owner's Q6 (M7C
// wave C5 S2): a 50-299 mm leftover beyond an end fridge goes to the door base inboard of it.
//
// **A wall letter is read in two places, both in `u-fridge-wall.ts`** (ADR 0110 I's role-versus-letter
// lesson): `fridgeWallCandidates` compares the two side walls' entered lengths to choose the fridge
// wall, and `wallAReadingDirectionFor` turns that choice into the direction wall A is read in. Every
// decision after `placedFridge` reads the fridge-wall and far-wall *roles* and that direction it
// computes, never `"B"` or `"C"`.
//
// **No corner-turn field is read.** A U carries none past `DesignRoomSchema`'s own refusal (ADR
// 0132 decision 8), and this module never asks the room for one at all.
import type { DesignRoom, DesignWall } from "../design.js";
import { DOOR_BASE_BUILD_ID } from "./body-choice.js";
import { withTheLeftoverBesideTheFridgeAbsorbed } from "./fridge-end-leftover.js";
import { GENERATION_PRIORITIES } from "./generation-priorities.js";
import { planLeftover, STORAGE_BODY_WIDTH_MM } from "./leftover-rule.js";
import {
  basesAlongWall,
  basesOnWall,
  increasingFrom,
  placedInSequence,
  sumWidths,
  type GenerationCoreRole,
  type UGenerationRun,
  type UKitchenCompositionPlan,
  type UPlacementPosition,
  type UPlannedGenerationBase,
  type WallAReadingDirection,
} from "./run-layout.js";
import type { DeclaredColumnSizes } from "./tall-end-rule.js";
import {
  BACK_WALL_ATTEMPTS,
  justifiedToTheLowEnd,
  laneFromTheCorner,
  packBackWallAndOverflow,
  wallALaneFromTheFridgeCorner,
  type BackWallLanes,
  type PackedBackWall,
  type PackingLane,
} from "./u-back-wall-pack.js";
import {
  runAfterTheHobFor,
  withDrawerUnitsAfterTheHob,
  type HobRunContext,
  type RunAfterTheHob,
} from "./u-drawer-units.js";
import { placedFridge, type FridgePlacement } from "./u-fridge-wall.js";
import {
  planUTallLayout,
  type UBodyAfterTheHob,
  type UTallLayoutInput,
} from "./u-tall-layout.js";

export {
  isLargeU,
  LARGE_U_TOTAL_MM,
  type UGenerationRun,
} from "./run-layout.js";

export interface PlanUKitchenCompositionInput {
  /** A room `validateRoomInput` accepted for the U policy. */
  readonly room: DesignRoom;
  readonly runs: Readonly<Record<DesignWall, UGenerationRun>>;
  /** The catalogue's declared sizes for the full-height block, read by `generateKitchen` the same
   *  way the L's own `planKitchenComposition` reads it. */
  readonly columns: DeclaredColumnSizes;
}

/** The fridge wall, the back wall's core run with overflow, the tall layout, the one oven, wall A's
 *  own A4 fill, the bottle and the drawer count, then wall A justified low and its remainder filled.
 *  The first back-wall attempt that packs is the plan; when none does, the room does not meet the
 *  minimum kitchen. */
export function planUKitchenComposition(
  input: PlanUKitchenCompositionInput,
): UKitchenCompositionPlan {
  const { room, runs, columns } = input;
  const fridge = placedFridge(room, runs);
  const lanes = backWallLanesFor(fridge, runs);
  const shared = { room, runs, columns, fridge, laneA: lanes.wallA };
  for (const { items, hasPreparation } of BACK_WALL_ATTEMPTS) {
    const packed = packBackWallAndOverflow(items, lanes);
    if (packed.fits) return composedPlan({ ...shared, packed, hasPreparation });
  }
  return refusedPlan(room, runs);
}

function backWallLanesFor(
  fridge: FridgePlacement,
  runs: Readonly<Record<DesignWall, UGenerationRun>>,
): BackWallLanes {
  return {
    wallA: wallALaneFromTheFridgeCorner(fridge.wallADirection, runs.A),
    far: laneFromTheCorner(fridge.farWall, runs[fridge.farWall]),
  };
}

interface AttemptContext {
  readonly room: DesignRoom;
  readonly runs: Readonly<Record<DesignWall, UGenerationRun>>;
  readonly columns: DeclaredColumnSizes;
  readonly fridge: FridgePlacement;
  readonly laneA: PackingLane;
  readonly packed: PackedBackWall;
  readonly hasPreparation: boolean;
}

function composedPlan(context: AttemptContext): UKitchenCompositionPlan {
  const { room, runs, fridge } = context;
  const composed = composeTheAttempt(context);
  const bases = withTheBackWallFill(
    justifiedToTheLowEnd(composed.bases, runs.A),
    runs.A,
  );
  const { towerPosition } = composed;
  return withTheLeftoverBesideTheFridgeAbsorbed({
    room,
    bases,
    floorWidthsMm: floorWidthsMmOf(bases),
    dropped: droppedRolesOf(context),
    minimumMet: true,
    remainderMm: remainderMmOf(runs, bases),
    fridgePosition: fridge.dropped ? undefined : fridge.position,
    towerPosition,
  });
}

/** ADR 0110 N11.9 (RQ25, owner 2026-09-29): a remainder of at least 300 mm on the back wall takes a
 *  door base, and under that stays bare. Below 300 mm a door base is not offered on a wall the owner
 *  asked to keep bare there (RQ25b). */
const BACK_WALL_FILL_MIN_WIDTH_MM = 300;

const BACK_WALL_FILL_ID = "wall-a-remainder:A";

/** Wall A's remainder of 300-599 mm as one door base of exactly that width at wall A's high end. It is
 *  the plan's **last** step, after `withDrawerUnitsAfterTheHob`: that function converts the plain door
 *  bases after the hob into drawer units, and a fill standing there earlier could become a drawer
 *  body of the wrong width. Never a drawer unit, and nothing upstream reads it — the bottle rule and
 *  the drawer count decide on the run before it. The width is the remainder's, so its door count is
 *  the catalogue's (`deriveDoorCount`), never this plan's. */
function withTheBackWallFill(
  bases: readonly UPlannedGenerationBase[],
  runA: UGenerationRun,
): readonly UPlannedGenerationBase[] {
  const consumedMm = sumWidths(basesOnWall(bases, "A"));
  const remainderMm = runA.endMm - runA.startMm - consumedMm;
  const isFillable =
    remainderMm >= BACK_WALL_FILL_MIN_WIDTH_MM &&
    remainderMm < STORAGE_BODY_WIDTH_MM;
  if (!isFillable) return bases;
  const fill = placedInSequence({
    wall: "A",
    startMmAt: increasingFrom(runA.startMm + consumedMm),
    bodies: [
      {
        id: BACK_WALL_FILL_ID,
        buildId: DOOR_BASE_BUILD_ID,
        widthMm: remainderMm,
      },
    ],
  });
  return [...bases, ...fill];
}

function refusedPlan(
  room: DesignRoom,
  runs: Readonly<Record<DesignWall, UGenerationRun>>,
): UKitchenCompositionPlan {
  return {
    room,
    bases: [],
    floorWidthsMm: { A: [], B: [], C: [] },
    dropped: GENERATION_PRIORITIES.map((priority) => priority.role),
    minimumMet: false,
    remainderMm: remainderMmOf(runs, []),
    fridgePosition: undefined,
    towerPosition: undefined,
  };
}

/** The core roles the attempt gave up: a dropped fridge, then a dropped preparation cabinet. The
 *  dishwasher is never listed. */
function droppedRolesOf(context: AttemptContext): GenerationCoreRole[] {
  const dropped: GenerationCoreRole[] = [];
  if (context.fridge.dropped) dropped.push("fridge");
  if (!context.hasPreparation) dropped.push("preparation");
  return dropped;
}

interface ComposedAttempt {
  readonly bases: readonly UPlannedGenerationBase[];
  readonly towerPosition: UPlacementPosition | undefined;
}

/** One packed attempt turned into bases: the core, then the run after the hob (N10.3), the tall
 *  layout and the drawer units. */
function composeTheAttempt(context: AttemptContext): ComposedAttempt {
  const { fridge, packed } = context;
  const coreBases = [...fridge.bases, ...packed.bases];
  const tallInput = tallLayoutInputWithNothingAdded(context, coreBases);
  const afterTheHob = runAfterTheHobFor(hobRunContextOf(context), tallInput);
  const tall = withTheTallLayout({
    tallInput: {
      ...tallInput,
      bodiesBeforeTheTower: afterTheHob.farWallBeforeTheTower,
    },
    coreBases: [...coreBases, ...wallAFillFor(context, afterTheHob)],
  });
  return {
    bases: withDrawerUnitsAfterTheHob(tall.bases, {
      ...drawerUnitWalls(fridge),
      extraCount: afterTheHob.extraCount,
      hasPreparation: context.hasPreparation,
    }),
    towerPosition: tall.towerPosition,
  };
}

function hobRunContextOf(context: AttemptContext): HobRunContext {
  return { ...context, farRun: context.runs[context.fridge.farWall] };
}

function drawerUnitWalls(fridge: FridgePlacement): {
  readonly wallADirection: WallAReadingDirection;
  readonly farWall: DesignWall;
} {
  return { wallADirection: fridge.wallADirection, farWall: fridge.farWall };
}

/** The tall layout's input for the far wall and the fridge's gap, with no bottle and no extras
 *  added. Wall A's fill is not needed to build it: `coreBases` only has to carry the fridge and the
 *  far wall's overflow. */
function tallLayoutInputWithNothingAdded(
  context: AttemptContext,
  coreBases: readonly UPlannedGenerationBase[],
): UTallLayoutInput {
  const { fridge, hasPreparation } = context;
  return {
    room: context.room,
    runs: context.runs,
    fridgeWall: fridge.fridgeWall,
    farWall: fridge.farWall,
    fridgeEndMm: fridgeGapStartMm(fridge, coreBases),
    overflowBases: coreBases.filter((base) => base.wall === fridge.farWall),
    bodiesBeforeTheTower: [],
    coreSurvivedWhole: !fridge.dropped && hasPreparation,
    declared: context.columns,
  };
}

/** Where the fridge's own gap to the free end starts, or `undefined` when it has none to fill: a dropped
 *  fridge leaves none (N9.2), and a fridge at the free end leaves a bare remainder under one module
 *  that stays bare (N11.1). Only a counted fridge (*N3 revised* 4) gets its pantry gap. */
function fridgeGapStartMm(
  fridge: FridgePlacement,
  coreBases: readonly UPlannedGenerationBase[],
): number | undefined {
  if (fridge.dropped || fridge.position === "free-end") return undefined;
  return coreBases.find((base) => base.role === "fridge")?.endMm;
}

/** The core run's own bases, plus the fridge wall's gap and the far wall's tower: a fixed-width hob
 *  base already stands in `coreBases`, so its own build id is swapped for the tower's oven decision
 *  rather than a second hob being placed. */
function withTheTallLayout(args: {
  readonly tallInput: UTallLayoutInput;
  readonly coreBases: readonly UPlannedGenerationBase[];
}): ComposedAttempt {
  const tall = planUTallLayout(args.tallInput);
  return {
    bases: [
      ...args.coreBases.map((base) =>
        base.role === "hob" ? { ...base, buildId: tall.hobBuildId } : base,
      ),
      ...tall.bases,
    ],
    towerPosition: tall.towerPosition,
  };
}

/** Wall A's own A4 fill, only where the core never left wall A: where it overflowed, wall A's own
 *  remainder is already under 600 mm by construction (`packBackWallAndOverflow`), and the bottle
 *  after a far-wall hob is the far wall's own (`u-tall-layout.ts`, N10.3 step 4). */
function wallAFillFor(
  context: AttemptContext,
  afterTheHob: RunAfterTheHob,
): readonly UPlannedGenerationBase[] {
  const { laneA, packed } = context;
  if (packed.hasOverflowedOnce) return [];
  return wallAFill({
    lane: laneA,
    startOffsetMm: packed.wallAOffsetMm,
    bodiesAfterTheHob: afterTheHob.wallAAfterTheHob,
  });
}

/** Wall A's own run past the fixed core items, filled with the bodies that stand right after the hob
 *  (the bottle, when N10.3 step 5 keeps it — *N3 revised* 7, RQ16), then door storage down to a bare
 *  remainder under 600 mm (A4). Built with the bottle in place from the start, never as a
 *  width-preserving edit afterward: the bottle is 300 mm against the fill's own 600 mm module, and
 *  editing an already-placed body's width in place would leave every later one exactly where a wider
 *  body had put it. Which door slots become drawer units is decided once the run's own far wall is
 *  known too (`withDrawerUnitsAfterTheHob`), because the run continues onto it (*N3 revised* 6,
 *  RQ18 (a)). */
function wallAFill(args: {
  readonly lane: PackingLane;
  readonly startOffsetMm: number;
  readonly bodiesAfterTheHob: readonly UBodyAfterTheHob[];
}): readonly UPlannedGenerationBase[] {
  const { lane, startOffsetMm, bodiesAfterTheHob } = args;
  const offsetMm = startOffsetMm + sumWidths(bodiesAfterTheHob);
  const leftover = planLeftover(Math.max(0, lane.capacityMm - offsetMm));
  const doors = Array.from({ length: leftover.storageCount }, (_, index) => ({
    id: `wall-a-fill:${lane.wall}:${String(index)}`,
    buildId: DOOR_BASE_BUILD_ID,
    widthMm: STORAGE_BODY_WIDTH_MM,
  }));
  return placedInSequence({
    wall: lane.wall,
    bodies: [...bodiesAfterTheHob, ...doors],
    startMmAt: (bodyOffsetMm, widthMm) =>
      lane.startMmAt(startOffsetMm + bodyOffsetMm, widthMm),
  });
}

function floorWidthsMmOf(
  bases: readonly UPlannedGenerationBase[],
): Readonly<Record<DesignWall, readonly number[]>> {
  const widthsOf = (wall: DesignWall): readonly number[] =>
    basesAlongWall(bases, wall).map((base) => base.widthMm);
  return { A: widthsOf("A"), B: widthsOf("B"), C: widthsOf("C") };
}

function remainderMmOf(
  runs: Readonly<Record<DesignWall, UGenerationRun>>,
  bases: readonly UPlannedGenerationBase[],
): Readonly<Record<DesignWall, number>> {
  const remainderOf = (wall: DesignWall): number => {
    const consumedMm = sumWidths(basesOnWall(bases, wall));
    const run = runs[wall];
    return run.endMm - run.startMm - consumedMm;
  };
  return { A: remainderOf("A"), B: remainderOf("B"), C: remainderOf("C") };
}
