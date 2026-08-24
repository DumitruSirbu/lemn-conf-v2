import {
  findCameraPreset,
  type CameraPresetId,
  type Vector3Tuple,
} from "@lemnaria/three-adapter";

/** Where the camera should be. A preset eases in so switching never reads as a scene reload; a
 *  fixed view snaps, because the fidelity capture must land on the exact numbers it was given. */
export type SceneView =
  | { readonly kind: "preset"; readonly id: CameraPresetId }
  | {
      readonly kind: "fixed";
      readonly position: Vector3Tuple;
      readonly target: Vector3Tuple;
    };

export interface ResolvedView {
  readonly position: Vector3Tuple;
  readonly target: Vector3Tuple;
  readonly isImmediate: boolean;
}

export function resolveSceneView(view: SceneView): ResolvedView {
  if (view.kind === "preset") {
    const preset = findCameraPreset(view.id);
    return {
      position: preset.position,
      target: preset.target,
      isImmediate: false,
    };
  }
  return { position: view.position, target: view.target, isImmediate: true };
}

/** Stable identity for a view, so a re-render with an equivalent object does not restart the ease. */
export function sceneViewKey(view: SceneView): string {
  const resolved = resolveSceneView(view);
  return `${view.kind}:${resolved.position.join(",")}|${resolved.target.join(",")}`;
}
