// The room suites' one route into `validateRoomInput`, so ADR 0108 decision 3 — an issue is a field
// and a code, and nothing else — is checked on every issue any of them produces rather than on a
// sample (wave 7A criterion 2). A test that called the validator directly would slip past it.
//
// Every helper defaults to `ENGINE_ROOM_LIMITS`: most room tests exercise the validator's mechanism
// against the engine's own limits, and those whose subject is the product's policy pass
// `APPROVED_ROOM_POLICY` explicitly (ADR 0108 Amendment B).
import { expect } from "vitest";

import {
  validateRoomInput,
  type DesignRoom,
  type EnteredMillimetres,
  type LinearRoomInput,
  type LinearWallBounds,
  type LRoomInput,
  type LWallBounds,
  type RoomInput,
  type RoomPolicy,
  type RoomValidation,
  type UWallBounds,
} from "../../src/index.js";
import { ENGINE_ROOM_LIMITS } from "../../src/room/room-policy.js";

/** `RoomIssue`'s whole key set, sorted. A `minMm` or a `limitMm` beside these is the defect. */
const ISSUE_KEYS = ["code", "field"];

/** One measured field of an L and the value to enter in it. */
export interface LFieldValue {
  readonly key: "wallAMm" | "wallBMm" | "heightMm";
  readonly valueMm: EnteredMillimetres;
}

export function validateRoom(
  input: RoomInput,
  policy: RoomPolicy = ENGINE_ROOM_LIMITS,
): RoomValidation {
  const result = validateRoomInput(input, policy);
  if (!result.ok) {
    for (const issue of result.issues) {
      expect(Object.keys(issue).sort()).toEqual(ISSUE_KEYS);
    }
  }
  return result;
}

/** The room `input` validates to, for a test whose input is valid by construction. A refusal throws
 *  with its issues, so a broken premise reads as itself rather than as a type error. */
export function acceptedRoom(
  input: RoomInput,
  policy: RoomPolicy = ENGINE_ROOM_LIMITS,
): DesignRoom {
  const result = validateRoom(input, policy);
  if (!result.ok) {
    throw new Error(
      `expected a valid room, got ${JSON.stringify(result.issues)} for ${JSON.stringify(input)}`,
    );
  }
  return result.room;
}

/** A policy's L walls. Optional in `RoomPolicy`, stated in every policy the room suites use. */
export function lWallBoundsOf(policy: RoomPolicy): LWallBounds {
  const walls = policy.buildableShapes.L;
  if (walls === undefined) {
    throw new Error(
      "the policy states no L walls; every room suite assumes it does",
    );
  }
  return walls;
}

export function engineLWallBounds(): LWallBounds {
  return lWallBoundsOf(ENGINE_ROOM_LIMITS);
}

/** A policy's linear wall. Optional in `RoomPolicy`; ADR 0130 S1 states it in `ENGINE_ROOM_LIMITS`
 *  and wave 7J S5 in `APPROVED_ROOM_POLICY`. */
export function linearWallBoundsOf(policy: RoomPolicy): LinearWallBounds {
  const walls = policy.buildableShapes.linear;
  if (walls === undefined) {
    throw new Error("the policy states no linear wall");
  }
  return walls;
}

export function engineLinearWallBounds(): LinearWallBounds {
  return linearWallBoundsOf(ENGINE_ROOM_LIMITS);
}

/** A policy's U walls. Optional in `RoomPolicy`; M7B U2 S2 states it in `ENGINE_ROOM_LIMITS` and
 *  M7B U6 in `APPROVED_ROOM_POLICY`. */
export function uWallBoundsOf(policy: RoomPolicy): UWallBounds {
  const walls = policy.buildableShapes.U;
  if (walls === undefined) {
    throw new Error("the policy states no U walls");
  }
  return walls;
}

export function engineUWallBounds(): UWallBounds {
  return uWallBoundsOf(ENGINE_ROOM_LIMITS);
}

/** A linear room `policy` accepts. */
export function validLinearInput(
  overrides: Partial<LinearRoomInput> = {},
  policy: RoomPolicy = ENGINE_ROOM_LIMITS,
): LinearRoomInput {
  const walls = linearWallBoundsOf(policy);
  return {
    shape: "linear",
    wallAMm: walls.wallA.minMm,
    heightMm: policy.heightBounds.minMm,
    ...overrides,
  };
}

/** An L `policy` accepts, using wall A for the generated minimum only when the policy requires it. */
export function validLInput(
  overrides: Partial<LRoomInput> = {},
  policy: RoomPolicy = ENGINE_ROOM_LIMITS,
): LRoomInput {
  const walls = lWallBoundsOf(policy);
  const minimum = walls.minimumKitchen;
  return {
    shape: "L",
    wallAMm: minimum.isRequired
      ? Math.max(
          walls.wallA.minMm,
          minimum.cornerReachMm.wallA +
            minimum.sinkWidthMm +
            minimum.hobWidthMm,
        )
      : walls.wallA.minMm,
    wallBMm: walls.wallB.minMm,
    heightMm: policy.heightBounds.minMm,
    cornerDirection: "left",
    ...overrides,
  };
}

/** `validLInput` under `policy` with one measured field changed, the rest left valid. */
export function lInputWithField(
  { key, valueMm }: LFieldValue,
  policy: RoomPolicy = ENGINE_ROOM_LIMITS,
): LRoomInput {
  const walls = lWallBoundsOf(policy);
  const minimum = walls.minimumKitchen;
  const companion = !minimum.isRequired
    ? {}
    : key === "wallAMm"
      ? {
          wallBMm: Math.max(
            walls.wallB.minMm,
            minimum.cornerReachMm.wallB +
              minimum.sinkWidthMm +
              minimum.hobWidthMm,
          ),
        }
      : key === "wallBMm"
        ? {
            wallAMm: Math.max(
              walls.wallA.minMm,
              minimum.cornerReachMm.wallA +
                minimum.sinkWidthMm +
                minimum.hobWidthMm,
            ),
          }
        : {};
  return { ...validLInput({}, policy), ...companion, [key]: valueMm };
}

/** A stored room as the input a customer would type for it: wall A is its width and wall B its
 *  depth, `wallLengthMm`'s mapping. */
export function lInputFromRoom(room: DesignRoom): LRoomInput {
  return {
    shape: "L",
    wallAMm: room.widthMm,
    wallBMm: room.depthMm,
    heightMm: room.heightMm,
    cornerDirection: "left",
  };
}
