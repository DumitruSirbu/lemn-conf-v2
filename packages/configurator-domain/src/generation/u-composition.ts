// The U's composition plan (ADR 0110 Amendment N, *N3 revised* 1-10): a pure, no-insert plan across
// three walls, assembled from four parts. `u-fridge-wall.ts` chooses the fridge wall and places the
// fridge on it. `u-back-wall-pack.ts` packs the core run along wall A from the fridge's corner, with
// overflow onto the far wall. `u-drawer-units.ts` fits the run after the hob: the bottle, the drawer
// extras and the tower. `u-tall-layout.ts` lays out the fridge gap and the far wall. This module runs
// the attempts in order and assembles what they return.
//
// **Wall letters never compare against a wall a customer typed, other than to choose the fridge wall
// once** (ADR 0110 I's role-versus-letter lesson): every decision after `placedFridge` reads the
// fridge-wall and far-wall *roles* it computes, never `"B"` or `"C"` compared against each other again.
//
// **No corner-turn field is read.** A U carries none past `DesignRoomSchema`'s own refusal (ADR
// 0132 decision 8), and this module never asks the room for one at all.
import type { DesignRoom, DesignWall } from "../design.js";
import { DOOR_BASE_BUILD_ID } from "./body-choice.js";
import { GENERATION_PRIORITIES } from "./generation-priorities.js";
import { planLeftover, STORAGE_BODY_WIDTH_MM } from "./leftover-rule.js";
import {
  plannedBaseAt,
  sumWidths,
  type GenerationCoreRole,
  type UGenerationRun,
  type UKitchenCompositionPlan,
  type UPlacementPosition,
  type UPlannedGenerationBase,
} from "./run-layout.js";
import type { DeclaredColumnSizes } from "./tall-end-rule.js";
import {
  BACK_WALL_ATTEMPTS,
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
 *  own A4 fill, the bottle and the drawer count. The first back-wall attempt that packs is the plan;
 *  when none does, the room does not meet the minimum kitchen. */
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
    wallA: wallALaneFromTheFridgeCorner(fridge.fridgeWall, runs.A),
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
  const { bases, towerPosition } = composeTheAttempt(context);
  return {
    room,
    bases,
    floorWidthsMm: floorWidthsMmOf(bases),
    dropped: droppedRolesOf(context),
    minimumMet: true,
    remainderMm: remainderMmOf(runs, bases),
    fridgePosition: fridge.dropped ? undefined : fridge.position,
    towerPosition,
  };
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
  readonly fridgeWall: DesignWall;
  readonly farWall: DesignWall;
} {
  return { fridgeWall: fridge.fridgeWall, farWall: fridge.farWall };
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
  return placedAlong(lane, startOffsetMm, [...bodiesAfterTheHob, ...doors]);
}

/** `bodies` one after another along `lane`, from `startOffsetMm` in the lane's own reading direction. */
function placedAlong(
  lane: PackingLane,
  startOffsetMm: number,
  bodies: readonly UBodyAfterTheHob[],
): readonly UPlannedGenerationBase[] {
  let offsetMm = startOffsetMm;
  return bodies.map((body) => {
    const placed = plannedBaseAt({
      id: body.id,
      role: "storage",
      buildId: body.buildId,
      widthMm: body.widthMm,
      wall: lane.wall,
      startMm: lane.startMmAt(offsetMm, body.widthMm),
    });
    offsetMm += body.widthMm;
    return placed;
  });
}

function floorWidthsMmOf(
  bases: readonly UPlannedGenerationBase[],
): Readonly<Record<DesignWall, readonly number[]>> {
  const widthsOf = (wall: DesignWall): readonly number[] =>
    bases
      .filter((base) => base.wall === wall)
      .sort((left, right) => left.startMm - right.startMm)
      .map((base) => base.widthMm);
  return { A: widthsOf("A"), B: widthsOf("B"), C: widthsOf("C") };
}

function remainderMmOf(
  runs: Readonly<Record<DesignWall, UGenerationRun>>,
  bases: readonly UPlannedGenerationBase[],
): Readonly<Record<DesignWall, number>> {
  const remainderOf = (wall: DesignWall): number => {
    const consumedMm = bases
      .filter((base) => base.wall === wall)
      .reduce((sum, base) => sum + base.widthMm, 0);
    const run = runs[wall];
    return run.endMm - run.startMm - consumedMm;
  };
  return { A: remainderOf("A"), B: remainderOf("B"), C: remainderOf("C") };
}
