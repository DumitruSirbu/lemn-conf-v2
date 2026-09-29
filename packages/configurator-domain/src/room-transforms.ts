export interface Vector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** `"C"` is ADR 0132 decision 1's world wall — origin `(W, 0, 0)`, tangent `+Z`, front normal `−X`,
 *  yaw `−π/2`, where `W` is the room's width, in metres. `getWallTransform` and
 *  `deriveCabinetWorldTransform` take it for exactly this — α means wall C is its own world frame,
 *  not wall B's canonical one reflected (ADR 0132 decisions 1–2), so `widthM` is the one fact this
 *  module reads about the room, and the one place it reads it. A bare number rather than a
 *  `DesignRoom`, deliberately: this module stays a geometry leaf with no wire-shape import, and a
 *  caller that means the room's *bounds* (`wallLengthMm`, `validateRoomInput`) cannot reach for this
 *  function by mistake — the two take different things. */
export type WallId = "A" | "B" | "C";

export interface WallTransform {
  readonly wallId: WallId;
  readonly origin: Vector3;
  readonly tangent: Vector3;
  readonly frontNormal: Vector3;
  readonly yawRadians: number;
}

export interface CabinetWorldTransform {
  readonly position: Vector3;
  readonly yawRadians: number;
}

export interface CabinetTransformInput {
  readonly wall: WallId;
  readonly alongM: number;
  readonly y0M: number;
  readonly depthM: number;
  /** Metres. Only wall C's transform reads this (its origin is `(W, 0, 0)`); wall A and wall B's are
   *  room-independent constants. Required on every call regardless, so a caller cannot compile a
   *  placement onto wall C without the one fact its world position needs. */
  readonly widthM: number;
}

/**
 * Fixed per DEVELOPMENT-SPEC.md §2: wall A is the back wall (plane z=0, fronts +Z,
 * rotation.y=0); wall B is the left wall (plane x=0, fronts +X, rotation.y=π/2). Both walk
 * "along" from the corner where they meet (0,0,0).
 */
const WALL_TRANSFORMS: Record<Exclude<WallId, "C">, WallTransform> = {
  A: {
    wallId: "A",
    origin: { x: 0, y: 0, z: 0 },
    tangent: { x: 1, y: 0, z: 0 },
    frontNormal: { x: 0, y: 0, z: 1 },
    yawRadians: 0,
  },
  B: {
    wallId: "B",
    origin: { x: 0, y: 0, z: 0 },
    tangent: { x: 0, y: 0, z: 1 },
    frontNormal: { x: 1, y: 0, z: 0 },
    yawRadians: Math.PI / 2,
  },
};

export function getWallTransform(
  wallId: WallId,
  widthM: number,
): WallTransform {
  if (wallId === "C") {
    return {
      wallId: "C",
      origin: { x: widthM, y: 0, z: 0 },
      tangent: { x: 0, y: 0, z: 1 },
      frontNormal: { x: -1, y: 0, z: 0 },
      yawRadians: -Math.PI / 2,
    };
  }
  return WALL_TRANSFORMS[wallId];
}

export function deriveCabinetWorldTransform(
  input: CabinetTransformInput,
): CabinetWorldTransform {
  if (!Number.isFinite(input.alongM)) {
    throw new RangeError("alongM must be a finite number");
  }
  if (!Number.isFinite(input.y0M) || input.y0M < 0) {
    throw new RangeError("y0M must be a finite non-negative number");
  }
  if (!Number.isFinite(input.depthM) || input.depthM <= 0) {
    throw new RangeError("depthM must be a finite positive number");
  }

  const wall = getWallTransform(input.wall, input.widthM);
  const halfDepthM = input.depthM / 2;
  return {
    position: {
      x:
        wall.origin.x +
        wall.tangent.x * input.alongM +
        wall.frontNormal.x * halfDepthM,
      y: input.y0M,
      z:
        wall.origin.z +
        wall.tangent.z * input.alongM +
        wall.frontNormal.z * halfDepthM,
    },
    yawRadians: wall.yawRadians,
  };
}
