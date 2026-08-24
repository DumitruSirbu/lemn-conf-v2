import { describe, expect, it } from "vitest";

import {
  deriveCabinetWorldTransform,
  deriveCanonicalWallTransforms,
} from "./room-transforms.js";
import { LayoutPolicyExactnessSchema } from "./schemas.js";

const layoutPolicy = LayoutPolicyExactnessSchema.parse({
  version: "layout-v1",
  manufacturingGrid: { unitM: 0.001 },
  obstacleRules: [],
});

const room = (shape: "linear" | "l_shape" | "u_shape") => ({
  shape,
  heightM: 2.6,
  walls:
    shape === "linear"
      ? [{ id: "wall-a", order: 0, lengthM: 4.2 }]
      : shape === "l_shape"
        ? [
            { id: "wall-a", order: 0, lengthM: 4.2 },
            { id: "wall-b", order: 1, lengthM: 3.4 },
          ]
        : [
            { id: "wall-a", order: 0, lengthM: 4.2 },
            { id: "wall-b", order: 1, lengthM: 3.4 },
            { id: "wall-c", order: 2, lengthM: 3.1 },
          ],
  obstacles: [],
});

describe("deriveCanonicalWallTransforms", () => {
  it("derives the exact linear wall contract", () => {
    expect(deriveCanonicalWallTransforms(room("linear"), layoutPolicy)).toEqual(
      [
        {
          wallId: "wall-a",
          lengthM: 4.2,
          start: { x: 0, y: 0, z: 0 },
          end: { x: 4.2, y: 0, z: 0 },
          tangent: { x: 1, y: 0, z: 0 },
          frontNormal: { x: 0, y: 0, z: 1 },
          yawRadians: 0,
        },
      ],
    );
  });

  it("derives L and U junction anchors, outward fronts, and yaw", () => {
    const lWalls = deriveCanonicalWallTransforms(room("l_shape"), layoutPolicy);
    expect(lWalls).toHaveLength(2);
    expect(lWalls[1]).toEqual({
      wallId: "wall-b",
      lengthM: 3.4,
      start: { x: 0, y: 0, z: 3.4 },
      end: { x: 0, y: 0, z: 0 },
      tangent: { x: 0, y: 0, z: -1 },
      frontNormal: { x: 1, y: 0, z: 0 },
      yawRadians: Math.PI / 2,
    });

    const uWalls = deriveCanonicalWallTransforms(room("u_shape"), layoutPolicy);
    expect(uWalls[2]).toEqual({
      wallId: "wall-c",
      lengthM: 3.1,
      start: { x: 4.2, y: 0, z: 0 },
      end: { x: 4.2, y: 0, z: 3.1 },
      tangent: { x: 0, y: 0, z: 1 },
      frontNormal: { x: -1, y: 0, z: 0 },
      yawRadians: -Math.PI / 2,
    });
  });

  it("is deterministic and rejects noncanonical room input", () => {
    expect(
      deriveCanonicalWallTransforms(room("u_shape"), layoutPolicy),
    ).toEqual(deriveCanonicalWallTransforms(room("u_shape"), layoutPolicy));
    expect(() =>
      deriveCanonicalWallTransforms(
        {
          ...room("l_shape"),
          walls: [
            { id: "wall-b", order: 1, lengthM: 3.4 },
            { id: "wall-a", order: 0, lengthM: 4.2 },
          ],
        },
        layoutPolicy,
      ),
    ).toThrow();
  });
});

