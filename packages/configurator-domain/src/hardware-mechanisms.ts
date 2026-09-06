// **How many mechanisms a kitchen's hardware is priced by** — hinges, drawers and push-to-open
// latches, counted over a design's bodies from the facts wave 6S declared.
//
// ADR 0070 decision 1 prices hardware **per mechanism and never per handle**: a push-to-open body
// carries hinges and runners and no handle at all, so the superseded per-cabinet-handle basis
// billed a whole push-to-open kitchen at exactly zero. This module answers the three quantities
// that replace it.
//
// **Which bodies are push-to-open is `push-to-open.ts`'s answer, not this module's** (ADR 0092
// decision 3, Amendment C). Deciding it here from the recorded handle mode is what left the shipped
// demo's sixteen hidden-bar latches billed at nothing while billing latches for bars the scene keeps
// drawing — and the adapter draws the bar by the same call, so the two cannot disagree again.
//
// **It counts; it does not price.** It lives beside `cabinet-handles.ts` and `front-population.ts`
// and deliberately **outside `pricing/`** (ADR 0092 decision 4): a mechanism count is a fact about
// a design's bodies, not about money, and the manufacturer price dashboard (ADR 0062) will want it
// without importing a price book. **No amount, rate or tier appears here, and none is named here
// either** — ADR 0062's third prohibition is held by a source scan for a minor-unit field name
// (`pricing-seams.test.ts`), which reads prose as well as code and is meant to.
//
// **Nothing here reads a mesh or a `kind`.** Every number comes from the placement's own catalogue
// entry through `frontPopulationQueryFor`, which is the seam 6S's review round created so that a
// later wave could not source a height from a definition's nominal instead.
import {
  doorLeafHeightsMm,
  drawerCount,
  frontPopulationQueryFor,
  type DeclaresFronts,
} from "./front-population.js";
import { isPushToOpen, type PushToOpenQuery } from "./push-to-open.js";
import type { DisplayEntry } from "./queries/design-projection.js";
import type { BodyCatalog } from "./void-engine.js";

/** The three mechanisms ADR 0070 decision 1 names, and no fourth. A lift arm and a cargo pull-out
 *  are knowingly not among them (ADR 0092 decision 8): both are recorded as unpriced rather than
 *  folded into a count that would make them look measured. */
export interface HardwareMechanismCounts {
  readonly hinges: number;
  readonly drawers: number;
  readonly pushToOpen: number;
}

/** Two hinges carry an ordinary door leaf. */
export const HINGES_PER_DOOR_LEAF = 2;

/** A third hinge carries a leaf over the threshold below — the extra weight needs it. */
export const HINGES_PER_TALL_DOOR_LEAF = 3;

/** **The height a third hinge starts at, and it is a strict boundary**: ADR 0070's wording is
 *  *taller than 900*, so a 900 mm leaf takes two hinges and a 901 mm leaf takes three. A
 *  re-implementation reaching for `>=` is wrong and nothing in the seeded kitchen would notice —
 *  its only leaves over the threshold are the pantry's two 1290s, nowhere near it. */
export const TALL_DOOR_LEAF_THRESHOLD_MM = 900;

/** What a design with no bodies carries. A real answer, not a refusal: an empty kitchen has no
 *  mechanisms, which is a different statement from a body whose declaration could not be read. */
export const NO_HARDWARE_MECHANISMS: HardwareMechanismCounts = {
  hinges: 0,
  drawers: 0,
  pushToOpen: 0,
};

/**
 * **Every mechanism this design's bodies carry**, summed over the projection.
 *
 * **Read from each placement's own catalogue entry, never from the row it is priced as.** This is
 * the far side of the split `describePricedBody` (`pricing/price-design.ts`) makes for the door-step
 * leaf count, which it reads off the priced-as row for the same load-bearing reason
 * (ADR 0092 decision 1): a price *rule* belongs to the catalogue row a body is named after
 * (ADR 0022), while a mechanism is a property of the body standing in the kitchen.
 *
 * **Throws `UndeclaredFrontPopulationError`**, from `doorLeafHeightsMm` or `drawerCount`, for a body
 * whose front population cannot be read — including one the catalogue does not hold at all. **A
 * missing declaration is never read as zero mechanisms**, which is the failure ADR 0061 decision 4
 * and `front-population.ts`'s own header both exist to prevent: it would price a kitchen's hinges at
 * nothing and look implemented. Converting that refusal into a failure code belongs to the caller
 * that has a code vocabulary; this module has none and imports none.
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

/** The three counts one body contributes. Built through `frontPopulationQueryFor` rather than by
 *  assembling the query here, because the constructor is what removes the chance to reach for a
 *  definition's nominal height: one `wall-cabinet` entry declares 700 while its placements are
 *  built at 400, 700 and 750. */
