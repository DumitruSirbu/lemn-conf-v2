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
// **What this file got wrong, and what a capture measured instead** (wave 6S, owner-ruled).
//
// It used to assert that the band paints over **7–14 px** of the lowest cabinets' plinth. That
// number was a model artefact, not a screen. A visual capture of the real app at 390 × 844 —
// measured off the WebGL buffer with `preserveDrawingBuffer` on, so the pixels *behind* the band are
// readable — found **0 px of overlap in all three camera presets**, with 25.05 px (Perete A),
// 45.06 px (Perete B) and 49.06 px (Vedere generală) of clearance between the kitchen's lowest
// painted pixel and the band's top edge. No red-marked body reached below it either. The band stands
// on bare floor.
//
// Three separate errors put the model on the wrong side of zero, and all three are fixed here:
//
//   1. **Its lowest body was off-screen.** The clearance was driven by `p7`, the freestanding fridge,
//      whose projected x-range at 390 px wide is `[-199.35, -0.91]` — entirely past the left edge.
//      `onScreenBodies` now excludes it, and the lowest body that a customer can actually see is
//      `p4` at 532.59 px.
//   2. **It used the wrong canvas height.** `sceneHeightFor` took `PRICE_BAR_RESERVED_HEIGHT_PX`,
//      but the band only exists on an **overflowing** design — whose price bar carries ADR 0065's
//      flagged-total warning, which wraps at 390 px and makes the bar **125.6875** px. The canvas is
//      619.375, not 653.06. `getBoundingClientRect` confirms the trade exactly: the canvas loses
//      33.6875 px and the bar gains 33.6875.
//   3. **An AABB projects lower than the geometry it bounds** — about 18 px lower in the `overview`
//      preset. Nothing here can correct that, so this model is **conservative by construction**: its
//      clearance is a lower bound, and a zero-overlap result from it is stronger than the capture's.
//
// **This model stands in for the `overview` preset and no other.** The wall presets look nearly
// straight on, where a box's near-bottom corner projects up to ~80 px below the painted body — the
// model puts `p6` 617 px down a 619 px canvas in `wallA` while the capture measures 538. Their
// clearances are pinned by the capture above and deliberately not re-derived here — **including
// the tightest of the three, Perete A's 25.05 px**, so the binding case rests on a screenshot and
// nothing in this suite goes red if a future layout change eats it (accepted gap, owner-ruled;
// filed for pixel-based e2e coverage of the two wall presets).
//
// **The header height and 6G's settings row are swept, not assumed.** The header is content-sized;
// `.settingsRow` is not in this branch. The model below reproduces the Chromium measurements taken on
// the merged tree to 0.01 px — canvas height 697 and 653.06, strip 130.68 and 86.74, at the measured
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
 *  either side of that rather than trusting one number a font change would falsify.
 *
 *  **Re-measured on the merged tree and confirmed exactly** (wave 6S fix pass): `header`'s
 *  `getBoundingClientRect().height` is 55.0000 at 390 × 844 with 6G's row present. This number was
 *  never the stale one — see `SETTINGS_ROW_PX` below, which was. */
const MEASURED_HEADER_PX = 55;
const HEADER_HEIGHTS_PX = [48, 55, 64, 72, 80, 96, 112, 128, 140];

/** Wave 6G's unconditional settings row, measured at 390 × 844.
 *
 *  **It read 46.94 and that figure is retired here.** It was measured on 6G's own branch before the
 *  merge, at a time when this file's tree had no settings row at all — the comment said so: *"0 is
 *  this tree, 46.94 is the tree this merges into."* On the merged tree `.settingsRow` measures
 *  **43.9375**. Nothing about the row changed meaning; a pre-merge measurement was simply carried
 *  past its merge.
 *
 *  **This is the number that made the header look wrong.** The capture reports the canvas's own top
 *  at 98.9375, and 98.9375 − 46.94 is 51.9975 — which reads as a 3 px disagreement about the
 *  *header* and is not one. 55 + 43.9375 is 98.9375 exactly, and both halves are now measured
 *  rather than composed. `reproduces the browser` asserts that identity so the two cannot drift
 *  apart again silently. */
