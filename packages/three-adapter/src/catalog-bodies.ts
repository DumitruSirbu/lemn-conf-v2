// `DEVELOPMENT-SPEC.md` §7's builder column, as code: the fifteen **insertable** catalogue
// entries built at a width, height and depth chosen at insert time.
//
// This is the parameterised half of ADR 0011 Gap A. `buildDecomposedBody` still serves M2's twenty
// seeded ids and is untouched — those describe one already-built body each and are never offered.
import * as THREE from "three";

import type { Kit } from "./kitchen-parts.js";

/** Metres. `make.hood()`'s own canopy box height — the hood's chimney parameter is everything
 *  above it, so `canopy + chimney` is the height §7 fixes at 0.71 m (ADR 0016). Change this only
 *  when that builder's canopy changes; the built-size re-check in `insertBody` catches the drift. */
export const HOOD_CANOPY_HEIGHT_M = 0.13;

/** §7's `min(d, 0.4)` clamp: a wall carcass never gets deeper than 400 mm however deep the column
 *  it hangs in is. */
const WALL_CARCASS_MAX_DEPTH_M = 0.4;

/** §7's wall-cabinet door rule, `w > 0.45 ? 2 : 1`. §11 row 20 is the 570 mm case: two doors. */
const TWO_DOOR_MIN_WIDTH_M = 0.45;

/** §7: an open shelf carries two inner shelves whatever its height. */
const OPEN_SHELF_INNER_SHELVES = 2;

/** Metres, always. The width and height §5.2 planned for the opening, in the opening's own depth;
 *  each builder decides how much of that depth it actually uses. */
export interface CatalogBodySize {
  readonly widthM: number;
  readonly heightM: number;
  readonly depthM: number;
}

type CatalogBodyBuilder = (kit: Kit, size: CatalogBodySize) => THREE.Group;

function wallCarcassDepthM(size: CatalogBodySize): number {
  return Math.min(size.depthM, WALL_CARCASS_MAX_DEPTH_M);
}

function wallCabinet(kit: Kit, size: CatalogBodySize, doors: number) {
  return kit.make.wallCabinet(
    size.widthM,
    doors,
    size.heightM,
    wallCarcassDepthM(size),
  );
}

/** §7's builder column, one arm per insertable id. The four fixed-size entries ignore the
 *  requested size **by design** — "columns are fixed 600 and refuse other openings with a reason".
 *  The refusal comes from the *domain*, before any of this runs: `resolveWidth` sees a fixed
 *  `widthFlex` that does not contain the opening and refuses with `WIDTH_TOO_LARGE`, naming the
 *  millimetres (§11 row 5). `insertBody`'s built-size re-check is the backstop behind that, not the
 *  gate these entries hit. Scaling a finished group to fake a fit is named in M3's Risks section as
 *  the thing not to do. */
const CATALOG_BODY_BUILDERS: Readonly<Record<string, CatalogBodyBuilder>> = {
  "base-2door": (kit, size) => kit.make.baseCabinet(size.widthM, { doors: 2 }),
  "base-1door": (kit, size) => kit.make.baseCabinet(size.widthM, { doors: 1 }),
  "base-3drawer": (kit, size) =>
    kit.make.baseCabinet(size.widthM, { drawers: 3 }),
  "base-panbank": (kit, size) =>
    kit.make.baseCabinet(size.widthM, { drawers: 2 }),
  "base-sink": (kit, size) =>
    kit.make.baseCabinet(size.widthM, { doors: 2, sink: true }),
  "base-dishwasher": (kit, size) => kit.make.dishwasherHousing(size.widthM),
  "wall-2door": (kit, size) =>
    wallCabinet(kit, size, size.widthM > TWO_DOOR_MIN_WIDTH_M ? 2 : 1),
  "wall-1door": (kit, size) => wallCabinet(kit, size, 1),
  // A lift-up is a flap, not a hinged door: `make.wallLift` builds zero doors plus one full-face
  // slab with its bar on the bottom edge (§6.5). Deliberately **not** §7's literal `pushOpen=true`
  // — that omits the handle meshes, which turns `canHandle` false and takes the choice away for
  // good. The scene hides them by slot instead (`scene-sync.ts`, `isPushOpenByDefault`).
  "wall-lift": (kit, size) =>
    kit.make.wallLift(size.widthM, size.heightM, wallCarcassDepthM(size)),
  "open-shelf": (kit, size) =>
    kit.make.openShelf(
      size.widthM,
      wallCarcassDepthM(size),
      OPEN_SHELF_INNER_SHELVES,
      size.heightM,
    ),
  // ADR 0016: the hood's carcass is its canopy *and* its chimney, so the chimney parameter is the
  // requested height minus the canopy the builder always adds.
  hood: (kit, size) =>
    kit.make.hood(size.widthM, size.heightM - HOOD_CANOPY_HEIGHT_M),
  "tall-pantry": (kit) => kit.builders["tall-pantry"](),
  "tall-oven-tower": (kit) => kit.builders["tall-oven-tower"](),
  "tall-fridge-housing": (kit) => kit.builders["tall-fridge-housing"](),
  "fridge-free": (kit) => kit.builders["fridge-free"](),
};

/** Every id `buildCatalogBody` covers, in §7's own order. Exported so a test can assert the
 *  builder table and the domain's insertable catalogue are the *same* set in both directions —
 *  a builder with no catalogue entry is dead code, and a catalogue entry with no builder is a body
 *  that is offered and then throws. There are fifteen, not fourteen: §7's table has six base rows,
 *  five wall rows and four full-height rows, and `INSERTABLE_BODY_DEFINITIONS` matches it. */
export const CATALOG_BUILD_IDS: readonly string[] = Object.keys(
  CATALOG_BODY_BUILDERS,
);

/** Whether `buildCatalogBody` can build this id — false for every seeded decomposition id, which
 *  `buildDecomposedBody` owns. */
export function isCatalogBuildId(buildId: string): boolean {
  return Object.hasOwn(CATALOG_BODY_BUILDERS, buildId);
}

/** Builds one §7 catalogue body at the requested size, in local model space (origin on the floor,
 *  horizontally centred, fronts facing +Z — §2). Throws on an unknown or non-insertable id, the
 *  way `buildDecomposedBody` does: a caller that reached here with one has a defect, not a
 *  refusal. */
export function buildCatalogBody(
  kit: Kit,
  buildId: string,
  size: CatalogBodySize,
): THREE.Group {
  const build = CATALOG_BODY_BUILDERS[buildId];
  if (!build) {
    throw new Error(`No catalog builder registered for buildId "${buildId}"`);
  }
  return build(kit, size);
}
