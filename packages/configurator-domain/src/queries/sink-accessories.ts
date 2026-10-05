// Where a kitchen's sink extras go: one record per sink, each naming the wall cabinet its dish drying
// rack hangs in, or none. ADR 0070 decision 4 gives a sink base an aluminium cover, always present at the
// sink's own position, and a drying rack whose position this module derives.
//
// A sink is a declared catalogue fact, never recognised here (ADR 0092 decision 9): this module asks
// `declaresASink` and nothing else, not a `kind` (`base-sink` is `base_cabinet`), a build-id prefix, or
// an equivalent-id comparison.
//
// It locates; it does not price: no amount, rate or rule appears here (the amounts are the book's,
// `pricing/price-book.ts`). It sits beside the other queries, not under `pricing/`, because a count of
// positions is a fact about bodies. I/O-free and rendering-free.
import {
  doorLeafCount,
  frontPopulationQueryFor,
  UnbuildableDoorBandError,
  UndeclaredFrontPopulationError,
} from "../front-population.js";
import { declaresASink, type BodyCatalog } from "../void-engine.js";

import type { DisplayEntry } from "./design-projection.js";

/** One sink, and where its rack goes. One record per sink placement, never per kitchen: two sinks answer
 *  two records even where both resolve to the same wall cabinet, so cover and rack are billed twice
 *  (ADR 0092 decision 10). */
export interface SinkAccessoryPositions {
  readonly sinkPlacementId: string;
  /** The wall cabinet this sink's rack hangs in. Absent, never a placeholder id, where none stands over the
   *  sink: a rack with nowhere to hang must not be shown, and an amount of zero would render *inclus* for
   *  a rack they are not getting. */
  readonly rackHostPlacementId?: string;
}

/**
 * Every sink this design holds, in the projection's order, each with the wall cabinet its rack resolved
 * to. Takes the projection's entries, which already carry the wall, normalised band, along-wall centre,
 * floor and width, so nothing re-derives a position or sorts. A body the catalogue does not hold declares
 * no sink and hosts no rack: an answer, not a refusal, and it silently prices nothing because
 * `priceDesign` refuses an uncataloged body whole.
 */
export function findSinkAccessories(
  entries: readonly DisplayEntry[],
  catalog: BodyCatalog,
): readonly SinkAccessoryPositions[] {
  return entries
    .filter((entry) => declaresASink(catalog.get(entry.buildId)))
    .map((sink) => describeSinkAccessories({ sink, catalog }, entries));
}

/** The sink whose rack is being placed and the catalogue the candidates' declarations are read from. */
interface RackHostSearch {
  readonly sink: DisplayEntry;
  readonly catalog: BodyCatalog;
}

function describeSinkAccessories(
  search: RackHostSearch,
  entries: readonly DisplayEntry[],
): SinkAccessoryPositions {
  const host = rackHostFor(search, entries);
  return {
    sinkPlacementId: search.sink.placementId,
    ...(host === undefined ? {} : { rackHostPlacementId: host.placementId }),
  };
}

/**
 * The lowest wall-band body on the same wall that declares at least one door leaf and whose along-wall
 * extent strictly overlaps the sink's (ADR 0070 decision 4, read by ADR 0092 decision 10).
 *
 * The tie-break is part of the rule, since two wall cabinets can sit at one `y0` over one sink. In order:
 * lowest `y0Mm`, larger overlap, then the projection's order (never the `placements` array's, which is
 * persistence order and reorders under editing). Replacing only on a strictly better candidate is what
 * makes the third key the projection's.
 */
function rackHostFor(
  search: RackHostSearch,
  entries: readonly DisplayEntry[],
): DisplayEntry | undefined {
  let best: RackHostCandidate | undefined;
  for (const entry of entries) {
    const candidate = rackHostCandidateFor(search, entry);
    if (candidate && (!best || isBetterRackHost(candidate, best))) {
      best = candidate;
    }
  }
  return best?.entry;
}

