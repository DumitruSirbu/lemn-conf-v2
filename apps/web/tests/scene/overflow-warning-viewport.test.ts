// The scene at 390 × 844 with ADR 0065's warning band on it, measured against the real kit, the real
// bodies and the real camera preset the screen mounts with.
//
// **What this file is and is not**, stated first because `price-bar-viewport.test.ts` records the
// same trap: a perspective camera's vertical field of view does not depend on the aspect ratio, so
// "every body projects below the band" reduces to `normalised ≥ 0` and holds for any band height at
// all. It is therefore not the overlap gate and is not written as one.
//
// **The overlap constraint is carried by two things, neither of them a projection sweep:**
//
// - `overflow-warning-layout.test.ts` holds the stylesheet to laying the band out *above* the
//   scene's box rather than over it. That is the whole of "it cannot cover the selected cabinet": a
//   flow sibling has nothing to overlap.
// - The counterfactual below, which measures how little room an overlaid band would actually have.
//
// **And the constraint the band can still break while laid out correctly is the scene it leaves.**
// A band tall enough shrinks the scene until the cabinets in it are too small to tap — `stage.ts`
// records a row that "projected to about 37 px in a 540 px viewport and became unclickable". That is
// the sweep that actually varies with the band's height, and it is the gate here.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  derivePlacementRecords,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  WORKTOP_DEPTH_MM,
} from "@lemnaria/configurator-domain";
import {
  buildKitchenShell,
  CAMERA_FIELD_OF_VIEW_DEGREES,
  findCameraPreset,
  makeKit,
  syncSolidBodies,
} from "@lemnaria/three-adapter";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { PRICE_BAR_RESERVED_HEIGHT_PX } from "@/price/price-bar-layout";
import { OVERFLOW_WARNING_RESERVED_HEIGHT_PX } from "@/scene/overflow-warning-layout";

import { createHeadlessCanvas } from "../support/headless-canvas";

/** §10.1's touch sizing and the camera chips' own inset, read from the stylesheets that declare them
 *  rather than repeated here — a second copy of either number is how a gate and the product drift. */
function readPx(path: string, pattern: RegExp): number {
  const declared = pattern.exec(
    readFileSync(resolve(import.meta.dirname, path), "utf8"),
  )?.[1];
  if (!declared) throw new Error(`${path} declares no ${String(pattern)}`);
  return Number(declared);
}

const TOUCH_TARGET_PX = readPx(
  "../../src/app/globals.css",
  /--touch-target:\s*(\d+)px/,
);
const CAMERA_CHIP_INSET_PX = readPx(
  "../../src/app/configurator/configure/configure.module.css",
  /\.presets \{[^}]*top:\s*(\d+)px/s,
);

/** M6's mobile gate, and §10's viewport. */
const GATE_VIEWPORT = { widthPx: 390, heightPx: 844 } as const;

/** The screen's header is content-sized, so the gate is swept across every height it plausibly takes
 *  rather than pinned to one measurement a font change would falsify. */
const HEADER_HEIGHTS_PX = [48, 64, 80, 96, 112, 128, 140];

/** The band's reserve is a floor: the ruled sentence wraps at 390 px and the band grows. Swept up to
 *  a line taller than the two the reserve is sized for, because growing must only ever shrink the
 *  scene further. */
const BAND_HEIGHTS_PX = [
  OVERFLOW_WARNING_RESERVED_HEIGHT_PX,
  OVERFLOW_WARNING_RESERVED_HEIGHT_PX + 16,
  OVERFLOW_WARNING_RESERVED_HEIGHT_PX + 32,
];

const CAMERA_NEAR_M = 0.01;
const CAMERA_FAR_M = 500;

const solidsRoot = new THREE.Group();

beforeAll(() => {
  const kit = makeKit({
    cabinetDepthMm: WORKTOP_DEPTH_MM,
    createCanvas: createHeadlessCanvas,
  });
  solidsRoot.add(buildKitchenShell(kit));
  syncSolidBodies({
    kit,
    solidsRoot,
    records: derivePlacementRecords(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG),
  });
});

/** Every mounted body, by the placement id picking climbs to. The shell's own children carry none. */
function mountedBodies(): THREE.Object3D[] {
  return solidsRoot.children.filter(
    (child) => child.userData.placementId !== undefined,
  );
}

/** The overview preset, which is what `ConfigureScreen` mounts with. */
function cameraFor(sceneHeightPx: number): THREE.PerspectiveCamera {
  const preset = findCameraPreset("overview");
  const camera = new THREE.PerspectiveCamera(
    CAMERA_FIELD_OF_VIEW_DEGREES,
    GATE_VIEWPORT.widthPx / sceneHeightPx,
    CAMERA_NEAR_M,
    CAMERA_FAR_M,
  );
  camera.position.set(...preset.position);
  camera.lookAt(new THREE.Vector3(...preset.target));
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}

interface ScreenRect {
  readonly topPx: number;
  readonly bottomPx: number;
}

