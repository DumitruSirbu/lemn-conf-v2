// The scene at 390 × 844, measured against its own projected bounds — the real kit, the real
// bodies, the real camera preset the screen mounts with.
//
// **What this file is not, stated first because it read as the opposite and was wrong.** The sweep
// below does **not** gate the overlap constraint. A perspective camera's vertical field of view does
// not depend on the aspect ratio, so a body's projected bottom is `normalised · sceneHeight +
// sceneTop` while the bar's top edge is `sceneTop + sceneHeight`: the bar's height and the header's
// appear on both sides and cancel, and the assertion reduces to `normalised ≤ 1`. Adversarial QA
// proved it by swapping the swept bar heights for `[92, 600, 700]` — a 700 px bar leaving 80 px of
// scene — and watching every assertion stay green. What the sweep really asserts is that the
// `overview` preset **frames** the kitchen at any aspect the chrome leaves, which is worth keeping
// and is named for what it is below.
//
// **The overlap constraint is carried by two things, neither of them that sweep:**
//
// - `price-bar-layout.test.ts` holds the stylesheet to laying the bar out *beside* the scene rather
//   than over it. That is the whole of "it cannot overlap": a flow sibling has nothing to overlap.
// - The counterfactual at the end of this file, which is sensitive — setting the reserve to zero
//   turns it red — and shows that an overlaid bar of the shipped height would cover real cabinets.
//
// **And the constraint a bar can still break while laid out correctly is the scene it leaves.** A
// bar tall enough shrinks the scene until the cabinets in it are too small to tap, which is a real
// failure with a real precedent — `stage.ts` records a row that "projected to about 37 px in a
// 540 px viewport and became unclickable". That is what the touch-target gate below asserts, and it
// is the assertion in this file that actually varies with the bar's height.
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

import { createHeadlessCanvas } from "../support/headless-canvas";

/** §10.1's touch sizing, read from the stylesheet that declares it rather than repeated here — a
 *  second copy of the number is how the gate and the product drift apart. */
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

/** The screen's header is content-sized, so the gate is swept across every height it plausibly
 *  takes rather than pinned to one measurement that a font change would falsify. */
const HEADER_HEIGHTS_PX = [48, 64, 80, 96, 112, 128, 140];

/** The bar's reserve is a floor: ADR 0065's flagged-total warning wraps and the bar grows. Swept up
 *  to a three-line warning, because growing must only ever shrink the scene further. */
const BAR_HEIGHTS_PX = [
  PRICE_BAR_RESERVED_HEIGHT_PX,
  PRICE_BAR_RESERVED_HEIGHT_PX + 24,
  PRICE_BAR_RESERVED_HEIGHT_PX + 48,
];

const CAMERA_NEAR_M = 0.01;
const CAMERA_FAR_M = 500;

interface ScreenRect {
  readonly topPx: number;
  readonly bottomPx: number;
}

const solidsRoot = new THREE.Group();

beforeAll(() => {
  const kit = makeKit({
    cabinetDepthMm: WORKTOP_DEPTH_MM,
    createCanvas: createHeadlessCanvas,
  });
  solidsRoot.add(buildKitchenShell(kit, KITCHEN_L_DESIGN.room));
  syncSolidBodies({
    kit,
    solidsRoot,
    records: derivePlacementRecords(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG),
    room: KITCHEN_L_DESIGN.room,
  });
});

/** Every mounted body, by the placement id picking climbs to — so "the selected body" below is any
 *  body a customer can actually select. The shell's own children carry none and are skipped. */
function mountedBodies(): THREE.Object3D[] {
  return solidsRoot.children.filter(
    (child) => placementIdOf(child) !== undefined,
  );
}

