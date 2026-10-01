import { fc, test as propertyTest } from "@fast-check/vitest";
import { INSERTABLE_BODY_DEFINITIONS } from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { makeKit } from "../src/kitchen-parts.js";
import { createHeadlessCanvas } from "./support/headless-canvas.js";
import { required } from "./support/required.js";
import { findMesh, findMeshes, worldBox } from "./support/structure.js";

const ONE_DOOR_FLOOR_MM = (() => {
  const base = INSERTABLE_BODY_DEFINITIONS.find(
    ([id]) => id === "base-cabinet",
  )?.[1];
  const wall = INSERTABLE_BODY_DEFINITIONS.find(
    ([id]) => id === "wall-cabinet",
  )?.[1];
  if (!base?.minWidthMm || base.minWidthMm !== wall?.minWidthMm) {
    throw new Error("hinged base and wall floors must agree");
  }
  return base.minWidthMm;
})();
const DEPTHS_MM = [600, 700] as const;
/** ADR 0025 decision 3's pin: the X-leg's carcass stands 20 mm behind the wall plane. */
const X_LEG_BEHIND_WALL_M = 0.02;
/** The run's carcass front, inside the cabinet-depth line (ADR 0135); it was the run's seat, 20. */
const RUN_CARCASS_FRONT_INSET_MM = 30;

function width(box: THREE.Box3, axis: "x" | "y" | "z") {
  return box.max[axis] - box.min[axis];
}

function corner(depthMm: number, xWidthMm: number, returnWidthMm: number) {
  const kit = makeKit({
    createCanvas: createHeadlessCanvas,
    cabinetDepthMm: depthMm,
  });
  const x = kit.make.cornerBaseX(xWidthMm / 1000);
  const ret = kit.make.cornerBaseReturn(
    kit.depths.cornerReturnDepthM,
    returnWidthMm / 1000,
  );
  // Real L-joint seats: the X-leg ends 20 mm behind the wall and its front is the joint, which is the
  // return's own depth (ADR 0135); the return begins at it.
  x.position.set(
    xWidthMm / 2000,
    0,
    (kit.depths.cornerReturnDepthM - X_LEG_BEHIND_WALL_M) / 2,
  );
  ret.position.set(
    kit.depths.cornerReturnDepthM / 2,
    0,
    kit.depths.cornerReturnDepthM + returnWidthMm / 2000,
  );
  ret.rotation.y = Math.PI / 2;
  const room = new THREE.Group();
  room.add(x, ret);
  return { kit, room, x, ret };
}

