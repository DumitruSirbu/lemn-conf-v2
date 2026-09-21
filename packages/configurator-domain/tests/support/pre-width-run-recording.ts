// M7 wave 7D5 pre-width recording. The file this reader opens was captured before S1 added the
// 300 mm bottle cabinet. It records the whole canonical plan for every sampled room, rather than a
// digest, so a later comparison can name the exact field and module that moved.
//
// It also holds the one classifier both pre-S1 recordings — this one and 7D8's re-keyed half — are
// read through for rooms that stand a bottle, a pan drawer or both, so the 7D5 ruling is stated once
// (7D5 S2: Q-H6a = A, and Q-H6b / Q-H6c, which let a pan drawer stand without the bottle; 7D5 S3:
// Q-H5, the threshold drawer after the hob, in the bottle's place or after it).
//
// 7D5b S1 / ADR 0110 M1/M2/M9: both recordings predate the dishwasher, and it is a re-identification,
// never a width change. `planBeforeTheDishwasher` admits exactly that — M1's one door cabinet beside
// the sink re-identified in place, or (e)'s two drawer cabinets re-identified in place — and hands the
// rest of the plan to the comparisons below unchanged, so everything else stays exact.
//
// 7D5b S2 / ADR 0110 M7/M10: where S1 stood no dishwasher it is traded in directly after the sink for
// (b) one pantry column, (d) the bottle or (c) the oven tower, which is a width change on the sink's
// wall. `planBeforeTheDishwasher` undoes exactly that — the dishwasher out, every module after it on
// the sink's wall back by its 600 mm, the one body restored where the ruling says it stood — which
// recovers S1's plan, and then applies S1's own undo to it. A trade that moved anything else leaves a
// plan the exact comparisons below reject.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect } from "vitest";

import {
  BOTTLE_CARGO_BUILD_ID,
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  KITCHEN_L_DESIGN,
  lShellFloorRuns,
  type DesignRoom,
  type KitchenCompositionPlan,
  type PlannedGenerationBase,
} from "../../src/index.js";

const CATALOG = buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN));

const RECORDING_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "generation",
  "7d5-pre-width-baseline.json",
);

interface PreWidthRecordingDocument {
  readonly capturedFrom: string;
  readonly seed: number;
  readonly runs: number;
  /** Room key to the whole pre-S1 `canonicalPlan` string. */
  readonly rooms: Readonly<Record<string, string>>;
}

export interface PreWidthRunRecording {
  readonly capturedFrom: string;
  readonly seed: number;
  readonly runs: number;
  readonly rooms: ReadonlyMap<string, string>;
}

export interface RecordedPlanModule {
  readonly id: string;
  readonly role: string;
  readonly buildId: string;
  readonly wall: "A" | "B";
  readonly startMm: number;
  readonly endMm: number;
  readonly widthMm: number;
}

export interface RecordedCanonicalPlan {
  readonly minimumMet: boolean;
  readonly cut: number;
  readonly dropped: readonly string[];
  readonly remainderMm: Readonly<Record<"A" | "B", number>>;
  readonly floorWidthsMm: Readonly<Record<"A" | "B", readonly number[]>>;
  readonly bases: readonly RecordedPlanModule[];
}

/** Parses the frozen textual form without asking the current composer how any field should read. */
export function parseRecordedCanonicalPlan(
  canonical: string,
): RecordedCanonicalPlan {
  const [minimum, cut, dropped, remainder, floorWidths, ...modules] =
    canonical.split("|");
  if (!minimum || !cut || !dropped || !remainder || !floorWidths) {
    throw new Error("the 7D5 pre-width recording holds an incomplete plan");
  }
  const valueAfter = (part: string, prefix: string): string => {
    if (!part.startsWith(prefix)) {
      throw new Error(
        `the 7D5 pre-width recording expected ${prefix} in ${part}`,
      );
    }
    return part.slice(prefix.length);
  };
  const pair = (part: string, prefix: string): readonly [string, string] => {
    const pieces = valueAfter(part, prefix).split("/");
    if (pieces.length !== 2) {
      throw new Error(`the 7D5 pre-width recording holds an invalid ${prefix}`);
    }
    return [pieces[0] ?? "", pieces[1] ?? ""];
  };
  const [remainderA, remainderB] = pair(remainder, "remainder=");
  const [widthsA, widthsB] = pair(floorWidths, "floorWidths=");
  const widths = (value: string): readonly number[] =>
    value === "" ? [] : value.split(",").map(Number);
  return {
    minimumMet: valueAfter(minimum, "minimumMet=") === "true",
    cut: Number(valueAfter(cut, "cut=")),
    dropped: valueAfter(dropped, "dropped=").split(",").filter(Boolean),
    remainderMm: { A: Number(remainderA), B: Number(remainderB) },
    floorWidthsMm: { A: widths(widthsA), B: widths(widthsB) },
    bases: modules.map((module) => {
      const [id, role, buildId, wall, startMm, endMm, widthMm] =
        module.split("~");
      if (!id || !role || !buildId || (wall !== "A" && wall !== "B")) {
        throw new Error(
          `the 7D5 pre-width recording holds an invalid module: ${module}`,
        );
      }
      return {
        id,
        role,
        buildId,
        wall,
        startMm: Number(startMm),
        endMm: Number(endMm),
        widthMm: Number(widthMm),
      };
    }),
  };
}

