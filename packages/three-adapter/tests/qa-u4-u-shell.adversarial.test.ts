// M7B wave U4 adversarial QA — wall C and the floor through any sequence of rooms equal a freshly
// built shell (ADR 0132 d1; criterion 6), and wall C's plane at the minimum and maximum U.
import type { DesignRoom } from "@lemnaria/configurator-domain";
import { fc, test as propertyTest } from "@fast-check/vitest";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { buildKitchenShell, resizeShellToRoom } from "../src/kitchen-shell.js";
import { makeKit } from "../src/kitchen-parts.js";
import { isMesh } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { required } from "./support/required.js";
import { anyEngineU, SWEPT_US, uShell, worldBox } from "./support/u-scene.js";

const WALL_C_PLANE_NAME = "wall_right";
const CORNER_OVERHANG_M = 0.3;

beforeAll(() => {
  installHeadlessDocument();
});

/** The geometry's own extent, rounded to a micrometre: what a resize rebuilds, whatever the
 *  constructor was. */
function geometryExtentOf(geometry: THREE.BufferGeometry): string {
  geometry.computeBoundingBox();
  const box = required(geometry.boundingBox, "a bounding box");
  return [...box.min.toArray(), ...box.max.toArray()]
    .map((value) => value.toFixed(6))
    .join(",");
}

interface ShellChildState {
  readonly name: string;
  readonly visible: boolean;
  readonly position: readonly number[];
  readonly parameters: string;
}

function visibleShellState(shell: THREE.Group): ShellChildState[] {
  return shell.children
    .filter((child) => child.visible)
    .map((child) => ({
      name: child.name,
      visible: child.visible,
      position: child.position
        .toArray()
        .map((value) => Number(value.toFixed(9))),
      parameters: isMesh(child) ? geometryExtentOf(child.geometry) : "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

describe("the shell after any sequence of rooms is the shell built fresh for the last (criterion 6)", () => {
  const anyShellRoom: fc.Arbitrary<DesignRoom> = fc.oneof(
    anyEngineU.map((dimensions) => uShell(dimensions).room),
    fc
      .record({
        shape: fc.constantFrom("L" as const, "linear" as const),
        widthMm: fc.integer({ min: 2000, max: 6000 }),
        depthMm: fc.integer({ min: 1000, max: 6000 }),
        heightMm: fc.integer({ min: 2200, max: 3900 }),
      })
      .map((room): DesignRoom => room),
  );

  propertyTest.prop([fc.array(anyShellRoom, { minLength: 1, maxLength: 6 })], {
    numRuns: 60,
  })(
    "visible children, their geometry and their positions match; wall C is at most one mesh",
    (rooms) => {
      const kit = makeKit({ createCanvas: createHeadlessCanvas });
      const shell = buildKitchenShell(kit, required(rooms[0], "first room"));
      for (const room of rooms.slice(1))
        resizeShellToRoom({ kit, shell, room });
      const last = required(rooms.at(-1), "last room");

      const fresh = buildKitchenShell(kit, last);

      expect(visibleShellState(shell)).toEqual(visibleShellState(fresh));
      expect(
        shell.children.filter((c) => c.name === WALL_C_PLANE_NAME).length,
      ).toBeLessThanOrEqual(1);
    },
  );

  it("spans wall C's plane from one overhang behind the A∩C corner to C at the minimum and maximum U", () => {
    for (const dimensions of [SWEPT_US[0], SWEPT_US.at(-1)]) {
      const room = uShell(required(dimensions, "a U")).room;
      const kit = makeKit({ createCanvas: createHeadlessCanvas });
      const shell = buildKitchenShell(kit, room);
      const plane = required(
        shell.getObjectByName(WALL_C_PLANE_NAME),
        "wall C",
      );

      const box = worldBox(plane);

      expect(box.min.x).toBeCloseTo(room.widthMm / 1000, 6);
      expect(box.max.x).toBeCloseTo(room.widthMm / 1000, 6);
      expect(box.min.z).toBeCloseTo(-CORNER_OVERHANG_M, 6);
      expect(box.max.z).toBeCloseTo(
        required(room.wallCMm, "wallCMm") / 1000,
        6,
      );
      expect(box.max.y).toBeCloseTo(room.heightMm / 1000, 6);
    }
  });
});
