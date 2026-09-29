// M7B wave U4 slice S3 (D13; acceptance criterion 4; §11 row 21): a U's four camera presets.
//
// `wallC` is `wallB` reflected in x = W/2 with C in place of B. `overview` looks at the middle of the
// drawn floor (the farther of the side walls) from the U's open side: on the centre line, looking
// along -z (ADR 0132 Amendment A3). Its horizontal reach is not asserted beyond wall A's middle, and
// no preset is asked to hold a whole wall: at 390 x 844 the frame is about 1.6 m wide (A4). The L and
// the straight room offer exactly what they offered before (`stage.non-u-presets.test.ts`). The U
// rooms are ones the product accepts: each is round-tripped through the domain's own
// `buildUShellDesign` before it is measured.
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  buildUShellDesign,
  type DesignRoom,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  CAMERA_FIELD_OF_VIEW_DEGREES,
  cameraPresetsForRoom,
  findCameraPresetForRoom,
  KITCHEN_TOP_M,
  type CameraPreset,
  type CameraPresetId,
} from "../src/stage.js";
import { required } from "./support/required.js";

const OCCURRED_AT = "2026-09-29T12:00:00.000Z";
/** The gate viewport (§11 row 21's mobile metric). */
const PHONE = { width: 390, height: 844 };
const MIN_TAP_TARGET_PX = 44;
const TOP_ROW_BOTTOM_M = 2.2;
const TOP_ROW_TOP_M = 2.6;

function acceptedU(room: DesignRoom): DesignRoom {
  return buildUShellDesign({ room, occurredAt: OCCURRED_AT }).room;
}

/** The smallest, a middle and the largest U the engine accepts, found by probing
 *  `buildUShellDesign` rather than restating limits the domain keeps to itself. */
const MINIMUM_U = acceptedU({
  shape: "U",
  widthMm: 1800,
  depthMm: 880,
  wallCMm: 880,
  heightMm: 1500,
});
const MIDDLE_U = acceptedU({
  shape: "U",
  widthMm: 4500,
  depthMm: 3000,
  wallCMm: 3600,
  heightMm: 2600,
});
const MAXIMUM_U = acceptedU({
  shape: "U",
  widthMm: 6300,
  depthMm: 6300,
  wallCMm: 6300,
  heightMm: 3900,
});
/** AC4 (c)'s five rooms: the engine's minimum U, the approved minimum wall A with the shortest
 *  sides, a symmetric 3 m U, a middle U with unequal sides, and the maximum. */
const SAMPLED_US = [
  ["minimum", MINIMUM_U],
  [
    "2700 x 1600 x 1600",
    acceptedU({ ...MIDDLE_U, widthMm: 2700, depthMm: 1600, wallCMm: 1600 }),
  ],
  [
    "3000 x 3000 x 3000",
    acceptedU({ ...MIDDLE_U, widthMm: 3000, depthMm: 3000, wallCMm: 3000 }),
  ],
  ["middle", MIDDLE_U],
  ["maximum", MAXIMUM_U],
] as const;

const L_ROOM: DesignRoom = {
  shape: "L",
  widthMm: 3700,
  depthMm: 3400,
  heightMm: 2600,
};

function ids(room: DesignRoom): CameraPresetId[] {
  return cameraPresetsForRoom(room).map((preset) => preset.id);
}

function presetOf(id: CameraPresetId, room: DesignRoom): CameraPreset {
  return findCameraPresetForRoom(id, room);
}

const metres = (mm: number): number => mm / 1000;

describe("which presets a room offers", () => {
  it("offers a U [overview, wallA, wallB, wallC], in that order", () => {
    for (const [, room] of SAMPLED_US) {
      expect(ids(room)).toEqual(["overview", "wallA", "wallB", "wallC"]);
    }
  });

  it("leaves an L at [overview, wallA, wallB] and a straight room at [overview, wallA]", () => {
    expect(ids(L_ROOM)).toEqual(["overview", "wallA", "wallB"]);
    expect(ids({ ...L_ROOM, shape: "linear" })).toEqual(["overview", "wallA"]);
    expect(ids({ ...L_ROOM, cornerDirection: "right" })).toEqual([
      "overview",
      "wallA",
      "wallB",
    ]);
  });

  it("refuses to find wallC for a room that has none", () => {
    expect(() => presetOf("wallC", L_ROOM)).toThrow(/wallC/);
  });
});

