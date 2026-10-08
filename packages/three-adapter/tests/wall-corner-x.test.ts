// M7C wave C2, slice S1: the corner wall unit, built and not yet mounted anywhere.
//
// The unit is the base X-leg's shape one level up: 900 mm on the back wall from the corner, a blind part
// behind the side wall's corner cabinet (the wall depth: 330 at a 600 mm kitchen, 400 at 700), a closure
// and a fixed stile so no recess shows, and one leaf on the rest. Every claim below is made on a kit
// built as the product builds it, with the wall depth the map gives (`kitchen-stage.tsx`), because a
// kit built without it answers 330 at 700 and measures a unit nobody ships.
//
// The plan's parts table is written out below as literals and is the one source for every figure; no
// expected value is read from the builder it checks.
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import {
  buildDecomposedBody,
  hidePushOpenHandles,
} from "../src/decomposed-bodies.js";
import type { Kit } from "../src/kitchen-parts.js";
import { wrapInRightCornerMirror } from "../src/right-corner-wrapper.js";
import { installHeadlessDocument } from "./support/headless-canvas.js";
import {
  AXES,
  boxOf,
  centreOf,
  DOOR_THICKNESS_M,
  GAP_M,
  meshesOf,
  overlapM,
  productKitAt,
  sizeOf,
  UNIT_WIDTH_M,
} from "./support/wall-unit.js";
import {
  describeStructure,
  findMesh,
  findMeshes,
  worldBox,
} from "./support/structure.js";

const WALL_ROW_HEIGHT_M = 0.7;
const TOP_ROW_HEIGHT_M = 0.4;
/** An ordinary wall door's reveal at its far edge: half of its 6 mm width reveal (the base corner's 10 mm
 *  no longer applies here). */
const FAR_EDGE_REVEAL_M = 0.003;
const LEFT_CLEARANCE_M = 0.03;
const EPSILON_M = 1e-6;

interface PartsTableRow {
  readonly cabinetDepthMm: number;
  readonly wallDepthM: number;
  readonly blindPartM: number;
  readonly doorPartM: number;
  readonly shellDepthM: number;
  readonly closureCentre: readonly [x: number, z: number];
  readonly stile: {
    readonly width: number;
    readonly x: number;
    readonly z: number;
  };
  readonly leaf: {
    readonly width: number;
    readonly x: number;
    readonly z: number;
  };
}

/** The plan's parts table, group-local metres in `wallCabinet`'s frame. */
const PARTS_TABLE: readonly PartsTableRow[] = [
  {
    cabinetDepthMm: 600,
    wallDepthM: 0.33,
    blindPartM: 0.33,
    doorPartM: 0.57,
    shellDepthM: 0.291,
    closureCentre: [-0.3045, 0.165],
    stile: { width: 0.065, x: -0.1265, z: 0.1545 },
    leaf: { width: 0.537, x: 0.1785, z: 0.1545 },
  },
  {
    cabinetDepthMm: 700,
    wallDepthM: 0.4,
    blindPartM: 0.4,
    doorPartM: 0.5,
    shellDepthM: 0.361,
    closureCentre: [-0.2695, 0.2],
    stile: { width: 0.065, x: -0.0565, z: 0.1895 },
    leaf: { width: 0.467, x: 0.2135, z: 0.1895 },
  },
];

beforeAll(() => {
  installHeadlessDocument();
});

function expectSize(
  box: THREE.Box3,
  expected: readonly [width: number, height: number, depth: number],
): void {
  const size = sizeOf(box);
  expect(size.x).toBeCloseTo(expected[0], 6);
  expect(size.y).toBeCloseTo(expected[1], 6);
  expect(size.z).toBeCloseTo(expected[2], 6);
}

