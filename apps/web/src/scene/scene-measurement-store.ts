"use client";

import * as THREE from "three";
import { create } from "zustand";

import { isSelectionDebugEnabled } from "@/app/configurator/configure/selection-debug-availability";

/**
 * **What the running scene measured, for `SelectionDebug` to publish and the e2e suite to read.**
 *
 * M7 wave 7H criterion 11 asks a browser to prove §11 row 21: the 2.20–2.60 m row of every wall
 * cabinet projects at least a tap target at 390 × 844. That is unanswerable from outside the canvas
 * — Playwright cannot query WebGL — and it may not be answered from **screenshot pixels** either,
 * which is what the criterion's *must not* rules out.
 *
 * **So this publishes observations, never conclusions**, and the distinction is the whole design:
 *
 * - The **camera's own two matrices**, as the renderer holds them after the ease has landed. Not
 *   the preset, and not anything `cameraPresetsForRoom` returns — the *result* of that function
 *   having been applied and eased to. A spec that projected through a camera the production framing
 *   function had just handed it would be checking that function against itself.
 * - Each mounted body's **world-space bounds**, for every body carrying a `placementId`. Not "the
 *   ceiling row": which bodies are in that row is the assertion's own business, and a readout that
 *   pre-selected them would decide the thing being measured.
 *
 * The projection arithmetic, the choice of band, and the tap target all stay in the spec. Nothing
 * here computes a pixel.
 *
 * **A store of its own, beside `camera-preset-store.ts`, for that file's own reason**: the camera is
 * not part of the design, so none of this may go near `store/configurator-store.ts`. It is also not
 * state any customer surface renders from — `SelectionDebug` is the only reader, and it is off
 * unless the flag is on.
 */
export interface SceneBodyBounds {
  readonly placementId: string;
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface SceneMeasurement {
  /**
   * Increments once each time the camera's ease lands.
   *
   * **A counter rather than a boolean, and that is not a detail.** A spec that waited for
   * `settled === true` would race: the scene is *already* settled when a preset button is tapped,
   * so the flag it is waiting for is the one it must not accept. Recording the count before the tap
   * and waiting for a larger one is immune to that, and immune to a runner slow enough that the
   * ease has not begun when the wait starts. `CAMERA_EASE_SECONDS` is 0.7 s and the runner is
   * slower than a laptop.
   */
  readonly settleCount: number;
  /** `camera.projectionMatrix.elements`, column-major, as three.js holds them. */
  readonly projection: readonly number[];
  /** `camera.matrixWorldInverse.elements` — the view matrix, same order. */
  readonly view: readonly number[];
  readonly bodies: readonly SceneBodyBounds[];
}

interface SceneMeasurementState {
  readonly measurement: SceneMeasurement | null;
}

export const useSceneMeasurement = create<SceneMeasurementState>(() => ({
  measurement: null,
}));

/**
 * **Off unless the build opted in**, exactly as `SelectionDebug` itself is, and read as the literal
 * member expression Next substitutes at build time — handing `process.env` over whole defeats the
 * substitution and reaches for a `process` the browser does not have
 * (`selection-debug-availability.ts`).
 *
 * The gate is here rather than at the call site so that a disabled build pays one function call
 * rather than a walk over every mounted body's geometry on every camera settle.
 */
const IS_PUBLISHED = isSelectionDebugEnabled(
  process.env.NEXT_PUBLIC_LEMNARIA_ENABLE_SELECTION_DEBUG,
);

export interface SceneMeasurementInput {
  readonly camera: THREE.Camera;
  /** The `solids` group: the shell plus every mounted body. */
  readonly solidsRoot: THREE.Object3D;
}

/** Records what the scene looks like now. Called from the frame loop at the moment the camera's
 *  ease lands, which is the only moment at which a projection is worth measuring. */
export function publishSceneMeasurement(input: SceneMeasurementInput): void {
  if (!IS_PUBLISHED) return;

  const { camera, solidsRoot } = input;
  camera.updateMatrixWorld();
  solidsRoot.updateWorldMatrix(true, true);

  useSceneMeasurement.setState((state) => ({
    measurement: {
      settleCount: (state.measurement?.settleCount ?? 0) + 1,
      projection: [...camera.projectionMatrix.elements],
      view: [...camera.matrixWorldInverse.elements],
      bodies: boundsOfMountedBodies(solidsRoot),
    },
  }));
}

/** Every body `syncSolidBodies` mounted, by the tag it mounts them with — never by name or by
 *  position in the children array. The shell carries no `placementId` and so is absent. */
function boundsOfMountedBodies(
  solidsRoot: THREE.Object3D,
): readonly SceneBodyBounds[] {
  const bounds: SceneBodyBounds[] = [];
  for (const child of solidsRoot.children) {
    const placementId: unknown = child.userData.placementId;
    if (typeof placementId !== "string") continue;
    const box = new THREE.Box3().setFromObject(child);
    if (box.isEmpty()) continue;
    bounds.push({
      placementId,
      min: [box.min.x, box.min.y, box.min.z],
      max: [box.max.x, box.max.y, box.max.z],
    });
  }
  return bounds;
}
