// M7 wave 7D5 — the run's optional members after the core: the bottle cargo, the pan drawer and the
// threshold drawer, and the owner's rulings on when each stands (ADR 0110 Amendments H1, J, K and L).
//
// Every decision here appends to, or inserts into, a run whose core `generation-priorities.ts`
// already chose and cut, on that run's own cut, so no core role is ever dropped or carried across the
// corner by one of them. The plan itself and the tall-end block are the composer's; they arrive
// through `CompositionContext` rather than by import, because the composer is what calls this module.

import {
  BOTTLE_CARGO_BUILD_ID,
  isComposedStorageSlot,
  PAN_DRAWER_BASE_BUILD_ID,
  THREE_DRAWER_BASE_BUILD_ID,
} from "./body-choice.js";
import { STORAGE_BODY_WIDTH_MM } from "./leftover-rule.js";
import {
  fitsAcrossTheCorner,
  HOB_ROLE,
  type GenerationAncillaryRunItem,
  type KitchenCompositionPlan,
  type PlannedGenerationBase,
  type RunLayout,
  type WallCapacities,
} from "./run-layout.js";

/** ADR 0110 Amendment H1: the 300 mm cargo follows the hob in the reading order. It is an optional
 * member of the run rather than a core role: the planner omits it when the same kept core cannot fit,
 * and places it only where every kept core role stays on the wall it has without the bottle (ADR 0120
 * Amendment E). Where the pan drawer stood against the core alone, the bottle is decided after it and
 * gives way to it (ADR 0110 Q-H6b) and to every tall column the pan-drawer kitchen has (Q-H6c: a pan
 * drawer and the whole block over a bottle and one column fewer). Everywhere else S1's rule holds and
 * it may still cost a storage slot or a tall column (E3, J2) — but not the oven tower where no pan
 * drawer stands beside it (M11). With the whole core on the prefix wall
 * it stands on the hob's wall or not at all, because the owner's order reads it right after the hob
 * and ADR 0110 Amendment J3 (the reversed-wall ruling) accepts that it costs that wall one storage
 * slot — a population empty in the approved range. The catalogue remains the authority for the row's
 * offered 200/300 mm set; 300 mm here is the owner-ruled module the generated run chooses, just as the
 * priorities choose their widths.
 *
 * Standing last on its wall is safe even when the trailing run-end remainder merges with the bottle's
 * tile into one wider floor opening: `plannedVoid` in `generate-kitchen.ts` accepts an
 * opening at the same start whose end reaches at least the body's end, and a trailing remainder only
 * extends the opening's end, never moves its start. That argument now carries weight only outside the
 * approved policy: inside it, Q-H6b stands the pan drawer where a 500 mm remainder would have been, so
 * the widest in-policy merge is 298 mm. */
const BOTTLE_CARGO: GenerationAncillaryRunItem = {
  id: "bottle",
  role: "storage",
  buildId: BOTTLE_CARGO_BUILD_ID,
  widthMm: 300,
};

/** ADR 0110 Amendment J1 (Q-H6 = A) and Q-H6b (owner rulings 2026-09-21): two deep pan drawers stand
 * immediately before the hob in the reading order, on the hob's own wall, wherever that keeps every
 * kept core role on the wall it has without it and reduces no tall column, both measured against the
 * run it is decided against: the core alone, or, in the ADR 0110 K3 fallback, S1's bottle kitchen.
 * Nothing else gates it — no drawer count and no proportion (Amendment G6, H7). It is one storage
 * module wide, so the leftover rule's 600 mm grid is what it takes from, and where it takes the hob
 * wall's only slot the drawer slot after the hob is gone. It is decided **before** the bottle, against
 * the run without it, and wins where the two cannot both stand: bottles fit in the cabinet above it,
 * while a whole deep drawer holds far more (Q-H6b); nor does the bottle then take a tall column from
 * it (Q-H6c). Where it is refused against the core alone, it is tried again after S1's bottle, and
 * stands where it costs that bottle kitchen nothing, so a room that holds both keeps both. */
const PAN_DRAWER: GenerationAncillaryRunItem = {
  id: "pan-drawer",
  role: "storage",
  buildId: PAN_DRAWER_BASE_BUILD_ID,
  widthMm: STORAGE_BODY_WIDTH_MM,
};

/** ADR 0110 Q-H5 (owner ruling 2026-09-21): the drawer cabinet H1 reads after the bottle, *"if space
 *  for a large number of cabinets"* — added by `planWithThresholdDrawer` only. Its own id rather than a
 *  composed storage slot's, so `isComposedStorageSlot` answers false for it, as for the bottle and the
 *  pan drawer. */
