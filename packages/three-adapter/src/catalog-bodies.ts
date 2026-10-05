// `DEVELOPMENT-SPEC.md` §7's builder column as code: the insertable catalogue entries built at a width, height and
// depth chosen at insert time. `buildDecomposedBody` serves the seeded ids, which describe one already-built body each
// and are never offered.
import * as THREE from "three";

import {
  deriveDoorCount,
  INSERTABLE_BODY_DEFINITIONS,
  toMillimetres,
} from "@lemnaria/configurator-domain";

import type { Kit } from "./kitchen-parts.js";

/** Metres: `make.hood()`'s canopy box height; the chimney parameter is everything above it, so `canopy + chimney` is
 *  §7's 0.71 m (ADR 0016). Change it only when that builder's canopy changes: `insertBody`'s built-size re-check
 *  catches drift. */
export const HOOD_CANOPY_HEIGHT_M = 0.13;

/** Millimetres, ADR 0047: an open shelf at or below this clearance gets two compartments, above it three. It lies
 *  between the top row's 400 mm and the middle row's 700 mm (`LEVELS`), and is keyed on clearance rather than row so
 *  it holds if a row moves. */
export const OPEN_SHELF_TWO_COMPARTMENT_MAX_HEIGHT_MM = 500;

/** Metres, always: the width and height §5.2 planned for the opening, in its own depth. Each builder decides how much
 *  of that depth it uses. */
export interface CatalogBodySize {
  readonly widthM: number;
  readonly heightM: number;
  readonly depthM: number;
}

type CatalogBodyBuilder = (kit: Kit, size: CatalogBodySize) => THREE.Group;

/** §7's head-clearance depth cap is a product rule that depends on what stands under the opening, a fact about the
 *  design, so it arrives already applied in the depth the domain hands the probe (`insert-fit.ts`) and builders build
 *  what they are given (§12). Re-clamping here would make the rule unreachable: the domain's 600 mm over a tall column
 *  would be cut back to the cap. */
function wallCabinet(kit: Kit, size: CatalogBodySize, doors: number) {
  return kit.make.wallCabinet(size.widthM, doors, size.heightM, size.depthM);
}

/** How many hinged doors this carcass gets, from the domain's own threshold (`deriveDoorCount`, ADR 0033): a product
 *  rule lives in the domain (§12). `toMillimetres` rounds, so a width that is 0.45 by a nanometre lands correctly. */
function doorsFor(size: CatalogBodySize): number {
  return deriveDoorCount(toMillimetres(size.widthM));
}

/** How many interior boards an open shelf carries, from the clearance it was built into (ADR 0047): `openShelf` stands
 *  `shelf_bottom` and `shelf_top` around them, so one board is two compartments and two are three. Derived, as
 *  `doorsFor` is; `toMillimetres` rounds, so a height on the threshold by a nanometre lands correctly. */
function innerShelvesFor(size: CatalogBodySize): number {
  return toMillimetres(size.heightM) > OPEN_SHELF_TWO_COMPARTMENT_MAX_HEIGHT_MM
    ? 2
    : 1;
}

/** §7's builder column, one arm per insertable id. The fixed-size entries ignore the requested size by design: the
 *  refusal comes from the domain before this runs (`resolveWidth` refuses with `WIDTH_TOO_LARGE`, §11 row 5), and
 *  `insertBody`'s built-size re-check is the backstop. Never scale a finished group to fake a fit. */
