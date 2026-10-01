import type { DesignRoom, DesignWall } from "../design.js";
import { wallLengthMm } from "../queries/overflowing-placements.js";
import {
  DOOR_BASE_BUILD_ID,
  THREE_DRAWER_BASE_BUILD_ID,
} from "./body-choice.js";
import { withTheDishwasherBesideTheSink } from "./dishwasher-beside-the-sink.js";
import { planLeftover, STORAGE_BODY_WIDTH_MM } from "./leftover-rule.js";
import {
  planWithPanDrawerThenBottle,
  type CompositionContext,
} from "./optional-run-items.js";
import {
  fitsAcrossTheCorner,
  HOB_ROLE,
  sumWidths,
  type GenerationBaseRole,
  type GenerationPriority,
  type GenerationRunItem,
  type KitchenCompositionPlan,
  type PlannedGenerationBase,
  type RunLayout,
  type TwoWallDispatch,
  type WallCapacities,
} from "./run-layout.js";
import {
  planTallEndBlock,
  type DeclaredColumnSizes,
  type PlannedTallColumn,
  type TallEndPlan,
} from "./tall-end-rule.js";

export type {
  GenerationBaseRole,
  GenerationCoreRole,
  GenerationPriority,
  KitchenCompositionPlan,
  PlannedGenerationBase,
} from "./run-layout.js";

/** Which physical wall carries each half of the reading order. The **prefix** wall is the one laid
 *  out in reverse against that order (ADR 0110 D2), and it is read through `isLaidOutInReverse` by
 *  both places that reverse. */
interface ReadingOrderWalls {
  readonly prefix: TwoWallDispatch;
  readonly suffix: TwoWallDispatch;
}

/**
 * The reading order's **suffix** runs along the **wider entered wall**, so the sink and the hob
 * stand there and the fridge on the narrower one — the owner's *"on wider wall you always place the
 * sink and hub, and fridge you place on narrower wall"* (ADR 0120 Amendment E).
 *
 * **The key is the entered wall length and never the free run capacity** (ADR 0120 E2). The corner's
 * reach is a fact about the corner, not about which wall is wider, so keying on capacity would make
 * *wider* mean something no customer can compute from the two numbers they typed. The two keys rank
 * the walls differently in the 1.83 % of placed rooms whose entered lengths differ by less than
 * 100 mm; **that population is this ruling rather than a bug in it**, and re-keying it onto capacity
 * overturns a dated decision.
 *
 * **Equal walls keep wall B as the prefix**, which is the answer every room had before the rule
 * existed.
 *
 * **The owner's 4-metre relaxation is implemented by this function's silence about it**, and the
 * silence is the compliance (ADR 0120 E4). *"In case wall have more than 4 meters it can fit on any
 * wide wall"* is a permission, and above 4000 mm on both walls the narrower run always holds the
 * 700 mm fridge, so the cut never collapses and a `> 4000` branch would be dead on every room the
 * approved policy admits. **The trigger that would make it live** — recorded, not built for — is a
 * later ruling letting this rule **drop a body** (wave 7D8's Q-7D8-2 answered the other way), at
 * which point above 4 m becomes the region where it must not.
 *
 * **A mirrored kitchen is this rule working, not ADR 0110 A1 violated** (Amendment I5). Where wall B
 * is wider the run reads from wall A's free end toward the corner and out along B, which is the
 * owner's own *"sometimes the arrangement is in mirror, like hub, cabinets (drawers), sink,
 * cabinets, fridge"*. A1 fixes the order **along the run** and not which end of the room it starts
 * at.
 */
function readingOrderWallsFor(room: DesignRoom): ReadingOrderWalls {
  const isWallBWider = wallLengthMm("B", room) > wallLengthMm("A", room);
  return isWallBWider
    ? { prefix: "A", suffix: "B" }
    : { prefix: "B", suffix: "A" };
}

/** Owner-ruled reading order and declared widths (ADR 0110 A1 and D3). The preparation body is A1's
 *  *interim data* amended by Amendment F5 — the cutlery reached while cutting lives in drawers within
 *  reach of the preparation surface — and it is read from `body-choice.ts` rather than spelled again,
 *  so one module declares every composed storage body (wave 7D4 criterion 20). The order itself is
 *  untouched. */
