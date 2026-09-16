// Wave 7H slice 5 — backlog 16, and the ruling that closed it without building it.
//
// **What this file is.** Backlog 16 was ruled by the owner on 2026-09-05 — *fit-to-run framing on
// the* Perete A *preset, so the run end is on screen at 390 px* — and never built. Wave 7H measured
// why, and the measurement is a geometric impossibility rather than an implementation gap:
//
//   - a 0.40 m band clears a 44 px tap target only within **8.658 m** of the camera;
//   - a camera at 8.658 m holds **3545 mm** of wall across a 390 px canvas;
//   - so for any wall longer than 3545 mm — 56% of the approved range, the seeded room included by
//     15 mm — *hold the whole wall* and *§11 row 21 stays tappable* cannot both be true.
//
// **The owner ruled on 2026-09-16: leave it.** The preset frames the working area, and a long wall
// is explored by dragging. The camera's distance stays derived from the kitchen's height, which is
// what makes it correct at a 2200 mm ceiling and a 3900 mm one alike. **Nothing is built for this.**
//
// **So a preset that shows part of a long wall is correct behaviour, not a defect**, and this file
// exists to stop a later wave "fixing" it. Its trigger for revisiting, recorded in ADR 0118's
// shape: *the owner has seen a 6 m kitchen on screen and wants the whole wall framed*. Until that
// happens, the numbers below are the agreed behaviour.
import {
  APPROVED_ROOM_POLICY,
  runEndPanelSeatM,
  type DesignRoom,
} from "@lemnaria/configurator-domain";
import { fc, test as propertyTest } from "@fast-check/vitest";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { buildKitchenShell, syncRunEndPanel } from "../src/kitchen-shell.js";
import { makeKit } from "../src/kitchen-parts.js";
import {
  CAMERA_FIELD_OF_VIEW_DEGREES,
  findCameraPresetForRoom,
  KITCHEN_TOP_M,
} from "../src/stage.js";
import { createHeadlessCanvas } from "./support/headless-canvas.js";
import { required } from "./support/required.js";
import {
  APPROVED_WALL_A,
  APPROVED_WALL_B,
  SEEDED_RECORDS,
  SEEDED_ROOM,
} from "./support/approved-rooms.js";

/** The mobile gate's **viewport**. Not 789: that is the canvas under the chrome, which is what
 *  `stage.test.ts` measures the tappable row in. They are different quantities and reconciling them
 *  by editing one is how the evidence gets lost. */
const VIEWPORT = { width: 390, height: 844 };

/** The narrowest wall A on which the seeded run's end panel is shown at all.
 *
 *  **Measured, not assumed, and it is neither the run's 3500 nor the panel's seat at 3510.** The
 *  domain vetoes the panel when its **outer face** would stand past the end of wall A, and that
 *  face is ADR 0083 decision 5's 3519 mm — the run's 3500, plus a 1 mm gap, plus half an 18 mm
 *  slab. Equality fits, so 3519 is the first room that shows it and 3518 is the last that does not.
 *
 *  Every property below is about a **visible** panel, so a generator that could not reach this band
 *  would assert nothing at all. */
const NARROWEST_ROOM_SHOWING_THE_PANEL_MM = 3519;

/** Rooms in which the seeded run's end panel is shown. Deliberately **not** the full policy range:
 *  a sweep over 900–6300 spends 46% of its runs on rooms where the panel is hidden, and a property
 *  about a visible panel would be vacuously green on every one of them. */
const roomShowingThePanel = fc.record({
  shape: fc.constant("L" as const),
  widthMm: fc.integer({
    min: NARROWEST_ROOM_SHOWING_THE_PANEL_MM,
    max: APPROVED_WALL_A.maxMm,
  }),
  depthMm: fc.integer({
    min: APPROVED_WALL_B.minMm,
    max: APPROVED_WALL_B.maxMm,
  }),
  heightMm: fc.integer({
    min: APPROVED_ROOM_POLICY.heightBounds.minMm,
    max: APPROVED_ROOM_POLICY.heightBounds.maxMm,
  }),
});

const PROPERTY_RUNS = { numRuns: 40 };

