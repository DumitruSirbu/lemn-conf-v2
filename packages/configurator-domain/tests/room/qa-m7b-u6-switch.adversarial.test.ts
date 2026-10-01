// M7B U6 adversarial QA (docs/WORKFLOW.md step 3): the switch — the U under `APPROVED_ROOM_POLICY`.
// Targets the implementer's own tests leave open:
// - ADR 0108 H3's whole table at 1 mm, B and C mirrored (the far wall is the narrower one, whichever
//   letter it has), where `approved-u-bounds.test.ts` tries three rooms;
// - the height's edges on a U, and a field refusal never joined by the kitchen refusal;
// - no number in any issue, over hostile input rather than the four edges (ADR 0108 decision 3);
// - `cornerDirection` never moving a U's verdict nor reaching its room (ADR 0132 decision 8);
// - the gate and the generator agreeing off the step-100 grid: every room the gate accepts composes
//   with a sink and a hob, and every room the generator refuses the gate refuses for the kitchen.
// The owner's literals are spelled here, so no oracle follows the policy it checks.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  generateKitchen,
  type DesignRoom,
  type GenerateKitchenResult,
  type RoomValidation,
  type URoomInput,
} from "../../src/index.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";
import { validateRoom } from "../support/room-input.js";

const WALL_A_MIN_MM = 2700;
const SIDE_WALL_MIN_MM = 1000;
const WALL_MAX_MM = 6000;
const HEIGHT_MIN_MM = 2200;
const HEIGHT_MAX_MM = 3900;
const A_HEIGHT_MM = 2600;
const GENERATED_AT = "2026-09-30T12:00:00.000Z";

const TOO_SMALL: RoomValidation = {
  ok: false,
  issues: [{ field: "shape", code: "ROOM_TOO_SMALL_FOR_KITCHEN" }],
};

interface UWalls {
  readonly wallAMm: number;
  readonly wallBMm: number;
  readonly wallCMm: number;
}

function uInput(
  walls: UWalls,
  heightMm: number = A_HEIGHT_MM,
  cornerDirection: "left" | "right" = "left",
): URoomInput {
  return { shape: "U", ...walls, heightMm, cornerDirection };
}

function verdictOf(walls: UWalls, heightMm: number = A_HEIGHT_MM) {
  return validateRoom(uInput(walls, heightMm), APPROVED_ROOM_POLICY);
}

function generate(room: DesignRoom): GenerateKitchenResult {
  return generateKitchen({
    room,
    occurredAt: GENERATED_AT,
    probeAt: createFakeProbeFactory(),
  });
}

function roomOf(walls: UWalls, heightMm: number = A_HEIGHT_MM): DesignRoom {
  return {
    shape: "U",
    widthMm: walls.wallAMm,
    depthMm: walls.wallBMm,
    wallCMm: walls.wallCMm,
    heightMm,
  };
}

/** The roles a composed kitchen placed, so "composes" means a sink and a hob stand, not only `ok`. */
function placedRolesOf(result: GenerateKitchenResult): readonly string[] {
  return result.log.steps
    .filter((step) => step.status === "placed")
    .map((step) => step.role);
}

/** ADR 0108 H3's table at RQ1's 2700, each pair written once with the fridge wall on B and once on C:
 *  the rule reads the narrower side wall, so a letter must not matter. */
