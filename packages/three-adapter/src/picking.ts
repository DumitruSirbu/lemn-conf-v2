// `DEVELOPMENT-SPEC.md` §6.1, in this order:
//   1. raycast the bodies: solids first.
//   2. if there is no hit, raycast the void meshes: voids only where nothing solid is behind.
//   3. climb parents to the owning placement or void.
//
// The spec's fourth line, "resolve accessories -> host cabinet", has no work left: the hob is a child mesh of its
// cabinet's group (ADR 0027), so `climbToSelectable` already resolves a click on it to the cabinet.
// `createPickingRaycaster` pins the `Line.threshold` override (three.js defaults it to one metre, which let every
// dashed void outline steal its neighbours' clicks) in one place.
import * as THREE from "three";

/** `DEVELOPMENT-SPEC.md` §6.1: three.js's own default (1 m) swallowed clicks aimed at a
 *  neighbouring void or cabinet. Never construct a `Raycaster` for picking without this. */
export const LINE_RAYCAST_THRESHOLD_M = 0.008;

/** `DEVELOPMENT-SPEC.md` §6.1: a pointer that moved more than this many pixels between down and
 *  up was an orbit, not a click. */
export const DRAG_THRESHOLD_PX = 7;

export type SelectionKind = "placement" | "void";

export interface Selection {
  readonly kind: SelectionKind;
  readonly id: string;
}

export interface PointerPixel {
  readonly x: number;
  readonly y: number;
}

/** The one raycaster the picking layer should ever construct. `Line.threshold` is set here, at
 *  construction, so every caller gets the override rather than remembering to apply it. */
export function createPickingRaycaster(): THREE.Raycaster {
  const raycaster = new THREE.Raycaster();
  raycaster.params.Line = {
    ...raycaster.params.Line,
    threshold: LINE_RAYCAST_THRESHOLD_M,
  };
  return raycaster;
}

/** Pure gesture check, independent of any real pointer event: a drag beyond `DRAG_THRESHOLD_PX`
 *  is an orbit, not a selection attempt. */
export function isDragGesture(start: PointerPixel, end: PointerPixel): boolean {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return Math.hypot(dx, dy) > DRAG_THRESHOLD_PX;
}

/** Climbs from a hit object's parents to the mount root carrying `userData.placementId` or
 *  `userData.voidId` — a click on any child mesh (a cabinet door, a void's dashed edge) resolves
 *  to the same selectable as a click on the mount root itself. */
export function climbToSelectable(object: THREE.Object3D): Selection | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    const placementId = current.userData["placementId"] as string | undefined;
    if (placementId !== undefined)
      return { kind: "placement", id: placementId };
    const voidId = current.userData["voidId"] as string | undefined;
    if (voidId !== undefined) return { kind: "void", id: voidId };
    current = current.parent;
  }
  return null;
}

/** Whether the object is drawn: three.js raycasts an invisible mesh all the same, so `visible` is
 *  read here, on the object and on every ancestor (a hidden group hides its children). */
function isDrawn(object: THREE.Object3D): boolean {
  for (
    let current: THREE.Object3D | null = object;
    current;
    current = current.parent
  ) {
    if (!current.visible) return false;
  }
  return true;
}

/** The nearest drawn hit that climbs to a selectable (three.js sorts results by distance): a non-selectable mesh in
 *  the same group (the room shell) must not shadow a real hit or the fallback to `voids`, and neither may anything not
 *  drawn, such as a cut-away run (`cutaway.ts`) or a hidden push-to-open handle whose door behind it is the same
 *  placement (§6.5). */
function firstSelectableHit(
  hits: readonly THREE.Intersection[],
): Selection | null {
  for (const hit of hits) {
    if (!isDrawn(hit.object)) continue;
    const target = climbToSelectable(hit.object);
    if (target) return target;
  }
  return null;
}

/** §6.1's picking order: solids first; void meshes only where nothing selectable and solid lies behind, so a void never
 *  swallows a click aimed at the cabinet below it and the room shell never swallows a click aimed at a void. */
export function pick(
  raycaster: THREE.Raycaster,
  solids: THREE.Object3D,
  voids: THREE.Object3D,
): Selection | null {
  const solidTarget = firstSelectableHit(
    raycaster.intersectObject(solids, true),
  );
  if (solidTarget) return solidTarget;

  return firstSelectableHit(raycaster.intersectObject(voids, true));
}
