// The camera half of the M1 acceptance criteria. The recorded failure is specific: with the preset
// target at 1.05 m the 2.20–2.60 m row projected to about 37 px in a 540 px viewport, so there was
// nothing left to tap. These tests project the row rather than trusting the numbers by eye.
//
// **Wave 7H extended every measurement here from the one seeded room to rooms across the approved
// policy**, because the presets are now a function of the room. What is measured is still the
// seeded kitchen's own ceiling-row bodies: composition places nothing in the 2200–2600 row (ADR
// 0110 E11 / wave 7D3's D8), so a *generated* kitchen has no ceiling-row body at all and pointing
// this sweep at one would make §11 row 21 vacuously green. The room varies; the bodies do not.
import {
  APPROVED_ROOM_POLICY,
  KITCHEN_L_DESIGN,
  type DesignRoom,
} from "@lemnaria/configurator-domain";
import { fc, test as propertyTest } from "@fast-check/vitest";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { makeKit, type Kit } from "../src/kitchen-parts.js";
import {
  CAMERA_FIELD_OF_VIEW_DEGREES,
  CAMERA_PRESETS,
  cameraPresetsForRoom,
  findCameraPreset,
  findCameraPresetForRoom,
  KITCHEN_TOP_M,
  type CameraPreset,
  type CameraPresetId,
} from "../src/stage.js";
import { createHeadlessCanvas } from "./support/headless-canvas.js";
import { required } from "./support/required.js";

/** The gate viewport, and the taller canvas the editor actually gets once the header is deducted. */
const MOBILE = { width: 390, height: 789 };
/** The viewport the recorded failure was measured in. */
const RECORDED_FAILURE_VIEWPORT = { width: 390, height: 540 };
const MIN_TAP_TARGET_PX = 44;

const CEILING_ROW_BOTTOM_M = 2.2;
const CEILING_ROW_TOP_M = 2.6;

const L_BOUNDS = required(
  APPROVED_ROOM_POLICY.buildableShapes.L,
  "the approved L bounds",
);
const HEIGHT_BOUNDS = APPROVED_ROOM_POLICY.heightBounds;

const SEEDED_ROOM = KITCHEN_L_DESIGN.room;

/** The eight corners of the owner-approved policy box, plus the seeded triple — which a sweep over
 *  that box would essentially never generate, and which is the preset library's own room. */
const SAMPLED_ROOMS: readonly DesignRoom[] = [
  ...[L_BOUNDS.wallA.minMm, L_BOUNDS.wallA.maxMm].flatMap((widthMm) =>
    [L_BOUNDS.wallB.minMm, L_BOUNDS.wallB.maxMm].flatMap((depthMm) =>
      [HEIGHT_BOUNDS.minMm, HEIGHT_BOUNDS.maxMm].map(
        (heightMm): DesignRoom => ({ shape: "L", widthMm, depthMm, heightMm }),
      ),
    ),
  ),
  SEEDED_ROOM,
];

const roomArbitrary = fc.record({
  shape: fc.constant("L" as const),
  widthMm: fc.integer({
    min: L_BOUNDS.wallA.minMm,
    max: L_BOUNDS.wallA.maxMm,
  }),
  depthMm: fc.integer({
    min: L_BOUNDS.wallB.minMm,
    max: L_BOUNDS.wallB.maxMm,
  }),
  heightMm: fc.integer({
    min: HEIGHT_BOUNDS.minMm,
    max: HEIGHT_BOUNDS.maxMm,
  }),
});

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

/** The band's projected height under one preset, at its thinnest across the row. */
function thinnestBandPx(
  preset: CameraPreset,
  viewport: { width: number; height: number },
): number {
  const camera = cameraFor(preset, viewport);
  const heights = ceilingRowBoxes().map((box) => {
    const centre = box.getCenter(new THREE.Vector3());
    const bottom = projectToPixels(
      new THREE.Vector3(centre.x, CEILING_ROW_BOTTOM_M, centre.z),
      camera,
      viewport,
    );
    const top = projectToPixels(
      new THREE.Vector3(centre.x, CEILING_ROW_TOP_M, centre.z),
      camera,
      viewport,
    );
    return Math.abs(bottom.y - top.y);
  });
  return Math.min(...heights);
}

