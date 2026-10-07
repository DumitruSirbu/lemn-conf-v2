// ADR 0135 (M7C wave C4, slice S2): the back-wall corner cabinet stands on the run's lines.
//
// The joint moved to the base run's carcass front, `D − 30`. The X-leg is built `D − 10` deep and stays
// seated 20 mm behind the wall (ADR 0025 decision 3), so its front is the run's carcass front and its
// door, worktop and plinth fall on the run's lines with no figure tuned to a measured gap. As in
// `base-corner-return-lines.test.ts`, every claim is made of two measured bodies, the X-leg and a base
// cabinet, and the seam-by-seam measurement of whole rooms is the seam script's.
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { createPickingRaycaster, pick } from "../src/picking.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { findMesh, worldBox } from "./support/structure.js";
import { mountedById, mountU, namedMeshBox } from "./support/u-scene.js";

const X_WIDTH_M = 0.9;
const BASE_CABINET_WIDTH_M = 0.6;

/** ADR 0025 decision 3's pin: the X-leg's carcass back face is 20 mm behind the wall plane. */
const X_LEG_BEHIND_WALL_M = 0.02;

/** Declared cabinet depth, the X-leg's carcass depth and the run's carcass front from the wall at it,
 *  written out from the plan's own table rather than read from the builder or the domain. */
const X_LEG_BY_DEPTH_MM = [
  { cabinetDepthMm: 600, carcassDepthM: 0.59, runCarcassFrontM: 0.57 },
  { cabinetDepthMm: 700, carcassDepthM: 0.69, runCarcassFrontM: 0.67 },
] as const;

/** The leaf is the accessible front, `W` less the return's depth, less 40 mm of clearances. */
const LEAF_CLEARANCES_M = 0.04;

beforeAll(() => {
  installHeadlessDocument();
});

function kitAt(cabinetDepthMm: number): Kit {
  return makeKit({ createCanvas: createHeadlessCanvas, cabinetDepthMm });
}

function xLeg(kit: Kit): THREE.Group {
  return kit.make.cornerBaseX(X_WIDTH_M);
}

function baseRun(kit: Kit): THREE.Group {
  return kit.make.baseCabinet(BASE_CABINET_WIDTH_M, { doors: 2 });
}

/** How far a mesh's front stands from the wall plane, in metres. The run's wall plane is the back of its
 *  worktop (§11 row 19, ADR 0018); the X-leg's is its carcass back plus the pinned 20 mm. */
function frontFromRunWallM(body: THREE.Group, meshName: string): number {
  return (
    worldBox(body, findMesh(body, meshName)).max.z -
    worldBox(body, findMesh(body, "countertop")).min.z
  );
}

function frontFromXLegWallM(body: THREE.Group, meshName: string): number {
  return (
    worldBox(body, findMesh(body, meshName)).max.z -
    (worldBox(body, findMesh(body, "carcass")).min.z + X_LEG_BEHIND_WALL_M)
  );
}

describe.each(X_LEG_BY_DEPTH_MM)(
  "the X-leg at a $cabinetDepthMm mm kitchen",
  ({ cabinetDepthMm, carcassDepthM, runCarcassFrontM }) => {
    const kit = kitAt(cabinetDepthMm);
    const leg = xLeg(kit);
    const run = baseRun(kit);

    it("is built D − 10 deep, its front the run's carcass front", () => {
      const carcass = worldBox(leg, findMesh(leg, "carcass"));

      expect(carcass.max.z - carcass.min.z).toBeCloseTo(carcassDepthM, 6);
      expect(carcass.max.z - (carcass.min.z + X_LEG_BEHIND_WALL_M)).toBeCloseTo(
        runCarcassFrontM,
        6,
      );
    });

    it("ends its worktop where a base run's worktop ends", () => {
      expect(frontFromXLegWallM(leg, "countertop")).toBeCloseTo(
        frontFromRunWallM(run, "countertop"),
        6,
      );
    });

    it("ends its carcass where a base run's carcass ends", () => {
      expect(frontFromXLegWallM(leg, "carcass")).toBeCloseTo(
        frontFromRunWallM(run, "carcass_shell"),
        6,
      );
    });

    it("ends its plinth where a base run's plinth ends", () => {
      expect(frontFromXLegWallM(leg, "plinth")).toBeCloseTo(
        frontFromRunWallM(run, "plinth"),
        6,
      );
    });

    it("hangs its door on the plane of the run's doors", () => {
      expect(frontFromXLegWallM(leg, "door_front")).toBeCloseTo(
        frontFromRunWallM(run, "door_front"),
        6,
      );
    });

    it("sizes the leaf from the return's depth, which is the run's carcass front", () => {
      const leaf = worldBox(leg, findMesh(leg, "door_front"));

      expect(leaf.max.x - leaf.min.x).toBeCloseTo(
        X_WIDTH_M - (runCarcassFrontM + LEAF_CLEARANCES_M),
        6,
      );
    });
  },
);