describe("wallC is wallB reflected in x = W/2 with C in place of B (D13)", () => {
  /** A U whose wall B is as long as the sampled U's wall C: what wallB would be if wall C were wall B. */
  function uWithCAsB(room: DesignRoom): DesignRoom {
    return acceptedU({ ...room, depthMm: required(room.wallCMm, "wallCMm") });
  }

  it.each(SAMPLED_US)(
    "%s U: position and target are wallB's, at C, with x replaced by W − x",
    (_name, room) => {
      const widthM = metres(room.widthMm);
      const wallB = presetOf("wallB", uWithCAsB(room));

      const wallC = presetOf("wallC", room);

      expect(wallC.position[0]).toBeCloseTo(widthM - wallB.position[0], 9);
      expect(wallC.position[1]).toBeCloseTo(wallB.position[1], 9);
      expect(wallC.position[2]).toBeCloseTo(wallB.position[2], 9);
      expect(wallC.target[0]).toBeCloseTo(widthM - wallB.target[0], 9);
      expect(wallC.target[1]).toBeCloseTo(wallB.target[1], 9);
      expect(wallC.target[2]).toBeCloseTo(wallB.target[2], 9);
    },
  );

  it.each(SAMPLED_US)(
    "%s U: looks at the middle of wall C, at x = W and z = C / 2, at half the kitchen's height",
    (_name, room) => {
      const target = presetOf("wallC", room).target;

      expect(target[0]).toBeCloseTo(metres(room.widthMm), 9);
      expect(target[1]).toBeCloseTo(KITCHEN_TOP_M / 2, 9);
      expect(target[2]).toBeCloseTo(metres(required(room.wallCMm, "C")) / 2, 9);
    },
  );

  it("stands on wall B's side of the room when it looks at wall C: the eye is at x < W", () => {
    const room = MAXIMUM_U;

    expect(presetOf("wallC", room).position[0]).toBeLessThan(
      metres(room.widthMm),
    );
    expect(presetOf("wallB", room).position[0]).toBeGreaterThan(0);
  });

  it("frames wall C on C and never on B: two Us that differ in B alone give the same wallC", () => {
    const shorterB = acceptedU({ ...MIDDLE_U, depthMm: 1800 });

    expect(presetOf("wallC", shorterB)).toEqual(presetOf("wallC", MIDDLE_U));
  });

  it("frames wall B on B and never on C: two Us that differ in C alone give the same wallB", () => {
    const shorterC = acceptedU({ ...MIDDLE_U, wallCMm: 1800 });

    expect(presetOf("wallB", shorterC)).toEqual(presetOf("wallB", MIDDLE_U));
  });

  it("mirrors a symmetric U's wallB exactly: with B = C, wallC is wallB reflected in x = W/2", () => {
    const symmetric = acceptedU({ ...MIDDLE_U, wallCMm: MIDDLE_U.depthMm });
    const wallB = presetOf("wallB", symmetric);
    const wallC = presetOf("wallC", symmetric);

    const reflected = (x: number): number => metres(symmetric.widthMm) - x;

    expect(wallC.position[0]).toBeCloseTo(reflected(wallB.position[0]), 9);
    expect(wallC.target[0]).toBeCloseTo(reflected(wallB.target[0]), 9);
    expect(wallC.position[2]).toBeCloseTo(wallB.position[2], 9);
    expect(wallC.target[2]).toBeCloseTo(wallB.target[2], 9);
  });
});

