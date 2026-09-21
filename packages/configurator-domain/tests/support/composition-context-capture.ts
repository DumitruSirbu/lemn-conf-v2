// M7 wave 7D5b slice S0 — the real composer's own answers for runs it never chose, read at HEAD.
//
// **Why a capture rather than a derivation.** 7D5b's figures ask counterfactual questions about one
// room — *how many tall columns would the block keep without the bottle?*, *what would the plan be
// on the core alone?* — and `pan-drawer-before-the-hob.test.ts` answers questions of that kind by
// re-deriving the block from `planTallEndBlock`. A derivation is a second authority on the composer's
// arithmetic: where the two disagree, the census measures the derivation. This module instead
// records the `CompositionContext` the composer itself hands `planWithPanDrawerThenBottle`, so every
// counterfactual below is `planOf` / `tallColumnCountOf` — the composer's code, bound to that room's
// kept core and cut — and the only thing written here is which run to ask about.
//
// **How it is wired.** A test file installs it with
//
//     vi.mock("../../src/generation/optional-run-items.js", async (importOriginal) => {
//       const { withTheCompositionRecorded } = await import("../support/composition-context-capture.js");
//       return withTheCompositionRecorded(await importOriginal());
//     });
//
// The wrapper calls the real function with the real arguments and returns its result untouched, so
// every plan the file composes is HEAD's. What it adds is one assignment, read back through
// `lastComposition()` straight after `planKitchenComposition` returns, with
// `forgetTheLastComposition()` called before each room so a refused room cannot read the last one's.
//
// **The run items spelled here are the owner's rulings as data, not the composer's constants** (ADR
// 0121 decision 3(b)): a pan drawer is a 600 mm `base-panbank` read immediately before the hob, and
// the bottle a 300 mm `base-bottle-cargo` read last. The planner never sees them except through the
// runs this file asks it about.
import type * as OptionalRunItems from "../../src/generation/optional-run-items.js";
import type {
  CompositionContext,
  planWithPanDrawerThenBottle,
} from "../../src/generation/optional-run-items.js";
import type {
  GenerationAncillaryRunItem,
  RunLayout,
} from "../../src/generation/run-layout.js";

/** One placed room's composition, as the composer handed it to the optional-items decision. */
export interface RecordedComposition {
  readonly context: CompositionContext;
  readonly core: RunLayout;
}

let recorded: RecordedComposition | undefined;

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

/** Forgets any recorded composition. Call it before composing each room. */
export function forgetTheLastComposition(): void {
  recorded = undefined;
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

/** H1 and J3: the bottle read last, on the prefix wall only where the whole run already is. */
export function withTheBottleLast(run: RunLayout): RunLayout {
  const isWholeRunOnThePrefixWall = run.cut === run.ordered.length;
  return {
    ordered: [...run.ordered, BOTTLE_ITEM],
    cut: isWholeRunOnThePrefixWall ? run.cut + 1 : run.cut,
  };
}

/** J1: the pan drawer read immediately before the hob, on the hob's side of the cut. */
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

/** The candidate fits and its block keeps every column the run without it keeps (J1, Q-H6c). */
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

/** How HEAD decided the pan drawer and the bottle, and the run it decided before the threshold drawer. */
export interface DecidedBeforeTheThresholdDrawer {
  /** J1 / Q-H6b: the pan drawer stood against the core alone. Otherwise S1's bottle was decided first
   *  (the K3 fallback). */
  readonly isPanDrawerDecidedFirst: boolean;
  readonly run: RunLayout;
}

/** HEAD's pan-drawer and bottle decision, restated as a question to the composer's context. The
 *  census proves it right, room by room: `planOf(run)` must equal HEAD's plan wherever no threshold
 *  drawer was added after it. */
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
    return {
      isPanDrawerDecidedFirst: true,
      run: isBothStanding ? both : panDrawerFirst,
    };
  }
  const bottleFirst = fitsOnItsCut(composition, withTheBottleLast(core))
    ? withTheBottleLast(core)
    : core;
  const beside = withThePanDrawerBeforeTheHob(bottleFirst);
  const isBesideStanding = standsAtNoColumn(composition, {
    candidate: beside,
    without: bottleFirst,
  });
  return {
    isPanDrawerDecidedFirst: false,
    run: isBesideStanding ? beside : bottleFirst,
  };
}

/** What S1's bottle cost the block, where it did. */
export type BottleCost = "nothing" | "an outer column" | "the oven tower";

/** Only where HEAD decided S1's bottle before the pan drawer (the K3 fallback) can the bottle cost a
 *  column: where the pan drawer went first, Q-H6c keeps every column. The block's innermost column is
 *  the oven tower (E12.2), so a block that falls to no column has lost the tower. */
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
