// The scene at 390 × 844 with ADR 0065's warning band on it, measured against the real kit, the real
// bodies and the real camera preset the screen mounts with.
//
// **Rewritten when wave 6G moved the band, and the rewrite inverts what this file asserts.** While
// the band was a flow row it shrank the scene, so the gate that mattered was §10.1's touch target: a
// band tall enough takes the scene until its cabinets are too small to tap. The band is now an
// **overlay** pinned to the scene box's bottom edge and costs the scene no height, so that gate is
// vacuous by construction. It has been replaced rather than kept for comfort.
//
// **What an overlay has to answer instead is what it paints over.** Three things, in the order they
// matter:
//
// - M6's hard constraint, "it must not cover the selected cabinet". Asserted **directly**: the only
//   part of the scene a customer can see while a cabinet is selected is the strip above §9's sheet,
//   and the band is at the opposite edge of the scene box.
// - That the band's height is not a term in that strip's arithmetic, which is the whole reason it
//   left the flow — pinned against the counterfactual that put it back.
// - What it does paint over with nothing selected, recorded as numbers rather than waved at.
//
// **The header height and 6G's settings row are swept, not assumed.** The header is content-sized;
// `.settingsRow` is not in this branch. The model below reproduces the Chromium measurements taken on
// the merged tree to 0.01 px — canvas height 697 and 650.06, strip 130.68 and 83.74, at the measured
// 55 px header — so the numbers pinned here are the same numbers a browser reports.
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

/** §10.1's touch sizing, read from the stylesheet that declares it rather than repeated here — a
 *  second copy of the number is how a gate and the product drift apart. */
function readTouchTargetPx(): number {
  const globals = readFileSync(
    resolve(import.meta.dirname, "../../src/app/globals.css"),
    "utf8",
  );
  const declared = /--touch-target:\s*(\d+)px/.exec(globals)?.[1];
  if (!declared) throw new Error("globals.css declares no --touch-target");
  return Number(declared);
}

const TOUCH_TARGET_PX = readTouchTargetPx();

/** M6's mobile gate, and §10's viewport. */
const GATE_VIEWPORT = { widthPx: 390, heightPx: 844 } as const;

/** The header measures 55 px in Chromium on this screen; it is content-sized, so the sweep runs
 *  either side of that rather than trusting one number a font change would falsify. */
const MEASURED_HEADER_PX = 55;
const HEADER_HEIGHTS_PX = [48, 55, 64, 72, 80, 96, 112, 128, 140];

/** Wave 6G's unconditional settings row, measured at 390 × 844. Swept as a parameter because it is
 *  not in this branch: 0 is this tree, 46.94 is the tree this merges into. */
const SETTINGS_ROW_HEIGHTS_PX = [0, 46.94];
const SETTINGS_ROW_PX = 46.94;

/** §9's sheet is pinned to the **viewport** at 78 dvh, not to the scene — which is the whole reason
 *  6G's row moved this band. `editor-panel.module.css` declares the fraction. */
const SHEET_FRACTION_OF_VIEWPORT = 0.78;

/** The reserve is a floor: the sentence wraps and the band grows upward. Swept to a third and fourth
 *  line, because an overlay that grows must still not reach what a selection can see. */
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

/**
 * The scene box's height, and it **does not take the band's height off**.
 *
 * That absence is the assertion this function embodies: the band is an overlay, so the canvas is the
 * same height with it and without it. If a later edit puts the band back in flow, this is where the
 * lie would have to be written.
 */
function sceneHeightFor(headerHeightPx: number, settingsRowPx: number): number {
  return (
    GATE_VIEWPORT.heightPx -
    headerHeightPx -
    PRICE_BAR_RESERVED_HEIGHT_PX -
    settingsRowPx
  );
}

/** §9's sheet's top edge in scene-box coordinates. Everything below it is behind the sheet the moment
 *  a body is selected, so everything **above** it is the whole of what a selection can see. */
