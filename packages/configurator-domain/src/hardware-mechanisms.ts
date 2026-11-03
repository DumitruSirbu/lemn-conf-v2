// How many mechanisms a kitchen's hardware is priced by: hinges, drawers, push runners, push-to-open latches
// and lifts, counted over a design's bodies from their front-population declarations.
//
// Hardware is priced per mechanism, never per handle (ADR 0070 decision 1): a push-to-open body carries
// hinges and runners and no handle, so a per-handle basis billed a whole push-to-open kitchen at zero.
//
// Which bodies are push-to-open is `push-to-open.ts`'s answer, not this module's (ADR 0092 decision 3):
// the adapter draws the bar by the same call, so billing and scene cannot disagree.
//
// It counts; it does not price. It lives outside `pricing/` (ADR 0092 decision 4) because a count is a
// fact about bodies, not money, and the manufacturer dashboard will want it without a price book. No
// amount, rate or tier is named here either: `pricing-seams.test.ts` scans this source, prose included,
// for minor-unit field names.
//
// Nothing here reads a mesh or a `kind`: every number comes from the placement's own catalogue entry
// through `frontPopulationQueryFor`, so no height can be sourced from a definition's nominal.
import {
  doorLeafCount,
  doorLeafHeightsMm,
  drawerCount,
  frontPopulationQueryFor,
  liftDoorWidthsMm,
  type DeclaresFronts,
  type FrontPopulationQuery,
} from "./front-population.js";
import { isPushToOpen, type PushToOpenQuery } from "./push-to-open.js";
import type { DisplayEntry } from "./queries/design-projection.js";
import type { BodyCatalog } from "./void-engine.js";

/** The mechanisms a kitchen's hardware is priced by: hinges, drawers, push runners, push-to-open latches and one lift
 *  per lift-up door (ADR 0177 A-20). A cargo pull-out counts as one drawer (ADR 0092 decision 8). A drawer is counted
 *  under `drawers` or under `pushRunners`, never both: on a push-to-open body it opens on a push runner, and it takes
 *  no latch. */
export interface HardwareMechanismCounts {
  readonly hinges: number;
  readonly drawers: number;
  readonly pushRunners: number;
  readonly pushToOpen: number;
  readonly lifts: number;
}

/** Two hinges carry an ordinary door leaf. */
export const HINGES_PER_DOOR_LEAF = 2;

/** A third hinge carries a leaf over either threshold below — the extra weight needs it. */
export const HINGES_PER_TALL_DOOR_LEAF = 3;

/** The height a third hinge starts at, a strict boundary: ADR 0070 says *taller than 900*, so a 900 mm
 *  leaf takes two hinges and a 901 mm leaf three. `>=` would be wrong and the seeded kitchen would not
 *  notice. */
export const TALL_DOOR_LEAF_THRESHOLD_MM = 900;

/** The width a lift door's third hinge starts at, a strict boundary like the height one: a 500 mm lift door takes
 *  two hinges and a 501 mm one three. It is not the door-count threshold, which is inclusive. For a lift door this
 *  width rule replaces the height rule. see ADR 0177 A-20 */
export const WIDE_LIFT_DOOR_THRESHOLD_MM = 500;

/** What a design with no bodies carries: a real answer, not a refusal. */
export const NO_HARDWARE_MECHANISMS: HardwareMechanismCounts = {
  hinges: 0,
  drawers: 0,
  pushRunners: 0,
  pushToOpen: 0,
  lifts: 0,
};

/**
 * Every mechanism this design's bodies carry, summed over the projection.
 *
 * Read from each placement's own catalogue entry, never from the row it is priced as: a price rule
 * belongs to the row a body is named after (ADR 0022), a mechanism to the body standing in the kitchen
 * (the far side of the split `describePricedBody` makes, ADR 0092 decision 1).
 *
 * Throws `UndeclaredFrontPopulationError` from `doorLeafHeightsMm` or `drawerCount` for a body whose
 * front population cannot be read, including one the catalogue does not hold. A missing declaration is
 * never read as zero mechanisms, which would price a kitchen's hinges at nothing (ADR 0061 decision 4).
 * Converting that refusal into a failure code belongs to the caller; this module has no code vocabulary.
 */
export function countHardwareMechanisms(
  entries: readonly DisplayEntry[],
  catalog: BodyCatalog,
): HardwareMechanismCounts {
  let totals = NO_HARDWARE_MECHANISMS;
  for (const entry of entries) {
    totals = addCounts(totals, mechanismsOn(entry, catalog.get(entry.buildId)));
  }
  return totals;
}

