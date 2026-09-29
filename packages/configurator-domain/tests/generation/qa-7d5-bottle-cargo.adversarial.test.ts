// M7 wave 7D5 S1 — the bottle cargo is optional to the core kitchen. This file derives the
// pre-S1 core-selection answer from run capacities and the public priority list; it does not ask the
// S1 implementation whether omitting the cargo was necessary. Since S2 the bottle also gives way to
// the pan drawer (ADR 0110 Q-H6b) and, once the pan drawer stands, to a tall column (Q-H6c); both are
// derived here from the same capacities and 7D3's own block rule. Since S3 (ADR 0110 Q-H5, owner
// ruling 2026-09-21) the bottle also gives way to the threshold drawer, but only where the drawer in
// its place costs the kitchen no tall column; that, too, is derived from capacities rather than asked.
//
// 7D5b S2 / ADR 0110 M7/M10: where no door cabinet stands free beside the sink, the dishwasher is read
// directly after the sink and may take, in order, (b) a pantry column, (d) the bottle, (c) the oven
// tower. (d) is a new reason a bottle is omitted, derived below from the same capacities and 7D3's own
// block rule: (b) could not stand on the bottle's kitchen, and (d) keeps every column.
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  buildKitchenLBodyCatalog,
  buildLShellDesign,
  cabinetDepthMmOf,
  declaredColumnSizes,
  generateKitchen,
  GENERATION_PRIORITIES,
  isComposedStorageSlot,
  KITCHEN_L_DESIGN,
  lShellFloorRuns,
  planKitchenComposition,
  wallLengthMm,
  type DesignRoom,
  type DesignWall,
  type GenerationCoreRole,
  type GenerationRun,
  type KitchenCompositionPlan,
  type PlannedGenerationBase,
} from "../../src/index.js";
import { planTallEndBlock } from "../../src/generation/tall-end-rule.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";
import { facesOf, openingIntervalOf } from "../support/shell-design.js";

// M7B U1 slice S1's minimal type-level fix: `DesignWall` widened to include `"C"` (ADR 0132), but
// this suite reads `planKitchenComposition`'s own two-wall composer. Wall C's own suite is U3's.
type TwoWallDispatch = Extract<DesignWall, "A" | "B">;

const OCCURRED_AT = "2026-09-11T12:00:00.000Z";
const GRID_STEP_MM = 10;
const BOTTLE_WIDTH_MM = 300;
const PAN_DRAWER_WIDTH_MM = 600;
const STORAGE_MODULE_MM = 600;
const THRESHOLD_DRAWER_WIDTH_MM = 600;
const PAN_DRAWER_BODY = "base-panbank";
/** 7D5b S2 / ADR 0110 M7: the traded dishwasher's body and width, literals as every body here. */
const DISHWASHER_BODY = "base-dishwasher";
const DISHWASHER_WIDTH_MM = 600;
const CATALOG = buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN));
const DECLARED_COLUMNS = declaredColumnSizes(CATALOG);

function planFor(room: DesignRoom): KitchenCompositionPlan {
  return planKitchenComposition({
    room,
    runs: lShellFloorRuns(room),
    columns: DECLARED_COLUMNS,
  });
}

function runWidth(run: GenerationRun): number {
  return Math.max(0, run.endMm - run.startMm);
}

function preferredCutAcrossTheCorner(
  widthsMm: readonly number[],
  capacities: { readonly prefix: number; readonly suffix: number },
  preferredCut: number,
): number | undefined {
  return Array.from({ length: widthsMm.length + 1 }, (_, cut) => cut)
    .filter((cut) => {
      const prefix = widthsMm
        .slice(0, cut)
        .reduce((sum, widthMm) => sum + widthMm, 0);
      const suffix = widthsMm
        .slice(cut)
        .reduce((sum, widthMm) => sum + widthMm, 0);
      return prefix <= capacities.prefix && suffix <= capacities.suffix;
    })
    .sort((left, right) => {
      const leftDistance = Math.abs(left - preferredCut);
      const rightDistance = Math.abs(right - preferredCut);
      return leftDistance === rightDistance
        ? left - right
        : leftDistance - rightDistance;
    })[0];
}

function capacitiesByReadingRole(room: DesignRoom): {
  readonly prefix: number;
  readonly suffix: number;
} {
  const runs = lShellFloorRuns(room);
  const { prefix, suffix } = readingWallsOf(room);
  return {
    prefix: runWidth(runs[prefix]),
    suffix: runWidth(runs[suffix]),
  };
}

const CORE_ATTEMPTS = [
  GENERATION_PRIORITIES,
  GENERATION_PRIORITIES.filter((item) => item.role !== "fridge"),
  GENERATION_PRIORITIES.filter(
    (item) => item.role !== "fridge" && item.role !== "preparation",
  ),
] as const;

type CoreAttempt = (typeof CORE_ATTEMPTS)[number];

function preferredCutOf(kept: CoreAttempt): number {
  return kept[0]?.role === "fridge" ? 1 : 0;
}

function expectedPreS1Core(room: DesignRoom): {
  readonly minimumMet: boolean;
  readonly dropped: readonly GenerationCoreRole[];
  readonly kept?: CoreAttempt;
  readonly cut?: number;
} {
  const capacities = capacitiesByReadingRole(room);
  for (const kept of CORE_ATTEMPTS) {
    const cut = preferredCutAcrossTheCorner(
      kept.map((item) => item.widthMm),
      capacities,
      preferredCutOf(kept),
    );
    if (cut === undefined) continue;
    const keptRoles = new Set(kept.map((item) => item.role));
    return {
      minimumMet: true,
      dropped: GENERATION_PRIORITIES.filter(
        (item) => !keptRoles.has(item.role),
      ).map((item) => item.role),
      kept,
      cut,
    };
  }
  return {
    minimumMet: false,
    dropped: GENERATION_PRIORITIES.map((item) => item.role),
  };
}

function firstUnconditionalBottleAttempt(
  room: DesignRoom,
): { readonly kept: CoreAttempt; readonly cut: number } | undefined {
  const capacities = capacitiesByReadingRole(room);
  for (const kept of CORE_ATTEMPTS) {
    const cut = preferredCutAcrossTheCorner(
      [...kept.map((item) => item.widthMm), BOTTLE_WIDTH_MM],
      capacities,
      preferredCutOf(kept),
    );
    if (cut !== undefined) return { kept, cut };
  }
  return undefined;
}

