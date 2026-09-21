// M7 wave 7D4 slice S4 — criteria 2 and 21, the two that say *deep-equal to 7D3's*.
//
// **Neither can be proved against this wave's own output**, and that is the whole difficulty of the
// slice. A plan compared with a plan rebuilt from the module that composed it agrees with itself
// whatever that module does; a width neutrality asserted that way is a tautology wearing a
// criterion's number. So both properties run against a **recording** of 7D3's composition, captured
// by restoring this wave's two production modules to their pre-wave bytes and sweeping the same
// rooms. `tests/support/composed-run-baseline.ts` carries the method and
// `7d3-composition-baseline.json` carries the result.
//
// **What the recording is asked.** Criterion 2: for every room, every planned base's `id`, `role`,
// `wall`, `startMm`, `endMm` and `widthMm`, the floor widths, the remainders, the dropped list and
// the chosen wall cut are 7D3's, and the **only** difference anywhere is `buildId`, on the
// preparation role and on the storage run's own slots. Criterion 21: the wall row is 7D3's to the
// character — this wave composes no upper at all — and no lift or open shelf stands in any generated
// design.
//
// **What the recording cannot say about the half M7 wave 7D8 moved, and what stands in for it.** The
// re-key moves 82 of the 240 recorded rooms, and for those the comparison below degenerates into
// *the digest changed* — which any wrong plan also satisfies. So the moved half is pinned instead:
// `RE_KEYED_WITNESSES` holds five whole plans, chosen across the shapes those 82 take, and
// `7d8-re-keyed-baseline.json` records the rest of them for the wave that changes this next.
//
// A storage slot is reached through `isComposedStorageSlot` and never through `role === "storage"` or a
// width: the block's full-height columns carry that role deliberately (ADR 0110 E5.2), and the two
// naive scopings are wrong on 32.8 % and 14.9 % of placed rooms against output that is right (D12).
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

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
import {
  createFakeProbe,
  createFakeProbeFactory,
  createLeaseLedger,
} from "../support/fake-probe.js";
import {
  PAN_DRAWER_BODY,
  parseRecordedCanonicalPlan,
} from "../support/pre-width-run-recording.js";

const OCCURRED_AT = "2026-09-11T12:00:00.000Z";
const CATALOG = buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN));
const DECLARED_COLUMNS = declaredColumnSizes(CATALOG);
const BASELINE = readComposedRunBaseline();

/** Measured at this seed: 209 of the 240 drawn rooms compose a kitchen — 87.1 %, against risk 14's
 *  89.0 % for the same arm under `fc.integer`. The floor **fails** the suite rather than warning, so
 *  a sweep that drifted into refusals cannot report coverage it does not have. */
const PLACED_ROOMS_FLOOR = 200;

/** Every arm below is floored at the hundred samples risk 14's table is written in terms of. */
const ARM_FLOOR = 100;

/** The two rows the owner ruled out the same day they were planned (D8). Neither has ever been
 *  generated, and criterion 21 exists so the next reader of D8's struck text does not re-add one
 *  without a new dated ruling. */
const NEVER_GENERATED_UPPERS = ["wall-lift", "open-shelf"];

/** The four recorded witnesses **outside** M7 wave 7D8's re-key: wall A is the wider entered wall in
 *  every one, so criterion 5's *"nothing outside P1 moves"* is what they assert, field by field,
 *  against 7D3's recording. */
const UNMOVED_WITNESS_ROOMS: readonly DesignRoom[] = [
  // Recorded under the pre-7A3 rectangle and kept: the recording is frozen, not the policy (M7 7A3).
  { shape: "L", widthMm: 6300, depthMm: 4700, heightMm: 2600 },
  { shape: "L", widthMm: 6300, depthMm: 5100, heightMm: 2600 },
  { shape: "L", widthMm: 5700, depthMm: 4100, heightMm: 2600 },
  { shape: "L", widthMm: 2700, depthMm: 1699, heightMm: 2200 },
];

