// Criteria 2 and 21 are asserted against a recording of the pre-7D4 composition, never against this module's own
// output, which would agree with itself whatever the module does (`tests/support/composed-run-baseline.ts`).
// A storage slot is reached through `isComposedStorageSlot`, never `role === "storage"` or a width: the block's
// full-height columns carry that role deliberately (ADR 0110 E5.2).
import { fc } from "@fast-check/vitest";
import { describe, expect, it, vi } from "vitest";

import {
  BOTTLE_CARGO_BUILD_ID,
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  createBodyProbeLease,
  declaredColumnSizes,
  DOOR_BASE_BUILD_ID,
  generateKitchen,
  isComposedStorageSlot,
  KITCHEN_L_DESIGN,
  lShellFloorRuns,
  normaliseBand,
  planKitchenComposition,
  THREE_DRAWER_BASE_BUILD_ID,
  type BodyProbeFactory,
  type Design,
  type DesignRoom,
  type GenerationLog,
  type KitchenCompositionPlan,
  type PlannedGenerationBase,
} from "../../src/index.js";
import {
  BASELINE_RUNS,
  BASELINE_SEED,
  canonicalModule,
  canonicalPlan,
  canonicalPlanBeyondThisWavesBodies,
  canonicalPlanWithTheDoorBodyRestored,
  canonicalWallRow,
  digestOf,
  isMovedByThisWave,
  readComposedRunBaseline,
  recordedLRoom,
  recordedRoom,
  recordedWitness,
  roomKey,
} from "../support/composed-run-baseline.js";
import { widerEnteredWall } from "../support/entered-walls.js";
import { twoWallPlanOf } from "../support/two-wall-plan-of.js";
import {
  createFakeProbe,
  createFakeProbeFactory,
  createLeaseLedger,
} from "../support/fake-probe.js";
import {
  dishwasherArmOf,
  PAN_DRAWER_BODY,
  parseRecordedCanonicalPlan,
  withTheDishwasherTradeUndone,
} from "../support/pre-width-run-recording.js";
import { thePlannerBeforeC5 } from "../support/before-c5-fridge-end-leftover.js";

// Tests that compare with a recording of an earlier planner run `thePlannerBeforeC5()` (fridge-end leftover not
// absorbed); the rest of the file runs the shipped planner.
vi.mock(
  "../../src/generation/fridge-end-leftover.js",
  async (importOriginal) => {
    const { withTheFridgeEndLeafSwitchable } = await import(
      "../support/before-c5-fridge-end-leftover.js"
    );
    return withTheFridgeEndLeafSwitchable(await importOriginal());
  },
);

const OCCURRED_AT = "2026-09-11T12:00:00.000Z";
const CATALOG = buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN));
const DECLARED_COLUMNS = declaredColumnSizes(CATALOG);
const BASELINE = readComposedRunBaseline();

/** Fails the suite rather than warning, so a sweep that drifted into refusals cannot report coverage it does not
 *  have. */
const PLACED_ROOMS_FLOOR = 200;

const ARM_FLOOR = 100;

/** Rows the owner ruled out; criterion 21 stops a later reader re-adding one without a new dated ruling. */
const NEVER_GENERATED_UPPERS = ["wall-lift", "open-shelf"];

/** Recorded witnesses outside the wider-wall re-key: wall A is the wider entered wall in every one, so every
 *  field must equal the recording. */
const UNMOVED_WITNESS_ROOMS: readonly DesignRoom[] = [
  // The recording is frozen, not the policy: these were recorded under an earlier rectangle policy and are kept.
  { shape: "L", widthMm: 6300, depthMm: 4700, heightMm: 2600 },
  { shape: "L", widthMm: 6300, depthMm: 5100, heightMm: 2600 },
  { shape: "L", widthMm: 5700, depthMm: 4100, heightMm: 2600 },
  { shape: "L", widthMm: 2700, depthMm: 1699, heightMm: 2200 },
];

/**
 * The rooms the wider-wall re-key moves, pinned whole: against the recording they can only be shown unequal, which
 * any wrong plan also is. Pinned rather than derived from the pre-state, because the re-key moves every `startMm`
 * and `endMm` (wall A's run starts at 900 mm, wall B's at 1000), so deriving it would re-implement the composer.
 * 900 x 4700 is the degenerate shape: wall A's run is empty there.
 */
const RE_KEYED_WITNESSES = [
  {
    // A wall carrying one core body reverses into itself, so two is the only shape where the reversal shows.
    name: "the reversed wall carries two core bodies (2289 x 2796)",
    room: { shape: "L", widthMm: 2289, depthMm: 2796, heightMm: 2670 },
    plan: [
      "minimumMet=true",
      "cut=2",
      "dropped=",
      "remainder=88/296",
      "floorWidths=600,700/600,600,300",
      "sink~sink~base-sink~A~900~1500~600",
      "fridge~fridge~fridge-free~A~1500~2200~700",
      "preparation~preparation~base-3drawer~B~900~1500~600",
      "hob~hob~base-hob-oven~B~1500~2100~600",
      "bottle~storage~base-bottle-cargo~B~2100~2400~300",
    ],
  },
  {
    // Wall B holds no composed slot: the pan drawer takes the module after the preparation cabinet (ADR 0123).
    // No recorded room carries that subject any more; it is witnessed in `drawer-rows.test.ts` (D15.7).
    name: "the pan drawer takes wall B's last module (3348 x 3831)",
    room: { shape: "L", widthMm: 3348, depthMm: 3831, heightMm: 2778 },
    plan: [
      "minimumMet=true",
      "cut=3",
      "dropped=",
      "remainder=548/130",
      "floorWidths=600,600,700/600,600,600,600,300",
      // ADR 0110 M1: wall A's first slot faces the sink across the corner, so it is the dishwasher.
      "dishwasher~storage~base-dishwasher~A~900~1500~600",
      "storage:A:1~storage~base-cabinet~A~1500~2100~600",
      "fridge~fridge~fridge-free~A~2100~2800~700",
      "sink~sink~base-sink~B~900~1500~600",
      "preparation~preparation~base-3drawer~B~1500~2100~600",
      "pan-drawer~storage~base-panbank~B~2100~2700~600",
      "hob~hob~base-hob-oven~B~2700~3300~600",
      "bottle~storage~base-bottle-cargo~B~3300~3600~300",
    ],
  },
  {
    // The hob carries drawers instead of its own oven because a tower stands.
    name: "a three-column block on the wider wall (3849 x 5065)",
    room: { shape: "L", widthMm: 3849, depthMm: 5065, heightMm: 3546 },
    plan: [
      "minimumMet=true",
      "cut=3",
      "dropped=",
      "remainder=448/0",
      "floorWidths=600,600,600,700/600,600,600,300,600,600,764",
      "dishwasher~storage~base-dishwasher~A~900~1500~600",
      "storage:A:1~storage~base-cabinet~A~1500~2100~600",
      "storage:A:2~storage~base-cabinet~A~2100~2700~600",
      "fridge~fridge~fridge-free~A~2700~3400~700",
      "sink~sink~base-sink~B~900~1500~600",
      "preparation~preparation~base-3drawer~B~1500~2100~600",
      "hob~hob~base-hob-2drawer~B~2100~2700~600",
      "bottle~storage~base-bottle-cargo~B~2700~3000~300",
      "column:B:0~storage~tall-oven-tower~B~3000~3600~600",
      "column:B:1~storage~tall-pantry~B~3600~4200~600",
      "column:B:2~storage~tall-pantry~B~4200~4964~764",
    ],
  },
  {
    // A re-key that moved a kept body would show as a changed `dropped` list, not only a changed position.
    name: "two roles dropped and the kitchen at its minimum (912 x 2783)",
    room: { shape: "L", widthMm: 912, depthMm: 2783, heightMm: 3539 },
    plan: [
      "minimumMet=true",
      "cut=2",
      "dropped=fridge,preparation",
      "remainder=12/282",
      "floorWidths=/600,600,300",
      "sink~sink~base-sink~B~900~1500~600",
      "hob~hob~base-hob-oven~B~1500~2100~600",
      "bottle~storage~base-bottle-cargo~B~2100~2400~300",
    ],
  },
  {
    // Wall A's run is empty, so the whole kitchen stands on wall B and the re-key reverses where the run starts.
    // The dishwasher is traded for the bottle (ADR 0110 M7/M10, plan B5 (d)); the hob carries drawers (a tower stands).
    name: "the whole kitchen on one wall (900 x 4700)",
    room: { shape: "L", widthMm: 900, depthMm: 4700, heightMm: 2600 },
    plan: [
      "minimumMet=true",
      "cut=4",
      "dropped=",
      "remainder=0/0",
      "floorWidths=/700,600,600,600,600,600",
      "fridge~fridge~fridge-free~B~900~1600~700",
      "sink~sink~base-sink~B~1600~2200~600",
      "dishwasher~storage~base-dishwasher~B~2200~2800~600",
      "preparation~preparation~base-3drawer~B~2800~3400~600",
      "hob~hob~base-hob-2drawer~B~3400~4000~600",
      "column:B:0~storage~tall-oven-tower~B~4000~4600~600",
    ],
  },
] as const satisfies readonly {
  readonly name: string;
  readonly room: DesignRoom;
  readonly plan: readonly string[];
}[];