describe.each(PARTS_TABLE)(
  "the corner wall unit's parts at a $cabinetDepthMm mm kitchen, against the plan's table",
  ({
    cabinetDepthMm,
    wallDepthM,
    blindPartM,
    doorPartM,
    shellDepthM,
    closureCentre,
    stile,
    leaf,
  }) => {
    const kit = productKitAt(cabinetDepthMm);

    it("is built on the wall depth the product's map gives", () => {
      expect(kit.depths.wallDepthM).toBeCloseTo(wallDepthM, 9);
    });

    it.each([WALL_ROW_HEIGHT_M, TOP_ROW_HEIGHT_M])(
      "builds every part to the table at height %f",
      (height) => {
        const unit = kit.make.wallCornerX(UNIT_WIDTH_M, height);
        const carcass = boxOf(unit, "carcass_shell");
        const closure = boxOf(unit, "corner_closure");
        const stileBox = boxOf(unit, "corner_stile");
        const leafBox = boxOf(unit, "door_front");

        expectSize(carcass, [UNIT_WIDTH_M, height, shellDepthM]);
        expect(centreOf(carcass).x).toBeCloseTo(0, 6);
        expect(centreOf(carcass).z).toBeCloseTo(0, 6);

        expectSize(closure, [shellDepthM, height, wallDepthM - shellDepthM]);
        expect(centreOf(closure).x).toBeCloseTo(closureCentre[0], 6);
        expect(centreOf(closure).z).toBeCloseTo(closureCentre[1], 6);

        expectSize(stileBox, [stile.width, height - 0.006, DOOR_THICKNESS_M]);
        expect(centreOf(stileBox).x).toBeCloseTo(stile.x, 6);
        expect(centreOf(stileBox).z).toBeCloseTo(stile.z, 6);

        expectSize(leafBox, [leaf.width, height - 0.006, DOOR_THICKNESS_M]);
        expect(centreOf(leafBox).x).toBeCloseTo(leaf.x, 6);
        expect(centreOf(leafBox).z).toBeCloseTo(leaf.z, 6);
      },
    );

    it("splits 900 into the blind part and the door part, the wider carrying the door", () => {
      const unit = kit.make.wallCornerX(UNIT_WIDTH_M);
      const leafBox = boxOf(unit, "door_front");
      // Measured off the built leaf: the blind part is what stands before it less its clearance, and the
      // door part is the rest of the 900; the table's figures are the expectation.
      const builtBlindM = leafBox.min.x - -UNIT_WIDTH_M / 2 - LEFT_CLEARANCE_M;
      const builtDoorPartM = UNIT_WIDTH_M - builtBlindM;

      expect(builtBlindM).toBeCloseTo(blindPartM, 6);
      expect(builtDoorPartM).toBeCloseTo(doorPartM, 6);
      expect(builtDoorPartM).toBeGreaterThan(builtBlindM);
      expect(UNIT_WIDTH_M / 2 - leafBox.max.x).toBeCloseTo(
        FAR_EDGE_REVEAL_M,
        6,
      );
    });

    it("stands the closure's front on the side wall's corner cabinet's near face, one wall depth from the back wall", () => {
      const unit = kit.make.wallCornerX(UNIT_WIDTH_M);
      const carcass = boxOf(unit, "carcass_shell");
      const closure = boxOf(unit, "corner_closure");

      expect(closure.max.z - carcass.min.z).toBeCloseTo(wallDepthM, 6);
    });
  },
);

/** The unit beside a built side wall corner cabinet at a left corner, both seated as `buildKitchen` seats
 *  a wall body: back faces on their walls, the return from the unit's front plane along wall A. */
function leftCorner(kit: Kit, height: number) {
  const unit = kit.make.wallCornerX(UNIT_WIDTH_M, height);
  const sideCabinet = buildDecomposedBody(kit, "wall-corner-return-570");
  const wallDepthM = kit.depths.wallDepthM;
  const seatM = (wallDepthM - 0.039) / 2;
  unit.position.set(UNIT_WIDTH_M / 2, 0, seatM);
  sideCabinet.position.set(seatM, 0, wallDepthM + 0.285);
  sideCabinet.rotation.y = Math.PI / 2;
  const room = new THREE.Group();
  room.add(unit, sideCabinet);
  room.updateWorldMatrix(true, true);
  return { room, unit, sideCabinet, wallDepthM };
}

