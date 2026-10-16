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

// `DesignWall` includes "C" (ADR 0132), but `planKitchenComposition` is the two-wall composer, so this suite
// narrows to A and B.
type TwoWallDispatch = Extract<DesignWall, "A" | "B">;

const OCCURRED_AT = "2026-09-11T12:00:00.000Z";
const GRID_STEP_MM = 10;
const BOTTLE_WIDTH_MM = 300;
const PAN_DRAWER_WIDTH_MM = 600;
const STORAGE_MODULE_MM = 600;
const THRESHOLD_DRAWER_WIDTH_MM = 600;
const PAN_DRAWER_BODY = "base-panbank";
/** The traded dishwasher's body and width, literals as every body here. */
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

/** The K3 fallback's bottle, derived (ADR 0110 M11). The kept core's block stands at least one column
 *  (its innermost the oven tower), the bottle after the hob leaves it none, and no pan drawer could stand
 *  beside that bottle without costing a further column — so the tower is kept and the bottle omitted.
 *  Asked only where Q-H6b / Q-H6c did not decide the room. */
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

/** Does the threshold drawer stand in the bottle's place, and would that place have cost the kitchen no
 *  tall column (ADR 0110 Q-H5)? The kitchen the bottle stood in is the kept core with the pan drawer
 *  (where one stands) before the hob and the bottle after it, on the pre-S1 cut; the drawer in its place
 *  is that kitchen with the 300 mm bottle swapped for a 600 mm module. */
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
  // By body: the (e) arrangement re-identifies the pan drawer as the preparation (ADR 0110 M1/M2/M9).
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

/** The bottle gave way to a traded dishwasher (ADR 0110 M7(d), M10). The kitchen the bottle stood in —
 *  the kept core, the pan drawer before the hob where one stands, the bottle last — could not take the
 *  dishwasher after the sink for exactly one pantry column ((b): it does not fit, or it costs no column
 *  or the last one), and without the bottle it takes it keeping every column ((d)).
 *  Asked only where the plan's dishwasher stands among the items after the sink. */
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

/** The 600 mm dishwasher read directly after the sink, on the sink's side of the cut. */
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

/** A dishwasher read directly after the sink with the next item — not a composed slot — directly after it
 *  on the same wall. Only a trade inserts one among the items; M1 converts a slot, and (e) the preparation
 *  cabinet, which the pan drawer's preparation role names (ADR 0110 M7/M10). */
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

/** The oven tower traded for the dishwasher (ADR 0110 M7(c)): a traded dishwasher, no column standing, and
 *  the oven under the hob. */
function isTheOvenTowerTradedForTheDishwasher(
  plan: KitchenCompositionPlan,
): boolean {
  return (
    isADishwasherReadAmongTheItemsAfterTheSink(plan) &&
    !plan.bases.some((base) => base.id.startsWith("column:")) &&
    plan.bases.some((base) => base.buildId === "base-hob-oven")
  );
}

/** Immediately before the hob, on the hob's side of the cut. */
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

/** Read last, on the prefix wall only where the whole run already is. */
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

/** The tall-end block on the suffix wall's free end, counted by `planTallEndBlock` itself. */
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

/** The merge rows below pin 298 mm as the widest remainder a last-on-its-wall bottle shares an opening
 *  with, measured over every approved room at 1 mm. Beside a dishwasher that took the oven tower the
 *  remainder reaches 500 mm at 10 mm (the 800 mm cap); the census counts those apart and the 1 mm figure
 *  was not re-taken for them. */
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
        // Keyed by the stable composition id while the catalogue id is asserted, so a wrong build-id constant and a
        // wrong composer cannot agree (ADR 0121 decision 3(b)).
        const bottles = reading.filter((base) => base.id === "bottle");
        if (bottles.length > 1) census.duplicateBottle.push(key);
        if (bottles.length === 1) {
          census.bottleIncluded += 1;
          const hobAt = reading.findIndex((base) => base.role === "hob");
          const bottleAt = reading.findIndex((base) => base.id === "bottle");
          if (bottleAt !== hobAt + 1) census.wrongOrder.push(key);
          // Where the dishwasher took the oven tower, the bottle is last on its wall with the tower's remainder past
          // it (310-500 mm at 10 mm), merging past 298 mm; counted apart (ADR 0110 M7(c)).
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
          // The same core fits with the bottle only across a different cut, which would move a core role to the
          // other wall (ADR 0120 Amendment E).
          census.omittedForReCut += 1;
        } else {
          // The core fits the bottle in place, so the omission must have a derived reason.
          const reason = bottleGaveWayTo(room, expected);
          // By body: in an (e) room the pan drawer carries the preparation id, so an id lookup misses it (ADR 0110 M9).
          const hasPanDrawer = plan.bases.some(
            (base) => base.buildId === PAN_DRAWER_BODY,
          );
          // An oven tower traded for the dishwasher counts too (ADR 0110 M7(c)).
          const hasOvenTower =
            plan.bases.some((base) => base.buildId === "tall-oven-tower") ||
            isTheOvenTowerTradedForTheDishwasher(plan);
          if (
            reason === undefined &&
            !hasPanDrawer &&
            hasOvenTower &&
            towerWasKeptOverTheBottle(room, expected)
          ) {
            // The bottle alone would have taken the only oven tower (ADR 0110 M11).
            census.omittedForTheOvenTower += 1;
          } else if (
            reason === undefined &&
            bottleWasTradedForTheDishwasher(room, { core: expected, plan })
          ) {
            // The bottle was traded for the dishwasher (ADR 0110 M7(d)).
            census.omittedForTheDishwasher += 1;
          } else if (
            reason === undefined &&
            thresholdDrawerTookTheBottlesPlace(room, { core: expected, plan })
          ) {
            // The drawer in the bottle's place costs no column (ADR 0110 Q-H5).
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

  // One room per arm: wall A wider, wall B wider, equal walls.
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

  // 4700 x 6000 stands its bottle again (ADR 0110 M1/M2/M9); 5200 x 6000, the same wall-B-wider arm, has one
  // more door cabinet, so the threshold drawer still takes the bottle's place.
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

  // In the shell, a bottle standing last on its wall shares one floor opening with the run-end remainder whenever
  // the two reach at most 800 mm (`COMPOSITION_WIDTH_LIMIT_MM`). Both mirrors, so no wall letter decides it.
  //
  // The in-policy rows are the 298 mm edge, the widest remainder left once ADR 0110 M11 keeps the oven tower;
  // they run through `generateKitchen`.
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
  // Off-policy rows: the 300 mm merge and the 502 mm non-merging neighbour, below the 2 200 mm column so no
  // block stands. Planner and shell only. 502, not 501: the floor run's planned end moves in 2 mm steps.
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

  // The inclusive cap, 300 + 500 = 800 mm in one opening, is reachable only below the 2200 mm column height,
  // which the approved policy excludes. Planner and shell only: `generateKitchen` rejects a room lower than the
  // fridge it places (PLACEMENT_ABOVE_ROOM).
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
  // The approved policy never composes the hob onto the reversed wall (see
  // `qa-7d8-the-run-follows-the-wider-wall`), so the runs are declared over real rooms. Both mirrors are swept.
  // The reversed wall holds the 2 500 mm core plus the bottle; the other wall cannot hold the bottle.
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
      // The other wall can hold the bottle, and the reversed wall leaves storage between the hob and the corner.
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
