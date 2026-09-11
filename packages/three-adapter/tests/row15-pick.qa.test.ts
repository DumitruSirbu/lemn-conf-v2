// Adversarial QA over §11 row 15 after the ADR 0038 deletion: "click the hob → selects its host
// cabinet; the hob cannot be deleted".
//
// The rule used to be enforced by code — `pick` resolved the raw hit through `resolveSelection`,
// which rewrote an accessory's placement id to its host's. That pass is gone, and the claim that
// replaces it is a claim about the mesh tree: the hob is a child of its cabinet's group, so the
// climb lands on the cabinet with no second pass.
//
// `hob-base.adversarial.test.ts` proves the climb from the glass mesh. This file closes the last
// hop — the actual **click**, through `pick`, on the mounted seeded kitchen, so that row 15 is
// pinned at the entry point `KitchenStage`'s pointer handler calls rather than one function inside
// it. A composite that mounted the hob as a sibling would still pass a climb test written against
// the mesh directly, but would fail here.
import {
  derivePlacementRecords,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { createPickingRaycaster, pick } from "../src/picking.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { findMeshes } from "./support/structure.js";

const HOB_PLACEMENT_ID = "p2";
const HOB_MESH_NAME = "cooktop_glass";

let kit: Kit;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

describe("§11 row 15 through `pick`, on the mounted seeded kitchen", () => {
  let solidsRoot: THREE.Group;
  let voidsRoot: THREE.Group;

  beforeEach(() => {
    solidsRoot = new THREE.Group();
    voidsRoot = new THREE.Group();
    syncSolidBodies({
      kit,
      solidsRoot,
      records: derivePlacementRecords(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG),
      room: KITCHEN_L_DESIGN.room,
    });
  });

  it("a ray dropped onto the hob's glass selects the cabinet's placement, not a hob of its own", () => {
    const hobMeshes = findMeshes(solidsRoot, HOB_MESH_NAME);
    expect(hobMeshes).toHaveLength(1);
    const glass = hobMeshes[0];
    if (!glass) return;

    // Straight down onto the glass plate's own world centre: the one point on the whole kitchen
    // where a click is unambiguously "on the hob".
    const aimedAt = new THREE.Vector3();
    glass.updateWorldMatrix(true, false);
    glass.getWorldPosition(aimedAt);

    const raycaster = createPickingRaycaster();
    raycaster.set(
      new THREE.Vector3(aimedAt.x, aimedAt.y + 1, aimedAt.z),
      new THREE.Vector3(0, -1, 0),
    );

    expect(pick(raycaster, solidsRoot, voidsRoot)).toEqual({
      kind: "placement",
      id: HOB_PLACEMENT_ID,
    });
  });
});
