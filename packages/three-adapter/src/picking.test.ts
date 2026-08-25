// Work item 6's picking half (`DEVELOPMENT-SPEC.md` §6.1, milestone rows 2 and 22). The threshold
// test is pinned deliberately: the milestone's named risk is this exact override re-entering
// through a later `drei` helper or a changed raycaster config, and the recorded symptom did not
// look like a picking bug ("the levels are wrong").
import {
  deriveColumns,
  recomputeVoids,
  type PlacementRecord,
  type VoidRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { required } from "./testing/required.js";
import { buildVoidMesh } from "./void-mesh.js";
import {
  climbToSelectable,
  createPickingRaycaster,
  DRAG_THRESHOLD_PX,
  isDragGesture,
  LINE_RAYCAST_THRESHOLD_M,
  pick,
  resolveHostPlacementId,
  resolveSelection,
} from "./picking.js";

function makeRecord(overrides: Partial<PlacementRecord> = {}): PlacementRecord {
  return {
    id: "p0",
    buildId: "base-drawer2-600",
    kind: "base_cabinet",
    frame: { x: 2.6, z: 0.3, ry: 0, y0: 0, w: 0.6, h: 0.86, d: 0.56 },
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
    accessory: false,
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

  it("never leaves three.js's 1 m default in place", () => {
    const bareDefault = new THREE.Raycaster().params.Line.threshold;
    const pinned = createPickingRaycaster().params.Line.threshold;
    expect(pinned).not.toBe(bareDefault);
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

describe("resolveHostPlacementId / resolveSelection", () => {
  const host = makeRecord({
    id: "base-1",
    col: "A|2.60",
    accessory: false,
    frame: { x: 2.6, z: 0.3, ry: 0, y0: 0, w: 0.6, h: 0.86, d: 0.56 },
  });
  const accessory = makeRecord({
    id: "cooktop-1",
    col: "A|2.60",
    accessory: true,
    frame: { x: 2.6, z: 0.36, ry: 0, y0: 0.86, w: 0.6, h: 0.04, d: 0.72 },
  });
  const records = [host, accessory];

  it("resolves an accessory to the tallest non-accessory member of its column seated below it", () => {
    expect(resolveHostPlacementId(accessory, records)).toBe("base-1");
  });

  it("throws when a column has no host cabinet under the accessory", () => {
    expect(() => resolveHostPlacementId(accessory, [accessory])).toThrow(
      /No host cabinet found/,
    );
  });

  it("resolveSelection rewrites an accessory placement id to its host, never itself", () => {
    expect(
      resolveSelection({ kind: "placement", id: "cooktop-1" }, records),
    ).toEqual({
      kind: "placement",
      id: "base-1",
    });
  });

  it("resolveSelection leaves a non-accessory placement selection untouched", () => {
    expect(
      resolveSelection({ kind: "placement", id: "base-1" }, records),
    ).toEqual({
      kind: "placement",
      id: "base-1",
    });
  });

  it("resolveSelection leaves a void selection untouched", () => {
    const voidSelection = { kind: "void" as const, id: "A|2.60:v0:0.00" };
    expect(resolveSelection(voidSelection, records)).toEqual(voidSelection);
  });
});

describe("pick", () => {
  it("row 22: a solid cabinet is selected even when a void lies along the same ray", () => {
    const solids = new THREE.Group();
    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.86, 0.56));
    cabinet.position.set(0, 0.43, 0);
    cabinet.userData["placementId"] = "base-1";
    solids.add(cabinet);
    solids.updateMatrixWorld(true);

    const voids = new THREE.Group();
    const { group } = buildVoidMesh({
      id: "A|0.00:v0:0.86",
      col: "A|0.00",
      wall: "A",
      x: 0,
      z: 0,
      ry: 0,
      w: 0.6,
      d: 0.56,
      y0: -1,
      h: 0.5,
      spanY0: -1,
      spanH: 0.5,
    });
    voids.add(group);
    voids.updateMatrixWorld(true);

    const raycaster = createPickingRaycaster();
    raycastDown(raycaster, 0, 1, 0);

    expect(
      pick(raycaster, solids, voids, [
        makeRecord({ id: "base-1", accessory: false }),
      ]),
    ).toEqual({ kind: "placement", id: "base-1" });
  });

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
    const voids = new THREE.Group();

    const raycaster = createPickingRaycaster();
    raycastDown(raycaster, 2, 1, 0);

    const records = [
      makeRecord({ id: "base-a", accessory: false }),
      makeRecord({ id: "base-b", accessory: false }),
    ];
    expect(pick(raycaster, solids, voids, records)).toEqual({
      kind: "placement",
      id: "base-b",
    });
  });

  it("returns null when nothing solid or void is under the pointer", () => {
    const raycaster = createPickingRaycaster();
    raycastDown(raycaster, 50, 1, 50);
    expect(
      pick(raycaster, new THREE.Group(), new THREE.Group(), []),
    ).toBeNull();
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
        accessory: false,
        frame: { x: 1.3, z: 0.3, ry: 0, y0: 0, w: 0.6, h: 0.86, d: 0.56 },
      }),
      makeRecord({
        id: "sentinel-top",
        col: columnKey,
        accessory: false,
        frame: { x: 1.3, z: 0.3, ry: 0, y0: 2.2, w: 0.6, h: 0.4, d: 0.56 },
      }),
    ];
    const column = required(deriveColumns(sentinels).get(columnKey), "column");
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

    expect(pick(raycaster, new THREE.Group(), voids, [])).toEqual({
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

    expect(pick(raycaster, solids, voids, [])).toEqual({
      kind: "void",
      id: "A|0.00:v0:0.00",
    });
  });
});
