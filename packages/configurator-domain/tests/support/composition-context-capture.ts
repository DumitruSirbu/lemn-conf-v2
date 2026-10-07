// Records the `CompositionContext` the real composer hands `planWithPanDrawerThenBottle`, so a counterfactual
// about one room (the block without the bottle, the plan on the core alone) is answered by the composer's own
// `planOf` / `tallColumnCountOf` rather than re-derived from `planTallEndBlock`: a derivation is a second
// authority, and where the two disagree the census measures the derivation.
//
// A test file installs it with
//
//     vi.mock("../../src/generation/optional-run-items.js", async (importOriginal) => {
//       const { withTheCompositionRecorded } = await import("../support/composition-context-capture.js");
//       return withTheCompositionRecorded(await importOriginal());
//     });
//
// The wrapper calls the real function and returns its result untouched. Read the record back through
// `lastComposition()` after `planKitchenComposition`, calling `forgetTheLastComposition()` before each room so a
// refused room cannot read the last one's.
//
// `planOf` carries the dishwasher (ADR 0110 Amendment M2), so a counterfactual about an earlier planner is asked
// through `beforeS1(compose)`, which needs a second mock making the dishwasher leaf switchable:
//
//     vi.mock("../../src/generation/dishwasher-beside-the-sink.js", async (importOriginal) => {
//       const { withTheDishwasherLeafSwitchable } = await import("../support/composition-context-capture.js");
//       return withTheDishwasherLeafSwitchable(await importOriginal());
//     });
//
// With the leaf off and the dishwasher trades off, the plan is the S0b tree; `withS1Alone(compose)` leaves the
// leaf on and the trades off. The leaf's `hasADishwasher` is also the trades' gate (`dishwasher-trades.ts` trades
// one in only where `planOf(run)` has none), so the mock answers it `true` while the trades are off; the leaf's
// own internal call is untouched.
//
// The run items are the owner's rulings as data, not the composer's constants (ADR 0121 decision 3(b)): a 600 mm
// `base-panbank` read immediately before the hob and a 300 mm `base-bottle-cargo` read last.
import type * as DishwasherLeaf from "../../src/generation/dishwasher-beside-the-sink.js";
import type * as OptionalRunItems from "../../src/generation/optional-run-items.js";
import type {
  CompositionContext,
  planWithPanDrawerThenBottle,
} from "../../src/generation/optional-run-items.js";
import type {
  GenerationAncillaryRunItem,
  RunLayout,
} from "../../src/generation/run-layout.js";
import type { KitchenCompositionPlan } from "../../src/index.js";

/** One placed room's composition, as the composer handed it to the optional-items decision. */
export interface RecordedComposition {
  readonly context: CompositionContext;
  readonly core: RunLayout;
}

let recorded: RecordedComposition | undefined;
let isTheLeafSwitchable = false;
let isTheLeafOff = false;
let areTheTradesOff = false;
let isRecordingTheLeafReads = false;
let readByTheLeaf: KitchenCompositionPlan[] = [];

/** The module under the mock: the real one, with its entry point recording what it was called with. */
export function withTheCompositionRecorded(
  real: typeof OptionalRunItems,
): typeof OptionalRunItems {
  const recording: typeof planWithPanDrawerThenBottle = (context, core) => {
    recorded = { context, core };
    return real.planWithPanDrawerThenBottle(context, core);
  };
  return { ...real, planWithPanDrawerThenBottle: recording };
}

/** The composition behind the most recent placed plan. Throws where none was recorded since
 *  `forgetTheLastComposition`, so a refused room is never read with the previous room's context. */
export function lastComposition(): RecordedComposition {
  if (recorded === undefined) {
    throw new Error(
      "no composition was recorded: the room was refused, or the optional-items mock is not installed",
    );
  }
  return recorded;
}

/** Forgets any recorded composition and every plan the leaf read, and starts the leaf's reads being kept for
 *  `plansTheLeafRead`. Call it before composing each room: a file that never calls it keeps nothing, because a
 *  plan kept per call grows the heap with a sweep of hundreds of thousands of rooms. */
export function forgetTheLastComposition(): void {
  recorded = undefined;
  readByTheLeaf = [];
  isRecordingTheLeafReads = true;
}

/** The leaf's module under the mock: the real leaf while the switch is on, the identity inside
 *  `beforeS1`; and `hasADishwasher` answering `true` to S2's trade gate inside `beforeS1` and
 *  `withS1Alone`, so no trade is tried there. */
