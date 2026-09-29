// M7B U3a slice S1 — the U's own core run (ADR 0110 Amendment N, *N3 revised* 1-3, 5). A pure,
// no-insert composition plan across three walls: the fridge wall and its counted placement, and the
// back wall packed from the fridge's own corner, with overflow onto the far wall. S2 adds the tall
// layout and the oven; S3 adds the drawer count, the dishwasher's own adjacency leaf and the bottle.
//
// **Wall letters never compare against a wall a customer typed, other than to choose the fridge wall
// once** (ADR 0110 I's role-versus-letter lesson, and this wave's own "must not"): every decision
// after `fridgeWallCandidates` reads the fridge-wall and far-wall *roles* this module computes, never
// `"B"` or `"C"` compared against each other again.
//
// **No corner-turn field is read.** A U carries none past `DesignRoomSchema`'s own refusal (ADR
// 0132 decision 8), and this module never asks the room for one at all.
import type { DesignRoom, DesignWall } from "../design.js";
import { wallLengthMm } from "../queries/overflowing-placements.js";
import { DOOR_BASE_BUILD_ID } from "./body-choice.js";
import { DISHWASHER_RUN_ITEM } from "./dishwasher-beside-the-sink.js";
import { GENERATION_PRIORITIES } from "./generation-priorities.js";
import { planLeftover, STORAGE_BODY_WIDTH_MM } from "./leftover-rule.js";
import {
  baseCountFromTheCorner,
  type GenerationAncillaryRunItem,
  type GenerationCoreRole,
  type GenerationPriority,
  type UGenerationRun,
  type UKitchenCompositionPlan,
  type UPlannedGenerationBase,
} from "./run-layout.js";
import type { DeclaredColumnSizes } from "./tall-end-rule.js";
import { planUTallLayout } from "./u-tall-layout.js";

export {
  isLargeU,
  LARGE_U_TOTAL_MM,
  type UGenerationRun,
} from "./run-layout.js";

export interface PlanUKitchenCompositionInput {
  /** A room `validateRoomInput` accepted for the U policy. */
  readonly room: DesignRoom;
  readonly runs: Readonly<Record<DesignWall, UGenerationRun>>;
  /** The catalogue's declared sizes for the full-height block (M7B U3a slice S2), read by
   *  `generateKitchen` the same way the L's own `planKitchenComposition` reads it. */
  readonly columns: DeclaredColumnSizes;
}

const FRIDGE_PRIORITY = declaredPriority("fridge");
const SINK_PRIORITY = declaredPriority("sink");
const PREPARATION_PRIORITY = declaredPriority("preparation");
const HOB_PRIORITY = declaredPriority("hob");

function declaredPriority(role: GenerationCoreRole): GenerationPriority {
  const priority = GENERATION_PRIORITIES.find(
    (candidate) => candidate.role === role,
  );
  if (!priority) {
    throw new Error(`u-composition: GENERATION_PRIORITIES declares no ${role}`);
  }
  return priority;
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

interface FridgeWallLayout {
  readonly placed: boolean;
  readonly bases: readonly UPlannedGenerationBase[];
}

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
    return { placed: false, bases: [] };
  }
  const enteredMm = wallLengthMm(wall, room);
  let n = baseCountFromTheCorner(enteredMm);
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

/** *N3 revised* 3's short-wall case: the fridge flush at the free end, and door storage filling in
 *  from the corner — `planLeftover`'s own leftover convention, the bare remainder (< 600 mm, A4)
 *  left at the corner, nearest the open end this sub-run is filled from. */
function fridgeAtTheFreeEnd(
  wall: DesignWall,
  run: UGenerationRun,
): FridgeWallLayout {
  const fridgeStartMm = run.endMm - FRIDGE_PRIORITY.widthMm;
  const leftover = planLeftover(fridgeStartMm - run.startMm);
  const bases: UPlannedGenerationBase[] = [];
  let cursorMm = run.startMm + leftover.remainderMm;
  for (let index = 0; index < leftover.storageCount; index += 1) {
    bases.push(storageBase(wall, cursorMm, index));
    cursorMm += STORAGE_BODY_WIDTH_MM;
  }
  bases.push(fridgeBase(wall, fridgeStartMm));
  return { placed: true, bases };
}

/** *N3 revised* 3's long-wall case: `n` bases from the corner, then the fridge. The stretch from the
 *  fridge to the free end is deliberately left unfilled here — S2's own gap to tile with
 *  `tall-pantry` columns (*N3 revised* 4), read off this plan's `remainderMm` for the fridge wall. */
function fridgeCountedFromTheCorner(
  wall: DesignWall,
  run: UGenerationRun,
  n: number,
): FridgeWallLayout {
  const bases: UPlannedGenerationBase[] = [];
  let cursorMm = run.startMm;
  for (let index = 0; index < n; index += 1) {
    bases.push(storageBase(wall, cursorMm, index));
    cursorMm += STORAGE_BODY_WIDTH_MM;
  }
  bases.push(fridgeBase(wall, cursorMm));
  return { placed: true, bases };
}

