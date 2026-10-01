// Work item 2's decomposition (`docs/milestones/M2-void-engine.md`): builds one placement's body
// by `buildId`, mirroring `buildKitchen()`'s own factory calls exactly — see
// `KITCHEN_L_BODY_CATALOG` (in `@lemnaria/configurator-domain`) for why each `frameDepthMm`
// reproduces its hardcoded placement rather than a physical depth. Shared by the decomposition
// parity test and the scene mount so the two never drift apart.
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

/** `scene-sync.ts` calls it at mount to apply the slot default and any recorded handle mode, in
 *  both directions; the seeded `*-top` arms below call it through `hidePushOpenHandles` because the
 *  decomposition-parity gate holds them to the reference room's own build-time hide.
 *
 *  **Reaches this body's own handles and no appliance's** (ADR 0061 decision 1): it used to hide
 *  every `handle` mesh in the group, so `push` on `tall-oven-tower` took the oven's and the
 *  microwave's bars down with the two cabinet doors'. `isCabinetHandleGroup` is the rule, shared
 *  with the capability gate that decides whether this body has a handle choice at all. */
export function setHandlesVisible(
  group: THREE.Group,
  areHandlesVisible: boolean,
): THREE.Group {
  forEachCabinetHandleMesh(group, (handle) => {
    handle.visible = areHandlesVisible;
  });
  return group;
}

/** §5.5's `handle: 'black'`, on this body's **own** handles: an appliance's bar keeps the steel it
 *  was built with, because cabinet hardware is not something the customer chose for an oven
 *  (ADR 0061 decision 1).
 *
 *  Every handle mesh is built with `M.steel` (`kitchen-parts.ts`), so
 *  without this the black chip moved and the scene did not: `steel` and `black` rendered
 *  identically. The dark material is derived from the steel one — same brushed roughness map, same
 *  bar geometry — so the only difference on screen is the one the customer asked for.
 *
 *  Cached per kit and shared by every black handle, for the reason `finishes.ts` states: a body
 *  re-signs and re-mounts on every appearance change, and a body's materials belong to its kit. */
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

/** `DEVELOPMENT-SPEC.md` §6.5: a push-to-open body keeps its handles **built and hidden**, never
 *  omitted — built without them `canHandle` was false and the panel hid the whole *Mâner* section,
 *  so the customer could never turn them back on. */
export function hidePushOpenHandles(group: THREE.Group): THREE.Group {
  return setHandlesVisible(group, false);
}

/** The direct two-argument reference/parity route reads the fixture's own authored width. The
 * scene and probe pass a size through `buildAnyBody`, so their six corner arms draw the recorded
 * width even after a depth change slides the placement without resizing it (ADR 0089). */
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

/** The corner wall unit's width where the caller names none: the reference corner's own reach on wall A,
 *  read from the assembly's derivation and not from a seeded placement (the seeded kitchen carries no
 *  unit, M7C wave C2). The wall and top pieces are one width, so one lookup answers for both. */
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
      // The return leg's depth is a **placement variable**, not a property of the body
      // (`kitchen-parts.ts`): it is the carcass front of the base run it stands in line with, which the
      // kit derives from its own cabinet depth — 0.57 at the declared 600 mm and 0.67 at 700 (ADR 0135;
      // it was the run's seat, 0.58 / 0.68). **Read rather than typed since M6 wave 6I**: it was the
      // literal 0.58, which built a 600 mm kitchen's leg into a 700 mm one and left the seeded body
      // 100 mm behind the run it closes, with only the depth sweep to notice.
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
    // ADR 0027: one seeded body where `buildKitchen()` still places two children — the drawer base
    // and the cooktop on top of it. `hobBaseWithDrawers` composes the same two calls, so the
    // decomposition-parity gate compares this against both of them.
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
    // **A corner, so its carcass shell wears the body's colour too** (owner's ruling, 2026-09-09):
    // the door was already painted through `isFrontMesh`, and the shell around it — the sides and
    // the underside a customer looks up at — stayed on `M.carcass`'s `#d9d8d3`, which is the white
    // column in the owner's picture. Declared here rather than inside `wallCabinet`, because that
    // builder makes five ordinary wall bodies nobody ruled on; see `body-finish-surfaces.ts`.
    case "wall-corner-return-570":
      return wearsTheBodysFinishOnItsCarcassShell(
        kit.make.wallCabinet(cornerWidthM(buildId, size), 1),
      );
    // M7C wave C2: the corner wall unit, one body for the wall row and one for the top row. Built like every
    // top-row body: **with** its bar, then hidden (`hidePushOpenHandles`), so the declared handle count
    // matches the meshes and the customer can switch the bar back on (§6.5). It wears its own finish
    // surfaces (`wallCornerX` declares them), which is why no wrapper is applied here.
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
    // The same corner one row up, and painted for the same reason. Its underside is the one a
    // customer never sees and its sides are the ones they do; both are faces of the one solid shell,
    // so the declaration is the body's rather than a face's.
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
    // **The two deep tops, and the only wall rows in this file that read the cabinet depth rather
    // than the wall depth** (ADR 0101). They hang over full-height columns, so §5.2's
    // head-clearance cap is lifted for them and the depth they are built to is the cabinet-depth
    // line itself — 600 at a 600 mm kitchen, 700 at a 700 mm one. The domain declares the same on
    // these two entries (`liftedTopSeatDepthMm`), and the parity gate sweeps both at both depths.
    //
    // They were a literal 0.6 at every setting until 2026-09-07, under ADR 0058's pin.
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