export function withTheDishwasherLeafSwitchable(
  real: typeof DishwasherLeaf,
): typeof DishwasherLeaf {
  isTheLeafSwitchable = true;
  const switchable: typeof real.withTheDishwasherBesideTheSink = (plan) => {
    if (isTheLeafOff) return plan;
    if (isRecordingTheLeafReads) readByTheLeaf.push(plan);
    return real.withTheDishwasherBesideTheSink(plan);
  };
  const tradeGate: typeof real.hasADishwasher = (plan) =>
    areTheTradesOff || real.hasADishwasher(plan);
  return {
    ...real,
    withTheDishwasherBesideTheSink: switchable,
    hasADishwasher: tradeGate,
  };
}

/** `compose`'s answer from the planner as it stood before S1, the S0b tree: the leaf and S2's trades both off.
 *  Throws where the leaf's mock is not installed, because the answer would then silently be live. */
export function beforeS1<T>(compose: () => T): T {
  return withTheSwitches(
    { isTheLeafOff: true, areTheTradesOff: true },
    compose,
  );
}

/** `compose`'s answer from the planner as it stood at S1, before S2: the leaf on, the trades off. */
export function withS1Alone<T>(compose: () => T): T {
  return withTheSwitches(
    { isTheLeafOff: false, areTheTradesOff: true },
    compose,
  );
}

function withTheSwitches<T>(
  switches: {
    readonly isTheLeafOff: boolean;
    readonly areTheTradesOff: boolean;
  },
  compose: () => T,
): T {
  if (!isTheLeafSwitchable) {
    throw new Error(
      "an earlier planner needs the dishwasher leaf's mock: without it the plan would be the live one",
    );
  }
  isTheLeafOff = switches.isTheLeafOff;
  areTheTradesOff = switches.areTheTradesOff;
  try {
    return compose();
  } finally {
    isTheLeafOff = false;
    areTheTradesOff = false;
  }
}

/** Every plan the live leaf was handed since `forgetTheLastComposition` — the final run's and each
 *  threshold-drawer candidate's, built but not yet given a dishwasher. */
export function plansTheLeafRead(): readonly KitchenCompositionPlan[] {
  return readByTheLeaf;
}

const PAN_DRAWER_ITEM: GenerationAncillaryRunItem = {
  id: "pan-drawer",
  role: "storage",
  buildId: "base-panbank",
  widthMm: 600,
};

const BOTTLE_ITEM: GenerationAncillaryRunItem = {
  id: "bottle",
  role: "storage",
  buildId: "base-bottle-cargo",
  widthMm: 300,
};

/** The bottle read last, on the prefix wall only where the whole run already is. */
export function withTheBottleLast(run: RunLayout): RunLayout {
  const isWholeRunOnThePrefixWall = run.cut === run.ordered.length;
  return {
    ordered: [...run.ordered, BOTTLE_ITEM],
    cut: isWholeRunOnThePrefixWall ? run.cut + 1 : run.cut,
  };
}

/** The pan drawer read immediately before the hob, on the hob's side of the cut. */
export function withThePanDrawerBeforeTheHob(run: RunLayout): RunLayout {
  const hobAt = run.ordered.findIndex((item) => item.role === "hob");
  return {
    ordered: [
      ...run.ordered.slice(0, hobAt),
      PAN_DRAWER_ITEM,
      ...run.ordered.slice(hobAt),
    ],
    cut: hobAt < run.cut ? run.cut + 1 : run.cut,
  };
}

/** The run's items fit both walls on its own cut. */
export function fitsOnItsCut(
  composition: RecordedComposition,
  run: RunLayout,
): boolean {
  const widthOf = (items: RunLayout["ordered"]) =>
    items.reduce((sum, item) => sum + item.widthMm, 0);
  const { prefix, suffix } = composition.context.capacityMm;
  return (
    widthOf(run.ordered.slice(0, run.cut)) <= prefix &&
    widthOf(run.ordered.slice(run.cut)) <= suffix
  );
}

/** The composer's own column count for a run. */
export function columnsKeptBy(
  composition: RecordedComposition,
  run: RunLayout,
): number {
  return composition.context.tallColumnCountOf(run);
}

/** The candidate fits and its block keeps every column the run without it keeps (Q-H6c). */
export function standsAtNoColumn(
  composition: RecordedComposition,
  runs: { readonly candidate: RunLayout; readonly without: RunLayout },
): boolean {
  return (
    fitsOnItsCut(composition, runs.candidate) &&
    columnsKeptBy(composition, runs.candidate) >=
      columnsKeptBy(composition, runs.without)
  );
}

/** How the composer decided the pan drawer and the bottle, and the run it decided before the threshold drawer,
 *  beside the run decided before S0b. */
