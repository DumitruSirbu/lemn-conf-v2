import {
  VerticalBandSchema,
  createRoomSchema,
  metresToGridUnits,
  type LayoutPolicyExactness,
  type Room,
  type VerticalBand,
} from "./schemas.js";

export interface Vector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface CanonicalWallTransform {
  readonly wallId: Room["walls"][number]["id"];
  readonly lengthM: number;
  readonly start: Vector3;
  readonly end: Vector3;
  readonly tangent: Vector3;
  readonly frontNormal: Vector3;
  readonly yawRadians: number;
}

export interface CabinetWorldTransform {
  readonly position: Vector3;
  readonly yawRadians: number;
}

export interface CabinetTransformInput {
  readonly room: unknown;
  readonly layoutPolicy: LayoutPolicyExactness;
  readonly wallId: CanonicalWallTransform["wallId"];
  readonly verticalBand: VerticalBand;
  readonly intervalStartUnits: number;
  readonly widthUnits: number;
  readonly depthM: number;
}

function endPoint(start: Vector3, tangent: Vector3, lengthM: number): Vector3 {
  return {
    x: start.x + tangent.x * lengthM,
    y: start.y + tangent.y * lengthM,
    z: start.z + tangent.z * lengthM,
  };
}

function wall(
  wallId: CanonicalWallTransform["wallId"],
  lengthM: number,
  start: Vector3,
  tangent: Vector3,
  frontNormal: Vector3,
  yawRadians: number,
): CanonicalWallTransform {
  return {
    wallId,
    lengthM,
    start,
    end: endPoint(start, tangent, lengthM),
    tangent,
    frontNormal,
    yawRadians,
  };
}

export function deriveCanonicalWallTransforms(
  input: unknown,
  layoutPolicy: LayoutPolicyExactness,
): CanonicalWallTransform[] {
  const room = createRoomSchema(layoutPolicy).parse(input);
  const wallA = room.walls[0];
  const result: CanonicalWallTransform[] = [
    wall(
      "wall-a",
      wallA.lengthM,
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      0,
    ),
  ];

  if (room.shape === "l_shape" || room.shape === "u_shape") {
    const wallB = room.walls[1];
    result.push(
      wall(
        "wall-b",
        wallB.lengthM,
        { x: 0, y: 0, z: wallB.lengthM },
        { x: 0, y: 0, z: -1 },
        { x: 1, y: 0, z: 0 },
        Math.PI / 2,
      ),
    );
  }

  if (room.shape === "u_shape") {
    const wallC = room.walls[2];
    result.push(
      wall(
        "wall-c",
        wallC.lengthM,
        { x: wallA.lengthM, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
        { x: -1, y: 0, z: 0 },
        -Math.PI / 2,
      ),
    );
  }

  return result;
}

const bandBottomM: Record<VerticalBand, number> = {
  base: 0,
  middle: 1.5,
  top: 2.2,
  column: 0,
};

function gridCentreToMetres(
  intervalStartUnits: bigint,
  widthUnits: bigint,
  unitM: number,
): number {
  const twiceCentreUnits = intervalStartUnits * 2n + widthUnits;
  const isWholeUnit = twiceCentreUnits % 2n === 0n;
  const safeLimit = BigInt(Number.MAX_SAFE_INTEGER);
  let centreUnits: number;

  if (isWholeUnit) {
    const wholeCentreUnits = twiceCentreUnits / 2n;
    if (wholeCentreUnits > safeLimit) {
      throw new RangeError(
        "Cabinet centre exceeds the safe scene-conversion range",
      );
    }
    centreUnits = Number(wholeCentreUnits);
  } else {
    if (twiceCentreUnits > safeLimit) {
      throw new RangeError(
        "Cabinet half-unit centre exceeds the safe scene-conversion range",
      );
    }
    centreUnits = Number(twiceCentreUnits) / 2;
  }

  const centreM = centreUnits * unitM;
  if (!Number.isFinite(centreM)) {
    throw new RangeError("Cabinet centre is not finite in scene metres");
  }
  return centreM;
}

export function deriveCabinetWorldTransform(
  input: CabinetTransformInput,
): CabinetWorldTransform {
  const policy = input.layoutPolicy;
  const walls = deriveCanonicalWallTransforms(input.room, policy);
  const wallTransform = walls.find(
    (candidate) => candidate.wallId === input.wallId,
  );
  if (wallTransform === undefined) {
    throw new RangeError("wallId must reference a wall in the validated room");
  }
  const verticalBand = VerticalBandSchema.parse(input.verticalBand);
  if (
    !Number.isSafeInteger(input.intervalStartUnits) ||
    input.intervalStartUnits < 0
  ) {
    throw new RangeError(
      "intervalStartUnits must be a safe non-negative integer",
    );
  }
  if (!Number.isSafeInteger(input.widthUnits) || input.widthUnits <= 0) {
    throw new RangeError("widthUnits must be a safe positive integer");
  }
  if (!Number.isFinite(input.depthM) || input.depthM <= 0) {
    throw new RangeError("depthM must be a finite positive number");
  }
  const wallLengthUnits = metresToGridUnits(
    wallTransform.lengthM,
    policy.manufacturingGrid.unitM,
  );
  if (wallLengthUnits === undefined) {
    throw new RangeError(
      "Validated wall length is not representable on the policy grid",
    );
  }
  const intervalStartUnits = BigInt(input.intervalStartUnits);
  const widthUnits = BigInt(input.widthUnits);
  if (intervalStartUnits + widthUnits > wallLengthUnits) {
    throw new RangeError("Cabinet interval exceeds the wall length");
  }

  const centreM = gridCentreToMetres(
    intervalStartUnits,
    widthUnits,
    policy.manufacturingGrid.unitM,
  );
  return {
    position: {
      x:
        wallTransform.start.x +
        wallTransform.tangent.x * centreM +
        wallTransform.frontNormal.x * (input.depthM / 2),
      y: bandBottomM[verticalBand],
      z:
        wallTransform.start.z +
        wallTransform.tangent.z * centreM +
        wallTransform.frontNormal.z * (input.depthM / 2),
    },
    yawRadians: wallTransform.yawRadians,
  };
}