describe.each(PARTS_TABLE)(
  "the unit beside the side wall's corner cabinet at a $cabinetDepthMm mm kitchen",
  ({ cabinetDepthMm }) => {
    const kit = productKitAt(cabinetDepthMm);

    it.each([WALL_ROW_HEIGHT_M, TOP_ROW_HEIGHT_M])(
      "interpenetrates nothing at height %f",
      (height) => {
        const { room, unit, sideCabinet } = leftCorner(kit, height);
        const intersecting: string[] = [];

        for (const mine of meshesOf(unit)) {
          for (const theirs of meshesOf(sideCabinet)) {
            const a = worldBox(room, mine);
            const b = worldBox(room, theirs);
            if (AXES.every((axis) => overlapM(a, b, axis) > EPSILON_M)) {
              intersecting.push(`${mine.name} × ${theirs.name}`);
            }
          }
        }

        expect(intersecting).toEqual([]);
      },
    );

    it.each([WALL_ROW_HEIGHT_M, TOP_ROW_HEIGHT_M])(
      "shares no coplanar same-facing face at height %f",
      (height) => {
        const { room, unit, sideCabinet } = leftCorner(kit, height);
        const shared: string[] = [];

        for (const mine of meshesOf(unit)) {
          for (const theirs of meshesOf(sideCabinet)) {
            const a = worldBox(room, mine);
            const b = worldBox(room, theirs);
            for (const axis of AXES) {
              const others = AXES.filter((candidate) => candidate !== axis);
              if (!others.every((other) => overlapM(a, b, other) > EPSILON_M)) {
                continue;
              }
              for (const side of ["min", "max"] as const) {
                if (Math.abs(a[side][axis] - b[side][axis]) < EPSILON_M) {
                  shared.push(
                    `${mine.name} and ${theirs.name}: ${side} ${axis}`,
                  );
                }
              }
            }
          }
        }

        expect(shared).toEqual([]);
      },
    );

    it("covers the front with the stile and the leaf from past the cabinet's door to the leaf's far edge, joints of one GAP", () => {
      const { room, unit, sideCabinet } = leftCorner(kit, WALL_ROW_HEIGHT_M);
      const leafFrontZ = worldBox(room, findMesh(unit, "door_front")).max.z;
      const cabinetDoorFaceX = worldBox(
        room,
        findMesh(sideCabinet, "door_front"),
      ).max.x;
      const frontPieces = meshesOf(unit)
        .filter((mesh) => ["corner_stile", "door_front"].includes(mesh.name))
        .map((mesh) => worldBox(room, mesh))
        .sort((one, other) => one.min.x - other.min.x);

      for (const piece of frontPieces) {
        expect(piece.max.z).toBeCloseTo(leafFrontZ, 6);
      }
      expect(frontPieces[0]?.min.x).toBeLessThanOrEqual(cabinetDoorFaceX);
      for (let at = 1; at < frontPieces.length; at += 1) {
        const joint =
          (frontPieces[at]?.min.x ?? Number.NaN) -
          (frontPieces[at - 1]?.max.x ?? Number.NaN);
        expect(joint).toBeLessThanOrEqual(GAP_M + EPSILON_M);
      }
      const farEdge = frontPieces[frontPieces.length - 1]?.max.x ?? Number.NaN;
      expect(UNIT_WIDTH_M - farEdge).toBeCloseTo(FAR_EDGE_REVEAL_M, 6);
    });

    it("leaves the closure and the stile joined with no gap, so the closure's edge is the stile's", () => {
      const { room, unit } = leftCorner(kit, WALL_ROW_HEIGHT_M);
      const closure = worldBox(room, findMesh(unit, "corner_closure"));
      const stile = worldBox(room, findMesh(unit, "corner_stile"));

      expect(stile.min.x).toBeCloseTo(closure.max.x, 6);
    });
  },
);

const SWING_STEP_DEGREES = 0.5;
const SWING_LIMIT_DEGREES = 110;
const PERIMETER_STEP_M = 0.001;

type Turn = (dAlong: number, dDepth: number, angle: number) => [number, number];

/** The plan outline of a leaf with its bar, the rectangle that turns, as perimeter points every mm. */
function perimeterOf(box: THREE.Box3): [number, number][] {
  const points: [number, number][] = [];
  for (let x = box.min.x; x <= box.max.x; x += PERIMETER_STEP_M)
    points.push([x, box.min.z], [x, box.max.z]);
  for (let z = box.min.z; z <= box.max.z; z += PERIMETER_STEP_M)
    points.push([box.min.x, z], [box.max.x, z]);
  return points;
}

/** Every point the leaf and its bar occupy, in plan, as the door turns from closed to
 *  `SWING_LIMIT_DEGREES` about `hinge`, by half degrees. */
