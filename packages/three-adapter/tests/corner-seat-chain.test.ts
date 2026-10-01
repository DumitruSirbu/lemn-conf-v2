import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { makeKit, type KitchenCornerWidthsM } from "../src/kitchen-parts.js";
import { createHeadlessCanvas } from "./support/headless-canvas.js";
import { required } from "./support/required.js";
import { findMesh, worldBox } from "./support/structure.js";

// Widths are deliberately different from the 900 / 330 / 570 mm reference. The X-leg's 880 mm
// total still gives a one-door accessible front at either declared cabinet depth.
const NARROW_CORNERS: KitchenCornerWidthsM = {
  xM: 0.88,
  baseReturnM: 0.25,
  upperReturnM: 0.35,
};

// Every wall-B base figure below is 10 mm nearer the corner than before ADR 0135: the chain starts at
// the joint, the run's carcass front (570 at 600, 670 at 700), where it started at the run's seat.
const CASES = [
  {
    cabinetDepthMm: 600,
    wallDepthMm: 330,
    returnCentreMm: 695,
    ovenCentreMm: 1120,
    pantryCentreMm: 1720,
    fridgeCentreMm: 2370,
    upperCentreMm: 505,
  },
  {
    cabinetDepthMm: 700,
    wallDepthMm: 400,
    returnCentreMm: 795,
    ovenCentreMm: 1220,
    pantryCentreMm: 1820,
    fridgeCentreMm: 2470,
    upperCentreMm: 575,
  },
] as const;

function mm(metres: number): number {
  return Math.round(metres * 1000);
}

function oneChild(room: THREE.Group, name: string): THREE.Object3D {
  const matches = room.children.filter((child) => child.name === name);
  expect(matches, `${name} must occur exactly once`).toHaveLength(1);
  return required(matches[0], name);
}

function upperReturn(room: THREE.Group, bandY: number): THREE.Object3D {
  const wallB = room.children
    .filter(
      (child) =>
        child.name === "wall_cabinet" &&
        child.rotation.y === Math.PI / 2 &&
        Math.abs(child.position.y - bandY) < 1e-6,
    )
    .sort((a, b) => a.position.z - b.position.z);
  expect(wallB.length).toBeGreaterThan(0);
  return required(wallB[0], `wall B corner return at y=${String(bandY)}`);
}

describe("the reference builder's width-fed corner seat chains", () => {
  it("keeps the fixture's 600 mm corner widths in a no-argument 700 mm kit", () => {
    const kit = makeKit({
      createCanvas: createHeadlessCanvas,
      cabinetDepthMm: 700,
      wallDepthMm: 400,
    });
    const room = kit.builders["kitchen-l"]();
    const x = oneChild(room, "corner_base_x");
    const ret = oneChild(room, "corner_base_return");
    const upper = upperReturn(room, 1.5);
    const top = upperReturn(room, 2.2);

    expect(
      mm(worldBox(room, findMesh(x, "carcass")).getSize(new THREE.Vector3()).x),
    ).toBe(900);
    expect(
      mm(
        worldBox(room, findMesh(ret, "carcass")).getSize(new THREE.Vector3()).z,
      ),
    ).toBe(330);
    expect(
      mm(
        worldBox(room, findMesh(upper, "carcass_shell")).getSize(
          new THREE.Vector3(),
        ).z,
      ),
    ).toBe(570);
    expect(
      mm(
        worldBox(room, findMesh(top, "carcass_shell")).getSize(
          new THREE.Vector3(),
        ).z,
      ),
    ).toBe(570);
  });

  it.each(CASES)(
    "moves all five wall-A floor seats with an 880 mm X-leg at $cabinetDepthMm mm depth",
    ({ cabinetDepthMm, wallDepthMm }) => {
      const kit = makeKit({
        createCanvas: createHeadlessCanvas,
        cabinetDepthMm,
        wallDepthMm,
      });
      const room = kit.builders["kitchen-l"](NARROW_CORNERS);
      const x = oneChild(room, "corner_base_x");
      const bases = room.children
        .filter((child) => child.name === "base_cabinet")
        .sort((a, b) => a.position.x - b.position.x);

      expect(mm(x.position.x)).toBe(440);
      expect(bases.map((body) => mm(body.position.x))).toEqual([
        1280, 2580, 3180,
      ]);
      expect(mm(oneChild(room, "dishwasher_housing").position.x)).toBe(1980);
      expect(mm(oneChild(room, "induction_cooktop").position.x)).toBe(2580);

      // J3′ leaves wall A's wall-row origin at zero, even while its base row follows the X-leg.
      for (const bandY of [1.5, 2.2]) {
        const firstWallA = room.children
          .filter(
            (child) =>
              child.name === "wall_cabinet" &&
              child.rotation.y === 0 &&
              Math.abs(child.position.y - bandY) < 1e-6,
          )
          .sort((a, b) => a.position.x - b.position.x)[0];
        expect(mm(required(firstWallA, "first wall-A upper").position.x)).toBe(
          300,
        );
      }
    },
  );

  it.each(CASES)(
    "moves the whole wall-B base chain with a 250 mm return at $cabinetDepthMm mm depth",
    ({
      cabinetDepthMm,
      wallDepthMm,
      returnCentreMm,
      ovenCentreMm,
      pantryCentreMm,
      fridgeCentreMm,
    }) => {
      const kit = makeKit({
        createCanvas: createHeadlessCanvas,
        cabinetDepthMm,
        wallDepthMm,
      });
      const room = kit.builders["kitchen-l"](NARROW_CORNERS);
      const tall = room.children
        .filter((child) => child.name === "tall_unit")
        .sort((a, b) => a.position.z - b.position.z);

      expect(mm(oneChild(room, "corner_base_return").position.z)).toBe(
        returnCentreMm,
      );
      expect(tall.map((body) => mm(body.position.z))).toEqual([
        ovenCentreMm,
        pantryCentreMm,
      ]);
      expect(mm(oneChild(room, "fridge_freestanding").position.z)).toBe(
        fridgeCentreMm,
      );
    },
  );

  it.each(CASES)(
    "uses one 350 mm upper-return width for both bands and their seat at $cabinetDepthMm mm depth",
    ({ cabinetDepthMm, wallDepthMm, upperCentreMm }) => {
      const kit = makeKit({
        createCanvas: createHeadlessCanvas,
        cabinetDepthMm,
        wallDepthMm,
      });
      const room = kit.builders["kitchen-l"](NARROW_CORNERS);

      for (const bandY of [1.5, 2.2]) {
        const body = upperReturn(room, bandY);
        const carcass = worldBox(room, findMesh(body, "carcass_shell"));
        expect(mm(body.position.z)).toBe(upperCentreMm);
        expect(mm(carcass.max.z - carcass.min.z)).toBe(350);
      }
    },
  );

  it("moves the preview pair's two seats with the supplied widths", () => {
    const kit = makeKit({ createCanvas: createHeadlessCanvas });
    const pair = kit.builders["base-corner"](NARROW_CORNERS);
    const x = required(
      pair.children.find((child) => child.name === "corner_base_x"),
      "X-leg",
    );
    const ret = required(
      pair.children.find((child) => child.name === "corner_base_return"),
      "return leg",
    );

    expect(mm(x.position.x)).toBe(440);
    expect(mm(ret.position.z)).toBe(695);
  });
});