/** Wall B wider by the entered length: decides which half of the recording a room belongs to (ADR 0120 Amendment E). */
function isWallBWider(room: DesignRoom): boolean {
  return widerEnteredWall(room) === "B";
}

/** The re-key reaches every placed room where wall B is wider; a room the composer refuses holds no bases to move,
 *  and its recorded line is the same refusal on both sides. */
function reKeyedByWave7D8(
  room: DesignRoom,
  plan: KitchenCompositionPlan,
): boolean {
  return isWallBWider(room) && plan.minimumMet;
}

function planFor(room: DesignRoom): KitchenCompositionPlan {
  return planKitchenComposition({
    room,
    runs: lShellFloorRuns(room),
    columns: DECLARED_COLUMNS,
  });
}

interface GeneratedKitchen {
  readonly design: Design;
  readonly log: GenerationLog;
}

function generated(room: DesignRoom): GeneratedKitchen | undefined {
  const result = generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
  return result.ok ? result : undefined;
}

function wallRowSteps(kitchen: GeneratedKitchen) {
  return kitchen.log.steps.filter(
    (step) => step.role === "upper" || step.role === "hood",
  );
}

function baseRowOf(kitchen: GeneratedKitchen) {
  return kitchen.design.placements.filter((placement) => placement.y0Mm === 0);
}

/** The wall row's floor as the generated design reports it (the lowest row off the floor), not a restated constant. */
function wallRowFloorMm(design: Design): number {
  const raised = design.placements
    .map((placement) => placement.y0Mm)
    .filter((y0Mm) => y0Mm > 0);
  if (raised.length === 0) {
    throw new Error("the generated design stands no row above the floor");
  }
  return Math.min(...raised);
}

function declaredHeightMm(buildId: string): number {
  const nominalHeightMm = CATALOG.get(buildId)?.nominalHeightMm;
  if (nominalHeightMm === undefined) {
    throw new Error(`the catalogue declares no height for ${buildId}`);
  }
  return nominalHeightMm;
}

/** A room's composed plan beside the recording's, whichever form holds it: the whole masked plan for a recorded
 *  witness, the masked digest for a swept room. The right side is always the pre-wave capture. */
function comparedWithTheRecording(room: DesignRoom): {
  readonly composed: string;
  readonly recorded: string;
} {
  // Compared before the dishwasher, so an inequality here is the re-key's and not the dishwasher's re-identification.
  const plan = planBeforeTheDishwasher(planFor(room));
  if (BASELINE.witnesses.has(roomKey(room))) {
    return {
      composed: canonicalPlanWithTheDoorBodyRestored(plan),
      recorded: recordedWitness(BASELINE, room),
    };
  }
  return {
    composed: digestOf(canonicalPlanBeyondThisWavesBodies(plan)),
    recorded: recordedRoom(BASELINE, room).plan,
  };
}

function hasPanDrawer(plan: KitchenCompositionPlan): boolean {
  return plan.bases.some((base) => base.buildId === PAN_DRAWER_BODY);
}

const PAN_DRAWER_WIDTH_MM = 600;

/**
 * Undoes the pan drawer where it stands without the bottle: the hob and every slot after it move one module back and
 * the door slot that paid for it is restored, so hashing to the recording proves every other field unmoved.
 * Reads the hob's wall corner to free end; a hob on the reversed wall is undone wrongly and so reported, not passed.
 */
function withThePanDrawerUndone(plan: KitchenCompositionPlan): {
  readonly plan: KitchenCompositionPlan;
  readonly restoredSlotId: string;
} {
  const hob = plan.bases.find((base) => base.role === "hob");
  if (hob === undefined) throw new Error("a pan-drawer plan composes no hob");
  const slotsAfterTheHob = plan.bases.filter(
    (base) =>
      base.wall === hob.wall &&
      isComposedStorageSlot(base) &&
      base.startMm >= hob.endMm,
  );
  const lastShifted = slotsAfterTheHob.at(-1) ?? hob;
  const restoredSlot: PlannedGenerationBase = {
    id: `storage:${hob.wall}:${String(slotsAfterTheHob.length)}`,
    role: "storage",
    buildId: DOOR_BASE_BUILD_ID,
    wall: hob.wall,
    startMm: lastShifted.endMm - PAN_DRAWER_WIDTH_MM,
    endMm: lastShifted.endMm,
    widthMm: PAN_DRAWER_WIDTH_MM,
  };
  const shifted = (base: PlannedGenerationBase): PlannedGenerationBase =>
    base === hob || slotsAfterTheHob.includes(base)
      ? {
          ...base,
          startMm: base.startMm - PAN_DRAWER_WIDTH_MM,
          endMm: base.endMm - PAN_DRAWER_WIDTH_MM,
        }
      : base;
  const bases = plan.bases.flatMap((base) => {
    if (base.buildId === PAN_DRAWER_BODY) return [];
    return base === lastShifted
      ? [shifted(base), restoredSlot]
      : [shifted(base)];
  });
  const floorWidths = bases
    .filter((base) => base.wall === hob.wall)
    .sort((left, right) => left.startMm - right.startMm)
    .map((base) => base.widthMm);
  return {
    plan: {
      ...plan,
      bases,
      floorWidthsMm: { ...plan.floorWidthsMm, [hob.wall]: floorWidths },
    },
    restoredSlotId: restoredSlot.id,
  };
}