describe("the X-leg beside the return, in the built room", () => {
  const SWEPT_U = {
    widthMm: 4500,
    depthMm: 3000,
    wallCMm: 3600,
    heightMm: 2600,
  };
  const scene = mountU(SWEPT_U);

  it.each(["p25", "right-p25"])(
    "keeps %s's back face 20 mm behind the wall, exactly as before the joint moved",
    (id) => {
      const carcass = namedMeshBox(mountedById(scene, id), "carcass");

      expect(carcass.min.z).toBeCloseTo(-X_LEG_BEHIND_WALL_M, 6);
    },
  );

  it("shares one face between the two carcasses at the joint, with no gap", () => {
    const xCarcass = namedMeshBox(mountedById(scene, "p25"), "carcass");
    const returnCarcass = namedMeshBox(mountedById(scene, "p26"), "carcass");

    expect(returnCarcass.min.z - xCarcass.max.z).toBeCloseTo(0, 6);
    expect(xCarcass.max.z).toBeCloseTo(0.57, 6);
  });

  it("butts the two worktops: the return's slab starts where the X-leg's ends", () => {
    const xTop = namedMeshBox(mountedById(scene, "p25"), "countertop");
    const returnTop = namedMeshBox(mountedById(scene, "p26"), "countertop");

    expect(returnTop.min.z - xTop.max.z).toBeCloseTo(0, 6);
  });

  it("leaves 12 mm between the return's fixed front and the leaf, which the arithmetic gives", () => {
    const front = namedMeshBox(mountedById(scene, "p26"), "fixed_front");
    const leaf = namedMeshBox(mountedById(scene, "p25"), "door_front");

    expect(leaf.min.x - front.max.x).toBeCloseTo(0.012, 6);
  });
});

describe("tapping the X-leg's door and its blind span", () => {
  const SWEPT_U = {
    widthMm: 4500,
    depthMm: 3000,
    wallCMm: 3600,
    heightMm: 2600,
  };
  const IN_FRONT_OF_THE_FACE_M = 0.05;
  const scene = mountU(SWEPT_U);

  function rayAt(point: THREE.Vector3) {
    const raycaster = createPickingRaycaster();
    raycaster.set(
      point.clone().add(new THREE.Vector3(0, 0, IN_FRONT_OF_THE_FACE_M)),
      new THREE.Vector3(0, 0, -1),
    );
    return {
      firstHit: raycaster.intersectObject(scene.stage.solidsRoot, true)[0],
      selection: pick(raycaster, scene.stage.solidsRoot, new THREE.Group()),
    };
  }

  it.each(["p25", "right-p25"])(
    "selects %s from its leaf, the door being the first thing the ray meets",
    (id) => {
      const leaf = namedMeshBox(mountedById(scene, id), "door_front");

      const { firstHit, selection } = rayAt(
        leaf.getCenter(new THREE.Vector3()).setZ(leaf.max.z),
      );

      expect(firstHit?.object.name).toBe("door_front");
      expect(selection?.id).toBe(id);
    },
  );

  it.each(["p25", "right-p25"])(
    "selects %s from the strip of carcass beyond the leaf, away from the corner",
    (id) => {
      const carcass = namedMeshBox(mountedById(scene, id), "carcass");
      const leaf = namedMeshBox(mountedById(scene, id), "door_front");
      const blind = carcass.getCenter(new THREE.Vector3());
      // The face of the carcass the return does not cover, on the far side of the leaf from the corner.
      blind.x = id === "p25" ? leaf.max.x + 0.005 : leaf.min.x - 0.005;
      blind.z = carcass.max.z;

      const { selection } = rayAt(blind);

      expect(selection?.id).toBe(id);
    },
  );

  // The blind span is the end of the X-leg the return stands in front of: the worktop over it is
  // reached from above, and it must still be the X-leg's.
  it.each(["p25", "right-p25"])(
    "selects %s from above its worktop over the blind span, where the return stands in front",
    (id) => {
      const ABOVE_THE_WORKTOP_M = 1.2;
      const BLIND_DEPTH_INTO_THE_LEG_M = 0.28;
      const worktop = namedMeshBox(mountedById(scene, id), "countertop");
      const aim = new THREE.Vector3(
        id === "p25"
          ? worktop.min.x + BLIND_DEPTH_INTO_THE_LEG_M
          : worktop.max.x - BLIND_DEPTH_INTO_THE_LEG_M,
        ABOVE_THE_WORKTOP_M,
        (worktop.min.z + worktop.max.z) / 2,
      );
      const raycaster = createPickingRaycaster();
      raycaster.set(aim, new THREE.Vector3(0, -1, 0));

      const selection = pick(
        raycaster,
        scene.stage.solidsRoot,
        new THREE.Group(),
      );

      expect(selection?.id).toBe(id);
    },
  );
});
