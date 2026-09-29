// M7B wave U4 adversarial QA — the cameras at the engine's extreme Us, re-derived independently of
// `wallCPresetsOf` (ADR 0132 d2; D13; criterion 4).
import type { DesignRoom } from "@lemnaria/configurator-domain";
import { test as propertyTest } from "@fast-check/vitest";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  CAMERA_FIELD_OF_VIEW_DEGREES,
  cameraPresetsForRoom,
  findCameraPresetForRoom,
  KITCHEN_TOP_M,
  type CameraPreset,
} from "../src/stage.js";
import { required } from "./support/required.js";
import {
  anyEngineU,
  labelOf,
  PHONE,
  SWEPT_US,
  uShell,
} from "./support/u-scene.js";

const MIN_TAP_TARGET_PX = 44;
const TOP_ROW_BOTTOM_M = 2.2;
const TOP_ROW_TOP_M = 2.6;

function distanceOf(preset: CameraPreset): number {
  return new THREE.Vector3(...preset.position).distanceTo(
    new THREE.Vector3(...preset.target),
  );
}

function reflectedInWallC(
  point: readonly [number, number, number],
  widthM: number,
): number[] {
  return [widthM - point[0], point[1], point[2]];
}

function projectedRow(
  preset: CameraPreset,
  at: { readonly x: number; readonly z: number },
): { readonly x: number; readonly topY: number; readonly bottomY: number } {
  const camera = new THREE.PerspectiveCamera(
    CAMERA_FIELD_OF_VIEW_DEGREES,
    PHONE.width / PHONE.height,
    0.01,
    500,
  );
  camera.position.set(...preset.position);
  camera.lookAt(new THREE.Vector3(...preset.target));
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const pixelsAt = (heightM: number) => {
    const ndc = new THREE.Vector3(at.x, heightM, at.z).project(camera);
    return {
      x: ((ndc.x + 1) / 2) * PHONE.width,
      y: ((1 - ndc.y) / 2) * PHONE.height,
    };
  };
  const bottom = pixelsAt(TOP_ROW_BOTTOM_M);
  return { x: bottom.x, topY: pixelsAt(TOP_ROW_TOP_M).y, bottomY: bottom.y };
}

describe("the U's presets hold at every extreme the engine accepts (D13)", () => {
  const cases = SWEPT_US.map(
    (dimensions) => [labelOf(dimensions), uShell(dimensions).room] as const,
  );

  it.each(cases)(
    "%s: offers overview, wallA, wallB, wallC, in that order",
    (_label, room) => {
      expect(cameraPresetsForRoom(room).map((preset) => preset.id)).toEqual([
        "overview",
        "wallA",
        "wallB",
        "wallC",
      ]);
    },
  );

  it.each(cases)(
    "%s: wallC is the L (W, C)'s wallB reflected in x = W / 2",
    (_label, room) => {
      const widthM = room.widthMm / 1000;
      const standIn: DesignRoom = {
        shape: "L",
        widthMm: room.widthMm,
        depthMm: required(room.wallCMm, "wallCMm"),
        heightMm: room.heightMm,
      };
      const wallBOfStandIn = findCameraPresetForRoom("wallB", standIn);
      const wallC = findCameraPresetForRoom("wallC", room);

      const expectedPosition = reflectedInWallC(
        wallBOfStandIn.position,
        widthM,
      );
      const expectedTarget = reflectedInWallC(wallBOfStandIn.target, widthM);
      wallC.position.forEach((value, axis) => {
        expect(value).toBeCloseTo(required(expectedPosition[axis], "axis"), 9);
      });
      wallC.target.forEach((value, axis) => {
        expect(value).toBeCloseTo(required(expectedTarget[axis], "axis"), 9);
      });
    },
  );

  it.each(cases)(
    "%s: wallA and wallB read neither C nor the shape",
    (_label, room) => {
      const asL: DesignRoom = {
        shape: "L",
        widthMm: room.widthMm,
        depthMm: room.depthMm,
        heightMm: room.heightMm,
      };

      for (const id of ["wallA", "wallB"] as const) {
        expect(findCameraPresetForRoom(id, room)).toEqual(
          findCameraPresetForRoom(id, asL),
        );
      }
    },
  );

  it.each(cases)(
    "%s: every preset stands the same fixed distance back, with finite coordinates",
    (_label, room) => {
      const presets = cameraPresetsForRoom(room);
      const reference = distanceOf(required(presets[0], "overview"));

      for (const preset of presets) {
        expect(
          [...preset.position, ...preset.target].every(Number.isFinite),
          preset.id,
        ).toBe(true);
        expect(distanceOf(preset), preset.id).toBeCloseTo(reference, 9);
      }
    },
  );

  it.each(cases)(
    "%s: the overview looks at the middle of the floor, max(B, C) deep",
    (_label, room) => {
      const target = findCameraPresetForRoom("overview", room).target;
      const farthestSideM =
        Math.max(room.depthMm, required(room.wallCMm, "wallCMm")) / 1000;

      expect(target[0]).toBeCloseTo(room.widthMm / 2000, 9);
      expect(target[1]).toBeCloseTo(KITCHEN_TOP_M / 2, 9);
      expect(target[2]).toBeCloseTo(farthestSideM / 2, 9);
    },
  );

  propertyTest.prop([anyEngineU], { numRuns: 200 })(
    "wallC puts the middle of wall C's top row on screen, tap-sized, for any engine U",
    (dimensions) => {
      const room = uShell(dimensions).room;
      const row = projectedRow(findCameraPresetForRoom("wallC", room), {
        x: room.widthMm / 1000,
        z: required(room.wallCMm, "wallCMm") / 2000,
      });

      expect(row.x).toBeGreaterThanOrEqual(0);
      expect(row.x).toBeLessThanOrEqual(PHONE.width);
      expect(row.topY).toBeGreaterThanOrEqual(0);
      expect(row.bottomY).toBeLessThanOrEqual(PHONE.height);
      expect(row.bottomY - row.topY).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX);
    },
  );
});