export function readPreWidthRunRecording(): PreWidthRunRecording {
  const document = JSON.parse(
    readFileSync(RECORDING_FILE, "utf8"),
  ) as PreWidthRecordingDocument;
  const rooms = new Map(Object.entries(document.rooms));
  if (rooms.size !== document.runs) {
    throw new Error(
      `the 7D5 pre-width recording declares ${String(document.runs)} runs but holds ${String(rooms.size)} distinct rooms`,
    );
  }
  return {
    capturedFrom: document.capturedFrom,
    seed: document.seed,
    runs: document.runs,
    rooms,
  };
}

function moduleLine(base: {
  readonly id: string;
  readonly role: string;
  readonly buildId: string;
  readonly wall: string;
  readonly startMm: number;
  readonly endMm: number;
  readonly widthMm: number;
}): string {
  return [
    base.id,
    base.role,
    base.role === "hob" ? "<hob-body>" : base.buildId,
    base.wall,
    base.startMm,
    base.endMm,
    base.widthMm,
  ].join("~");
}

function coreIdentity(base: {
  readonly id: string;
  readonly role: string;
  readonly buildId: string;
  readonly widthMm: number;
}): string {
  return [
    base.id,
    base.role,
    base.role === "hob" ? "<hob-body>" : base.buildId,
    base.widthMm,
  ].join("~");
}

/** Exactly the width of one storage module: the pan drawer's width, and so the hob's shift. */
const PAN_DRAWER_WIDTH_MM = 600;
export const PAN_DRAWER_BODY = "base-panbank";
/** 7D5 S3 / Q-H5: the threshold drawer's own id, its body and its one module's width. */
export const THRESHOLD_DRAWER_ID = "threshold-drawer";
const THRESHOLD_DRAWER_BODY = "base-3drawer";
const THRESHOLD_DRAWER_WIDTH_MM = 600;
/** Owner ruling on Q-H5, 2026-09-21: the threshold drawer may cost one tall column and no more. */
const THRESHOLD_DRAWER_MOST_COLUMNS = 1;
export const STORAGE_SLOT_ID = /^storage:[AB]:\d+$/;
const TALL_COLUMN_ID = /^column:[AB]:\d+$/;

type PlanModule = RecordedPlanModule;

/**
 * A plan that stands a bottle, a pan drawer or both, against its pre-S1 recording, allowing exactly
 * what M7 wave 7D5 changed and nothing else: S1's 300 mm bottle immediately after the hob, and S2's
 * 600 mm pan drawer immediately before it (owner ruling 2026-09-21, Q-H6a = A; ADR 0110 Amendment J1)
 * with the hob and the bottle shifted along their wall by its width and the hob's wall giving up
 * outermost modules to pay for it. Every core role keeps its wall; the hob moves by exactly 600 mm
 * where a pan drawer stands and not at all where none does; the other wall is exactly as recorded.
 *
 * 7D5 S2, Q-H6b / Q-H6c: a pan drawer may stand **without** the bottle — the bottle gives way to it
 * (Q-H6b) and to every tall column its kitchen has (Q-H6c). A plan with neither is not this
 * classifier's to read: its caller compares it to the recording exactly.
 *
 * 7D5 S3, Q-H5 (owner ruling 2026-09-21): a 600 mm `base-3drawer` threshold drawer may stand after the
 * hob, read either where the bottle would stand (the bottle then absent) or right after the bottle,
 * and it may cost the hob's wall one outermost module and at most one tall column beyond what the pan
 * drawer and the bottle cost. Nothing else it admits.
 */
export function assertOnlyTheBottleAndPanDrawerChanged(
  key: string,
  room: DesignRoom,
  composed: KitchenCompositionPlan,
  recordedCanonical: string,
): void {
  const plan = planBeforeTheDishwasher(key, composed, recordedCanonical);
  const recorded = parseRecordedCanonicalPlan(recordedCanonical);
  expect(plan.minimumMet, `${key} minimumMet`).toBe(recorded.minimumMet);
  expect(plan.dropped, `${key} dropped`).toEqual(recorded.dropped);

  const panDrawer = panDrawerOf(key, plan);
  const thresholdDrawer = thresholdDrawerOf(key, plan);
  const ancillaries = {
    panDrawer,
    thresholdDrawer,
    bottle: bottleOf(key, plan, { panDrawer, thresholdDrawer }),
  };

  assertCoreMovedOnlyByThePanDrawer(key, plan, recorded, panDrawer);
  assertContiguousRuns(key, room, plan);
  assertHobWallChangedOnlyAstrideTheHob(key, plan, recorded, ancillaries);
  assertOtherWallUnchanged(key, plan, recorded);
}

const DISHWASHER_BODY = "base-dishwasher";
const DISHWASHER_ID = "dishwasher";
const DISHWASHER_WIDTH_MM = 600;
const DOOR_BODY = "base-cabinet";
const PREPARATION_BODY = "base-3drawer";

/** 7D5b S2 / ADR 0110 M7/M10: the three trades, by the body the run gave up. */
export type DishwasherTrade = "(b)" | "(d)" | "(c)";

/** How a plan stood its dishwasher, for a caller that counts the arms. */
export type DishwasherArm = "none" | "M1" | "(e)" | DishwasherTrade;

/** Which arm stood the plan's dishwasher, read off what stands: (e) where the pan drawer carries the
 *  preparation role; a trade where the dishwasher is read directly after the sink on the hob's wall,
 *  laid out forward (M1 converts a composed slot, which never stands between the sink and the hob);
 *  M1 otherwise. 7D5b S2: which trade is read off the sink's wall — (c) where no column stands and
 *  the hob carries the oven, (d) where columns stand and no bottle does, (b) where both stand. A (b)
 *  room without a bottle would read as (d) and then fail the exact comparisons rather than pass;
 *  the approved population holds none (every (b) room keeps its bottle, measured at 7D5b S2). */
