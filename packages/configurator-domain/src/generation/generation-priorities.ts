import type { DesignRoom, DesignWall } from "../design.js";
import { planLeftover, STORAGE_BODY_WIDTH_MM } from "./leftover-rule.js";

export type GenerationCoreRole = "fridge" | "sink" | "preparation" | "hob";
export type GenerationBaseRole = GenerationCoreRole | "storage";

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
    return builtPlan(input.room, input.runs, kept, cut);
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

function builtPlan(
  room: DesignRoom,
  runs: Readonly<Record<DesignWall, GenerationRun>>,
  kept: readonly GenerationPriority[],
  cut: number,
): KitchenCompositionPlan {
  const onBReadingOrder = kept.slice(0, cut);
  const onA = kept.slice(cut);
  const coreWidths = {
    A: sumWidths(onA),
    B: sumWidths(onBReadingOrder),
  };
  const leftovers = {
    A: planLeftover(runWidth(runs.A) - coreWidths.A),
    B: planLeftover(runWidth(runs.B) - coreWidths.B),
  };

  // Storage on B stands nearest the corner, leaving the reading-order prefix at the free end; that
  // makes the reference fridge [2100, 2800] while the free-end remainder stays beyond it.
  const spatial = {
    A: [...onA, ...storagePriorities("A", leftovers.A.storageCount)],
    B: [
      ...storagePriorities("B", leftovers.B.storageCount),
      ...[...onBReadingOrder].reverse(),
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
      A: leftovers.A.remainderMm,
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