describe("the ceiling row stays tappable", () => {
  it("finds ceiling-row bodies to measure, so the sweep below is not vacuous", () => {
    expect(ceilingRowBoxes().length).toBeGreaterThan(3);
  });

  it.each(
    SAMPLED_ROOMS.flatMap((sampled) =>
      CAMERA_PRESETS.map((preset) => ({
        id: preset.id,
        widthMm: sampled.widthMm,
        depthMm: sampled.depthMm,
        heightMm: sampled.heightMm,
        sampled,
      })),
    ),
  )(
    "$id projects the 2.20-2.60 row taller than a tap target at 390 x 789, at $widthMm x $depthMm x $heightMm",
    ({ id, sampled }) => {
      const preset = findCameraPresetForRoom(id, sampled);

      expect(thinnestBandPx(preset, MOBILE)).toBeGreaterThanOrEqual(
        MIN_TAP_TARGET_PX,
      );
    },
  );

  propertyTest.prop([roomArbitrary, fc.constantFrom(...presetIds())])(
    "keeps the row tappable at every room in the policy",
    (sampled, id) => {
      const preset = findCameraPresetForRoom(id, sampled);

      expect(thinnestBandPx(preset, MOBILE)).toBeGreaterThanOrEqual(
        MIN_TAP_TARGET_PX,
      );
    },
  );

  it("clears the recorded 37 px failure even in the 540 px viewport it was measured in", () => {
    const preset = findCameraPresetForRoom("overview", SEEDED_ROOM);

    expect(thinnestBandPx(preset, RECORDED_FAILURE_VIEWPORT)).toBeGreaterThan(
      37,
    );
  });

  /** The falsification case, kept as a measurement rather than as a memory: the reference's own
   *  three triples were framed on a 4.2 x 3.4 m room, and a preset that pulled back far enough to
   *  hold a 6300 mm wall would leave this band at about 25 px. */
  it("would lose the row to a camera pulled back to hold the longest approved wall", () => {
    const wallA = findCameraPresetForRoom("wallA", SEEDED_ROOM);
    const pulledBack: CameraPreset = {
      id: "wallA",
      target: wallA.target,
      position: [wallA.position[0], wallA.position[1], 15.385],
    };

    expect(thinnestBandPx(pulledBack, MOBILE)).toBeLessThan(MIN_TAP_TARGET_PX);
  });
});

/** Q7H-3, restated from *every preset frames floor to ceiling*. At the approved 3900 mm ceiling a
 *  camera far enough back to hold floor-to-ceiling shrinks the tappable row by about a third, and
 *  §11 row 21 is the one that must not break — so the presets frame the **kitchen**, floor to the
 *  top of the tallest body, and the ceiling is permitted above the frame.
 *
 *  **The rule changed, not a number.** Holding `2.6` here while the room grew past it would have
 *  been the same assertion with a stale literal, which is the failure this wave's close-out names. */
