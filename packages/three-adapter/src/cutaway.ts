// ADR 0132 Amendment A2 (run bound withdrawn by A8.1): in a U, a wall is cut away (not drawn, not pickable) whenever
// the camera's eye stands in or behind its body zone, wherever along the wall: from there the eye sees only that wall's
// backs, ends and carcass interiors. `cutawayWallsFor` answers from the camera position alone, so an orbit gets the
// same answer as a preset; `applyCutaway` applies and records it, so a later sync mounts cut too (A8.2). Picking skips
// whatever is not drawn (`picking.ts`).
import {
  buildKitchenLBodyCatalog,
  occupiedDepthOfEntryM,
  toMetres,
  wallsOf,
  type Band,
  type DesignRoom,
  type DesignWall,
} from "@lemnaria/configurator-domain";
import type * as THREE from "three";

import type { Vector3Tuple } from "./stage.js";
import { isDesignWall, wallOf } from "./wall-tag.js";

/** How close the eye may come to a body before it is inside it. Exported so the tests that ask the same question read
 *  this one value. */
export const EYE_CLEARANCE_M = 0.05;

const U_WALLS: readonly DesignWall[] = wallsOf("U");

const FLOOR_STANDING_BANDS: readonly Band[] = ["base", "column"];

/** Set on an object only by the cutaway that hid it, so restoring puts back what it took and never
 *  shows something that was hidden for another reason. */
const HIDDEN_BY_CUTAWAY_KEY = "hiddenByCutaway";

/** Where `applyCutaway` records the cut set: on the parent the roots share (the room), or on a root
 *  that has none. The syncs read it from the same place, so they need be handed nothing. */
const CUT_WALLS_KEY = "cutawayWalls";

const bodyZoneDepthByCabinetDepthMm = new Map<number, number>();

/**
 * The walls of a U whose body zone the eye stands in or behind, in wall order. An L and a straight room never cut
 * anything away. Throws for a cabinet depth the catalogue is not declared at.
 */
export function cutawayWallsFor(
  eye: Vector3Tuple,
  room: DesignRoom,
  cabinetDepthMm: number,
): readonly DesignWall[] {
  if (room.shape !== "U") return [];
  const zoneDepthM = bodyZoneDepthM(cabinetDepthMm);
  return U_WALLS.filter(
    (wall) => distanceFromPlaneM(wall, eye, room) < zoneDepthM,
  );
}

/**
 * Hides every body, void, overflow mark and selection outline standing on a cut wall, and shows again the ones a
 * previous call hid. Idempotent; it only flips `visible`. The cut set is recorded on the shared parent for
 * `syncSolidBodies` and `syncVoidMeshes` (`applyRecordedCutaway`). Marks and outlines are mounted by the caller on the
 * room, so the caller re-applies after mounting one.
 */
export function applyCutaway(
  solidsRoot: THREE.Object3D,
  voidsRoot: THREE.Object3D,
  walls: readonly DesignWall[],
): void {
  for (const root of new Set([solidsRoot, voidsRoot])) {
    recordHolderOf(root).userData[CUT_WALLS_KEY] = [...walls];
  }
  applyWalls(cuttableObjects(solidsRoot, voidsRoot), walls);
}

/** Applies the cut set the last `applyCutaway` recorded to `root`'s children, i.e. what a sync has just mounted;
 *  nothing recorded means nothing cut. Only a U is cut: a stage is kept when the room changes shape in place (ADR
 *  0074), so for an L or a straight room the record is cleared and everything the cutaway hid is shown. */
export function applyRecordedCutaway(
  root: THREE.Object3D,
  room: DesignRoom,
): void {
  if (room.shape !== "U") {
    discardRecordedCutaway(root);
    return;
  }
  const recorded = recordedCutWallsOf(recordHolderOf(root));
  if (recorded !== undefined) applyWalls(root.children, recorded);
}

