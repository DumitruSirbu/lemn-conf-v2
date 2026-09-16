import type { DesignRoom, DesignWall } from "../design.js";
import {
  DOOR_BASE_BUILD_ID,
  THREE_DRAWER_BASE_BUILD_ID,
} from "./body-choice.js";
import { planLeftover, STORAGE_BODY_WIDTH_MM } from "./leftover-rule.js";
import {
  planTallEndBlock,
  type DeclaredColumnSizes,
  type PlannedTallColumn,
} from "./tall-end-rule.js";

export type GenerationCoreRole = "fridge" | "sink" | "preparation" | "hob";
export type GenerationBaseRole = GenerationCoreRole | "storage";

const HOB_ROLE: GenerationCoreRole = "hob";

/** The wall carrying the reading order's **prefix**, and therefore the wall laid out in reverse
 *  against it (ADR 0110 D2). Read through `isLaidOutInReverse` by both places that reverse. */
const PREFIX_WALL: DesignWall = "B";

export interface GenerationPriority {
  readonly role: GenerationCoreRole;
  readonly buildId: string;
  readonly widthMm: number;
  readonly required: boolean;
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
  readonly wall: DesignWall;
  readonly startMm: number;
  readonly endMm: number;
}

export interface PlannedGenerationBase {
  readonly id: string;
  readonly role: GenerationBaseRole;
  readonly buildId: string;
  readonly widthMm: number;
  readonly wall: DesignWall;
  readonly startMm: number;
  readonly endMm: number;
}

export interface KitchenCompositionPlan {
  readonly room: DesignRoom;
  /** Spatial order, corner to free end, matching the shell's tile order. */
  readonly bases: readonly PlannedGenerationBase[];
  readonly floorWidthsMm: Readonly<Record<DesignWall, readonly number[]>>;
  readonly dropped: readonly GenerationCoreRole[];
  readonly minimumMet: boolean;
  readonly remainderMm: Readonly<Record<DesignWall, number>>;
}

/** Pure declared-width planning. Wall B is the prefix of the reading order and therefore appears
 *  in reverse spatial order; wall A is the suffix and appears in reading order. The preferred cut
 *  keeps the fridge on B when it fits, reproducing the reference-room composition without tying the
 *  fridge to that wall. */
