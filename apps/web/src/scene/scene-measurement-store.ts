"use client";

import * as THREE from "three";
import { create } from "zustand";

import { isSelectionDebugEnabled } from "@/app/configurator/configure/selection-debug-availability";

/**
 * What the running scene measured, for `SelectionDebug` to publish and the e2e suite to read. §11 row 21 (every
 * 2.20-2.60 m wall cabinet projects at least a tap target at 390 x 844) cannot be answered from outside the canvas or
 * from screenshot pixels, so this publishes observations, never conclusions: the camera's own two matrices after the
 * ease has landed (not anything `cameraPresetsForRoom` returns, which would check that function against itself) and
 * each mounted body's world bounds (not "the ceiling row": choosing it is the assertion's business). The projection
 * arithmetic, band and tap target stay in the spec. The store is separate from `store/configurator-store.ts` because
 * the camera is not part of the design; `SelectionDebug` is the only reader.
 */
export interface SceneBodyBounds {
  readonly placementId: string;
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface SceneMeasurement {
  /**
   * Increments once each time the camera's ease lands. A counter, not a boolean: the scene is already settled
   * when a preset button is tapped, so a spec waiting for `settled === true` would accept the frame before the
   * move. Recording the count before the tap and waiting for a larger one is immune to that and to a slow
   * runner (`CAMERA_EASE_SECONDS` is 0.7 s).
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
 * Off unless the build opted in, as `SelectionDebug` is, and read as the literal member expression Next
 * substitutes at build time: handing `process.env` over whole defeats the substitution
 * (`selection-debug-availability.ts`). The gate is here so a disabled build pays one function call rather than a
 * walk over every body's geometry on each camera settle.
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
