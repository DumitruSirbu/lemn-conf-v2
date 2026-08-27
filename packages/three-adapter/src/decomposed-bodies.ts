// Work item 2's decomposition (`docs/milestones/M2-void-engine.md`): builds one placement's body
// by `buildId`, mirroring `buildKitchen()`'s own factory calls exactly — see
// `KITCHEN_L_BODY_CATALOG` (in `@lemnaria/configurator-domain`) for why each `frameDepthMm`
// reproduces its hardcoded placement rather than a physical depth. Shared by the decomposition
// parity test and the scene mount so the two never drift apart.
import * as THREE from "three";

import type { Kit, KitMaterials } from "./kitchen-parts.js";
import { isMesh } from "./three-guards.js";

/** `scene-sync.ts` calls it at mount to apply the slot default and any recorded handle mode, in
 *  both directions; the seeded `*-top` arms below call it through `hidePushOpenHandles` because the
 *  decomposition-parity gate holds them to the reference room's own build-time hide.
 *
 *  This file is the one place that knows which meshes are handles — hence
 *  `applyBlackHandleMaterial` beside it rather than in a module that would have to re-derive the
 *  same mesh names. */
export function setHandlesVisible(
  group: THREE.Group,
  areHandlesVisible: boolean,
): THREE.Group {
  forEachHandleMesh(group, (handle) => {
    handle.visible = areHandlesVisible;
  });
  return group;
}

/** §5.5's `handle: 'black'`. Every handle mesh is built with `M.steel` (`kitchen-parts.ts`), so
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
  forEachHandleMesh(group, (handle) => {
    handle.material = material;
  });
  return group;
}

const BLACK_HANDLE_COLOR = "#1c1e20";
const BLACK_HANDLE_ROUGHNESS = 0.42;
const BLACK_HANDLE_METALNESS = 0.65;

const blackHandleMaterialByKit = new WeakMap<KitMaterials, THREE.Material>();

function blackHandleMaterial(M: KitMaterials): THREE.Material {
  const cached = blackHandleMaterialByKit.get(M);
  if (cached) return cached;

  const material = M.steel.clone();
  material.color = new THREE.Color(BLACK_HANDLE_COLOR);
  material.roughness = BLACK_HANDLE_ROUGHNESS;
  material.metalness = BLACK_HANDLE_METALNESS;
  blackHandleMaterialByKit.set(M, material);
  return material;
}

function forEachHandleMesh(
  group: THREE.Group,
  visit: (handle: THREE.Mesh) => void,
): void {
  group.traverse((node) => {
    if (isMesh(node) && node.name.includes("handle")) visit(node);
  });
}

/** `DEVELOPMENT-SPEC.md` §6.5: a push-to-open body keeps its handles **built and hidden**, never
 *  omitted — built without them `canHandle` was false and the panel hid the whole *Mâner* section,
 *  so the customer could never turn them back on. */
export function hidePushOpenHandles(group: THREE.Group): THREE.Group {
  return setHandlesVisible(group, false);
}

/** The return leg's depth is a **placement variable**, not a property of the body
 *  (`kitchen-parts.ts`): it has to equal the front plane of whatever the leg butts into. In the
 *  seeded L that neighbour is the 580 mm-deep tall run, so `buildKitchen()` builds it at exactly
 *  this value and the decomposition-parity gate holds the two together. */
const SEEDED_CORNER_RETURN_DEPTH_M = 0.58;

export function buildDecomposedBody(kit: Kit, buildId: string): THREE.Group {
  switch (buildId) {
    case "base-corner-x-900":
      return kit.make.cornerBaseX();
    case "base-corner-return-320":
      return kit.make.cornerBaseReturn(SEEDED_CORNER_RETURN_DEPTH_M);
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
    // Kept for the designs saved before that migration, which still carry a `cooktop-600`
    // placement. No seeded placement references it any more.
    case "cooktop-600":
      return kit.builders.cooktop();
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
    case "wall-corner-return-570":
      return kit.make.wallCabinet(0.57, 1);
    case "wall-1door-300":
      return kit.make.wallCabinet(0.3, 1);
    case "wall-2door-800":
      return kit.make.wallCabinet(0.8, 2);
    case "open-shelf-600":
      return kit.make.openShelf(0.6, 0.33, 2);
    case "hood-600":
      return kit.make.hood(0.6);
    case "wall-2door-600-top":
      return hidePushOpenHandles(kit.make.wallCabinet(0.6, 2, 0.4, 0.33));
    case "wall-1door-300-top":
      return hidePushOpenHandles(kit.make.wallCabinet(0.3, 1, 0.4, 0.33));
    case "wall-2door-800-top":
      return hidePushOpenHandles(kit.make.wallCabinet(0.8, 2, 0.4, 0.33));
    case "wall-corner-return-570-top":
      return hidePushOpenHandles(kit.make.wallCabinet(0.57, 1, 0.4, 0.33));
    case "wall-2door-600-deep-top":
      return hidePushOpenHandles(kit.make.wallCabinet(0.6, 2, 0.4, 0.6));
    case "wall-2door-700-over-fridge":
      return kit.make.wallCabinet(0.7, 2, 0.75, 0.6);
    default:
      throw new Error(
        `No decomposition builder registered for buildId "${buildId}"`,
      );
  }
}