const H3_PAIRS: readonly (readonly [string, UWalls, "refuses" | "accepts"])[] =
  [
    [
      "B = C = 1000, A 2999",
      { wallAMm: 2999, wallBMm: 1000, wallCMm: 1000 },
      "refuses",
    ],
    [
      "B = C = 1000, A 3000",
      { wallAMm: 3000, wallBMm: 1000, wallCMm: 1000 },
      "accepts",
    ],
    [
      "B = C = 1599, A 2999",
      { wallAMm: 2999, wallBMm: 1599, wallCMm: 1599 },
      "refuses",
    ],
    [
      "B = C = 1599, A 3000",
      { wallAMm: 3000, wallBMm: 1599, wallCMm: 1599 },
      "accepts",
    ],
    [
      "A 2999, B 6000, C 1599",
      { wallAMm: 2999, wallBMm: 6000, wallCMm: 1599 },
      "refuses",
    ],
    [
      "A 2999, B 6000, C 1600",
      { wallAMm: 2999, wallBMm: 6000, wallCMm: 1600 },
      "accepts",
    ],
    [
      "A 2999, C 6000, B 1599",
      { wallAMm: 2999, wallBMm: 1599, wallCMm: 6000 },
      "refuses",
    ],
    [
      "A 2999, C 6000, B 1600",
      { wallAMm: 2999, wallBMm: 1600, wallCMm: 6000 },
      "accepts",
    ],
    [
      "A 2700, B 6000, C 1599",
      { wallAMm: 2700, wallBMm: 6000, wallCMm: 1599 },
      "refuses",
    ],
    [
      "A 2700, B 6000, C 1600",
      { wallAMm: 2700, wallBMm: 6000, wallCMm: 1600 },
      "accepts",
    ],
    [
      "A 2700, C 6000, B 1599",
      { wallAMm: 2700, wallBMm: 1599, wallCMm: 6000 },
      "refuses",
    ],
    [
      "A 2700, C 6000, B 1600",
      { wallAMm: 2700, wallBMm: 1600, wallCMm: 6000 },
      "accepts",
    ],
    [
      "A 2700, B = C = 1600 (RQ8's floor)",
      { wallAMm: 2700, wallBMm: 1600, wallCMm: 1600 },
      "accepts",
    ],
    [
      "A 2700, B 1600, C 1599 (the narrower binds)",
      { wallAMm: 2700, wallBMm: 1600, wallCMm: 1599 },
      "refuses",
    ],
    [
      "A 2700, B 1599, C 1600 (the narrower binds)",
      { wallAMm: 2700, wallBMm: 1599, wallCMm: 1600 },
      "refuses",
    ],
  ];

describe("the U's minimum kitchen at H3's pairs, B and C mirrored (AC2)", () => {
  it.each(H3_PAIRS)("%s %s", (_label, walls, expected) => {
    const verdict = verdictOf(walls);

    if (expected === "refuses") {
      expect(verdict).toStrictEqual(TOO_SMALL);
    } else {
      expect(verdict.ok).toBe(true);
    }
  });

  it.each(H3_PAIRS)("the generator agrees at %s", (_label, walls, expected) => {
    const result = generate(roomOf(walls));

    expect(result.ok).toBe(expected === "accepts");
  });
});

describe("a U's field refusals under the approved policy (AC2)", () => {
  it.each([
    [HEIGHT_MIN_MM - 1, "HEIGHT_TOO_LOW"],
    [HEIGHT_MAX_MM + 1, "HEIGHT_TOO_HIGH"],
  ] as const)("refuses a height of %i mm with %s alone", (heightMm, code) => {
    const roomy = { wallAMm: 4000, wallBMm: 3000, wallCMm: 3000 };

    expect(verdictOf(roomy, heightMm)).toStrictEqual({
      ok: false,
      issues: [{ field: "height", code }],
    });
  });

  it.each([HEIGHT_MIN_MM, HEIGHT_MAX_MM])(
    "accepts a height of %i mm at the smallest room H3 accepts",
    (heightMm) => {
      const smallest = { wallAMm: 2700, wallBMm: 1600, wallCMm: 1600 };

      expect(verdictOf(smallest, heightMm).ok).toBe(true);
    },
  );

  it("reports a too-short wall A alone, never beside the kitchen refusal its room would also earn", () => {
    expect(
      verdictOf({ wallAMm: WALL_A_MIN_MM - 1, wallBMm: 1000, wallCMm: 1000 }),
    ).toStrictEqual({
      ok: false,
      issues: [{ field: "wallA", code: "WALL_TOO_SHORT" }],
    });
  });

  it("reports every wall out of range at once, in field order", () => {
    expect(
      verdictOf({
        wallAMm: WALL_MAX_MM + 1,
        wallBMm: SIDE_WALL_MIN_MM - 1,
        wallCMm: WALL_MAX_MM + 1,
      }),
    ).toStrictEqual({
      ok: false,
      issues: [
        { field: "wallA", code: "WALL_TOO_LONG" },
        { field: "wallB", code: "WALL_TOO_SHORT" },
        { field: "wallC", code: "WALL_TOO_LONG" },
      ],
    });
  });
});

const anyEntered = fc.oneof(
  fc.constant(undefined),
  fc.integer({ min: -1_000_000, max: 1_000_000 }),
  fc.double({ noNaN: false }),
  fc.constantFrom(
    0,
    -0,
    2699,
    2700,
    999,
    1000,
    1599,
    1600,
    2999,
    3000,
    6000,
    6001,
    2199,
    3901,
    Number.MAX_SAFE_INTEGER,
    Number.POSITIVE_INFINITY,
    Number.NaN,
  ),
);

