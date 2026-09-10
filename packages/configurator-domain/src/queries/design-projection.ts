// The one projection that orders and groups a design's bodies for a customer to read: wall →
// normalised band → height → along-wall order.
//
// M6's largest recorded risk is three groupings drifting apart — the live scene, the price
// breakdown and M8's review summary. The cheapest way to make that unrepresentable is to have one
// projection before anything needs two, so this module exists before its first consumer does. Every
// surface that lists bodies reads `projectDesignForDisplay`; none sorts, groups or labels its own.
//
// I/O-free and rendering-free by construction: a pure function of the document and the catalogue,
// returning plain data.
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
  /** ADR 0033, derived by `describeBodyLabelAt` and nowhere else — see `labelOf`. */
  readonly label: BodyLabel;
  readonly wall: DesignWall;
  readonly band: NormalisedBand;
  /** The catalogue's own band, kept beside the normalised one so a line that names the *rând de
   *  sus* row can say so without re-reading the catalogue for `definition.band`. Never a group key
   *  — see `toDisplayEntry`. */
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

/** §2: both runs start at the corner the walls meet at, and wall A is the run the customer faces
 *  first in every camera preset. */
const WALL_DISPLAY_RANK: Readonly<Record<DesignWall, number>> = { A: 0, B: 1 };

/**
 * **The repository's one display-order comparator.** Wall, then normalised band, then `y0Mm` — the
 * body's floor — then its position along the wall, and the placement id last.
 *
 * Height before position is ADR 0063, an owner decision: a group reads as whole rows, the
 * hanging row left to right and then the top row left to right, rather than as each column's
 * cabinet followed by the box standing above it.
 *
 * A total order is not a nicety here: it is what makes this projection a *function* of the design
 * rather than of the order its `placements` array happens to be in. Nothing in the document stops
 * two placements agreeing on all four keys above — the seeded top row folds into the suspended one,
 * so not even the raw band separates them — and without a fifth key such a pair would compare equal
 * and a re-serialised document could list them either way round. The id is that last resort, and it
 * can be: ids are unique because `findDuplicatePlacementIds` in `validate-design.ts` refuses
 * `DUPLICATE_PLACEMENT_ID` at the write seam (`PUT /api/designs/:id`) and at the load seam
 * (`migrateDesign`). Persistence records that uniqueness; it does not grant it.
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
 * Reads `placements` and nothing else in the document. `emptyColumns` and the voids derived from a
 * column map are space, not bodies: they carry no catalogue entry, no label and no price, so a
 * design of nothing but empty space projects to **zero** groups rather than to one empty group.
 *
 * Throws `UnknownBodyError` for a `buildId` the catalogue does not hold, matching
 * `derivePlacementRecords`: a list that silently omits a body the customer owns is worse than one
 * that refuses to render.
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
    // ADR 0011 Gap C: `top` is a module row, not a catalogue band, and folding it here is what puts
    // the seeded top row inside the mockup's *Perete A · suspendate* group. Never key a group on
    // the raw band.
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

/** The entries are already in display order, and that order is wall-major then band-major, so a
 *  single pass that starts a group whenever the pair changes produces the groups in the same order
 *  without a second comparator. */
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