describe("the panel's visibility band, which every property here depends on", () => {
  it("shows the seeded run's panel from 3519 mm of wall A and not from 3518", () => {
    expect(
      runEndPanelSeatM(SEEDED_RECORDS, seededRoomWithWallA(3518)),
    ).toBeUndefined();
    expect(runEndPanelSeatM(SEEDED_RECORDS, seededRoomWithWallA(3519))).toBe(
      3.51,
    );
  });

  /** Non-vacuity for the generator: the band it draws from is inside the approved range and is not
   *  empty, and the room the preset library is built on is inside it — by 40 mm. */
  it("puts the seeded room inside that band, but only just", () => {
    expect(SEEDED_ROOM.widthMm).toBeGreaterThanOrEqual(
      NARROWEST_ROOM_SHOWING_THE_PANEL_MM,
    );
    expect(SEEDED_ROOM.widthMm - NARROWEST_ROOM_SHOWING_THE_PANEL_MM).toBe(41);
    expect(NARROWEST_ROOM_SHOWING_THE_PANEL_MM).toBeLessThan(
      APPROVED_WALL_A.maxMm,
    );
  });

  propertyTest.prop([roomShowingThePanel], PROPERTY_RUNS)(
    "draws a visible panel at every room the generator produces",
    (room) => {
      expect(panelUnderPereteA(room).isVisible).toBe(true);
    },
  );
});

/** **The ruling, as numbers.** Not an aspiration and not a defect report: the agreed behaviour,
 *  pinned so that a change to it is a decision somebody makes rather than a drift nobody sees. */
describe("Perete A frames the working area, not the whole wall", () => {
  it("leaves the seeded room's run end off the right of the viewport", () => {
    const panel = panelUnderPereteA(SEEDED_ROOM);

    expect(panel.isVisible).toBe(true);
    expect(panel.nearestEdgePx).toBeCloseTo(596.2, 1);
    expect(panel.nearestEdgePx).toBeGreaterThan(VIEWPORT.width);
  });

  /** **The wave moved this number the wrong way, and it is recorded rather than buried.** Backlog
   *  16 measured the run end at x ≈ 514 of 390 under the reference's own *Perete A*, which stood
   *  5.21 m back. The room-driven preset stands 4.24 m back — the distance that keeps the 2.20–2.60
   *  row tappable at a 3900 mm ceiling — so it sees less of the wall and the run end sits further
   *  out. The owner ruled with this in front of them. */
  it("sits further out than the reference preset did, which is the cost of the ruling", () => {
    expect(panelUnderPereteA(SEEDED_ROOM).nearestEdgePx).toBeGreaterThan(514.9);
  });

  /** The positive half of *frames the working area*: the preset looks at the middle of the wall it
   *  is named for, at half the kitchen's height, in every room — so what is on screen is kitchen
   *  rather than an arbitrary slice. */
  propertyTest.prop([roomShowingThePanel], PROPERTY_RUNS)(
    "looks at the middle of wall A at every room",
    (room) => {
      const preset = findCameraPresetForRoom("wallA", room);

      expect(preset.target[0]).toBeCloseTo(room.widthMm / 2000, 9);
      expect(preset.target[1]).toBeCloseTo(KITCHEN_TOP_M / 2, 9);
      expect(preset.target[2]).toBe(0);
    },
  );

  /** What *explored by dragging* costs, stated in metres so nobody has to guess: the frame holds
   *  this much of wall A whatever the room, because the distance is a constant of the kitchen's
   *  height. Below this the whole wall is on screen; above it, part of it is. */
  it("holds 1.62 m of wall A, at every room in the policy", () => {
    const held = [
      APPROVED_WALL_A.minMm,
      SEEDED_ROOM.widthMm,
      APPROVED_WALL_A.maxMm,
    ].map((widthMm) => heldWallLengthM(seededRoomWithWallA(widthMm)));

    for (const length of held) expect(length).toBeCloseTo(1.623, 3);
  });
});

/** The band of rooms in which the run end happens to land back inside the viewport, measured so a
 *  framing change that moves it is visible.
 *
 *  It is a coincidence of the **seeded** run standing 3.51 m along whatever wall it is put on: as
 *  the room grows, the preset's target walks out to meet the panel and passes it. A *generated*
 *  kitchen fills its own wall, so its run end stays out near the far end and this band does not
 *  arise for one. Pinned as a measurement, not as a goal. */