/** Swaps the hood/upper pair the pan drawer moved back, touching nothing else, so hashing to the recorded row
 *  proves every other character unmoved. */
function wallRowWithThePanDrawerUndone(
  row: string,
  restoredSlotId: string,
): string {
  const steps = row.split("|");
  const at = steps.findIndex((step) => step.startsWith("upper:pan-drawer~"));
  const upper = steps[at]?.split("~");
  const hood = steps[at + 1]?.split("~");
  if (upper === undefined || hood?.[0] !== "hood:hob") return row;
  const restoredUpper = [...upper];
  const hoodBack = [...hood];
  restoredUpper[0] = `upper:${restoredSlotId}`;
  restoredUpper[WALL_ROW_ALONG_FIELD] = hood[WALL_ROW_ALONG_FIELD] ?? "";
  hoodBack[WALL_ROW_ALONG_FIELD] = upper[WALL_ROW_ALONG_FIELD] ?? "";
  steps.splice(at, 2, hoodBack.join("~"), restoredUpper.join("~"));
  return steps.join("|");
}

/** Where `canonicalWallRow` spells a placed step's `alongMm`: id, step body, status, placed body,
 *  wall, then along. */
const WALL_ROW_ALONG_FIELD = 5;

/** Planned ids and width as literals, so a wrong constant and a wrong composer cannot agree. */
const THRESHOLD_DRAWER_PLANNED_ID = "threshold-drawer";
const BOTTLE_PLANNED_ID = "bottle";
const BOTTLE_WIDTH_MM = 300;

/** The column a threshold drawer's price is paid in: the block's outermost, a pantry beyond the tower (ADR 0110 E5). */
const RESTORED_COLUMN_BODY = "tall-pantry";

/** ADR 0110 E: a block is at most three columns. The threshold drawer cost the bottle where the block is whole and a
 *  column where it is not. */
const WHOLE_BLOCK_COLUMNS = 3;

type ThresholdDrawerUndo =
  | { readonly kind: "none"; readonly plan: KitchenCompositionPlan }
  | {
      readonly kind: "bottleGaveWay" | "columnGaveWay";
      readonly plan: KitchenCompositionPlan;
    }
  | { readonly kind: "unruled"; readonly reason: string };

/**
 * Undoes the threshold drawer and nothing else: the drawer is removed and either the 300 mm bottle is restored (block
 * drawn 300 mm back) or the block's outermost column is (block drawn 600 mm back). A drawer the ruling does not
 * account for is answered `unruled` and reported, never undone.
 */
function withTheThresholdDrawerUndone(
  plan: KitchenCompositionPlan,
): ThresholdDrawerUndo {
  const thresholdDrawers = plan.bases.filter(
    (base) => base.id === THRESHOLD_DRAWER_PLANNED_ID,
  );
  const [thresholdDrawer] = thresholdDrawers;
  if (thresholdDrawer === undefined) return { kind: "none", plan };
  const unruled = whyTheThresholdDrawerIsUnruled(plan, thresholdDrawers);
  if (unruled !== undefined) return { kind: "unruled", reason: unruled };

  const columns = blockColumnsOn(plan, thresholdDrawer.wall);
  const standsABottle = plan.bases.some(
    (base) => base.id === BOTTLE_PLANNED_ID,
  );
  if (!standsABottle && columns.length === WHOLE_BLOCK_COLUMNS) {
    return {
      kind: "bottleGaveWay",
      plan: withTheBottleRestored(plan, thresholdDrawer),
    };
  }
  if (columns.length === 0 || columns.length + 1 > WHOLE_BLOCK_COLUMNS) {
    return {
      kind: "unruled",
      reason: `threshold drawer beside a ${String(columns.length)}-column block cannot have cost one column`,
    };
  }
  return {
    kind: "columnGaveWay",
    plan: withTheOutermostColumnRestored(plan, thresholdDrawer),
  };
}

/** The ruling's shape, checked before anything is undone: one `base-3drawer`, one module wide, read directly after
 *  the hob or the bottle and directly before the block, if any. */
function whyTheThresholdDrawerIsUnruled(
  plan: KitchenCompositionPlan,
  thresholdDrawers: readonly PlannedGenerationBase[],
): string | undefined {
  const [thresholdDrawer] = thresholdDrawers;
  if (thresholdDrawers.length !== 1 || thresholdDrawer === undefined) {
    return `${String(thresholdDrawers.length)} threshold drawers`;
  }
  if (
    thresholdDrawer.role !== "storage" ||
    thresholdDrawer.buildId !== THREE_DRAWER_BASE_BUILD_ID ||
    thresholdDrawer.widthMm !== DECLARED_COLUMNS.columnWidthMm
  ) {
    return `threshold drawer identity ${canonicalModule(thresholdDrawer)}`;
  }
  const readBefore = plan.bases.find(
    (base) =>
      base.wall === thresholdDrawer.wall &&
      base.endMm === thresholdDrawer.startMm,
  );
  if (readBefore?.role !== "hob" && readBefore?.id !== BOTTLE_PLANNED_ID) {
    return `threshold drawer read after ${readBefore?.id ?? "nothing"}`;
  }
  const firstColumn = blockColumnsOn(plan, thresholdDrawer.wall)[0];
  if (firstColumn && firstColumn.startMm !== thresholdDrawer.endMm) {
    return "threshold drawer not read immediately before the block";
  }
  return undefined;
}

/** The block's columns on one wall, corner outward: storage-role modules in the `column` band (not the fridge). */
function blockColumnsOn(
  plan: KitchenCompositionPlan,
  wall: PlannedGenerationBase["wall"],
): readonly PlannedGenerationBase[] {
  return plan.bases
    .filter(
      (base) =>
        base.wall === wall &&
        base.role === "storage" &&
        CATALOG.get(base.buildId)?.band === "column",
    )
    .sort((left, right) => left.startMm - right.startMm);
}

/** First price undone: the bottle back in the drawer's opening, the block drawn back by the difference. The slack
 *  freed is 300 mm or more, past E6.2's 200 mm absorb window, so it is the wall's remainder (ADR 0110 E6.2). */