describe("no number in any U issue (ADR 0108 decision 3)", () => {
  propertyTest.prop([anyEntered, anyEntered, anyEntered, anyEntered], {
    numRuns: 1000,
  })(
    "a refusal names fields and codes and carries no digit, whatever is entered",
    (wallAMm, wallBMm, wallCMm, heightMm) => {
      const verdict = validateRoom(
        {
          shape: "U",
          wallAMm,
          wallBMm,
          wallCMm,
          heightMm,
          cornerDirection: "left",
        },
        APPROVED_ROOM_POLICY,
      );

      if (!verdict.ok) {
        expect(JSON.stringify(verdict.issues)).not.toMatch(/\d/);
      }
    },
  );
});

const nearA = fc.oneof(
  fc.integer({ min: WALL_A_MIN_MM, max: WALL_MAX_MM }),
  fc.integer({ min: 2990, max: 3010 }),
  fc.constantFrom(WALL_A_MIN_MM, WALL_MAX_MM),
);
const nearSide = fc.oneof(
  fc.integer({ min: SIDE_WALL_MIN_MM, max: WALL_MAX_MM }),
  fc.integer({ min: 1590, max: 1610 }),
  fc.constantFrom(SIDE_WALL_MIN_MM, WALL_MAX_MM),
);
const anyApprovedHeight = fc.oneof(
  fc.integer({ min: HEIGHT_MIN_MM, max: HEIGHT_MAX_MM }),
  fc.constantFrom(HEIGHT_MIN_MM, HEIGHT_MAX_MM),
);

describe("cornerDirection never moves a U (ADR 0132 decision 8)", () => {
  propertyTest.prop([nearA, nearSide, nearSide, anyApprovedHeight], {
    numRuns: 300,
  })(
    "left and right give one verdict, and an accepted U carries no direction",
    (wallAMm, wallBMm, wallCMm, heightMm) => {
      const walls = { wallAMm, wallBMm, wallCMm };
      const left = validateRoom(
        uInput(walls, heightMm, "left"),
        APPROVED_ROOM_POLICY,
      );
      const right = validateRoom(
        uInput(walls, heightMm, "right"),
        APPROVED_ROOM_POLICY,
      );

      expect(right).toStrictEqual(left);
      if (left.ok)
        expect(Object.hasOwn(left.room, "cornerDirection")).toBe(false);
    },
  );
});

describe("the gate and the generator agree over the approved range, off the step-100 grid (AC2)", () => {
  propertyTest.prop([nearA, nearSide, nearSide, anyApprovedHeight], {
    numRuns: 800,
  })(
    "an accepted U composes a sink and a hob; a refused one is refused for its kitchen and by the generator",
    (wallAMm, wallBMm, wallCMm, heightMm) => {
      const walls = { wallAMm, wallBMm, wallCMm };
      const verdict = verdictOf(walls, heightMm);
      const result = generate(roomOf(walls, heightMm));

      expect(result.ok).toBe(verdict.ok);
      if (verdict.ok) {
        expect(verdict.room).toStrictEqual(roomOf(walls, heightMm));
        expect(placedRolesOf(result)).toEqual(
          expect.arrayContaining(["sink", "hob"]),
        );
      } else {
        expect(verdict).toStrictEqual(TOO_SMALL);
        expect(result.ok ? undefined : result.reason.code).toBe(
          "MINIMUM_NOT_MET",
        );
      }
    },
  );

  it("agrees on every room of the 1 mm band around H3's two boundaries, at the side wall's floor", () => {
    const disagreements: string[] = [];
    for (let wallAMm = 2995; wallAMm <= 3005; wallAMm += 1) {
      for (let farMm = 1595; farMm <= 1605; farMm += 1) {
        for (const walls of [
          { wallAMm, wallBMm: 6000, wallCMm: farMm },
          { wallAMm, wallBMm: farMm, wallCMm: 6000 },
          { wallAMm, wallBMm: farMm, wallCMm: farMm },
        ]) {
          const gate = verdictOf(walls).ok;
          const generator = generate(roomOf(walls)).ok;
          if (gate !== generator) {
            disagreements.push(
              `${JSON.stringify(walls)} gate ${String(gate)} generator ${String(generator)}`,
            );
          }
        }
      }
    }

    expect(disagreements).toStrictEqual([]);
  }, 120_000);
});