export function dishwasherArmOf(plan: KitchenCompositionPlan): DishwasherArm {
  const dishwasher = plan.bases.find(
    (base) => base.buildId === DISHWASHER_BODY,
  );
  if (dishwasher === undefined) return "none";
  if (plan.bases.some(isPanDrawerCarryingThePreparation)) return "(e)";
  return isReadDirectlyAfterTheSink(plan.bases, dishwasher)
    ? tradeReadOffTheWall(plan.bases, dishwasher.wall)
    : "M1";
}

function isReadDirectlyAfterTheSink(
  bases: readonly PlanModule[],
  dishwasher: PlanModule,
): boolean {
  const sink = bases.find((base) => base.role === "sink");
  const hob = bases.find((base) => base.role === "hob");
  return (
    sink !== undefined &&
    sink.wall === dishwasher.wall &&
    hob?.wall === dishwasher.wall &&
    dishwasher.startMm === sink.endMm
  );
}

function tradeReadOffTheWall(
  bases: readonly PlanModule[],
  wall: "A" | "B",
): DishwasherTrade {
  const standsAColumn = bases.some(
    (base) => base.wall === wall && TALL_COLUMN_ID.test(base.id),
  );
  if (!standsAColumn) return "(c)";
  return bases.some((base) => base.id === "bottle") ? "(b)" : "(d)";
}

/**
 * **7D5b S1 / ADR 0110 M1/M2/M9.** The plan as it stood before its dishwasher was decided, having
 * asserted that the dishwasher is only what the owner ruled: one 600 mm `base-dishwasher` under its own
 * id and the storage role, abutting the sink along its wall or facing it across the corner, and either
 *
 * - **M1**: a composed door cabinet re-identified in place — the recording must hold a 600 mm composed
 *   slot with the door body at exactly the dishwasher's wall and span, and that module is restored
 *   (the M1 module never stands on the hob's wall past the hob, the only stretch 7D5 moved); or
 * - **(e)**: the preparation 3-drawer re-identified in place, and the pan drawer abutting it carrying
 *   the preparation id and role on its own body — restored as the preparation cabinet and the
 *   `pan-drawer` module.
 *
 * Nothing moves in either, so every span, width, remainder and floor width is handed on as composed,
 * and a restored module that is not what the recording holds fails the exact comparisons after this.
 * The plan is returned unchanged where no dishwasher stands.
 */
export function planBeforeTheDishwasher(
  key: string,
  plan: KitchenCompositionPlan,
  recordedCanonical: string,
): KitchenCompositionPlan {
  const dishwashers = plan.bases.filter(
    (base) => base.buildId === DISHWASHER_BODY || base.id === DISHWASHER_ID,
  );
  expect(dishwashers.length, `${key} dishwasher count`).toBeLessThanOrEqual(1);
  const [dishwasher] = dishwashers;
  if (dishwasher === undefined) return plan;
  expect(dishwasher, `${key} dishwasher identity`).toMatchObject({
    id: DISHWASHER_ID,
    role: "storage",
    buildId: DISHWASHER_BODY,
    widthMm: DISHWASHER_WIDTH_MM,
  });
  const sink = plan.bases.find((base) => base.role === "sink");
  expect(
    sink !== undefined && isBeside(plan.bases, [dishwasher, sink]),
    `${key} dishwasher beside the sink`,
  ).toBe(true);

  const arm = dishwasherArmOf(plan);
  if (arm === "(b)" || arm === "(d)" || arm === "(c)") {
    // 7D5b S2 / ADR 0110 M7/M10: undone to S1's plan, which then takes S1's own undo (none stood).
    const undone = withTheDishwasherTradeUndone(plan);
    if (undone.kind === "unruled") {
      expect.fail(`${key} ${undone.reason}`);
    }
    return planBeforeTheDishwasher(key, undone.plan, recordedCanonical);
  }
  const restore =
    arm === "(e)"
      ? drawerSwapUndone(key, plan, dishwasher)
      : doorCabinetRestored(key, {
          dishwasher,
          recorded: parseRecordedCanonicalPlan(recordedCanonical),
        });
  return { ...plan, bases: plan.bases.map(restore) };
}

// ---------------------------------------------------------------------------------------------
// 7D5b S2 / ADR 0110 M7/M10 — a traded dishwasher, undone to the plan S1 composed.
// ---------------------------------------------------------------------------------------------

const TRADED_DISHWASHER_WIDTH_MM = 600;
const BOTTLE_WIDTH_MM = 300;
const COLUMN_WIDTH_MM = 600;
const PANTRY_BODY = "tall-pantry";
const OVEN_TOWER_BODY = "tall-oven-tower";
const HOB_WITH_ITS_OWN_OVEN = "base-hob-oven";
const HOB_WITH_DRAWERS = "base-hob-2drawer";

/** What undoing a trade found: the plan S1 composed, and each restored module's shift along its wall
 *  (current `startMm` minus S1's), for a caller whose wall row stands over the same modules. */
export type TradeUndo =
  | {
      readonly kind: DishwasherTrade;
      readonly plan: KitchenCompositionPlan;
      readonly shiftedMm: ReadonlyMap<string, number>;
    }
  | { readonly kind: "unruled"; readonly reason: string };