function withTheBottleRestored(
  plan: KitchenCompositionPlan,
  thresholdDrawer: PlannedGenerationBase,
): KitchenCompositionPlan {
  const drawnBackMm = thresholdDrawer.widthMm - BOTTLE_WIDTH_MM;
  const columns = blockColumnsOn(plan, thresholdDrawer.wall);
  const outermost = columns.at(-1);
  const absorbedMm =
    outermost === undefined
      ? 0
      : outermost.widthMm - DECLARED_COLUMNS.columnWidthMm;
  const bottle: PlannedGenerationBase = {
    id: BOTTLE_PLANNED_ID,
    role: "storage",
    buildId: BOTTLE_CARGO_BUILD_ID,
    wall: thresholdDrawer.wall,
    startMm: thresholdDrawer.startMm,
    endMm: thresholdDrawer.startMm + BOTTLE_WIDTH_MM,
    widthMm: BOTTLE_WIDTH_MM,
  };
  const bases = plan.bases.map((base) => {
    if (base === thresholdDrawer) return bottle;
    if (!columns.includes(base)) return base;
    const startMm = base.startMm - drawnBackMm;
    const widthMm =
      base === outermost ? DECLARED_COLUMNS.columnWidthMm : base.widthMm;
    return { ...base, startMm, endMm: startMm + widthMm, widthMm };
  });
  return withFloorWidthsRecomputed(
    {
      ...plan,
      bases,
      remainderMm: {
        ...plan.remainderMm,
        [thresholdDrawer.wall]:
          plan.remainderMm[thresholdDrawer.wall] + absorbedMm + drawnBackMm,
      },
    },
    thresholdDrawer.wall,
  );
}

/** Second price undone: the block drawn back one module and its outermost column restored at the outer end. That
 *  column keeps the outermost column's width, which E6.2 lets absorb the run-end remainder, so it does not move. */
function withTheOutermostColumnRestored(
  plan: KitchenCompositionPlan,
  thresholdDrawer: PlannedGenerationBase,
): KitchenCompositionPlan {
  const columns = blockColumnsOn(plan, thresholdDrawer.wall);
  const outermost = columns.at(-1);
  const bases = plan.bases.flatMap((base) => {
    if (base === thresholdDrawer) return [];
    if (!columns.includes(base)) return [base];
    const startMm = base.startMm - thresholdDrawer.widthMm;
    if (base !== outermost) {
      return [
        { ...base, startMm, endMm: base.endMm - thresholdDrawer.widthMm },
      ];
    }
    const drawnBack = {
      ...base,
      startMm,
      endMm: startMm + DECLARED_COLUMNS.columnWidthMm,
      widthMm: DECLARED_COLUMNS.columnWidthMm,
    };
    const restored: PlannedGenerationBase = {
      id: `column:${thresholdDrawer.wall}:${String(columns.length)}`,
      role: "storage",
      buildId: RESTORED_COLUMN_BODY,
      wall: thresholdDrawer.wall,
      startMm: drawnBack.endMm,
      endMm: drawnBack.endMm + base.widthMm,
      widthMm: base.widthMm,
    };
    return [drawnBack, restored];
  });
  return withFloorWidthsRecomputed({ ...plan, bases }, thresholdDrawer.wall);
}

function withFloorWidthsRecomputed(
  plan: KitchenCompositionPlan,
  wall: PlannedGenerationBase["wall"],
): KitchenCompositionPlan {
  const floorWidths = plan.bases
    .filter((base) => base.wall === wall)
    .sort((left, right) => left.startMm - right.startMm)
    .map((base) => base.widthMm);
  return {
    ...plan,
    floorWidthsMm: { ...plan.floorWidthsMm, [wall]: floorWidths },
  };
}

/** Literals, so a wrong constant and a wrong leaf cannot agree. */
const DISHWASHER_PLANNED_ID = "dishwasher";
const DISHWASHER_BODY = "base-dishwasher";
const PAN_DRAWER_PLANNED_ID = "pan-drawer";
const PREPARATION_PLANNED_ID = "preparation";
const COMPOSED_SLOT_ID_PREFIX = "storage:";

/** What undoing the dishwasher found. `renamedIds` maps the id the plan carries now to the id it carried before;
 *  `shiftedMm` is each traded module's shift along the wall (now minus before), which the uppers over it follow. */
type DishwasherUndo =
  | {
      readonly kind:
        | "none"
        | "doorCabinet"
        | "drawerSwap"
        | "(b)"
        | "(d)"
        | "(c)";
      readonly plan: KitchenCompositionPlan;
      readonly renamedIds: ReadonlyMap<string, string>;
      readonly shiftedMm: ReadonlyMap<string, number>;
    }
  | { readonly kind: "unruled"; readonly reason: string };

/**
 * Undoes the dishwasher, identity only (ADR 0110 M1/M8/M9):
 *
 * - **M1** — the composed 600 mm door slot beside the sink goes back to `base-cabinet` under `storage:<wall>:<n>`,
 *   where *n* counts the composed slots before it on its wall from the corner.
 * - **M7(e)** — the dishwasher goes back to the preparation 3-drawer and the pan drawer to `pan-drawer`, role
 *   `storage`, still `base-panbank`.
 *
 * Spans, remainders and floor widths stay as composed. A dishwasher the rulings do not account for is `unruled`.
 */
function withTheDishwasherUndone(plan: KitchenCompositionPlan): DishwasherUndo {
  const dishwashers = plan.bases.filter(
    (base) => base.buildId === DISHWASHER_BODY,
  );
  const [dishwasher] = dishwashers;
  if (dishwasher === undefined) {
    return { kind: "none", plan, renamedIds: new Map(), shiftedMm: new Map() };
  }
  const unruled = whyTheDishwasherIsUnruled(plan, dishwashers);
  if (unruled !== undefined) return { kind: "unruled", reason: unruled };

  const preparation = plan.bases.find((base) => base.role === "preparation");
  if (preparation?.buildId === PAN_DRAWER_BODY) {
    return withTheDrawerSwapUndone(plan, { dishwasher, preparation });
  }
  // A dishwasher read directly after the sink on the hob's wall is a trade (ADR 0110 M7/M10), never M1's converted
  // slot; it is undone to the plan before the trade.
  const arm = dishwasherArmOf(plan);
  if (arm === "(b)" || arm === "(d)" || arm === "(c)") {
    const traded = withTheDishwasherTradeUndone(plan);
    if (traded.kind === "unruled") return traded;
    return {
      kind: traded.kind,
      plan: traded.plan,
      renamedIds: new Map(),
      shiftedMm: traded.shiftedMm,
    };
  }
  return withTheDoorCabinetRestored(plan, dishwasher);
}

function whyTheDishwasherIsUnruled(
  plan: KitchenCompositionPlan,
  dishwashers: readonly PlannedGenerationBase[],
): string | undefined {
  const [dishwasher] = dishwashers;
  if (dishwashers.length !== 1 || dishwasher === undefined) {
    return `${String(dishwashers.length)} dishwashers`;
  }
  if (
    dishwasher.id !== DISHWASHER_PLANNED_ID ||
    dishwasher.role !== "storage" ||
    dishwasher.widthMm !== DECLARED_COLUMNS.columnWidthMm
  ) {
    return `dishwasher identity ${canonicalModule(dishwasher)}`;
  }
  const sink = plan.bases.find((base) => base.role === "sink");
  if (sink === undefined || !standsBeside(plan, [dishwasher, sink])) {
    return "dishwasher not beside the sink";
  }
  return undefined;
}