/** Why a bottle whose core fits it in place is omitted anyway: Q-H6b where the pan drawer, decided
 *  first against the core alone, leaves no room for it, and Q-H6c where the bottle would fit beside
 *  it but cost a tall column. `undefined` where the pan drawer could not have been decided first — the
 *  fallback then decides the bottle first, and an omission there is a fault. */
function bottleGaveWayTo(
  room: DesignRoom,
  core: { readonly kept?: CoreAttempt; readonly cut?: number },
): "the pan drawer" | "a tall column" | undefined {
  const { kept, cut } = core;
  if (kept === undefined || cut === undefined) return undefined;
  const capacities = capacitiesByReadingRole(room);
  const widthsMm = kept.map((item) => item.widthMm);
  const hobAt = kept.findIndex((item) => item.role === "hob");
  const isCoreWhole = kept.length === GENERATION_PRIORITIES.length;
  const columns = (run: DerivedRun) =>
    tallColumnsOf(run, { room, capacities, isCoreWhole });
  const coreRun = { widthsMm, cut, hobAt };
  const panDrawer = {
    widthsMm: [
      ...widthsMm.slice(0, hobAt),
      PAN_DRAWER_WIDTH_MM,
      ...widthsMm.slice(hobAt),
    ],
    cut: hobAt < cut ? cut + 1 : cut,
    hobAt: hobAt + 1,
  };
  if (
    !fitsInPlace(panDrawer, capacities) ||
    columns(panDrawer) < columns(coreRun)
  ) {
    return undefined;
  }
  const both = {
    widthsMm: [...panDrawer.widthsMm, BOTTLE_WIDTH_MM],
    cut:
      panDrawer.cut === panDrawer.widthsMm.length
        ? panDrawer.cut + 1
        : panDrawer.cut,
    hobAt: panDrawer.hobAt,
  };
  if (!fitsInPlace(both, capacities)) return "the pan drawer";
  return columns(both) < columns(panDrawer) ? "a tall column" : undefined;
}

/** 7D5b S0b / ADR 0110 M11: the K3 fallback's bottle, derived. The kept core's block stands at least
 *  one column (its innermost the oven tower), S1's bottle after the hob leaves it none, and no pan
 *  drawer could stand beside that bottle without costing a further column — so the tower is kept and
 *  the bottle omitted. Asked only where Q-H6b / Q-H6c did not decide the room. */
function towerWasKeptOverTheBottle(
  room: DesignRoom,
  core: { readonly kept?: CoreAttempt; readonly cut?: number },
): boolean {
  const { kept, cut } = core;
  if (kept === undefined || cut === undefined) return false;
  const capacities = capacitiesByReadingRole(room);
  const isCoreWhole = kept.length === GENERATION_PRIORITIES.length;
  const columns = (run: DerivedRun) =>
    tallColumnsOf(run, { room, capacities, isCoreWhole });
  const coreRun: DerivedRun = {
    widthsMm: kept.map((item) => item.widthMm),
    cut,
    hobAt: kept.findIndex((item) => item.role === "hob"),
  };
  const bottleKitchen = appendedLast(coreRun, BOTTLE_WIDTH_MM);
  const panDrawerBeside = withPanDrawerBeforeTheHob(bottleKitchen);
  const isPanDrawerStandingBeside =
    fitsInPlace(panDrawerBeside, capacities) &&
    columns(panDrawerBeside) >= columns(bottleKitchen);
  return (
    !isPanDrawerStandingBeside &&
    columns(coreRun) > 0 &&
    columns(bottleKitchen) === 0
  );
}

/** 7D5 S3 / Q-H5: does the threshold drawer stand in the bottle's place, and would that place have
 *  cost the kitchen no tall column? The kitchen the bottle stood in is the kept core with the pan
 *  drawer (where one stands) before the hob and the bottle after it, on the pre-S1 cut; the drawer
 *  in its place is that kitchen with the 300 mm bottle swapped for a 600 mm module. */
function thresholdDrawerTookTheBottlesPlace(
  room: DesignRoom,
  context: {
    readonly core: { readonly kept?: CoreAttempt; readonly cut?: number };
    readonly plan: KitchenCompositionPlan;
  },
): boolean {
  const { kept, cut } = context.core;
  if (kept === undefined || cut === undefined) return false;
  const reading = inReadingOrder(context.plan);
  const hobAt = reading.findIndex((base) => base.role === "hob");
  if (reading[hobAt + 1]?.id !== "threshold-drawer") return false;
  const capacities = capacitiesByReadingRole(room);
  const isCoreWhole = kept.length === GENERATION_PRIORITIES.length;
  const columns = (run: DerivedRun) =>
    tallColumnsOf(run, { room, capacities, isCoreWhole });
  // 7D5b S1 / ADR 0110 M1/M2/M9: by body; (e) re-identifies the pan drawer as the preparation.
  const hasPanDrawer = context.plan.bases.some(
    (base) => base.buildId === PAN_DRAWER_BODY,
  );
  const keptCore: DerivedRun = {
    widthsMm: kept.map((item) => item.widthMm),
    cut,
    hobAt: kept.findIndex((item) => item.role === "hob"),
  };
  const beforeTheLast = hasPanDrawer
    ? withPanDrawerBeforeTheHob(keptCore)
    : keptCore;
  const withTheBottle = appendedLast(beforeTheLast, BOTTLE_WIDTH_MM);
  const inItsPlace = appendedLast(beforeTheLast, THRESHOLD_DRAWER_WIDTH_MM);
  return (
    fitsInPlace(withTheBottle, capacities) &&
    fitsInPlace(inItsPlace, capacities) &&
    columns(inItsPlace) >= columns(withTheBottle)
  );
}

/** 7D5b S2 / ADR 0110 M7(d), M10: the bottle gave way to a traded dishwasher. The kitchen the bottle
 *  stood in — the kept core, the pan drawer before the hob where one stands, the bottle last — could
 *  not take the dishwasher after the sink for exactly one pantry column ((b): it does not fit, or it
 *  costs no column or the last one), and without the bottle it takes it keeping every column ((d)).
 *  Asked only where the plan's dishwasher stands among the items after the sink, where S1 stands none. */