/**
 * **7D5b S2 / ADR 0110 M7/M10.** The dishwasher traded in directly after the sink, undone: it is taken
 * out and every module after it on the sink's wall is drawn back by its 600 mm; then the one body the
 * ruling names is stood back where it stood —
 *
 * - **(b)** a pantry column past the block's outermost, which gives back the width E6.2 let it absorb
 *   and returns to one module: the remainder does not move;
 * - **(d)** the 300 mm bottle directly after the hob, everything past it drawn back only 300 mm, and
 *   the remainder 300 mm wider — the freed 300 mm the dishwasher had filled;
 * - **(c)** the 600 mm oven tower as the block's only column, past the last module, and the hob back on
 *   its drawers (`base-hob-2drawer`), since a tower stands again (E4): the remainder does not move.
 *
 * A trade the rulings do not account for — no hob on the sink's wall, a (b) whose wall does not end in
 * a column, a (c) whose hob kept its drawers — is answered `unruled`. Anything else it moved, it moved
 * in the undone plan too, where the caller's exact comparison names it.
 */
export function withTheDishwasherTradeUndone(
  plan: KitchenCompositionPlan,
): TradeUndo {
  const dishwasher = plan.bases.find(
    (base) => base.buildId === DISHWASHER_BODY,
  );
  const arm = dishwasherArmOf(plan);
  if (
    dishwasher === undefined ||
    (arm !== "(b)" && arm !== "(d)" && arm !== "(c)")
  ) {
    return { kind: "unruled", reason: `no traded dishwasher (${arm})` };
  }
  const wall = dishwasher.wall;
  const beyond = plannedAlongWall(plan.bases, wall).filter(
    (base) => base.startMm >= dishwasher.endMm,
  );
  const restored =
    arm === "(b)"
      ? pantryColumnRestored(beyond, wall)
      : arm === "(d)"
        ? bottleRestored(beyond)
        : ovenTowerRestored(beyond, wall);
  if (typeof restored === "string") {
    return { kind: "unruled", reason: `${arm} ${restored}` };
  }
  const bases = inThePlansOwnOrder(plan.bases, {
    dishwasher,
    beyond,
    restored: restored.bases,
  });
  const remainderMm = {
    ...plan.remainderMm,
    [wall]: plan.remainderMm[wall] + restored.remainderGainedMm,
  };
  return {
    kind: arm,
    plan: {
      ...plan,
      bases,
      remainderMm,
      floorWidthsMm: {
        ...plan.floorWidthsMm,
        [wall]: alongWall(bases, wall).map((base) => base.widthMm),
      },
    },
    shiftedMm: new Map(
      restored.bases.flatMap((base) => {
        const current = beyond.find((module) => module.id === base.id);
        return current === undefined
          ? []
          : [[base.id, current.startMm - base.startMm] as const];
      }),
    ),
  };
}

/** `alongWall` for the composer's own modules, whose type the restored plan keeps. */
function plannedAlongWall(
  bases: readonly PlannedGenerationBase[],
  wall: "A" | "B",
): readonly PlannedGenerationBase[] {
  return bases
    .filter((base) => base.wall === wall)
    .sort((left, right) => left.startMm - right.startMm);
}

/** The plan's bases in the order the composer wrote them — the order every exact comparison reads —
 *  with the dishwasher out, each drawn-back module in its own place, and the restored body written
 *  directly after the module it stands after along the wall. */
function inThePlansOwnOrder(
  bases: readonly PlannedGenerationBase[],
  trade: {
    readonly dishwasher: PlannedGenerationBase;
    readonly beyond: readonly PlannedGenerationBase[];
    readonly restored: readonly PlannedGenerationBase[];
  },
): readonly PlannedGenerationBase[] {
  const isNew = (base: PlannedGenerationBase) =>
    !trade.beyond.some((module) => module.id === base.id);
  const restoredAfter = new Map(
    trade.restored.flatMap((base, at) =>
      isNew(base) ? [[trade.restored[at - 1]?.id, base] as const] : [],
    ),
  );
  return bases.flatMap((base) => {
    if (base === trade.dishwasher) return [];
    if (!trade.beyond.includes(base)) return [base];
    const drawnBackBase = trade.restored.find(
      (module) => module.id === base.id,
    );
    const followedBy = restoredAfter.get(base.id);
    return [drawnBackBase ?? base, ...(followedBy ? [followedBy] : [])];
  });
}

interface RestoredRun {
  readonly bases: readonly PlannedGenerationBase[];
  readonly remainderGainedMm: number;
}

function drawnBack(
  base: PlannedGenerationBase,
  byMm: number,
): PlannedGenerationBase {
  return { ...base, startMm: base.startMm - byMm, endMm: base.endMm - byMm };
}

function pantryColumnRestored(
  beyond: readonly PlannedGenerationBase[],
  wall: "A" | "B",
): RestoredRun | string {
  const outermost = beyond.at(-1);
  const columns = beyond.filter((base) => TALL_COLUMN_ID.test(base.id));
  if (outermost === undefined || !columns.includes(outermost)) {
    return "the sink's wall does not end in a column";
  }
  const bases = beyond.map((base) => {
    const back = drawnBack(base, TRADED_DISHWASHER_WIDTH_MM);
    return base === outermost
      ? {
          ...back,
          endMm: back.startMm + COLUMN_WIDTH_MM,
          widthMm: COLUMN_WIDTH_MM,
        }
      : back;
  });
  const lastEndMm = bases.at(-1)?.endMm ?? 0;
  const pantry: PlannedGenerationBase = {
    id: `column:${wall}:${String(columns.length)}`,
    role: "storage",
    buildId: PANTRY_BODY,
    wall,
    startMm: lastEndMm,
    endMm: lastEndMm + outermost.widthMm,
    widthMm: outermost.widthMm,
  };
  return { bases: [...bases, pantry], remainderGainedMm: 0 };
}