function storageBase(
  wall: DesignWall,
  startMm: number,
  index: number,
): UPlannedGenerationBase {
  return {
    id: `storage:${wall}:${String(index)}`,
    role: "storage",
    buildId: DOOR_BASE_BUILD_ID,
    widthMm: STORAGE_BODY_WIDTH_MM,
    wall,
    startMm,
    endMm: startMm + STORAGE_BODY_WIDTH_MM,
  };
}

function fridgeBase(wall: DesignWall, startMm: number): UPlannedGenerationBase {
  return {
    id: FRIDGE_PRIORITY.role,
    role: FRIDGE_PRIORITY.role,
    buildId: FRIDGE_PRIORITY.buildId,
    widthMm: FRIDGE_PRIORITY.widthMm,
    wall,
    startMm,
    endMm: startMm + FRIDGE_PRIORITY.widthMm,
  };
}

interface FridgePlacement {
  readonly fridgeWall: DesignWall;
  readonly farWall: DesignWall;
  readonly bases: readonly UPlannedGenerationBase[];
  readonly dropped: boolean;
}

/** *N3 revised* 2 (RQ2, RQ9): the fridge stands on the wider side wall, or the other side wall if it
 *  does not fit there, or is dropped if it fits neither. **The RQ9 fallback measures 0 rooms on the
 *  approved grid** — the two side walls share the identical "entered − 1000" free-run formula
 *  (`corner-assembly-size.ts`'s own proof that both X-legs size identically), so a side wall too
 *  short for the fridge by capacity is, provably and not merely by measurement, the **narrower** one
 *  by entered length too, and the wider one is tried first. The branch is kept anyway, with a
 *  declared witness (ADR 0123) rather than a sweep floor that would read 0 for a population that
 *  cannot exist on any orderable room. */
function placedFridge(
  room: DesignRoom,
  runs: Readonly<Record<DesignWall, UGenerationRun>>,
): FridgePlacement {
  const candidates = fridgeWallCandidates(room);
  const onPrimary = fridgeWallLayout(
    candidates.primary,
    room,
    runs[candidates.primary],
  );
  if (onPrimary.placed) {
    return {
      fridgeWall: candidates.primary,
      farWall: candidates.secondary,
      bases: onPrimary.bases,
      dropped: false,
    };
  }
  const onSecondary = fridgeWallLayout(
    candidates.secondary,
    room,
    runs[candidates.secondary],
  );
  if (onSecondary.placed) {
    return {
      fridgeWall: candidates.secondary,
      farWall: candidates.primary,
      bases: onSecondary.bases,
      dropped: false,
    };
  }
  return {
    fridgeWall: candidates.primary,
    farWall: candidates.secondary,
    bases: [],
    dropped: true,
  };
}

/** One wall's free run, read as a packing lane: how much of it is left at a given reading-order
 *  offset from wherever this lane's own reading starts, and the along-wall centre an item of a given
 *  width lands at from that offset. */
interface PackingLane {
  readonly capacityMm: number;
  readonly centreMmAt: (offsetMm: number, widthMm: number) => number;
}

function laneFromTheCorner(run: UGenerationRun): PackingLane {
  return {
    capacityMm: run.endMm - run.startMm,
    centreMmAt: (offsetMm, widthMm) => run.startMm + offsetMm + widthMm / 2,
  };
}

/** Wall A's own lane, read from whichever corner it shares with the fridge wall (*N3 revised* 5:
 *  "packed from the fridge corner") — increasing along-wall coordinate when the fridge is on wall B,
 *  decreasing when it is on wall C, the same "prefix wall reversed" shape `generation-priorities.ts`
 *  already reads wall A or wall B in for the L. */
function wallALaneFromTheFridgeCorner(
  fridgeWall: DesignWall,
  runA: UGenerationRun,
): PackingLane {
  if (fridgeWall === "B") return laneFromTheCorner(runA);
  return {
    capacityMm: runA.endMm - runA.startMm,
    centreMmAt: (offsetMm, widthMm) => runA.endMm - offsetMm - widthMm / 2,
  };
}

type CoreRunItem = GenerationPriority | GenerationAncillaryRunItem;

function idOf(item: CoreRunItem): string {
  return "id" in item ? item.id : item.role;
}

interface PackedBackWall {
  readonly fits: boolean;
  readonly bases: readonly UPlannedGenerationBase[];
}

/** *N3 revised* 5: the back wall packed from the fridge corner, in fixed reading order; what does
 *  not fit continues round the far corner onto the far wall, from its own corner. Detected by
 *  simulating the pack rather than a combined-capacity sum, because two 600 mm items can waste up to
 *  599 mm of a lane's own tail (A4) without a sum test ever seeing it. */