export const GENERATION_PRIORITIES: readonly GenerationPriority[] = [
  { role: "fridge", buildId: "fridge-free", widthMm: 700, required: false },
  { role: "sink", buildId: "base-sink", widthMm: 600, required: true },
  {
    role: "preparation",
    buildId: THREE_DRAWER_BASE_BUILD_ID,
    widthMm: 600,
    required: false,
  },
  { role: "hob", buildId: "base-hob-oven", widthMm: 600, required: true },
];

/** The hob body that carries its own oven, which is what a kitchen keeps whenever no oven tower
 *  stands in it (ADR 0110 E4). Read from the priorities rather than restated, so the substitution
 *  and the reading order cannot name two different hobs. */
export function hobWithItsOwnOvenBuildId(): string {
  const hob = GENERATION_PRIORITIES.find((item) => item.role === HOB_ROLE);
  if (!hob) {
    throw new Error("GENERATION_PRIORITIES declares no hob to carry an oven");
  }
  return hob.buildId;
}

export interface GenerationRun {
  readonly wall: TwoWallDispatch;
  readonly startMm: number;
  readonly endMm: number;
}

/** Pure declared-width planning. The prefix wall appears in reverse spatial order and the suffix
 *  wall in reading order; which physical wall is which comes from `readingOrderWallsFor`. The
 *  preferred cut keeps the fridge on the prefix wall when it fits, reproducing the reference-room
 *  composition without tying the fridge to a wall. */
export function planKitchenComposition(input: {
  readonly room: DesignRoom;
  readonly runs: Readonly<Record<TwoWallDispatch, GenerationRun>>;
  /** The catalogue's declared sizes for the full-height block, read by `generateKitchen`. Required,
   *  because a caller that omitted them would silently compose a kitchen the tall-end rule never
   *  saw. */
  readonly columns: DeclaredColumnSizes;
}): KitchenCompositionPlan {
  const walls = readingOrderWallsFor(input.room);
  const capacities = {
    A: runWidth(input.runs.A),
    B: runWidth(input.runs.B),
  };
  const attempts: readonly (readonly GenerationPriority[])[] = [
    GENERATION_PRIORITIES,
    GENERATION_PRIORITIES.filter((item) => item.role !== "fridge"),
    GENERATION_PRIORITIES.filter(
      (item) => item.role !== "fridge" && item.role !== "preparation",
    ),
  ];

  const capacityByRole = {
    prefix: capacities[walls.prefix],
    suffix: capacities[walls.suffix],
  };
  for (const kept of attempts) {
    const cut = chooseWallCut(kept, capacityByRole);
    if (cut === undefined) continue;

    return planWithPanDrawerThenBottle(
      compositionContextFor({ ...input, walls, kept }, capacityByRole),
      { ordered: kept, cut },
    );
  }

  return {
    room: input.room,
    bases: [],
    floorWidthsMm: { A: [], B: [] },
    dropped: GENERATION_PRIORITIES.map((item) => item.role),
    minimumMet: false,
    remainderMm: capacities,
  };
}

/** The composer's answers the optional run items are decided against, bound to one kept core.
 *
 *  **Every plan `planOf` builds carries its dishwasher** (ADR 0110 Amendment M2, the owner's
 *  *"dishwasher first"*): the threshold drawer is the only reader of `planOf`, so it tests *D* on a
 *  kitchen whose dishwasher is already decided, and its own candidate plan is given one in turn. The pan
 *  drawer and the bottle never read a plan — only fit and `tallColumnCountOf` — so they stay decided
 *  ahead of it. Applied after the plan is built rather than as a post-pass on the result, which would
 *  let the threshold drawer be decided as though the converted door cabinet still stood. */
function compositionContextFor(
  basis: PlanBasis,
  capacityMm: WallCapacities,
): CompositionContext {
  return {
    capacityMm,
    planOf: (run) =>
      withTheDishwasherBesideTheSink(builtPlan({ ...basis, ...run })),
    tallColumnCountOf: (run) => tallColumnCountOf(basis, run),
  };
}

/** Where the reading order splits between the two walls, in free run millimetres and never in wall
 *  letters: the cut is a feasibility answer about two run lengths, and which physical wall holds
 *  each of them was decided before this was called (ADR 0120 E3). */
function chooseWallCut(
  kept: readonly GenerationRunItem[],
  capacityMm: WallCapacities,
): number | undefined {
  const preferred = kept[0]?.role === "fridge" ? 1 : 0;
  const candidates = Array.from({ length: kept.length + 1 }, (_, cut) => cut)
    .filter((cut) => fitsAcrossTheCorner(kept, cut, capacityMm))
    .sort((left, right) =>
      Math.abs(left - preferred) === Math.abs(right - preferred)
        ? left - right
        : Math.abs(left - preferred) - Math.abs(right - preferred),
    );
  return candidates[0];
}

