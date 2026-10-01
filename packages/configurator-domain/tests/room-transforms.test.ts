import { describe, expect, it } from "vitest";

import {
  deriveCabinetWorldTransform,
  getWallTransform,
} from "../src/room-transforms.js";

const ROOM_WIDTH_M = 4.2;

describe("getWallTransform", () => {
  it("derives wall A: back wall, plane z=0, fronts +Z, no yaw", () => {
    expect(getWallTransform("A", ROOM_WIDTH_M)).toEqual({
      wallId: "A",
      origin: { x: 0, y: 0, z: 0 },
      tangent: { x: 1, y: 0, z: 0 },
      frontNormal: { x: 0, y: 0, z: 1 },
      yawRadians: 0,
    });
  });

  it("derives wall B: left wall, plane x=0, fronts +X, yaw π/2", () => {
    expect(getWallTransform("B", ROOM_WIDTH_M)).toEqual({
      wallId: "B",
      origin: { x: 0, y: 0, z: 0 },
      tangent: { x: 0, y: 0, z: 1 },
      frontNormal: { x: 1, y: 0, z: 0 },
      yawRadians: Math.PI / 2,
    });
  });

  // ADR 0132 decision 1: wall C is its own world wall (α), not wall B's frame reflected — its
  // origin is `(W, 0, 0)`, it runs along +Z exactly as wall B does, and its fronts face −X.
  it("derives wall C: right wall at x=W, fronts -X, yaw -π/2", () => {
    expect(getWallTransform("C", ROOM_WIDTH_M)).toEqual({
      wallId: "C",
      origin: { x: ROOM_WIDTH_M, y: 0, z: 0 },
      tangent: { x: 0, y: 0, z: 1 },
      frontNormal: { x: -1, y: 0, z: 0 },
      yawRadians: -Math.PI / 2,
    });
  });

  it("moves wall C's origin with the room's width and leaves A and B untouched", () => {
    const widerRoomM = 6.3;
    expect(getWallTransform("C", widerRoomM).origin).toEqual({
      x: widerRoomM,
      y: 0,
      z: 0,
    });
    expect(getWallTransform("A", widerRoomM)).toEqual(
      getWallTransform("A", ROOM_WIDTH_M),
    );
    expect(getWallTransform("B", widerRoomM)).toEqual(
      getWallTransform("B", ROOM_WIDTH_M),
    );
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
        roomWidthM: ROOM_WIDTH_M,
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
        roomWidthM: ROOM_WIDTH_M,
      }),
    ).toEqual({
      position: { x: 0.3, y: 0, z: 1.2 },
      yawRadians: Math.PI / 2,
    });
  });

  // ADR 0132 decision 1: wall C's along runs +z, the same axis wall B's does, but its world
  // position is pushed *in* from `x = W` rather than out from `x = 0` — the mirror image of wall
  // B's own push, reflected about the wall's own plane and not about the room's centre line.
  it("places a wall-C cabinet along z, pulled in from x=W by half the depth", () => {
    expect(
      deriveCabinetWorldTransform({
        wall: "C",
        alongM: 1.2,
        y0M: 0,
        depthM: 0.6,
        roomWidthM: ROOM_WIDTH_M,
      }),
    ).toEqual({
      position: { x: ROOM_WIDTH_M - 0.3, y: 0, z: 1.2 },
      yawRadians: -Math.PI / 2,
    });
  });

  it("carries y0M through as the vertical position unchanged", () => {
    expect(
      deriveCabinetWorldTransform({
        wall: "A",
        alongM: 0.4,
        y0M: 1.5,
        depthM: 0.56,
        roomWidthM: ROOM_WIDTH_M,
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
        deriveCabinetWorldTransform({
          wall: "A",
          alongM,
          y0M,
          depthM,
          roomWidthM: ROOM_WIDTH_M,
        }),
      ).toThrow(RangeError);
    },
  );
});
