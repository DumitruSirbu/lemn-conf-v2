// Which wall a mounted object belongs to, written where the object is built and read by the
// cutaway (`cutaway.ts`). A leaf, so the four builders that stamp it and the module that reads it
// share one key without importing each other.
import { wallsOf, type DesignWall } from "@lemnaria/configurator-domain";
import type * as THREE from "three";

const WALL_KEY = "wall";

/** A U carries every wall there is, so its walls are the whole set a tag may legally name. */
const KNOWN_WALLS: readonly unknown[] = wallsOf("U");

/** `userData` is `any`: a value read back from it is a wall only if it names one. */
export function isDesignWall(value: unknown): value is DesignWall {
  return KNOWN_WALLS.includes(value);
}

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
  const tagged: unknown = object.userData[WALL_KEY];
  return isDesignWall(tagged) ? tagged : undefined;
}
