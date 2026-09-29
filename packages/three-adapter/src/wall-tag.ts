// Which wall a mounted object belongs to, written where the object is built and read by the
// cutaway (`cutaway.ts`). A leaf, so the four builders that stamp it and the module that reads it
// share one key without importing each other.
import type { DesignWall } from "@lemnaria/configurator-domain";
import type * as THREE from "three";

const WALL_KEY = "wall";

export function tagWall(object: THREE.Object3D, wall: DesignWall): void {
  object.userData[WALL_KEY] = wall;
}

/** An overlay (selection outline, overflow mark) belongs to the wall of the body it traces. */
export function inheritWallTag(
  overlay: THREE.Object3D,
  target: THREE.Object3D,
): void {
  const wall = wallOf(target);
  if (wall !== undefined) tagWall(overlay, wall);
}

/** `undefined` for an object that stands on no wall: the room shell, a body mounted by a caller
 *  that never tagged it. The cutaway leaves those exactly as they are. */
export function wallOf(object: THREE.Object3D): DesignWall | undefined {
  return object.userData[WALL_KEY] as DesignWall | undefined;
}