function packBackWallAndOverflow(
  items: readonly CoreRunItem[],
  wallA: DesignWall,
  laneA: PackingLane,
  farWall: DesignWall,
  laneFar: PackingLane,
): PackedBackWall {
  const bases: UPlannedGenerationBase[] = [];
  let wall = wallA;
  let lane = laneA;
  let offsetMm = 0;
  let hasOverflowedOnce = false;
  for (const item of items) {
    if (offsetMm + item.widthMm > lane.capacityMm) {
      if (hasOverflowedOnce) return { fits: false, bases: [] };
      wall = farWall;
      lane = laneFar;
      offsetMm = 0;
      hasOverflowedOnce = true;
      if (offsetMm + item.widthMm > lane.capacityMm) {
        return { fits: false, bases: [] };
      }
    }
    const centreMm = lane.centreMmAt(offsetMm, item.widthMm);
    bases.push({
      id: idOf(item),
      role: item.role,
      buildId: item.buildId,
      widthMm: item.widthMm,
      wall,
      startMm: centreMm - item.widthMm / 2,
      endMm: centreMm + item.widthMm / 2,
    });
    offsetMm += item.widthMm;
  }
  return { fits: true, bases };
}

/** *N3 revised* 5's three attempts, in the owner's own drop order: the dishwasher first, then the
 *  preparation cabinet. The sink and the hob are never attempted without each other — ADR 0110 A2's
 *  minimum kitchen — so the last attempt is the floor this function tries before refusing. */
function backWallAttempts(): readonly (readonly CoreRunItem[])[] {
  return [
    [SINK_PRIORITY, DISHWASHER_RUN_ITEM, PREPARATION_PRIORITY, HOB_PRIORITY],
    [SINK_PRIORITY, PREPARATION_PRIORITY, HOB_PRIORITY],
    [SINK_PRIORITY, HOB_PRIORITY],
  ];
}

/** The core run plus, once it composes, the tall layout and the one oven (S1's own must-fix items,
 *  and S2's: the fridge-to-free-end gap and the far wall's tower). S3 still owes the drawer count. */
export function planUKitchenComposition(
  input: PlanUKitchenCompositionInput,
): UKitchenCompositionPlan {
  const { room, runs, columns } = input;
  const fridge = placedFridge(room, runs);
  const laneA = wallALaneFromTheFridgeCorner(fridge.fridgeWall, runs.A);
  const laneFar = laneFromTheCorner(runs[fridge.farWall]);

  const attempts = backWallAttempts();
  for (
    let attemptIndex = 0;
    attemptIndex < attempts.length;
    attemptIndex += 1
  ) {
    const items = attempts[attemptIndex];
    if (items === undefined) continue;
    const packed = packBackWallAndOverflow(
      items,
      "A",
      laneA,
      fridge.farWall,
      laneFar,
    );
    if (!packed.fits) continue;

    const dropped: GenerationCoreRole[] = [
      ...(fridge.dropped ? (["fridge"] as const) : []),
      ...(attemptIndex >= 2 ? (["preparation"] as const) : []),
    ];
    const coreBases = [
      ...(fridge.dropped ? [] : fridge.bases),
      ...packed.bases,
    ];
    const bases = withTheTallLayout({
      room,
      runs,
      fridgeWall: fridge.fridgeWall,
      farWall: fridge.farWall,
      coreDropped: dropped.length > 0,
      coreBases,
      declared: columns,
    });
    return {
      room,
      bases,
      floorWidthsMm: floorWidthsMmOf(bases),
      dropped,
      minimumMet: true,
      remainderMm: remainderMmOf(runs, bases),
    };
  }

  return {
    room,
    bases: [],
    floorWidthsMm: { A: [], B: [], C: [] },
    dropped: GENERATION_PRIORITIES.map((priority) => priority.role),
    minimumMet: false,
    remainderMm: remainderMmOf(runs, []),
  };
}

/** The core run's own bases, plus the fridge wall's pantry-filled gap and the far wall's tower (S2):
 *  a fixed-width hob base already stands in `coreBases`, so its own build id is swapped for the
 *  tower's oven decision rather than a second hob being placed. */
function withTheTallLayout(args: {
  readonly room: DesignRoom;
  readonly runs: Readonly<Record<DesignWall, UGenerationRun>>;
  readonly fridgeWall: DesignWall;
  readonly farWall: DesignWall;
  readonly coreDropped: boolean;
  readonly coreBases: readonly UPlannedGenerationBase[];
  readonly declared: DeclaredColumnSizes;
}): readonly UPlannedGenerationBase[] {
  const fridgeBaseEndMm = args.coreBases.find(
    (base) => base.role === "fridge",
  )?.endMm;
  const overflowBases = args.coreBases.filter(
    (base) => base.wall === args.farWall,
  );
  const tall = planUTallLayout({
    room: args.room,
    runs: args.runs,
    fridgeWall: args.fridgeWall,
    farWall: args.farWall,
    fridgeEndMm: fridgeBaseEndMm,
    overflowBases,
    coreSurvivedWhole: !args.coreDropped,
    declared: args.declared,
  });
  return [
    ...args.coreBases.map((base) =>
      base.role === "hob" ? { ...base, buildId: tall.hobBuildId } : base,
    ),
    ...tall.bases,
  ];
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
