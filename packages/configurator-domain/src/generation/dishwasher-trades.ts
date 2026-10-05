// The dishwasher's trades (ADR 0110 Amendment M7 (b), (d), (c), in M10's precedence). Where no module
// beside the sink can convert, the dishwasher is traded in for exactly one body the run gives up: a
// pantry column, the bottle, or last of all the oven tower.
//
// `optional-run-items.ts` calls this once its pan drawer and bottle are decided and before its threshold
// drawer. The composer's `planOf` arrives through the context and the bottle-free run from the caller,
// which owns the bottle, so this module imports neither the composer nor the optional items.

import { BOTTLE_CARGO_BUILD_ID } from "./body-choice.js";
import {
  DISHWASHER_RUN_ITEM,
  hasADishwasher,
  isTheDishwasher,
} from "./dishwasher-beside-the-sink.js";
import {
  fitsAcrossTheCorner,
  HOB_ROLE,
  type GenerationRunItem,
  type KitchenCompositionPlan,
  type PlannedGenerationBase,
  type RunLayout,
  type WallCapacities,
} from "./run-layout.js";
import { DOOR_COLUMN_BUILD_ID, OVEN_TOWER_BUILD_ID } from "./tall-end-rule.js";

/** What the trades are decided against: the free run on each side of the corner, and the composer's
 *  plan for a run, bound to one kept core and one room. */
export interface DishwasherTradeContext {
  readonly capacityMm: WallCapacities;
  readonly planOf: (run: RunLayout) => KitchenCompositionPlan;
}

/** The decided run, and that run with the bottle taken out on the cut that keeps every other item on
 *  its wall — (d)'s starting point, built by the module that owns the bottle. */
export interface DishwasherTradeRuns {
  readonly run: RunLayout;
  readonly withoutTheBottle: RunLayout;
}

const SINK_ROLE: GenerationRunItem["role"] = "sink";

/**
 * ADR 0110 Amendment M7 (b), (d), (c), in M10's precedence. Where the plan has no dishwasher (no free
 * door cabinet beside the sink, and no (e) swap), it may push out, in order, a pantry column, the
 * bottle, and last the oven tower, and only if the hob has its own oven. The first trade that fits in
 * place and gives up exactly the body its ruling names is taken; where none does the run is unchanged
 * and the kitchen goes without. The fridge and the core roles are never offered: every candidate
 * inserts on the run's own cut, so each keeps its wall.
 */
export function withTheDishwasherTradedIn(
  context: DishwasherTradeContext,
  runs: DishwasherTradeRuns,
): RunLayout {
  const before = context.planOf(runs.run);
  if (hasADishwasher(before)) return runs.run;

  const planOfCandidate = plannedOncePerRun(context.planOf);
  const taken = dishwasherTradesInPrecedence(runs).find((trade) =>
    isTheTradeTaken(context, {
      trade,
      before,
      after: () => planOfCandidate(trade.candidate),
    }),
  );
  return taken?.candidate ?? runs.run;
}

/** A trade is taken where its run fits in place and gives up exactly the body its ruling names. The
 *  candidate is planned only once it fits: a run that overflows its wall has no plan to compare. */
function isTheTradeTaken(
  context: DishwasherTradeContext,
  args: {
    readonly trade: DishwasherTrade;
    readonly before: KitchenCompositionPlan;
    readonly after: () => KitchenCompositionPlan;
  },
): boolean {
  const { candidate, ruledLoss } = args.trade;
  return (
    fitsAcrossTheCorner(candidate.ordered, candidate.cut, context.capacityMm) &&
    givesUpExactlyTheRuledBody(
      { before: args.before, after: args.after() },
      ruledLoss,
    )
  );
}

/** `planOf`, asked once per run: (b) and (c) are the same candidate and differ only in what they may
 *  give up, so the composer builds its plan once for both. */
function plannedOncePerRun(
  planOf: DishwasherTradeContext["planOf"],
): DishwasherTradeContext["planOf"] {
  const plans = new Map<RunLayout, KitchenCompositionPlan>();
  return (run) => {
    const planned = plans.get(run) ?? planOf(run);
    plans.set(run, planned);
    return planned;
  };
}

/** A candidate run and the one body its ruling lets it give up. */
interface DishwasherTrade {
  readonly candidate: RunLayout;
  readonly ruledLoss: RuledLoss;
}

/** What a trade's ruling lets it give up: one body, and whether the hob's body goes with it. The hob is
 *  named by the change and never by its id: the tall-end rule decides the hob together with the block
 *  (ADR 0110 E4), so a hob that changes as the last column goes is the hob that carries the oven. */
interface RuledLoss {
  readonly buildId: string;
  readonly isTheHobSwapped: boolean;
}

/** **(b) a pantry column** (ADR 0110 M7(b), M10; M12). One door column, and nothing else: the oven
 *  tower is the block's innermost column (E12.2), so it stays, and with it the hob's body. */
const A_PANTRY_COLUMN: RuledLoss = {
  buildId: DOOR_COLUMN_BUILD_ID,
  isTheHobSwapped: false,
};

