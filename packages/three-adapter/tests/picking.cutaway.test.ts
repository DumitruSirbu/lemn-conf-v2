// M7B wave U4 fix, F4 (ADR 0132 Amendment A2): `pick` skips any hit whose object, or an ancestor, is
// not drawn, and falls through to the next hit. three.js raycasts an invisible mesh all the same, so
// without this a cut-away run — or a hidden push-to-open handle — would take a click aimed past it.
//
// §11 rows 2 and 22 and the push-to-open case are re-run with the filter in place: it must remove
// only what is not drawn.
import {
  buildKitchenLBodyCatalog,
  derivePlacementRecords,
  KITCHEN_L_DESIGN,
  type DesignWall,
  type VoidRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { applyCutaway } from "../src/cutaway.js";
import { makeKit } from "../src/kitchen-parts.js";
import { createPickingRaycaster, pick } from "../src/picking.js";
import { syncSolidBodies, syncVoidMeshes } from "../src/scene-sync.js";
import { isMesh } from "../src/three-guards.js";
import { tagWall } from "../src/wall-tag.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { required } from "./support/required.js";
import { acceptedU } from "./support/u-scene.js";

/** The walls these voids stand on are a U's: B and C are only ever drawn there. */
const U_ROOM = acceptedU(3000, 3000, 3000);

beforeAll(() => {
  installHeadlessDocument();
});

function box(id: string, x: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.5));
  mesh.position.set(x, 0.4, z);
  mesh.userData["placementId"] = id;
  return mesh;
}

/** A ray along −z from in front of the boxes, so the nearest hit is the box with the largest z. */
function rayThrough(x: number): THREE.Raycaster {
  const raycaster = createPickingRaycaster();
  raycaster.set(new THREE.Vector3(x, 0.4, 5), new THREE.Vector3(0, 0, -1));
  return raycaster;
}

function pickAmong(
  solids: THREE.Object3D,
  voids: THREE.Object3D = new THREE.Group(),
): string | undefined {
  solids.updateMatrixWorld(true);
  voids.updateMatrixWorld(true);
  return pick(rayThrough(0), solids, voids)?.id;
}

describe("pick skips what is not drawn", () => {
  it("falls through an invisible nearest hit to the next one", () => {
    const solids = new THREE.Group();
    const near = box("near", 0, 1);
    near.visible = false;
    solids.add(near, box("far", 0, -1));

    expect(pickAmong(solids)).toBe("far");
  });

  it("falls through a hit whose ancestor is invisible, though the hit itself is visible", () => {
    const solids = new THREE.Group();
    const group = new THREE.Group();
    group.userData["placementId"] = "near";
    group.visible = false;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.5));
    door.position.set(0, 0.4, 1);
    group.add(door);
    solids.add(group, box("far", 0, -1));

    expect(door.visible).toBe(true);
    expect(pickAmong(solids)).toBe("far");
  });

  it("selects the nearest one that is drawn when several in front are not", () => {
    const solids = new THREE.Group();
    const nearest = box("nearest", 0, 3);
    const middle = box("middle", 0, 1);
    nearest.visible = false;
    middle.visible = false;
    solids.add(nearest, middle, box("far", 0, -1));

    expect(pickAmong(solids)).toBe("far");
  });

  it("falls back to a void when every solid on the ray is not drawn", () => {
    const solids = new THREE.Group();
    const hidden = box("hidden", 0, 1);
    hidden.visible = false;
    solids.add(hidden);
    const voids = new THREE.Group();
    syncVoidMeshes({
      voidsRoot: voids,
      voids: [voidAt("B", "b-void", 0, 0.9)],
      room: U_ROOM,
    });

    expect(pickAmong(solids, voids)).toBe("b-void");
  });

  it("selects nothing rather than the hidden body when nothing else is on the ray", () => {
    const solids = new THREE.Group();
    const hidden = box("hidden", 0, 1);
    hidden.visible = false;
    solids.add(hidden);

    expect(pickAmong(solids)).toBeUndefined();
  });

  it("skips a void that is not drawn", () => {
    const voids = new THREE.Group();
    syncVoidMeshes({
      voidsRoot: voids,
      voids: [voidAt("C", "c-void", 0, 0.9)],
      room: U_ROOM,
    });
    required(voids.children[0], "the void").visible = false;

    expect(pickAmong(new THREE.Group(), voids)).toBeUndefined();
  });

  it("still selects a drawn body: visible objects are never filtered", () => {
    const solids = new THREE.Group();
    solids.add(box("near", 0, 1), box("far", 0, -1));

    expect(pickAmong(solids)).toBe("near");
  });
});

function voidAt(
  wall: DesignWall,
  id: string,
  x: number,
  z: number,
  y0 = 0,
  h = 0.8,
): VoidRecord {
  return {
    id,
    col: `${wall}|col`,
    wall,
    x,
    z,
    ry: 0,
    w: 0.6,
    d: 0.5,
    y0,
    h,
    spanY0: y0,
    spanH: h,
  };
}

