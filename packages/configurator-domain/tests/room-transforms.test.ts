import { describe, expect, it } from "vitest";

import {
  deriveCabinetWorldTransform,
  getWallTransform,
} from "../src/room-transforms.js";

describe("getWallTransform", () => {
  it("derives wall A: back wall, plane z=0, fronts +Z, no yaw", () => {
    expect(getWallTransform("A")).toEqual({
      wallId: "A",
      origin: { x: 0, y: 0, z: 0 },
      tangent: { x: 1, y: 0, z: 0 },
      frontNormal: { x: 0, y: 0, z: 1 },
      yawRadians: 0,
    });
  });

  it("derives wall B: left wall, plane x=0, fronts +X, yaw π/2", () => {
    expect(getWallTransform("B")).toEqual({
      wallId: "B",
      origin: { x: 0, y: 0, z: 0 },
      tangent: { x: 0, y: 0, z: 1 },
      frontNormal: { x: 1, y: 0, z: 0 },
      yawRadians: Math.PI / 2,
    });
  });

  // ADR 0132 decision 1: wall C's transform is room-dependent (its origin needs `W`), and this
  // module takes no room — that wiring is M7B wave U1 slice S3's, not this widening's. `WallId`
  // names `"C"` so every reader type-checks; this function still throws rather than answering wrong.
  it("throws for wall C — its transform is not wired in yet (M7B wave U1 slice S3)", () => {
    expect(() => getWallTransform("C")).toThrow(/wall C/);
  });
});

describe("deriveCabinetWorldTransform", () => {
  it("places a wall-A cabinet along x, pushed out along +Z by half the depth", () => {
    expect(
      deriveCabinetWorldTransform({
        wall: "A",
        alongM: 1.3,
        y0M: 0,
        depthM: 0.6,
      }),
    ).toEqual({
      position: { x: 1.3, y: 0, z: 0.3 },
      yawRadians: 0,
    });
  });

  it("places a wall-B cabinet along z, pushed out along +X by half the depth", () => {
    expect(
      deriveCabinetWorldTransform({
        wall: "B",
        alongM: 1.2,
        y0M: 0,
        depthM: 0.6,
      }),
    ).toEqual({
      position: { x: 0.3, y: 0, z: 1.2 },
      yawRadians: Math.PI / 2,
    });
  });

  it("carries y0M through as the vertical position unchanged", () => {
    expect(
      deriveCabinetWorldTransform({
        wall: "A",
        alongM: 0.4,
        y0M: 1.5,
        depthM: 0.56,
      }).position.y,
    ).toBe(1.5);
  });

  it.each([
    [Number.NaN, 0, 0.6],
    [1, -1, 0.6],
    [1, 0, 0],
    [1, 0, -0.6],
  ])(
    "rejects non-finite or non-positive geometry (alongM=%s, y0M=%s, depthM=%s)",
    (alongM, y0M, depthM) => {
      expect(() =>
        deriveCabinetWorldTransform({ wall: "A", alongM, y0M, depthM }),
      ).toThrow(RangeError);
    },
  );
});
