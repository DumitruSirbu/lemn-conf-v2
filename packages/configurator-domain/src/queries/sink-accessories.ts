// **Where a kitchen's sink extras go** — one record per sink, each naming the wall cabinet its dish
// drying rack hangs in, or naming none.
//
// ADR 0070 decision 4 gives a sink base two extras: an aluminium protective cover, always present,
// and a drying rack above it. **The cover's position is the sink's own; the rack's is derived**, and
// deriving it is this module's whole content.
//
// **A sink is a declared catalogue fact and is never recognised here** (ADR 0092 decision 9). This
// module asks `declaresASink` and nothing else — not a `kind`, since `base-sink` declares
// `base_cabinet` like every other base body; not a build-id prefix, since the seeded row is spelled
// `base-sink-800` and the next one need not be; and not an equivalent-id comparison, which is a rule
// keyed on a list of literal ids rather than on the property.
//
// **It locates; it does not price.** No amount, rate or rule appears here and none may — the two
// amounts are the book's (`pricing/price-book.ts`), and a count of positions is a fact about bodies
// rather than about money, which is why this sits beside the other queries and not under `pricing/`
// (the split ADR 0092 decision 4 keeps for `hardware-mechanisms.ts`).
//
// I/O-free and rendering-free: a pure function of the projection and the catalogue.
import {
  doorLeafCount,
  frontPopulationQueryFor,
  UnbuildableDoorBandError,
  UndeclaredFrontPopulationError,
} from "../front-population.js";
import { declaresASink, type BodyCatalog } from "../void-engine.js";

import type { DisplayEntry } from "./design-projection.js";

/** One sink, and where its rack goes.
 *
 *  **One record per sink placement, never one per kitchen** (owner, 2026-09-04): two sinks answer
 *  two records even where both resolve to the same wall cabinet, so both the cover and the rack are
 *  billed twice. De-duplication was the recommendation on record and the owner ruled against it. */
export interface SinkAccessoryPositions {
  readonly sinkPlacementId: string;
  /** The wall cabinet this sink's rack hangs in. **Absent, never a placeholder id**, where no wall
   *  cabinet stands over the sink: a rack that has nowhere to hang is a line the customer must not
   *  be shown at all, and an amount of zero would render *inclus* — a rack they are not getting,
   *  described as included. */
  readonly rackHostPlacementId?: string;
}

/**
 * Every sink this design holds, in the projection's order, each with the wall cabinet its rack
 * resolved to.
 *
 * Takes the **projection's** entries, which already carry the wall, the normalised band, the
 * along-wall centre, the floor and the width this needs — so nothing here re-derives a position and
 * nothing here sorts.
 *
 * A body the catalogue does not hold declares no sink and hosts no rack. That is a real answer
 * rather than a refusal, and it silently prices nothing: `priceDesign` refuses an uncataloged body
 * whole, before any line exists.
 */
export function findSinkAccessories(
  entries: readonly DisplayEntry[],
  catalog: BodyCatalog,
): readonly SinkAccessoryPositions[] {
  return entries
    .filter((entry) => declaresASink(catalog.get(entry.buildId)))
    .map((sink) => describeSinkAccessories({ sink, catalog }, entries));
}

/** The sink whose rack is being placed, and the catalogue the candidates' declarations are read
 *  from. Named rather than passed positionally so the sink and the design it is searched in stay
 *  the two arguments a reader has to hold. */
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
 * **The lowest wall-band body, on the same wall, that declares at least one door leaf and whose
 * along-wall extent strictly overlaps the sink's** (ADR 0070 decision 4, read by ADR 0092
 * decision 10).
 *
 * The **tie-break is part of the rule**, because *"the lowest"* is not by itself a function — two
 * wall cabinets can sit at one `y0` over one sink. In order: lowest `y0Mm`, then the larger overlap,
 * then the **projection's** order, which is what `entries` arrives in. Never the `placements`
 * array's order, which is persistence order and reorders under editing.
 *
 * Scanning in the projection's order and replacing only on a **strictly** better candidate is what
 * makes the third key the projection's: an equal candidate later in the list never displaces the one
 * already held.
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

