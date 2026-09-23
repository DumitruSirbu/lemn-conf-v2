// ADR 0108 decisions 2–5 and 8, by example: the shape is judged first and alone, every field is
// judged in field order, a value is whole millimetres or refused, and a valid L becomes the existing
// `DesignRoom`. The swept versions of these rules are in `validate-room.property.test.ts`.
import { describe, expect, it } from "vitest";

import {
  wallLengthMm,
  type LRoomInput,
  type RoomField,
  type RoomPolicy,
} from "../../src/index.js";
import { ENGINE_ROOM_LIMITS } from "../../src/room/room-policy.js";
import {
  acceptedRoom,
  engineLWallBounds,
  lInputWithField,
  validateRoom,
  validLInput,
} from "../support/room-input.js";

/** The L's measured fields, in field order, and the key each is entered under. */
const L_FIELD_KEYS = [
  ["wallA", "wallAMm"],
  ["wallB", "wallBMm"],
  ["height", "heightMm"],
] as const satisfies readonly (readonly [RoomField, keyof LRoomInput])[];

/** Values that are not whole millimetres. `3600.5` is the one a rounding validator would quietly
 *  turn into a room; the other three are what arithmetic on nothing produces. */
const NOT_WHOLE_MILLIMETRES = [3600.5, NaN, Infinity, -Infinity] as const;

describe("validateRoomInput — the shape is judged first and alone", () => {
  it("refuses a U as its shape alone, even with every wall a valid L wall", () => {
    const walls = engineLWallBounds();

    const result = validateRoom({
      shape: "U",
      wallAMm: walls.wallA.minMm,
      wallBMm: walls.wallB.minMm,
      wallCMm: walls.wallA.minMm,
      heightMm: ENGINE_ROOM_LIMITS.heightBounds.minMm,
      cornerDirection: "left",
    });

    expect(result).toEqual({
      ok: false,
      issues: [{ field: "shape", code: "SHAPE_NOT_BUILDABLE" }],
    });
  });

  it("refuses a straight kitchen as its shape alone, even with its wall and height missing", () => {
    const result = validateRoom({
      shape: "linear",
      wallAMm: undefined,
      heightMm: undefined,
    });

    expect(result).toEqual({
      ok: false,
      issues: [{ field: "shape", code: "SHAPE_NOT_BUILDABLE" }],
    });
  });

  it("refuses a valid L under a policy that builds no shape, because the policy is the parameter", () => {
    const buildsNothing: RoomPolicy = {
      ...ENGINE_ROOM_LIMITS,
      buildableShapes: {},
    };

    const result = validateRoom(validLInput(), buildsNothing);

    expect(result).toEqual({
      ok: false,
      issues: [{ field: "shape", code: "SHAPE_NOT_BUILDABLE" }],
    });
  });
});

describe("validateRoomInput — every field is judged, and reported in field order", () => {
  it("reports every missing field, not only the first", () => {
    const result = validateRoom(
      validLInput({
        wallAMm: undefined,
        wallBMm: undefined,
        heightMm: undefined,
      }),
    );

    expect(result).toEqual({
      ok: false,
      issues: [
        { field: "wallA", code: "VALUE_MISSING" },
        { field: "wallB", code: "VALUE_MISSING" },
        { field: "height", code: "VALUE_MISSING" },
      ],
    });
  });

  it("gives each field its own reason, in wall A, wall B, height order", () => {
    const walls = engineLWallBounds();

    const result = validateRoom(
      validLInput({
        wallAMm: walls.wallA.maxMm + 1,
        wallBMm: walls.wallB.minMm - 1,
        heightMm: ENGINE_ROOM_LIMITS.heightBounds.maxMm + 1,
      }),
    );

    expect(result).toEqual({
      ok: false,
      issues: [
        { field: "wallA", code: "WALL_TOO_LONG" },
        { field: "wallB", code: "WALL_TOO_SHORT" },
        { field: "height", code: "HEIGHT_TOO_HIGH" },
      ],
    });
  });

  it("leaves the valid fields unmarked beside one refused field", () => {
    const result = validateRoom(validLInput({ wallBMm: undefined }));

    expect(result).toEqual({
      ok: false,
      issues: [{ field: "wallB", code: "VALUE_MISSING" }],
    });
  });
});

describe("validateRoomInput — whole millimetres or refused, never rounded", () => {
  const cases = L_FIELD_KEYS.flatMap(([field, key]) =>
    NOT_WHOLE_MILLIMETRES.map((valueMm) => [field, key, valueMm] as const),
  );

  it.each(cases)(
    "refuses %s = %s as not whole millimetres",
    (field, key, valueMm) => {
      const result = validateRoom(lInputWithField({ key, valueMm }));

      expect(result).toEqual({
        ok: false,
        issues: [{ field, code: "VALUE_NOT_WHOLE_MILLIMETRES" }],
      });
    },
  );

  it.each([0, -1])(
    "refuses a wall of %s as too short, and a height of it as too low",
    (valueMm) => {
      expect(validateRoom(validLInput({ wallAMm: valueMm }))).toEqual({
        ok: false,
        issues: [{ field: "wallA", code: "WALL_TOO_SHORT" }],
      });
      expect(validateRoom(validLInput({ heightMm: valueMm }))).toEqual({
        ok: false,
        issues: [{ field: "height", code: "HEIGHT_TOO_LOW" }],
      });
    },
  );
});

describe("validateRoomInput — a valid L is the existing DesignRoom", () => {
  it("maps wall A to the width, wall B to the depth, and carries no key for left", () => {
    const input = validLInput({ cornerDirection: "left" });

    const result = validateRoom(input);

    expect(result).toStrictEqual({
      ok: true,
      room: {
        shape: "L",
        widthMm: input.wallAMm,
        depthMm: input.wallBMm,
        heightMm: input.heightMm,
      },
    });
  });

  // ADR 0129 D2/D3: carried, and written only for right (S1's addition to this file).
  it('carries cornerDirection: "right" for a right-hand room', () => {
    const input = validLInput({ cornerDirection: "right" });

    const result = validateRoom(input);

    expect(result).toStrictEqual({
      ok: true,
      room: {
        shape: "L",
        widthMm: input.wallAMm,
        depthMm: input.wallBMm,
        heightMm: input.heightMm,
        cornerDirection: "right",
      },
    });
  });

  it("hands the fit gate back the walls that were entered", () => {
    const walls = engineLWallBounds();
    const input = validLInput({
      wallAMm: walls.wallA.maxMm,
      wallBMm: walls.wallB.minMm,
    });

    const room = acceptedRoom(input);

    expect(wallLengthMm("A", room)).toBe(input.wallAMm);
    expect(wallLengthMm("B", room)).toBe(input.wallBMm);
  });
});