const SETTINGS_ROW_HEIGHTS_PX = [0, 43.9375];
const SETTINGS_ROW_PX = 43.9375;

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

/** **The price bar an overflowing design actually has**, measured in Chromium at 390 × 844.
 *  `PRICE_BAR_RESERVED_HEIGHT_PX` is the bar's floor and it is the wrong number for every assertion
 *  in this file that involves the band: the band and this taller bar are the *same* condition — a
 *  design with an overflowing body — so a canvas modelled with one and not the other is a screen
 *  that cannot exist. ADR 0065 decision 7b's flagged-total warning wraps at this width and adds
 *  exactly `FLAGGED_PRICE_BAR_GROWTH_PX`, which the canvas loses. */
const FLAGGED_PRICE_BAR_HEIGHT_PX = 125.6875;
const FLAGGED_PRICE_BAR_GROWTH_PX = 33.6875;

/** Everything above the canvas in the shipped tree, measured with `getBoundingClientRect` rather
 *  than composed from the header and settings-row sweep below — the capture reports the canvas's own
 *  `y`, which is the honest input for reproducing the one layout the screenshots are of. */
const MEASURED_CHROME_ABOVE_CANVAS_PX = 98.9375;
const MEASURED_FLAGGED_CANVAS_PX = 619.375;
const MEASURED_UNFLAGGED_CANVAS_PX = 653.0625;

/** **A floor, not the number.** The clearance between the kitchen's lowest visible pixel and the
 *  band's top edge moves with the camera preset — the capture measured 25.05, 45.06 and 49.06 px —
 *  and this model only stands in for `overview`, where it reports 30.79. Pinning an exact figure
 *  would turn a camera nudge into a failure that says nothing; pinning zero would stop detecting the
 *  thing the file exists for. */
const BAND_CLEARANCE_FLOOR_PX = 20;

/** The floor on how far the kitchen stands clear of the **scene box's** bottom edge, over the whole
 *  header, settings-row and price-bar sweep. Lower than the clearance above, because it is the one
 *  claim that survives every layout in the sweep: at the tallest headers the fridge's bounding box
 *  swings back into frame as the canvas shortens and the aspect widens, and it is that box — not the
 *  fridge — that comes within 41 px of the bottom. The measured minimum is 40.05. */
const CANVAS_BOTTOM_CLEARANCE_FLOOR_PX = 35;

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
    room: KITCHEN_L_DESIGN.room,
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
  readonly leftPx: number;
  readonly rightPx: number;
  readonly topPx: number;
  readonly bottomPx: number;
}

/** The body's world box projected to the scene canvas, in scene-box coordinates.
 *
 *  **Horizontal as well as vertical, since wave 6S.** A body off the side of the canvas still has a
 *  projected `bottomPx`, and taking it was error 1: the clearance was driven by a fridge nobody can
 *  see. Nothing may read a `bottomPx` without first asking whether that body is on the screen. */
function projectScreenRect(
  body: THREE.Object3D,
  sceneHeightPx: number,
): ScreenRect {
  const camera = cameraFor(sceneHeightPx);
  const box = new THREE.Box3().setFromObject(body);
  let leftPx = Number.POSITIVE_INFINITY;
  let rightPx = Number.NEGATIVE_INFINITY;
  let topPx = Number.POSITIVE_INFINITY;
  let bottomPx = Number.NEGATIVE_INFINITY;

  for (const corner of cornersOf(box)) {
    const projected = corner.clone().project(camera);
    leftPx = Math.min(leftPx, ((projected.x + 1) / 2) * GATE_VIEWPORT.widthPx);
    rightPx = Math.max(
      rightPx,
      ((projected.x + 1) / 2) * GATE_VIEWPORT.widthPx,
    );
    const y = ((1 - projected.y) / 2) * sceneHeightPx;
    topPx = Math.min(topPx, y);
    bottomPx = Math.max(bottomPx, y);
  }
  return { leftPx, rightPx, topPx, bottomPx };
}