describe("where the seeded run's end happens to land back on screen", () => {
  it.each([
    { widthMm: 3560, nearestEdgePx: 596.2 },
    { widthMm: 4000, nearestEdgePx: 544.3 },
    { widthMm: 5000, nearestEdgePx: 426.9 },
    { widthMm: 5400, nearestEdgePx: 380.3 },
    { widthMm: 6000, nearestEdgePx: 310.6 },
    { widthMm: 6300, nearestEdgePx: 275.9 },
  ])(
    "projects the run end's near edge to $nearestEdgePx px at $widthMm mm",
    ({ widthMm, nearestEdgePx }) => {
      expect(
        panelUnderPereteA(seededRoomWithWallA(widthMm)).nearestEdgePx,
      ).toBeCloseTo(nearestEdgePx, 1);
    },
  );

  it("brings the whole panel inside the viewport only in the longest rooms", () => {
    expect(
      panelUnderPereteA(seededRoomWithWallA(6300)).farthestEdgePx,
    ).toBeLessThan(VIEWPORT.width);
    expect(
      panelUnderPereteA(seededRoomWithWallA(5400)).farthestEdgePx,
    ).toBeGreaterThan(VIEWPORT.width);
  });
});

interface PanelOnScreen {
  readonly isVisible: boolean;
  readonly nearestEdgePx: number;
  readonly farthestEdgePx: number;
}

/** `end_panel_right`, seated from the seeded records and projected through *Perete A* for `room`.
 *
 *  The panel is seated by `syncRunEndPanel` rather than read off the freshly built shell, because
 *  ADR 0045 makes the seat a function of the records and an unsynced shell is only parked. */
function panelUnderPereteA(room: DesignRoom): PanelOnScreen {
  const kit = makeKit({ createCanvas: createHeadlessCanvas });
  const shell = buildKitchenShell(kit, room);
  const solidsRoot = new THREE.Group();
  solidsRoot.add(shell);
  syncRunEndPanel({ solidsRoot, records: SEEDED_RECORDS, room });
  shell.updateWorldMatrix(true, true);

  const panel = required(
    shell.children.find((child) => child.name === "end_panel_right"),
    "the run-end panel",
  );
  const pixels = cornersOf(new THREE.Box3().setFromObject(panel)).map(
    (corner) => toPixelX(corner, cameraFor(room)),
  );
  return {
    isVisible: panel.visible,
    nearestEdgePx: Math.min(...pixels),
    farthestEdgePx: Math.max(...pixels),
  };
}

/** How much of wall A the frame holds, measured by walking the near plane rather than by
 *  trigonometry: the two points on wall A that project to the viewport's left and right edges. */
function heldWallLengthM(room: DesignRoom): number {
  const camera = cameraFor(room);
  const centreX = room.widthMm / 2000;
  const edge = (direction: number) => {
    let inside = 0;
    let outside = 100;
    for (let step = 0; step < 80; step++) {
      const middle = (inside + outside) / 2;
      const point = new THREE.Vector3(
        centreX + direction * middle,
        KITCHEN_TOP_M / 2,
        0,
      );
      if (Math.abs(point.project(camera).x) <= 1) inside = middle;
      else outside = middle;
    }
    return inside;
  };
  return edge(-1) + edge(1);
}

function cameraFor(room: DesignRoom): THREE.PerspectiveCamera {
  const preset = findCameraPresetForRoom("wallA", room);
  const camera = new THREE.PerspectiveCamera(
    CAMERA_FIELD_OF_VIEW_DEGREES,
    VIEWPORT.width / VIEWPORT.height,
    0.01,
    500,
  );
  camera.position.set(...preset.position);
  camera.lookAt(new THREE.Vector3(...preset.target));
  camera.updateMatrixWorld();
  return camera;
}

function cornersOf(box: THREE.Box3): THREE.Vector3[] {
  const corners: THREE.Vector3[] = [];
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        corners.push(new THREE.Vector3(x, y, z));
      }
    }
  }
  return corners;
}

function toPixelX(point: THREE.Vector3, camera: THREE.PerspectiveCamera) {
  return ((point.clone().project(camera).x + 1) / 2) * VIEWPORT.width;
}

/** The seeded room with wall A moved and nothing else — this file sweeps one axis, so it does
 *  not want `support/approved-rooms.ts`'s three-argument `roomOf`. */
function seededRoomWithWallA(widthMm: number): DesignRoom {
  return { ...SEEDED_ROOM, widthMm };
}
