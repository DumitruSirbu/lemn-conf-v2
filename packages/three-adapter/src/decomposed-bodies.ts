// Builds one placement's body by `buildId`, mirroring `buildKitchen()`'s own factory calls. Each `frameDepthMm` in
// `KITCHEN_L_BODY_CATALOG` reproduces its hardcoded placement, not a physical depth. Shared by the decomposition parity
// test and the scene mount so the two cannot drift.
import * as THREE from "three";
import {
  cornerAssemblyWidthsMm,
  CORNER_WALL_UNIT_TEMPLATES,
  KITCHEN_L_DESIGN,
  toMetres,
  WORKTOP_DEPTH_MM,
} from "@lemnaria/configurator-domain";

import { wearsTheBodysFinishOnItsCarcassShell } from "./body-finish-surfaces.js";
import { forEachCabinetHandleMesh } from "./cabinet-handle-meshes.js";
import type { CatalogBodySize } from "./catalog-bodies.js";
import { deriveKitMaterial } from "./kit-ownership.js";
import type { Kit, KitMaterials } from "./kitchen-parts.js";

/** `scene-sync.ts` calls it at mount to apply the slot default and any recorded handle mode, in both directions; the
 *  seeded `*-top` arms call it via `hidePushOpenHandles` because the parity gate holds them to the reference's
 *  build-time hide. It reaches this body's own handles and no appliance's (ADR 0061 decision 1): `isCabinetHandleGroup`
 *  is the rule, shared with the capability gate that decides whether a body has a handle choice. */
export function setHandlesVisible(
  group: THREE.Group,
  areHandlesVisible: boolean,
): THREE.Group {
  forEachCabinetHandleMesh(group, (handle) => {
    handle.visible = areHandlesVisible;
  });
  return group;
}

/** §5.5's `handle: 'black'` on this body's own handles: an appliance's bar keeps its steel (ADR 0061 decision 1). The
 *  dark material is derived from `M.steel` (same roughness map and bar geometry), cached per kit and shared by every
 *  black handle, because a body re-mounts on every appearance change (see `finishes.ts`). */
export function applyBlackHandleMaterial(
  group: THREE.Group,
  M: KitMaterials,
): THREE.Group {
  const material = blackHandleMaterial(M);
  forEachCabinetHandleMesh(group, (handle) => {
    handle.material = material;
  });
  return group;
}

const BLACK_HANDLE_COLOR = "#1c1e20";
const BLACK_HANDLE_ROUGHNESS = 0.42;
const BLACK_HANDLE_METALNESS = 0.65;

/** Owned by the kit, like every material derived from `kit.M` — see `kit-ownership.ts`. */
const BLACK_HANDLE_MATERIAL_KEY = "handle:black";

function blackHandleMaterial(M: KitMaterials): THREE.Material {
  return deriveKitMaterial(M, BLACK_HANDLE_MATERIAL_KEY, () => {
    const material = M.steel.clone();
    material.color = new THREE.Color(BLACK_HANDLE_COLOR);
    material.roughness = BLACK_HANDLE_ROUGHNESS;
    material.metalness = BLACK_HANDLE_METALNESS;
    return material;
  });
}

/** §6.5: a push-to-open body keeps its handles built and hidden, never omitted: without them `canHandle` was false
 *  and the panel hid the whole *Mâner* section. */
export function hidePushOpenHandles(group: THREE.Group): THREE.Group {
  return setHandlesVisible(group, false);
}

/** The two-argument reference/parity route reads the fixture's authored width. The scene and probe pass a size through
 *  `buildAnyBody`, so the corner arms draw the recorded width even after a depth change slides the placement (ADR
 *  0089). */
function cornerWidthM(
  buildId: string,
  size: Pick<CatalogBodySize, "widthM"> | undefined,
): number {
  if (size !== undefined) return size.widthM;
  const reference = KITCHEN_L_DESIGN.placements.find(
    (placement) => placement.body.buildId === buildId,
  );
  if (reference === undefined) {
    throw new Error(`No reference corner width for buildId "${buildId}"`);
  }
  return toMetres(reference.body.widthMm);
}

/** The corner wall unit's width where the caller names none: the reference corner's reach on wall A, read from the
 *  assembly's derivation because the seeded kitchen carries no unit. The wall and top pieces share one width. */
function cornerWallUnitWidthM(
  size: Pick<CatalogBodySize, "widthM"> | undefined,
): number {
  if (size !== undefined) return size.widthM;
  const reference = cornerAssemblyWidthsMm({
    cabinetDepthMm: WORKTOP_DEPTH_MM,
    room: KITCHEN_L_DESIGN.room,
  }).pieces.find(({ wall, band }) => wall === "A" && band === "wall");
  if (reference === undefined) {
    throw new Error("No reference width for the corner wall unit");
  }
  return toMetres(reference.widthMm);
}

/** The unit's height as its own placement declares it (700 in the wall row, 400 in the top row), so the
 *  mounted body and the structural placement it stands for cannot part. */