/** `userData` is `any`: what `applyCutaway` recorded is trusted only if it is still a list of walls. */
function recordedCutWallsOf(
  holder: THREE.Object3D,
): readonly DesignWall[] | undefined {
  const recorded: unknown = holder.userData[CUT_WALLS_KEY];
  if (!Array.isArray(recorded)) return undefined;
  return recorded.every(isDesignWall) ? recorded : undefined;
}

/** Clears the record and shows every object under the shared parent that a cutaway hid (the two roots' children and the
 *  overlays beside them), and nothing hidden for another reason. */
function discardRecordedCutaway(root: THREE.Object3D): void {
  const holder = recordHolderOf(root);
  holder.userData[CUT_WALLS_KEY] = [];
  const candidates =
    holder === root
      ? root.children
      : holder.children.flatMap((child) => [child, ...child.children]);
  applyWalls(candidates, []);
}

function recordHolderOf(root: THREE.Object3D): THREE.Object3D {
  return root.parent ?? root;
}

function applyWalls(
  objects: readonly THREE.Object3D[],
  walls: readonly DesignWall[],
): void {
  const cutWalls = new Set(walls);
  for (const object of objects) {
    const wall = wallOf(object);
    setCutAway(object, wall !== undefined && cutWalls.has(wall));
  }
}

/** How far in front of the wall's plane the eye is; negative is behind it. Wall A's plane is z = 0,
 *  wall B's is x = 0, and wall C's is x = W, fronting -x. */
function distanceFromPlaneM(
  wall: DesignWall,
  [x, , z]: Vector3Tuple,
  room: DesignRoom,
): number {
  if (wall === "A") return z;
  return wall === "B" ? x : toMetres(room.widthMm) - x;
}

/** From the wall's plane to the front of the deepest floor-standing body the catalogue builds at this cabinet depth,
 *  plus the eye's clearance. Read through `occupiedDepthOfEntryM` (ADR 0108), never a literal: 742 mm at depth 600 and
 *  748 mm at 700. */
function bodyZoneDepthM(cabinetDepthMm: number): number {
  const known = bodyZoneDepthByCabinetDepthMm.get(cabinetDepthMm);
  if (known !== undefined) return known;
  const zoneDepthM = deepestFloorBodyM(cabinetDepthMm) + EYE_CLEARANCE_M;
  bodyZoneDepthByCabinetDepthMm.set(cabinetDepthMm, zoneDepthM);
  return zoneDepthM;
}

function deepestFloorBodyM(cabinetDepthMm: number): number {
  let deepestM = 0;
  for (const [buildId, definition] of buildKitchenLBodyCatalog(
    cabinetDepthMm,
  )) {
    if (!FLOOR_STANDING_BANDS.includes(definition.band)) continue;
    deepestM = Math.max(
      deepestM,
      occupiedDepthOfEntryM({ buildId, definition }),
    );
  }
  return deepestM;
}

function cuttableObjects(
  solidsRoot: THREE.Object3D,
  voidsRoot: THREE.Object3D,
): readonly THREE.Object3D[] {
  const roomLevel = new Set([solidsRoot.parent, voidsRoot.parent]);
  const overlays = [...roomLevel].flatMap((room) =>
    room ? room.children : [],
  );
  const isOverlay = (object: THREE.Object3D): boolean =>
    object !== solidsRoot && object !== voidsRoot;
  return [
    ...solidsRoot.children,
    ...voidsRoot.children,
    ...overlays.filter(isOverlay),
  ];
}

function setCutAway(object: THREE.Object3D, isCut: boolean): void {
  if (isCut && object.visible) {
    object.visible = false;
    object.userData[HIDDEN_BY_CUTAWAY_KEY] = true;
  } else if (!isCut && object.userData[HIDDEN_BY_CUTAWAY_KEY] === true) {
    object.visible = true;
    object.userData[HIDDEN_BY_CUTAWAY_KEY] = false;
  }
}
