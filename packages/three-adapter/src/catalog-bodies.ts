// `DEVELOPMENT-SPEC.md` §7's builder column, as code: the sixteen **insertable** catalogue
// entries built at a width, height and depth chosen at insert time.
//
// This is the parameterised half of ADR 0011 Gap A. `buildDecomposedBody` still serves M2's twenty
// seeded ids and is untouched — those describe one already-built body each and are never offered.
import * as THREE from "three";

import {
  deriveDoorCount,
  INSERTABLE_BODY_DEFINITIONS,
  toMillimetres,
} from "@lemnaria/configurator-domain";

import type { Kit } from "./kitchen-parts.js";

/** Metres. `make.hood()`'s own canopy box height — the hood's chimney parameter is everything
 *  above it, so `canopy + chimney` is the height §7 fixes at 0.71 m (ADR 0016). Change this only
 *  when that builder's canopy changes; the built-size re-check in `insertBody` catches the drift. */
export const HOOD_CANOPY_HEIGHT_M = 0.13;

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

/** §7's `min(d, cap)` clamp used to live here. It is a **head-clearance product rule** — shallow
 *  by default so nobody hits their head leaning over the counter, and lifted only where a
 *  full-height member stands under the opening and there is nothing to lean over — so it depends
 *  on what stands under the opening, which is a fact about the *design*. The adapter has no
 *  design. It now arrives already applied, in the
 *  depth the domain hands the probe (`insert-fit.ts`, `WALL_CARCASS_MAX_DEPTH_OVER_WORKTOP_M`), and
 *  the builders build what they are given. §12: product rules in the domain, builders here.
 *
 *  Re-clamping here would make the rule unreachable rather than redundant: the domain's 600 mm over
 *  a tall column would be cut back to the cap and the decision would do nothing. */
function wallCabinet(kit: Kit, size: CatalogBodySize, doors: number) {
  return kit.make.wallCabinet(size.widthM, doors, size.heightM, size.depthM);
}

/** ADR 0033: how many hinged doors this carcass gets, from the **domain's** own threshold.
 *
 *  `TWO_DOOR_MIN_WIDTH_M` used to be a literal in this file, and the label that named the door count
 *  was a literal in the catalogue — two constants agreeing at 0.45 by luck, which is the exact shape
 *  ADR 0028 and §7's depth cap were both written about. "How many doors is this cabinet called" is a
 *  product rule, so §12 puts it in the domain and this package reads it. No geometry moved: the
 *  comparison is the same one, against the same number.
 *
 *  The round trip through millimetres is the domain's own unit for a catalogue width, and
 *  `toMillimetres` rounds, so a float that is 0.45 by a nanometre lands where it should. */
function doorsFor(size: CatalogBodySize): number {
  return deriveDoorCount(toMillimetres(size.widthM));
}

/** §7's builder column, one arm per insertable id. The four fixed-size entries ignore the
 *  requested size **by design** — "columns are fixed 600 and refuse other openings with a reason".
 *  The refusal comes from the *domain*, before any of this runs: `resolveWidth` sees a fixed
 *  `widthFlex` that does not contain the opening and refuses with `WIDTH_TOO_LARGE`, naming the
 *  millimetres (§11 row 5). `insertBody`'s built-size re-check is the backstop behind that, not the
 *  gate these entries hit. Scaling a finished group to fake a fit is named in M3's Risks section as
 *  the thing not to do. */