const THRESHOLD_DRAWER: GenerationAncillaryRunItem = {
  id: "threshold-drawer",
  role: "storage",
  buildId: THREE_DRAWER_BASE_BUILD_ID,
  widthMm: STORAGE_BODY_WIDTH_MM,
};

/** ADR 0110 wave 7D5 E1, the owner's threshold: *"remains so much space to includ also 6 more
 *  cabinets then 2 are drawers"*. A count of plain cabinets (*D*), not a ratio. */
const LARGE_RUN_PLAIN_CABINET_COUNT = 6;

/** E1's *"2 are drawers"* among those plain cabinets. */
const LARGE_RUN_DRAWER_COUNT = 2;

/** The budget of every item that must keep the whole tall block: the pan drawer (J1), the bottle
 *  beside it (Q-H6c), and the threshold drawer in the bottle's place when it is tried first (L2). */
const NO_TALL_COLUMN = 0;

/** Owner ruling on Q-H5, 2026-09-21 (ADR 0110 L3): the threshold drawer may cost one tall column, and
 *  no more — a run where every candidate that fits would cost two keeps its columns and gets no
 *  threshold drawer. */
const THRESHOLD_DRAWER_MOST_COLUMNS_IT_MAY_COST = 1;

/** The drawer modules composed astride the hob, which *D* counts beside the storage run's slots. */
const DRAWER_MODULE_IDS: ReadonlySet<string> = new Set([
  PAN_DRAWER.id,
  THRESHOLD_DRAWER.id,
]);

const STORAGE_ROLE: PlannedGenerationBase["role"] = "storage";

/** The bodies that count as drawers among *D*. */
const DRAWER_CABINET_BUILD_IDS: ReadonlySet<string> = new Set([
  THREE_DRAWER_BASE_BUILD_ID,
  PAN_DRAWER_BASE_BUILD_ID,
]);

/** What the optional items are decided against: the free run on each side of the corner, and the
 *  composer's own answers for a run — the plan it builds and how many tall columns its block keeps.
 *  Both answers are bound to one kept core and one room by the composer. */
export interface CompositionContext {
  readonly capacityMm: WallCapacities;
  readonly planOf: (run: RunLayout) => KitchenCompositionPlan;
  readonly tallColumnCountOf: (run: RunLayout) => number;
}

/** The pan drawer is decided first, against the kept core alone. Where it stands there, the bottle
 *  follows only where it costs that kitchen no tall column — so where the two cannot both stand the
 *  pan drawer wins (ADR 0110 Q-H6b), and it keeps the block (Q-H6c). Where it does not, S1's bottle
 *  is decided first and the pan drawer is tried beside it (coordinator ruling on Q-H6b's scope), and
 *  the bottle is omitted where it alone would take the oven tower (M11). Only
 *  once both are decided is the threshold drawer (Q-H5) decided, on the plan they leave. */
export function planWithPanDrawerThenBottle(
  context: CompositionContext,
  core: RunLayout,
): KitchenCompositionPlan {
  const panDrawerFirst = withPanDrawerWhereNothingIsLost(context, core);
  const run = hasPanDrawer(panDrawerFirst)
    ? withBottleWhereNoColumnIsLost(context, panDrawerFirst)
    : withS1sBottleThenThePanDrawer(context, core);
  return planWithThresholdDrawer(context, run);
}

function hasPanDrawer(run: RunLayout): boolean {
  return run.ordered.includes(PAN_DRAWER);
}

/** The ADR 0110 K3 fallback, where the pan drawer was refused against the core alone: S1's bottle,
 *  then the pan drawer beside it — unless the oven tower is kept over that bottle (M11), in which
 *  case the run is the core, on which the pan drawer was already refused. */
function withS1sBottleThenThePanDrawer(
  context: CompositionContext,
  core: RunLayout,
): RunLayout {
  const bottleKitchen = withPanDrawerWhereNothingIsLost(
    context,
    withBottleWhereTheCoreStays(core, context.capacityMm),
  );
  const runs = { bottleKitchen, core };
  return isTheOvenTowerKeptOverTheBottle(context, runs) ? core : bottleKitchen;
}

