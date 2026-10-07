import { createHash } from "node:crypto";

import {
  cornerAssemblyWidthsMm,
  deriveDoorCount,
  INSERTABLE_BODY_DEFINITIONS,
  KITCHEN_L_DESIGN,
} from "@lemnaria/configurator-domain";
import { fc, test as propertyTest } from "@fast-check/vitest";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { buildDecomposedBody } from "../src/decomposed-bodies.js";
import { buildAnyBody } from "../src/build-any-body.js";
import { makeKit } from "../src/kitchen-parts.js";
import { createHeadlessCanvas } from "./support/headless-canvas.js";
import { required } from "./support/required.js";
import {
  chamferInset,
  describeStructure,
  findMesh,
  findMeshes,
  worldBox,
} from "./support/structure.js";

const REFERENCE_X_WIDTH_MM = 900;
// 320 → 330 (ADR 0135): the reference reach less the run's carcass front, 900 − 570.
const REFERENCE_RETURN_WIDTH_MM = 330;
const DECLARED_DEPTHS_MM = [600, 700] as const;
const DOOR_ALLOWANCE_MM = 40;
const RIGHT_INSET_MM = 10;
const RETURN_WORKTOP_INSET_MM = 50;
const UPPER_RETURN_REFERENCE_WIDTH_MM = 570;
const UPPER_CORNER_BANDS = [
  { buildId: "wall-corner-return-570", heightM: 0.7 },
  { buildId: "wall-corner-return-570-top", heightM: 0.4 },
] as const;

const oneDoorFloorMm = (() => {
  const base = INSERTABLE_BODY_DEFINITIONS.find(
    ([id]) => id === "base-cabinet",
  )?.[1];
  const wall = INSERTABLE_BODY_DEFINITIONS.find(
    ([id]) => id === "wall-cabinet",
  )?.[1];
  if (!base?.minWidthMm || base.minWidthMm !== wall?.minWidthMm) {
    throw new Error("hinged base and wall rows need the same one-door floor");
  }
  return base.minWidthMm;
})();

function kitAt(cabinetDepthMm: number) {
  return makeKit({ createCanvas: createHeadlessCanvas, cabinetDepthMm });
}

function axisWidth(box: THREE.Box3, axis: "x" | "y" | "z") {
  return box.max[axis] - box.min[axis];
}

/** How far the X-leg's carcass stands behind the wall plane: ADR 0025 decision 3's pin, 20 mm. */
const X_LEG_BEHIND_WALL_M = 0.02;

/** Where the X-leg's group stands off its wall: its carcass runs from `X_LEG_BEHIND_WALL_M` behind
 *  the wall to the joint, which is the return's own depth, so the seat is half the difference. */
function xLegSeatM(jointM: number): number {
  return (jointM - X_LEG_BEHIND_WALL_M) / 2;
}

function placedCorner(
  cabinetDepthMm: number,
  xWidthMm: number,
  returnWidthMm: number,
) {
  const kit = kitAt(cabinetDepthMm);
  const x = kit.make.cornerBaseX(xWidthMm / 1000);
  const ret = kit.make.cornerBaseReturn(
    kit.depths.cornerReturnDepthM,
    returnWidthMm / 1000,
  );
  const jointM = kit.depths.cornerReturnDepthM;
  x.position.set(xWidthMm / 2000, 0, xLegSeatM(jointM));
  ret.position.set(jointM / 2, 0, jointM + returnWidthMm / 2000);
  ret.rotation.y = Math.PI / 2;
  const room = new THREE.Group();
  room.add(x, ret);
  room.updateWorldMatrix(true, true);
  return { room, x, ret };
}

