// M7B wave U4 fix, adversarial QA — ADR 0132 Amendment A2 read literally: "In a U, **any wall** whose
// body zone the camera's eye stands in or behind, **within that wall's run**, is cut away", and "it
// reads where the camera is, not which preset it is, so an orbit gets the same answer as a preset"
// (the configure screen's `OrbitControls` are unconstrained). `cutawayWallsFor` tests walls B and C
// only (`SIDE_WALLS`), and treats any z up to a side run's end as level with it, a negative z
// included.
import {
  buildUShellDesign,
  type DesignRoom,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { cutawayWallsFor } from "../src/cutaway.js";
import type { Vector3Tuple } from "../src/stage.js";

const U_ROOM: DesignRoom = buildUShellDesign({
  room: {
    shape: "U",
    widthMm: 3000,
    depthMm: 3000,
    wallCMm: 3000,
    heightMm: 2600,
  },
  occurredAt: "2026-09-29T12:00:00.000Z",
}).room;
const CABINET_DEPTH_MM = 600;

describe("A2: in a U, any wall whose body zone the eye is in or behind is cut away — wall A included", () => {
  it("cuts wall A for an orbit eye inside wall A's body zone, level with its run", () => {
    const eye: Vector3Tuple = [1.5, 1.3, 0.3];

    expect(cutawayWallsFor(eye, U_ROOM, CABINET_DEPTH_MM)).toContain("A");
  });

  it("cuts wall A for an orbit eye behind wall A's plane, level with its run", () => {
    const eye: Vector3Tuple = [1.5, 1.3, -2];

    expect(cutawayWallsFor(eye, U_ROOM, CABINET_DEPTH_MM)).toContain("A");
  });
});

describe("A2 with A8.1: a wall is cut wherever along it the eye is, so an eye behind wall A and in B's zone cuts both", () => {
  it("cuts wall B, and wall A, for an eye behind wall A that is also behind wall B's plane", () => {
    const eye: Vector3Tuple = [-1, 1.3, -2];

    expect(cutawayWallsFor(eye, U_ROOM, CABINET_DEPTH_MM)).toEqual(["A", "B"]);
  });
});
