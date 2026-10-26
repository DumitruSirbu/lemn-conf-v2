// Which catalogue rows get deeper when the kitchen is built at 700 mm instead of 600 (ADR 0177 A-6). A measured
// fact, never a list of ids, a band or `depthFollowsSetting()`: a row deepens when its finished depth in the catalogue
// at the deep depth is greater than in the catalogue at the shallow one. Pure and catalogue-agnostic: the composition
// root builds the two catalogues and passes the answer in as `PriceDesignRequest.deepeningRows`, so pricing binds to
// no catalogue and a suite that supplies its own gets its own answer.
import { occupiedDepthOfEntryM } from "../occupied-depth.js";
import type { BodyCatalog, BodyDefinition } from "../void-engine.js";

/** Metres to whole millimetres: the finished depths are millimetre quantities divided by 1 000, so rounding back
 *  removes the float noise and leaves an exact comparison. */
const MILLIMETRES_PER_METRE = 1_000;

/**
 * The build ids of every row whose finished depth is greater in `catalogAtDeep` than in `catalogAtShallow`. A row in
 * only one of the two has no measurement and is left out. Customer-supplied rows are not excluded here: that is a fact
 * about the book, and `priceDesign` applies it.
 */
export function measureDeepeningRows(
  catalogAtShallow: BodyCatalog,
  catalogAtDeep: BodyCatalog,
): ReadonlySet<string> {
  const deepening = new Set<string>();
  for (const [buildId, atShallow] of catalogAtShallow) {
    const atDeep = catalogAtDeep.get(buildId);
    if (atDeep === undefined) continue;
    if (
      finishedDepthMm(buildId, atDeep) > finishedDepthMm(buildId, atShallow)
    ) {
      deepening.add(buildId);
    }
  }
  return deepening;
}

function finishedDepthMm(buildId: string, definition: BodyDefinition): number {
  const depthM = occupiedDepthOfEntryM({ buildId, definition });
  return Math.round(depthM * MILLIMETRES_PER_METRE);
}