function stripAboveTheSheetPx(
  headerHeightPx: number,
  settingsRowPx: number,
): number {
  const sheetTopInViewportPx =
    GATE_VIEWPORT.heightPx * (1 - SHEET_FRACTION_OF_VIEWPORT);
  return sheetTopInViewportPx - (headerHeightPx + settingsRowPx);
}

/** The counterfactual: the same strip if the band took flow height, which is what it did before 6G
 *  and what a later reader might "restore". */
function stripIfTheBandWereInFlowPx(
  headerHeightPx: number,
  settingsRowPx: number,
  bandHeightPx: number,
): number {
  return stripAboveTheSheetPx(headerHeightPx, settingsRowPx) - bandHeightPx;
}

/** The gap between the kitchen's lowest projected pixel and the bottom of the scene box — the room
 *  the band has before it starts painting over cabinets. */
function bottomClearancePx(
  headerHeightPx: number,
  settingsRowPx: number,
): number {
  const sceneHeightPx = sceneHeightFor(headerHeightPx, settingsRowPx);
  const lowest = Math.max(
    ...mountedBodies().map(
      (body) => projectVerticalExtent(body, sceneHeightPx).bottomPx,
    ),
  );
  return sceneHeightPx - lowest;
}

describe("the model reproduces the browser it stands in for", () => {
  it("mounts the whole seeded kitchen, so the sweeps below are not vacuous", () => {
    expect(mountedBodies().length).toBe(
      derivePlacementRecords(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG).length,
    );
  });

  it("gives the canvas heights and strips measured in Chromium at the shipped header", () => {
    // Without 6G's row and with it. If these drift, every number below is describing a screen that
    // does not exist.
    expect(sceneHeightFor(MEASURED_HEADER_PX, 0)).toBe(697);
    expect(sceneHeightFor(MEASURED_HEADER_PX, SETTINGS_ROW_PX)).toBeCloseTo(
      650.06,
      2,
    );
    expect(stripAboveTheSheetPx(MEASURED_HEADER_PX, 0)).toBeCloseTo(130.68, 2);
    expect(
      stripAboveTheSheetPx(MEASURED_HEADER_PX, SETTINGS_ROW_PX),
    ).toBeCloseTo(83.74, 2);
  });
});

describe("the band never covers the selected cabinet", () => {
  for (const settingsRowPx of SETTINGS_ROW_HEIGHTS_PX) {
    for (const headerHeightPx of HEADER_HEIGHTS_PX) {
      for (const bandHeightPx of BAND_HEIGHTS_PX) {
        it(`is nowhere near the strip a selection can see: header ${String(headerHeightPx)} px, settings row ${String(settingsRowPx)} px, band ${String(bandHeightPx)} px`, () => {
          // The direct form of M6's constraint, and it needs no argument about which cabinet is
          // selected: selecting one opens §9's sheet, the sheet covers everything below its own top
          // edge, and the band starts at the far side of the scene box from there.
          const sceneHeightPx = sceneHeightFor(headerHeightPx, settingsRowPx);
          const bandTopPx = sceneHeightPx - bandHeightPx;

          expect(bandTopPx).toBeGreaterThan(
            stripAboveTheSheetPx(headerHeightPx, settingsRowPx),
          );
        });
      }
    }
  }

  it("has hundreds of pixels of margin, not a hair", () => {
    // Recorded so a later reader can see how much room the placement has before the assertion above
    // starts mattering, rather than discovering it by breaking it.
    const sceneHeightPx = sceneHeightFor(MEASURED_HEADER_PX, SETTINGS_ROW_PX);
    const marginPx =
      sceneHeightPx -
      OVERFLOW_WARNING_RESERVED_HEIGHT_PX -
      stripAboveTheSheetPx(MEASURED_HEADER_PX, SETTINGS_ROW_PX);

    expect(Math.round(marginPx)).toBe(510);
  });
});

