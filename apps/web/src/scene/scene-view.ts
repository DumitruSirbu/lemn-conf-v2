import type { DesignRoom } from "@lemnaria/configurator-domain";
import {
  findCameraPresetForRoom,
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

/** **A preset is a function of the room**, so this takes one (wave 7H criterion 9). A *fixed* view
 *  is the fidelity capture's own two vectors and the room reaches it nowhere — that is the whole
 *  point of the kind, which must land on exactly the numbers it was given. */
export function resolveSceneView(
  view: SceneView,
  room: DesignRoom,
): ResolvedView {
  if (view.kind === "preset") {
    const preset = findCameraPresetForRoom(view.id, room);
    return {
      position: preset.position,
      target: preset.target,
      isImmediate: false,
    };
  }
  return { position: view.position, target: view.target, isImmediate: true };
}

/** Stable identity for a view, so a re-render with an equivalent object does not restart the ease.
 *
 *  **It is the resolved vectors, not the preset's id**, so a customer standing on *Perete A* who
 *  corrects a wall length eases to where *Perete A* now is rather than staying framed on the room
 *  they no longer have. */
export function sceneViewKey(view: SceneView, room: DesignRoom): string {
  const resolved = resolveSceneView(view, room);
  return `${view.kind}:${resolved.position.join(",")}|${resolved.target.join(",")}`;
}