function cornerWallUnitHeightM(buildId: string): number {
  const template = CORNER_WALL_UNIT_TEMPLATES.find(
    (placement) => placement.body.buildId === buildId,
  );
  if (template === undefined) {
    throw new Error(`No corner wall unit template for ${buildId}`);
  }
  return toMetres(template.body.heightMm);
}

export function buildDecomposedBody(
  kit: Kit,
  buildId: string,
  size?: Pick<CatalogBodySize, "widthM">,
): THREE.Group {
  switch (buildId) {
    case "base-corner-x-900":
      return kit.make.cornerBaseX(cornerWidthM(buildId, size));
    case "base-corner-return-320":
      // The return leg's depth is a placement variable (`kitchen-parts.ts`): the carcass front of the base run it
      // stands in line with, which the kit derives from its cabinet depth (0.57 at 600 mm, 0.67 at 700 mm; ADR 0135).
      // Read, never typed: a literal would build a 700 mm kitchen's leg 100 mm behind the run it closes.
      return kit.make.cornerBaseReturn(
        kit.depths.cornerReturnDepthM,
        cornerWidthM(buildId, size),
      );
    case "base-sink-800":
      return kit.make.baseCabinet(0.8, { doors: 2, sink: true });
    case "base-dishwasher-600":
      return kit.builders["base-dishwasher"]();
    case "base-drawer2-600":
      return kit.make.baseCabinet(0.6, { drawers: 2 });
    // ADR 0027: one seeded body where `buildKitchen()` places two children (the drawer base and the cooktop);
    // `hobBaseWithDrawers` composes the same two calls, so the parity gate compares against both.
    case "base-hob-2drawer-600":
      return kit.make.hobBaseWithDrawers(0.6);
    case "base-drawer3-600":
      return kit.make.baseCabinet(0.6, { drawers: 3 });
    case "tall-oven-tower-600":
      return kit.builders["tall-oven-tower"]();
    case "tall-pantry-600":
      return kit.builders["tall-pantry"]();
    case "fridge-free-700":
      return kit.builders["fridge-free"]();
    case "wall-2door-600":
      return kit.make.wallCabinet(0.6, 2);
    // A corner, so its carcass shell wears the body's colour too: the door is painted through `isFrontMesh`, the sides
    // and underside through this declaration, which is here and not in `wallCabinet` because that builder also makes
    // five ordinary wall bodies (see `body-finish-surfaces.ts`).
    case "wall-corner-return-570":
      return wearsTheBodysFinishOnItsCarcassShell(
        kit.make.wallCabinet(cornerWidthM(buildId, size), 1),
      );
    // The corner wall unit, one body per row. Built with its bar then hidden (`hidePushOpenHandles`), like every
    // top-row body, so the handle count matches the meshes and the bar can be switched back on (§6.5). It declares its
    // own finish surfaces (`wallCornerX`), so no wrapper is applied.
    case "wall-corner-x-900":
      return kit.make.wallCornerX(
        cornerWallUnitWidthM(size),
        cornerWallUnitHeightM(buildId),
      );
    case "wall-corner-x-900-top":
      return hidePushOpenHandles(
        kit.make.wallCornerX(
          cornerWallUnitWidthM(size),
          cornerWallUnitHeightM(buildId),
        ),
      );
    case "wall-1door-300":
      return kit.make.wallCabinet(0.3, 1);
    case "wall-2door-800":
      return kit.make.wallCabinet(0.8, 2);
    case "open-shelf-600":
      return kit.make.openShelf(0.6, kit.depths.wallDepthM, 2);
    case "hood-600":
      return kit.make.hood(0.6);
    case "wall-2door-600-top":
      return hidePushOpenHandles(
        kit.make.wallCabinet(0.6, 2, 0.4, kit.depths.wallDepthM),
      );
    case "wall-1door-300-top":
      return hidePushOpenHandles(
        kit.make.wallCabinet(0.3, 1, 0.4, kit.depths.wallDepthM),
      );
    case "wall-2door-800-top":
      return hidePushOpenHandles(
        kit.make.wallCabinet(0.8, 2, 0.4, kit.depths.wallDepthM),
      );
    // The same corner one row up, painted for the same reason: both faces are one solid shell, so the declaration is
    // the body's.
    case "wall-corner-return-570-top":
      return hidePushOpenHandles(
        wearsTheBodysFinishOnItsCarcassShell(
          kit.make.wallCabinet(
            cornerWidthM(buildId, size),
            1,
            0.4,
            kit.depths.wallDepthM,
          ),
        ),
      );
    // The two deep tops are the only wall rows here that read the cabinet depth, not the wall depth (ADR 0101): they
    // hang over full-height columns, so §5.2's head-clearance cap is lifted and they build to the cabinet-depth line.
    // The domain declares the same (`liftedTopSeatDepthMm`).
    case "wall-2door-600-deep-top":
      return hidePushOpenHandles(
        kit.make.wallCabinet(0.6, 2, 0.4, kit.depths.cabinetDepthM),
      );
    case "wall-2door-700-over-fridge":
      return kit.make.wallCabinet(0.7, 2, 0.75, kit.depths.cabinetDepthM);
    default:
      throw new Error(
        `No decomposition builder registered for buildId "${buildId}"`,
      );
  }
}