/** Every mounted body whose projection reaches the canvas horizontally — the only ones a customer
 *  can see, and therefore the only ones the band can paint over. */
function onScreenRects(sceneHeightPx: number): ScreenRect[] {
  return mountedBodies()
    .map((body) => projectScreenRect(body, sceneHeightPx))
    .filter((rect) => rect.rightPx > 0 && rect.leftPx < GATE_VIEWPORT.widthPx);
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
function sceneHeightFor(
  headerHeightPx: number,
  settingsRowPx: number,
  priceBarHeightPx: number,
): number {
  return (
    GATE_VIEWPORT.heightPx - headerHeightPx - priceBarHeightPx - settingsRowPx
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
function bottomClearancePx(sceneHeightPx: number): number {
  const lowest = Math.max(
    ...onScreenRects(sceneHeightPx).map((rect) => rect.bottomPx),
  );
  return sceneHeightPx - lowest;
}

/** The scene box on the screen the capture is of: an overflowing design, so a flagged price bar. */
function flaggedSceneHeightPx(): number {
  return (
    GATE_VIEWPORT.heightPx -
    MEASURED_CHROME_ABOVE_CANVAS_PX -
    FLAGGED_PRICE_BAR_HEIGHT_PX
  );
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
    expect(
      sceneHeightFor(MEASURED_HEADER_PX, 0, PRICE_BAR_RESERVED_HEIGHT_PX),
    ).toBe(697);
    expect(
      sceneHeightFor(
        MEASURED_HEADER_PX,
        SETTINGS_ROW_PX,
        PRICE_BAR_RESERVED_HEIGHT_PX,
      ),
    ).toBeCloseTo(653.0625, 4);
    expect(stripAboveTheSheetPx(MEASURED_HEADER_PX, 0)).toBeCloseTo(130.68, 2);
    expect(
      stripAboveTheSheetPx(MEASURED_HEADER_PX, SETTINGS_ROW_PX),
    ).toBeCloseTo(86.74, 2);
  });

  // **The two halves of the chrome, and the identity that keeps them honest.** Each is measured on
  // the merged tree — `header` 55.0000, `.settingsRow` 43.9375 — and the capture reports their sum
  // as the canvas's own top. Composing a total from a stale half is what produced a 3 px
  // disagreement about the header that was never a disagreement about the header.
  it("composes the measured chrome from two measured halves", () => {
    expect(MEASURED_HEADER_PX + SETTINGS_ROW_PX).toBeCloseTo(
      MEASURED_CHROME_ABOVE_CANVAS_PX,
      4,
    );
  });

  // Error 2. The two canvas heights are both real and they belong to different designs: the reserved
  // bar is what an unflagged kitchen gets, and the band is never on that screen. Taken from the
  // capture's own `getBoundingClientRect`, which is why the chrome above the canvas is one measured
  // number here rather than a header plus a settings row.
  it("gives the shorter canvas an overflowing design actually has", () => {
    expect(
      sceneHeightFor(
        MEASURED_CHROME_ABOVE_CANVAS_PX,
        0,
        PRICE_BAR_RESERVED_HEIGHT_PX,
      ),
    ).toBeCloseTo(MEASURED_UNFLAGGED_CANVAS_PX, 4);
    expect(flaggedSceneHeightPx()).toBeCloseTo(MEASURED_FLAGGED_CANVAS_PX, 4);

    // The trade, asserted as one: every pixel the bar gains is a pixel the canvas loses. A model
    // that grew the bar without shrinking the canvas would put the band somewhere it never is.
    expect(
      MEASURED_UNFLAGGED_CANVAS_PX - MEASURED_FLAGGED_CANVAS_PX,
    ).toBeCloseTo(FLAGGED_PRICE_BAR_GROWTH_PX, 4);
    expect(
      FLAGGED_PRICE_BAR_HEIGHT_PX - PRICE_BAR_RESERVED_HEIGHT_PX,
    ).toBeCloseTo(FLAGGED_PRICE_BAR_GROWTH_PX, 4);
  });

  // Error 1, pinned from the failing side. `p7` is the number the old overlap assertion was made of,
  // and it is entirely past the left edge of a 390 px viewport.
  it("excludes the bodies that do not reach the canvas, and names the one that drove the old figure", () => {
    const sceneHeightPx = flaggedSceneHeightPx();
    const all = mountedBodies().map((body) =>
      projectScreenRect(body, sceneHeightPx),
    );
    const onScreen = onScreenRects(sceneHeightPx);
    const freestandingFridge = mountedBodies().find(
      (body) => body.userData.placementId === "p7",
    );
    if (!freestandingFridge) throw new Error("p7 is not mounted");
    const fridge = projectScreenRect(freestandingFridge, sceneHeightPx);

    expect(fridge.rightPx).toBeLessThan(0);
    expect(Math.round(fridge.leftPx)).toBe(-199);
    // The lowest projection in the whole scene is that fridge, and the lowest one a customer can see
    // is 40 px higher. That gap is the whole of the difference between 9.58 px of "overlap" and none.
    expect(Math.round(Math.max(...all.map((rect) => rect.bottomPx)))).toBe(
      Math.round(fridge.bottomPx),
    );
    expect(Math.max(...onScreen.map((rect) => rect.bottomPx))).toBeCloseTo(
      532.59,
      2,
    );
    expect(all.length - onScreen.length).toBe(4);
    // Not vacuous in the other direction: most of the kitchen is on screen.
    expect(onScreen.length).toBe(22);
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
          const sceneHeightPx = sceneHeightFor(
            headerHeightPx,
            settingsRowPx,
            FLAGGED_PRICE_BAR_HEIGHT_PX,
          );
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
    // Over the flagged bar, because that is the only bar a screen with a band on it has. It was 510
    // against the reserved bar, which is 33.69 px of canvas the band never gets.
    const sceneHeightPx = sceneHeightFor(
      MEASURED_HEADER_PX,
      SETTINGS_ROW_PX,
      FLAGGED_PRICE_BAR_HEIGHT_PX,
    );
    const marginPx =
      sceneHeightPx -
      OVERFLOW_WARNING_RESERVED_HEIGHT_PX -
      stripAboveTheSheetPx(MEASURED_HEADER_PX, SETTINGS_ROW_PX);

    expect(Math.round(marginPx)).toBe(477);
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

    expect(Math.round(inFlowPx * 100) / 100).toBe(30.74);
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
  // **Nothing, and that is the correction wave 6S carries.** This file used to assert 7–14 px of
  // overlap on the lowest cabinets' plinth. A capture of the real app measured **0 px in all three
  // camera presets** — the band stands on bare floor, with 25.05 px (Perete A), 45.06 px (Perete B)
  // and 49.06 px (Vedere generală) of clearance to the kitchen's lowest painted pixel, and no
  // red-marked body below it either. The old figure came from three errors in this model, all of
  // them listed at the head of this file and two of them fixed above: an off-screen fridge driving
  // the clearance, and a canvas height that ignored the flagged price bar an overflowing design
  // always has. The third — a bounding box projects about 18 px below the geometry it bounds — is
  // uncorrectable here and leaves every number below a **lower bound**.
  //
  // The overlap concept is kept rather than dropped: what is asserted is that it is zero, and the
  // clearance that makes it zero is the measured quantity.
  // **What the margin actually is, and it is not 30.79 px.** The clearance is real; what is thin is
  // this test's ability to *state* it. `p7`'s bounding box clears the left edge of a 390 px viewport
  // by **0.91 px** at the shipped canvas of 619.375, and at 616.4831 it crosses — 2.89 px of canvas,
  // which is 2.89 px of the chrome above it. Past that line the box is admitted, becomes the lowest
  // "visible" body, and this model reports about −10 px of clearance where the screen still shows
  // none of it.
  //
  // So a future reader must not read a red here as a layout regression. The band's clearance is
  // 25–49 px on a real capture; a bounding box is not a silhouette, and this model is pessimistic by
  // ~18 px on the vertical axis while carrying 0.91 px of margin on the horizontal one. **If this
  // goes red after a few pixels of chrome move, the model is what needs fixing, not the layout.** A
  // silhouette-projecting model removes this and the wall-preset gap together, and is filed as its
  // own work rather than tuned around here.
  it("stands clear of the lowest cabinet a customer can see, rather than on its plinth", () => {
    const sceneHeightPx = flaggedSceneHeightPx();
    const clearanceAboveBandPx =
      bottomClearancePx(sceneHeightPx) - OVERFLOW_WARNING_RESERVED_HEIGHT_PX;

    // Zero overlap, said as the inequality rather than left to be read off the floor below.
    expect(
      OVERFLOW_WARNING_RESERVED_HEIGHT_PX - bottomClearancePx(sceneHeightPx),
    ).toBeLessThanOrEqual(0);
    // A floor, not the number: it moves with the camera preset, and this model is only the
    // `overview` one. It reports 30.79 px here against the capture's 49.06 for the same preset,
    // which is the ~18 px of bounding-box conservatism arriving where it should — on the safe side.
    expect(clearanceAboveBandPx).toBeGreaterThan(BAND_CLEARANCE_FLOOR_PX);
  });

  it("keeps the kitchen off the bottom of the scene box at every header height", () => {
    // The sweep-wide claim, and deliberately the weaker one. The clearance *above the band* does not
    // survive the whole sweep: at the tallest headers the canvas shortens, the aspect widens, and the
    // fridge's bounding box swings back into frame within 40 px of the bottom — inside the 18 px this
    // model is known to be pessimistic by, and at a header far taller than the 55 px the screen
    // measures. What does survive every layout is that the kitchen never reaches the scene box's own
    // bottom edge, which is what makes a bottom-pinned overlay viable at all.
    const clearances = SETTINGS_ROW_HEIGHTS_PX.flatMap((settingsRowPx) =>
      [PRICE_BAR_RESERVED_HEIGHT_PX, FLAGGED_PRICE_BAR_HEIGHT_PX].flatMap(
        (priceBarHeightPx) =>
          HEADER_HEIGHTS_PX.map((headerHeightPx) =>
            bottomClearancePx(
              sceneHeightFor(headerHeightPx, settingsRowPx, priceBarHeightPx),
            ),
          ),
      ),
    );

    expect(clearances.length).toBe(
      SETTINGS_ROW_HEIGHTS_PX.length * 2 * HEADER_HEIGHTS_PX.length,
    );
    expect(Math.min(...clearances)).toBeGreaterThan(
      CANVAS_BOTTOM_CLEARANCE_FLOOR_PX,
    );
  });

  it("is shorter than the smallest body on screen, so it could not hide one even if it reached", () => {
    // The scale the clearance above is read against, kept from the earlier version of this file: if
    // the band ever did reach the kitchen, this is the size of what it would be reaching into.
    const sceneHeightPx = flaggedSceneHeightPx();
    const smallestBodyPx = Math.min(
      ...onScreenRects(sceneHeightPx).map((rect) => rect.bottomPx - rect.topPx),
    );

    expect(Math.round(smallestBodyPx * 100) / 100).toBe(54.72);
    expect(bottomClearancePx(sceneHeightPx)).toBeGreaterThan(
      OVERFLOW_WARNING_RESERVED_HEIGHT_PX,
    );
  });
});