function bottleWasTradedForTheDishwasher(
  room: DesignRoom,
  context: {
    readonly core: { readonly kept?: CoreAttempt; readonly cut?: number };
    readonly plan: KitchenCompositionPlan;
  },
): boolean {
  const { kept, cut } = context.core;
  if (kept === undefined || cut === undefined) return false;
  if (!isADishwasherReadAmongTheItemsAfterTheSink(context.plan)) return false;
  const capacities = capacitiesByReadingRole(room);
  const isCoreWhole = kept.length === GENERATION_PRIORITIES.length;
  const columns = (run: DerivedRun) =>
    tallColumnsOf(run, { room, capacities, isCoreWhole });
  const sinkAt = kept.findIndex((item) => item.role === "sink");
  const keptCore: DerivedRun = {
    widthsMm: kept.map((item) => item.widthMm),
    cut,
    hobAt: kept.findIndex((item) => item.role === "hob"),
  };
  const hasPanDrawer = context.plan.bases.some(
    (base) => base.buildId === PAN_DRAWER_BODY,
  );
  const beforeTheBottle = hasPanDrawer
    ? withPanDrawerBeforeTheHob(keptCore)
    : keptCore;
  const bottleKitchen = appendedLast(beforeTheBottle, BOTTLE_WIDTH_MM);
  const forAPantry = withTheDishwasherAfterTheSink(bottleKitchen, sinkAt);
  const isThePantryTradeOpen =
    fitsInPlace(forAPantry, capacities) &&
    columns(forAPantry) === columns(bottleKitchen) - 1 &&
    columns(forAPantry) > 0;
  const forTheBottle = withTheDishwasherAfterTheSink(beforeTheBottle, sinkAt);
  return (
    fitsInPlace(bottleKitchen, capacities) &&
    !isThePantryTradeOpen &&
    fitsInPlace(forTheBottle, capacities) &&
    columns(forTheBottle) === columns(bottleKitchen)
  );
}

/** 7D5b S2: the 600 mm dishwasher read directly after the sink, on the sink's side of the cut. */
function withTheDishwasherAfterTheSink(
  run: DerivedRun,
  sinkAt: number,
): DerivedRun {
  return {
    widthsMm: [
      ...run.widthsMm.slice(0, sinkAt + 1),
      DISHWASHER_WIDTH_MM,
      ...run.widthsMm.slice(sinkAt + 1),
    ],
    cut: sinkAt < run.cut ? run.cut + 1 : run.cut,
    hobAt: sinkAt < run.hobAt ? run.hobAt + 1 : run.hobAt,
  };
}

/** 7D5b S2 / ADR 0110 M7/M10: a dishwasher read directly after the sink with the next item — not a
 *  composed slot — directly after it on the same wall. Only a trade inserts one among the items; S1's
 *  M1 converts a slot, and (e) the preparation cabinet, which the pan drawer's preparation role names. */
function isADishwasherReadAmongTheItemsAfterTheSink(
  plan: KitchenCompositionPlan,
): boolean {
  const reading = inReadingOrder(plan);
  const at = reading.findIndex((base) => base.buildId === DISHWASHER_BODY);
  const readNext = reading[at + 1];
  const isDrawerSwap = plan.bases.some(
    (base) => base.buildId === PAN_DRAWER_BODY && base.role === "preparation",
  );
  return (
    at > 0 &&
    !isDrawerSwap &&
    reading[at - 1]?.role === "sink" &&
    readNext !== undefined &&
    readNext.wall === reading[at]?.wall &&
    !isComposedStorageSlot(readNext)
  );
}

/** 7D5b S2 / ADR 0110 M7(c): the oven tower traded for the dishwasher — a traded dishwasher, no column
 *  standing, and the oven under the hob. */
function isTheOvenTowerTradedForTheDishwasher(
  plan: KitchenCompositionPlan,
): boolean {
  return (
    isADishwasherReadAmongTheItemsAfterTheSink(plan) &&
    !plan.bases.some((base) => base.id.startsWith("column:")) &&
    plan.bases.some((base) => base.buildId === "base-hob-oven")
  );
}

/** J1: immediately before the hob, on the hob's side of the cut. */
function withPanDrawerBeforeTheHob(run: DerivedRun): DerivedRun {
  return {
    widthsMm: [
      ...run.widthsMm.slice(0, run.hobAt),
      PAN_DRAWER_WIDTH_MM,
      ...run.widthsMm.slice(run.hobAt),
    ],
    cut: run.hobAt < run.cut ? run.cut + 1 : run.cut,
    hobAt: run.hobAt + 1,
  };
}

/** H1 and J3: read last, on the prefix wall only where the whole run already is. */
function appendedLast(run: DerivedRun, widthMm: number): DerivedRun {
  return {
    widthsMm: [...run.widthsMm, widthMm],
    cut: run.cut === run.widthsMm.length ? run.cut + 1 : run.cut,
    hobAt: run.hobAt,
  };
}

interface DerivedRun {
  readonly widthsMm: readonly number[];
  readonly cut: number;
  readonly hobAt: number;
}

function suffixFreeMm(
  run: DerivedRun,
  capacities: { readonly suffix: number },
): number {
  return (
    capacities.suffix -
    run.widthsMm.slice(run.cut).reduce((sum, widthMm) => sum + widthMm, 0)
  );
}

function fitsInPlace(
  run: DerivedRun,
  capacities: { readonly prefix: number; readonly suffix: number },
): boolean {
  const prefixMm = run.widthsMm
    .slice(0, run.cut)
    .reduce((sum, widthMm) => sum + widthMm, 0);
  return prefixMm <= capacities.prefix && suffixFreeMm(run, capacities) >= 0;
}