/** A body that could hold this sink's rack, with the overlap the tie-break reads, carried so the number
 *  that admitted a candidate is the one that ranks it. */
interface RackHostCandidate {
  readonly entry: DisplayEntry;
  readonly overlapMm: number;
}

function rackHostCandidateFor(
  search: RackHostSearch,
  entry: DisplayEntry,
): RackHostCandidate | undefined {
  if (!canHangARack(search, entry)) return undefined;
  const overlapMm = overlapLengthMm(search.sink, entry);
  // Touching is not overlapping: the seeded `open-shelf-600` begins exactly where the sink ends, so a
  // `>= 0` reading would admit it and hang a drying rack in an open shelf.
  if (overlapMm <= NO_OVERLAP_MM) return undefined;
  return { entry, overlapMm };
}

/** A positive-length intersection is an overlap; anything else is not. */
const NO_OVERLAP_MM = 0;

/**
 * Whether this body is the kind of thing a rack hangs in. The band is the projection's normalised one:
 * `top` folds into `wall` through `normaliseBand` (ADR 0011 Gap C), so a top box is a candidate, just not
 * the lowest; a predicate on `rawBand` would be wrong once a kitchen's only overlapping body is a `top`
 * row. It must also declare a door leaf: a rack hangs inside a closed cabinet, and `hood` and
 * `open-shelf` have nowhere to hang it.
 */
function canHangARack(search: RackHostSearch, entry: DisplayEntry): boolean {
  return (
    entry.wall === search.sink.wall &&
    entry.band === "wall" &&
    declaresADoorLeaf(entry, search.catalog)
  );
}

/** Millimetres of wall the two bodies share; negative where they miss, which the caller reads as no overlap. */
function overlapLengthMm(left: DisplayEntry, right: DisplayEntry): number {
  return (
    Math.min(endOfMm(left), endOfMm(right)) -
    Math.max(startOfMm(left), startOfMm(right))
  );
}

/** `alongMm` is the body's centre along the wall, so its span reaches half its width each way. */
function startOfMm(entry: DisplayEntry): number {
  return entry.alongMm - entry.widthMm / 2;
}

function endOfMm(entry: DisplayEntry): number {
  return entry.alongMm + entry.widthMm / 2;
}

/**
 * Whether this body declares a door leaf. A row whose front declaration cannot be read declares none, so it
 * is not a host. That does not silently zero a price: `priceDesign` refuses a document holding such a body
 * whole (`countHardwareMechanisms` raises the same two causes before any line is published). Only those two
 * declared causes are caught; anything else is a defect and leaves as itself.
 */
function declaresADoorLeaf(entry: DisplayEntry, catalog: BodyCatalog): boolean {
  try {
    return (
      doorLeafCount(
        frontPopulationQueryFor({
          body: entry,
          definition: catalog.get(entry.buildId) ?? DECLARES_NOTHING,
        }),
      ) > 0
    );
  } catch (error) {
    return refuseUnreadableFrontsAsNoDoorLeaf(error);
  }
}

function refuseUnreadableFrontsAsNoDoorLeaf(error: unknown): boolean {
  if (
    error instanceof UndeclaredFrontPopulationError ||
    error instanceof UnbuildableDoorBandError
  ) {
    return false;
  }
  throw error;
}

/** A body the catalogue does not hold declares no fronts: a value, not a `?.`, so an absent entry reaches the
 *  same refusal as an undeclared one (as in `hardware-mechanisms.ts`). */
const DECLARES_NOTHING = {};

/** Whether the first candidate outranks the second on the three keys in order. Strict, so equal candidates
 *  leave the incumbent standing and the projection's order decides. */
function isBetterRackHost(
  candidate: RackHostCandidate,
  incumbent: RackHostCandidate,
): boolean {
  if (candidate.entry.y0Mm !== incumbent.entry.y0Mm) {
    return candidate.entry.y0Mm < incumbent.entry.y0Mm;
  }
  return candidate.overlapMm > incumbent.overlapMm;
}