export function planKitchenComposition(input: {
  readonly room: DesignRoom;
  readonly runs: Readonly<Record<DesignWall, GenerationRun>>;
  /** The catalogue's declared sizes for the full-height block, read by `generateKitchen`. Required,
   *  because a caller that omitted them would silently compose a kitchen the tall-end rule never
   *  saw. */
  readonly columns: DeclaredColumnSizes;
}): KitchenCompositionPlan {
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

  for (const kept of attempts) {
    const cut = chooseWallCut(kept, capacities);
    if (cut === undefined) continue;
    return builtPlan({ ...input, kept, cut });
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

function chooseWallCut(
  kept: readonly GenerationPriority[],
  capacities: Readonly<Record<DesignWall, number>>,
): number | undefined {
  const preferred = kept[0]?.role === "fridge" ? 1 : 0;
  const candidates = Array.from({ length: kept.length + 1 }, (_, cut) => cut)
    .filter(
      (cut) =>
        sumWidths(kept.slice(0, cut)) <= capacities.B &&
        sumWidths(kept.slice(cut)) <= capacities.A,
    )
    .sort((left, right) =>
      Math.abs(left - preferred) === Math.abs(right - preferred)
        ? left - right
        : Math.abs(left - preferred) - Math.abs(right - preferred),
    );
  return candidates[0];
}

function builtPlan(args: {
  readonly room: DesignRoom;
  readonly runs: Readonly<Record<DesignWall, GenerationRun>>;
  readonly columns: DeclaredColumnSizes;
  readonly kept: readonly GenerationPriority[];
  readonly cut: number;
}): KitchenCompositionPlan {
  const { room, runs, kept } = args;
  const onBReadingOrder = kept.slice(0, args.cut);
  const onA = kept.slice(args.cut);
  const hobStandsOnWallA = onA.some((item) => item.role === HOB_ROLE);
  const coreWidths = {
    A: sumWidths(onA),
    B: sumWidths(onBReadingOrder),
  };
  const leftovers = {
    A: planLeftover(runWidth(runs.A) - coreWidths.A),
    B: planLeftover(runWidth(runs.B) - coreWidths.B),
  };

  // ADR 0110 Amendment E, stage 3: the block takes wall A's outermost leftover modules and the hob's
  // build id follows from the same answer. Core selection and the leftover count above are what 7D2
  // made them (E5.1, E5.2); only the identity of those outermost modules changes, and in the absorb
  // window one width with it.
  const tallEnd = planTallEndBlock({
    coreSurvivedWhole: kept.length === GENERATION_PRIORITIES.length,
    hobStandsOnWallA,
    freeEndStorageCount: leftovers.A.storageCount,
    freeEndRemainderMm: leftovers.A.remainderMm,
    roomHeightMm: room.heightMm,
    hobWithItsOwnOvenBuildId: hobWithItsOwnOvenBuildId(),
    declared: args.columns,
  });

  const slotCounts = { A: tallEnd.storageCount, B: leftovers.B.storageCount };
  const drawerSlot = firstStorageSlotAfterTheHob({
    hobStandsOnWallA,
    slotCounts,
  });

  // Storage on B stands nearest the corner, leaving the reading-order prefix at the free end; that
  // makes the reference fridge [2100, 2800] while the free-end remainder stays beyond it.
  const spatial = {
    A: [
      ...inSpatialOrder("A", onA).map((item) =>
        asWidthItem(item, tallEnd.hobBuildId),
      ),
      ...storagePriorities("A", slotCounts.A, drawerSlot),
      ...tallColumnItems(tallEnd.columns),
    ],
    B: [
      ...storagePriorities("B", slotCounts.B, drawerSlot),
      ...inSpatialOrder("B", onBReadingOrder).map((item) =>
        asWidthItem(item, tallEnd.hobBuildId),
      ),
    ],
  } as const;
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
    remainderMm: {
      A: tallEnd.remainderMm,
      B: leftovers.B.remainderMm,
    },
  };
}

interface WidthItem {
  readonly role: GenerationBaseRole;
  readonly buildId: string;
  readonly widthMm: number;
  readonly id?: string;
}

/** ADR 0110 E4: the hob wears whichever body the tall-end rule chose, wherever the wall cut put it.
 *  Every other priority carries its own declared id. */
function asWidthItem(item: GenerationPriority, hobBuildId: string): WidthItem {
  return {
    role: item.role,
    buildId: item.role === HOB_ROLE ? hobBuildId : item.buildId,
    widthMm: item.widthMm,
  };
}

/** A column stands exactly where the leftover rule was going to stand a storage cabinet, and it is
 *  that module's identity that changes rather than the wall's plan — so it carries the storage role
 *  and frame 1F's row set does not move (E5.2). Which body it is, the build id says. */
function tallColumnItems(columns: readonly PlannedTallColumn[]): WidthItem[] {
  return columns.map((column, index) => ({
    id: `column:A:${String(index)}`,
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
 * order's last core role, so every slot on the hob's own wall follows it. With the hob on wall A,
 * wall B's slots were read before the corner and are already behind. With the hob on wall B — 3.1 %
 * of placed rooms, 6 660 — the slot after it is wall B's **highest** index, because B is the reading
 * order's prefix and is laid out in reverse against it. Wall A's first slot is the wrong module in
 * every one of those rooms, and **nothing else in the plan goes red when it is chosen**: the count,
 * the widths and the provenance all stay correct while the drawer stands at the wrong end.
 */
function firstStorageSlotAfterTheHob(args: {
  readonly hobStandsOnWallA: boolean;
  readonly slotCounts: Readonly<Record<DesignWall, number>>;
}): StorageSlot | undefined {
  const readAfterTheHob = [
    ...(args.hobStandsOnWallA
      ? []
      : slotsInReadingOrder("B", args.slotCounts.B)),
    ...slotsInReadingOrder("A", args.slotCounts.A),
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
 * recorded would report it.
 */
function isLaidOutInReverse(wall: DesignWall): boolean {
  return wall === PREFIX_WALL;
}

/** A wall's items in spatial order, corner outward, given them in the order the kitchen is read. */
function inSpatialOrder<Item>(
  wall: DesignWall,
  readingOrder: readonly Item[],
): readonly Item[] {
  return isLaidOutInReverse(wall) ? [...readingOrder].reverse() : readingOrder;
}

/**
 * A wall's storage slots in the order the kitchen is read: wall A ascends from the corner outward,
 * wall B descends, because B is the reading order's prefix laid out in reverse against it (ADR 0110
 * D2; the 7D4 ground-truth table's G12 in `docs/milestones/M7-room-and-presets.md`).
 *
 * **A slot is a whole, non-negative position**, and the reason matters here even though the refusal
 * does not live here: wall B's reading order counts `count - 1` downward, so a count that is not a
 * whole number of slots would name a position no composed id matches, and the drawer body would be
 * placed **nowhere** while every width, count and remainder in the plan stayed correct. Both counts
 * reaching this function descend from `planLeftover`, which refuses non-whole and negative input at
 * the real boundary (`leftover-rule.ts`); that is where the discipline is enforced, and a second
 * guard here would be unreachable.
 */
function slotsInReadingOrder(wall: DesignWall, count: number): StorageSlot[] {
  return Array.from({ length: count }, (_, step) => ({
    wall,
    index: isLaidOutInReverse(wall) ? count - 1 - step : step,
  }));
}

function placeAlongRun(
  wall: DesignWall,
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

function sumWidths(
  items: readonly Pick<GenerationPriority, "widthMm">[],
): number {
  return items.reduce((sum, item) => sum + item.widthMm, 0);
}