/** **(d) the bottle cabinet** (ADR 0110 M7(d), M10). The bottle and nothing else — no column, no door
 *  cabinet, no drawer — so the oven tower and the hob's body stay. */
const THE_BOTTLE: RuledLoss = {
  buildId: BOTTLE_CARGO_BUILD_ID,
  isTheHobSwapped: false,
};

/** **(c) the oven tower, the last resort** (ADR 0110 M7(c), M12), only if the hob has its own oven. The
 *  tower alone (a pantry outboard of it would go too, and is refused); the hob takes its own oven, so
 *  the kitchen keeps one. */
const THE_OVEN_TOWER: RuledLoss = {
  buildId: OVEN_TOWER_BUILD_ID,
  isTheHobSwapped: true,
};

/** M10's precedence: (b), then (d), then (c). (b) and (c) are the same run — only what it gives up
 *  tells them apart — and (d) is that run with the bottle taken out first. */
function dishwasherTradesInPrecedence(
  runs: DishwasherTradeRuns,
): readonly DishwasherTrade[] {
  const besideTheSink = withTheDishwasherAfterTheSink(runs.run);
  return [
    { candidate: besideTheSink, ruledLoss: A_PANTRY_COLUMN },
    {
      candidate: withTheDishwasherAfterTheSink(runs.withoutTheBottle),
      ruledLoss: THE_BOTTLE,
    },
    { candidate: besideTheSink, ruledLoss: THE_OVEN_TOWER },
  ];
}

/**
 * The one test every trade is held to (ADR 0110 M7; no drawer cabinet is given up, M8 D7). Wall by
 * wall, the traded kitchen stands every body the kitchen without it stood save exactly one of the ruled
 * body, and its hob's body changes exactly where the ruling says. Keyed on the wall as well as the
 * body, so a door cabinet that pays the 600 mm on the sink's wall, or moves to the other wall, is a
 * cost the ruling never named. The dishwasher is left out of the count in both plans, so its presence
 * is asserted on its own.
 */
function givesUpExactlyTheRuledBody(
  plans: ComparedPlans,
  ruledLoss: RuledLoss,
): boolean {
  return (
    hasADishwasher(plans.after) &&
    isExactlyOneOf(bodyChanges(plans), ruledLoss.buildId) &&
    isTheHobSwapped(plans) === ruledLoss.isTheHobSwapped
  );
}

interface ComparedPlans {
  readonly before: KitchenCompositionPlan;
  readonly after: KitchenCompositionPlan;
}

/** Each wall-and-body's count after the trade less its count before, for every body the trade may not
 *  add — the hob, whose body the ruling states separately, and the dishwasher it adds are left out.
 *  Only the non-zero changes are kept. */
function bodyChanges(plans: ComparedPlans): ReadonlyMap<string, number> {
  const change = new Map<string, number>();
  const count = (plan: KitchenCompositionPlan, step: number) => {
    for (const base of plan.bases.filter(isTradedAgainst)) {
      const key = `${base.wall}|${base.buildId}`;
      change.set(key, (change.get(key) ?? 0) + step);
    }
  };
  count(plans.after, 1);
  count(plans.before, -1);
  return new Map([...change].filter(([, delta]) => delta !== 0));
}

function isTradedAgainst(base: PlannedGenerationBase): boolean {
  return base.role !== HOB_ROLE && !isTheDishwasher(base);
}

/** One wall lost exactly one of `buildId`, and nothing else changed anywhere. */
function isExactlyOneOf(
  changes: ReadonlyMap<string, number>,
  buildId: string,
): boolean {
  const [only, ...others] = [...changes];
  return (
    only !== undefined &&
    others.length === 0 &&
    only[0].endsWith(`|${buildId}`) &&
    only[1] === -1
  );
}

function isTheHobSwapped(plans: ComparedPlans): boolean {
  const hobBodyOf = (plan: KitchenCompositionPlan) =>
    plan.bases.find((base) => base.role === HOB_ROLE)?.buildId;
  return hobBodyOf(plans.before) !== hobBodyOf(plans.after);
}

/**
 * The dishwasher read directly after the sink, on the sink's side of the cut: it abuts the sink on its
 * own wall, every other item keeps its wall, and the bodies between the sink and the freed module shift
 * one module along (*sink · dishwasher · drawers · hob*). Its id is not a composed slot's, so *D* never
 * counts it. The plan's "or else directly before it" is not offered: it adds the same 600 mm to the
 * same wall, and a branch no room can reach is not a shipped rule (ADR 0093 decision 1).
 */
function withTheDishwasherAfterTheSink(run: RunLayout): RunLayout {
  const sinkAt = run.ordered.findIndex((item) => item.role === SINK_ROLE);
  return {
    ordered: [
      ...run.ordered.slice(0, sinkAt + 1),
      DISHWASHER_RUN_ITEM,
      ...run.ordered.slice(sinkAt + 1),
    ],
    cut: sinkAt < run.cut ? run.cut + 1 : run.cut,
  };
}