export interface DecidedBeforeTheThresholdDrawer {
  /** Q-H6b: the pan drawer stood against the core alone. Otherwise the bottle was decided first (the K3
   *  fallback). */
  readonly isPanDrawerDecidedFirst: boolean;
  /** ADR 0110 M11: on the K3 fallback the bottle was omitted because it alone would take the block's oven tower
   *  (block ≥ 1 → 0) and no pan drawer stood beside it. A statement about this decision, not the finished plan:
   *  a later threshold drawer may still take the kept tower. */
  readonly isTheOvenTowerKeptOverTheBottle: boolean;
  /** The run the composer decides today. */
  readonly run: RunLayout;
  /** The run decided before S0b: `run` everywhere but where the tower was kept, where it is the bottle kitchen.
   *  The pre-state models read it; nothing live does. */
  readonly runBeforeS0b: RunLayout;
}

/** The composer's pan-drawer and bottle decision, restated as a question to its context. The census proves it
 *  right room by room: `planOf(run)` must equal the finished plan wherever no threshold drawer was added after
 *  it, before S1 and live alike. */
export function decidedBeforeTheThresholdDrawer(
  composition: RecordedComposition,
): DecidedBeforeTheThresholdDrawer {
  const { core } = composition;
  const panDrawerFirst = withThePanDrawerBeforeTheHob(core);
  if (
    standsAtNoColumn(composition, { candidate: panDrawerFirst, without: core })
  ) {
    const both = withTheBottleLast(panDrawerFirst);
    const isBothStanding = standsAtNoColumn(composition, {
      candidate: both,
      without: panDrawerFirst,
    });
    const run = isBothStanding ? both : panDrawerFirst;
    return {
      isPanDrawerDecidedFirst: true,
      isTheOvenTowerKeptOverTheBottle: false,
      run,
      runBeforeS0b: run,
    };
  }
  const bottleKitchen = s1sBottleThenThePanDrawerBeforeS0b(composition);
  const isTheOvenTowerKeptOverTheBottle =
    !hasThePanDrawer(bottleKitchen) &&
    columnsKeptBy(composition, core) > 0 &&
    columnsKeptBy(composition, bottleKitchen) === 0;
  return {
    isPanDrawerDecidedFirst: false,
    isTheOvenTowerKeptOverTheBottle,
    run: isTheOvenTowerKeptOverTheBottle ? core : bottleKitchen,
    runBeforeS0b: bottleKitchen,
  };
}

/** The plan before S0b for a room S0b's planner placed: S0b's plan, except where S0b kept the tower, where the
 *  earlier planner stood the bottle kitchen. Exact only where the earlier threshold rule added nothing to that
 *  kitchen, which every caller must show (see `qa-7d5b-s0-pre-state-census.adversarial.test.ts`). */
export function planBeforeS0b(
  composition: RecordedComposition,
  planAfterS0b: KitchenCompositionPlan,
): KitchenCompositionPlan {
  const decided = decidedBeforeTheThresholdDrawer(composition);
  return decided.isTheOvenTowerKeptOverTheBottle
    ? beforeS1(() => composition.context.planOf(decided.runBeforeS0b))
    : planAfterS0b;
}

/** The K3 fallback as the planner before S0b built it: the bottle where it fits, then the pan drawer beside it
 *  where that costs the bottle kitchen no column. */
function s1sBottleThenThePanDrawerBeforeS0b(
  composition: RecordedComposition,
): RunLayout {
  const { core } = composition;
  const bottleFirst = fitsOnItsCut(composition, withTheBottleLast(core))
    ? withTheBottleLast(core)
    : core;
  const beside = withThePanDrawerBeforeTheHob(bottleFirst);
  const isBesideStanding = standsAtNoColumn(composition, {
    candidate: beside,
    without: bottleFirst,
  });
  return isBesideStanding ? beside : bottleFirst;
}

function hasThePanDrawer(run: RunLayout): boolean {
  return run.ordered.some((item) => item.buildId === PAN_DRAWER_ITEM.buildId);
}

/** What the bottle, stood on the core, costs the block: a counterfactual, so the answer is the same before and
 *  after S0b, which decides only what is done about it. */
export type BottleCost = "nothing" | "an outer column" | "the oven tower";

/** Only where the bottle is decided before the pan drawer (the K3 fallback) can it cost a column: where the pan
 *  drawer went first, Q-H6c keeps every column. The block's innermost column is the oven tower (E12.2), so a
 *  block that falls to no column has lost the tower. */
export function whatS1sBottleCost(
  composition: RecordedComposition,
): BottleCost {
  if (decidedBeforeTheThresholdDrawer(composition).isPanDrawerDecidedFirst) {
    return "nothing";
  }
  const withTheBottle = withTheBottleLast(composition.core);
  if (!fitsOnItsCut(composition, withTheBottle)) return "nothing";
  const columnsWithout = columnsKeptBy(composition, composition.core);
  const columnsWith = columnsKeptBy(composition, withTheBottle);
  if (columnsWith >= columnsWithout) return "nothing";
  return columnsWith === 0 ? "the oven tower" : "an outer column";
}