/** **ADR 0110 Amendment M11** (owner ruling 2026-09-21, narrowed the same session): where S1's bottle
 *  would take the kitchen's oven tower, *"keep the tower and drop the bottle"* — but only where no pan
 *  drawer depends on that bottle, since there the hob carries the oven and the pan drawer wins. The
 *  tower is the block's innermost column (E12.2), so a block falling from at least one column to none
 *  **is** the tower lost; no `buildId` is read. */
function isTheOvenTowerKeptOverTheBottle(
  context: CompositionContext,
  runs: { readonly bottleKitchen: RunLayout; readonly core: RunLayout },
): boolean {
  const hasATallColumn = (run: RunLayout) => context.tallColumnCountOf(run) > 0;
  return (
    !hasPanDrawer(runs.bottleKitchen) &&
    hasATallColumn(runs.core) &&
    !hasATallColumn(runs.bottleKitchen)
  );
}

/**
 * **ADR 0110 Q-H5, the threshold drawer** (owner ruling 2026-09-21). E1's rule: where the plain
 * cabinets reach `LARGE_RUN_PLAIN_CABINET_COUNT`, *"2 are drawers"*; H1's order puts the extra one
 * after the bottle — *"hub => bottle cabinets (if space for a large number of cabinets, the drawer
 * cabinet)"*. It is decided on the plan the pan drawer and the bottle leave, and `THRESHOLD_DRAWER`
 * (one 600 mm module) is added after the hob (and the bottle) where that plan is short of drawers.
 * The bottle gives way only where removing it is what lets the drawer fit within its column budget
 * (L2); otherwise the drawer stands after the bottle at the cost of at most one column, and where
 * every candidate would cost two it is not added (L3). It never costs a core role or moves one across
 * the corner: every candidate appends to the decided run on that run's own cut. Every plan it reads
 * from `planOf` already carries its dishwasher, which is not a plain cabinet, so *D* excludes it
 * (ADR 0110 Amendment M2, *"dishwasher first"*).
 */
function planWithThresholdDrawer(
  context: CompositionContext,
  run: RunLayout,
): KitchenCompositionPlan {
  const plan = context.planOf(run);
  if (!isShortOfTheLargeRunsDrawers(plan)) return plan;

  const withDrawer = cheapestThresholdDrawerRun(context, run);
  return withDrawer === undefined ? plan : context.planOf(withDrawer);
}

/** The first of the owner's candidates, in precedence order, that fits and stays within its column
 *  budget against the decided run; `undefined` where none does. */
function cheapestThresholdDrawerRun(
  context: CompositionContext,
  run: RunLayout,
): RunLayout | undefined {
  return thresholdDrawerCandidatesInPrecedence(run).find(
    ({ candidate, columnsItMayCost }) =>
      isAffordableWithinColumnBudget(
        context,
        { candidate, without: run },
        columnsItMayCost,
      ),
  )?.candidate;
}

/** A threshold-drawer run and the tall columns it may cost the decided run. */
interface ThresholdDrawerCandidate {
  readonly candidate: RunLayout;
  readonly columnsItMayCost: number;
}

/**
 * The threshold drawer's candidates in the owner's precedence (ADR 0110 L2, L3). Where the run has
 * no bottle, the bottle's place and after the bottle are the same run, and the repeat is harmless.
 *
 * 1. **In the bottle's place, at no column** — the owner's narrow kitchen, *"if the bottle cabinet is
 *    removed a new drawer cabinet fits"*. Live in the approved policy.
 * 2. **After the bottle, at most one column** — *"if there is enough place to have a bottle cabinet it
 *    should be kept and not replaced"*, so a column goes before the bottle does. Live in the policy.
 * 3. **In the bottle's place, at most one column** — where keeping the bottle would cost two columns,
 *    removing it is again what lets the drawer fit within L3's one, which is L2's *"only scenario"*.
 *    **Unreachable in the approved policy** (the logic review measured 0 differences with and without
 *    it over 1,792,077 rooms at 7 heights); it is kept, against ADR 0093 decision 1, because declared
 *    runs reach it — 6000 × 5000 × 2200 with runs A 3350 / B 4300, where step 2 costs both columns
 *    and this step one — and omitting it there would refuse a drawer the owner's words admit.
 *
 * **Omitted: after the bottle at no column.** Structurally unreachable, not merely unmeasured: a run
 * short of drawers has no storage slot after its hob (that slot would be a drawer), so a 600 mm
 * module appended there always takes a column's module or does not fit.
 *
 * **L3's limit binds nowhere in the approved policy.** On declared runs it binds as a choice — it is
 * what refuses step 2 at the 3350 witness — but no declared run was found where it binds as a refusal:
 * over 2,397,024 declared runs (wave 7D5 S3), a candidate that fit never cost more than one column in
 * the bottle's place, and every refused run was one where no candidate fit at all.
 */
