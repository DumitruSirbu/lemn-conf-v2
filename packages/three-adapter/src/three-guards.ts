import * as THREE from "three";

/** `instanceof` narrowed to the default `Mesh` shape, so callers get concrete geometry/material
 *  types instead of the `any`-parameterised one three.js's own class declaration exposes. */
export function isMesh(object: THREE.Object3D): object is THREE.Mesh {
  return object instanceof THREE.Mesh;
}

/** Same reason as `isMesh`: three.js declares `Line` with `any`-parameterised geometry and
 *  material, so a bare `instanceof` narrows to nothing useful. A void's dashed outline is a
 *  `LineSegments`, and unlike a body's meshes it owns its geometry and material outright. */
export function isLine(object: THREE.Object3D): object is THREE.Line {
  return object instanceof THREE.Line;
}

/** Disposes every geometry in a tree **except** the ones a shared registry owns.
 *
 *  Tearing a three.js body down is not "dispose everything you find". Two kinds of thing in a
 *  built body are shared with the bodies that are staying: `kit.M`'s materials (never disposed
 *  here at all) and the `ExtrudeGeometry` instances `chamferBox` memoises by size, which two
 *  cabinets of the same size render from together. Disposing one of those deletes a survivor's GPU
 *  buffers; three.js keeps the CPU-side attributes, so the survivor silently re-uploads on the next
 *  frame instead of vanishing, which is why the bug is invisible to a dispose-*count* assertion.
 *
 *  The predicate is passed in rather than a `Kit` taken: it keeps this module free of a cycle back
 *  to `kitchen-parts.ts`, and it says the rule in its own terms — callers pass `kit.ownsGeometry`. */
export function disposeUnsharedGeometries(
  object: THREE.Object3D,
  isSharedGeometry: (geometry: THREE.BufferGeometry) => boolean,
): void {
  object.traverse((node) => {
    if (isMesh(node) && !isSharedGeometry(node.geometry))
      node.geometry.dispose();
  });
}

export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("Cannot bake a procedural texture: no 2D canvas context");
  return context;
}