/** A body that could hold this sink's rack, with the overlap the tie-break reads. The overlap is
 *  carried rather than recomputed at the comparison, so the number that admitted a candidate and the
 *  number that ranks it are the same number. */
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
  // **Touching is not overlapping.** The seeded `open-shelf-600` begins exactly where the sink ends,
  // so a `>= 0` reading would admit it, tie it with the wall cabinet at the same `y0`, and hang a
  // drying rack in an open shelf.
  if (overlapMm <= NO_OVERLAP_MM) return undefined;
  return { entry, overlapMm };
}

/** A positive-length intersection is an overlap; anything else is not. Named so the strictness of
 *  the boundary is a statement rather than a comparison operator somebody has to notice. */
const NO_OVERLAP_MM = 0;

/**
 * Whether this body is the kind of thing a rack hangs in at all.
 *
 * **The band is the projection's normalised one and must be.** `top` folds into `wall` through
 * `normaliseBand` (ADR 0011 Gap C), so the top box over the seeded sink is a legitimate candidate —
 * just not the lowest. A predicate written against `rawBand` reads identically on the seeded design
 * and is wrong the moment a kitchen's only overlapping body is a `top` row.
 *
 * **And it must declare a door leaf.** This narrows ADR 0070's word *"cabinet"* from *any wall-band
 * body* to *a wall-band body with a door*, for a physical reason: a drying rack hangs inside a closed
 * cabinet, and `hood` and `open-shelf` are wall-band bodies with nowhere to hang it.
 */
function canHangARack(search: RackHostSearch, entry: DisplayEntry): boolean {
  return (
    entry.wall === search.sink.wall &&
    entry.band === "wall" &&
    declaresADoorLeaf(entry, search.catalog)
  );
}

/** How many millimetres of wall the two bodies share. Negative where they miss each other entirely,
 *  which the caller reads as no overlap rather than as a distance. */
function overlapLengthMm(left: DisplayEntry, right: DisplayEntry): number {
  return (
    Math.min(endOfMm(left), endOfMm(right)) -
    Math.max(startOfMm(left), startOfMm(right))
  );
}

/** `alongMm` is the body's **centre** along the wall, so its span reaches half its width each way. */
function startOfMm(entry: DisplayEntry): number {
  return entry.alongMm - entry.widthMm / 2;
}

function endOfMm(entry: DisplayEntry): number {
  return entry.alongMm + entry.widthMm / 2;
}

/**
 * Whether this body declares a door leaf — the question, and not *"how many leaves can be read off
 * it"*.
 *
 * A row whose front declaration cannot be read has declared no door leaf, so it is not a host. That
 * is not the read-a-missing-declaration-as-zero failure `front-population.ts` refuses: no price is
 * silently zeroed by it, because a document holding such a body is refused **whole** by
 * `priceDesign` — `countHardwareMechanisms` raises the same two causes over every entry before any
 * line is published. What this answers is only which cabinet an already-priceable kitchen's rack
 * hangs in.
 *
 * The two declared causes are the only ones caught; anything else is a defect in this repository
 * rather than a fact about the kitchen, and leaves as itself.
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

/** A body the catalogue does not hold declares no fronts. Stated as a value rather than left to a
 *  `?.` so the absent-entry case reaches the same refusal the undeclared one does, which is the
 *  shape `hardware-mechanisms.ts` keeps for the same reason. */
const DECLARES_NOTHING = {};

/** Whether the first candidate outranks the second, on the three keys in order. Strict, so equal
 *  candidates leave the incumbent standing and the projection's order decides. */
function isBetterRackHost(
  candidate: RackHostCandidate,
  incumbent: RackHostCandidate,
): boolean {
  if (candidate.entry.y0Mm !== incumbent.entry.y0Mm) {
    return candidate.entry.y0Mm < incumbent.entry.y0Mm;
  }
  return candidate.overlapMm > incumbent.overlapMm;
}