/** The body's world box projected to the scene canvas, in scene-box coordinates. */
function projectVerticalExtent(
  body: THREE.Object3D,
  sceneHeightPx: number,
): ScreenRect {
  const camera = cameraFor(sceneHeightPx);
  const box = new THREE.Box3().setFromObject(body);
  let topPx = Number.POSITIVE_INFINITY;
  let bottomPx = Number.NEGATIVE_INFINITY;

  for (const corner of cornersOf(box)) {
    const projected = corner.clone().project(camera);
    const y = ((1 - projected.y) / 2) * sceneHeightPx;
    topPx = Math.min(topPx, y);
    bottomPx = Math.max(bottomPx, y);
  }
  return { topPx, bottomPx };
}

function cornersOf(box: THREE.Box3): THREE.Vector3[] {
  return [box.min.x, box.max.x].flatMap((x) =>
    [box.min.y, box.max.y].flatMap((y) =>
      [box.min.z, box.max.z].map((z) => new THREE.Vector3(x, y, z)),
    ),
  );
}

/** The height the scene's box is left with once the header, the price bar and the band have taken
 *  theirs — the whole of the flow layout in one number. */
function sceneHeightFor(headerHeightPx: number, bandHeightPx: number): number {
  return (
    GATE_VIEWPORT.heightPx -
    headerHeightPx -
    PRICE_BAR_RESERVED_HEIGHT_PX -
    bandHeightPx
  );
}

function smallestBodyHeightPx(sceneHeightPx: number): number {
  return Math.min(
    ...mountedBodies().map((body) => {
      const extent = projectVerticalExtent(body, sceneHeightPx);
      return extent.bottomPx - extent.topPx;
    }),
  );
}

/** The topmost pixel any body reaches inside the scene's box, over every header the screen takes.
 *  This is the clearance an overlaid band would have to live in. */
function smallestTopClearancePx(bandHeightPx: number): number {
  return Math.min(
    ...HEADER_HEIGHTS_PX.map((headerHeightPx) => {
      const sceneHeightPx = sceneHeightFor(headerHeightPx, bandHeightPx);
      return Math.min(
        ...mountedBodies().map(
          (body) => projectVerticalExtent(body, sceneHeightPx).topPx,
        ),
      );
    }),
  );
}

describe("the band leaves a scene the customer can still work in", () => {
  it("mounts the whole seeded kitchen, so the sweep below is not vacuous", () => {
    expect(mountedBodies().length).toBe(
      derivePlacementRecords(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG).length,
    );
  });

  for (const headerHeightPx of HEADER_HEIGHTS_PX) {
    for (const bandHeightPx of BAND_HEIGHTS_PX) {
      it(`keeps every body tappable with a ${String(headerHeightPx)} px header and a ${String(bandHeightPx)} px band`, () => {
        const smallest = smallestBodyHeightPx(
          sceneHeightFor(headerHeightPx, bandHeightPx),
        );

        expect(smallest).toBeGreaterThanOrEqual(TOUCH_TARGET_PX);
      });
    }
  }

  it("is an assertion a much taller band actually fails", () => {
    // The sensitivity check. A 260 px band leaves ~330 px of scene and the smallest body projects
    // below the touch target; if this ever passes, the sweep above has stopped measuring the band.
    const smallestUnderATallBand = smallestBodyHeightPx(
      sceneHeightFor(140, 260),
    );

    expect(smallestUnderATallBand).toBeLessThan(TOUCH_TARGET_PX);
  });
});

describe("why the band is in flow rather than over the scene", () => {
  it("has 61 px of clearance to be an overlay in, against a 56 px band", () => {
    // The `overview` preset is required to frame the kitchen floor to ceiling, so the bodies fill
    // nearly the whole scene box. The camera chips already occupy the top of what clearance there
    // is. The remainder is recorded as a measurement rather than left to be rediscovered: an overlay
    // would ship with 5 px of margin, against a band whose own height is a floor.
    const chipsBottomPx = CAMERA_CHIP_INSET_PX + TOUCH_TARGET_PX;
    const clearanceBelowChipsPx = smallestTopClearancePx(0) - chipsBottomPx;

    expect(Math.round(clearanceBelowChipsPx)).toBe(61);
    expect(OVERFLOW_WARNING_RESERVED_HEIGHT_PX).toBe(56);
  });

  it("would cover real cabinets as an overlay the moment the sentence took a third line", () => {
    // The counterfactual the flow layout exists to avoid, and the reason the reserve is a floor
    // rather than a ceiling: an overlay cannot grow, and this sentence wraps.
    const chipsBottomPx = CAMERA_CHIP_INSET_PX + TOUCH_TARGET_PX;
    const overlaidBandBottomPx =
      chipsBottomPx + OVERFLOW_WARNING_RESERVED_HEIGHT_PX + 16;

    expect(overlaidBandBottomPx).toBeGreaterThan(smallestTopClearancePx(0));
  });
});