describe("the sized corner base legs", () => {
  it("keeps the reference room's derived widths at 900 (×3) / 330 / 570 / 570 mm", () => {
    const widths = cornerAssemblyWidthsMm({
      cabinetDepthMm: 600,
      room: KITCHEN_L_DESIGN.room,
    });
    // Wall A's three pieces (base, wall, top: M7C wave C2 added the last two), then wall B's.
    expect(widths.pieces.map(({ widthMm }) => widthMm)).toEqual([
      900, 900, 900, 330, 570, 570,
    ]);
  });

  it("reads the one-door floor from both hinged catalogue rows", () => {
    expect(deriveDoorCount(oneDoorFloorMm)).toBe(1);
  });

  it("keeps the 600 mm reference leaf at 290 mm and x = 295 mm", () => {
    const x = kitAt(600).make.cornerBaseX(0.9);
    const door = worldBox(x, findMesh(x, "door_front"));
    const top = worldBox(x, findMesh(x, "countertop"));
    // 280 → 290 and 300 → 295 (ADR 0135): the accessible front is 900 less the 570 joint, 330, so
    // the leaf is 330 − 40 and sits 5 mm nearer the corner.
    expect(axisWidth(door, "x")).toBeCloseTo(0.29, 6);
    expect((door.min.x + door.max.x) / 2).toBeCloseTo(0.295, 6);
    expect(axisWidth(top, "x")).toBeCloseTo(0.9, 6);
  });

  it("clears the measured 700 mm door/return carcass collision in world space", () => {
    const { room, x, ret } = placedCorner(700, 900, REFERENCE_RETURN_WIDTH_MM);
    const door = worldBox(room, findMesh(x, "door_front"));
    const returnCarcass = worldBox(room, findMesh(ret, "carcass"));

    // 0.18 → 0.19 and 0.71 → 0.70 (ADR 0135): the leaf is 900 less the 670 joint less 40, and starts
    // 30 mm past the return's carcass as before.
    expect(axisWidth(door, "x")).toBeCloseTo(0.19, 6);
    expect(door.min.x).toBeCloseTo(0.7, 6);
    // 0.68 → 0.67 (ADR 0135): the return is built to the run's carcass front, 670 at 700.
    expect(returnCarcass.max.x).toBeCloseTo(0.67, 6);
    expect(door.min.x - returnCarcass.max.x).toBeGreaterThan(0.029);
    expect(door.min.z).toBeLessThan(returnCarcass.max.z);
    expect(door.max.z).toBeGreaterThan(returnCarcass.min.z);
  });

  it.each(DECLARED_DEPTHS_MM)(
    "keeps a variable return slab seated at the butt seam at %i mm depth",
    (depthMm) => {
      const { room, x, ret } = placedCorner(depthMm, REFERENCE_X_WIDTH_MM, 250);
      const xTop = worldBox(room, findMesh(x, "countertop"));
      const returnTop = worldBox(room, findMesh(ret, "countertop"));
      const returnCarcass = worldBox(room, findMesh(ret, "carcass"));
      expect(axisWidth(returnCarcass, "z")).toBeCloseTo(0.25, 6);
      expect(axisWidth(returnTop, "z")).toBeCloseTo(0.2, 6);
      expect(returnTop.min.z).toBeCloseTo(xTop.max.z, 6);
      expect(returnTop.max.z).toBeCloseTo(returnCarcass.max.z, 6);
    },
  );

  propertyTest.prop([
    fc.oneof(
      fc.tuple(
        fc.constant(600),
        fc.integer({
          min: 600 - 30 + oneDoorFloorMm,
          max: REFERENCE_X_WIDTH_MM,
        }),
      ),
      fc.tuple(
        fc.constant(700),
        fc.integer({
          min: 700 - 30 + oneDoorFloorMm,
          max: REFERENCE_X_WIDTH_MM,
        }),
      ),
    ),
    fc.integer({ min: oneDoorFloorMm, max: REFERENCE_RETURN_WIDTH_MM }),
  ])(
    "sizes each supplied width without scaling the fittings",
    ([depthMm, xWidthMm], returnWidthMm) => {
      const kit = kitAt(depthMm);
      const x = kit.make.cornerBaseX(xWidthMm / 1000);
      const ret = kit.make.cornerBaseReturn(
        kit.depths.cornerReturnDepthM,
        returnWidthMm / 1000,
      );
      const xCarcass = worldBox(x, findMesh(x, "carcass"));
      const xPlinth = worldBox(x, findMesh(x, "plinth"));
      const xTop = worldBox(x, findMesh(x, "countertop"));
      const leaf = worldBox(x, findMesh(x, "door_front"));
      const tray = worldBox(
        x,
        required(findMeshes(x, "susan_tray")[0], "susan tray"),
      );
      const handle = worldBox(x, findMesh(x, "handle_bar"));
      const returnCarcass = worldBox(ret, findMesh(ret, "carcass"));
      const returnPlinth = worldBox(ret, findMesh(ret, "plinth"));
      const returnTop = worldBox(ret, findMesh(ret, "countertop"));

      expect(axisWidth(xCarcass, "x")).toBeCloseTo(xWidthMm / 1000, 6);
      expect(axisWidth(xPlinth, "x")).toBeCloseTo((xWidthMm - 4) / 1000, 6);
      expect(axisWidth(xTop, "x")).toBeCloseTo(xWidthMm / 1000, 6);
      expect(axisWidth(leaf, "x")).toBeCloseTo(
        (xWidthMm - (depthMm - 30) - DOOR_ALLOWANCE_MM) / 1000,
        6,
      );
      expect(xCarcass.max.x - leaf.max.x).toBeCloseTo(RIGHT_INSET_MM / 1000, 6);
      expect(tray.min.x).toBeGreaterThan(xCarcass.min.x);
      expect(tray.max.x).toBeLessThan(xCarcass.max.x);
      expect(axisWidth(tray, "x")).toBeCloseTo(0.4, 6);
      expect(axisWidth(handle, "y")).toBeCloseTo(0.21, 6);
      expect(chamferInset(findMesh(x, "carcass"), xWidthMm / 1000)).toBeCloseTo(
        0.0016,
        6,
      );
      expect(findMeshes(x, "door_front")).toHaveLength(1);
      expect(findMeshes(ret, "door_front")).toHaveLength(0);
      expect(axisWidth(returnCarcass, "x")).toBeCloseTo(
        returnWidthMm / 1000,
        6,
      );
      expect(axisWidth(returnPlinth, "x")).toBeCloseTo(
        (returnWidthMm - 4) / 1000,
        6,
      );
      expect(axisWidth(returnTop, "x")).toBeCloseTo(
        (returnWidthMm - RETURN_WORKTOP_INSET_MM) / 1000,
        6,
      );
      expect(returnTop.min.x).toBeCloseTo(returnCarcass.min.x, 6);

      x.position.set(
        xWidthMm / 2000,
        0,
        xLegSeatM(kit.depths.cornerReturnDepthM),
      );
      ret.position.set(
        kit.depths.cornerReturnDepthM / 2,
        0,
        kit.depths.cornerReturnDepthM + returnWidthMm / 2000,
      );
      ret.rotation.y = Math.PI / 2;
      const room = new THREE.Group();
      room.add(x, ret);
      const placedDoor = worldBox(room, findMesh(x, "door_front"));
      const placedReturn = worldBox(room, findMesh(ret, "carcass"));
      const placedXTop = worldBox(room, findMesh(x, "countertop"));
      const placedReturnTop = worldBox(room, findMesh(ret, "countertop"));
      expect(placedDoor.min.x - placedReturn.max.x).toBeGreaterThan(0.029);
      expect(placedReturnTop.min.z).toBeCloseTo(placedXTop.max.z, 6);
    },
  );
});