/** Abutting along one wall, or each the first module from the corner on its own wall. */
function standsBeside(
  plan: KitchenCompositionPlan,
  [one, other]: readonly [PlannedGenerationBase, PlannedGenerationBase],
): boolean {
  if (one.wall === other.wall) {
    return one.endMm === other.startMm || other.endMm === one.startMm;
  }
  const isFirstFromTheCorner = (base: PlannedGenerationBase) =>
    plan.bases.every(
      (candidate) =>
        candidate.wall !== base.wall || candidate.startMm >= base.startMm,
    );
  return isFirstFromTheCorner(one) && isFirstFromTheCorner(other);
}

function withTheDoorCabinetRestored(
  plan: KitchenCompositionPlan,
  dishwasher: PlannedGenerationBase,
): DishwasherUndo {
  const slotsBeforeIt = plan.bases.filter(
    (base) =>
      base.wall === dishwasher.wall &&
      base.id.startsWith(COMPOSED_SLOT_ID_PREFIX) &&
      base.startMm < dishwasher.startMm,
  );
  const slotId = `${COMPOSED_SLOT_ID_PREFIX}${dishwasher.wall}:${String(slotsBeforeIt.length)}`;
  const restored: PlannedGenerationBase = {
    ...dishwasher,
    id: slotId,
    role: "storage",
    buildId: DOOR_BASE_BUILD_ID,
  };
  return {
    kind: "doorCabinet",
    plan: {
      ...plan,
      bases: plan.bases.map((base) => (base === dishwasher ? restored : base)),
    },
    renamedIds: new Map([[DISHWASHER_PLANNED_ID, slotId]]),
    shiftedMm: new Map(),
  };
}

function withTheDrawerSwapUndone(
  plan: KitchenCompositionPlan,
  modules: {
    readonly dishwasher: PlannedGenerationBase;
    readonly preparation: PlannedGenerationBase;
  },
): DishwasherUndo {
  const { dishwasher, preparation } = modules;
  if (
    preparation.id !== PREPARATION_PLANNED_ID ||
    dishwasher.wall !== preparation.wall ||
    !standsBeside(plan, [dishwasher, preparation])
  ) {
    return {
      kind: "unruled",
      reason: `pan-drawer preparation ${canonicalModule(preparation)} not beyond the dishwasher`,
    };
  }
  const bases = plan.bases.map((base) => {
    if (base === dishwasher) {
      return {
        ...base,
        id: PREPARATION_PLANNED_ID,
        role: "preparation" as const,
        buildId: THREE_DRAWER_BASE_BUILD_ID,
      };
    }
    if (base === preparation) {
      return { ...base, id: PAN_DRAWER_PLANNED_ID, role: "storage" as const };
    }
    return base;
  });
  return {
    kind: "drawerSwap",
    plan: { ...plan, bases },
    renamedIds: new Map([
      [DISHWASHER_PLANNED_ID, PREPARATION_PLANNED_ID],
      [PREPARATION_PLANNED_ID, PAN_DRAWER_PLANNED_ID],
    ]),
    shiftedMm: new Map(),
  };
}

/** An upper's step id names the base it stands over, so every upper over a renamed base takes the name that base had,
 *  renamed simultaneously since (e) swaps two. A traded dishwasher's upper goes with it, and every upper or hood over
 *  a module the trade moved is drawn back by that module's shift. */
function wallRowWithTheDishwasherUndone(
  row: string,
  undo: {
    readonly renamedIds: ReadonlyMap<string, string>;
    readonly shiftedMm: ReadonlyMap<string, number>;
    readonly isTraded: boolean;
  },
): string {
  return row
    .split("|")
    .filter(
      (step) =>
        !undo.isTraded || !step.startsWith(`upper:${DISHWASHER_PLANNED_ID}~`),
    )
    .map((step) => {
      const [stepId = "", ...rest] = step.split("~");
      const [kind, ...baseId] = stepId.split(":");
      const shiftedMm = undo.shiftedMm.get(baseId.join(":"));
      if (shiftedMm !== undefined) return drawnBackAlong(step, shiftedMm);
      const renamed = undo.renamedIds.get(baseId.join(":"));
      if (kind !== "upper" || renamed === undefined) return step;
      return [`upper:${renamed}`, ...rest].join("~");
    })
    .join("|");
}

function drawnBackAlong(step: string, shiftedMm: number): string {
  const fields = step.split("~");
  const alongMm = Number(fields[WALL_ROW_ALONG_FIELD]);
  if (fields[2] !== "placed" || Number.isNaN(alongMm)) return step;
  fields[WALL_ROW_ALONG_FIELD] = String(alongMm - shiftedMm);
  return fields.join("~");
}

/** E1's threshold: the plain cabinets (composed slots, pan drawer, threshold drawer) reach six with fewer than two
 *  drawers. Asked of a plan with its dishwasher undone, it names the rooms where M2's dishwasher-first withholds the
 *  threshold drawer (ADR 0110 M2). */
const LARGE_RUN_PLAIN_CABINET_COUNT = 6;
const LARGE_RUN_DRAWER_COUNT = 2;

function wouldHaveStoodAThresholdDrawer(
  planWithoutTheDishwasher: KitchenCompositionPlan,
): boolean {
  const plainCabinets = planWithoutTheDishwasher.bases.filter(
    (base) =>
      isComposedStorageSlot(base) ||
      base.id === PAN_DRAWER_PLANNED_ID ||
      base.id === THRESHOLD_DRAWER_PLANNED_ID,
  );
  const drawers = plainCabinets.filter(
    (base) =>
      base.buildId === THREE_DRAWER_BASE_BUILD_ID ||
      base.buildId === PAN_DRAWER_BODY,
  );
  return (
    plainCabinets.length >= LARGE_RUN_PLAIN_CABINET_COUNT &&
    drawers.length < LARGE_RUN_DRAWER_COUNT
  );
}

/** The plan before the dishwasher. Throws on an unruled dishwasher, for callers with nowhere to report it. */
function planBeforeTheDishwasher(
  plan: KitchenCompositionPlan,
): KitchenCompositionPlan {
  const undone = withTheDishwasherUndone(plan);
  if (undone.kind === "unruled") throw new Error(undone.reason);
  return undone.plan;
}

/** Criterion 21: where a column paid for the threshold drawer, the wall row gained exactly the drawer's own upper;
 *  removing that step proves every other character unmoved. */
function wallRowWithTheThresholdDrawerUndone(row: string): string {
  return row
    .split("|")
    .filter((step) => !step.startsWith(`upper:${THRESHOLD_DRAWER_PLANNED_ID}~`))
    .join("|");
}