function mechanismsOn(
  entry: DisplayEntry,
  definition: DeclaresMechanismFacts | undefined,
): HardwareMechanismCounts {
  const declared = definition ?? DECLARES_NOTHING;
  const query = frontPopulationQueryFor({ body: entry, definition: declared });
  const leafHeightsMm = doorLeafHeightsMm(query);
  const drawers = drawerCount(query);

  return {
    hinges: countHinges(leafHeightsMm),
    drawers,
    pushToOpen: countPushToOpen(
      pushToOpenQueryFor(entry, declared),
      leafHeightsMm.length + drawers,
    ),
  };
}

/** What this module reads off a catalogue entry: the front population, and whether the row permits
 *  a recorded handle mode at all. Structural for the reason `DeclaresFronts` is — `void-engine.ts`
 *  imports the front-population module, so an import of `BodyDefinition` back would be a cycle.
 *
 *  `canHandle` is declared **optional here and required by `BodyDefinition`**, and that gap is the
 *  absent-row case rather than a policy: see `DECLARES_NOTHING`. */
interface DeclaresMechanismFacts extends DeclaresFronts {
  readonly canHandle?: boolean;
}

/** A body the catalogue does not hold declares no fronts — which `doorLeafHeightsMm` refuses by
 *  naming the build id, exactly as it refuses an entry that declares nothing. Stated as a value
 *  rather than left to a `?.` so that the absent-entry case reaches the same refusal as the
 *  undeclared one instead of a different, quieter path.
 *
 *  **It declares no `canHandle` either, and must not be given one.** The refusal above runs before
 *  anything reads it, so an absent row's handle capability decides nothing — and a `true` or a
 *  `false` written here would look like a ruling on a case that never reaches a price. */
const DECLARES_NOTHING: DeclaresMechanismFacts = {};

/** The three facts `isPushToOpen` reads, assembled from the two places they live: the floor and the
 *  recorded mode are the **placement's** (§6.5 — two `base-sink-800`s can carry different handles),
 *  and the permission is the **catalogue row's**.
 *
 *  A row that declares no permission reads as permitting none, which decides nothing on any reachable
 *  path: `doorLeafHeightsMm` has already refused a body the catalogue does not hold, and every
 *  `BodyDefinition` declares the field. */
function pushToOpenQueryFor(
  entry: DisplayEntry,
  declared: DeclaresMechanismFacts,
): PushToOpenQuery {
  return {
    y0Mm: entry.y0Mm,
    recordedHandle: entry.handle,
    canHandle: declared.canHandle === true,
  };
}

/** **Counted over `doorLeafHeightsMm`, one entry per leaf — never over `doorBandHeightsMm`.** A
 *  pantry at 600 mm answers `[1290, 1290, 790, 790]`, and applying the threshold to its two *bands*
 *  instead answers 45 hinges on the seeded kitchen against the correct 74. Both numbers look
 *  plausible, which is why 6S published the per-leaf pairing rather than leaving each caller to
 *  rebuild it. */
function countHinges(leafHeightsMm: readonly number[]): number {
  return leafHeightsMm.reduce(
    (total, leafHeightMm) => total + hingesOnLeaf(leafHeightMm),
    0,
  );
}

function hingesOnLeaf(leafHeightMm: number): number {
  return leafHeightMm > TALL_DOOR_LEAF_THRESHOLD_MM
    ? HINGES_PER_TALL_DOOR_LEAF
    : HINGES_PER_DOOR_LEAF;
}

/** **One latch per opening front on a push-to-open body, and none anywhere else** (ADR 0092
 *  decision 3). Per front rather than per body or per band, which is the denominator the hinge rule
 *  uses too: a latch is fitted to each thing that opens.
 *
 *  **Whether the body is push-to-open is `isPushToOpen`'s answer and not this module's.** Reading
 *  the recorded mode here instead is what billed the shipped demo's 16 hidden-bar latches at zero
 *  while billing latches for bars the scene keeps drawing (ADR 0092 decision 3, Amendment C), and
 *  `scene-sync.ts` decides whether to draw the bar by the same call. */
function countPushToOpen(
  front: PushToOpenQuery,
  openingFronts: number,
): number {
  return isPushToOpen(front) ? openingFronts : 0;
}

function addCounts(
  left: HardwareMechanismCounts,
  right: HardwareMechanismCounts,
): HardwareMechanismCounts {
  return {
    hinges: left.hinges + right.hinges,
    drawers: left.drawers + right.drawers,
    pushToOpen: left.pushToOpen + right.pushToOpen,
  };
}