describe("the sized wall and top corner returns", () => {
  function expectUpperReturnWidth(
    cabinetDepthMm: number,
    buildId: (typeof UPPER_CORNER_BANDS)[number]["buildId"],
    heightM: number,
    widthMm: number,
  ): void {
    const built = buildAnyBody(kitAt(cabinetDepthMm), buildId, {
      widthM: widthMm / 1000,
      heightM: 1.23,
      depthM: 0.19,
    });
    const shell = worldBox(built, findMesh(built, "carcass_shell"));
    const front = worldBox(built, findMesh(built, "door_front"));
    expect(axisWidth(shell, "x")).toBeCloseTo(widthMm / 1000, 6);
    expect(axisWidth(shell, "y")).toBeCloseTo(heightM, 6);
    expect(findMeshes(built, "door_front")).toHaveLength(1);
    expect(axisWidth(front, "x")).toBeCloseTo((widthMm - 6) / 1000, 6);
    expect(axisWidth(front, "y")).toBeCloseTo(heightM - 0.006, 6);
    expect(front.min.x).toBeGreaterThanOrEqual(shell.min.x);
    expect(front.max.x).toBeLessThanOrEqual(shell.max.x);
  }

  it.each(DECLARED_DEPTHS_MM)(
    "keeps the one-door floor and reference endpoints at %i mm depth in both upper bands",
    (depthMm) => {
      for (const { buildId, heightM } of UPPER_CORNER_BANDS) {
        for (const widthMm of [
          oneDoorFloorMm,
          UPPER_RETURN_REFERENCE_WIDTH_MM,
        ]) {
          expectUpperReturnWidth(depthMm, buildId, heightM, widthMm);
        }
      }
    },
  );

  propertyTest.prop([
    fc.constantFrom(...DECLARED_DEPTHS_MM),
    fc.constantFrom(...UPPER_CORNER_BANDS),
    fc.integer({ min: oneDoorFloorMm, max: UPPER_RETURN_REFERENCE_WIDTH_MM }),
  ])(
    "draws every supplied domain-admitted upper width at its 700 or 400 mm band height",
    (depthMm, band, widthMm) => {
      expectUpperReturnWidth(depthMm, band.buildId, band.heightM, widthMm);
    },
  );
});

describe("the pre-edit 600 mm corner census at c6ea1bb", () => {
  // Literal digests of `structure` in /private/tmp/lemnaria-7d7-s0-c6ea1bb/
  // corner-census-600mm.json, taken before S1. Do not regenerate them from this implementation.
  //
  // `base-corner-x-900` and `base-corner-return-320` left this table with ADR 0135 (M7C wave C4): they
  // are the two corner bodies that deliberately moved, the return in slice S1 and the X-leg in S2.
  // Their departures from the vendored reference are declared with exact deltas in
  // `kitchen-parts.parity.test.ts`, and their new figures are asserted in
  // `base-corner-return-lines.test.ts` and `base-corner-x-lines.test.ts`; a regenerated digest would
  // only record what the code does.
  const expectedSha256: Readonly<Record<string, string>> = {
    "wall-corner-return-570":
      "106b954c9cf9c16d6e372cacb4b7431e9764952d4c932aeb7e471f229e760f2c",
    "wall-corner-return-570-top":
      "a818bbb4ff6d8b8612098ca89f219a39b9305b7b94391c8ebb0dda7e0228d830",
  };

  it.each(Object.entries(expectedSha256))(
    "keeps %s byte-identical",
    (buildId, expected) => {
      const kit = kitAt(600);
      const structure = describeStructure(buildDecomposedBody(kit, buildId));
      const digest = createHash("sha256")
        .update(JSON.stringify(structure))
        .digest("hex");
      expect(digest).toBe(expected);
    },
  );
});