function bottleRestored(
  beyond: readonly PlannedGenerationBase[],
): RestoredRun | string {
  const hob = beyond.find((base) => base.role === "hob");
  if (hob === undefined) return "no hob after the dishwasher";
  const upToTheHob = beyond
    .filter((base) => base.startMm <= hob.startMm)
    .map((base) => drawnBack(base, TRADED_DISHWASHER_WIDTH_MM));
  const hobEndMm = hob.endMm - TRADED_DISHWASHER_WIDTH_MM;
  const bottle: PlannedGenerationBase = {
    id: "bottle",
    role: "storage",
    buildId: BOTTLE_CARGO_BUILD_ID,
    wall: hob.wall,
    startMm: hobEndMm,
    endMm: hobEndMm + BOTTLE_WIDTH_MM,
    widthMm: BOTTLE_WIDTH_MM,
  };
  const pastTheHob = beyond
    .filter((base) => base.startMm > hob.startMm)
    .map((base) =>
      drawnBack(base, TRADED_DISHWASHER_WIDTH_MM - BOTTLE_WIDTH_MM),
    );
  return {
    bases: [...upToTheHob, bottle, ...pastTheHob],
    remainderGainedMm: TRADED_DISHWASHER_WIDTH_MM - BOTTLE_WIDTH_MM,
  };
}

function ovenTowerRestored(
  beyond: readonly PlannedGenerationBase[],
  wall: "A" | "B",
): RestoredRun | string {
  const hob = beyond.find((base) => base.role === "hob");
  if (hob?.buildId !== HOB_WITH_ITS_OWN_OVEN) {
    return `hob ${hob?.buildId ?? "absent"} does not carry the oven`;
  }
  const bases = beyond.map((base) => {
    const back = drawnBack(base, TRADED_DISHWASHER_WIDTH_MM);
    return base === hob ? { ...back, buildId: HOB_WITH_DRAWERS } : back;
  });
  const lastEndMm = bases.at(-1)?.endMm ?? 0;
  const tower: PlannedGenerationBase = {
    id: `column:${wall}:0`,
    role: "storage",
    buildId: OVEN_TOWER_BODY,
    wall,
    startMm: lastEndMm,
    endMm: lastEndMm + COLUMN_WIDTH_MM,
    widthMm: COLUMN_WIDTH_MM,
  };
  return { bases: [...bases, tower], remainderGainedMm: 0 };
}

function isPanDrawerCarryingThePreparation(base: PlanModule): boolean {
  return base.buildId === PAN_DRAWER_BODY && base.role === "preparation";
}

/** M1: the door cabinet the recording holds at the dishwasher's own wall and span. Its id is read
 *  from the recording rather than spelled here, so this file never writes the slot-id convention
 *  (7D4 criterion 22); what is asserted is that the module was a door cabinet the storage run
 *  composed, one module wide. */
function doorCabinetRestored(
  key: string,
  context: {
    readonly dishwasher: PlannedGenerationBase;
    readonly recorded: RecordedCanonicalPlan;
  },
): (base: PlannedGenerationBase) => PlannedGenerationBase {
  const { dishwasher, recorded } = context;
  const convertedFrom = recorded.bases.find(
    (base) =>
      base.wall === dishwasher.wall &&
      base.startMm === dishwasher.startMm &&
      base.endMm === dishwasher.endMm,
  );
  expect(
    convertedFrom !== undefined && STORAGE_SLOT_ID.test(convertedFrom.id),
    `${key} M1 converted a composed slot`,
  ).toBe(true);
  expect(convertedFrom, `${key} M1 converted a door cabinet`).toMatchObject({
    role: "storage",
    buildId: DOOR_BODY,
    widthMm: DISHWASHER_WIDTH_MM,
  });
  const doorCabinet = {
    ...dishwasher,
    id: convertedFrom?.id ?? dishwasher.id,
    buildId: DOOR_BODY,
  };
  return (base) => (base === dishwasher ? doorCabinet : base);
}

/** (e): the preparation cabinet the dishwasher was, and the pan drawer that carries its role. */
function drawerSwapUndone(
  key: string,
  plan: KitchenCompositionPlan,
  dishwasher: PlannedGenerationBase,
): (base: PlannedGenerationBase) => PlannedGenerationBase {
  const preparations = plan.bases.filter((base) => base.role === "preparation");
  expect(preparations.length, `${key} one preparation role`).toBe(1);
  const [panDrawer] = preparations;
  expect(panDrawer, `${key} (e) pan drawer identity`).toMatchObject({
    id: "preparation",
    buildId: PAN_DRAWER_BODY,
    widthMm: PAN_DRAWER_WIDTH_MM,
  });
  expect(
    panDrawer !== undefined && abutsAlongItsWall(panDrawer, dishwasher),
    `${key} (e) pan drawer beyond the dishwasher`,
  ).toBe(true);
  const preparationCabinet: PlannedGenerationBase = {
    ...dishwasher,
    id: "preparation",
    role: "preparation",
    buildId: PREPARATION_BODY,
  };
  return (base) => {
    if (base === dishwasher) return preparationCabinet;
    return base === panDrawer
      ? { ...base, id: "pan-drawer", role: "storage" }
      : base;
  };
}

/** Two modules abut along one wall, or face each other across the corner as each wall's first.
 *  These "beside the sink" helpers undo the leaf so older assertions keep working, and are deliberately
 *  independent of production and of the pre-tower classifier: a shared helper would let one bug corrupt
 *  both sides of the comparison. */
function isBeside(
  bases: readonly PlanModule[],
  pair: readonly [PlanModule, PlanModule],
): boolean {
  const [one, other] = pair;
  const isFirstFromTheCorner = (base: PlanModule) =>
    alongWall(bases, base.wall)[0] === base;
  return (
    abutsAlongItsWall(one, other) ||
    (one.wall !== other.wall &&
      isFirstFromTheCorner(one) &&
      isFirstFromTheCorner(other))
  );
}

