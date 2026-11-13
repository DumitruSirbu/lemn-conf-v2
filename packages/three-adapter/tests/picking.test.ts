// Work item 6's picking half (`DEVELOPMENT-SPEC.md` §6.1, milestone rows 2 and 22). The threshold
// test is pinned deliberately: the milestone's named risk is this exact override re-entering
// through a later `drei` helper or a changed raycaster config, and the recorded symptom did not
// look like a picking bug ("the levels are wrong").
import {
  deriveColumns,
  NO_FRONT_ASSEMBLY_MM,
  pinnedAtFinishedDepthMm,
  recomputeVoids,
  shellPlusFrontMm,
  type PlacementRecord,
  type VoidRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { required } from "./support/required.js";
import { buildVoidMesh } from "../src/void-mesh.js";
import {
  climbToSelectable,
  createPickingRaycaster,
  DRAG_THRESHOLD_PX,
  isDragGesture,
  LINE_RAYCAST_THRESHOLD_M,
  pick,
} from "../src/picking.js";

function makeRecord(overrides: Partial<PlacementRecord> = {}): PlacementRecord {
  return {
    id: "p0",
    buildId: "base-drawer2-600",
    kind: "base_cabinet",
    frame: { x: 2.6, z: 0.3, ry: 0, y0: 0, w: 0.6, h: 0.86, d: 0.56 },
    // A sentinel, not a body: this file is about which object a ray hits, so the record's occupied
    // depth is declared equal to the frame it states rather than to the real cabinet's worktop.
    occupiedDepth: shellPlusFrontMm(NO_FRONT_ASSEMBLY_MM),
    // Two sentinels of equal depth in one column tie §3.2's MAX, and the tie-break reads this
    // (ADR 0079 decision 6 key 2) — an entry that declares nothing throws there, deliberately.
    // `pinned` because the sentinel's depth above is a fixed number and not a function of any
    // setting; saying it follows one would be a declaration this fixture cannot honour.
    depthRule: pinnedAtFinishedDepthMm(560, "base-formula"),
    col: "A|2.60",
    wall: "A",
    rotated: false,
    band: "base",
    widthMm: 600,
    heightMm: 820,
    canFinish: true,
    canHandle: true,
    canReplace: true,
    canDelete: true,
    fixedWidth: false,
    kitchenSettings: {},
    ...overrides,
  };
}

function raycastDown(
  raycaster: THREE.Raycaster,
  x: number,
  y: number,
  z: number,
): void {
  raycaster.set(new THREE.Vector3(x, y, z), new THREE.Vector3(0, -1, 0));
}

describe("createPickingRaycaster", () => {
  it("pins Line.threshold to 0.008 at construction", () => {
    const raycaster = createPickingRaycaster();
    expect(raycaster.params.Line.threshold).toBe(LINE_RAYCAST_THRESHOLD_M);
    expect(LINE_RAYCAST_THRESHOLD_M).toBe(0.008);
  });
});

describe("isDragGesture", () => {
  it("treats movement at or under the 7 px threshold as a click", () => {
    expect(isDragGesture({ x: 0, y: 0 }, { x: DRAG_THRESHOLD_PX, y: 0 })).toBe(
      false,
    );
    expect(isDragGesture({ x: 10, y: 10 }, { x: 12, y: 13 })).toBe(false);
  });

  it("treats movement beyond 7 px as an orbit", () => {
    expect(
      isDragGesture({ x: 0, y: 0 }, { x: DRAG_THRESHOLD_PX + 0.01, y: 0 }),
    ).toBe(true);
    expect(isDragGesture({ x: 0, y: 0 }, { x: 5, y: 5 })).toBe(true);
  });
});

describe("climbToSelectable", () => {
  it("climbs from a deeply nested child to the mount root's placementId", () => {
    const root = new THREE.Group();
    root.userData["placementId"] = "p7";
    const door = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
    door.add(handle);
    root.add(door);

    expect(climbToSelectable(handle)).toEqual({ kind: "placement", id: "p7" });
  });

  it("climbs to a void root's voidId", () => {
    const root = new THREE.Group();
    root.userData["voidId"] = "A|1.30:v0:0.00";
    const child = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
    root.add(child);

    expect(climbToSelectable(child)).toEqual({
      kind: "void",
      id: "A|1.30:v0:0.00",
    });
  });

  it("returns null when no ancestor carries a selectable id", () => {
    const orphan = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
    expect(climbToSelectable(orphan)).toBeNull();
  });
});

describe("pick", () => {
  it("a void never swallows a click aimed at a different cabinet standing elsewhere", () => {
    const solids = new THREE.Group();
    const cabinetA = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.86, 0.56));
    cabinetA.position.set(0, 0.43, 0);
    cabinetA.userData["placementId"] = "base-a";
    const cabinetB = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.86, 0.56));
    cabinetB.position.set(2, 0.43, 0);
    cabinetB.userData["placementId"] = "base-b";
    solids.add(cabinetA, cabinetB);
    solids.updateMatrixWorld(true);

    // A cleared column between the two, so the ray crosses its void before it reaches cabinet B: a nearest-hit rule
    // and a voids-first rule both answer the void here.
    const voids = new THREE.Group();
    const { group } = buildVoidMesh({
      id: "A|1.40:v0:0.00",
      col: "A|1.40",
      wall: "A",
      x: 1.4,
      z: 0,
      ry: 0,
      w: 0.6,
      d: 0.56,
      y0: 0,
      h: 0.86,
      spanY0: 0,
      spanH: 0.86,
    });
    voids.add(group);
    voids.updateMatrixWorld(true);

    const raycaster = createPickingRaycaster();
    raycaster.set(new THREE.Vector3(0.5, 0.43, 0), new THREE.Vector3(1, 0, 0));

    const nearestVoidHit = required(
      raycaster.intersectObject(voids, true)[0],
      "the ray must cross the void",
    );
    const nearestSolidHit = required(
      raycaster.intersectObject(solids, true)[0],
      "the ray must reach a cabinet",
    );
    expect(nearestVoidHit.distance).toBeLessThan(nearestSolidHit.distance);
    expect(pick(raycaster, solids, voids)).toEqual({
      kind: "placement",
      id: "base-b",
    });
  });

  it("returns null when nothing solid or void is under the pointer", () => {
    const raycaster = createPickingRaycaster();
    raycastDown(raycaster, 50, 1, 50);
    expect(pick(raycaster, new THREE.Group(), new THREE.Group())).toBeNull();
  });

  it("row 2: clicking the base slot of a cleared column selects the base slot, not the middle one", () => {
    const columnKey = "A|1.30:00";
    // Two sentinel members fix the column's load-time floor (0) and top (2.6), per §3.2 — columns
    // never change after load. Neither is passed to `recomputeVoids`, reproducing a fully cleared
    // column without depending on a mutation feature this milestone doesn't implement yet.
    const sentinels = [
      makeRecord({
        id: "sentinel-base",
        col: columnKey,
        frame: { x: 1.3, z: 0.3, ry: 0, y0: 0, w: 0.6, h: 0.86, d: 0.56 },
      }),
      makeRecord({
        id: "sentinel-top",
        col: columnKey,
        frame: { x: 1.3, z: 0.3, ry: 0, y0: 2.2, w: 0.6, h: 0.4, d: 0.56 },
      }),
    ];
    // The column is occupied by the two sentinels, so the room is never consulted — wide enough to
    // say so plainly.
    const room = {
      shape: "L" as const,
      widthMm: 3600,
      depthMm: 2400,
      heightMm: 2600,
    };
    const column = required(
      deriveColumns(sentinels, {}, room).get(columnKey),
      "column",
    );
    const voidRecords: VoidRecord[] = recomputeVoids(
      [],
      new Map([[columnKey, column]]),
    );
    expect(voidRecords).toHaveLength(3);

    const voids = new THREE.Group();
    for (const voidRecord of voidRecords)
      voids.add(buildVoidMesh(voidRecord).group);
    voids.updateMatrixWorld(true);

    const baseSlot = voidRecords.find((v) => v.y0 === 0);
    if (!baseSlot) throw new Error("expected a base slot at y0 = 0");
    const middleSlot = voidRecords.find((v) => v.y0 !== 0 && v.y0 < 2);
    if (!middleSlot) throw new Error("expected a middle slot");
    expect(middleSlot.id).not.toBe(baseSlot.id);

    const raycaster = createPickingRaycaster();
    raycastDown(
      raycaster,
      column.x,
      baseSlot.y0 + baseSlot.h / 2 + 1,
      column.z,
    );

    expect(pick(raycaster, new THREE.Group(), voids)).toEqual({
      kind: "void",
      id: baseSlot.id,
    });
  });

  it("falls through to a void even when an unselectable shell mesh (floor/wall) sits behind it in `solids`", () => {
    // Reproduces the real scene shape: `solids` carries the room shell (floor/walls) alongside
    // tagged cabinet bodies, and the shell has no `placementId`/`voidId`. A ray through a void must
    // not stop at the shell mesh the void is sitting in front of.
    const solids = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.BoxGeometry(4, 0.05, 4));
    floor.position.set(0, -0.025, 0);
    solids.add(floor);
    solids.updateMatrixWorld(true);

    const voids = new THREE.Group();
    const { group } = buildVoidMesh({
      id: "A|0.00:v0:0.00",
      col: "A|0.00",
      wall: "A",
      x: 0,
      z: 0,
      ry: 0,
      w: 0.6,
      d: 0.56,
      y0: 0,
      h: 0.86,
      spanY0: 0,
      spanH: 0.86,
    });
    voids.add(group);
    voids.updateMatrixWorld(true);

    const raycaster = createPickingRaycaster();
    raycastDown(raycaster, 0, 1, 0);

    expect(pick(raycaster, solids, voids)).toEqual({
      kind: "void",
      id: "A|0.00:v0:0.00",
    });
  });
});
