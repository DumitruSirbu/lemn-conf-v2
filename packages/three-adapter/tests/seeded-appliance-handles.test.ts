// The live half of the capability-parity defect, played out through the scene the customer sees.
//
// `fridge-free-700` is a freestanding appliance: `builders["fridge-free"]()` draws no `door_front`
// and hangs its two `handle_bar` meshes off the appliance's own group. It inherited
// `columnCarcass`'s `canHandle: true` anyway, so §9 rendered a *Mâner* section over it — and
// `handle: "push"` on a body whose `canHandle` is true reaches `hidesHandles`
// (`scene-sync.ts`), which calls `setHandlesVisible(body, false)`; that walks **every** mesh whose
// name contains `handle` in the group (`decomposed-bodies.ts`), so a cabinet-hardware chip erased
// the fridge's own bars. §9's "never offer what cannot be satisfied", failing in the direction that
// takes geometry away rather than the one that merely does nothing.
//
// With `canHandle: false` the same stored `handle: "push"` is ignored and the appliance keeps its
// bars. The gate at `catalog-capability-parity.test.ts` pins the flags; this pins the consequence.
import {
  derivePlacementRecords,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  type Design,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import { isMesh } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

/** `barHandle` draws one `handle_bar` and two `handle_stem` meshes per handle. The bar is the
 *  one-per-handle mesh, so counting bars counts handles — measured on this body: two groups, six
 *  meshes, two bars. */
const HANDLE_BAR_MESH_NAME = "handle_bar";

const FRIDGE_PLACEMENT_ID = "p7";

/** `base-dishwasher-600`, the seeded niche on wall A. */
const DISHWASHER_PLACEMENT_ID = "p1";

let kit: Kit;
let solidsRoot: THREE.Group;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

beforeEach(() => {
  solidsRoot = new THREE.Group();
});

/** A design a migration or a hand edit can produce: the choice is recorded on the placement, and
 *  the scene has to answer for it whatever the panel would or would not have offered. */
function withRecordedHandle(placementId: string, handle: string): Design {
  return {
    ...KITCHEN_L_DESIGN,
    placements: KITCHEN_L_DESIGN.placements.map((placement) =>
      placement.id === placementId
        ? { ...placement, body: { ...placement.body, handle } }
        : placement,
    ),
  } as Design;
}

function mount(design: Design): void {
  const records: readonly PlacementRecord[] = derivePlacementRecords(
    design,
    KITCHEN_L_BODY_CATALOG,
  );
  syncSolidBodies({ kit, solidsRoot, records });
}

function mountedBodyOf(placementId: string): THREE.Object3D {
  const body = solidsRoot.children.find(
    (child) => child.userData["placementId"] === placementId,
  );
  if (!body) throw new Error(`No body mounted for placement "${placementId}"`);
  return body;
}

function visibleHandleBarsOf(placementId: string): number {
  let visible = 0;
  mountedBodyOf(placementId).traverse((node) => {
    if (
      isMesh(node) &&
      node.name.includes(HANDLE_BAR_MESH_NAME) &&
      node.visible
    ) {
      visible += 1;
    }
  });
  return visible;
}

describe("a seeded appliance keeps its own handles", () => {
  it("draws the freestanding fridge with both of its bars", () => {
    mount(KITCHEN_L_DESIGN);

    expect(visibleHandleBarsOf(FRIDGE_PLACEMENT_ID)).toBe(2);
  });

  it("keeps them when the placement carries handle: push", () => {
    mount(withRecordedHandle(FRIDGE_PLACEMENT_ID, "push"));

    expect(visibleHandleBarsOf(FRIDGE_PLACEMENT_ID)).toBe(2);
  });

  // The other direction of the same guard: `black` repaints rather than hides, and
  // `applyRecordedAppearance` refuses it on a body whose `canHandle` is false — so the appliance's
  // bars keep the steel material its builder gave them, not the cabinet-hardware black.
  it("leaves them steel when the placement carries handle: black", () => {
    mount(withRecordedHandle(FRIDGE_PLACEMENT_ID, "black"));

    expect(visibleHandleBarsOf(FRIDGE_PLACEMENT_ID)).toBe(2);
    expect(handleBarMaterialsOf(FRIDGE_PLACEMENT_ID)).toEqual([
      kit.M.steel,
      kit.M.steel,
    ]);
  });
});

// The other side of the same rule, and the reason ADR 0051 could not add the decor door without
// removing the appliance's bar in the same change. This body's `canHandle: true` is now *true of
// the geometry*: the only bar in the group is the decor door's, so `handle: "push"` hides a
// cabinet's handle — what the customer asked for — instead of erasing a dishwasher's fascia bar.
describe("the seeded dishwasher niche opens its own decor door", () => {
  function visibleMeshNamesOf(placementId: string): string[] {
    const names: string[] = [];
    mountedBodyOf(placementId).traverse((node) => {
      if (isMesh(node) && node.visible) names.push(node.name);
    });
    return names;
  }

  it("draws one bar by default, because a base slot is not push-open", () => {
    mount(KITCHEN_L_DESIGN);

    expect(visibleHandleBarsOf(DISHWASHER_PLACEMENT_ID)).toBe(1);
  });

  it("hides that one bar, and only it, when the placement carries handle: push", () => {
    mount(withRecordedHandle(DISHWASHER_PLACEMENT_ID, "push"));

    expect(visibleHandleBarsOf(DISHWASHER_PLACEMENT_ID)).toBe(0);
    // The door is still there to be pushed, and so is the machine behind it: there is no appliance
    // bar left in this body for a cabinet-hardware choice to erase.
    expect(visibleMeshNamesOf(DISHWASHER_PLACEMENT_ID)).toEqual(
      expect.arrayContaining(["door_front", "dw_body"]),
    );
  });
});

function handleBarMaterialsOf(placementId: string): readonly THREE.Material[] {
  const materials: THREE.Material[] = [];
  mountedBodyOf(placementId).traverse((node) => {
    if (isMesh(node) && node.name.includes(HANDLE_BAR_MESH_NAME)) {
      materials.push(node.material as THREE.Material);
    }
  });
  return materials;
}
