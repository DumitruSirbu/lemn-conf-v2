import { fc, test as propertyTest } from "@fast-check/vitest";
import { INSERTABLE_BODY_DEFINITIONS } from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { makeKit, type KitchenCornerWidthsM } from "../src/kitchen-parts.js";
import { createHeadlessCanvas } from "./support/headless-canvas.js";
import { required } from "./support/required.js";
import { findMesh, worldBox } from "./support/structure.js";

const reference: KitchenCornerWidthsM = {
  xM: 0.9,
  // 0.32 → 0.33 (ADR 0135): the reference reach less the run's carcass front, 900 − 570.
  baseReturnM: 0.33,
  upperReturnM: 0.57,
};
const hingedFloorMm = required(
  INSERTABLE_BODY_DEFINITIONS.find(([id]) => id === "base-cabinet")?.[1]
    .minWidthMm,
  "one-door cabinet floor",
);
const declaredDepthsMm = [600, 700] as const;

describe("buildKitchen corner width dependencies", () => {
  it.each(declaredDepthsMm)(
    "should retain authored corner widths on the no-argument path at %i mm depth",
    (depthMm) => {
      const kit = makeKit({
        createCanvas: createHeadlessCanvas,
        cabinetDepthMm: depthMm,
      });
      const room = kit.builders["kitchen-l"]();
      const x = oneChild(room, "corner_base_x");
      const ret = oneChild(room, "corner_base_return");

      expect(widthM(room, x, "carcass", "x")).toBeCloseTo(reference.xM, 6);
      expect(widthM(room, ret, "carcass", "z")).toBeCloseTo(
        reference.baseReturnM,
        6,
      );
      for (const bandY of [1.5, 2.2]) {
        expect(
          widthM(room, upperReturn(room, bandY), "carcass_shell", "z"),
        ).toBeCloseTo(reference.upperReturnM, 6);
      }
    },
  );

  for (const depthMm of declaredDepthsMm) {
    propertyTest.prop([
      // The run's carcass front is 30 mm inside the depth line, and the reference return is 330 (ADR 0135).
      fc.integer({ min: depthMm - 30 + hingedFloorMm, max: 900 }),
      fc.integer({ min: hingedFloorMm, max: 330 }),
      fc.integer({ min: hingedFloorMm, max: 570 }),
    ])(
      `should move each dependent seat only with its own supplied corner width at ${String(depthMm)} mm depth`,
      (xWidthMm, baseReturnWidthMm, upperReturnWidthMm) => {
        const kit = makeKit({
          createCanvas: createHeadlessCanvas,
          cabinetDepthMm: depthMm,
        });
        const base = kit.builders["kitchen-l"]();
        const widths: KitchenCornerWidthsM = {
          xM: xWidthMm / 1000,
          baseReturnM: baseReturnWidthMm / 1000,
          upperReturnM: upperReturnWidthMm / 1000,
        };
        const changed = kit.builders["kitchen-l"](widths);
        const dx = widths.xM - reference.xM;
        const db = widths.baseReturnM - reference.baseReturnM;
        const du = widths.upperReturnM - reference.upperReturnM;

        expect(
          oneChild(changed, "corner_base_x").position.x -
            oneChild(base, "corner_base_x").position.x,
        ).toBeCloseTo(dx / 2, 6);
        const beforeWallA = wallABaseSeats(base);
        const afterWallA = wallABaseSeats(changed);
        expect(beforeWallA).toHaveLength(4);
        expect(afterWallA).toHaveLength(4);
        for (let i = 0; i < beforeWallA.length; i++) {
          expect(
            required(afterWallA[i], "wall-A seat") -
              required(beforeWallA[i], "wall-A seat"),
          ).toBeCloseTo(dx, 6);
        }
        expect(
          oneChild(changed, "induction_cooktop").position.x -
            oneChild(base, "induction_cooktop").position.x,
        ).toBeCloseTo(dx, 6);
        expect(firstWallAUpper(changed).position.x).toBeCloseTo(
          firstWallAUpper(base).position.x,
          6,
        );

        expect(
          oneChild(changed, "corner_base_return").position.z -
            oneChild(base, "corner_base_return").position.z,
        ).toBeCloseTo(db / 2, 6);
        for (const name of ["tall_unit", "fridge_freestanding"]) {
          const before = base.children
            .filter((child) => child.name === name)
            .sort((a, b) => a.position.z - b.position.z);
          const after = changed.children
            .filter((child) => child.name === name)
            .sort((a, b) => a.position.z - b.position.z);
          expect(after).toHaveLength(before.length);
          for (let i = 0; i < before.length; i++) {
            expect(
              required(after[i], name).position.z -
                required(before[i], name).position.z,
            ).toBeCloseTo(db, 6);
          }
        }

        for (const bandY of [1.5, 2.2]) {
          const before = upperReturn(base, bandY);
          const after = upperReturn(changed, bandY);
          expect(after.position.z - before.position.z).toBeCloseTo(du / 2, 6);
          expect(
            widthM(changed, after, "carcass_shell", "z") -
              widthM(base, before, "carcass_shell", "z"),
          ).toBeCloseTo(du, 6);
        }
        expect(oneChild(changed, "corner_base_return").position.z).toBeCloseTo(
          (depthMm - 30) / 1000 + widths.baseReturnM / 2,
          6,
        );
      },
    );
  }
});

// Helpers
function oneChild(room: THREE.Group, name: string): THREE.Object3D {
  const matches = room.children.filter((child) => child.name === name);
  expect(matches).toHaveLength(1);
  return required(matches[0], name);
}

function wallABaseSeats(room: THREE.Group): number[] {
  return room.children
    .filter(
      (child) =>
        child.name === "base_cabinet" || child.name === "dishwasher_housing",
    )
    .sort((a, b) => a.position.x - b.position.x)
    .map((child) => child.position.x);
}

function firstWallAUpper(room: THREE.Group): THREE.Object3D {
  const bodies = room.children
    .filter(
      (child) =>
        child.name === "wall_cabinet" &&
        child.rotation.y === 0 &&
        Math.abs(child.position.y - 1.5) < 1e-6,
    )
    .sort((a, b) => a.position.x - b.position.x);
  return required(bodies[0], "first wall-A upper");
}

function upperReturn(room: THREE.Group, y: number): THREE.Object3D {
  const bodies = room.children
    .filter(
      (child) =>
        child.name === "wall_cabinet" &&
        child.rotation.y === Math.PI / 2 &&
        Math.abs(child.position.y - y) < 1e-6,
    )
    .sort((a, b) => a.position.z - b.position.z);
  return required(bodies[0], "wall-B corner upper");
}

function widthM(
  room: THREE.Group,
  body: THREE.Object3D,
  meshName: string,
  axis: "x" | "z",
) {
  const box = worldBox(room, findMesh(body, meshName));
  return box.max[axis] - box.min[axis];
}
