// ADR 0132 Amendment A2: in a U, any wall whose body zone the eye stands in or behind, within that
// wall's run, is cut away — not drawn and not pickable — for as long as the eye is there. The side
// presets are the common case (each stands where the opposite side wall's cabinets are); an orbit can
// reach wall A's zone too. `cutawayWallsFor` answers which runs, from the camera's position alone (so an
// orbit gets the same answer as a preset); `applyCutaway` makes the scene agree. Picking needs no
// knowledge of either: it skips whatever is not drawn (`picking.ts`).
import {
  buildKitchenLBodyCatalog,
  occupiedDepthOfEntryM,
  toMetres,
  wallLengthMm,
  type Band,
  type DesignRoom,
  type DesignWall,
} from "@lemnaria/configurator-domain";
import type * as THREE from "three";

import type { Vector3Tuple } from "./stage.js";
import { wallOf } from "./wall-tag.js";

/** How close the eye may come to a body before it is inside it rather than looking at it. The value
 *  wave 7H's `qa-7h-preset-stands-clear` test uses for the same question; restated because that
 *  file holds it as a test's private constant. */
const EYE_CLEARANCE_M = 0.05;

const U_WALLS: readonly DesignWall[] = ["A", "B", "C"];

const FLOOR_STANDING_BANDS: readonly Band[] = ["base", "column"];

/** Set on an object only by the cutaway that hid it, so restoring puts back what it took and never
 *  shows something that was hidden for another reason. */
const HIDDEN_BY_CUTAWAY_KEY = "hiddenByCutaway";

const bodyZoneDepthByCabinetDepthMm = new Map<number, number>();

/**
 * The walls of a U whose body zone the eye stands in or behind.
 *
 * A wall counts only where the eye is level with its run, from one end to the other (0 to its
 * length, measured along the wall from its corner) — beyond either end the room is open, and an eye
 * there looks in over nothing. **An L and a straight room never cut anything away.** Throws for a
 * cabinet depth the catalogue is not declared at, as building that catalogue does.
 */
export function cutawayWallsFor(
  eye: Vector3Tuple,
  room: DesignRoom,
  cabinetDepthMm: number,
): readonly DesignWall[] {
  if (room.shape !== "U") return [];
  const zoneDepthM = bodyZoneDepthM(cabinetDepthMm);
  return U_WALLS.filter((wall) => isEyeInBodyZone(eye, wall, room, zoneDepthM));
}

/**
 * Hides every body, void, overflow mark and selection outline standing on a cut wall, and shows again
 * the ones a previous call hid and this one no longer cuts. Idempotent, and it only flips `visible`:
 * nothing is rebuilt or disposed.
 *
 * Marks and outlines are mounted by the caller beside `solidsRoot` and `voidsRoot` (on the room), so
 * they are found there. A body mounted after this ran is drawn until it runs again.
 */
export function applyCutaway(
  solidsRoot: THREE.Object3D,
  voidsRoot: THREE.Object3D,
  walls: readonly DesignWall[],
): void {
  const cutWalls = new Set(walls);
  for (const object of cuttableObjects(solidsRoot, voidsRoot)) {
    const wall = wallOf(object);
    setCutAway(object, wall !== undefined && cutWalls.has(wall));
  }
}

function isEyeInBodyZone(
  eye: Vector3Tuple,
  wall: DesignWall,
  room: DesignRoom,
  zoneDepthM: number,
): boolean {
  const { distanceFromPlaneM, alongM } = eyeRelativeTo(wall, eye, room);
  const isLevelWithRun =
    alongM >= 0 && alongM <= toMetres(wallLengthMm(wall, room));
  return isLevelWithRun && distanceFromPlaneM < zoneDepthM;
}

/** Wall A's plane is z = 0 with its run along x from 0 to W; wall B's is x = 0 with its run along z;
 *  wall C's is x = W, fronting -x, with its run along z. A negative distance is behind the plane. */
function eyeRelativeTo(
  wall: DesignWall,
  [x, , z]: Vector3Tuple,
  room: DesignRoom,
): { readonly distanceFromPlaneM: number; readonly alongM: number } {
  if (wall === "A") return { distanceFromPlaneM: z, alongM: x };
  const distanceFromPlaneM = wall === "B" ? x : toMetres(room.widthMm) - x;
  return { distanceFromPlaneM, alongM: z };
}

/** From the wall's plane to the front of the deepest floor-standing body the catalogue builds at
 *  this cabinet depth, plus the eye's clearance. That body is read through `occupiedDepthOfEntryM`
 *  (ADR 0108 H2's measure), never a literal: 742 mm at depth 600 and 748 mm at 700. */
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