function sweptBy(
  doorWithBar: THREE.Box3,
  hinge: readonly [number, number],
  turn: Turn,
): [number, number][] {
  const swept: [number, number][] = [];
  for (
    let degrees = 0;
    degrees <= SWING_LIMIT_DEGREES;
    degrees += SWING_STEP_DEGREES
  ) {
    const angle = (degrees * Math.PI) / 180;
    for (const [x, z] of perimeterOf(doorWithBar)) {
      const [turnedX, turnedZ] = turn(x - hinge[0], z - hinge[1], angle);
      swept.push([hinge[0] + turnedX, hinge[1] + turnedZ]);
    }
  }
  return swept;
}

/** The unit's leaf hangs on its far edge and opens toward the blind part: its free edge, at the corner
 *  side, leaves the wall and swings out into the room. */
const turnTowardTheBlindPart: Turn = (dx, dz, angle) => [
  dx * Math.cos(angle) + dz * Math.sin(angle),
  -dx * Math.sin(angle) + dz * Math.cos(angle),
];

/** The side cabinet's leaf hangs on its far end and opens away from the corner. */
const turnAwayFromTheCorner: Turn = (dx, dz, angle) => [
  dx * Math.cos(angle) - dz * Math.sin(angle),
  dz * Math.cos(angle) + dx * Math.sin(angle),
];

function doorWithBar(root: THREE.Object3D, leaf: THREE.Mesh): THREE.Box3 {
  const door = leaf.parent;
  if (!door) throw new Error("the leaf has no door group");
  root.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(door);
}

describe.each(PARTS_TABLE)(
  "the swing envelopes at a $cabinetDepthMm mm kitchen",
  ({ cabinetDepthMm }) => {
    const kit = productKitAt(cabinetDepthMm);

    it("keeps the unit's leaf and bar clear of the side wall's corner cabinet from closed to 110 degrees", () => {
      const { room, unit, sideCabinet } = leftCorner(kit, WALL_ROW_HEIGHT_M);
      const cabinet = new THREE.Box3().setFromObject(sideCabinet);
      const leaf = findMesh(unit, "door_front");
      const closed = doorWithBar(room, leaf);
      const leafBox = worldBox(room, leaf);
      const swept = sweptBy(
        closed,
        [leafBox.max.x, leafBox.min.z],
        turnTowardTheBlindPart,
      );

      const hits = swept.filter(
        ([x, z]) =>
          x < cabinet.max.x - EPSILON_M && z > cabinet.min.z + EPSILON_M,
      );

      expect(hits).toEqual([]);
    });

    it("keeps the side wall cabinet's leaf and bar off the unit from closed to 110 degrees", () => {
      const { room, unit, sideCabinet } = leftCorner(kit, WALL_ROW_HEIGHT_M);
      const unitBox = new THREE.Box3().setFromObject(unit);
      const leaf = findMesh(sideCabinet, "door_front");
      const closed = doorWithBar(room, leaf);
      const leafBox = worldBox(room, leaf);
      const swept = sweptBy(
        closed,
        [leafBox.min.x, leafBox.max.z],
        turnAwayFromTheCorner,
      );

      const hits = swept.filter(([, z]) => z < unitBox.max.z - EPSILON_M);

      expect(hits).toEqual([]);
    });

    it("sees a leaf that would reach the unit: the sweep is not vacuous", () => {
      // The unit's own leaf turned the wrong way (toward the wall it hangs on) enters the carcass.
      const { room, unit } = leftCorner(kit, WALL_ROW_HEIGHT_M);
      const leaf = findMesh(unit, "door_front");
      const leafBox = worldBox(room, leaf);
      const swept = sweptBy(
        doorWithBar(room, leaf),
        [leafBox.max.x, leafBox.min.z],
        (dx, dz, angle) => [
          dx * Math.cos(angle) - dz * Math.sin(angle),
          dz * Math.cos(angle) + dx * Math.sin(angle),
        ],
      );
      const unitBox = new THREE.Box3().setFromObject(unit);

      expect(swept.some(([, z]) => z < unitBox.max.z - 0.05)).toBe(true);
    });
  },
);

