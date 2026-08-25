export interface Vector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type WallId = "A" | "B";

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
}

/**
 * Fixed per DEVELOPMENT-SPEC.md §2: wall A is the back wall (plane z=0, fronts +Z,
 * rotation.y=0); wall B is the left wall (plane x=0, fronts +X, rotation.y=π/2). Both walk
 * "along" from the corner where they meet (0,0,0).
 */
const WALL_TRANSFORMS: Record<WallId, WallTransform> = {
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

export function getWallTransform(wallId: WallId): WallTransform {
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

  const wall = getWallTransform(input.wall);
  const halfDepthM = input.depthM / 2;
  return {
    position: {
      x: wall.origin.x + wall.tangent.x * input.alongM + wall.frontNormal.x * halfDepthM,
      y: input.y0M,
      z: wall.origin.z + wall.tangent.z * input.alongM + wall.frontNormal.z * halfDepthM,
    },
    yawRadians: wall.yawRadians,
  };
}