function abutsAlongItsWall(one: PlanModule, other: PlanModule): boolean {
  return (
    one.wall === other.wall &&
    (one.endMm === other.startMm || one.startMm === other.endMm)
  );
}

/** What 7D5 stood astride the hob: the pan drawer before it, the bottle after it and the threshold
 *  drawer after that (7D5 S3), each possibly absent. */
interface StandingAncillaries {
  readonly panDrawer: PlanModule | undefined;
  readonly bottle: PlanModule | undefined;
  readonly thresholdDrawer: PlanModule | undefined;
}

/** The single bottle. Required where neither drawer stands, because then the bottle is the only thing
 *  7D5 changed; optional beside a pan drawer, which it gives way to (7D5 S2, Q-H6b / Q-H6c), and
 *  beside a threshold drawer, which may take its place (7D5 S3, Q-H5). */
function bottleOf(
  key: string,
  plan: KitchenCompositionPlan,
  drawers: Pick<StandingAncillaries, "panDrawer" | "thresholdDrawer">,
): PlanModule | undefined {
  const bottles = plan.bases.filter(
    (base) => base.id === "bottle" || base.buildId === BOTTLE_CARGO_BUILD_ID,
  );
  const mayGiveWay =
    drawers.panDrawer !== undefined || drawers.thresholdDrawer !== undefined;
  const allowed = mayGiveWay ? [0, 1] : [1];
  expect(allowed, `${key} bottle count`).toContain(bottles.length);
  const [bottle] = bottles;
  if (bottle === undefined) return undefined;
  expect(bottle, `${key} bottle identity`).toMatchObject({
    id: "bottle",
    role: "storage",
    buildId: BOTTLE_CARGO_BUILD_ID,
    widthMm: 300,
  });
  return bottle;
}

/** The single pan drawer where one stands (7D5 S2), or `undefined` where none does. */
function panDrawerOf(
  key: string,
  plan: KitchenCompositionPlan,
): PlanModule | undefined {
  const panDrawers = plan.bases.filter(
    (base) => base.id === "pan-drawer" || base.buildId === PAN_DRAWER_BODY,
  );
  expect(panDrawers.length, `${key} pan drawer count`).toBeLessThanOrEqual(1);
  const [panDrawer] = panDrawers;
  if (panDrawer === undefined) return undefined;
  expect(panDrawer, `${key} pan drawer identity`).toMatchObject({
    id: "pan-drawer",
    role: "storage",
    buildId: PAN_DRAWER_BODY,
    widthMm: PAN_DRAWER_WIDTH_MM,
  });
  return panDrawer;
}

/** The single threshold drawer where one stands (7D5 S3, Q-H5), or `undefined` where none does. It is
 *  found by id alone, because its body is the composed drawer slot's body too. */
function thresholdDrawerOf(
  key: string,
  plan: KitchenCompositionPlan,
): PlanModule | undefined {
  const drawers = plan.bases.filter((base) => base.id === THRESHOLD_DRAWER_ID);
  expect(drawers.length, `${key} threshold drawer count`).toBeLessThanOrEqual(
    1,
  );
  const [drawer] = drawers;
  if (drawer === undefined) return undefined;
  expect(drawer, `${key} threshold drawer identity`).toMatchObject({
    id: THRESHOLD_DRAWER_ID,
    role: "storage",
    buildId: THRESHOLD_DRAWER_BODY,
    widthMm: THRESHOLD_DRAWER_WIDTH_MM,
  });
  return drawer;
}

/** Every core role keeps its identity, its wall and its position, except the hob, which moves by
 *  exactly the pan drawer's width where a pan drawer stands and not at all where none does. */
function assertCoreMovedOnlyByThePanDrawer(
  key: string,
  plan: KitchenCompositionPlan,
  recorded: RecordedCanonicalPlan,
  panDrawer: PlanModule | undefined,
): void {
  const hobShiftMm = panDrawer === undefined ? 0 : PAN_DRAWER_WIDTH_MM;
  const currentCore = plan.bases.filter((base) => base.role !== "storage");
  const recordedCore = recorded.bases
    .filter((base) => base.role !== "storage")
    .map((base) =>
      base.role === "hob" ? shiftedAlongItsWall(base, hobShiftMm) : base,
    );
  expect(
    currentCore.map(coreIdentity).sort(),
    `${key} core identities`,
  ).toEqual(recordedCore.map(coreIdentity).sort());
  expect(currentCore.map(moduleLine), `${key} core geometry`).toEqual(
    recordedCore.map(moduleLine),
  );
}

function shiftedAlongItsWall(base: PlanModule, shiftMm: number): PlanModule {
  return {
    ...base,
    startMm: base.startMm + shiftMm,
    endMm: base.endMm + shiftMm,
  };
}

/** On the hob's wall: everything before the pan drawer (or the hob) is exactly as recorded; the pan
 *  drawer stands immediately before the hob and the bottle immediately after it; and what follows
 *  keeps the recorded bodies in the recorded order, losing only outermost storage slots and columns.
 *
 *  **The hob's wall is assumed laid out forward, corner to free end — the suffix wall's layout.** Every
 *  positional clause here reads *before the hob* as a lower `startMm` and *after* as a higher one. A
 *  hob on the prefix wall, which is laid out in reverse (ADR 0110 D2), would stand its pan drawer at
 *  the higher end and leave the hob in place, so it fails the clauses below and in
 *  `assertCoreMovedOnlyByThePanDrawer` loudly rather than passing. Neither recording holds such a room
 *  with a pan drawer (measured at 7D5 S2 over all 480 + 82 rooms). */