/** Everything a plan is built from except how the run is read and cut across the corner. */
interface PlanBasis {
  readonly room: DesignRoom;
  readonly runs: Readonly<Record<TwoWallDispatch, GenerationRun>>;
  readonly columns: DeclaredColumnSizes;
  readonly walls: ReadingOrderWalls;
  readonly kept: readonly GenerationPriority[];
}

function builtPlan(args: PlanBasis & RunLayout): KitchenCompositionPlan {
  const { room, runs, kept, ordered, walls } = args;
  const onThePrefixWall = ordered.slice(0, args.cut);
  const onTheSuffixWall = ordered.slice(args.cut);
  const hobStandsOnTheSuffixWall = includesTheHob(onTheSuffixWall);
  const prefixLeftover = planLeftover(
    runWidth(runs[walls.prefix]) - sumWidths(onThePrefixWall),
  );
  const tallEnd = tallEndBlockOf(args);

  const slotCounts = keyedOnWalls(walls, {
    prefix: prefixLeftover.storageCount,
    suffix: tallEnd.storageCount,
  });
  const drawerSlot = firstStorageSlotAfterTheHob({
    hobStandsOnTheSuffixWall,
    slotCounts,
    walls,
  });

  // Storage on the prefix wall stands nearest the corner, leaving the reading order's first body at
  // that wall's free end; in the reference room that makes the fridge [2100, 2800] while the free-end
  // remainder stays beyond it.
  const spatial = keyedOnWalls(walls, {
    suffix: [
      ...inSpatialOrder({
        wall: walls.suffix,
        readingOrder: onTheSuffixWall,
        walls,
      }).map((item) => asWidthItem(item, tallEnd.hobBuildId)),
      ...storagePriorities(walls.suffix, slotCounts[walls.suffix], drawerSlot),
      ...tallColumnItems(tallEnd.columns, walls.suffix),
    ],
    prefix: [
      ...storagePriorities(walls.prefix, slotCounts[walls.prefix], drawerSlot),
      ...inSpatialOrder({
        wall: walls.prefix,
        readingOrder: onThePrefixWall,
        walls,
      }).map((item) => asWidthItem(item, tallEnd.hobBuildId)),
    ],
  });
  const bases = (["A", "B"] as const).flatMap((wall) =>
    placeAlongRun(wall, runs[wall].startMm, spatial[wall]),
  );
  const keptRoles = new Set(kept.map((item) => item.role));
  return {
    room,
    bases,
    floorWidthsMm: {
      A: spatial.A.map((item) => item.widthMm),
      B: spatial.B.map((item) => item.widthMm),
    },
    dropped: GENERATION_PRIORITIES.filter(
      (item) => !keptRoles.has(item.role),
    ).map((item) => item.role),
    minimumMet: true,
    remainderMm: keyedOnWalls(walls, {
      prefix: prefixLeftover.remainderMm,
      suffix: tallEnd.remainderMm,
    }),
  };
}

/**
 * ADR 0110 Amendment E, stage 3, as Amendment I re-points it: the block takes the **suffix** wall's
 * outermost leftover modules — whichever physical wall that is, and the owner ruled it may be wall B
 * — and the hob's build id follows from the same answer. Core selection and the leftover count are
 * what 7D2 made them (E5.1, E5.2); only the identity of those outermost modules changes, and in the
 * absorb window one width with it. Also read on its own through `tallColumnCountOf`, which
 * `optional-run-items.ts` receives through its `CompositionContext` to compare the block's column
 * count with and without a candidate (`isAffordableWithinColumnBudget`).
 */
function tallEndBlockOf(args: PlanBasis & RunLayout): TallEndPlan {
  const onTheSuffixWall = args.ordered.slice(args.cut);
  const suffixLeftover = planLeftover(
    runWidth(args.runs[args.walls.suffix]) - sumWidths(onTheSuffixWall),
  );
  return planTallEndBlock({
    coreSurvivedWhole: args.kept.length === GENERATION_PRIORITIES.length,
    hobStandsOnTheFreeEndWall: includesTheHob(onTheSuffixWall),
    freeEndStorageCount: suffixLeftover.storageCount,
    freeEndRemainderMm: suffixLeftover.remainderMm,
    roomHeightMm: args.room.heightMm,
    hobWithItsOwnOvenBuildId: hobWithItsOwnOvenBuildId(),
    declared: args.columns,
  });
}

