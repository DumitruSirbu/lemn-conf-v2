// ADR 0129: a right-hand L is the left-hand design drawn in a reflection, and the reflection is a
// per-group primitive (D4, D5) rather than a domain-side mirror. World x = 0 is wall B's plane
// (`DEVELOPMENT-SPEC.md` §2), so negating x alone reflects a position or a world-space vector across
// it — `mirroredX` is that one negation, shared by the camera presets and the light rig (`stage.ts`)
// so neither writes its own `-x`.
import type { CornerDirection } from "@lemnaria/configurator-domain";
import * as THREE from "three";

import { isLine, isMesh } from "./three-guards.js";

/**
 * Reflects `group` in its own local X, about its own origin, by setting the **sign** of
 * `group.scale.x` — never toggled, always written from the current magnitude, so the call is
 * idempotent (`"right"` twice equals once) and reversible (`"right"` then `"left"` restores the
 * matrix bit-exact).
 *
 * **Typed and guarded to a `Group`, never a leaf.** three's `Line.raycast` divides its pick
 * threshold by the Line's own scale average (`Line.js:182`): a `-1` there would turn §6.1's 8 mm
 * void-outline threshold into 24 mm. A `Mesh` or `Points` leaf has no such defect today, but the
 * primitive belongs on an ancestor group in every case D4 names (the whole scene, one structural
 * corner assembly) — never on the thing being drawn — so all three leaf types are refused alike,
 * defensively, in case a caller reaches this past the type system.
 *
 * No geometry, index, material or `side` is read or written (D5): face winding is left to the
 * renderer, which flips the front face for any mesh whose `matrixWorld` determinant is negative.
 */
export function applyCornerDirection(
  group: THREE.Group,
  direction: CornerDirection,
): void {
  if (isMesh(group) || isLine(group) || group instanceof THREE.Points) {
    throw new Error(
      "applyCornerDirection: expected a Group, got a Mesh, Line or Points — mirror an ancestor group instead",
    );
  }
  const magnitudeM = Math.abs(group.scale.x);
  group.scale.x = direction === "right" ? -magnitudeM : magnitudeM;
}

/** The one negation D4's reflection plane performs on an x coordinate: identity for left, negated
 *  for right. Shared by the camera presets and the light rig, both of which reflect a world-space
 *  position rather than a `Group`, so `applyCornerDirection` itself does not apply to them. */
export function mirroredX(direction: CornerDirection, xM: number): number {
  return direction === "right" ? -xM : xM;
}