describe("§11 row 22 with the filter: voids never swallow clicks, and a cut-away void is not one", () => {
  it("selects the solid cabinet when a drawn void lies along the same ray", () => {
    const solids = new THREE.Group();
    solids.add(box("base-1", 0, 1));
    const voids = new THREE.Group();
    syncVoidMeshes({
      voidsRoot: voids,
      voids: [voidAt("B", "b-void", 0, 1)],
      room: U_ROOM,
    });

    expect(pickAmong(solids, voids)).toBe("base-1");
  });

  it("selects the cabinet behind a void of a cut-away wall, and never that void", () => {
    const solids = new THREE.Group();
    const cabinet = box("b-cabinet", 0, -1);
    tagWall(cabinet, "B");
    solids.add(cabinet);
    const voids = new THREE.Group();
    syncVoidMeshes({
      voidsRoot: voids,
      voids: [voidAt("C", "c-void", 0, 1)],
      room: U_ROOM,
    });

    applyCutaway(solids, voids, ["C"]);

    expect(pickAmong(solids, voids)).toBe("b-cabinet");
  });

  it("selects nothing at a cut-away wall's void with no drawn body behind it", () => {
    const voids = new THREE.Group();
    syncVoidMeshes({
      voidsRoot: voids,
      voids: [voidAt("C", "c-void", 0, 1)],
      room: U_ROOM,
    });

    applyCutaway(new THREE.Group(), voids, ["C"]);

    expect(pickAmong(new THREE.Group(), voids)).toBeUndefined();
  });
});

describe("§11 row 2 with the filter: the base slot of a cleared column, not the middle one", () => {
  /** A cleared column's three slots stacked at one x and z, as `recomputeVoids` leaves them. */
  const SLOTS = (wall: DesignWall): readonly VoidRecord[] => [
    voidAt(wall, `${wall}-base`, 0, 0, 0, 0.86),
    voidAt(wall, `${wall}-middle`, 0, 0, 0.86, 1.34),
    voidAt(wall, `${wall}-top`, 0, 0, 2.2, 0.4),
  ];

  function clickDownOnTheBaseSlot(voids: THREE.Group): string | undefined {
    voids.updateMatrixWorld(true);
    const raycaster = createPickingRaycaster();
    raycaster.set(new THREE.Vector3(0, 1.43, 0), new THREE.Vector3(0, -1, 0));
    return pick(raycaster, new THREE.Group(), voids)?.id;
  }

  it("selects the base slot of a drawn column while another wall is cut away", () => {
    const voids = new THREE.Group();
    syncVoidMeshes({
      voidsRoot: voids,
      voids: [...SLOTS("B"), ...SLOTS("C").map((v) => ({ ...v, x: 3 }))],
      room: U_ROOM,
    });

    applyCutaway(new THREE.Group(), voids, ["C"]);

    expect(clickDownOnTheBaseSlot(voids)).toBe("B-base");
  });

  it("selects nothing on a column whose wall is cut away", () => {
    const voids = new THREE.Group();
    syncVoidMeshes({
      voidsRoot: voids,
      voids: SLOTS("C"),
      room: U_ROOM,
    });

    applyCutaway(new THREE.Group(), voids, ["C"]);

    expect(clickDownOnTheBaseSlot(voids)).toBeUndefined();
  });
});

describe("§6.5 with the filter: a click on a push-to-open top-row door selects its cabinet", () => {
  function mountedTopRowDoor(): {
    readonly solids: THREE.Group;
    readonly hiddenHandle: THREE.Mesh;
  } {
    const kit = makeKit({ createCanvas: createHeadlessCanvas });
    const records = derivePlacementRecords(
      {
        ...KITCHEN_L_DESIGN,
        placements: [
          {
            id: "top-door",
            wall: "A",
            alongMm: 1000,
            y0Mm: 2200,
            body: {
              buildId: "wall-2door-600-top",
              widthMm: 600,
              heightMm: 400,
            },
          },
        ],
      },
      buildKitchenLBodyCatalog(600),
    );
    const solids = new THREE.Group();
    syncSolidBodies({
      kit,
      solidsRoot: solids,
      records,
      room: KITCHEN_L_DESIGN.room,
    });
    solids.updateMatrixWorld(true);
    return { solids, hiddenHandle: firstHiddenMesh(solids) };
  }

  function firstHiddenMesh(root: THREE.Object3D): THREE.Mesh {
    let found: THREE.Mesh | undefined;
    root.traverse((node) => {
      if (found === undefined && isMesh(node) && !node.visible) found = node;
    });
    return required(found, "a hidden push-to-open handle");
  }

  it("has a hidden handle on the ray, which is skipped, and the door behind it is the same placement", () => {
    const { solids, hiddenHandle } = mountedTopRowDoor();
    const aim = new THREE.Box3()
      .setFromObject(hiddenHandle)
      .getCenter(new THREE.Vector3());
    const raycaster = createPickingRaycaster();
    raycaster.set(
      aim.clone().add(new THREE.Vector3(0, 0, 2)),
      new THREE.Vector3(0, 0, -1),
    );

    const rawHits = raycaster.intersectObject(solids, true);
    const selected = pick(raycaster, solids, new THREE.Group());

    expect(rawHits.some((hit) => !hit.object.visible)).toBe(true);
    expect(selected).toEqual({ kind: "placement", id: "top-door" });
  });

  it("selects the same cabinet with a wall-C cutaway applied, since it stands on wall A", () => {
    const { solids, hiddenHandle } = mountedTopRowDoor();
    const aim = new THREE.Box3()
      .setFromObject(hiddenHandle)
      .getCenter(new THREE.Vector3());
    const raycaster = createPickingRaycaster();
    raycaster.set(
      aim.clone().add(new THREE.Vector3(0, 0, 2)),
      new THREE.Vector3(0, 0, -1),
    );

    applyCutaway(solids, new THREE.Group(), ["C"]);

    expect(pick(raycaster, solids, new THREE.Group())).toEqual({
      kind: "placement",
      id: "top-door",
    });
  });
});