describe("the handle", () => {
  const kit = productKitAt(600);

  it("is on the corner side of the wall-row unit's leaf, the hinge being on the far edge", () => {
    const unit = kit.make.wallCornerX(UNIT_WIDTH_M, WALL_ROW_HEIGHT_M);
    const leaf = boxOf(unit, "door_front");
    const bar = boxOf(unit, "handle_bar");

    expect(findMeshes(unit, "handle_bar")).toHaveLength(1);
    expect(centreOf(bar).x).toBeLessThan(centreOf(leaf).x);
    expect(sizeOf(bar).y).toBeGreaterThan(sizeOf(bar).x);
    expect(UNIT_WIDTH_M / 2 - leaf.max.x).toBeCloseTo(FAR_EDGE_REVEAL_M, 6);
  });

  it("is a horizontal bar on the bottom edge of the top unit, as on any short door", () => {
    const unit = kit.make.wallCornerX(UNIT_WIDTH_M, TOP_ROW_HEIGHT_M);
    const bar = boxOf(unit, "handle_bar");

    expect(sizeOf(bar).x).toBeGreaterThan(sizeOf(bar).y);
    expect(centreOf(bar).y).toBeLessThan(TOP_ROW_HEIGHT_M / 2);
  });

  it("is left out of a push-to-open unit", () => {
    const unit = kit.make.wallCornerX(UNIT_WIDTH_M, TOP_ROW_HEIGHT_M, true);

    expect(findMeshes(unit, "handle_bar")).toEqual([]);
  });

  it("is built and hidden on the top unit, as §13.1 asks of every overhead door", () => {
    const unit = hidePushOpenHandles(
      kit.make.wallCornerX(UNIT_WIDTH_M, TOP_ROW_HEIGHT_M),
    );
    const bars = findMeshes(unit, "handle_bar");

    expect(bars.length).toBeGreaterThan(0);
    expect(
      bars.every((bar) => !bar.visible || bar.parent?.visible === false),
    ).toBe(true);
  });
});

describe("the materials", () => {
  const kit = productKitAt(600);

  it("puts the stile on the door material and the closure on the carcass material", () => {
    const unit = kit.make.wallCornerX(UNIT_WIDTH_M);
    const door = findMesh(unit, "door_front").material;
    const shell = findMesh(unit, "carcass_shell").material;

    expect(findMesh(unit, "corner_stile").material).toBe(door);
    expect(findMesh(unit, "corner_closure").material).toBe(shell);
    expect(door).not.toBe(shell);
  });
});

describe("the right corner of a U", () => {
  // The right corner's unit is the scene's mirror of this one (ADR 0132 decision 2): the record's
  // `corner` decides it and `scene-sync.ts` wraps the body, so S2 has no geometry to add. What S1 can
  // hold is that the unit survives the wrapper as an exact reflection.
  it.each(PARTS_TABLE)(
    "reflects every part exactly in x at a $cabinetDepthMm mm kitchen",
    ({ cabinetDepthMm }) => {
      const kit = productKitAt(cabinetDepthMm);
      const left = kit.make.wallCornerX(UNIT_WIDTH_M);
      const wrapper = wrapInRightCornerMirror(
        kit.make.wallCornerX(UNIT_WIDTH_M),
      );
      wrapper.updateWorldMatrix(true, true);

      for (const name of [
        "carcass_shell",
        "corner_closure",
        "corner_stile",
        "door_front",
        "handle_bar",
      ]) {
        const original = boxOf(left, name);
        const mirrored = boxOf(wrapper, name);

        expect(mirrored.min.x, name).toBeCloseTo(-original.max.x, 6);
        expect(mirrored.max.x, name).toBeCloseTo(-original.min.x, 6);
        expect(mirrored.min.z, name).toBeCloseTo(original.min.z, 6);
        expect(mirrored.max.z, name).toBeCloseTo(original.max.z, 6);
      }
      expect(wrapper.matrixWorld.determinant()).toBeLessThan(0);
    },
  );
});

describe("the kit's other builders", () => {
  it("do not leak state from the unit's builder: a wall cabinet from a kit that built the unit is the one from a kit that did not", () => {
    const withUnit = productKitAt(600);
    withUnit.make.wallCornerX(UNIT_WIDTH_M);
    const without = productKitAt(600);

    expect(describeStructure(withUnit.make.wallCabinet(0.57, 1))).toStrictEqual(
      describeStructure(without.make.wallCabinet(0.57, 1)),
    );
  });
});
