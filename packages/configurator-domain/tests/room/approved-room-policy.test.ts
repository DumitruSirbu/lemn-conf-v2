// ADR 0108 Amendment B: the owner approved the L's room bounds as numbers, and they are product data
// held inside the engine's own limits. Two tests carry the decision (B1):
//
// - **The guard** — every approved bound sits inside `ENGINE_ROOM_LIMITS`, which stay derived. An
//   engineering change that moves a limit past an approved bound (a deeper declared depth sliding
//   wall B's corner further, a smaller wire bound) turns red here and goes back to the owner, instead
//   of the product accepting a room the engine cannot build or a design cannot store.
// - **The pin** — the six values against the amendment's table, so an edit to the approved data is a
//   deliberate, visible diff: the copy lock's role (ADR 0095 decision 2), for numbers.
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  KITCHEN_L_DESIGN,
  NARROWED_ROOM_OVERFLOWING_DESIGN,
  type MillimetreBounds,
  type RoomPolicy,
} from "../../src/index.js";
import { ENGINE_ROOM_LIMITS } from "../../src/room/room-policy.js";
import {
  lInputFromRoom,
  lWallBoundsOf,
  validateRoom,
} from "../support/room-input.js";

/** One field's bounds, read off any policy the same way. */
const FIELD_BOUNDS: readonly (readonly [
  string,
  (policy: RoomPolicy) => MillimetreBounds,
])[] = [
  ["wall A", (policy) => lWallBoundsOf(policy).wallA],
  ["wall B", (policy) => lWallBoundsOf(policy).wallB],
  ["height", (policy) => policy.heightBounds],
];

describe("APPROVED_ROOM_POLICY — the owner's ruling", () => {
  it("is marked owner-approved", () => {
    expect(APPROVED_ROOM_POLICY.approval).toBe("owner-approved");
  });

  it("holds exactly the six room bounds ADR 0108 Amendment B records", () => {
    const walls = lWallBoundsOf(APPROVED_ROOM_POLICY);

    expect({
      wallA: walls.wallA,
      wallB: walls.wallB,
      height: APPROVED_ROOM_POLICY.heightBounds,
    }).toStrictEqual({
      wallA: { minMm: 900, maxMm: 6300 },
      wallB: { minMm: 1000, maxMm: 5100 },
      height: { minMm: 2200, maxMm: 3900 },
    });
  });

  it("pins Amendment E's generated sink, hob, and two corner reaches", () => {
    expect(lWallBoundsOf(APPROVED_ROOM_POLICY).minimumKitchen).toStrictEqual({
      isRequired: true,
      sinkWidthMm: 600,
      hobWidthMm: 600,
      cornerReachMm: { wallA: 900, wallB: 1000 },
    });
  });
});

describe("APPROVED_ROOM_POLICY — held inside the engine's limits", () => {
  it("builds the L and only shapes the engine can build", () => {
    const approvedShapes = Object.keys(APPROVED_ROOM_POLICY.buildableShapes);
    const engineShapes = Object.keys(ENGINE_ROOM_LIMITS.buildableShapes);

    expect(approvedShapes).toEqual(["L"]);
    expect(approvedShapes.every((shape) => engineShapes.includes(shape))).toBe(
      true,
    );
  });

  it.each(FIELD_BOUNDS)(
    "keeps %s inside the engine's floor and ceiling, with its minimum below its maximum",
    (_field, boundsOf) => {
      const approved = boundsOf(APPROVED_ROOM_POLICY);
      const engine = boundsOf(ENGINE_ROOM_LIMITS);

      expect(approved.minMm).toBeGreaterThanOrEqual(engine.minMm);
      expect(approved.maxMm).toBeLessThanOrEqual(engine.maxMm);
      expect(approved.minMm).toBeLessThan(approved.maxMm);
    },
  );

  it("keeps every approved generated-minimum figure at or above the engine's derivation", () => {
    const approved = lWallBoundsOf(APPROVED_ROOM_POLICY).minimumKitchen;
    const engine = lWallBoundsOf(ENGINE_ROOM_LIMITS).minimumKitchen;

    expect(approved.sinkWidthMm).toBeGreaterThanOrEqual(engine.sinkWidthMm);
    expect(approved.hobWidthMm).toBeGreaterThanOrEqual(engine.hobWidthMm);
    expect(approved.cornerReachMm.wallA).toBeGreaterThanOrEqual(
      engine.cornerReachMm.wallA,
    );
    expect(approved.cornerReachMm.wallB).toBeGreaterThanOrEqual(
      engine.cornerReachMm.wallB,
    );
  });
});

describe("APPROVED_ROOM_POLICY — the fixture rooms are rooms it accepts", () => {
  it.each([
    ["the seeded kitchen", KITCHEN_L_DESIGN.room],
    ["the narrowed overflowing kitchen", NARROWED_ROOM_OVERFLOWING_DESIGN.room],
  ])("accepts %s's room and hands it back unchanged", (_name, room) => {
    expect(validateRoom(lInputFromRoom(room), APPROVED_ROOM_POLICY)).toEqual({
      ok: true,
      room,
    });
  });
});