function assertHobWallChangedOnlyAstrideTheHob(
  key: string,
  plan: KitchenCompositionPlan,
  recorded: RecordedCanonicalPlan,
  ancillaries: StandingAncillaries,
): void {
  const hob = hobOf(key, plan.bases);
  const recordedHob = hobOf(key, recorded.bases);
  assertAncillariesAstrideTheHob(key, hob, ancillaries);

  const current = alongWall(plan.bases, hob.wall);
  const before = recordedModulesBefore(recorded, recordedHob);
  const firstChangedAt = ancillaries.panDrawer?.startMm ?? hob.startMm;
  expect(
    current.filter((base) => base.endMm <= firstChangedAt).map(moduleLine),
    `${key} ${hob.wall} before the hob`,
  ).toEqual(before.map(moduleLine));

  const tail = (bases: readonly PlanModule[], after: number) =>
    alongWall(bases, hob.wall).filter((base) => base.startMm >= after);
  assertTailLostOnlyWhatTheAncillariesCost(`${key} ${hob.wall}`, {
    current: tailModules(tail(plan.bases, hob.endMm)),
    recorded: tailModules(tail(recorded.bases, recordedHob.endMm)),
    ancillaries,
  });
}

/** The pan drawer, where it stands, ends where the hob starts; the bottle, where it stands, starts
 *  where the hob ends; both on the hob's wall. */
function assertAncillariesAstrideTheHob(
  key: string,
  hob: PlanModule,
  ancillaries: StandingAncillaries,
): void {
  if (ancillaries.bottle !== undefined) {
    expect(ancillaries.bottle, `${key} bottle after the hob`).toMatchObject({
      wall: hob.wall,
      startMm: hob.endMm,
    });
  }
  if (ancillaries.panDrawer !== undefined) {
    expect(
      ancillaries.panDrawer,
      `${key} pan drawer before the hob`,
    ).toMatchObject({ wall: hob.wall, endMm: hob.startMm });
  }
  if (ancillaries.thresholdDrawer !== undefined) {
    // 7D5 S3 / Q-H5: read after the hob — in the bottle's place, or right after the bottle.
    expect(
      ancillaries.thresholdDrawer,
      `${key} threshold drawer after the hob or the bottle`,
    ).toMatchObject({
      wall: hob.wall,
      startMm: ancillaries.bottle?.endMm ?? hob.endMm,
    });
  }
}

/** The storage slots and tall columns after the hob, each in wall order, as body/width and body. */
interface TailModules {
  readonly slots: readonly string[];
  readonly columns: readonly string[];
}

function tailModules(bases: readonly PlanModule[]): TailModules {
  return {
    slots: bases
      .filter((base) => STORAGE_SLOT_ID.test(base.id))
      .map((base) => `${base.buildId}/${String(base.widthMm)}`),
    columns: bases
      .filter((base) => TALL_COLUMN_ID.test(base.id))
      .map((base) => base.buildId),
  };
}

/**
 * After the hob the wall loses only outermost slots and columns, and no more than what stands astride
 * the hob can cost: one module for the bottle, which is narrower than one, and one more for the pan
 * drawer, which is exactly one (logic review N5b: at most 1 + the number of pan drawers). Where a pan
 * drawer stands the wall gave up at least one module to pay for it.
 *
 * 7D5 S3 / Q-H5: the threshold drawer is one module. In the bottle's place it spends the bottle's
 * module; after the bottle it costs one more. Either way the wall paid at least one for it.
 */
function assertTailLostOnlyWhatTheAncillariesCost(
  label: string,
  tails: {
    readonly current: TailModules;
    readonly recorded: TailModules;
    readonly ancillaries: StandingAncillaries;
  },
): void {
  const { current, recorded, ancillaries } = tails;
  assertOutermostLost(`${label} storage slots`, {
    current: current.slots,
    recorded: recorded.slots,
  });
  assertOutermostLost(`${label} tall columns`, {
    current: current.columns,
    recorded: recorded.columns,
  });

  const panDrawers = ancillaries.panDrawer === undefined ? 0 : 1;
  const thresholdDrawerAfterTheBottle =
    ancillaries.thresholdDrawer !== undefined &&
    ancillaries.bottle !== undefined
      ? 1
      : 0;
  const lostModules =
    recorded.slots.length +
    recorded.columns.length -
    (current.slots.length + current.columns.length);
  expect(lostModules, `${label} modules lost`).toBeLessThanOrEqual(
    1 + panDrawers + thresholdDrawerAfterTheBottle,
  );
  if (panDrawers === 1) {
    expect(lostModules, `${label} paid for the pan drawer`).toBeGreaterThan(0);
  }
  if (ancillaries.thresholdDrawer !== undefined) {
    expect(
      lostModules,
      `${label} paid for the threshold drawer`,
    ).toBeGreaterThanOrEqual(panDrawers + 1);
  }
  assertThePanDrawerWasDecidedFirst(label, tails);
}

/**
 * 7D5 S2: the pan drawer is decided first, against the core alone (ADR 0110 J1), and wins where it and
 * the bottle cannot both stand (Q-H6b); once it stands the bottle gives way rather than a tall column
 * (Q-H6c); where it is refused against the core alone it is tried again beside S1's bottle.
 *
 * The recording **is** the core alone, and it says where the pan drawer was affordable there: exactly
 * where the hob's wall held a storage slot after the hob. A slot means the leftover reaches one module,
 * and a block keeps its columns with one module fewer, because a block smaller than its three
 * columns has taken every leftover module and left no slot. With no slot, the pan drawer either does
 * not fit or costs the block a column. So:
 *
 * - a recorded slot: the pan drawer stands, and the block keeps every recorded column whether or not
 *   the bottle stands beside it (Q-H6c), with the pan drawer's module the one slot lost where the
 *   bottle gave way;
 * - no recorded slot: a pan drawer can only be the fallback's, so it stands beside the bottle.
 *
 * 7D5 S3 / Q-H5: the threshold drawer is decided after both, and may cost that kitchen one column and
 * one module; where it took the bottle's place the bottle is simply absent, so the fallback's bottle
 * may be a threshold drawer instead.
 */