/** The counts one body contributes. Built through `frontPopulationQueryFor` so nobody can reach
 *  for a definition's nominal height: one `wall-cabinet` entry declares 700 while its placements are
 *  built at 400, 700 and 750. */
function mechanismsOn(
  entry: DisplayEntry,
  definition: DeclaresMechanismFacts | undefined,
): HardwareMechanismCounts {
  const declared = definition ?? DECLARES_NOTHING;
  const query = frontPopulationQueryFor({ body: entry, definition: declared });
  const liftDoorWidths = liftDoorWidthsMm(query);
  const isPushOpen = isPushToOpen(pushToOpenQueryFor(entry, declared));
  const drawers = drawerCount(query);

  return {
    hinges: countHingesOn(query, liftDoorWidths),
    drawers: isPushOpen ? 0 : drawers,
    pushRunners: isPushOpen ? drawers : 0,
    pushToOpen: isPushOpen ? doorLeafCount(query) : 0,
    lifts: liftDoorWidths.length,
  };
}

/** What this module reads off a catalogue entry: the front population, and whether the row permits a
 *  recorded handle mode. Structural because `void-engine.ts` imports the front-population module, so
 *  importing `BodyDefinition` back would be a cycle. `canHandle` is optional here and required by
 *  `BodyDefinition`: the gap is the absent-row case (`DECLARES_NOTHING`). */
interface DeclaresMechanismFacts extends DeclaresFronts {
  readonly canHandle?: boolean;
}

/** A body the catalogue does not hold declares no fronts, which `doorLeafHeightsMm` refuses by naming
 *  the build id, as it does an entry that declares nothing. A value rather than a `?.`, so both cases
 *  reach the same refusal. It declares no `canHandle` and must not be given one: the refusal runs
 *  first, and a written `true` or `false` would look like a ruling on a case that never reaches a
 *  price. */
const DECLARES_NOTHING: DeclaresMechanismFacts = {};

/** The facts `isPushToOpen` reads: the floor and the recorded mode are the **placement's** (§6.5: two
 *  `base-sink-800`s can carry different handles), the kitchen's handle is the **design's**, the permission is the
 *  **catalogue row's**. A row declaring no permission reads as permitting none, which decides nothing on any
 *  reachable path: `doorLeafHeightsMm` has already refused an uncatalogued body. */
function pushToOpenQueryFor(
  entry: DisplayEntry,
  declared: DeclaresMechanismFacts,
): PushToOpenQuery {
  return {
    y0Mm: entry.y0Mm,
    recordedHandle: entry.handle,
    kitchenSettings: entry.kitchenSettings,
    canHandle: declared.canHandle === true,
  };
}

/** A lift door's hinges follow its width, every other leaf's its height (ADR 0177 A-20), so a body's hinges are
 *  counted over one list or the other, never both. Heights are counted over `doorLeafHeightsMm`, one entry per
 *  leaf, never over `doorBandHeightsMm`: a pantry at 600 mm answers `[1290, 1290, 790, 790]`, and applying the
 *  threshold to its two bands gives 45 hinges on the seeded kitchen against the correct 74. */
function countHingesOn(
  query: FrontPopulationQuery,
  liftDoorWidths: readonly number[],
): number {
  if (liftDoorWidths.length > 0) {
    return sumOf(liftDoorWidths, hingesOnLiftDoor);
  }
  return sumOf(doorLeafHeightsMm(query), hingesOnLeaf);
}

function sumOf(
  values: readonly number[],
  measure: (value: number) => number,
): number {
  return values.reduce((total, value) => total + measure(value), 0);
}

function hingesOnLeaf(leafHeightMm: number): number {
  return leafHeightMm > TALL_DOOR_LEAF_THRESHOLD_MM
    ? HINGES_PER_TALL_DOOR_LEAF
    : HINGES_PER_DOOR_LEAF;
}

function hingesOnLiftDoor(doorWidthMm: number): number {
  return doorWidthMm > WIDE_LIFT_DOOR_THRESHOLD_MM
    ? HINGES_PER_TALL_DOOR_LEAF
    : HINGES_PER_DOOR_LEAF;
}

function addCounts(
  left: HardwareMechanismCounts,
  right: HardwareMechanismCounts,
): HardwareMechanismCounts {
  return {
    hinges: left.hinges + right.hinges,
    drawers: left.drawers + right.drawers,
    pushRunners: left.pushRunners + right.pushRunners,
    pushToOpen: left.pushToOpen + right.pushToOpen,
    lifts: left.lifts + right.lifts,
  };
}