/** 7D3's block on the suffix wall's free end, counted by its own rule. */
function tallColumnsOf(
  run: DerivedRun,
  context: {
    readonly room: DesignRoom;
    readonly capacities: { readonly suffix: number };
    readonly isCoreWhole: boolean;
  },
): number {
  const freeMm = suffixFreeMm(run, context.capacities);
  return planTallEndBlock({
    coreSurvivedWhole: context.isCoreWhole,
    hobStandsOnTheFreeEndWall: run.hobAt >= run.cut,
    freeEndStorageCount: Math.floor(freeMm / STORAGE_MODULE_MM),
    freeEndRemainderMm: freeMm % STORAGE_MODULE_MM,
    roomHeightMm: context.room.heightMm,
    hobWithItsOwnOvenBuildId: "base-hob-oven",
    declared: DECLARED_COLUMNS,
  }).columns.length;
}

function alongTheWall(
  plan: KitchenCompositionPlan,
  wall: DesignWall,
): readonly PlannedGenerationBase[] {
  return plan.bases
    .filter((base) => base.wall === wall)
    .sort((left, right) => left.startMm - right.startMm);
}

function readingWallsOf(room: DesignRoom): {
  readonly prefix: TwoWallDispatch;
  readonly suffix: TwoWallDispatch;
} {
  const prefix: TwoWallDispatch =
    wallLengthMm("B", room) > wallLengthMm("A", room) ? "A" : "B";
  return { prefix, suffix: prefix === "A" ? "B" : "A" };
}

function inReadingOrder(
  plan: KitchenCompositionPlan,
): readonly PlannedGenerationBase[] {
  const { prefix, suffix } = readingWallsOf(plan.room);
  return [
    ...[...alongTheWall(plan, prefix)].reverse(),
    ...alongTheWall(plan, suffix),
  ];
}

/** Every kept core role whose planned wall is not the side of the pre-S1 cut it belongs to:
 *  `kept.slice(0, cut)` reads on the prefix wall and `kept.slice(cut)` on the suffix wall. */
function coreRolesOffTheirPreS1Wall(
  plan: KitchenCompositionPlan,
  preS1: { readonly kept: CoreAttempt; readonly cut: number },
): readonly string[] {
  const { prefix, suffix } = readingWallsOf(plan.room);
  return preS1.kept.flatMap((item, index) => {
    const expectedWall = index < preS1.cut ? prefix : suffix;
    const actualWalls = plan.bases
      .filter((base) => base.role === item.role)
      .map((base) => base.wall);
    return actualWalls.length === 1 && actualWalls[0] === expectedWall
      ? []
      : [
          `${item.role} on ${actualWalls.join("+") || "none"}, not ${expectedWall}`,
        ];
  });
}

/** The merge rows below pin 298 mm as the widest remainder a last-on-its-wall bottle shares an
 *  opening with; this is what keeps those rows the boundary rather than an example. 7D5b S0b / ADR
 *  0110 M11: was 300 — a bottle last with 300 mm or more past it left 600 mm past the core, where the
 *  tower is now kept over it; measured over every approved room at 1 mm, 298 is the widest left.
 *  7D5b S2 / ADR 0110 M7/M10: except beside a dishwasher that took the oven tower ((c)), where the
 *  tower's own remainder is left past the bottle; the census counts those apart, and at 10 mm they
 *  reach 500 mm — the 800 mm cap. The 1 mm figure was not re-taken for them. */
const WIDEST_REACHABLE_MERGED_REMAINDER_MM = 298;
const WIDEST_MERGED_OPENING_MM = 800;

function isLastOnItsWallMergingPastTheWidestReachable(
  plan: KitchenCompositionPlan,
): boolean {
  const bottle = plan.bases.find((base) => base.id === "bottle");
  if (!bottle) return false;
  const lastEndOnWall = Math.max(
    ...plan.bases
      .filter((base) => base.wall === bottle.wall)
      .map((base) => base.endMm),
  );
  const remainderMm = plan.remainderMm[bottle.wall];
  return (
    bottle.endMm === lastEndOnWall &&
    remainderMm > WIDEST_REACHABLE_MERGED_REMAINDER_MM &&
    bottle.widthMm + remainderMm <= WIDEST_MERGED_OPENING_MM
  );
}

