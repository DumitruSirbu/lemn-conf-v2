// M7B U5 S2, acceptance criterion 5 (D15): `crossesOnScreen` is held to the real camera, for every wall
// a room can have, in both directions.
//
// `qa-7i-screen-side.adversarial.test.ts` (three-adapter) proved walls A and B by projecting two points
// a metre apart along a wall's own +along axis through that wall's camera preset. It could not be
// asserted against `crossesOnScreen` itself, because the adapter cannot import the web app, so the two
// tables were coupled by hand (review R2.3). **This file closes that**: it projects through the
// adapter's public presets and camera constants, and asserts the web's own function against what it
// measured, for all six (wall, direction) pairs — A and B unchanged, C new.
//
// The domain's word for a wall's `+along` end is "right". A wall *crosses* on screen when +along reads
// screen-left, and that is decided by the wall's own camera, never assumed: wall C's camera is wall B's
// reflected in x = W/2 (ADR 0132 decision 1), so the answer for C is B's turned over.
import {
  CAMERA_FIELD_OF_VIEW_DEGREES,
  cameraPresetsForRoom,
  mirroredX,
  type CameraPreset,
} from "@lemnaria/three-adapter";
import type {
  CornerDirection,
  DesignRoom,
  DesignWall,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { crossesOnScreen } from "@/i18n/content";

const U_ROOM: DesignRoom = {
  shape: "U",
  widthMm: 3600,
  depthMm: 3000,
  wallCMm: 3000,
  heightMm: 2600,
};

const PHONE_ASPECT = 390 / 844;
const METRE = 1;

type WallCase = readonly [DesignWall, CornerDirection];

const EVERY_PAIR: readonly WallCase[] = [
  ["A", "left"],
  ["A", "right"],
  ["B", "left"],
  ["B", "right"],
  ["C", "left"],
  ["C", "right"],
];

/** The wall's preset in a left-hand room, reflected the way D4's mirror reflects a right-hand room's
 *  (`mirroredX` on the camera's and the target's x). **A U is never right-hand**
 *  (`cornerDirectionOf` answers left for it, so `cameraPresetsForRoom` never mirrors one), so the
 *  `right` arm of every pair is the hypothetical the rule would have to answer if a right-hand U
 *  ever existed — measured here the one way the 7I table measured A and B. */
function presetFor(wall: DesignWall, direction: CornerDirection): CameraPreset {
  const id = `wall${wall}` as const;
  const found = cameraPresetsForRoom(U_ROOM).find((preset) => preset.id === id);
  if (found === undefined) throw new Error(`no ${id} preset in a U`);
  const reflect = (point: readonly [number, number, number]) =>
    [mirroredX(direction, point[0]), point[1], point[2]] as const;
  return {
    id: found.id,
    position: [...reflect(found.position)],
    target: [...reflect(found.target)],
  };
}

function cameraFor(preset: CameraPreset): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(
    CAMERA_FIELD_OF_VIEW_DEGREES,
    PHONE_ASPECT,
    0.01,
    500,
  );
  camera.position.set(...preset.position);
  camera.lookAt(new THREE.Vector3(...preset.target));
  camera.updateMatrixWorld();
  return camera;
}

/** Two canonical points a metre apart along `wall`'s +along axis (wall A's is +x; B's and C's are +z,
 *  ADR 0132 decision 1), a fixed offset off the wall and at mid-height, so the pair never sits on the
 *  camera's own view axis. Wall C's stand beside x = W. */
function alongPointsOf(
  wall: DesignWall,
): readonly [[number, number, number], [number, number, number]] {
  const widthM = U_ROOM.widthMm / 1000;
  if (wall === "A") {
    return [
      [0.5, 1.2, 0.3],
      [0.5 + METRE, 1.2, 0.3],
    ];
  }
  const x = wall === "B" ? 0.3 : widthM - 0.3;
  return [
    [x, 1.2, 0.5],
    [x, 1.2, 0.5 + METRE],
  ];
}

function screenXOf(
  camera: THREE.PerspectiveCamera,
  direction: CornerDirection,
  point: readonly [number, number, number],
): number {
  return new THREE.Vector3(
    mirroredX(direction, point[0]),
    point[1],
    point[2],
  ).project(camera).x;
}

function screenSideOfPlusAlong(
  wall: DesignWall,
  direction: CornerDirection,
): { readonly side: "left" | "right"; readonly movedBy: number } {
  const camera = cameraFor(presetFor(wall, direction));
  const [base, along] = alongPointsOf(wall);
  const movedBy =
    screenXOf(camera, direction, along) - screenXOf(camera, direction, base);
  return { side: movedBy > 0 ? "right" : "left", movedBy };
}

describe("crossesOnScreen agrees with the camera, for all six (wall, direction) pairs (D15)", () => {
  it.each(EVERY_PAIR)(
    "wall %s, direction %s: +along on screen and the crossing agree",
    (wall, direction) => {
      const { side } = screenSideOfPlusAlong(wall, direction);

      expect(crossesOnScreen(wall, direction)).toBe(side === "left");
    },
  );

  it.each(EVERY_PAIR)(
    "wall %s, direction %s: the two points really differ on screen",
    (wall, direction) => {
      const { movedBy } = screenSideOfPlusAlong(wall, direction);

      expect(Math.abs(movedBy)).toBeGreaterThan(0.05);
    },
  );

  it("never crosses on wall C in a U, which has one hand and is always left", () => {
    expect(crossesOnScreen("C", "left")).toBe(false);
  });

  it("turns wall C over against wall B, as the reflection that makes its camera does", () => {
    expect(crossesOnScreen("C", "left")).toBe(!crossesOnScreen("B", "left"));
    expect(crossesOnScreen("C", "right")).toBe(!crossesOnScreen("B", "right"));
  });
});