describe("every preset frames the kitchen, floor to the top of the tallest body", () => {
  it.each(
    SAMPLED_ROOMS.flatMap((sampled) =>
      CAMERA_PRESETS.map((preset) => ({
        id: preset.id,
        widthMm: sampled.widthMm,
        heightMm: sampled.heightMm,
        sampled,
      })),
    ),
  )(
    "$id keeps floor and the tallest body in frame at $widthMm wide and $heightMm high",
    ({ id, sampled }) => {
      const preset = findCameraPresetForRoom(id, sampled);
      const camera = cameraFor(preset, MOBILE);
      const [targetX, , targetZ] = preset.target;
      const floor = projectToPixels(
        new THREE.Vector3(targetX, 0, targetZ),
        camera,
        MOBILE,
      );
      const kitchenTop = projectToPixels(
        new THREE.Vector3(targetX, KITCHEN_TOP_M, targetZ),
        camera,
        MOBILE,
      );

      expect(
        kitchenTop.y,
        `${id}: the tallest body is above the frame`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        floor.y,
        `${id}: the floor is below the frame`,
      ).toBeLessThanOrEqual(MOBILE.height);
      expect(
        floor.y - kitchenTop.y,
        `${id}: the kitchen's height on screen`,
      ).toBeGreaterThan(0);
    },
  );

  /** The other half of the restatement: a ceiling well above the kitchen is *allowed* out of the
   *  frame, and at the approved maximum it is. Asserted so nobody restores the old rule. */
  it("lets a 3900 mm ceiling stand above the frame", () => {
    const tall: DesignRoom = { ...SEEDED_ROOM, heightMm: 3900 };
    const preset = findCameraPresetForRoom("overview", tall);
    const camera = cameraFor(preset, MOBILE);
    const [targetX, , targetZ] = preset.target;

    const ceiling = projectToPixels(
      new THREE.Vector3(targetX, 3.9, targetZ),
      camera,
      MOBILE,
    );

    expect(ceiling.y).toBeLessThan(0);
  });

  it("frames the same kitchen height whatever the ceiling, which is why the row survives", () => {
    const low = findCameraPresetForRoom("overview", {
      ...SEEDED_ROOM,
      heightMm: HEIGHT_BOUNDS.minMm,
    });
    const high = findCameraPresetForRoom("overview", {
      ...SEEDED_ROOM,
      heightMm: HEIGHT_BOUNDS.maxMm,
    });

    expect(thinnestBandPx(high, MOBILE)).toBeCloseTo(
      thinnestBandPx(low, MOBILE),
      6,
    );
  });
});

/** Criterion 9. The continuity half is what stops `if (isSeeded(room)) return CAMERA_PRESETS`
 *  satisfying this: a lookup around a special case is discontinuous at the special case. */