const CATALOG_BODY_BUILDERS: Readonly<Record<string, CatalogBodyBuilder>> = {
  // ADR 0033: one arm; the door count is derived (`deriveDoorCount`, which the label also reads), not declared by which
  // arm the customer landed on.
  "base-cabinet": (kit, size) =>
    kit.make.baseCabinet(size.widthM, { doors: doorsFor(size) }),
  "base-3drawer": (kit, size) =>
    kit.make.baseCabinet(size.widthM, { drawers: 3 }),
  "base-panbank": (kit, size) =>
    kit.make.baseCabinet(size.widthM, { drawers: 2 }),
  // ADR 0027: composed from existing builders: the pan bank carrying `builders.cooktop()`.
  "base-hob-2drawer": (kit, size) => kit.make.hobBaseWithDrawers(size.widthM),
  "base-hob-oven": (kit, size) => kit.make.hobBaseWithOven(size.widthM),
  "base-sink": (kit, size) =>
    kit.make.baseCabinet(size.widthM, { doors: 2, sink: true }),
  // ADR 0026: its own builder, not a `baseCabinet` option: one full-height pull-out front.
  "base-bottle-cargo": (kit, size) => kit.make.bottleCargo(size.widthM),
  "base-dishwasher": (kit, size) => kit.make.dishwasherHousing(size.widthM),
  "wall-cabinet": (kit, size) => wallCabinet(kit, size, doorsFor(size)),
  // A lift-up is a flap: `make.wallLift` builds zero doors plus one full-face slab with its bar on the bottom edge
  // (§6.5). Not §7's literal `pushOpen=true`, which omits the handle meshes, turns `canHandle` false and removes the
  // choice for good; the scene hides them by slot instead (`scene-sync.ts`, `isPushToOpen`).
  "wall-lift": (kit, size) =>
    kit.make.wallLift(size.widthM, size.heightM, size.depthM),
  // ADR 0047: the compartment count is derived from the clearance, as the door count is from the width.
  "open-shelf": (kit, size) =>
    kit.make.openShelf(
      size.widthM,
      size.depthM,
      innerShelvesFor(size),
      size.heightM,
    ),
  // ADR 0016: the hood's carcass is canopy plus chimney, so the chimney is the requested height minus the canopy.
  hood: (kit, size) =>
    kit.make.hood(size.widthM, size.heightM - HOOD_CANOPY_HEIGHT_M),
  // ADR 0048: the one full-height row built to its asked size; its door count comes from `doorsFor` (ADR 0033).
  "tall-pantry": (kit, size) =>
    kit.make.tallPantry(size.widthM, doorsFor(size)),
  "tall-oven-tower": (kit) => kit.builders["tall-oven-tower"](),
  "tall-fridge-housing": (kit) => kit.builders["tall-fridge-housing"](),
  "fridge-free": (kit) => kit.builders["fridge-free"](),
};

/** The insertable ids whose builder stands a fronted assembly in front of the shell it is given: `wallCabinet` and the
 *  lift-up it wraps. `open-shelf` has neither door nor handle, and every other builder ignores the depth it is handed
 *  (ADR 0018). Derived from the catalogue's `occupiedDepth`, never re-typed: `rebuildDepthM` reads it on reload, so a
 *  fronted row added to §7 and forgotten here would shrink that cabinet by one front assembly on every save-and-reload.
 *  `recorded-shell` with a front is the whole condition: an open shelf declares the same rule with `frontAssemblyMm`
 *  zero and stays out, and every `wall-plane` entry ignores its depth. */
const FRONTED_WALL_BUILD_IDS: ReadonlySet<string> = new Set(
  INSERTABLE_BODY_DEFINITIONS.filter(
    ([, definition]) =>
      definition.occupiedDepth.measuredFrom === "recorded-shell" &&
      definition.occupiedDepth.frontAssemblyMm > 0,
  ).map(([buildId]) => buildId),
);

/** The depth to rebuild a persisted placement at (ADR 0018 clause 4). `frame.d` is twice a body's rear overhang, not
 *  its depth; for a fronted wall shell (the declared depth less the front assembly, ADR 0036 decision 1), rebuilding
 *  from `frame.d` would shrink a 330 mm cabinet by 39 mm on every reload, compounding, and `refuseBuiltSize` checks
 *  only width and height. So the declared depth is reconstructed, with no schema field: declared 0.330 builds a 0.291
 *  shell, records `frame.d` 0.291, and rebuilds at 0.291 + 0.039 = 0.330 for any number of cycles. */
export function rebuildDepthM(
  kit: Kit,
  buildId: string,
  frameDepthM: number,
): number {
  if (!FRONTED_WALL_BUILD_IDS.has(buildId)) return frameDepthM;
  return frameDepthM + kit.depths.frontAssemblyDepthM;
}

/** Every id `buildCatalogBody` covers, in §7's order. Exported so a test can assert the builder table and the domain's
 *  insertable catalogue are the same set in both directions: a builder with no entry is dead code, and an entry with
 *  no builder is offered and then throws. */
export const CATALOG_BUILD_IDS: readonly string[] = Object.keys(
  CATALOG_BODY_BUILDERS,
);

/** Whether `buildCatalogBody` can build this id — false for every seeded decomposition id, which
 *  `buildDecomposedBody` owns. */
export function isCatalogBuildId(buildId: string): boolean {
  return Object.hasOwn(CATALOG_BODY_BUILDERS, buildId);
}

/** Builds one §7 catalogue body at the requested size in local model space (origin on the floor, horizontally centred,
 *  fronts facing +Z, §2). Throws on an unknown or non-insertable id: a caller that reached here with one has a defect,
 *  not a refusal. */
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
