// Work item 2's decomposition (`docs/milestones/M2-void-engine.md`): builds one placement's body
// by `buildId`, mirroring `buildKitchen()`'s own factory calls exactly — see
// `KITCHEN_L_BODY_CATALOG` (in `@lemnaria/configurator-domain`) for why each `frameDepthMm`
// reproduces its hardcoded placement rather than a physical depth. Shared by the decomposition
// parity test and the scene mount so the two never drift apart.
import * as THREE from "three";

import type { Kit } from "./kitchen-parts.js";
import { isMesh } from "./three-guards.js";

/** The one place that knows which meshes are handles. `scene-sync.ts` calls it at mount to apply
 *  the slot default and any recorded handle mode, in both directions; the seeded `*-top` arms below
 *  call it through `hidePushOpenHandles` because the decomposition-parity gate holds them to the
 *  reference room's own build-time hide. */
export function setHandlesVisible(
  group: THREE.Group,
  areHandlesVisible: boolean,
): THREE.Group {
  group.traverse((node) => {
    if (isMesh(node) && node.name.includes("handle")) {
      node.visible = areHandlesVisible;
    }
  });
  return group;
}

/** `DEVELOPMENT-SPEC.md` §6.5: a push-to-open body keeps its handles **built and hidden**, never
 *  omitted — built without them `canHandle` was false and the panel hid the whole *Mâner* section,
 *  so the customer could never turn them back on. */
export function hidePushOpenHandles(group: THREE.Group): THREE.Group {
  return setHandlesVisible(group, false);
}

export function buildDecomposedBody(kit: Kit, buildId: string): THREE.Group {
  switch (buildId) {
    case "base-sink-800":
      return kit.make.baseCabinet(0.8, { doors: 2, sink: true });
    case "base-dishwasher-600":
      return kit.builders["base-dishwasher"]();
    case "base-drawer2-600":
      return kit.make.baseCabinet(0.6, { drawers: 2 });
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