function thresholdDrawerCandidatesInPrecedence(
  run: RunLayout,
): readonly ThresholdDrawerCandidate[] {
  const inTheBottlesPlace = withThresholdDrawerAfterTheHob(
    withoutTheBottle(run),
  );
  const afterTheBottle = withThresholdDrawerAfterTheHob(run);
  const budget = THRESHOLD_DRAWER_MOST_COLUMNS_IT_MAY_COST;
  return [
    { candidate: inTheBottlesPlace, columnsItMayCost: NO_TALL_COLUMN },
    { candidate: afterTheBottle, columnsItMayCost: budget },
    { candidate: inTheBottlesPlace, columnsItMayCost: budget },
  ];
}

/** E1's threshold, applied to the plan: *D* — the storage run's composed slots plus the drawer
 *  modules astride the hob; never the fridge, sink, hob, preparation cabinet, bottle or a tall column
 *  — reaches the owner's count and the kitchen is short of drawers among them. */
function isShortOfTheLargeRunsDrawers(plan: KitchenCompositionPlan): boolean {
  const plainCabinets = plan.bases.filter(isPlainCabinet);
  return (
    plainCabinets.length >= LARGE_RUN_PLAIN_CABINET_COUNT &&
    isShortOfDrawers(plainCabinets)
  );
}

/** E1's *"2 are drawers"*, counted over the plain cabinets *D* and nothing else. */
function isShortOfDrawers(
  plainCabinets: readonly PlannedGenerationBase[],
): boolean {
  const drawers = plainCabinets.filter((base) =>
    DRAWER_CABINET_BUILD_IDS.has(base.buildId),
  );
  return drawers.length < LARGE_RUN_DRAWER_COUNT;
}

/** Keyed on the storage role, never on the body: in (e) rooms the pan drawer IS the preparation
 *  cabinet (id and role `preparation`, ADR 0110 M9), and E1 says *D* never counts the preparation
 *  cabinet. Re-keying *D* on the pan-drawer body would count it. */
function isPlainCabinet(base: PlannedGenerationBase): boolean {
  return (
    base.role === STORAGE_ROLE &&
    (isComposedStorageSlot(base) || DRAWER_MODULE_IDS.has(base.id))
  );
}

/** `THRESHOLD_DRAWER` read last, after the hob and after the bottle where one stands (H1's order). */
function withThresholdDrawerAfterTheHob(run: RunLayout): RunLayout {
  return withLastInReadingOrder(run, THRESHOLD_DRAWER);
}

/** The run with the bottle taken out of it, on the cut that keeps every other item on its wall. */
function withoutTheBottle(run: RunLayout): RunLayout {
  const bottleAt = run.ordered.indexOf(BOTTLE_CARGO);
  if (bottleAt < 0) return run;
  return {
    ordered: run.ordered.filter((item) => item !== BOTTLE_CARGO),
    cut: bottleAt < run.cut ? run.cut - 1 : run.cut,
  };
}

/**
 * The run with `PAN_DRAWER` read immediately before the hob where it fits in place and the tall block
 * keeps every column the run has without it (ADR 0110 Amendment J1, candidate A), and the run
 * unchanged otherwise. Every core role keeping its wall is guaranteed by the in-place construction,
 * not checked (ADR 0093 decision 1): only the cut that keeps every other item on its wall is offered,
 * since a pan drawer that fits only by re-cutting the core would carry a role across the corner.
 * Candidate C would be one more conjunct — *D* ≥ 6 — and the owner refused it.
 */
function withPanDrawerWhereNothingIsLost(
  context: CompositionContext,
  without: RunLayout,
): RunLayout {
  const withPanDrawer = withPanDrawerBeforeTheHob(without);
  const runs = { candidate: withPanDrawer, without };
  return isAffordableWithinColumnBudget(context, runs, NO_TALL_COLUMN)
    ? withPanDrawer
    : without;
}

/** `PAN_DRAWER` inserted immediately before the hob in the reading order, on the hob's side of the
 *  cut: where the hob reads on the prefix wall the cut moves one item later so the pan drawer stays
 *  there with it, and every other item keeps its wall either way. */
function withPanDrawerBeforeTheHob(run: RunLayout): RunLayout {
  const hobAt = run.ordered.findIndex((item) => item.role === HOB_ROLE);
  return {
    ordered: [
      ...run.ordered.slice(0, hobAt),
      PAN_DRAWER,
      ...run.ordered.slice(hobAt),
    ],
    cut: hobAt < run.cut ? run.cut + 1 : run.cut,
  };
}