function assertThePanDrawerWasDecidedFirst(
  label: string,
  tails: {
    readonly current: TailModules;
    readonly recorded: TailModules;
    readonly ancillaries: StandingAncillaries;
  },
): void {
  const { current, recorded, ancillaries } = tails;
  const hadASlotForThePanDrawer = recorded.slots.length > 0;
  const standsAPanDrawer = ancillaries.panDrawer !== undefined;
  const thresholdDrawers = ancillaries.thresholdDrawer === undefined ? 0 : 1;
  if (!hadASlotForThePanDrawer) {
    if (standsAPanDrawer) {
      expect(
        ancillaries.bottle ?? ancillaries.thresholdDrawer,
        `${label} a fallback pan drawer stands beside the bottle`,
      ).toBeDefined();
    }
    return;
  }
  expect(
    standsAPanDrawer,
    `${label} pan drawer decided first where the core left it a slot (J1, Q-H6b)`,
  ).toBe(true);
  expect(
    current.columns.length,
    `${label} tall columns kept once the pan drawer stands (Q-H6c)`,
  ).toBeGreaterThanOrEqual(
    recorded.columns.length - THRESHOLD_DRAWER_MOST_COLUMNS * thresholdDrawers,
  );
  if (ancillaries.bottle !== undefined) return;
  expect(
    recorded.slots.length - current.slots.length,
    `${label} one slot lost to a pan drawer without the bottle (Q-H6c)`,
  ).toBeLessThanOrEqual(1 + thresholdDrawers);
}

/** `current` is `recorded` with zero or more of its outermost entries removed, and nothing else. */
function assertOutermostLost(
  label: string,
  sequences: {
    readonly current: readonly string[];
    readonly recorded: readonly string[];
  },
): void {
  expect(sequences.current.length, label).toBeLessThanOrEqual(
    sequences.recorded.length,
  );
  expect(sequences.current, label).toEqual(
    sequences.recorded.slice(0, sequences.current.length),
  );
}

function recordedModulesBefore(
  recorded: RecordedCanonicalPlan,
  recordedHob: PlanModule,
): readonly PlanModule[] {
  return alongWall(recorded.bases, recordedHob.wall).filter(
    (base) => base.endMm <= recordedHob.startMm,
  );
}

/** The wall without the hob carries neither the bottle nor the pan drawer, so it is exactly as
 *  recorded: every module, its floor widths and its remainder. */
function assertOtherWallUnchanged(
  key: string,
  plan: KitchenCompositionPlan,
  recorded: RecordedCanonicalPlan,
): void {
  const otherWall = hobOf(key, plan.bases).wall === "A" ? "B" : "A";
  expect(
    alongWall(plan.bases, otherWall).map(moduleLine),
    `${key} ${otherWall} modules`,
  ).toEqual(alongWall(recorded.bases, otherWall).map(moduleLine));
  expect(plan.floorWidthsMm[otherWall], `${key} ${otherWall} floor`).toEqual(
    recorded.floorWidthsMm[otherWall],
  );
  expect(plan.remainderMm[otherWall], `${key} ${otherWall} remainder`).toBe(
    recorded.remainderMm[otherWall],
  );
}

function hobOf(key: string, bases: readonly PlanModule[]): PlanModule {
  const hob = bases.find((base) => base.role === "hob");
  if (hob === undefined) throw new Error(`${key} composes no hob`);
  return hob;
}

function alongWall(
  bases: readonly PlanModule[],
  wall: "A" | "B",
): readonly PlanModule[] {
  return bases
    .filter((base) => base.wall === wall)
    .sort((left, right) => left.startMm - right.startMm);
}

function assertContiguousRuns(
  key: string,
  room: DesignRoom,
  plan: KitchenCompositionPlan,
): void {
  const ids = plan.bases.map((base) => base.id);
  expect(new Set(ids).size, `${key} unique ids`).toBe(ids.length);
  const runs = lShellFloorRuns(room);
  for (const wall of ["A", "B"] as const) {
    const bases = alongWall(plan.bases, wall);
    let cursor = runs[wall].startMm;
    for (const base of bases) {
      expect(base.startMm, `${key} ${base.id} start`).toBe(cursor);
      expect(base.endMm - base.startMm, `${key} ${base.id} span`).toBe(
        base.widthMm,
      );
      expect(CATALOG.has(base.buildId), `${key} ${base.id} build`).toBe(true);
      if (
        base.role === "storage" &&
        base.id !== "bottle" &&
        base.id !== "pan-drawer" &&
        base.id !== THRESHOLD_DRAWER_ID
      ) {
        expect(
          STORAGE_SLOT_ID.test(base.id) || TALL_COLUMN_ID.test(base.id),
          `${key} ${base.id} ancillary id`,
        ).toBe(true);
      }
      cursor = base.endMm;
    }
    expect(plan.floorWidthsMm[wall], `${key} ${wall} floor widths`).toEqual(
      bases.map((base) => base.widthMm),
    );
    expect(plan.remainderMm[wall], `${key} ${wall} remainder`).toBe(
      runs[wall].endMm - cursor,
    );
  }
}