/**
 * The rooms M7 wave 7D8 **does** move, pinned whole.
 *
 * **The sweep below can only say of these that the digest changed, and any wrong plan says that
 * too.** 82 of the 240 recorded rooms are re-keyed, and the comparison against 7D3's recording turns
 * into an inequality for every one of them — 34 % of the recording, and the half this wave exercised
 * hardest. These pins are what makes the other half of the claim reviewable by a person: not *it
 * moved* but *it moved to this*.
 *
 * **Why pinned rather than derived from the recorded pre-state.** The re-key is not a letter swap.
 * Wall A's run starts at 900 mm and wall B's at 1000, and the two corner reaches differ, so
 * exchanging the walls moves every `startMm` and `endMm` in the plan. A test that computed the
 * post-state from the pre-state would be re-implementing the composer beside it — a tautology with
 * no marker on it, which is worse than the inequality it replaced.
 *
 * **Chosen for shape coverage across the 82**, because 900 x 4700 is the degenerate case: wall A's
 * run is empty there, so it says nothing about a kitchen that stands on both walls. Every room here
 * except that one is drawn by the recorded sweep itself, so what a pin adds is exactly the field
 * detail the digest threw away.
 */
const RE_KEYED_WITNESSES = [
  {
    // Two core bodies on the reversed wall, which is the only shape where the reversal is
    // **visible**: wall A carries sink then fridge from the corner outward, so the run reads fridge
    // then sink from its free end. A wall carrying one core body is reversed into itself.
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
    // Composed slots on the narrower wall and the drawer group astride the hob on the wider one.
    // **Moved from 3367 x 3506 in M7 wave 7D5 S1**, where the bottle took wall B's only slot.
    //
    // **Re-pinned in M7 wave 7D5 S2, and the subject it was chosen for has left this room (owner
    // ruling Q-H6a = A; ADR 0123).** Until S2 wall B's one remaining module after the bottle was the
    // post-hob drawer slot, so a slot lookup on the wrong letter had somewhere wrong to land here. The
    // pan drawer now stands immediately before the hob and takes that module, so wall B holds no
    // composed slot and the post-hob drawer is gone — the rule's own answer, not a regression. No
    // recorded room can carry that subject any more: its physical-wall-B population is 0 across the
    // approved policy. It is witnessed past the policy, declared, in `drawer-rows.test.ts` (D15.7,
    // 4100 x 6100) and `qa-7d8-the-run-follows-the-wider-wall.adversarial.test.ts` (7c). This pin
    // keeps the room as what it now is: every core module where S1 left it, the pan drawer between
    // the preparation cabinet and the hob, and the hob and bottle one module further along.
    name: "the pan drawer takes wall B's last module (3348 x 3831)",
    room: { shape: "L", widthMm: 3348, depthMm: 3831, heightMm: 2778 },
    plan: [
      "minimumMet=true",
      "cut=3",
      "dropped=",
      "remainder=548/130",
      "floorWidths=600,600,700/600,600,600,600,300",
      // 7D5b S1 / ADR 0110 M1: was `storage:A:0~storage~base-cabinet~…`. Wall A's first slot from the
      // corner faces the sink across it, so M1 converts it; span, role and every other line unmoved.
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
    // The block, three columns of it, standing at wall B's free end because the run ends there (ADR
    // 0110 Amendment I) — with the hob carrying drawers instead of its own oven because a tower
    // stands, and three door slots filling wall A ahead of the fridge.
    name: "a three-column block on the wider wall (3849 x 5065)",
    room: { shape: "L", widthMm: 3849, depthMm: 5065, heightMm: 3546 },
    plan: [
      "minimumMet=true",
      "cut=3",
      "dropped=",
      "remainder=448/0",
      "floorWidths=600,600,600,700/600,600,600,300,600,600,764",
      // 7D5b S1 / ADR 0110 M1: was `storage:A:0~storage~base-cabinet~…`, converted across the corner
      // as in the room above; nothing else in this plan moved.
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
    // The drop order reached, twice: wall A is 912 mm, which leaves it no run at all, and what wall B
    // can seat is the sink and the hob. A re-key that moved a *kept* body would show here as a
    // changed `dropped` list rather than only as a changed position.
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
    // The fifth recorded witness, and the degenerate shape: wall A's run is empty, so the whole
    // kitchen stands on wall B and the re-key reverses which end of it the run starts at. Two things
    // follow and both are below.
    //
    // 1. **The run turned around.** 7D3 recorded `storage, storage, hob, preparation, sink, fridge`
    //    from the corner outward; the run now reads from wall A's free end, so the same order stands
    //    corner-outward as `fridge, sink, preparation, hob, ...`.
    // 2. **The block followed the run onto wall B** (ADR 0110 Amendment I; 7D8 criterion 10). The hob
    //    now ends the run on the free-end wall, which is E3's clause 2, so the two modules the
    //    recording holds as composed storage slots are a tall oven tower and a pantry column — and
    //    the hob carries drawers instead of its own oven, because a tower stands. Since M7 wave 7D5
    //    S1 the 300 mm bottle after the hob costs the pantry column and the tower remains.
    name: "the whole kitchen on one wall (900 x 4700)",
    room: { shape: "L", widthMm: 900, depthMm: 4700, heightMm: 2600 },
    plan: [
      "minimumMet=true",
      "cut=4",
      "dropped=",
      "remainder=0/300",
      "floorWidths=/700,600,600,600,300,600",
      "fridge~fridge~fridge-free~B~900~1600~700",
      "sink~sink~base-sink~B~1600~2200~600",
      "preparation~preparation~base-3drawer~B~2200~2800~600",
      "hob~hob~base-hob-2drawer~B~2800~3400~600",
      "bottle~storage~base-bottle-cargo~B~3400~3700~300",
      "column:B:0~storage~tall-oven-tower~B~3700~4300~600",
    ],
  },
] as const satisfies readonly {
  readonly name: string;
  readonly room: DesignRoom;
  readonly plan: readonly string[];
}[];

/** Wall B wider by the length the customer entered — M7 wave 7D8's key, and the only thing that
 *  decides which half of the recording a room belongs to (ADR 0120 Amendment E). */
function isWallBWider(room: DesignRoom): boolean {
  return widerEnteredWall(room) === "B";
}

/** Is this a room whose composition 7D8 moved? The re-key runs the reading order along the wider
 *  entered wall, so it reaches every **placed** room where wall B is the wider one and no other: a
 *  room the policy admits but the composer refuses holds no bases to move, and its recorded line is
 *  the same refusal on both sides. */
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

/** The wall row's floor as the generated design reports it — the lowest row standing off the floor —
 *  so the suppression rule below reads the boundary back instead of restating a generation-side
 *  constant. */
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

/**
 * A witness room's composed plan beside what 7D3 recorded for it, **in whichever of the recording's
 * two forms holds that room**: the whole masked plan for one of the five rooms recorded as a
 * witness, the masked digest for one of the 240 rooms the recorded sweep drew. Either way the right
 * side is the pre-wave capture and never this wave's own output.
 */
function comparedWithTheRecording(room: DesignRoom): {
  readonly composed: string;
  readonly recorded: string;
} {
  // 7D5b S1 / ADR 0110 M1/M8/M9: compared before the dishwasher, so an inequality here is the re-key's
  // and never the dishwasher's own re-identification.
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

/** One storage module: the pan drawer's width, and so the width of the slot it took. */
const PAN_DRAWER_WIDTH_MM = 600;

/**
 * **7D5 S2, criterion 2 restated under owner rulings Q-H6b and Q-H6c.** Where the pan drawer stands
 * without the bottle, the plan is 7D3's with exactly one change: a 600 mm pan drawer immediately
 * before the hob, the hob and every slot after it one module further along, and the hob's wall's
 * outermost slot gone to pay for it — never a tall column (Q-H6c), because the bottle gave way
 * instead. This undoes that change and nothing else, so the result hashing to 7D3's recorded digest
 * proves every other field of the plan unmoved; any other difference, or a pan drawer paid for some
 * other way, leaves the digest unequal and the room reported.
 *
 * It reads the hob's wall forward, corner to free end, as the suffix wall is laid out; a hob on the
 * reversed prefix wall would be undone wrongly and reported rather than passed.
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

/**
 * **7D5 S2, criterion 21 restated under Q-H6b and Q-H6c.** The wall row moved in those rooms because
 * the bases beneath it did, and in one way only: 7D3's hood over the hob and upper over the slot after
 * it are now an upper over the pan drawer and the hood one module further along. No upper was added,
 * lost or re-bodied. This swaps that one adjacent pair back — the hood to the pan drawer's opening,
 * the pan drawer's upper renamed to the restored slot's and stood where the hood was — and touches
 * nothing else, so the result hashing to 7D3's recorded row proves every other character unmoved.
 */
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

/** 7D5 S3 / Q-H5: the threshold drawer's and the bottle's planned ids, spelled as literals so a wrong
 *  constant and a wrong composer cannot agree. */
const THRESHOLD_DRAWER_PLANNED_ID = "threshold-drawer";
const BOTTLE_PLANNED_ID = "bottle";
const BOTTLE_WIDTH_MM = 300;

/** The column a threshold drawer's price is paid in: the block's outermost, which beyond the tower is
 *  always a pantry (ADR 0110 E5). */
const RESTORED_COLUMN_BODY = "tall-pantry";

/** ADR 0110 E: a block is at most three columns. Q-H5's two prices split on it exactly — over the
 *  approved 10 mm grid the bottle gave way in the 6 195 threshold-drawer rooms whose block is whole,
 *  and a column (3 → 2) in the 9 600 whose block is not (owner's measurement, 2026-09-21). */
const WHOLE_BLOCK_COLUMNS = 3;

/** What undoing Q-H5 found in a plan, and the plan 7D5 S2 composed before it. */
type ThresholdDrawerUndo =
  | { readonly kind: "none"; readonly plan: KitchenCompositionPlan }
  | {
      readonly kind: "bottleGaveWay" | "columnGaveWay";
      readonly plan: KitchenCompositionPlan;
    }
  | { readonly kind: "unruled"; readonly reason: string };

/**
 * **7D5 S3 / Q-H5 (owner ruling 2026-09-21), criteria 2 and 21 restated.** Where the plain cabinets
 * reach six with fewer than two drawers, one 600 mm `threshold-drawer` stands after the hob — in the
 * bottle's place where that costs no tall column, and otherwise after the bottle at the cost of the
 * block's outermost column. This undoes exactly that and nothing else, returning the plan S2 composed:
 * the drawer removed, and either the 300 mm bottle stood back in its opening with the block drawn
 * 300 mm back toward it, or the block drawn 600 mm back with its outermost column restored. What that
 * plan then goes through is S2's own normalisation, unchanged — so a room S2 would have hashed to
 * 7D3's recording is still hashed, byte for byte.
 *
 * A threshold drawer the ruling does not account for — a second one, one not standing immediately
 * after the hob or the bottle, one not followed directly by the block, or one whose price cannot be
 * restored as one column — is answered `unruled` and reported, never undone.
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

/** The ruling's shape, checked before anything is undone: one drawer, `base-3drawer`, one module wide,
 *  read immediately after the hob or the bottle and immediately before the block, if any. */
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

/** The block's columns on one wall, corner outward: the storage-role modules the catalogue declares
 *  in its `column` band, which excludes the fridge by role. */
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

/** Q-H5's first price undone: the bottle back in the drawer's opening, and the block drawn back by the
 *  difference with its outermost column at one module. The slack that frees is 300 mm or more, past
 *  E6.2's 200 mm absorb window, so it is the wall's remainder. */
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

/** Q-H5's second price undone: the block drawn back by one module into the drawer's opening, and the
 *  column it cost restored at its outer end — carrying the outermost column's width, which E6.2 lets
 *  absorb the run-end remainder, so the remainder itself does not move. */
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

/** 7D5 S3 / Q-H5, criterion 21: where a column paid for the threshold drawer, the wall row gained
 *  exactly the drawer's own upper and nothing else — the column it cost reached the wall row and
 *  stood none. This removes that one step, so the result hashing to 7D3's recorded row (through S2's
 *  pan-drawer swap where one stands) proves every other character unmoved. */
// ---------------------------------------------------------------------------------------------
// 7D5b S1 / ADR 0110 M1/M8/M9 — the dishwasher, undone before anything else is compared.
// ---------------------------------------------------------------------------------------------

/** The dishwasher's planned id and body, literals so a wrong constant and a wrong leaf cannot agree. */
const DISHWASHER_PLANNED_ID = "dishwasher";
const DISHWASHER_BODY = "base-dishwasher";
const PAN_DRAWER_PLANNED_ID = "pan-drawer";
const PREPARATION_PLANNED_ID = "preparation";
const COMPOSED_SLOT_ID_PREFIX = "storage:";

/** What undoing the dishwasher found, the plan without it, and the planned ids it renamed (the id the
 *  plan carries now → the id it carried before S1), which the wall row's step ids follow. */
type DishwasherUndo =
  | {
      readonly kind: "none" | "doorCabinet" | "drawerSwap";
      readonly plan: KitchenCompositionPlan;
      readonly renamedIds: ReadonlyMap<string, string>;
    }
  | { readonly kind: "unruled"; readonly reason: string };

/**
 * **7D5b S1 / ADR 0110 M1/M8/M9, criteria 2 and 21 restated.** The dishwasher is a re-identification
 * and never a width change, so undoing it touches identity only:
 *
 * - **M1** — a 600 mm composed door slot beside the sink became `dishwasher`. It goes back to
 *   `base-cabinet` under the slot id it had: `storage:<wall>:<n>`, where *n* counts the composed
 *   slots standing before it on its wall from the corner, as the storage run numbers them.
 * - **M7(e)** — the preparation 3-drawer beside the sink became `dishwasher` and the pan drawer beyond
 *   it took the preparation id and role (M9). The dishwasher goes back to the preparation 3-drawer,
 *   and the pan drawer back to `pan-drawer`, role `storage`, still `base-panbank`.
 *
 * Every span, remainder and floor width is left as composed: the result hashing to the recording is
 * what proves S1 moved nothing else. A dishwasher the rulings do not account for — a second one, one
 * at another width or role, one not beside the sink — is answered `unruled` and reported.
 */
function withTheDishwasherUndone(plan: KitchenCompositionPlan): DishwasherUndo {
  const dishwashers = plan.bases.filter(
    (base) => base.buildId === DISHWASHER_BODY,
  );
  const [dishwasher] = dishwashers;
  if (dishwasher === undefined) {
    return { kind: "none", plan, renamedIds: new Map() };
  }
  const unruled = whyTheDishwasherIsUnruled(plan, dishwashers);
  if (unruled !== undefined) return { kind: "unruled", reason: unruled };

  const preparation = plan.bases.find((base) => base.role === "preparation");
  if (preparation?.buildId === PAN_DRAWER_BODY) {
    return withTheDrawerSwapUndone(plan, { dishwasher, preparation });
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
  };
}

/** Criterion 21's half of the undo: an upper's step id names the base it stands over, so every upper
 *  over a renamed base takes the name that base had. Renamed simultaneously, since (e) swaps two. */
function wallRowWithTheDishwasherUndone(
  row: string,
  renamedIds: ReadonlyMap<string, string>,
): string {
  return row
    .split("|")
    .map((step) => {
      const [stepId = "", ...rest] = step.split("~");
      const [kind, ...baseId] = stepId.split(":");
      const renamed = renamedIds.get(baseId.join(":"));
      if (kind !== "upper" || renamed === undefined) return step;
      return [`upper:${renamed}`, ...rest].join("~");
    })
    .join("|");
}

/** E1's threshold as the owner stated it (ADR 0110 wave 7D5, Q-H5): the plain cabinets — composed
 *  slots, the pan drawer and the threshold drawer — reach six with fewer than two drawers among them.
 *  Asked of a plan with its dishwasher undone, it names the rooms where 7D5 S3 stood a threshold
 *  drawer and M2's *"dishwasher first"* now withholds it. */
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

/** The plan as S2/S3 composed it, before S1's dishwasher, with the undo's own verdict. Throws on an
 *  unruled dishwasher only where the caller has nowhere to report it (the named witnesses). */
function planBeforeTheDishwasher(
  plan: KitchenCompositionPlan,
): KitchenCompositionPlan {
  const undone = withTheDishwasherUndone(plan);
  if (undone.kind === "unruled") throw new Error(undone.reason);
  return undone.plan;
}

function wallRowWithTheThresholdDrawerUndone(row: string): string {
  return row
    .split("|")
    .filter((step) => !step.startsWith(`upper:${THRESHOLD_DRAWER_PLANNED_ID}~`))
    .join("|");
}

describe("criterion 2 — this wave moves a body's identity and nothing else", () => {
  it("composes 7D3's plan to the millimetre wherever 7D8 did not re-key the run", () => {
    // **This is the comparison working, not the recording going stale, and the split is the whole
    // assertion.** M7 wave 7D8 keyed the reading order onto the wider entered wall, which moves the
    // plan in the rooms where wall B is wider — 82 395 placed rooms, 38.95 % — and in **no** other
    // room: criterion 5 states it as *"nothing outside P1 moves"*, 0 field differences over the
    // 129 156 rooms of P2 and P3. So this sweep asserts both halves against the same recording. A
    // recording re-taken from this wave's own output would make the whole comparison a tautology and
    // is what `composed-run-baseline.ts`'s header exists to forbid.
    //
    // **The outcome is collected and asserted after the sweep rather than inside it**, because the
    // recording is keyed by room: a failing property shrinks toward small rooms, and the first room
    // the shrinker reaches that the capture never saw throws *"the baseline holds no room"* over the
    // top of the real counterexample.
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
    const dishwasherUndone = { doorCabinet: 0, drawerSwap: 0 };
    let thresholdDrawersWithheldByM2 = 0;
    fc.assert(
      fc.property(recordedLRoom(), (room) => {
        const composedPlan = planFor(room);
        if (composedPlan.minimumMet) placed += 1;
        // 7D5 S3 / Q-H5: the threshold drawer is undone first, returning S2's plan — which the rest of
        // this property then normalises exactly as it did before S3. See `withTheThresholdDrawerUndone`.
        const undone = withTheThresholdDrawerUndone(composedPlan);
        if (undone.kind === "unruled") {
          unexpected.push(`${roomKey(room)} ${undone.reason}`);
          return;
        }
        // 7D5b S1 / ADR 0110 M1/M8/M9: then the dishwasher, identity only — see
        // `withTheDishwasherUndone`. M2's re-plan needs no undo of its own: deciding the dishwasher
        // first only withholds threshold drawers, and a withheld drawer leaves S2's plan standing.
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
          // 7D5 S2 / Q-H6b / Q-H6c: a pan drawer standing without the bottle is undone before the
          // comparison, and only that — see `withThePanDrawerUndone`.
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
    // **The draw is fixed by the recording — the same seed and the same 240 runs — so the split is
    // asserted exactly rather than floored.** A room the capture never saw makes `recordedRoom`
    // throw, so a generator that drifted fails this file loudly whatever a floor said.
    expect(arms).toEqual({
      outsideTheReKey: 135,
      moved: 82,
      wallBWiderButRefused: 23,
    });
    expect(bottleNormalized).toBeGreaterThan(0);
    expect(bottleWithDrawer).toBeGreaterThan(0);
    // 7D5 S2 (Q-H6b / Q-H6c): the rooms whose pan drawer stands without the bottle, all of them
    // reached — 12 of this draw outside the re-key, whose undone plan must hash to 7D3's, and 7 inside
    // it, whose undone plan must still differ. Exact, because the draw is the recording's.
    expect(panDrawerUndone).toEqual({ outsideTheReKey: 12, moved: 7 });
    // 7D5 S3 / Q-H5: the eight threshold-drawer rooms of this draw, all outside the re-key. With the
    // drawer undone the S2 split above is exactly what it was — the two where a column gave way and
    // no bottle stands are among the 12, and now hash to 7D3's recording through the pan-drawer undo;
    // the six others stand a bottle again and take the bottle branch, as they did at S2.
    //
    // **7D5b S1 / ADR 0110 M2 re-plans all eight of them, and the undo above is no longer reached in
    // this draw.** Was `{ bottleGaveWay: 4, columnGaveWayBesideTheBottle: 2, columnGaveWayWithoutIt:
    // 2 }`. Each of the eight had *D* exactly six with one drawer; M1 converts a door slot beside the
    // sink in every one, *D* excludes the dishwasher (M2), so *D* is five and the drawer is withheld —
    // and a withheld drawer leaves S2's plan, which then hashes to 7D3's through the dishwasher undo.
    // The eight are counted back below from the undone plan, so this zero cannot be an empty draw.
    expect(thresholdDrawerUndone).toEqual({
      bottleGaveWay: 0,
      columnGaveWayBesideTheBottle: 0,
      columnGaveWayWithoutIt: 0,
    });
    expect(thresholdDrawersWithheldByM2).toBe(8);
    // 7D5b S1 / ADR 0110 M1/M8/M9: 119 of the 209 placed rooms stand a dishwasher — 87 by M1's
    // converted door slot and 32 by M7(e)'s drawer swap — and every one undoes, identity only, to a
    // plan that hashes to 7D3's recording (or, re-keyed, still differs from it). Exact: the draw is
    // the recording's.
    expect(dishwasherUndone).toEqual({ doorCabinet: 87, drawerSwap: 32 });
  });

  it.each(UNMOVED_WITNESS_ROOMS)(
    "renders back to 7D3's own plan once the door body is restored, in %o",
    (room) => {
      // 7D5b S1 / ADR 0110 M1/M8/M9: the dishwasher is undone first (identity only), so the door body
      // is restored over the plan S1 re-identified. Was `planFor(room)` directly.
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
        // The sweep above says a plan is unchanged; this says **what changed and to what**, field by
        // field, at the rooms this wave's rulings name. Restoring the door body to the two modules the
        // wave may re-body must reproduce 7D3's recorded plan exactly — which proves in one assertion
        // that no other field moved, that no other build id moved, and that both modules were door
        // cabinets before this wave.
        expect(canonicalPlanWithTheDoorBodyRestored(plan)).toBe(
          recordedWitness(BASELINE, room),
        );
      }
    },
  );

  it.each(UNMOVED_WITNESS_ROOMS)(
    "leaves every block column and the hob exactly as 7D3 composed them, in %o",
    (room) => {
      // Criterion 2 names these separately and D12 says why: a block column carries `role: "storage"`
      // deliberately, so a rule that reached its subject by role would sweep the block in and read
      // 7D3's correct output as this wave's defect. Each module the wave may **not** move is looked
      // for in 7D3's recording with all seven of its fields at once.
      //
      // 7D5b S1 / ADR 0110 M1/M8/M9: read over the plan with its dishwasher undone. The dishwasher is
      // not a module `isMovedByThisWave` names, so read raw it is sought in 7D3's recording under an id
      // 7D3 never composed; undone, it is the door slot it was.
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
      // Without this the two assertions above pass over a wave that composed nothing: an empty
      // change also renders back to 7D3's plan.
      //
      // **The second assertion is here because the first one alone was measured green under
      // sabotage.** With `THREE_DRAWER_BASE_BUILD_ID` set to the door id — one line in
      // `body-choice.ts`, and a wave that composes no drawer anywhere — a count of modules *whose
      // body equals that constant* is every door cabinet in the run, and this test passed. A guard
      // that reads the thing it guards out of the constant it is checking proves only that the
      // constant equals itself.
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
      // Pinned with real build ids and no masking, so a later wave that moves one of these rooms
      // again has to say so here. `canonicalPlanWithTheDoorBodyRestored` is deliberately **not**
      // used: the masking that makes the recording comparable across 7D4's body change would hide
      // half of what these witnesses exist to show.
      //
      // **Re-pinned for M7 wave 7D5 S1.** Every core module stands exactly where 7D8 pinned it; the
      // only change is the 300 mm bottle immediately after the hob, paid for by the run-end
      // remainder, a storage slot, or a block column (ADR 0120 Amendment E keeps the cut).
      expect(canonicalPlan(planFor(room)).split("|")).toEqual(plan);
    },
  );

  it.each(RE_KEYED_WITNESSES)(
    "moved against 7D3's recording rather than agreeing with it, with $name",
    ({ room }) => {
      // The assertion that keeps each pin above from being satisfiable by a wave that did nothing.
      const { composed, recorded } = comparedWithTheRecording(room);

      expect(composed).not.toBe(recorded);
    },
  );

  it("sweeps rooms that hold composed slots, block columns and storage on both walls", () => {
    // The recording proves nothing about rooms it never reached. Measured at this seed over the 240
    // drawn rooms before M7 wave 7D8: composed slots in 127, a block in 112, wall-B storage in 105.
    //
    // **The wall-B storage arm now measures 62 in this draw, and the hundred it owes has moved
    // rather than been given up.** The re-key turns composed slots on wall B into block columns
    // wherever wall B is the wider wall, so the arm thinned — and this draw **cannot** be widened to
    // compensate, because the seed and run count are the recording's and re-taking the recording
    // from this wave's own output is what criterion 11 forbids. Under ADR 0091 Amendment A the
    // sample floor is asserted where the population still lives, at full strength and against a
    // deterministic grid rather than a draw:
    // `qa-7d8-the-run-follows-the-wider-wall.adversarial.test.ts`, *stands every composed drawer on
    // the wider entered wall* — 8 615 swept plans, 2 343 composing a drawer, and at least 100 of
    // them holding a composed slot on each wall. (Since M7 wave 7D5 S2 that hundred is held over a
    // declared band past the policy, because no admitted room keeps it — ADR 0123; see 7c there.)
    // What is asserted here is the exact split of this fixed draw, which is a stronger statement
    // about the recording's reach than a floor was.
    //
    // **M7 wave 7D5 S1 moves it from 62 to 59, and only by the bottle's own cost.** Where the 300 mm
    // cargo after the hob is paid for by wall B's one composed slot the arm loses that room; where it
    // is paid for by a block column the leftover can seat a slot and the arm gains one. No core role
    // changes wall or position in this draw (checked against `7d8-re-keyed-baseline.json` and
    // `7d5-pre-width-baseline.json`), because the bottle is appended only where the core's cut holds.
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

    // **M7 wave 7D5 S2 (Q-H6a = A; ADR 0123) moves two of these, and only by the pan drawer's own
    // cost.** The pan drawer before the hob spends one 600 mm module of the hob's wall, and where that
    // module was a room's last composed slot the room leaves the arm: composed slots 110 at 7D5 S1 →
    // 91 in this draw, wall-B storage 59 → 55 (both measured against S1's source). The draw cannot be widened (it is the recording's), so the composed-slot
    // hundred is re-sited rather than lowered: it is asserted at full strength over the policy-wide
    // 1 000-run draw in `qa-7d4-composed-bodies.adversarial.test.ts`, *gives every other composed slot
    // the door body* (two or more slots, at least 100). What is asserted here is this fixed draw's
    // exact reach, as the wall-B arm already was.
    //
    // **7D5b S1 / ADR 0110 M1 moves it again, 91 → 70, and only by the dishwasher's own conversion.**
    // In 21 rooms of this draw the storage run's one composed slot is the 600 mm door cabinet beside
    // the sink — across the corner, or along the sink's wall — and M1 re-identifies it as the
    // dishwasher, so the room holds no composed slot any more. The second number proves it: with the
    // dishwasher undone the arm is S2's 91 again, so no slot was lost any other way.
    expect(arms.composedSlots).toBe(70);
    expect(arms.composedSlotsBeforeTheDishwasher).toBe(91);
    expect(arms.blockColumns).toBeGreaterThanOrEqual(ARM_FLOOR);
    // 7D5b S1 / ADR 0110 M1: 55 → 45 for the same reason — in ten rooms wall B's only composed slot is
    // the one beside the sink — and 55 again with the dishwasher undone.
    expect(arms.wallBStorage).toBe(45);
    expect(arms.wallBStorageBeforeTheDishwasher).toBe(55);
  });
});

describe("criterion 21 — the wall row is asserted, not composed", () => {
  it("reproduces 7D3's wall row character for character wherever 7D8 did not re-key", () => {
    // Criterion 21 asked that **no** character of the wall row moved, and it still asks that of
    // every room outside M7 wave 7D8's re-key. Inside it the row follows the bases it stands over:
    // the run turned around, so the openings did. **The split is asserted, not the aggregate** — a
    // wall row that changed in a room where the floor did not is this wave composing an upper, which
    // it must never do.
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
        // 7D5 S3 / Q-H5: S2's plan first, as in criterion 2's sweep above.
        const undone = withTheThresholdDrawerUndone(kitchen.log.plan);
        if (undone.kind === "unruled") {
          unexpected.push(`${roomKey(room)} ${undone.reason}`);
          return;
        }
        // 7D5b S1 / ADR 0110 M1/M8/M9: then the dishwasher, as in criterion 2's sweep. Its upper names
        // the base beneath it, so the row takes the renamed ids back below; nothing else in it moves.
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
        const movedByTheReKey = reKeyedByWave7D8(room, kitchen.log.plan);
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
          // 7D5 S2 / Q-H6b / Q-H6c: where the pan drawer stands without the bottle the wall row moved
          // with the bases beneath it, and only so — see `wallRowWithThePanDrawerUndone`.
          // 7D5 S3 / Q-H5: only a column-paid threshold drawer reaches this branch — where the bottle
          // gave way it stands again above — and its one upper is removed before S2's swap.
          const standsAThresholdDrawer = undone.kind === "columnGaveWay";
          if (standsAThresholdDrawer) thresholdDrawerRowsUndone += 1;
          if (dishwasherUndo.kind !== "none") dishwasherRowsUndone += 1;
          const rowBeforeTheDishwasher = wallRowWithTheDishwasherUndone(
            canonicalWallRow(kitchen),
            dishwasherUndo.renamedIds,
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
    // Exact, for the reason the sibling sweep above gives: the draw is fixed by the recording.
    expect(arms).toEqual({ outsideTheReKey: 127, moved: 82, refused: 31 });
    // 7D5 S2: the same 12 + 7 pan-drawer-without-bottle rooms as criterion 2's sweep above.
    expect(panDrawerRowsUndone).toBe(19);
    // 7D5 S3 / Q-H5: criterion 2's two column-paid, bottle-less threshold-drawer rooms — **0 since
    // 7D5b S1**: M2 withholds every threshold drawer of this draw (see criterion 2's sweep). Was 2.
    expect(thresholdDrawerRowsUndone).toBe(0);
    // 7D5b S1 / ADR 0110 M1/M8/M9: bottle-less rooms whose row was compared with its dishwasher undone.
    // Exact, the draw being the recording's: 24 of the rooms outside the bottle branch stand one.
    expect(dishwasherRowsUndone).toBe(24);
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
    // Measured at this seed: 458 across the 209 composed kitchens.
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
    // The one clause of criterion 21 no sweep with an accepting probe can reach. The probe refuses
    // every body the **catalogue** declares in the wall band rather than two named ids, so a wall
    // row that gained a third body would still be refused here.
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
