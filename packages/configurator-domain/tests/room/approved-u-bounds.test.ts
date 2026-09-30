// M7B U6 S1, acceptance criterion 2 (ADR 0108 Amendment H): the U's approved bounds, judged through
// `validateRoomInput` under `APPROVED_ROOM_POLICY` — the one policy the product ships. Each wall is
// tried at min - 1, min, max and max + 1 with the other two walls well inside their range and the
// kitchen rule met, so the verdict is the wall's alone. The literals are the owner's, spelled here so
// the test cannot follow an edit to the policy it checks (`approved-room-policy.test.ts` pins them too).
import { describe, expect, it } from "vitest";

import { APPROVED_ROOM_POLICY, type URoomInput } from "../../src/index.js";
import { validateRoom } from "../support/room-input.js";

const WALL_A_MIN_MM = 2700;
const SIDE_WALL_MIN_MM = 1000;
const WALL_MAX_MM = 6000;

/** Inside every range, and roomy enough that the minimum kitchen is met whichever wall is varied. */
const ROOMY = { wallAMm: 4000, wallBMm: 3000, wallCMm: 3000 } as const;

type UWall = "wallAMm" | "wallBMm" | "wallCMm";

const WALLS: readonly (readonly [
  UWall,
  "wallA" | "wallB" | "wallC",
  number,
])[] = [
  ["wallAMm", "wallA", WALL_A_MIN_MM],
  ["wallBMm", "wallB", SIDE_WALL_MIN_MM],
  ["wallCMm", "wallC", SIDE_WALL_MIN_MM],
];

function uInput(walls: Partial<Record<UWall, number>>): URoomInput {
  return {
    shape: "U",
    ...ROOMY,
    ...walls,
    heightMm: 2600,
    cornerDirection: "left",
  };
}

function verdictOf(walls: Partial<Record<UWall, number>>) {
  return validateRoom(uInput(walls), APPROVED_ROOM_POLICY);
}

describe("APPROVED_ROOM_POLICY — the U's walls at their approved edges (AC2)", () => {
  it.each(WALLS)(
    "refuses %s one millimetre under its minimum with WALL_TOO_SHORT on that wall alone",
    (key, field, minMm) => {
      const verdict = verdictOf({ [key]: minMm - 1 });

      expect(verdict).toStrictEqual({
        ok: false,
        issues: [{ field, code: "WALL_TOO_SHORT" }],
      });
      expect(JSON.stringify(verdict)).not.toMatch(/\d/);
    },
  );

  it.each(WALLS)("accepts %s at its minimum", (key, _field, minMm) => {
    expect(verdictOf({ [key]: minMm }).ok).toBe(true);
  });

  it.each(WALLS)("accepts %s at 6000 mm", (key) => {
    expect(verdictOf({ [key]: WALL_MAX_MM }).ok).toBe(true);
  });

  it.each(WALLS)(
    "refuses %s one millimetre past 6000 mm with WALL_TOO_LONG on that wall alone",
    (key, field) => {
      const verdict = verdictOf({ [key]: WALL_MAX_MM + 1 });

      expect(verdict).toStrictEqual({
        ok: false,
        issues: [{ field, code: "WALL_TOO_LONG" }],
      });
      expect(JSON.stringify(verdict)).not.toMatch(/\d/);
    },
  );
});

// The pairs ADR 0108 H3 and its RQ8 note record, at the approved 2700: the room-level refusal names
// no wall and no number, exactly as the L's does.
describe("APPROVED_ROOM_POLICY — the U's minimum kitchen at H3's pairs (AC2)", () => {
  it("refuses 2700 / 1000 / 1000 with ROOM_TOO_SMALL_FOR_KITCHEN on the room-level field", () => {
    const verdict = verdictOf({
      wallAMm: 2700,
      wallBMm: 1000,
      wallCMm: 1000,
    });

    expect(verdict).toStrictEqual({
      ok: false,
      issues: [{ field: "shape", code: "ROOM_TOO_SMALL_FOR_KITCHEN" }],
    });
    expect(JSON.stringify(verdict)).not.toMatch(/\d/);
  });

  it.each([
    ["3000 / 1000 / 1000", 3000, 1000, 1000],
    ["2700 / 1600 / 1600", 2700, 1600, 1600],
  ])("accepts %s", (_label, wallAMm, wallBMm, wallCMm) => {
    expect(verdictOf({ wallAMm, wallBMm, wallCMm }).ok).toBe(true);
  });
});