/** S1's bottle: the kept core with the bottle appended across a cut that leaves every kept role on
 *  the wall it had without the bottle, or the core unchanged where that cut does not fit. Testing
 *  that cut directly, rather than asking the composer to re-prefer one, is what lets a bottle stand
 *  when the whole core is on the prefix wall; and no core role can be refused, dropped or carried off
 *  the wider wall by it (ADR 0120 Amendment E). */
function withBottleWhereTheCoreStays(
  run: RunLayout,
  capacityMm: WallCapacities,
): RunLayout {
  const withBottle = withBottleAfterTheHob(run);
  return isBottleAffordable(withBottle, capacityMm) ? withBottle : run;
}

/** **The bottle once the pan drawer stands** (ADR 0110 Q-H6c): appended after the hob where it fits
 *  and the tall block keeps every column the pan-drawer kitchen has — the owner chose the pan drawer
 *  and the whole block over the pan drawer, a bottle and one column fewer — and the run unchanged
 *  otherwise. */
function withBottleWhereNoColumnIsLost(
  context: CompositionContext,
  without: RunLayout,
): RunLayout {
  const withBottle = withBottleAfterTheHob(without);
  const runs = { candidate: withBottle, without };
  return isAffordableWithinColumnBudget(context, runs, NO_TALL_COLUMN)
    ? withBottle
    : without;
}

/** **S1's bottle condition, and the one place it is stated** (ADR 0110 Amendments J2 and J3): it
 *  stands where its in-place cut fits. On its own it may cost a storage slot or a tall column (E3), so
 *  neither is compared here — only `withBottleWhereNoColumnIsLost` adds the column (Q-H6c); every
 *  earlier item keeping its wall is guaranteed by the construction. */
function isBottleAffordable(
  withBottle: RunLayout,
  capacityMm: WallCapacities,
): boolean {
  return fitsAcrossTheCorner(withBottle.ordered, withBottle.cut, capacityMm);
}

/** The bottle is the last item read, and the hob the last before it, so the run's own cut always
 *  leaves every earlier item in place. Where that cut takes the whole run onto the prefix wall, the
 *  bottle stands there too, on the hob's wall (ADR 0110 Amendments H1 and J3); the run's cut would put
 *  it alone at the other wall's corner — next in reading order but not beside the hob — so where the
 *  prefix wall cannot take it, it is omitted instead. */
function withBottleAfterTheHob(run: RunLayout): RunLayout {
  return withLastInReadingOrder(run, BOTTLE_CARGO);
}

/** `item` appended to the reading order on the run's own cut, so every earlier item keeps its wall;
 *  where the whole run stands on the prefix wall, the item stands there too, beside the last one. */
function withLastInReadingOrder(
  run: RunLayout,
  item: GenerationAncillaryRunItem,
): RunLayout {
  const isWholeRunOnThePrefixWall = run.cut === run.ordered.length;
  return {
    ordered: [...run.ordered, item],
    cut: isWholeRunOnThePrefixWall ? run.cut + 1 : run.cut,
  };
}

/**
 * **The one condition every optional item past S1's bottle is measured by:** the candidate fits in
 * place and its tall-end block loses at most `columnsItMayCost` of the columns the run without it has.
 * The fit is tested first because a run that overflows its wall has no leftover to plan. The budget is
 * each ruling's: `NO_TALL_COLUMN` for the pan drawer and the bottle beside it,
 * `THRESHOLD_DRAWER_MOST_COLUMNS_IT_MAY_COST` for the threshold drawer's later candidates.
 */
function isAffordableWithinColumnBudget(
  context: CompositionContext,
  runs: { readonly candidate: RunLayout; readonly without: RunLayout },
  columnsItMayCost: number,
): boolean {
  const { candidate } = runs;
  return (
    fitsAcrossTheCorner(candidate.ordered, candidate.cut, context.capacityMm) &&
    tallColumnsLost(context, runs) <= columnsItMayCost
  );
}

/** How many of the run's tall columns the candidate's block no longer has; never negative. */
function tallColumnsLost(
  context: CompositionContext,
  runs: { readonly candidate: RunLayout; readonly without: RunLayout },
): number {
  return Math.max(
    0,
    context.tallColumnCountOf(runs.without) -
      context.tallColumnCountOf(runs.candidate),
  );
}