describe("deriveCabinetWorldTransform", () => {
  it("matches the reference wall-A and wall-B cabinet origins", () => {
    const walls = deriveCanonicalWallTransforms(room("l_shape"), layoutPolicy);
    const wallA = walls[0];
    const wallB = walls[1];
    if (wallA === undefined || wallB === undefined) throw new Error("fixture");

    expect(
      deriveCabinetWorldTransform({
        room: room("l_shape"),
        layoutPolicy,
        wallId: wallA.wallId,
        verticalBand: "base",
        intervalStartUnits: 900,
        widthUnits: 800,
        depthM: 0.6,
      }),
    ).toEqual({
      position: { x: 1.3, y: 0, z: 0.3 },
      yawRadians: 0,
    });
    const wallBPlacement = deriveCabinetWorldTransform({
      room: room("l_shape"),
      layoutPolicy,
      wallId: wallB.wallId,
      verticalBand: "base",
      intervalStartUnits: 1900,
      widthUnits: 600,
      depthM: 0.6,
    });
    expect(wallBPlacement.position.x).toBeCloseTo(0.3, 12);
    expect(wallBPlacement.position.y).toBe(0);
    expect(wallBPlacement.position.z).toBeCloseTo(1.2, 12);
    expect(wallBPlacement.yawRadians).toBe(Math.PI / 2);
  });

  it("derives wall-C depth offset and a requested vertical band origin", () => {
    const wallC = deriveCanonicalWallTransforms(
      room("u_shape"),
      layoutPolicy,
    )[2];
    if (wallC === undefined) throw new Error("fixture");
    const placement = deriveCabinetWorldTransform({
      room: room("u_shape"),
      layoutPolicy,
      wallId: wallC.wallId,
      verticalBand: "middle",
      intervalStartUnits: 200,
      widthUnits: 800,
      depthM: 0.6,
    });
    expect(placement.position.x).toBeCloseTo(3.9, 12);
    expect(placement.position.y).toBe(1.5);
    expect(placement.position.z).toBeCloseTo(0.6, 12);
    expect(placement.yawRadians).toBe(-Math.PI / 2);
  });

  it.each([
    [-1, 600, 0.6],
    [0.5, 600, 0.6],
    [0, 0, 0.6],
    [0, 600, 0],
    [4000, 600, 0.6],
  ])(
    "rejects invalid or overflowing interval geometry",
    (start, width, depth) => {
      expect(() =>
        deriveCabinetWorldTransform({
          room: room("linear"),
          layoutPolicy,
          wallId: "wall-a",
          verticalBand: "base",
          intervalStartUnits: start,
          widthUnits: width,
          depthM: depth,
        }),
      ).toThrow(RangeError);
    },
  );

  it("accepts exact decimal edge contact and rejects off-grid rooms", () => {
    const decimalRoom = {
      shape: "linear",
      heightM: 2.6,
      walls: [{ id: "wall-a", order: 0, lengthM: 0.3 }],
      obstacles: [],
    };
    expect(
      deriveCabinetWorldTransform({
        room: decimalRoom,
        layoutPolicy,
        wallId: "wall-a",
        verticalBand: "base",
        intervalStartUnits: 100,
        widthUnits: 200,
        depthM: 0.6,
      }).position.x,
    ).toBeCloseTo(0.2, 12);
    expect(() =>
      deriveCanonicalWallTransforms(
        {
          ...decimalRoom,
          walls: [{ id: "wall-a", order: 0, lengthM: 0.3005 }],
        },
        layoutPolicy,
      ),
    ).toThrow();
  });

  it("rejects grid centres that cannot be converted to scene numbers exactly", () => {
    const unsafeUnits = Number.MAX_SAFE_INTEGER;
    const hugePolicy = LayoutPolicyExactnessSchema.parse({
      ...layoutPolicy,
      manufacturingGrid: { unitM: 1 },
    });
    const hugeRoom = {
      shape: "linear",
      heightM: 3,
      walls: [
        {
          id: "wall-a",
          order: 0,
          lengthM: unsafeUnits * 2,
        },
      ],
      obstacles: [],
    };
    expect(() =>
      deriveCabinetWorldTransform({
        room: hugeRoom,
        layoutPolicy: hugePolicy,
        wallId: "wall-a",
        verticalBand: "base",
        intervalStartUnits: unsafeUnits,
        widthUnits: unsafeUnits,
        depthM: 0.6,
      }),
    ).toThrow(RangeError);
  });
});