const CATALOG_BODY_BUILDERS: Readonly<Record<string, CatalogBodyBuilder>> = {
  // ADR 0033: one arm, and the door count is **derived** rather than declared by which arm the
  // customer landed on. `deriveDoorCount` is the domain's, and it is the same function the label
  // reads — see the note above `CATALOG_BODY_BUILDERS`.
  "base-cabinet": (kit, size) =>
    kit.make.baseCabinet(size.widthM, { doors: doorsFor(size) }),
  "base-3drawer": (kit, size) =>
    kit.make.baseCabinet(size.widthM, { drawers: 3 }),
  "base-panbank": (kit, size) =>
    kit.make.baseCabinet(size.widthM, { drawers: 2 }),
  // ADR 0027: composed from builders that already existed — `base-hob-2drawer` is the pan bank
  // carrying `builders.cooktop()`, which is the pair the seeded kitchen has always rendered.
  "base-hob-2drawer": (kit, size) => kit.make.hobBaseWithDrawers(size.widthM),
  "base-hob-oven": (kit, size) => kit.make.hobBaseWithOven(size.widthM),
  "base-sink": (kit, size) =>
    kit.make.baseCabinet(size.widthM, { doors: 2, sink: true }),
  // ADR 0026: its own builder, not a `baseCabinet` option — one full-height pull-out front, and at
  // 200 mm the proportion is the product.
  "base-bottle-cargo": (kit, size) => kit.make.bottleCargo(size.widthM),
  "base-dishwasher": (kit, size) => kit.make.dishwasherHousing(size.widthM),
  "wall-cabinet": (kit, size) => wallCabinet(kit, size, doorsFor(size)),
  // A lift-up is a flap, not a hinged door: `make.wallLift` builds zero doors plus one full-face
  // slab with its bar on the bottom edge (§6.5). Deliberately **not** §7's literal `pushOpen=true`
  // — that omits the handle meshes, which turns `canHandle` false and takes the choice away for
  // good. The scene hides them by slot instead (`scene-sync.ts`, `isPushOpenByDefault`).
  "wall-lift": (kit, size) =>
    kit.make.wallLift(size.widthM, size.heightM, size.depthM),
  "open-shelf": (kit, size) =>
    kit.make.openShelf(
      size.widthM,
      size.depthM,
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

/** The insertable ids whose builder stands a **fronted** assembly in front of the shell it is
 *  given: `wallCabinet` and the lift-up it wraps. `open-shelf` has neither door nor handle, so its
 *  declared depth and its shell are the same number, and every other builder ignores the depth it
 *  is handed altogether (ADR 0018).
 *
 *  **Derived from the catalogue's own `occupiedDepth`, never re-typed here** (wave S9 review, F5).
 *  It was a literal set, and it was the *third* encoding of "a fronted wall carcass" — the domain's
 *  declaration and a copy in the domain's fake probe being the other two — with nothing comparing
 *  them. That is the ADR 0028 shape, and here it is the dangerous one: `scene-sync`'s reload path
 *  reads `rebuildDepthM`, so a fronted row added to §7 and forgotten here shrinks that cabinet by
 *  one front assembly on **every** save-and-reload, compounding, with `refuseBuiltSize` checking
 *  width and height only. ADR 0018 clause 4, exactly.
 *
 *  `recorded-shell` with a front is the whole of the condition: an open shelf declares the same rule
 *  with `frontAssemblyMm` zero and must stay out of the set, and every `wall-plane` entry ignores
 *  its depth argument. Reading `INSERTABLE_BODY_DEFINITIONS` and not the seeded map is right because
 *  `rebuildDepthM` is only ever reached for an id `isCatalogBuildId` accepts — `scene-sync` sends a
 *  seeded placement to `buildDecomposedBody` instead. */
const FRONTED_WALL_BUILD_IDS: ReadonlySet<string> = new Set(
  INSERTABLE_BODY_DEFINITIONS.filter(
    ([, definition]) =>
      definition.occupiedDepth.measuredFrom === "recorded-shell" &&
      definition.occupiedDepth.frontAssemblyMm > 0,
  ).map(([buildId]) => buildId),
);

/** The depth to rebuild a persisted placement at — **ADR 0018 clause 4, which 5F is the phase that
 *  trips.**
 *
 *  `frame.d` is twice a body's rear overhang, not its depth. That coincided with the depth for
 *  `wallCabinet` and `openShelf` only because their shell was centred on z = 0 *and* was the whole
 *  of what the builder was given. ADR 0036 decision 1 ends the second half of that: a wall shell is
 *  now the declared depth less the front assembly, so rebuilding straight from `frame.d` would
 *  shrink a 330 mm cabinet by 39 mm on every save-and-reload, compounding, with `refuseBuiltSize`
 *  checking width and height only so no gate would see it. That is exactly the growth ADR 0018
 *  wrote down before it could be hit, arriving in the shrinking direction.
 *
 *  Of ADR 0018 clause 3's two candidate directions this is the second — the caller reconstructs the
 *  declared depth rather than a new measurement being persisted beside the seat. It is chosen
 *  because it needs no schema field, no version bump and no migration (`DesignSchema` is untouched,
 *  and ADR 0038 says nothing has ever been stored), and because it converges exactly rather than
 *  approximately: declared 0.330 builds a 0.291 shell, records `frame.d` 0.291, and rebuilds at
 *  0.291 + 0.039 = 0.330 for as many cycles as you care to run. */
export function rebuildDepthM(
  kit: Kit,
  buildId: string,
  frameDepthM: number,
): number {
  if (!FRONTED_WALL_BUILD_IDS.has(buildId)) return frameDepthM;
  return frameDepthM + kit.depths.frontAssemblyDepthM;
}

/** Every id `buildCatalogBody` covers, in §7's own order. Exported so a test can assert the
 *  builder table and the domain's insertable catalogue are the *same* set in both directions —
 *  a builder with no catalogue entry is dead code, and a catalogue entry with no builder is a body
 *  that is offered and then throws. There are eighteen: §7's table has six base rows, five wall
 *  rows and four full-height rows, plus ADR 0026's `base-bottle-cargo` and ADR 0027's two
 *  hob-bearing bases, and `INSERTABLE_BODY_DEFINITIONS` matches it. */
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
