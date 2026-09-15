import type { DesignRoom, DesignWall } from "../design.js";
import { planLeftover, STORAGE_BODY_WIDTH_MM } from "./leftover-rule.js";
import {
  planTallEndBlock,
  type DeclaredColumnSizes,
  type PlannedTallColumn,
} from "./tall-end-rule.js";

export type GenerationCoreRole = "fridge" | "sink" | "preparation" | "hob";
export type GenerationBaseRole = GenerationCoreRole | "storage";

const HOB_ROLE: GenerationCoreRole = "hob";

export interface GenerationPriority {
  readonly role: GenerationCoreRole;
  readonly buildId: string;
  readonly widthMm: number;
  readonly required: boolean;
}

/** Owner-ruled reading order and declared widths (ADR 0110 A1 and D3). */
export const GENERATION_PRIORITIES: readonly GenerationPriority[] = [
  { role: "fridge", buildId: "fridge-free", widthMm: 700, required: false },
  { role: "sink", buildId: "base-sink", widthMm: 600, required: true },
  {
    role: "preparation",
    buildId: "base-cabinet",
    widthMm: 600,
    required: false,
  },
  { role: "hob", buildId: "base-hob-oven", widthMm: 600, required: true },
];

export const STORAGE_BUILD_ID = "base-cabinet";

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
    hobStandsOnWallA: onA.some((item) => item.role === HOB_ROLE),
    freeEndStorageCount: leftovers.A.storageCount,
    freeEndRemainderMm: leftovers.A.remainderMm,
    roomHeightMm: room.heightMm,
    hobWithItsOwnOvenBuildId: hobWithItsOwnOvenBuildId(),
    declared: args.columns,
  });

  // Storage on B stands nearest the corner, leaving the reading-order prefix at the free end; that
  // makes the reference fridge [2100, 2800] while the free-end remainder stays beyond it.
  const spatial = {
    A: [
      ...onA.map((item) => asWidthItem(item, tallEnd.hobBuildId)),
      ...storagePriorities("A", tallEnd.storageCount),
      ...tallColumnItems(tallEnd.columns),
    ],
    B: [
      ...storagePriorities("B", leftovers.B.storageCount),
      ...[...onBReadingOrder]
        .reverse()
        .map((item) => asWidthItem(item, tallEnd.hobBuildId)),
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

function storagePriorities(wall: DesignWall, count: number): WidthItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `storage:${wall}:${String(index)}`,
    role: "storage" as const,
    buildId: STORAGE_BUILD_ID,
    widthMm: STORAGE_BODY_WIDTH_MM,
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
