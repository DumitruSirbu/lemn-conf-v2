// The camera half of the M1 acceptance criteria. The recorded failure is specific: with the preset
// target at 1.05 m the 2.20–2.60 m row projected to about 37 px in a 540 px viewport, so there was
// nothing left to tap. These tests project the row rather than trusting the numbers by eye.
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { makeKit, type Kit } from "./kitchen-parts.js";
import {
  CAMERA_FIELD_OF_VIEW_DEGREES,
  CAMERA_PRESETS,
  findCameraPreset,
  type CameraPreset,
} from "./stage.js";
import { createHeadlessCanvas } from "./testing/headless-canvas.js";

/** The gate viewport, and the taller canvas the editor actually gets once the header is deducted. */
const MOBILE = { width: 390, height: 789 };
/** The viewport the recorded failure was measured in. */
const RECORDED_FAILURE_VIEWPORT = { width: 390, height: 540 };
const MIN_TAP_TARGET_PX = 44;

const CEILING_ROW_BOTTOM_M = 2.2;
const CEILING_ROW_TOP_M = 2.6;

let kit: Kit;
let room: THREE.Group;

beforeAll(() => {
  kit = makeKit({ createCanvas: createHeadlessCanvas });
  room = kit.builders["kitchen-l"]();
  room.updateWorldMatrix(true, true);
});

function cameraFor(
  preset: CameraPreset,
  viewport: { width: number; height: number },
) {
  const camera = new THREE.PerspectiveCamera(
    CAMERA_FIELD_OF_VIEW_DEGREES,
    viewport.width / viewport.height,
    0.01,
    500,
  );
  camera.position.set(...preset.position);
  camera.lookAt(new THREE.Vector3(...preset.target));
  camera.updateMatrixWorld();
  return camera;
}

function projectToPixels(
  point: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
  viewport: { width: number; height: number },
) {
  const projected = point.clone().project(camera);
  return {
    x: ((projected.x + 1) / 2) * viewport.width,
    y: ((1 - projected.y) / 2) * viewport.height,
  };
}

/** Every ceiling-row body in the seeded scene, as world-space boxes. */
function ceilingRowBoxes(): THREE.Box3[] {
  return room.children
    .filter((child) => child.name === "wall_cabinet")
    .map((child) => new THREE.Box3().setFromObject(child))
    .filter((box) => Math.abs(box.min.y - CEILING_ROW_BOTTOM_M) < 0.01);
}

describe("the ceiling row stays tappable", () => {
  it("finds ceiling-row bodies to measure, so the sweep below is not vacuous", () => {
    expect(ceilingRowBoxes().length).toBeGreaterThan(3);
  });

  it.each(CAMERA_PRESETS.map((preset) => preset.id))(
    "%s projects the 2.20-2.60 row taller than a tap target at 390 x 789",
    (id) => {
      const camera = cameraFor(findCameraPreset(id), MOBILE);
      for (const box of ceilingRowBoxes()) {
        const centre = box.getCenter(new THREE.Vector3());
        const bottom = projectToPixels(
          new THREE.Vector3(centre.x, CEILING_ROW_BOTTOM_M, centre.z),
          camera,
          MOBILE,
        );
        const top = projectToPixels(
          new THREE.Vector3(centre.x, CEILING_ROW_TOP_M, centre.z),
          camera,
          MOBILE,
        );
        expect(
          Math.abs(bottom.y - top.y),
          `${id}: row at x=${centre.x.toFixed(2)} z=${centre.z.toFixed(2)}`,
        ).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX);
      }
    },
  );

  it("clears the recorded 37 px failure even in the 540 px viewport it was measured in", () => {
    const camera = cameraFor(
      findCameraPreset("overview"),
      RECORDED_FAILURE_VIEWPORT,
    );
    const heights = ceilingRowBoxes().map((box) => {
      const centre = box.getCenter(new THREE.Vector3());
      const bottom = projectToPixels(
        new THREE.Vector3(centre.x, CEILING_ROW_BOTTOM_M, centre.z),
        camera,
        RECORDED_FAILURE_VIEWPORT,
      );
      const top = projectToPixels(
        new THREE.Vector3(centre.x, CEILING_ROW_TOP_M, centre.z),
        camera,
        RECORDED_FAILURE_VIEWPORT,
      );
      return Math.abs(bottom.y - top.y);
    });
    expect(Math.min(...heights)).toBeGreaterThan(37);
  });
});

describe("every preset frames floor to ceiling", () => {
  it.each(CAMERA_PRESETS.map((preset) => preset.id))(
    "%s keeps the room inside the frame",
    (id) => {
      const preset = findCameraPreset(id);
      const camera = cameraFor(preset, MOBILE);
      const [, , targetZ] = preset.target;
      const [targetX] = preset.target;
      const floor = projectToPixels(
        new THREE.Vector3(targetX, 0, targetZ),
        camera,
        MOBILE,
      );
      const ceiling = projectToPixels(
        new THREE.Vector3(targetX, 2.6, targetZ),
        camera,
        MOBILE,
      );
      expect(
        ceiling.y,
        `${id}: ceiling above the frame`,
      ).toBeGreaterThanOrEqual(0);
      expect(floor.y, `${id}: floor below the frame`).toBeLessThanOrEqual(
        MOBILE.height,
      );
      expect(
        floor.y - ceiling.y,
        `${id}: room height on screen`,
      ).toBeGreaterThan(0);
    },
  );
});