describe("criterion 2 — this wave moves a body's identity and nothing else", () => {
  it("composes 7D3's plan to the millimetre wherever 7D8 did not re-key the run", () => {
    thePlannerBeforeC5();
    // Both halves of the re-key are asserted against the same recording: rooms where wall B is wider move, no other
    // room does. The outcome is collected and asserted after the sweep: a failing property shrinks toward rooms the
    // capture never saw, and `recordedRoom` throwing there would mask the real counterexample.
    const arms = { outsideTheReKey: 0, moved: 0, wallBWiderButRefused: 0 };
    const unexpected: string[] = [];
    let placed = 0;
    let bottleNormalized = 0;
    let bottleWithDrawer = 0;
    const panDrawerUndone = { outsideTheReKey: 0, moved: 0 };
    const thresholdDrawerUndone = {
      bottleGaveWay: 0,
      columnGaveWayBesideTheBottle: 0,
      columnGaveWayWithoutIt: 0,
    };
    const dishwasherUndone = {
      doorCabinet: 0,
      drawerSwap: 0,
      "(b)": 0,
      "(d)": 0,
      "(c)": 0,
    };
    let thresholdDrawersWithheldByM2 = 0;
    fc.assert(
      fc.property(recordedLRoom(), (room) => {
        const composedPlan = planFor(room);
        if (composedPlan.minimumMet) placed += 1;
        const undone = withTheThresholdDrawerUndone(composedPlan);
        if (undone.kind === "unruled") {
          unexpected.push(`${roomKey(room)} ${undone.reason}`);
          return;
        }
        // M2's re-plan needs no undo of its own: deciding the dishwasher first only withholds threshold drawers,
        // and a withheld drawer leaves the earlier plan standing (ADR 0110 M2).
        const dishwasherUndo = withTheDishwasherUndone(undone.plan);
        if (dishwasherUndo.kind === "unruled") {
          unexpected.push(`${roomKey(room)} ${dishwasherUndo.reason}`);
          return;
        }
        if (dishwasherUndo.kind !== "none") {
          dishwasherUndone[dishwasherUndo.kind] += 1;
        }
        const plan = dishwasherUndo.plan;
        if (undone.kind === "none" && wouldHaveStoodAThresholdDrawer(plan)) {
          thresholdDrawersWithheldByM2 += 1;
        }
        const hasBottle = plan.bases.some(
          (base) => base.buildId === BOTTLE_CARGO_BUILD_ID,
        );
        if (undone.kind === "bottleGaveWay") {
          thresholdDrawerUndone.bottleGaveWay += 1;
        } else if (undone.kind === "columnGaveWay" && hasBottle) {
          thresholdDrawerUndone.columnGaveWayBesideTheBottle += 1;
        } else if (undone.kind === "columnGaveWay") {
          thresholdDrawerUndone.columnGaveWayWithoutIt += 1;
        }
        const movedByTheReKey = reKeyedByWave7D8(room, plan);
        if (movedByTheReKey) arms.moved += 1;
        else if (isWallBWider(room)) arms.wallBWiderButRefused += 1;
        else arms.outsideTheReKey += 1;
        if (hasBottle) {
          bottleNormalized += 1;
          const bottles = plan.bases.filter((base) => base.id === "bottle");
          const bottle = bottles[0];
          if (
            bottles.length !== 1 ||
            bottle?.role !== "storage" ||
            bottle.buildId !== BOTTLE_CARGO_BUILD_ID ||
            bottle.widthMm !== 300
          ) {
            unexpected.push(`${roomKey(room)} invalid bottle identity`);
          }
          const drawers = plan.bases.filter(
            (base) => base.buildId === THREE_DRAWER_BASE_BUILD_ID,
          );
          if (drawers.length > 0) bottleWithDrawer += 1;
          if (drawers.some((drawer) => !isMovedByThisWave(drawer))) {
            unexpected.push(`${roomKey(room)} invalid drawer identity`);
          }
        } else {
          const standsAPanDrawer = hasPanDrawer(plan);
          if (standsAPanDrawer && movedByTheReKey) panDrawerUndone.moved += 1;
          else if (standsAPanDrawer) panDrawerUndone.outsideTheReKey += 1;
          const beforeThePanDrawer = standsAPanDrawer
            ? withThePanDrawerUndone(plan).plan
            : plan;
          const composed = digestOf(
            canonicalPlanBeyondThisWavesBodies(beforeThePanDrawer),
          );
          const recorded = recordedRoom(BASELINE, room).plan;
          if ((composed !== recorded) !== movedByTheReKey) {
            unexpected.push(
              `${roomKey(room)} ${movedByTheReKey ? "should have moved" : "should not have moved"}`,
            );
          }
        }
      }),
      { numRuns: BASELINE_RUNS, seed: BASELINE_SEED },
    );

    expect(unexpected).toEqual([]);
    expect(placed).toBeGreaterThanOrEqual(PLACED_ROOMS_FLOOR);
    // The draw is the recording's, so the split is asserted exactly; a room the capture never saw makes
    // `recordedRoom` throw.
    expect(arms).toEqual({
      outsideTheReKey: 135,
      moved: 82,
      wallBWiderButRefused: 23,
    });
    expect(bottleNormalized).toBeGreaterThan(0);
    expect(bottleWithDrawer).toBeGreaterThan(0);
    expect(panDrawerUndone).toEqual({ outsideTheReKey: 12, moved: 7 });
    // M2 re-plans every threshold-drawer room of this draw, so the undo is never reached here; the count below
    // proves the zero is not an empty draw (ADR 0110 M2).
    expect(thresholdDrawerUndone).toEqual({
      bottleGaveWay: 0,
      columnGaveWayBesideTheBottle: 0,
      columnGaveWayWithoutIt: 0,
    });
    expect(thresholdDrawersWithheldByM2).toBe(8);
    // Arms (b), (d) and (c) are the dishwasher trades of ADR 0110 M7/M10.
    expect(dishwasherUndone).toEqual({
      doorCabinet: 87,
      drawerSwap: 32,
      "(b)": 14,
      "(d)": 2,
      "(c)": 13,
    });
  });

  it.each(UNMOVED_WITNESS_ROOMS)(
    "renders back to 7D3's own plan once the door body is restored, in %o",
    (room) => {
      const plan = planBeforeTheDishwasher(planFor(room));
      if (plan.bases.some((base) => base.buildId === BOTTLE_CARGO_BUILD_ID)) {
        const recorded = parseRecordedCanonicalPlan(
          recordedWitness(BASELINE, room),
        );
        const identity = (base: {
          readonly id: string;
          readonly role: string;
          readonly buildId: string;
          readonly widthMm: number;
        }) => [base.id, base.role, base.buildId, base.widthMm].join("~");
        expect(
          plan.bases
            .filter((base) => base.role !== "storage")
            .map((base) =>
              identity({
                ...base,
                buildId: isMovedByThisWave(base)
                  ? DOOR_BASE_BUILD_ID
                  : base.buildId,
              }),
            )
            .sort(),
        ).toEqual(
          recorded.bases
            .filter((base) => base.role !== "storage")
            .map((base) =>
              identity({
                ...base,
                buildId:
                  base.role === "preparation" || base.id.startsWith("storage:")
                    ? DOOR_BASE_BUILD_ID
                    : base.buildId,
              }),
            )
            .sort(),
        );
      } else {
        // Restoring the door body to the two modules the wave may re-body must reproduce the recorded plan exactly,
        // so no other field or build id moved.
        expect(canonicalPlanWithTheDoorBodyRestored(plan)).toBe(
          recordedWitness(BASELINE, room),
        );
      }
    },
  );

  it.each(UNMOVED_WITNESS_ROOMS)(
    "leaves every block column and the hob exactly as 7D3 composed them, in %o",
    (room) => {
      // A block column carries `role: "storage"` deliberately, so a rule reaching its subject by role would sweep
      // the block in. The dishwasher is undone first: read raw, it is sought in the recording under an id the
      // recording never composed.
      const plan = planBeforeTheDishwasher(planFor(room));
      if (plan.bases.some((base) => base.buildId === BOTTLE_CARGO_BUILD_ID)) {
        const recorded = parseRecordedCanonicalPlan(
          recordedWitness(BASELINE, room),
        );
        const recordedUntouchableBodies = recorded.bases
          .filter(
            (base) =>
              base.role === "hob" ||
              (base.role === "storage" && base.id.startsWith("column:")),
          )
          .map((base) => [base.id, base.role, base.buildId, base.widthMm]);
        const currentUntouchableBodies = plan.bases
          .filter(
            (base) =>
              base.role === "hob" ||
              (base.role === "storage" && base.id.startsWith("column:")),
          )
          .map((base) => [base.id, base.role, base.buildId, base.widthMm]);
        expect(currentUntouchableBodies).toEqual(recordedUntouchableBodies);
      } else {
        const recorded = recordedWitness(BASELINE, room);
        const untouchable = plan.bases.filter(
          (base) => !isMovedByThisWave(base),
        );

        expect(untouchable.length).toBeGreaterThan(0);
        for (const base of untouchable) {
          expect(recorded, base.id).toContain(canonicalModule(base));
        }
      }
    },
  );

  it.each(UNMOVED_WITNESS_ROOMS)(
    "moves a body at all, and only in a module it is allowed to, in %o",
    (room) => {
      // An empty change also renders back to the recorded plan, so the drawers must exist. The constant must differ
      // from the door id: a count of bodies equal to it is every door cabinet if it is set to the door id.
      const drawers = planFor(room).bases.filter(
        (base) => base.buildId === THREE_DRAWER_BASE_BUILD_ID,
      );

      expect(THREE_DRAWER_BASE_BUILD_ID).not.toBe(DOOR_BASE_BUILD_ID);
      expect(drawers.length).toBeGreaterThan(0);
      for (const drawer of drawers) {
        expect(isMovedByThisWave(drawer), drawer.id).toBe(true);
      }
    },
  );

  it.each(RE_KEYED_WITNESSES)(
    "composes the re-keyed plan whole, with $name",
    ({ room, plan }) => {
      // Real build ids, unmasked: the door-body masking that makes the recording comparable would hide half of what
      // these witnesses show.
      expect(canonicalPlan(planFor(room)).split("|")).toEqual(plan);
    },
  );

  it.each(RE_KEYED_WITNESSES)(
    "moved against 7D3's recording rather than agreeing with it, with $name",
    ({ room }) => {
      const { composed, recorded } = comparedWithTheRecording(room);

      expect(composed).not.toBe(recorded);
    },
  );

  it("sweeps rooms that hold composed slots, block columns and storage on both walls", () => {
    // The draw cannot be widened (seed and run count are the recording's), so the wall-B composed-slot sample floor
    // is asserted in `qa-7d8-the-run-follows-the-wider-wall.adversarial.test.ts` (ADR 0123) and the exact split here.
    const arms = {
      composedSlots: 0,
      composedSlotsBeforeTheDishwasher: 0,
      blockColumns: 0,
      wallBStorage: 0,
      wallBStorageBeforeTheDishwasher: 0,
    };
    fc.assert(
      fc.property(recordedLRoom(), (room) => {
        const composedPlan = planFor(room);
        const bases = composedPlan.bases;
        const slots = bases.filter(isComposedStorageSlot);
        if (slots.length > 0) arms.composedSlots += 1;
        const slotsBeforeTheDishwasher = planBeforeTheDishwasher(
          composedPlan,
        ).bases.filter(isComposedStorageSlot);
        if (slotsBeforeTheDishwasher.length > 0) {
          arms.composedSlotsBeforeTheDishwasher += 1;
        }
        if (slotsBeforeTheDishwasher.some((slot) => slot.wall === "B")) {
          arms.wallBStorageBeforeTheDishwasher += 1;
        }
        if (slots.some((slot) => slot.wall === "B")) arms.wallBStorage += 1;
        if (
          bases.some(
            (base) =>
              base.role === "storage" &&
              !isComposedStorageSlot(base) &&
              CATALOG.get(base.buildId)?.band === "column",
          )
        ) {
          arms.blockColumns += 1;
        }
      }),
      { numRuns: BASELINE_RUNS, seed: BASELINE_SEED },
    );

    // Exact counts of this fixed draw. The composed-slot sample floor is asserted over the policy-wide draw in
    // `qa-7d4-composed-bodies.adversarial.test.ts`. The dishwasher's conversion (ADR 0110 M1) is the only slot lost:
    // with it undone the count returns to its earlier value.
    expect(arms.composedSlots).toBe(70);
    expect(arms.composedSlotsBeforeTheDishwasher).toBe(91);
    expect(arms.blockColumns).toBeGreaterThanOrEqual(ARM_FLOOR);
    expect(arms.wallBStorage).toBe(45);
    expect(arms.wallBStorageBeforeTheDishwasher).toBe(55);
  });
});

