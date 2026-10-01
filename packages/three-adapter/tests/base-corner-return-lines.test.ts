// ADR 0135 (M7C wave C4, slice S1): the base return stands on the run's lines.
//
// The owner ruled "everything on one line" after measuring the side-wall return 20 mm behind its
// neighbour's worktop and 8-10 mm behind its doors. Every claim below is made of two measured bodies,
// the return and a base cabinet, rather than of a constant either is built from, so a figure tuned to
// close the gap would still have to agree with the run. The seam-by-seam measurement of whole rooms
// is the C0 script's; this file is what stays in the suite.
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

const RETURN_WIDTH_M = 0.32;
const BASE_CABINET_WIDTH_M = 0.6;
const EXACT_M = 1e-6;

/** Declared cabinet depth, and the run's carcass front from the wall at it: `D - 30`. Written out
 *  from the plan's own table rather than read from the builder or the domain. */
const RUN_CARCASS_FRONT_M_BY_DEPTH_MM = [
  [600, 0.57],
  [700, 0.67],
] as const;

/** The panel's size at the reference width: `W - 6 mm` wide, `CARC_H - 10 mm` tall, one door thick. */
const FIXED_FRONT_SIZE_M = [0.314, 0.71, 0.018] as const;

beforeAll(() => {
  installHeadlessDocument();
});

function kitAt(cabinetDepthMm: number): Kit {
  return makeKit({ createCanvas: createHeadlessCanvas, cabinetDepthMm });
}

function returnLeg(kit: Kit): THREE.Group {
  return kit.make.cornerBaseReturn(
    kit.depths.cornerReturnDepthM,
    RETURN_WIDTH_M,
  );
}

function baseRun(kit: Kit): THREE.Group {
  return kit.make.baseCabinet(BASE_CABINET_WIDTH_M, { doors: 2 });
}

/** How far a mesh's front stands from the wall plane, in metres. Both bodies seat their worktop's
 *  back face on the wall (§11 row 19, ADR 0018), so the wall plane is the back of their `countertop`
 *  in the body's own frame — the return's carcass back is flush with it, which is asserted below. */
function frontFromWallM(body: THREE.Group, meshName: string): number {
  return (
    worldBox(body, findMesh(body, meshName)).max.z -
    worldBox(body, findMesh(body, "countertop")).min.z
  );
}

describe.each(RUN_CARCASS_FRONT_M_BY_DEPTH_MM)(
  "the base return at a %i mm kitchen",
  (cabinetDepthMm, runCarcassFrontM) => {
    const kit = kitAt(cabinetDepthMm);
    const leg = returnLeg(kit);
    const run = baseRun(kit);

    it("is built to the run's carcass front, with its back face on the wall", () => {
      const carcass = worldBox(leg, findMesh(leg, "carcass"));
      const worktop = worldBox(leg, findMesh(leg, "countertop"));

      expect(carcass.max.z - carcass.min.z).toBeCloseTo(runCarcassFrontM, 6);
      expect(worktop.min.z).toBeCloseTo(carcass.min.z, 6);
    });

    it("ends its worktop where a base run's worktop ends", () => {
      expect(frontFromWallM(leg, "countertop")).toBeCloseTo(
        frontFromWallM(run, "countertop"),
        6,
      );
    });

    it("ends its carcass where a base run's carcass ends", () => {
      expect(frontFromWallM(leg, "carcass")).toBeCloseTo(
        frontFromWallM(run, "carcass_shell"),
        6,
      );
    });

    it("ends its plinth where a base run's plinth ends", () => {
      expect(frontFromWallM(leg, "plinth")).toBeCloseTo(
        frontFromWallM(run, "plinth"),
        6,
      );
    });

    it("puts its front face on the plane of the run's doors", () => {
      expect(frontFromWallM(leg, "fixed_front")).toBeCloseTo(
        frontFromWallM(run, "door_front"),
        6,
      );
    });

    it("draws the fixed front as a door-thick panel, with no handle and no door", () => {
      const size = worldBox(leg, findMesh(leg, "fixed_front")).getSize(
        new THREE.Vector3(),
      );

      expect(size.x).toBeCloseTo(FIXED_FRONT_SIZE_M[0], 6);
      expect(size.y).toBeCloseTo(FIXED_FRONT_SIZE_M[1], 6);
      expect(size.z).toBeCloseTo(FIXED_FRONT_SIZE_M[2], 6);
      const names: string[] = [];
      leg.traverse((node) => names.push(node.name));
      expect(names.filter((name) => /^(door|handle)/.test(name))).toEqual([]);
    });

    it("hangs the fixed front as a base door hangs: same material, same height band, centred", () => {
      const front = findMesh(leg, "fixed_front");
      const door = findMesh(run, "door_front");
      const frontBox = worldBox(leg, front);
      const doorBox = worldBox(run, door);
      const carcassBox = worldBox(leg, findMesh(leg, "carcass"));

      expect(front.material).toBe(door.material);
      expect(front.material).not.toBe(findMesh(leg, "carcass").material);
      expect(frontBox.min.y).toBeCloseTo(doorBox.min.y, 6);
      expect(frontBox.max.y).toBeCloseTo(doorBox.max.y, 6);
      expect((frontBox.min.x + frontBox.max.x) / 2).toBeCloseTo(
        (carcassBox.min.x + carcassBox.max.x) / 2,
        6,
      );
    });

    it("keeps the fixed front off the carcass and inside the worktop's span", () => {
      const front = worldBox(leg, findMesh(leg, "fixed_front"));
      const carcass = worldBox(leg, findMesh(leg, "carcass"));
      const worktop = worldBox(leg, findMesh(leg, "countertop"));

      expect(front.min.z).toBeGreaterThanOrEqual(carcass.max.z - EXACT_M);
      expect(front.max.z).toBeLessThanOrEqual(worktop.max.z);
      expect(front.min.x).toBeGreaterThanOrEqual(carcass.min.x);
      expect(front.max.x).toBeLessThanOrEqual(carcass.max.x);
    });
  },
);

describe("tapping the return's fixed front", () => {
  const SWEPT_U = {
    widthMm: 4500,
    depthMm: 3000,
    wallCMm: 3600,
    heightMm: 2600,
  };
  const IN_FRONT_OF_THE_FACE_M = 0.05;
  const scene = mountU(SWEPT_U);

  it.each(["p26", "right-p26"])(
    "selects %s, and the front is the first thing the ray meets",
    (placementId) => {
      const body = mountedById(scene, placementId);
      const face = namedMeshBox(body, "fixed_front").getCenter(
        new THREE.Vector3(),
      );
      const towardTheWall = namedMeshBox(body, "carcass")
        .getCenter(new THREE.Vector3())
        .sub(face)
        .setY(0)
        .normalize();
      const raycaster = createPickingRaycaster();
      raycaster.set(
        face.clone().addScaledVector(towardTheWall, -IN_FRONT_OF_THE_FACE_M),
        towardTheWall,
      );

      const firstHit = raycaster.intersectObject(
        scene.stage.solidsRoot,
        true,
      )[0];
      const selection = pick(
        raycaster,
        scene.stage.solidsRoot,
        new THREE.Group(),
      );

      expect(firstHit?.object.name).toBe("fixed_front");
      expect(selection?.id).toBe(placementId);
    },
  );
});