describe("7D5 S1 — the conditional bottle cargo", () => {
  it("preserves every pre-S1 kitchen and core role across the approved 10 mm rectangle", () => {
    const l = APPROVED_ROOM_POLICY.buildableShapes.L;
    if (!l) throw new Error("the approved policy declares no L room");
    const census = {
      swept: 0,
      placed: 0,
      bottleIncluded: 0,
      bottleOmitted: 0,
      omittedForCoreRole: 0,
      omittedForRefusal: 0,
      omittedForReCut: 0,
      omittedForThePanDrawer: 0,
      omittedForATallColumn: 0,
      omittedForTheThresholdDrawer: 0,
      omittedForTheOvenTower: 0,
      omittedForTheDishwasher: 0,
      mergingPastTheWidestReachableBesideATradedOvenTower: 0,
      wrongCore: [] as string[],
      wrongOrder: [] as string[],
      coreOffItsWall: [] as string[],
      duplicateBottle: [] as string[],
      lastOnItsWallMergingPastTheWidestReachable: [] as string[],
      includedByArm: { aWider: 0, bWider: 0, equal: 0 },
    };

    for (
      let widthMm = l.wallA.minMm;
      widthMm <= l.wallA.maxMm;
      widthMm += GRID_STEP_MM
    ) {
      for (
        let depthMm = l.wallB.minMm;
        depthMm <= l.wallB.maxMm;
        depthMm += GRID_STEP_MM
      ) {
        census.swept += 1;
        const room: DesignRoom = {
          shape: "L",
          widthMm,
          depthMm,
          heightMm: 2600,
        };
        const expected = expectedPreS1Core(room);
        const plan = planFor(room);
        const key = `${String(widthMm)}x${String(depthMm)}`;
        if (
          plan.minimumMet !== expected.minimumMet ||
          plan.dropped.join(",") !== expected.dropped.join(",")
        ) {
          census.wrongCore.push(key);
        }
        if (!plan.minimumMet) continue;
        census.placed += 1;
        if (expected.kept !== undefined && expected.cut !== undefined) {
          const offTheirWall = coreRolesOffTheirPreS1Wall(plan, {
            kept: expected.kept,
            cut: expected.cut,
          });
          if (offTheirWall.length > 0) {
            census.coreOffItsWall.push(`${key}: ${offTheirWall.join("; ")}`);
          }
        }

        const reading = inReadingOrder(plan);
        // The stable composition id is the key and the catalogue id is the thing asserted. Asking
        // the exported build-id constant to identify both would let a wrong constant and a wrong
        // composer agree with each other (ADR 0121 decision 3(b)).
        const bottles = reading.filter((base) => base.id === "bottle");
        if (bottles.length > 1) census.duplicateBottle.push(key);
        if (bottles.length === 1) {
          census.bottleIncluded += 1;
          const hobAt = reading.findIndex((base) => base.role === "hob");
          const bottleAt = reading.findIndex((base) => base.id === "bottle");
          if (bottleAt !== hobAt + 1) census.wrongOrder.push(key);
          // 7D5b S2 / ADR 0110 M7(c): where the dishwasher took the oven tower, the bottle it stood
          // before is last on its wall again with the tower's run-end remainder past it, 310-500 mm at
          // 10 mm, which merges into one opening of at most 800 mm. Counted apart, because 298 mm
          // stays the widest everywhere else.
          if (isLastOnItsWallMergingPastTheWidestReachable(plan)) {
            if (isTheOvenTowerTradedForTheDishwasher(plan))
              census.mergingPastTheWidestReachableBesideATradedOvenTower += 1;
            else census.lastOnItsWallMergingPastTheWidestReachable.push(key);
          }
          if (widthMm > depthMm) census.includedByArm.aWider += 1;
          else if (depthMm > widthMm) census.includedByArm.bWider += 1;
          else census.includedByArm.equal += 1;
          continue;
        }

        census.bottleOmitted += 1;
        const unconditional = firstUnconditionalBottleAttempt(room);
        if (unconditional === undefined) {
          census.omittedForRefusal += 1;
        } else if (unconditional.kept.length < (expected.kept?.length ?? 0)) {
          census.omittedForCoreRole += 1;
        } else if (unconditional.cut !== expected.cut) {
          // ADR 0120 Amendment E: the same core fits with the bottle only across a different cut,
          // which would move a core role to the other wall.
          census.omittedForReCut += 1;
        } else {
          // S2: the core fits the bottle in place, so only the pan drawer standing may explain it.
          const reason = bottleGaveWayTo(room, expected);
          // 7D5b S1 / ADR 0110 M1/M2/M9: by body, because in an (e) room the pan drawer carries the
          // preparation id (24 160 rooms, which read as wrongCore when it was looked up by id).
          const hasPanDrawer = plan.bases.some(
            (base) => base.buildId === PAN_DRAWER_BODY,
          );
          // 7D5b S2 / ADR 0110 M7(c): M11's tower may since have been traded for the dishwasher, the
          // last resort, which leaves the kitchen M11 decided otherwise as it was (2 600 rooms).
          const hasOvenTower =
            plan.bases.some((base) => base.buildId === "tall-oven-tower") ||
            isTheOvenTowerTradedForTheDishwasher(plan);
          if (
            reason === undefined &&
            !hasPanDrawer &&
            hasOvenTower &&
            towerWasKeptOverTheBottle(room, expected)
          ) {
            // 7D5b S0b / ADR 0110 M11: the bottle alone would have taken the only oven tower.
            census.omittedForTheOvenTower += 1;
          } else if (
            reason === undefined &&
            bottleWasTradedForTheDishwasher(room, { core: expected, plan })
          ) {
            // 7D5b S2 / ADR 0110 M7(d): the bottle was traded for the dishwasher.
            census.omittedForTheDishwasher += 1;
          } else if (
            reason === undefined &&
            thresholdDrawerTookTheBottlesPlace(room, { core: expected, plan })
          ) {
            // 7D5 S3 / Q-H5: the bottle gave way because the drawer in its place costs no column.
            census.omittedForTheThresholdDrawer += 1;
          } else if (reason === undefined || !hasPanDrawer) {
            census.wrongCore.push(
              `${key}: bottle omitted although the same core fits`,
            );
          } else if (reason === "the pan drawer") {
            census.omittedForThePanDrawer += 1;
          } else {
            census.omittedForATallColumn += 1;
          }
        }
      }
    }

    // S1's own three omissions are unchanged since `c67b4ee`; the two S2 added are the 35 580 rooms
    // whose bottle became a pan drawer. 7D5 S3 / Q-H5 adds a sixth: 6 195 rooms whose bottle the
    // threshold drawer took the place of (184 686 -> 178 491 included). 7D5b S0b / ADR 0110 M11 adds
    // a seventh: 5 260 rooms of the K3 fallback, no pan drawer, where S1's bottle would have taken the
    // only oven tower (178 491 -> 173 231 included, 66 720 -> 71 980 omitted); no other category moves.
    // 7D5b S1 / ADR 0110 M1/M2/M9: the dishwasher is decided before the threshold drawer and *D*
    // excludes it, so in 3 060 rooms the drawer no longer takes the bottle's place and the bottle is
    // back (6 195 -> 3 135; 173 231 -> 176 291 included, 71 980 -> 68 920 omitted, plan E3). No other
    // category moves, once the pan drawer is found by body in the 24 160 (e) rooms.
    // 7D5b S2 / ADR 0110 M7/M10: (d) trades the bottle for the dishwasher in 2 600 rooms, a new
    // omission category (176 291 -> 173 691 included, 68 920 -> 71 520 omitted); M11's 5 260 are
    // unmoved, 2 600 of them since traded under (c). And (c) leaves the bottle last on its wall with
    // the tower's remainder past it in 5 200 rooms, merging past the 298 mm the rows below pin — each
    // one a traded tower; no other bottle does.
    const { includedByArm, ...totals } = census;
    expect(totals).toEqual({
      swept: 256_011,
      placed: 245_211,
      bottleIncluded: 173_691,
      bottleOmitted: 71_520,
      omittedForCoreRole: 15_445,
      omittedForRefusal: 4_545,
      omittedForReCut: 4_955,
      omittedForThePanDrawer: 11_440,
      omittedForATallColumn: 24_140,
      omittedForTheThresholdDrawer: 3_135,
      omittedForTheOvenTower: 5_260,
      omittedForTheDishwasher: 2_600,
      mergingPastTheWidestReachableBesideATradedOvenTower: 5_200,
      wrongCore: [],
      wrongOrder: [],
      coreOffItsWall: [],
      duplicateBottle: [],
      lastOnItsWallMergingPastTheWidestReachable: [],
    });
    expect(includedByArm.aWider).toBeGreaterThan(0);
    expect(includedByArm.bWider).toBeGreaterThan(0);
    expect(includedByArm.equal).toBeGreaterThan(0);
  }, 20_000);

  // 7D5 S3 / Q-H5: 4700 x 6000, the wall-B-wider row, now stands the threshold drawer in the bottle's
  // place (its *D* is six with the pan drawer the only drawer), so there is no bottle whose identity
  // to read. The row moved to 4500 x 6000 — still wall B wider, still a bottle beside a pan drawer
  // and a three-column block — and the room it left is pinned below as what it now is. (7D5b S1 / ADR
  // 0110 M1/M2/M9: 4700 x 6000 stands its bottle again; the threshold row below moved to 5200 x 6000.)
  it.each([
    { shape: "L", widthMm: 6000, depthMm: 4700, heightMm: 2600 },
    { shape: "L", widthMm: 4500, depthMm: 6000, heightMm: 2600 },
    { shape: "L", widthMm: 6000, depthMm: 6000, heightMm: 2600 },
  ] as const)(
    "keeps the bottle out of composed-storage identity in %o",
    (room) => {
      const plan = planFor(room);
      const bottle = plan.bases.find((base) => base.id === "bottle");

      expect(bottle).toMatchObject({
        id: "bottle",
        role: "storage",
        buildId: "base-bottle-cargo",
        widthMm: 300,
      });
      expect(bottle ? isComposedStorageSlot(bottle) : undefined).toBe(false);
    },
  );

  // 7D5b S1 / ADR 0110 M1/M2/M9: was 4700 x 6000. M1 converts its door cabinet across the corner, *D*
  // falls to five with the dishwasher out of it, and the bottle is back. 5200 x 6000 — the same wall B
  // wider arm — has one more door cabinet, so the threshold drawer still takes the bottle's place.
  it("gives the bottle's place to the threshold drawer, not a composed slot, at 5200 x 6000", () => {
    const plan = planFor({
      shape: "L",
      widthMm: 5200,
      depthMm: 6000,
      heightMm: 2600,
    });
    const reading = inReadingOrder(plan);
    const hobAt = reading.findIndex((base) => base.role === "hob");
    const afterTheHob = reading[hobAt + 1];

    expect(plan.bases.some((base) => base.id === "bottle")).toBe(false);
    expect(afterTheHob).toMatchObject({
      id: "threshold-drawer",
      role: "storage",
      buildId: "base-3drawer",
      widthMm: THRESHOLD_DRAWER_WIDTH_MM,
    });
    expect(afterTheHob ? isComposedStorageSlot(afterTheHob) : undefined).toBe(
      false,
    );
  });

  it.each([
    { shape: "L", widthMm: 1500, depthMm: 2800, heightMm: 2600 },
    { shape: "L", widthMm: 2861, depthMm: 2849, heightMm: 2600 },
    { shape: "L", widthMm: 2956, depthMm: 2824, heightMm: 2600 },
  ] as const)(
    "omits the bottle rather than moving the sink off the wider wall in %o",
    (room) => {
      const widerWall: DesignWall =
        wallLengthMm("B", room) > wallLengthMm("A", room) ? "B" : "A";

      const plan = planFor(room);

      expect(plan.bases.find((base) => base.role === "sink")?.wall).toBe(
        widerWall,
      );
      expect(plan.bases.some((base) => base.id === "bottle")).toBe(false);
    },
  );

  it("places the 300 mm cargo through a 350 mm merged opening at the same start", () => {
    const room: DesignRoom = {
      shape: "L",
      widthMm: 1850,
      depthMm: 1600,
      heightMm: 2600,
    };
    const plan = planFor(room);
    expect(plan.floorWidthsMm.A).toEqual([600, 300]);
    expect(plan.remainderMm.A).toBe(50);

    const shell = buildLShellDesign({
      room,
      occurredAt: OCCURRED_AT,
      compositionPlan: { floorWidthsMm: plan.floorWidthsMm },
    });
    const coveringOpening = facesOf(shell).voids.find((opening) => {
      if (opening.wall !== "A" || Math.round(opening.y0 * 1000) !== 0)
        return false;
      const interval = openingIntervalOf(opening);
      return interval.startMm === 1500 && interval.endMm === 1850;
    });
    expect(coveringOpening).toBeDefined();

    const result = generateKitchen({
      room,
      occurredAt: OCCURRED_AT,
      probeAt: createFakeProbeFactory(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason.code);
    const cargo = result.design.placements.find(
      (placement) => placement.body.buildId === "base-bottle-cargo",
    );
    expect(cargo).toMatchObject({ wall: "A", alongMm: 1650 });
    expect(cargo?.body.widthMm).toBe(300);
    expect(result.log.steps.find((step) => step.id === "bottle")).toMatchObject(
      { status: "placed", buildId: "base-bottle-cargo" },
    );
  });

  // A bottle standing last on its wall shares one floor opening with the run-end remainder whenever
  // the two together reach no further than 800 mm (`MAX_EMPTY_COLUMN_WIDTH_MM`), so the bottle is
  // inserted into an opening wider than itself. Both mirrors, so no wall letter decides it.
  //
  // 7D5b S0b / ADR 0110 M11: the four in-policy rows (3300 x 1700, 3502 x 1700, 900 x 4100 and
  // 1500 x 4302) now keep the oven tower and stand no bottle. No approved room is left with 300 or
  // 502 mm past a last-standing bottle: 300 mm past the bottle is 600 past the core, where the tower
  // stands unless a pan drawer depends on the bottle, and beside a pan drawer Q-H6c takes the bottle.
  // Swept over all 25 510 101 approved rooms at 1 mm and 2 600 mm, the widest left is 298 on either
  // wall, so the in-policy rows below are that edge and run through `generateKitchen`; the 300 and
  // 502 rows keep their subject off-policy, below the column height, with the 500 mm cap.
  it.each([
    {
      name: "wall A, remainder 298 merges into one 598 mm opening",
      room: { shape: "L", widthMm: 2098, depthMm: 1600, heightMm: 2600 },
      wall: "A",
      bottleStartMm: 1500,
      remainderMm: 298,
      trailingOpenings: [{ startMm: 1500, endMm: 2098 }],
    },
    {
      name: "wall B, remainder 298 merges into one 598 mm opening",
      room: { shape: "L", widthMm: 900, depthMm: 2798, heightMm: 2600 },
      wall: "B",
      bottleStartMm: 2100,
      remainderMm: 298,
      trailingOpenings: [{ startMm: 2100, endMm: 2698 }],
    },
  ] as const)(
    "places the last-on-its-wall cargo at its planned start and 300 mm, $name",
    ({ room, wall, bottleStartMm, remainderMm, trailingOpenings }) => {
      const plan = planFor(room);
      const bottle = plan.bases.find((base) => base.id === "bottle");
      const lastEndOnWall = Math.max(
        ...plan.bases
          .filter((base) => base.wall === wall)
          .map((base) => base.endMm),
      );
      expect(bottle).toMatchObject({ wall, startMm: bottleStartMm });
      expect(bottle?.endMm).toBe(lastEndOnWall);
      expect(plan.remainderMm[wall]).toBe(remainderMm);

      const shell = buildLShellDesign({
        room,
        occurredAt: OCCURRED_AT,
        compositionPlan: { floorWidthsMm: plan.floorWidthsMm },
      });
      const floorOpeningsFromTheBottle = facesOf(shell)
        .voids.filter(
          (opening) =>
            opening.wall === wall && Math.round(opening.y0 * 1000) === 0,
        )
        .map(openingIntervalOf)
        .filter((interval) => interval.startMm >= bottleStartMm)
        .sort((left, right) => left.startMm - right.startMm);
      expect(floorOpeningsFromTheBottle).toEqual(trailingOpenings);

      const result = generateKitchen({
        room,
        occurredAt: OCCURRED_AT,
        probeAt: createFakeProbeFactory(),
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.reason.code);
      const cargo = result.design.placements.find(
        (placement) => placement.body.buildId === "base-bottle-cargo",
      );
      expect(cargo).toMatchObject({
        wall,
        alongMm: bottleStartMm + BOTTLE_WIDTH_MM / 2,
      });
      expect(cargo?.body.widthMm).toBe(BOTTLE_WIDTH_MM);
      expect(
        result.log.steps.find((step) => step.id === "bottle"),
      ).toMatchObject({ status: "placed", buildId: "base-bottle-cargo" });
    },
  );
  // 7D5b S0b / ADR 0110 M11: the 300 mm merge and the 502 mm non-merging neighbour, moved off-policy
  // with the cap below because no approved room reaches either any more (see the in-policy rows).
  // Below the 2 200 mm column no block stands, so M11 has nothing to keep; the pan drawer stands
  // first and the bottle last beside it. Planner and shell only, as for the cap. The 502 neighbour
  // is still 502, not 501: the floor run's planned end moves in 2 mm steps.
  it.each([
    {
      name: "wall A, remainder 300 merges into one 600 mm opening, 3900 x 1700",
      room: { shape: "L", widthMm: 3900, depthMm: 1700, heightMm: 2199 },
      wall: "A",
      bottleStartMm: 3300,
      remainderMm: 300,
      trailingOpenings: [{ startMm: 3300, endMm: 3900 }],
    },
    {
      name: "wall A, remainder 502 stays a separate opening, 4102 x 1700",
      room: { shape: "L", widthMm: 4102, depthMm: 1700, heightMm: 2199 },
      wall: "A",
      bottleStartMm: 3300,
      remainderMm: 502,
      trailingOpenings: [
        { startMm: 3300, endMm: 3600 },
        { startMm: 3600, endMm: 4102 },
      ],
    },
    {
      name: "wall B, remainder 300 merges into one 600 mm opening, 900 x 4700",
      room: { shape: "L", widthMm: 900, depthMm: 4700, heightMm: 2199 },
      wall: "B",
      bottleStartMm: 4000,
      remainderMm: 300,
      trailingOpenings: [{ startMm: 4000, endMm: 4600 }],
    },
    {
      name: "wall B, remainder 502 stays a separate opening, 900 x 4902",
      room: { shape: "L", widthMm: 900, depthMm: 4902, heightMm: 2199 },
      wall: "B",
      bottleStartMm: 4000,
      remainderMm: 502,
      trailingOpenings: [
        { startMm: 4000, endMm: 4300 },
        { startMm: 4300, endMm: 4802 },
      ],
    },
  ] as const)(
    "keeps the last-on-its-wall cargo's opening shape off-policy, $name",
    ({ room, wall, bottleStartMm, remainderMm, trailingOpenings }) => {
      const plan = planFor(room);
      const bottle = plan.bases.find((base) => base.id === "bottle");
      const lastEndOnWall = Math.max(
        ...plan.bases
          .filter((base) => base.wall === wall)
          .map((base) => base.endMm),
      );
      expect(room.heightMm).toBeLessThan(DECLARED_COLUMNS.columnHeightMm);
      expect(bottle).toMatchObject({ wall, startMm: bottleStartMm });
      expect(bottle?.endMm).toBe(lastEndOnWall);
      expect(plan.remainderMm[wall]).toBe(remainderMm);

      const shell = buildLShellDesign({
        room,
        occurredAt: OCCURRED_AT,
        compositionPlan: { floorWidthsMm: plan.floorWidthsMm },
      });
      expect(
        facesOf(shell)
          .voids.filter(
            (opening) =>
              opening.wall === wall && Math.round(opening.y0 * 1000) === 0,
          )
          .map(openingIntervalOf)
          .filter((interval) => interval.startMm >= bottleStartMm)
          .sort((left, right) => left.startMm - right.startMm),
      ).toEqual(trailingOpenings);
    },
  );

  // The inclusive cap itself, 300 + 500 = 800 mm in one opening, is reachable only where no block can
  // stand to refuse the pan drawer the bottle-first order: a ceiling 1 mm below the 2200 mm column,
  // which the approved policy's 2200 mm floor excludes. A planner and shell witness, past the policy on
  // purpose (M7 7A3); `generateKitchen` is not asked, because its own invariant check rejects a room
  // lower than the fridge it places (PLACEMENT_ABOVE_ROOM).
  it.each([
    {
      name: "wall A, 4100 x 1700",
      room: { shape: "L", widthMm: 4100, depthMm: 1700, heightMm: 2199 },
      wall: "A",
      bottleStartMm: 3300,
      trailingOpenings: [{ startMm: 3300, endMm: 4100 }],
    },
    {
      name: "wall B, 900 x 4900",
      room: { shape: "L", widthMm: 900, depthMm: 4900, heightMm: 2199 },
      wall: "B",
      bottleStartMm: 4000,
      trailingOpenings: [{ startMm: 4000, endMm: 4800 }],
    },
  ] as const)(
    "merges the last-on-its-wall cargo with a 500 mm remainder into one 800 mm opening, $name",
    ({ room, wall, bottleStartMm, trailingOpenings }) => {
      const plan = planFor(room);
      const bottle = plan.bases.find((base) => base.id === "bottle");
      const lastEndOnWall = Math.max(
        ...plan.bases
          .filter((base) => base.wall === wall)
          .map((base) => base.endMm),
      );
      expect(room.heightMm).toBeLessThan(DECLARED_COLUMNS.columnHeightMm);
      expect(bottle).toMatchObject({ wall, startMm: bottleStartMm });
      expect(bottle?.endMm).toBe(lastEndOnWall);
      expect(plan.remainderMm[wall]).toBe(500);

      const shell = buildLShellDesign({
        room,
        occurredAt: OCCURRED_AT,
        compositionPlan: { floorWidthsMm: plan.floorWidthsMm },
      });
      expect(
        facesOf(shell)
          .voids.filter(
            (opening) =>
              opening.wall === wall && Math.round(opening.y0 * 1000) === 0,
          )
          .map(openingIntervalOf)
          .filter((interval) => interval.startMm >= bottleStartMm),
      ).toEqual(trailingOpenings);
    },
  );
});

describe("7D5 S1 criterion 1 — the bottle follows the hob in the reading order on the reversed wall", () => {
  // Criterion 1's discriminating population is the hob on the wall laid out in reverse, where the
  // reading order runs against the spatial one: the bottle *after* the hob stands on the hob's
  // corner side. The approved policy never composes the hob onto that wall (`qa-7d8-the-run-follows-
  // the-wider-wall`, 7b), so the runs are declared here, as 7b declares them, over real rooms whose
  // narrower entered wall is the reversed one. Both mirrors are swept so no wall letter decides it.
  //
  // The reversed wall holds the whole core (2 500 mm) with room for the 300 mm bottle; the other
  // wall cannot hold the bottle. Keeping every core role where it stands without the bottle and
  // appending the bottle on the hob's corner side refuses nothing and moves no core role.
  const REVERSED_WALL_HOLDS_CORE_AND_BOTTLE = [
    {
      name: "wall A read in reverse",
      room: { shape: "L", widthMm: 1500, depthMm: 4000, heightMm: 2600 },
      runs: {
        A: { wall: "A", startMm: 900, endMm: 3900 },
        B: { wall: "B", startMm: 900, endMm: 1150 },
      },
      reversedWall: "A",
    },
    {
      name: "wall B read in reverse",
      room: { shape: "L", widthMm: 4000, depthMm: 1500, heightMm: 2600 },
      runs: {
        A: { wall: "A", startMm: 900, endMm: 1150 },
        B: { wall: "B", startMm: 1000, endMm: 4000 },
      },
      reversedWall: "B",
    },
  ] as const satisfies readonly {
    readonly name: string;
    readonly room: DesignRoom;
    readonly runs: Readonly<Record<TwoWallDispatch, GenerationRun>>;
    readonly reversedWall: TwoWallDispatch;
  }[];

  function planOnDeclaredRuns(
    room: DesignRoom,
    runs: Readonly<Record<TwoWallDispatch, GenerationRun>>,
  ): KitchenCompositionPlan {
    return planKitchenComposition({ room, runs, columns: DECLARED_COLUMNS });
  }

  it.each(REVERSED_WALL_HOLDS_CORE_AND_BOTTLE)(
    "stands the bottle against the hob's corner side, $name",
    ({ room, runs, reversedWall }) => {
      const plan = planOnDeclaredRuns(room, runs);
      const hob = plan.bases.find((base) => base.role === "hob");
      const bottle = plan.bases.find((base) => base.id === "bottle");

      expect(plan.dropped).toEqual([]);
      expect(hob?.wall).toBe(reversedWall);
      expect(bottle).toMatchObject({
        wall: reversedWall,
        buildId: "base-bottle-cargo",
        widthMm: BOTTLE_WIDTH_MM,
      });
      // Laid out in reverse, *after* the hob is towards the corner: the bottle ends where the hob
      // starts. A rule written for the non-reversed wall would put it at the hob's free-end side.
      expect(bottle?.endMm).toBe(hob?.startMm);
    },
  );

  it.each([
    ...REVERSED_WALL_HOLDS_CORE_AND_BOTTLE,
    {
      // 7b's declared arm: the other wall *can* hold the bottle, and the reversed wall also leaves
      // storage between the hob and the corner.
      name: "wall A read in reverse, with storage between the hob and the corner",
      room: { shape: "L", widthMm: 1500, depthMm: 4000, heightMm: 2600 },
      runs: {
        A: { wall: "A", startMm: 900, endMm: 4600 },
        B: { wall: "B", startMm: 900, endMm: 1400 },
      },
      reversedWall: "A",
    },
  ] as const)(
    "reads the bottle immediately after the hob and nowhere else, $name",
    ({ room, runs }) => {
      const reading = inReadingOrder(planOnDeclaredRuns(room, runs));
      const hobAt = reading.findIndex((base) => base.role === "hob");

      expect(reading.filter((base) => base.id === "bottle")).toHaveLength(1);
      expect(reading[hobAt + 1]?.id).toBe("bottle");
    },
  );
});