describe("the presets are a continuous function of the room", () => {
  const ONE_MILLIMETRE_MOVES_A_PRESET_LESS_THAN_M = 1e-3;

  it("returns all three, under their own ids, for every sampled room", () => {
    for (const sampled of SAMPLED_ROOMS) {
      expect(cameraPresetsForRoom(sampled).map((preset) => preset.id)).toEqual(
        CAMERA_PRESETS.map((preset) => preset.id),
      );
    }
  });

  propertyTest.prop([
    roomArbitrary,
    fc.constantFrom("width", "depth", "height"),
  ])(
    "moves a preset less than a millimetre when a wall moves one",
    (sampled, axis) => {
      const nudged = nudge(sampled, axis);

      for (const id of presetIds()) {
        const before = findCameraPresetForRoom(id, sampled);
        const after = findCameraPresetForRoom(id, nudged);
        expect(distanceBetween(before.position, after.position)).toBeLessThan(
          ONE_MILLIMETRE_MOVES_A_PRESET_LESS_THAN_M,
        );
        expect(distanceBetween(before.target, after.target)).toBeLessThan(
          ONE_MILLIMETRE_MOVES_A_PRESET_LESS_THAN_M,
        );
      }
    },
  );

  /** **The property above does not catch the special case criterion 9 names, and this is why.**
   *  Measured: with `if (isSeeded(room)) return CAMERA_PRESETS` in place, the 40-run sweep over a
   *  5400 x 4100 x 1700 mm box stays green — it essentially never generates 3560 x 2920 x 2600, so
   *  it never lands on the discontinuity. A continuity property without its explicit cases is a
   *  green gate measuring the wrong thing.
   *
   *  So the rooms a special case would be written **for** are stepped across by hand: the preset
   *  library's own room and the eight corners of the policy box, a millimetre either side on each
   *  axis. A lookup at any of them opens a jump here. */
  it.each(
    [SEEDED_ROOM, ...SAMPLED_ROOMS].map((sampled) => ({
      widthMm: sampled.widthMm,
      depthMm: sampled.depthMm,
      heightMm: sampled.heightMm,
      sampled,
    })),
  )(
    "steps across $widthMm x $depthMm x $heightMm without a jump",
    ({ sampled }) => {
      for (const axis of ["width", "depth", "height"]) {
        for (const step of [-1, 1]) {
          const neighbour = nudge(sampled, axis, step);
          for (const id of presetIds()) {
            const here = findCameraPresetForRoom(id, sampled);
            const there = findCameraPresetForRoom(id, neighbour);
            expect(
              distanceBetween(here.position, there.position),
              `${id} at ${String(sampled.widthMm)}x${String(sampled.depthMm)}, ${axis} ${String(step)} mm`,
            ).toBeLessThan(ONE_MILLIMETRE_MOVES_A_PRESET_LESS_THAN_M);
          }
        }
      }
    },
  );

  /** Non-vacuity: a function that ignored the room entirely would pass the continuity property. */
  it("moves the presets when the room really changes", () => {
    const wide = findCameraPresetForRoom("wallA", {
      ...SEEDED_ROOM,
      widthMm: SEEDED_ROOM.widthMm + 1000,
    });
    const seeded = findCameraPresetForRoom("wallA", SEEDED_ROOM);

    expect(distanceBetween(wide.target, seeded.target)).toBeCloseTo(0.5, 6);
  });

  /** Q7H-5 withdrew the fixed point, and this records that the withdrawal is real rather than
   *  unnoticed: the reference's three triples are **not** what the seeded room now returns, and
   *  `CAMERA_PRESETS` is still exported, unmoved, as the recorded starting point. */
  it("does not reproduce the reference triples at the seeded room", () => {
    const seeded = cameraPresetsForRoom(SEEDED_ROOM);

    expect(seeded.map((preset) => preset.target)).not.toEqual(
      CAMERA_PRESETS.map((preset) => preset.target),
    );
    expect(findCameraPreset("wallA").position).toEqual([1.9, 2.1, 5.6]);
  });

  /** The directions are the reference's own aesthetic and the room does not get to change them. */
  it.each(CAMERA_PRESETS.map((preset) => preset.id))(
    "%s looks from the direction the reference looks from, at every sampled room",
    (id) => {
      const reference = directionOf(findCameraPreset(id));

      for (const sampled of SAMPLED_ROOMS) {
        const framed = directionOf(findCameraPresetForRoom(id, sampled));
        expect(
          distanceBetween(framed, reference),
          `${id} at ${String(sampled.widthMm)} x ${String(sampled.depthMm)}`,
        ).toBeLessThan(1e-9);
      }
    },
  );
});

/** The constant the framing rule rests on, held to the kitchen it claims to describe. */
describe("the tallest body's top", () => {
  it("is where the seeded kitchen's bodies actually end", () => {
    const bodies = room.children.filter(
      (child) => !["floor", "wall_back", "wall_left"].includes(child.name),
    );
    const top = bodies.reduce(
      (highest, body) =>
        Math.max(highest, new THREE.Box3().setFromObject(body).max.y),
      0,
    );

    expect(top).toBeCloseTo(KITCHEN_TOP_M, 2);
  });
});

function presetIds(): CameraPresetId[] {
  return CAMERA_PRESETS.map((preset) => preset.id);
}

function nudge(sampled: DesignRoom, axis: string, step = 1): DesignRoom {
  if (axis === "width") return { ...sampled, widthMm: sampled.widthMm + step };
  if (axis === "depth") return { ...sampled, depthMm: sampled.depthMm + step };
  return { ...sampled, heightMm: sampled.heightMm + step };
}

function distanceBetween(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function directionOf(preset: CameraPreset): [number, number, number] {
  const offset: [number, number, number] = [
    preset.position[0] - preset.target[0],
    preset.position[1] - preset.target[1],
    preset.position[2] - preset.target[2],
  ];
  const length = Math.hypot(...offset);
  return [offset[0] / length, offset[1] / length, offset[2] / length];
}
