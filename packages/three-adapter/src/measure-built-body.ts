// The Three.js half of the `BodyProbe` port (ADR 0011 Gap B): build the body §5.2 planned, measure it, discard it.
// DEVELOPMENT-SPEC §6.2: the body is added to the room and measured after its world matrix is updated, and the wall
// plane is read from the room's own wall mesh. Predicting a seat instead left inserts floating 135 mm off the wall or
// buried 10-31 mm inside it (§11 row 19).
import * as THREE from "three";
import type {
  BodyMeasurement,
  BodyProbe,
  BodyProbeRequest,
} from "@lemnaria/configurator-domain";

import { buildAnyBody } from "./build-any-body.js";
import type { Kit } from "./kitchen-parts.js";
import { disposeUnsharedGeometries, isMesh } from "./three-guards.js";

/** The meshes of a body's own shell, everything occupying the opening. Excluded: what rises into free air or in front
 *  and is not part of the stated size (the sink faucet measured 1220 mm and was refused from an 860 mm opening, §11
 *  row 7). `hood_chimney` is included: §7 sizes a hood as a canopy on a chimney (ADR 0016). */
export const CARCASS_MESH_NAME_PATTERN =
  /carcass_shell|side_left|side_right|panel_bottom|plinth|counter|fridge_body|hood_canopy|hood_chimney|dw_body/;

/** `buildKitchen()`'s wall meshes. The measuring path reads only `wall_back`: the two walls meet at the room's corner,
 *  so wall A's plane along +Z and wall B's along +X are the same number, and a body is measured unrotated, so its back
 *  face is on the +Z side either way (`room-transforms.ts` hardcodes the same coupling). Reading the mesh rather than
 *  writing `0` stops a moved room from mis-seating everything (§6.2). `WALL_B_MESH_NAME` serves the assertion that the
 *  corner is still shared, and callers seating on wall B. */
export const WALL_A_MESH_NAME = "wall_back";
export const WALL_B_MESH_NAME = "wall_left";

/** §11 row 19's second named exception (after ADR 0025's corner leg): a body with `seatedOn: "cabinet-front-line"`
 *  (the hood, ADR 0039 decision 2) is seated by its front face on the cabinet-depth line, not its back face on the
 *  wall, so its seat is measured forward from that line. The catalogue declares which plane seats a body (ADR 0077);
 *  never keep a private set of build ids here. */

/** A `PlaneGeometry` faces its own local +Z before any rotation is applied. */
const PLANE_LOCAL_NORMAL = new THREE.Vector3(0, 0, 1);

export interface MeasureBuiltBodyInput {
  readonly kit: Kit;
  readonly room: THREE.Object3D;
  readonly request: BodyProbeRequest;
}

/** The world coordinate of a wall's plane along its front normal (z for wall A, x for wall B). Exported so §11 row 19's
 *  seating assertions read the plane the way the probe does. */
export function readWallPlaneM(
  room: THREE.Object3D,
  wallMeshName: string,
): number {
  const wall = room.getObjectByName(wallMeshName);
  if (!wall) {
    throw new Error(`Room has no wall mesh named "${wallMeshName}"`);
  }
  wall.updateWorldMatrix(true, false);
  const normal = PLANE_LOCAL_NORMAL.clone().applyQuaternion(
    wall.getWorldQuaternion(new THREE.Quaternion()),
  );
  return wall.getWorldPosition(new THREE.Vector3()).dot(normal);
}

/** Measures one body the domain is about to place. Deterministic: built from scratch for every call, with nothing
 *  cached or read from a previous occupant. */
export function measureBuiltBody(
  input: MeasureBuiltBodyInput,
): BodyMeasurement {
  const { request } = input;
  // The same dispatch the scene uses (`buildAnyBody`): calling `buildCatalogBody` directly threw for every seeded
  // decomposition id, which the `reseat` arm of `set-cabinet-depth.ts` asks this probe to measure.
  const group = buildAnyBody(input.kit, request.buildId, request);
  // §6.2: measured after the group is in the room, so a room transform cannot be forgotten.
  input.room.add(group);
  try {
    group.updateWorldMatrix(true, true);
    return measureSeatedGroup(
      group,
      readWallPlaneM(input.room, WALL_A_MESH_NAME),
      request.seatedOn === "cabinet-front-line"
        ? input.kit.depths.cabinetDepthM
        : undefined,
    );
  } finally {
    input.room.remove(group);
    // Only what this measurement created: `kit.M`'s materials and the kit's cached geometries are shared with the
    // bodies already in the room.
    disposeUnsharedGeometries(group, input.kit.ownsGeometry);
  }
}

/** The `BodyProbe` the domain's commands take. Measuring inside the live room keeps the seat honest under a room
 *  transform; every group it adds is removed, leaving the room's children as they were. */
export function createBodyProbe(kit: Kit, room: THREE.Object3D): BodyProbe {
  return {
    measure: (request: BodyProbeRequest): BodyMeasurement =>
      measureBuiltBody({ kit, room, request }),
  };
}

/** The body is measured unrotated, so one seat offset serves both walls: on wall B it is the same body yawed by π/2 and
 *  the distance from its origin to its back face is unchanged. `insertBody` persists `2 ×` this number, and
 *  `deriveCabinetWorldTransform` places the group at half of it off the plane. */
function measureSeatedGroup(
  group: THREE.Group,
  wallPlaneM: number,
  frontLineDepthM?: number,
): BodyMeasurement {
  const fullBox = new THREE.Box3().setFromObject(group);
  const carcassBox = measureCarcassBox(group);
  return {
    carcassWidthM: carcassBox.max.x - carcassBox.min.x,
    carcassHeightM: carcassBox.max.y - carcassBox.min.y,
    fullHeightM: fullBox.max.y - fullBox.min.y,
    seatOffsetM:
      frontLineDepthM === undefined
        ? wallPlaneM - fullBox.min.z
        : wallPlaneM + frontLineDepthM - fullBox.max.z,
  };
}

function measureCarcassBox(group: THREE.Group): THREE.Box3 {
  const carcassBox = new THREE.Box3();
  group.traverse((node) => {
    if (!isMesh(node)) return;
    if (!CARCASS_MESH_NAME_PATTERN.test(node.name)) return;
    carcassBox.union(new THREE.Box3().setFromObject(node));
  });
  return carcassBox;
}
