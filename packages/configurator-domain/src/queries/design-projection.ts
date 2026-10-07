// The one projection that orders and groups a design's bodies for a customer to read: wall → normalised
// band → height → along-wall order. Every surface that lists bodies (the live scene, the price
// breakdown, M8's review summary) reads `projectDesignForDisplay`; none sorts, groups or labels its
// own, so the three groupings cannot drift apart.
//
// I/O-free and rendering-free: a pure function of the document and the catalogue, returning plain data.
import { normaliseBand, type NormalisedBand } from "../bands.js";
import { describeBodyLabelAt, type BodyLabel } from "../catalog.js";
import type { Design, DesignPlacement, DesignWall, Handle } from "../design.js";
import type { Finish } from "../materials.js";
import { compareOpaqueIds } from "../opaque-id-order.js";
import {
  UnknownBodyError,
  type Band,
  type BodyCatalog,
  type BodyDefinition,
} from "../void-engine.js";

/** One placement, as a customer-facing list shows it. Carries the placement's id so every line
 *  traces back to the document, and the width so a price line can be a formula over it. */
export interface DisplayEntry {
  readonly placementId: string;
  /** §6.3: identity is the chosen catalogue id, never re-inferred from geometry. */
  readonly buildId: string;
  /** Derived by `describeBodyLabelAt` and nowhere else (ADR 0033). */
  readonly label: BodyLabel;
  readonly wall: DesignWall;
  readonly band: NormalisedBand;
  /** The catalogue's own band, kept beside the normalised one so a line naming the *rând de sus* row
   *  needs no catalogue re-read. Never a group key (see `toDisplayEntry`). */
  readonly rawBand: Band;
  /** The along-wall centre, in whole millimetres, exactly as the placement carries it. */
  readonly alongMm: number;
  /** The body's floor, in whole millimetres — not its height, which is `heightMm`. */
  readonly y0Mm: number;
  readonly widthMm: number;
  /** So a dimension line reads `W × H mm` from the entry alone, as §9's header already does. */
  readonly heightMm: number;
  /** The finish currently applied, absent when the body ships in its default — a real state, and
   *  a per-cabinet choice, so a list that shows it must read the placement, not the catalogue. */
  readonly finish?: Finish;
  /** The handle mode currently applied, absent when none was chosen (§6.5). Per placement, for the
   *  same reason as `finish`. */
  readonly handle?: Handle;
}

/** One heading and the bodies under it — the mockup's *Perete A · suspendate*. A group is never
 *  empty: a wall/band pair with no body in it produces no group at all. */
export interface DisplayGroup {
  readonly wall: DesignWall;
  readonly band: NormalisedBand;
  readonly entries: readonly DisplayEntry[];
}

/** The order the mockup's own counts are read in — *bază 6 · suspendate 7 · coloană 1*: what stands
 *  on the floor, then what hangs above it, then the full-height run last because it spans both. */
const BAND_DISPLAY_RANK: Readonly<Record<NormalisedBand, number>> = {
  base: 0,
  wall: 1,
  column: 2,
};

/** §2: every run starts at the corner the walls meet at, and wall A is the one the customer faces
 *  first. Wall C ranks after wall B (ADR 0132 decision 1: reading order A, B, C). */
const WALL_DISPLAY_RANK: Readonly<Record<DesignWall, number>> = {
  A: 0,
  B: 1,
  C: 2,
};

/**
 * The repository's one display-order comparator: wall, then normalised band, then `y0Mm` (the body's
 * floor), then position along the wall, and the placement id last.
 *
 * Height before position is ADR 0063: a group reads as whole rows, the hanging row left to right and
 * then the top row left to right.
 *
 * A total order makes the projection a function of the design, not of its `placements` array order:
 * two placements can agree on all four keys (the seeded top row folds into the suspended one), and
 * without the id such a pair could list either way round. The id can be the last resort because
 * `findDuplicatePlacementIds` in `validate-design.ts` refuses `DUPLICATE_PLACEMENT_ID` at the write
 * and load seams.
 */
export function compareDisplayOrder(
  left: DisplayEntry,
  right: DisplayEntry,
): number {
  return (
    WALL_DISPLAY_RANK[left.wall] - WALL_DISPLAY_RANK[right.wall] ||
    BAND_DISPLAY_RANK[left.band] - BAND_DISPLAY_RANK[right.band] ||
    left.y0Mm - right.y0Mm ||
    left.alongMm - right.alongMm ||
    compareOpaqueIds(left.placementId, right.placementId)
  );
}

/**
 * A design's bodies, grouped and ordered for every surface that lists them.
 *
 * Reads `placements` and nothing else: `emptyColumns` and derived voids are space, not bodies, so a
 * design of nothing but empty space projects to **zero** groups. Throws `UnknownBodyError` for a
 * `buildId` the catalogue does not hold, as `derivePlacementRecords` does: a list silently omitting a
 * body the customer owns is worse than one that refuses to render.
 */
export function projectDesignForDisplay(
  design: Design,
  catalog: BodyCatalog,
): readonly DisplayGroup[] {
  const entries = design.placements
    .map((placement) => toDisplayEntry(placement, catalog))
    .sort(compareDisplayOrder);
  return groupInDisplayOrder(entries);
}

function toDisplayEntry(
  placement: DesignPlacement,
  catalog: BodyCatalog,
): DisplayEntry {
  const definition = lookupDefinition(catalog, placement.body.buildId);
  return {
    placementId: placement.id,
    buildId: placement.body.buildId,
    label: describeBodyLabelAt(
      { buildId: placement.body.buildId, definition },
      placement.body.widthMm,
    ),
    wall: placement.wall,
    // ADR 0011 Gap C: `top` is a module row, not a band; folding it here puts the seeded top row inside
    // *Perete A · suspendate*. Never key a group on the raw band.
    band: normaliseBand(definition.band),
    rawBand: definition.band,
    alongMm: placement.alongMm,
    y0Mm: placement.y0Mm,
    widthMm: placement.body.widthMm,
    heightMm: placement.body.heightMm,
    ...(placement.body.finish === undefined
      ? {}
      : { finish: placement.body.finish }),
    ...(placement.body.handle === undefined
      ? {}
      : { handle: placement.body.handle }),
  };
}

/** The entries arrive in display order (wall-major, then band-major), so one pass that starts a group
 *  whenever the pair changes yields the groups without a second comparator. */
function groupInDisplayOrder(
  entries: readonly DisplayEntry[],
): readonly DisplayGroup[] {
  const groups: {
    wall: DesignWall;
    band: NormalisedBand;
    entries: DisplayEntry[];
  }[] = [];
  for (const entry of entries) {
    const open = groups.at(-1);
    if (open && open.wall === entry.wall && open.band === entry.band) {
      open.entries.push(entry);
      continue;
    }
    groups.push({ wall: entry.wall, band: entry.band, entries: [entry] });
  }
  return groups;
}

function lookupDefinition(
  catalog: BodyCatalog,
  buildId: string,
): BodyDefinition {
  const definition = catalog.get(buildId);
  if (!definition) throw new UnknownBodyError(buildId);
  return definition;
}
