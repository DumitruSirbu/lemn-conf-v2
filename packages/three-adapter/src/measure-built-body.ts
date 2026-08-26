// The Three.js half of ADR 0011 Gap B's `BodyProbe` port: build the body §5.2 planned, measure it,
// and throw the measurement away.
//
// `DEVELOPMENT-SPEC.md` §6.2, literally. The body is added to the **room** and measured after its
// world matrix is updated, and the wall plane is read from the room's own wall mesh. Two recorded
// attempts at predicting a seat instead of measuring one left inserts floating 135 mm off the wall
// and then buried 10–31 mm inside it; §11 row 19 is the assertion that neither is happening.
import * as THREE from "three";
import type {
  BodyMeasurement,
  BodyProbe,
  BodyProbeRequest,
} from "@lemnaria/configurator-domain";

import { buildCatalogBody } from "./catalog-bodies.js";
import type { Kit } from "./kitchen-parts.js";
import { disposeUnsharedGeometries, isMesh } from "./three-guards.js";

/** The meshes that make up a body's own shell — everything that occupies the opening. What is
 *  excluded is what rises into free air above or in front of it and is not part of the product's
 *  stated size: the sink base's faucet, which once measured 1220 mm and was refused from the
 *  860 mm opening it fits perfectly (§11 row 7). `hood_chimney` is *included*, because a hood is a
 *  canopy on a chimney and §7 sizes it as one — ADR 0016. */
export const CARCASS_MESH_NAME_PATTERN =
  /carcass_shell|side_left|side_right|panel_bottom|plinth|counter|fridge_body|hood_canopy|hood_chimney|dw_body/;

/** `buildKitchen()`'s wall meshes.
 *
 *  What is actually true, stated exactly: the measuring path reads **`wall_back`** and only that
 *  one. It can, because the two walls meet at the room's corner — wall A's plane along +Z and wall
 *  B's along +X are the same number — and because a body is measured unrotated, so its back face
 *  is on the +Z side either way. The domain hardcodes the same coupling in `room-transforms.ts`,
 *  where both walls' origins are the corner. Reading the mesh rather than writing `0` is still
 *  what stops a moved room from silently mis-seating everything (§6.2's second failed attempt),
 *  and QA's assertion on the two planes is what will catch it if the corner ever stops being
 *  shared. `WALL_B_MESH_NAME` exists for that assertion and for callers seating on wall B. */
export const WALL_A_MESH_NAME = "wall_back";
export const WALL_B_MESH_NAME = "wall_left";

/** A `PlaneGeometry` faces its own local +Z before any rotation is applied. */
const PLANE_LOCAL_NORMAL = new THREE.Vector3(0, 0, 1);

export interface MeasureBuiltBodyInput {
  readonly kit: Kit;
  readonly room: THREE.Object3D;
  readonly request: BodyProbeRequest;
}

/** The world coordinate of a wall's plane along the wall's own front normal — z for wall A, x for
 *  wall B. Exported because the seating assertions of §11 row 19 must read the plane the same way
 *  the probe does rather than restate it as a literal. */
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

/** Measures one body the domain is about to place. Deterministic by construction: the body is
 *  built from scratch for every call, nothing is read from a previous occupant, and nothing is
 *  cached between calls. */
export function measureBuiltBody(
  input: MeasureBuiltBodyInput,
): BodyMeasurement {
  const { request } = input;
  const group = buildCatalogBody(input.kit, request.buildId, request);
  // §6.2: measured **after** the group is in the room, so a room transform cannot be forgotten.
  input.room.add(group);
  try {
    group.updateWorldMatrix(true, true);
    return measureSeatedGroup(
      group,
      readWallPlaneM(input.room, WALL_A_MESH_NAME),
    );
  } finally {
    input.room.remove(group);
    // Only what this measurement created: `kit.M`'s materials and the kit's cached geometries are
    // shared with the bodies already standing in the room the probe just borrowed.
    disposeUnsharedGeometries(group, input.kit.ownsGeometry);
  }
}

/** The `BodyProbe` the domain's commands take. `room` is the live scene's room: measuring inside
 *  it is what keeps the seat honest under a room transform, and the probe removes every group it
 *  adds, so the room is left with the same children in the same order. */
export function createBodyProbe(kit: Kit, room: THREE.Object3D): BodyProbe {
  return {
    measure: (request: BodyProbeRequest): BodyMeasurement =>
      measureBuiltBody({ kit, room, request }),
  };
}

/** The body is measured unrotated, which is why one seat offset serves both walls: a body on wall
 *  B is the same body yawed by π/2, so its local +Z back face becomes its world +X back face and
 *  the distance from the group origin is unchanged. `insertBody` persists `2 ×` this number and
 *  `deriveCabinetWorldTransform` places the group at half of it off the plane. */
function measureSeatedGroup(
  group: THREE.Group,
  wallPlaneM: number,
): BodyMeasurement {
  const fullBox = new THREE.Box3().setFromObject(group);
  const carcassBox = measureCarcassBox(group);
  return {
    carcassWidthM: carcassBox.max.x - carcassBox.min.x,
    carcassHeightM: carcassBox.max.y - carcassBox.min.y,
    fullHeightM: fullBox.max.y - fullBox.min.y,
    seatOffsetM: wallPlaneM - fullBox.min.z,
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
