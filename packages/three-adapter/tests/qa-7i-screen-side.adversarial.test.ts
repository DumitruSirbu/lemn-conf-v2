// M7 wave 7I review round 1, L1.1: the projection table `content.ts`'s `crossesOnScreen` is held
// to, derived from the real camera rather than assumed.
//
// The domain's `alongWallM` (`along-wall.ts`) maps wall A's +along to world +x and wall B's to
// world +z; D4's mirror negates world x and never z. Whether a wall's own +along direction reads
// screen-left or screen-right is therefore a fact about that wall's own camera preset — this file
// projects two points a metre apart along each wall's own +along axis, through
// `cameraPresetsForRoom`'s real preset for that wall, canonical and mirrored, and reads the sign of
// screen-x. `content.ts`'s `crossesOnScreen` must agree with the table this proves.
import type {
  CornerDirection,
  DesignRoom,
  DesignWall,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { mirroredX } from "../src/corner-direction.js";
import {
  CAMERA_FIELD_OF_VIEW_DEGREES,
  cameraPresetsForRoom,
  type CameraPreset,
} from "../src/stage.js";
import { required } from "./support/required.js";

const ROOM: DesignRoom = {
  shape: "L",
  widthMm: 3560,
  depthMm: 2920,
  heightMm: 2600,
};

function cameraFor(preset: CameraPreset): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(
    CAMERA_FIELD_OF_VIEW_DEGREES,
    390 / 844,
    0.01,
    500,
  );
  camera.position.set(...preset.position);
  camera.lookAt(new THREE.Vector3(...preset.target));
  camera.updateMatrixWorld();
  return camera;
}

function screenXOf(
  camera: THREE.PerspectiveCamera,
  point: readonly [number, number, number],
): number {
  return new THREE.Vector3(...point).project(camera).x;
}

/** The world point a canonical (unmirrored) domain point at `(x, y, z)` actually renders at: D4's
 *  mirror is the whole root's, so a right-hand room negates every body's world x along with the
 *  camera's own (`stage.ts`'s `mirroredPreset`). */
function worldPointOf(
  direction: CornerDirection,
  point: readonly [number, number, number],
): [number, number, number] {
  return [mirroredX(direction, point[0]), point[1], point[2]];
}

/** Two canonical points one metre apart along `wall`'s own +along axis (`along-wall.ts`: wall A is
 *  +x, wall B is +z), at a fixed cross-axis offset and mid-height so the pair never sits on the
 *  camera's own view axis. */
function alongPointsOf(
  wall: DesignWall,
): readonly [[number, number, number], [number, number, number]] {
  return wall === "A"
    ? [
        [0, 1.2, 0.3],
        [1, 1.2, 0.3],
      ]
    : [
        [0.3, 1.2, 0],
        [0.3, 1.2, 1],
      ];
}

function presetFor(wall: DesignWall, direction: CornerDirection): CameraPreset {
  const room: DesignRoom =
    direction === "right" ? { ...ROOM, cornerDirection: "right" } : ROOM;
  const id = wall === "A" ? "wallA" : "wallB";
  return required(
    cameraPresetsForRoom(room).find((candidate) => candidate.id === id),
    `${id} preset`,
  );
}

/** Which screen side a wall's own +along direction reads as, measured against that wall's real
 *  camera preset rather than assumed. */
function screenSideOfPlusAlong(
  wall: DesignWall,
  direction: CornerDirection,
): "left" | "right" {
  const camera = cameraFor(presetFor(wall, direction));
  const [base, along] = alongPointsOf(wall);
  const baseX = screenXOf(camera, worldPointOf(direction, base));
  const alongX = screenXOf(camera, worldPointOf(direction, along));
  return alongX > baseX ? "right" : "left";
}

describe("7I-L1.1 — the projection table +along reads on screen", () => {
  it.each([
    ["A", "left", "right"],
    ["A", "right", "left"],
    ["B", "left", "left"],
    ["B", "right", "right"],
  ] as const)(
    "wall %s, direction %s: +along reads screen-%s",
    (wall, direction, expected) => {
      expect(screenSideOfPlusAlong(wall, direction)).toBe(expected);
    },
  );

  // Non-vacuity: the two points really do differ in screen-x, at every wall/direction pair — a
  // camera looking straight down the along axis (screen-x constant) would pass the table above
  // vacuously by rounding.
  it.each([
    ["A", "left"],
    ["A", "right"],
    ["B", "left"],
    ["B", "right"],
  ] as const)(
    "wall %s, direction %s: the two points differ on screen",
    (wall, direction) => {
      const camera = cameraFor(presetFor(wall, direction));
      const [base, along] = alongPointsOf(wall);
      const baseX = screenXOf(camera, worldPointOf(direction, base));
      const alongX = screenXOf(camera, worldPointOf(direction, along));
      expect(Math.abs(alongX - baseX)).toBeGreaterThan(0.05);
    },
  );
});
