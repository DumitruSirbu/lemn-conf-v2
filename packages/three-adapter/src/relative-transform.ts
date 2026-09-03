// One object's world transform, expressed in another object's local space.
//
// A module of its own because it is about neither of the two things that need it. A selection
// outline and an overflow mark are both mounted on the **room** rather than on the body they cover —
// so that they inherit the room's seating transform while staying outside the two subtrees §6.1's
// picking raycasts — and each therefore has to place itself relative to that parent instead of
// copying the body's own matrix. Anything else mounted beside a body rather than inside it will need
// the same conversion for the same reason.
import * as THREE from "three";

/**
 * The matrix that puts `target` where it stands in the world, written in `parent`'s local space.
 *
 * `updateWorldMatrix(true, false)` is ancestors-only on purpose: the parent's own world matrix has
 * to be current for the inversion to mean anything, and re-walking its descendants would cost a
 * whole room's transforms to answer a question about one body. `target.matrixWorld` is taken as
 * current — both of today's callers walk the target themselves before asking for this.
 */
export function transformRelativeTo(
  parent: THREE.Object3D,
  target: THREE.Object3D,
): THREE.Matrix4 {
  parent.updateWorldMatrix(true, false);
  return new THREE.Matrix4()
    .copy(parent.matrixWorld)
    .invert()
    .multiply(target.matrixWorld);
}