function tallColumnCountOf(basis: PlanBasis, run: RunLayout): number {
  return tallEndBlockOf({ ...basis, ...run }).columns.length;
}

function includesTheHob(items: readonly GenerationRunItem[]): boolean {
  return items.some((item) => item.role === HOB_ROLE);
}

/**
 * A pair of values stated by layout role, re-keyed onto the physical walls that carry those roles.
 *
 * **Every id, floor-width row and remainder this module publishes stays keyed on the physical wall**
 * — they describe the room the customer entered, not the layout planned into it — so the one
 * crossing back from role to wall happens here and nowhere downstream (ADR 0120 Amendment E).
 */
function keyedOnWalls<Value>(
  walls: ReadingOrderWalls,
  byRole: { readonly prefix: Value; readonly suffix: Value },
): Readonly<Record<TwoWallDispatch, Value>> {
  return walls.prefix === "A"
    ? { A: byRole.prefix, B: byRole.suffix }
    : { A: byRole.suffix, B: byRole.prefix };
}

interface WidthItem {
  readonly role: GenerationBaseRole;
  readonly buildId: string;
  readonly widthMm: number;
  readonly id?: string;
}

/** ADR 0110 E4: the hob wears whichever body the tall-end rule chose, wherever the wall cut put it.
 *  Every other priority carries its own declared id. */
function asWidthItem(item: GenerationRunItem, hobBuildId: string): WidthItem {
  return item.role === "storage"
    ? {
        id: item.id,
        role: item.role,
        buildId: item.buildId,
        widthMm: item.widthMm,
      }
    : {
        role: item.role,
        buildId: item.role === HOB_ROLE ? hobBuildId : item.buildId,
        widthMm: item.widthMm,
      };
}

/** A column stands exactly where the leftover rule was going to stand a storage cabinet, and it is
 *  that module's identity that changes rather than the wall's plan — so it carries the storage role
 *  and frame 1F's row set does not move (E5.2). Which body it is, the build id says.
 *
 *  **The wall is the caller's and is the suffix wall's, never the letter A** (ADR 0110 Amendment I2,
 *  on the owner's ruling that the block follows the run): a hard-coded `A` here would name the wrong
 *  wall in every room where wall B is the wider one, and an id is the only field that would say so. */
function tallColumnItems(
  columns: readonly PlannedTallColumn[],
  wall: DesignWall,
): WidthItem[] {
  return columns.map((column, index) => ({
    id: `column:${wall}:${String(index)}`,
    role: "storage" as const,
    buildId: column.buildId,
    widthMm: column.widthMm,
  }));
}

/** Every storage slot takes the door body the owner's order ends on — *"and after only door cabinets
 *  to fit spaces"* — except the one slot `firstStorageSlotAfterTheHob` named, which takes the drawer
 *  body (ADR 0110 Amendment H1). The spatial order below ascends on both walls; only the drawer
 *  slot's identity was decided in the reading order. */
function storagePriorities(
  wall: DesignWall,
  count: number,
  drawerSlot: StorageSlot | undefined,
): WidthItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `storage:${wall}:${String(index)}`,
    role: "storage" as const,
    buildId:
      drawerSlot?.wall === wall && drawerSlot.index === index
        ? THREE_DRAWER_BASE_BUILD_ID
        : DOOR_BASE_BUILD_ID,
    widthMm: STORAGE_BODY_WIDTH_MM,
  }));
}

/** A storage slot's position along its wall — the pair `storagePriorities` turns into an id. */
interface StorageSlot {
  readonly wall: DesignWall;
  readonly index: number;
}

/**
 * The storage slot standing first after the hob in the **reading** order, and `undefined` where a
 * kitchen has no storage slot after its hob at all. This is the one slot the owner's run order gives
 * a drawer body (ADR 0110 Amendment H1, ruling D15.7).
 *
 * **It is not *the same wall, further along*, and the two answers disagree.** The hob is the reading
 * order's last core role, so every slot on the hob's own wall follows it. With the hob on the suffix
 * wall, the prefix wall's slots were read before the corner and are already behind. With the hob on
 * the prefix wall — 2.8 % of placed rooms, 5 910 — the slot after it is that wall's **highest**
 * index, because the prefix is laid out in reverse against the reading order. The suffix wall's
 * first slot is the wrong module in every one of those rooms, and **nothing else in the plan goes
 * red when it is chosen**: the count, the widths and the provenance all stay correct while the
 * drawer stands at the wrong end.
 *
 * **The two walls below are named by their layout role and never by their letter**, because the two
 * `slotsInReadingOrder` calls here *are* "prefix then suffix": spelling them `"B"` then `"A"` is the
 * same defect as spelling the reversal `wall === "B"`, and it is silent in exactly the same way.
 */