describe("criterion 21 — the wall row is asserted, not composed", () => {
  it("reproduces 7D3's wall row character for character wherever 7D8 did not re-key", () => {
    thePlannerBeforeC5();
    // Outside the re-key no character of the wall row moves; inside it the row follows the bases. A row that changed
    // where the floor did not means a body composed an upper.
    const arms = { outsideTheReKey: 0, moved: 0, refused: 0 };
    const unexpected: string[] = [];
    let withUppers = 0;
    let panDrawerRowsUndone = 0;
    let thresholdDrawerRowsUndone = 0;
    let dishwasherRowsUndone = 0;
    fc.assert(
      fc.property(recordedLRoom(), (room) => {
        const kitchen = generated(room);
        const recorded = recordedRoom(BASELINE, room).wallRow;
        if (!kitchen) {
          arms.refused += 1;
          if (recorded !== undefined)
            unexpected.push(`${roomKey(room)} refused`);
          return;
        }
        const undone = withTheThresholdDrawerUndone(twoWallPlanOf(kitchen.log));
        if (undone.kind === "unruled") {
          unexpected.push(`${roomKey(room)} ${undone.reason}`);
          return;
        }
        // The dishwasher's upper names the base beneath it, so the row takes the renamed ids back below.
        const dishwasherUndo = withTheDishwasherUndone(undone.plan);
        if (dishwasherUndo.kind === "unruled") {
          unexpected.push(`${roomKey(room)} ${dishwasherUndo.reason}`);
          return;
        }
        const planBeforeTheThresholdDrawer = dishwasherUndo.plan;
        const hasBottle = planBeforeTheThresholdDrawer.bases.some(
          (base) => base.buildId === BOTTLE_CARGO_BUILD_ID,
        );
        if (wallRowSteps(kitchen).length > 0) withUppers += 1;
        const movedByTheReKey = reKeyedByWave7D8(
          room,
          twoWallPlanOf(kitchen.log),
        );
        if (movedByTheReKey) arms.moved += 1;
        else arms.outsideTheReKey += 1;
        if (hasBottle) {
          const attempted = new Set(
            wallRowSteps(kitchen).map((step) => step.id),
          );
          for (const base of kitchen.log.plan.bases) {
            const reachesTheWallRow =
              declaredHeightMm(base.buildId) > wallRowFloorMm(kitchen.design);
            const upperId = `${base.role === "hob" ? "hood" : "upper"}:${base.id}`;
            expect(attempted.has(upperId), `${roomKey(room)} ${upperId}`).toBe(
              !reachesTheWallRow,
            );
          }
        } else {
          // Only a column-paid threshold drawer reaches this branch (where the bottle gave way it stands again
          // above); its one upper is removed before the pan-drawer swap.
          const standsAThresholdDrawer = undone.kind === "columnGaveWay";
          if (standsAThresholdDrawer) thresholdDrawerRowsUndone += 1;
          if (dishwasherUndo.kind !== "none") dishwasherRowsUndone += 1;
          const rowBeforeTheDishwasher = wallRowWithTheDishwasherUndone(
            canonicalWallRow(kitchen),
            {
              renamedIds: dishwasherUndo.renamedIds,
              shiftedMm: dishwasherUndo.shiftedMm,
              isTraded: ["(b)", "(d)", "(c)"].includes(dishwasherUndo.kind),
            },
          );
          const row = standsAThresholdDrawer
            ? wallRowWithTheThresholdDrawerUndone(rowBeforeTheDishwasher)
            : rowBeforeTheDishwasher;
          const standsAPanDrawer = hasPanDrawer(planBeforeTheThresholdDrawer);
          if (standsAPanDrawer) panDrawerRowsUndone += 1;
          const composed = digestOf(
            standsAPanDrawer
              ? wallRowWithThePanDrawerUndone(
                  row,
                  withThePanDrawerUndone(planBeforeTheThresholdDrawer)
                    .restoredSlotId,
                )
              : row,
          );
          if ((composed !== recorded) !== movedByTheReKey) {
            unexpected.push(
              `${roomKey(room)} ${movedByTheReKey ? "should have moved" : "should not have moved"}`,
            );
          }
        }
      }),
      { numRuns: BASELINE_RUNS, seed: BASELINE_SEED },
    );

    expect(unexpected).toEqual([]);
    expect(withUppers).toBeGreaterThanOrEqual(PLACED_ROOMS_FLOOR);
    expect(arms).toEqual({ outsideTheReKey: 127, moved: 82, refused: 31 });
    expect(panDrawerRowsUndone).toBe(19);
    expect(thresholdDrawerRowsUndone).toBe(0);
    expect(dishwasherRowsUndone).toBe(28);
  });

  it("stands a hood over every hob and nothing over a body that reaches the wall row", () => {
    let hoods = 0;
    let bodiesReachingTheWallRow = 0;
    fc.assert(
      fc.property(recordedLRoom(), (room) => {
        const kitchen = generated(room);
        if (!kitchen) return;
        const floorMm = wallRowFloorMm(kitchen.design);
        const attempted = new Set(wallRowSteps(kitchen).map((step) => step.id));

        for (const base of kitchen.log.plan.bases) {
          const reachesTheWallRow = declaredHeightMm(base.buildId) > floorMm;
          const upperId = `${base.role === "hob" ? "hood" : "upper"}:${base.id}`;
          if (reachesTheWallRow) bodiesReachingTheWallRow += 1;
          if (base.role === "hob" && attempted.has(upperId)) hoods += 1;

          expect(attempted.has(upperId), `${roomKey(room)} ${upperId}`).toBe(
            !reachesTheWallRow,
          );
        }
      }),
      { numRuns: BASELINE_RUNS, seed: BASELINE_SEED },
    );

    expect(hoods).toBeGreaterThanOrEqual(PLACED_ROOMS_FLOOR);
    // The fridge and the block's columns are what reach it, counted per body rather than per room.
    expect(bodiesReachingTheWallRow).toBeGreaterThanOrEqual(ARM_FLOOR);
  });

  it("generates no lift and no open shelf, and logs no width command for an upper", () => {
    fc.assert(
      fc.property(recordedLRoom(), (room) => {
        const kitchen = generated(room);
        if (!kitchen) return;

        for (const buildId of NEVER_GENERATED_UPPERS) {
          expect(
            kitchen.design.placements.map(
              (placement) => placement.body.buildId,
            ),
            roomKey(room),
          ).not.toContain(buildId);
        }
        expect(
          wallRowSteps(kitchen).flatMap((step) =>
            step.commands.filter((command) => command.type === "set_width"),
          ),
          roomKey(room),
        ).toEqual([]);
      }),
      { numRuns: BASELINE_RUNS, seed: BASELINE_SEED },
    );
  });

  it("logs a refused upper as not placed and removes nothing beneath it", () => {
    // The one clause of criterion 21 no accepting-probe sweep reaches. The probe refuses every body the catalogue
    // declares in the wall band, so a third wall-row body would still be refused.
    const ordinary = generated(KITCHEN_L_DESIGN.room);
    const ledger = createLeaseLedger();
    const refusingEveryUpper: BodyProbeFactory = (cabinetDepthMm) => {
      const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
      const delegate = createFakeProbe({ catalog });
      ledger.take();
      return createBodyProbeLease(
        {
          measure: (request) => {
            const measured = delegate.measure(request);
            const band = catalog.get(request.buildId)?.band;
            return band && normaliseBand(band) === "wall"
              ? { ...measured, carcassWidthM: measured.carcassWidthM + 0.1 }
              : measured;
          },
        },
        ledger.release,
      );
    };
    const refused = generateKitchen({
      room: KITCHEN_L_DESIGN.room,
      occurredAt: OCCURRED_AT,
      probeAt: refusingEveryUpper,
    });

    expect(refused.ok).toBe(true);
    if (!refused.ok || !ordinary) {
      throw new Error("the reference room composed no kitchen");
    }
    expect(wallRowSteps(refused).length).toBeGreaterThan(0);
    expect(wallRowSteps(refused).map((step) => step.status)).toEqual(
      wallRowSteps(refused).map(() => "not_placed"),
    );
    expect(baseRowOf(refused)).toStrictEqual(baseRowOf(ordinary));
    expect(ledger).toMatchObject({ taken: 1, released: 1 });
  });
});