describe("7D7 S1 adversarial corner geometry", () => {
  it.each(DEPTHS_MM)(
    "keeps the minimum-width door, carousel and worktop inside the corner at %i mm depth",
    (depthMm) => {
      const minimumXWidthMm =
        depthMm - RUN_CARCASS_FRONT_INSET_MM + ONE_DOOR_FLOOR_MM;
      const { room, x, ret } = corner(
        depthMm,
        minimumXWidthMm,
        ONE_DOOR_FLOOR_MM,
      );
      const xCarcass = worldBox(room, findMesh(x, "carcass"));
      const door = worldBox(room, findMesh(x, "door_front"));
      const returnCarcass = worldBox(room, findMesh(ret, "carcass"));
      const xTop = worldBox(room, findMesh(x, "countertop"));
      const returnTop = worldBox(room, findMesh(ret, "countertop"));

      expect(width(xCarcass, "x")).toBeCloseTo(minimumXWidthMm / 1000, 6);
      expect(width(returnCarcass, "z")).toBeCloseTo(
        ONE_DOOR_FLOOR_MM / 1000,
        6,
      );
      expect(width(door, "x")).toBeCloseTo((ONE_DOOR_FLOOR_MM - 40) / 1000, 6);
      expect(door.min.x - returnCarcass.max.x).toBeGreaterThan(0.029);
      expect(findMeshes(x, "door_front")).toHaveLength(1);
      expect(findMeshes(ret, "door_front")).toHaveLength(0);
      for (const tray of findMeshes(x, "susan_tray")) {
        const trayBox = worldBox(room, tray);
        expect(trayBox.min.x).toBeGreaterThan(xCarcass.min.x);
        expect(trayBox.max.x).toBeLessThan(xCarcass.max.x);
        expect(trayBox.min.z).toBeGreaterThan(xCarcass.min.z);
        expect(trayBox.max.z).toBeLessThan(xCarcass.max.z);
        expect(width(trayBox, "x")).toBeCloseTo(0.4, 6);
      }
      expect(width(xTop, "x")).toBeCloseTo(minimumXWidthMm / 1000, 6);
      expect(width(returnTop, "z")).toBeCloseTo(
        (ONE_DOOR_FLOOR_MM - 50) / 1000,
        6,
      );
      // Both slabs occupy the same height: their horizontal faces must butt, not interpenetrate.
      expect(returnTop.min.z - xTop.max.z).toBeCloseTo(0, 6);
      expect(returnTop.max.z).toBeCloseTo(returnCarcass.max.z, 6);
    },
  );

  propertyTest.prop([
    fc.constantFrom(...DEPTHS_MM),
    fc.integer({ min: 0, max: 120 }),
    fc.integer({ min: ONE_DOOR_FLOOR_MM, max: 330 }),
  ])(
    "preserves a clear door and a butt seam across admitted width pairs",
    (depthMm, aboveFloorMm, returnWidthMm) => {
      const minimumXWidthMm =
        depthMm - RUN_CARCASS_FRONT_INSET_MM + ONE_DOOR_FLOOR_MM;
      const xWidthMm = Math.min(900, minimumXWidthMm + aboveFloorMm);
      const { room, x, ret } = corner(depthMm, xWidthMm, returnWidthMm);
      const door = worldBox(room, findMesh(x, "door_front"));
      const returnCarcass = worldBox(room, findMesh(ret, "carcass"));
      const xTop = worldBox(room, findMesh(x, "countertop"));
      const returnTop = worldBox(room, findMesh(ret, "countertop"));
      expect(door.min.x - returnCarcass.max.x).toBeGreaterThan(0.029);
      expect(returnTop.min.z - xTop.max.z).toBeCloseTo(0, 6);
      expect(width(returnTop, "z")).toBeCloseTo((returnWidthMm - 50) / 1000, 6);
    },
  );

  it.each(DEPTHS_MM)(
    "builds the floor-width one-door corner wall body at both 700 and 400 mm heights at %i mm depth",
    (depthMm) => {
      const kit = makeKit({
        createCanvas: createHeadlessCanvas,
        cabinetDepthMm: depthMm,
      });
      for (const heightMm of [700, 400]) {
        const body = kit.make.wallCabinet(
          ONE_DOOR_FLOOR_MM / 1000,
          1,
          heightMm / 1000,
          kit.depths.wallDepthM,
        );
        const carcass = worldBox(body, findMesh(body, "carcass_shell"));
        const doors = findMeshes(body, "door_front");
        expect(doors).toHaveLength(1);
        const door = worldBox(body, required(doors[0], "corner wall door"));
        expect(width(carcass, "x")).toBeCloseTo(ONE_DOOR_FLOOR_MM / 1000, 6);
        expect(width(door, "x")).toBeCloseTo((ONE_DOOR_FLOOR_MM - 6) / 1000, 6);
        expect(width(door, "y")).toBeCloseTo((heightMm - 6) / 1000, 6);
        expect(door.min.x).toBeGreaterThan(carcass.min.x);
        expect(door.max.x).toBeLessThan(carcass.max.x);
        expect(findMeshes(body, "handle_bar")).toHaveLength(1);
      }
    },
  );

  propertyTest.prop([
    fc.constantFrom(...DEPTHS_MM),
    fc.integer({ min: ONE_DOOR_FLOOR_MM, max: 570 }),
    fc.constantFrom(700, 400),
  ])(
    "builds one contained leaf throughout the wall and top width ranges",
    (depthMm, widthMm, heightMm) => {
      const kit = makeKit({
        createCanvas: createHeadlessCanvas,
        cabinetDepthMm: depthMm,
      });
      const body = kit.make.wallCabinet(
        widthMm / 1000,
        1,
        heightMm / 1000,
        kit.depths.wallDepthM,
      );
      const carcass = worldBox(body, findMesh(body, "carcass_shell"));
      const doors = findMeshes(body, "door_front");
      expect(doors).toHaveLength(1);
      const door = worldBox(body, required(doors[0], "corner wall door"));
      expect(width(carcass, "x")).toBeCloseTo(widthMm / 1000, 6);
      expect(width(door, "x")).toBeCloseTo((widthMm - 6) / 1000, 6);
      expect(width(door, "y")).toBeCloseTo((heightMm - 6) / 1000, 6);
      expect(door.min.x).toBeGreaterThan(carcass.min.x);
      expect(door.max.x).toBeLessThan(carcass.max.x);
      expect(findMeshes(body, "handle_bar")).toHaveLength(1);
    },
  );
});