function firstStorageSlotAfterTheHob(args: {
  readonly hobStandsOnTheSuffixWall: boolean;
  readonly slotCounts: Readonly<Record<TwoWallDispatch, number>>;
  readonly walls: ReadingOrderWalls;
}): StorageSlot | undefined {
  const { walls, slotCounts } = args;
  const readAfterTheHob = [
    ...(args.hobStandsOnTheSuffixWall
      ? []
      : slotsInReadingOrder({
          wall: walls.prefix,
          count: slotCounts[walls.prefix],
          walls,
        })),
    ...slotsInReadingOrder({
      wall: walls.suffix,
      count: slotCounts[walls.suffix],
      walls,
    }),
  ];
  return readAfterTheHob[0];
}

/**
 * Is this wall laid out against the order the kitchen is read in?
 *
 * **The single answer behind both places that reverse**, which is the point of it: `inSpatialOrder`
 * turns the prefix wall's core items around and `slotsInReadingOrder` counts its slot indices
 * downward, and those two sit a hundred lines apart. A wave that moved the prefix to the other wall
 * would plausibly edit the visible one and miss the other, standing the drawer at index 0 instead of
 * `count - 1` — and **no count, width, remainder, cut, provenance or digest would move**, so nothing
 * recorded would report it. **Wave 7D8 is that wave**, and this stayed one expression through it.
 */
function isLaidOutInReverse(
  wall: DesignWall,
  walls: ReadingOrderWalls,
): boolean {
  return wall === walls.prefix;
}

/** A wall's items in spatial order, corner outward, given them in the order the kitchen is read. */
function inSpatialOrder<Item>(args: {
  readonly wall: DesignWall;
  readonly readingOrder: readonly Item[];
  readonly walls: ReadingOrderWalls;
}): readonly Item[] {
  return isLaidOutInReverse(args.wall, args.walls)
    ? [...args.readingOrder].reverse()
    : args.readingOrder;
}

/**
 * A wall's storage slots in the order the kitchen is read: the suffix wall ascends from the corner
 * outward and the prefix wall descends, because the prefix is laid out in reverse against the
 * reading order (ADR 0110 D2; the 7D4 ground-truth table's G12 in
 * `docs/milestones/M7-room-and-presets.md`).
 *
 * **A slot is a whole, non-negative position**, and the reason matters here even though the refusal
 * does not live here: the prefix wall's reading order counts `count - 1` downward, so a count that is not a
 * whole number of slots would name a position no composed id matches, and the drawer body would be
 * placed **nowhere** while every width, count and remainder in the plan stayed correct. Both counts
 * reaching this function descend from `planLeftover`, which refuses non-whole and negative input at
 * the real boundary (`leftover-rule.ts`); that is where the discipline is enforced, and a second
 * guard here would be unreachable.
 */
function slotsInReadingOrder(args: {
  readonly wall: DesignWall;
  readonly count: number;
  readonly walls: ReadingOrderWalls;
}): StorageSlot[] {
  const { wall, count } = args;
  return Array.from({ length: count }, (_, step) => ({
    wall,
    index: isLaidOutInReverse(wall, args.walls) ? count - 1 - step : step,
  }));
}

function placeAlongRun(
  wall: TwoWallDispatch,
  startMm: number,
  items: readonly WidthItem[],
): PlannedGenerationBase[] {
  let cursorMm = startMm;
  return items.map((item) => {
    const endMm = cursorMm + item.widthMm;
    const planned: PlannedGenerationBase = {
      id: item.id ?? item.role,
      role: item.role,
      buildId: item.buildId,
      widthMm: item.widthMm,
      wall,
      startMm: cursorMm,
      endMm,
    };
    cursorMm = endMm;
    return planned;
  });
}

function runWidth(run: GenerationRun): number {
  return Math.max(0, run.endMm - run.startMm);
}