function placementIdOf(body: THREE.Object3D): string | undefined {
  return body.userData.placementId as string | undefined;
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

/** The body's world box projected to the scene canvas, in page coordinates — the vertical extent is
 *  all this gate is about, since the bar spans the full width of the screen. */
function projectVerticalExtent(
  body: THREE.Object3D,
  scene: { readonly topPx: number; readonly heightPx: number },
): ScreenRect {
  const camera = cameraFor(scene.heightPx);
  const box = new THREE.Box3().setFromObject(body);
  let topPx = Number.POSITIVE_INFINITY;
  let bottomPx = Number.NEGATIVE_INFINITY;

  for (const corner of cornersOf(box)) {
    const projected = corner.clone().project(camera);
    const y = ((1 - projected.y) / 2) * scene.heightPx + scene.topPx;
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

/** The scene box a given chrome leaves, which is the whole of the flow layout in two numbers. */
function sceneBoxFor(headerHeightPx: number, barHeightPx: number) {
  const barTopPx = GATE_VIEWPORT.heightPx - barHeightPx;
  return {
    topPx: headerHeightPx,
    heightPx: barTopPx - headerHeightPx,
    barTopPx,
  };
}

function projectedHeightsPx(scene: {
  readonly topPx: number;
  readonly heightPx: number;
}): number[] {
  return mountedBodies().map((body) => {
    const extent = projectVerticalExtent(body, scene);
    return extent.bottomPx - extent.topPx;
  });
}

describe("the overview preset frames every body, whatever chrome the screen carries", () => {
  it("mounts the whole seeded kitchen, so the sweep below is not vacuous", () => {
    expect(mountedBodies().length).toBe(
      derivePlacementRecords(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG).length,
    );
  });

  for (const headerHeightPx of HEADER_HEIGHTS_PX) {
    for (const barHeightPx of BAR_HEIGHTS_PX) {
      it(`frames every body with a ${String(headerHeightPx)} px header and a ${String(barHeightPx)} px bar`, () => {
        // Aspect-invariant, per the head comment: this holds for any chrome, which is exactly why
        // it is a **framing** assertion and not the overlap gate. It still earns its place — the
        // preset is required to frame floor to ceiling (`stage.ts`), and a preset or a fixture that
        // moved would land here. It holds at `overview` only; `wallA` and `wallB` frame one wall
        // each and project the rest outside the box, which is clipping and not overlap.
        const scene = sceneBoxFor(headerHeightPx, barHeightPx);

        for (const body of mountedBodies()) {
          const extent = projectVerticalExtent(body, scene);
          expect(
            extent.bottomPx,
            `${String(placementIdOf(body))} is framed below the scene`,
          ).toBeLessThanOrEqual(scene.barTopPx);
          expect(extent.topPx).toBeGreaterThanOrEqual(scene.topPx);
        }
      });
    }
  }

  it("would cover real cabinets if the bar were laid over the scene instead of beside it", () => {
    // The counterfactual the flow layout exists to avoid, and the reason the assertions above are
    // not tautological: with the scene given the full height below the header — a bar positioned
    // over it rather than under it — bodies project into exactly the band the bar occupies.
    const headerHeightPx = 64;
    const barTopPx = GATE_VIEWPORT.heightPx - PRICE_BAR_RESERVED_HEIGHT_PX;
    const overlaidScene = {
      topPx: headerHeightPx,
      heightPx: GATE_VIEWPORT.heightPx - headerHeightPx,
    };

    const covered = mountedBodies().filter(
      (body) => projectVerticalExtent(body, overlaidScene).bottomPx > barTopPx,
    );
    expect(covered.length).toBeGreaterThan(0);
  });
});

// **The gate that varies with the bar's height**, and the one the sweep above turned out not to be.
describe("the bar's reserve leaves a scene the customer can still work in", () => {
  for (const headerHeightPx of HEADER_HEIGHTS_PX) {
    for (const barHeightPx of BAR_HEIGHTS_PX) {
      it(`keeps every body tappable with a ${String(headerHeightPx)} px header and a ${String(barHeightPx)} px bar`, () => {
        // A bar laid out correctly can still defeat the scene by taking it: the cabinets shrink with
        // the viewport and stop being tappable long before they stop being visible. §10.1 sizes a
        // touch target at `--touch-target`, and `stage.ts` records the 37 px row that "became
        // unclickable" — so the smallest body the scene shows is held to that number.
        const scene = sceneBoxFor(headerHeightPx, barHeightPx);
        const smallestBodyPx = Math.min(...projectedHeightsPx(scene));

        expect(smallestBodyPx).toBeGreaterThanOrEqual(TOUCH_TARGET_PX);
      });
    }
  }

  it("is an assertion a taller bar actually fails", () => {
    // The sensitivity check, written because the sweep above looked equally strong and was not.
    // A 700 px bar leaves 80 px of scene, exactly QA's mutant, and the smallest body projects to a
    // few pixels. If this ever passes, the gate above has stopped measuring the bar.
    const smallestUnderATallBarPx = Math.min(
      ...projectedHeightsPx(sceneBoxFor(64, 700)),
    );

    expect(smallestUnderATallBarPx).toBeLessThan(TOUCH_TARGET_PX);
  });

  it("has margin at the shipped reserve rather than sitting on the threshold", () => {
    // Recorded as a number so a later reader can see how much room the reserve has before the gate
    // above starts failing, rather than discovering it by breaking it.
    const smallestShippedPx = Math.min(
      ...projectedHeightsPx(sceneBoxFor(55, PRICE_BAR_RESERVED_HEIGHT_PX)),
    );

    expect(smallestShippedPx).toBeGreaterThan(TOUCH_TARGET_PX);
  });
});