describe("overview looks in from the U's open side, on the centre line (ADR 0132 A3)", () => {
  /** A front's plane, from its wall: the deepest floor body (ADR 0108 H2, 742 mm at depth 600). */
  const DEEPEST_FRONT_M = 0.742;

  it.each(SAMPLED_US)(
    "%s U: looks at the middle of the drawn floor, depth max(B, C) / 2",
    (_name, room) => {
      const target = presetOf("overview", room).target;
      const farthestWallM = metres(
        Math.max(room.depthMm, required(room.wallCMm, "wallCMm")),
      );

      expect(target[0]).toBeCloseTo(metres(room.widthMm) / 2, 9);
      expect(target[2]).toBeCloseTo(farthestWallM / 2, 9);
    },
  );

  it.each(SAMPLED_US)(
    "%s U: stands at x = W / 2 and looks along -z: the eye is on the centre line, on the open side",
    (_name, room) => {
      const { position, target } = presetOf("overview", room);

      expect(position[0]).toBeCloseTo(metres(room.widthMm) / 2, 9);
      expect(position[2]).toBeGreaterThan(target[2]);
    },
  );

  it.each(SAMPLED_US)(
    "%s U: keeps an L's distance and elevation: only the bearing is turned",
    (_name, room) => {
      const uOverview = presetOf("overview", room);
      const lOverview = presetOf("overview", {
        ...L_ROOM,
        heightMm: room.heightMm,
      });
      const offsetOf = (preset: CameraPreset) =>
        new THREE.Vector3(...preset.position).sub(
          new THREE.Vector3(...preset.target),
        );

      const u = offsetOf(uOverview);
      const l = offsetOf(lOverview);

      expect(u.length()).toBeCloseTo(l.length(), 9);
      expect(u.y).toBeCloseTo(l.y, 9);
    },
  );

  it.each(SAMPLED_US)(
    "%s U: every run's fronts face the eye: it is in front of wall A, wall B and wall C's deepest body",
    (_name, room) => {
      const [x, , z] = presetOf("overview", room).position;

      expect(z, "in front of wall A's fronts").toBeGreaterThan(DEEPEST_FRONT_M);
      expect(x, "in front of wall B's fronts").toBeGreaterThan(DEEPEST_FRONT_M);
      expect(
        metres(room.widthMm) - x,
        "in front of wall C's fronts",
      ).toBeGreaterThan(DEEPEST_FRONT_M);
    },
  );

  it("follows C when C is the longer side wall, and B when B is", () => {
    const cLonger = acceptedU({ ...MIDDLE_U, depthMm: 2000, wallCMm: 4400 });
    const bLonger = acceptedU({ ...MIDDLE_U, depthMm: 4400, wallCMm: 2000 });

    expect(presetOf("overview", cLonger).target[2]).toBeCloseTo(2.2, 9);
    expect(presetOf("overview", bLonger).target[2]).toBeCloseTo(2.2, 9);
  });

  it("leaves wallA and wallB where they were: neither reads C", () => {
    const shorterC = acceptedU({ ...MIDDLE_U, wallCMm: 1800 });
    const longerC = acceptedU({ ...MIDDLE_U, wallCMm: 6000 });

    for (const id of ["wallA", "wallB"] as const) {
      expect(presetOf(id, shorterC)).toEqual(presetOf(id, longerC));
    }
  });

  it("frames an L and a straight room on their own depth exactly as before: overview at depthMm / 2", () => {
    for (const room of [L_ROOM, { ...L_ROOM, shape: "linear" as const }]) {
      const [x, y, z] = presetOf("overview", room).target;

      expect([x, y, z]).toEqual([
        metres(room.widthMm) / 2,
        KITCHEN_TOP_M / 2,
        metres(room.depthMm) / 2,
      ]);
    }
  });
});