describe("the band's height is not a term in the strip's arithmetic", () => {
  for (const settingsRowPx of SETTINGS_ROW_HEIGHTS_PX) {
    it(`leaves the strip identical at every band height, with a ${String(settingsRowPx)} px settings row`, () => {
      // The whole point of the overlay. Not vacuous: the counterfactual below shows the same sweep
      // moving when the band is put back in flow.
      const strips = BAND_HEIGHTS_PX.map(() =>
        stripAboveTheSheetPx(MEASURED_HEADER_PX, settingsRowPx),
      );

      expect(new Set(strips).size).toBe(1);
    });
  }

  it("is the assertion a flow band actually fails, at the height this band ships at", () => {
    // Wave 6G's arithmetic, kept as a test so the reason for the overlay cannot quietly stop being
    // true. In flow the band comes straight out of the strip, and 6G's row plus this band takes the
    // strip under §10.1's touch target — at which point the sheet stops being dismissable by tapping
    // the scene, which is §10's viewing model.
    const inFlowPx = stripIfTheBandWereInFlowPx(
      MEASURED_HEADER_PX,
      SETTINGS_ROW_PX,
      OVERFLOW_WARNING_RESERVED_HEIGHT_PX,
    );

    expect(Math.round(inFlowPx * 100) / 100).toBe(27.74);
    expect(inFlowPx).toBeLessThan(TOUCH_TARGET_PX);
  });

  it("was survivable before 6G's row, which is why the first placement was defensible", () => {
    // The record that the earlier call was right on the tree it was measured against: without the
    // settings row a flow band left 74.68 px, comfortably above the touch target.
    const inFlowBeforeSettingsRowPx = stripIfTheBandWereInFlowPx(
      MEASURED_HEADER_PX,
      0,
      OVERFLOW_WARNING_RESERVED_HEIGHT_PX,
    );

    expect(Math.round(inFlowBeforeSettingsRowPx * 100) / 100).toBe(74.68);
    expect(inFlowBeforeSettingsRowPx).toBeGreaterThan(TOUCH_TARGET_PX);
  });
});

describe("what the band does paint over, with nothing selected", () => {
  it("stands on the lowest cabinets' plinth line, and the overlap is recorded rather than assumed", () => {
    // The cost of the overlay, as numbers a later reader can check. The band is 56 px and the
    // clearance below the kitchen is smaller than that at every header height, so it does overlap —
    // the question is by how much.
    const overlaps = HEADER_HEIGHTS_PX.map(
      (headerHeightPx) =>
        OVERFLOW_WARNING_RESERVED_HEIGHT_PX -
        bottomClearancePx(headerHeightPx, SETTINGS_ROW_PX),
    );

    expect(Math.round(Math.min(...overlaps))).toBe(7);
    expect(Math.round(Math.max(...overlaps))).toBe(14);
    for (const overlap of overlaps) expect(overlap).toBeGreaterThan(0);
  });

  it("reaches no further up than a quarter of the smallest body on screen", () => {
    // The line between "stands at the cabinets' feet" and "hides cabinets". If the band ever grows
    // past this, it is covering the kitchen rather than sitting under it and the placement needs
    // re-deciding rather than re-tuning.
    const sceneHeightPx = sceneHeightFor(MEASURED_HEADER_PX, SETTINGS_ROW_PX);
    const smallestBodyPx = Math.min(
      ...mountedBodies().map((body) => {
        const extent = projectVerticalExtent(body, sceneHeightPx);
        return extent.bottomPx - extent.topPx;
      }),
    );
    const overlapPx =
      OVERFLOW_WARNING_RESERVED_HEIGHT_PX -
      bottomClearancePx(MEASURED_HEADER_PX, SETTINGS_ROW_PX);

    expect(Math.round(overlapPx * 100) / 100).toBe(7.28);
    expect(Math.round(smallestBodyPx * 100) / 100).toBe(57.43);
    expect(overlapPx).toBeLessThan(smallestBodyPx / 4);
  });
});
