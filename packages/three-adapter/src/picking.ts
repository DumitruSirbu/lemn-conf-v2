// `DEVELOPMENT-SPEC.md` §6.1:
//   hits = raycast(bodies)                  // solids FIRST
//   if none: hits = raycast(void meshes)    // voids only where nothing solid is behind
//   climb parents to the owning placement/void
//   resolve accessories -> host cabinet
//
// The recorded worst bug of the session was the raycast-threshold default (three.js defaults
// `Line.threshold` to one metre), which made every dashed void outline steal its neighbours'
// clicks. `createPickingRaycaster` pins that override in one place so it cannot silently regress.
import * as THREE from "three";
import {
  resolveHostPlacement,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";

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

/** §6.1's "resolve accessories -> host cabinet": a worktop accessory (`frame.h < 0.3`, e.g. the
 *  hob) has no swap set of its own and cannot be deleted, so a click on it must resolve to the
 *  cabinet it sits on, never to its own placement id.
 *
 *  ADR 0011 Gap E: the rule itself is placement logic and lives in the domain now; this is the
 *  adapter's `PlacementRecord`-shaped call into it. An orphaned accessory returns its own id
 *  instead of throwing — `remove` cascades so the state should not arise, and a thrown exception
 *  out of a pointer handler is not an acceptable outcome for one that can. */
export function resolveHostPlacementId(
  accessory: PlacementRecord,
  records: readonly PlacementRecord[],
): string {
  return resolveHostPlacement(accessory, records)?.id ?? accessory.id;
}

/** Resolves a raw `climbToSelectable` result against the placement catalog, applying the
 *  accessory -> host rule. Void selections pass through unchanged. */
export function resolveSelection(
  selection: Selection,
  records: readonly PlacementRecord[],
): Selection {
  if (selection.kind === "void") return selection;
  const record = records.find((candidate) => candidate.id === selection.id);
  if (!record?.accessory) return selection;
  return { kind: "placement", id: resolveHostPlacementId(record, records) };
}

/** The nearest hit (three.js sorts `intersectObject` results by distance) that actually climbs to
 *  a selectable — a non-selectable mesh in the same group (the room shell sharing `solids` with the
 *  cabinet bodies) must not shadow a real hit or a fallback to `voids` behind it. */
function firstSelectableHit(
  hits: readonly THREE.Intersection[],
): Selection | null {
  for (const hit of hits) {
    const target = climbToSelectable(hit.object);
    if (target) return target;
  }
  return null;
}

/** §6.1's picking order: solids first, and void meshes are only tested where nothing *selectable*
 *  solid lies behind — a void must never swallow a click aimed at the cabinet below it, and the
 *  unselectable room shell (floor/walls) must never swallow a click aimed at a void. */
export function pick(
  raycaster: THREE.Raycaster,
  solids: THREE.Object3D,
  voids: THREE.Object3D,
  records: readonly PlacementRecord[],
): Selection | null {
  const solidTarget = firstSelectableHit(
    raycaster.intersectObject(solids, true),
  );
  if (solidTarget) return resolveSelection(solidTarget, records);

  const voidTarget = firstSelectableHit(raycaster.intersectObject(voids, true));
  if (!voidTarget) return null;
  return resolveSelection(voidTarget, records);
}