describe("§11 row 21 at 390 x 844: the top row stays on screen from every preset of a U", () => {
  function cameraFor(preset: CameraPreset): THREE.PerspectiveCamera {
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
    return camera;
  }

  interface ProjectedRow {
    readonly x: number;
    readonly topY: number;
    readonly bottomY: number;
  }

  /** The top row's two edges, projected at one wall's middle. */
  function topRowAt(
    preset: CameraPreset,
    wallMiddle: { readonly x: number; readonly z: number },
  ): ProjectedRow {
    const camera = cameraFor(preset);
    const pixelsOf = (heightM: number): THREE.Vector2 => {
      const ndc = new THREE.Vector3(
        wallMiddle.x,
        heightM,
        wallMiddle.z,
      ).project(camera);
      return new THREE.Vector2(
        ((ndc.x + 1) / 2) * PHONE.width,
        ((1 - ndc.y) / 2) * PHONE.height,
      );
    };
    const bottom = pixelsOf(TOP_ROW_BOTTOM_M);
    const top = pixelsOf(TOP_ROW_TOP_M);
    return { x: bottom.x, topY: top.y, bottomY: bottom.y };
  }

  function wallMiddlesOf(room: DesignRoom) {
    return {
      wallA: { x: metres(room.widthMm) / 2, z: 0 },
      wallB: { x: 0, z: metres(room.depthMm) / 2 },
      wallC: {
        x: metres(room.widthMm),
        z: metres(required(room.wallCMm, "wallCMm")) / 2,
      },
    };
  }

  function expectRowOnScreenVertically(row: ProjectedRow, label: string): void {
    expect(row.topY, `${label}: top edge`).toBeGreaterThanOrEqual(0);
    expect(row.bottomY, `${label}: bottom edge`).toBeLessThanOrEqual(
      PHONE.height,
    );
    expect(
      row.bottomY - row.topY,
      `${label}: thickness`,
    ).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX);
  }

  it.each(SAMPLED_US)(
    "%s U: each wall preset puts its own wall's top row inside the viewport, tap-sized",
    (_name, room) => {
      const middles = wallMiddlesOf(room);

      for (const id of ["wallA", "wallB", "wallC"] as const) {
        const row = topRowAt(presetOf(id, room), middles[id]);

        expectRowOnScreenVertically(row, id);
        expect(row.x, `${id}: middle of its wall`).toBeGreaterThanOrEqual(0);
        expect(row.x, `${id}: middle of its wall`).toBeLessThanOrEqual(
          PHONE.width,
        );
      }
    },
  );

  it.each(SAMPLED_US)(
    "%s U: the overview puts every wall's top row inside the viewport vertically, tap-sized, and wall A's middle on screen",
    (_name, room) => {
      const overview = presetOf("overview", room);
      const middles = wallMiddlesOf(room);

      for (const wall of ["wallA", "wallB", "wallC"] as const) {
        expectRowOnScreenVertically(topRowAt(overview, middles[wall]), wall);
      }
      const wallA = topRowAt(overview, middles.wallA);
      expect(wallA.x, "wall A's middle").toBeGreaterThanOrEqual(0);
      expect(wallA.x, "wall A's middle").toBeLessThanOrEqual(PHONE.width);
    },
  );

  const approvedU = fc
    .record({
      widthMm: fc.integer({ min: 2700, max: 6000 }),
      depthMm: fc.integer({ min: 1000, max: 6000 }),
      wallCMm: fc.integer({ min: 1000, max: 6000 }),
      heightMm: fc.integer({ min: 2200, max: 3900 }),
    })
    .map((dimensions): DesignRoom => ({ shape: "U", ...dimensions }));

  propertyTest.prop([approvedU], { numRuns: 250 })(
    "across the approved U range: each wall preset frames its own wall's top row, and the overview every wall's, tap-sized",
    (room) => {
      const middles = wallMiddlesOf(room);

      for (const id of ["wallA", "wallB", "wallC"] as const) {
        const row = topRowAt(presetOf(id, room), middles[id]);
        expectRowOnScreenVertically(row, id);
        expect(row.x, `${id}: middle of its wall`).toBeGreaterThanOrEqual(0);
        expect(row.x, `${id}: middle of its wall`).toBeLessThanOrEqual(
          PHONE.width,
        );
      }
      const overview = presetOf("overview", room);
      for (const wall of ["wallA", "wallB", "wallC"] as const) {
        expectRowOnScreenVertically(topRowAt(overview, middles[wall]), wall);
      }
      expect(topRowAt(overview, middles.wallA).x).toBeGreaterThanOrEqual(0);
      expect(topRowAt(overview, middles.wallA).x).toBeLessThanOrEqual(
        PHONE.width,
      );
    },
  );

  it("frames wallC exactly as tall as wallB in a symmetric U: the reflection changes no row height", () => {
    const symmetric = acceptedU({ ...MIDDLE_U, wallCMm: MIDDLE_U.depthMm });
    const middles = wallMiddlesOf(symmetric);

    const onB = topRowAt(presetOf("wallB", symmetric), middles.wallB);
    const onC = topRowAt(presetOf("wallC", symmetric), middles.wallC);

    expect(onC.topY).toBeCloseTo(onB.topY, 6);
    expect(onC.bottomY).toBeCloseTo(onB.bottomY, 6);
    expect(onC.x).toBeCloseTo(onB.x, 6);
  });
});
