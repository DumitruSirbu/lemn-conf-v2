import type {
  CornerDirection,
  DesignRoom,
  RoomShape,
} from "@lemnaria/configurator-domain";
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  parsedRoomLengthsOf,
  parseRoomUrlState,
  roomHrefFromDesignRoom,
  serialiseRoomInput,
  type ParsedRoomInput,
  type RoomSearchParams,
} from "@/room/room-url-state";

import { policyWithoutU } from "../support/policy-without-u";

const ANY_SAFE_LENGTH_MM = fc.integer({
  min: 1,
  max: Number.MAX_SAFE_INTEGER,
});
const ROUND_TRIP_RUNS_PER_ARM = 500;

const LINEAR_INPUT = fc.record({
  shape: fc.constant<"linear">("linear"),
  wallAMm: ANY_SAFE_LENGTH_MM,
  heightMm: ANY_SAFE_LENGTH_MM,
});

function lInput(direction: CornerDirection) {
  return fc.record({
    shape: fc.constant<"L">("L"),
    wallAMm: ANY_SAFE_LENGTH_MM,
    wallBMm: ANY_SAFE_LENGTH_MM,
    heightMm: ANY_SAFE_LENGTH_MM,
    cornerDirection: fc.constant(direction),
  });
}

/** A U has one hand (M7B U5 S1, Q-U4 (b)): its parsed input names `left` and nothing can change it. */
const U_INPUT = fc.record({
  shape: fc.constant<"U">("U"),
  wallAMm: ANY_SAFE_LENGTH_MM,
  wallBMm: ANY_SAFE_LENGTH_MM,
  wallCMm: ANY_SAFE_LENGTH_MM,
  heightMm: ANY_SAFE_LENGTH_MM,
  cornerDirection: fc.constant<"left">("left"),
});

const L_LEFT_INPUT = lInput("left");
const L_RIGHT_INPUT = lInput("right");
const ANY_PARSED_INPUT: fc.Arbitrary<ParsedRoomInput> = fc.oneof(
  LINEAR_INPUT,
  L_LEFT_INPUT,
  L_RIGHT_INPUT,
  U_INPUT,
);

function asNextSearchParams(params: URLSearchParams): RoomSearchParams {
  return Object.fromEntries(params.entries());
}

function parsedInputOf(params: RoomSearchParams): ParsedRoomInput {
  const state = parseRoomUrlState(params);
  if (state.substate !== "1C" && state.substate !== "1D") {
    throw new Error(`Expected a fully parsed URL, received ${state.substate}`);
  }
  return state.input;
}

describe("room URL state round-trip", () => {
  it("is the identity for linear inputs over safe integer dimensions", () => {
    assertRoundTripIdentity(LINEAR_INPUT);
  });

  it("is the identity for left-turning L inputs over safe integer dimensions", () => {
    assertRoundTripIdentity(L_LEFT_INPUT);
  });

  it("is the identity for right-turning L inputs over safe integer dimensions", () => {
    assertRoundTripIdentity(L_RIGHT_INPUT);
  });

  it("is the identity for U inputs over safe integer dimensions, which carry no direction", () => {
    assertRoundTripIdentity(U_INPUT);
  });

  it.each([
    ["linear", ["shape", "wallA", "height"]],
    ["L", ["shape", "wallA", "wallB", "height", "direction"]],
    ["U", ["shape", "wallA", "wallB", "wallC", "height"]],
  ] as const)("emits only the canonical keys for %s", (shape, expectedKeys) => {
    const input = inputFor(shape);

    expect([...serialiseRoomInput(input).keys()]).toEqual(expectedKeys);
  });

  it.each([
    1,
    999,
    1000,
    1001,
    Number.MAX_SAFE_INTEGER - 1,
    Number.MAX_SAFE_INTEGER,
  ])("round-trips the exact safe-integer witness %d mm", (lengthMm) => {
    for (const input of [
      { shape: "linear", wallAMm: lengthMm, heightMm: lengthMm },
      {
        shape: "L",
        wallAMm: lengthMm,
        wallBMm: lengthMm,
        heightMm: lengthMm,
        cornerDirection: "left",
      },
      {
        shape: "L",
        wallAMm: lengthMm,
        wallBMm: lengthMm,
        heightMm: lengthMm,
        cornerDirection: "right",
      },
      {
        shape: "U",
        wallAMm: lengthMm,
        wallBMm: lengthMm,
        wallCMm: lengthMm,
        heightMm: lengthMm,
        cornerDirection: "left",
      },
    ] satisfies readonly ParsedRoomInput[]) {
      expect(
        parsedInputOf(asNextSearchParams(serialiseRoomInput(input))),
      ).toStrictEqual(input);
    }
  });

  it("never puts design or editor state into the query", () => {
    fc.assert(
      fc.property(ANY_PARSED_INPUT, (input) => {
        const keys = [...serialiseRoomInput(input).keys()];

        const forbidden = new Set([
          "placement",
          "body",
          "price",
          "preset",
          "design",
          "locale",
          "revision",
        ]);
        expect(keys.filter((key) => forbidden.has(key))).toEqual([]);
      }),
    );
  });

  it("does not serialise arbitrary enumerable properties from a typed input", () => {
    const input = Object.assign(inputFor("L"), {
      placement: "p1",
      body: "base-600",
      price: 123,
      preset: "recipe-1",
      design: { placements: [] },
      locale: "ru",
      revision: 9,
      attackerControlled: "must-not-travel",
    });

    expect([...serialiseRoomInput(input).entries()]).toStrictEqual([
      ["shape", "L"],
      ["wallA", "3.6"],
      ["wallB", "2.4"],
      ["height", "2.5"],
      ["direction", "left"],
    ]);
  });
});

describe("roomHrefFromDesignRoom", () => {
  it("reopens a stored L room with its effective left direction", () => {
    const href = roomHrefFromDesignRoom({
      shape: "L",
      widthMm: 3600,
      depthMm: 2400,
      heightMm: 2600,
    });

    expect(href).toBe(
      "/configurator/room?shape=L&wallA=3.6&wallB=2.4&height=2.6&direction=left",
    );
  });

  it("emits only canonical linear fields", () => {
    const href = roomHrefFromDesignRoom({
      shape: "linear",
      widthMm: 3600,
      depthMm: 9999,
      heightMm: 2400,
    });

    expect(href).toBe("/configurator/room?shape=linear&wallA=3.6&height=2.4");
    expect(href).not.toContain("wallB");
    expect(href).not.toContain("direction");
  });

  it("round-trips the 3600 by 2400 customer room exactly", () => {
    const href = roomHrefFromDesignRoom({
      shape: "L",
      widthMm: 3600,
      depthMm: 2400,
      heightMm: 2500,
    });
    const query = new URL(href, "https://lemnaria.test").searchParams;

    expect(parseRoomUrlState(asNextSearchParams(query))).toMatchObject({
      substate: "1D",
      room: { shape: "L", widthMm: 3600, depthMm: 2400, heightMm: 2500 },
    });
  });
});

// M7B wave U1 slice S1 (pulled forward from U5) wrote `parsedRoomLengthsOf`'s U arm as data only; U5
// slice S1 gave it its callers, `roomHrefFromDesignRoom` and 1F's plan draft. This is the paired test
// for the mapping itself.
describe("parsedRoomLengthsOf — the U arm", () => {
  it("reads all four lengths off a stored U room", () => {
    const room: DesignRoom = {
      shape: "U",
      widthMm: 3600,
      depthMm: 2400,
      wallCMm: 2000,
      heightMm: 2600,
    };

    expect(parsedRoomLengthsOf(room)).toEqual([
      { field: "wallA", millimetres: 3600 },
      { field: "wallB", millimetres: 2400 },
      { field: "wallC", millimetres: 2000 },
      { field: "height", millimetres: 2600 },
    ]);
  });
});

function assertRoundTripIdentity(
  arbitrary: fc.Arbitrary<ParsedRoomInput>,
): void {
  fc.assert(
    fc.property(arbitrary, (input) => {
      const query = serialiseRoomInput(input);

      expect(parsedInputOf(asNextSearchParams(query))).toEqual(input);
    }),
    { numRuns: ROUND_TRIP_RUNS_PER_ARM },
  );
}

describe("room URL state boundary", () => {
  it("never throws for arbitrary Next search-param strings and repetitions", () => {
    const value = fc.oneof(
      fc.string(),
      fc.array(fc.string(), { maxLength: 3 }),
      fc.constant(undefined),
    );
    fc.assert(
      fc.property(fc.dictionary(fc.string(), value), (query) => {
        expect(() => parseRoomUrlState(query)).not.toThrow();
      }),
      { numRuns: 2000 },
    );
  });

  it.each([{}, { shape: "" }, { shape: "l" }, { shape: "galley" }])(
    "keeps a missing or unknown shape in 1A: %j",
    (query) => {
      expect(parseRoomUrlState(query)).toStrictEqual({
        substate: "1A",
        markedFields: ["shape"],
      });
    },
  );

  it("marks every missing field required by the recognized shape", () => {
    expect(parseRoomUrlState({ shape: "L" })).toStrictEqual({
      substate: "1B",
      shape: "L",
      markedFields: ["wallA", "wallB", "height", "direction"],
    });
  });

  it.each([
    ["a sign", "+3.6"],
    ["a negative sign", "-3.6"],
    ["an exponent", "36e-1"],
    ["a fractional millimetre", "3.6005"],
    ["an unsafe integer", "9007199254741"],
    ["an empty value", ""],
    ["Unicode full-width digits", "３.６"],
    ["Unicode Arabic-Indic digits", "٣.٦"],
    ["a Unicode lookalike decimal point", "3․6"],
    ["a zero-width character", "3.\u200b6"],
  ])(
    "marks a length containing %s before domain validation",
    (_name, wallA) => {
      const state = parseRoomUrlState({
        shape: "L",
        wallA,
        wallB: "2.4",
        height: "2.5",
        direction: "left",
      });

      expect(state).toMatchObject({
        substate: "1B",
        markedFields: ["wallA"],
      });
    },
  );

  it("marks an unknown direction before constructing a domain input", () => {
    expect(
      parseRoomUrlState({
        shape: "L",
        wallA: "3.6",
        wallB: "2.4",
        height: "2.5",
        direction: "clockwise",
      }),
    ).toMatchObject({ substate: "1B", markedFields: ["direction"] });
  });

  it.each([
    ["shape", ["L", "linear"]],
    ["wallA", ["3.6", "4.2"]],
    ["wallB", ["2.4", "3.1"]],
    ["height", ["2.5", "2.7"]],
    ["direction", ["left", "right"]],
  ] as const)("rejects a repeated %s value", (field, repeated) => {
    const query: RoomSearchParams = {
      shape: "L",
      wallA: "3.6",
      wallB: "2.4",
      height: "2.5",
      direction: "left",
      [field]: repeated,
    };

    expect(parseRoomUrlState(query).substate).toBe(
      field === "shape" ? "1A" : "1B",
    );
  });

  it.each([
    ["shape", ["L", "L"]],
    ["wallA", ["3.6", "3.6"]],
    ["wallB", ["2.4", "2.4"]],
    ["height", ["2.5", "2.5"]],
    ["direction", ["left", "left"]],
    ["wallA", []],
  ] as const)(
    "does not collapse repeated or empty-array %s",
    (field, value) => {
      const query: RoomSearchParams = {
        shape: "L",
        wallA: "3.6",
        wallB: "2.4",
        height: "2.5",
        direction: "left",
        [field]: value,
      };

      expect(parseRoomUrlState(query)).toMatchObject(
        field === "shape"
          ? { substate: "1A", markedFields: ["shape"] }
          : { substate: "1B", markedFields: [field] },
      );
    },
  );

  it("stops at 1B and marks every parse failure before domain validation", () => {
    expect(
      parseRoomUrlState({
        shape: "U",
        wallA: "+3.6",
        wallB: "",
        wallC: ["2.4", "2.4"],
        height: "2.5005",
        direction: "clockwise",
      }),
    ).toStrictEqual({
      substate: "1B",
      shape: "U",
      // No `direction`: a U has one hand, so an unreadable one is ignored rather than marked.
      markedFields: ["wallA", "wallB", "wallC", "height"],
    });
  });

  // 7J S5: 3.6 × 2.5 m is inside the straight kitchen's own approved range (1200–6000, 2200–3900),
  // so this now reaches 1D rather than stopping at 1C — the room-irrelevant keys are still ignored,
  // which is what this test is about.
  it("ignores unknown and shape-irrelevant keys", () => {
    const state = parseRoomUrlState({
      shape: "linear",
      wallA: "3.6",
      height: "2.5",
      wallB: ["bad", "duplicate"],
      wallC: "bad",
      direction: "up",
      design: "must-not-be-read",
    });

    expect(state).toMatchObject({
      substate: "1D",
      input: { shape: "linear", wallAMm: 3600, heightMm: 2500 },
    });
  });
});

describe("room URL state domain hand-off", () => {
  // 7J S5 moved the straight kitchen out of the domain's shape-alone refusal, and M7B U6 S1 (census
  // W38) the U: under the approved policy the round trip reaches 1D, and the refusal is read under a
  // policy that states no U (ADR 0116).
  it("lets the domain accept the fully parsed U shape", () => {
    const query = asNextSearchParams(serialiseRoomInput(inputFor("U")));

    expect(parseRoomUrlState(query)).toMatchObject({
      substate: "1D",
      input: inputFor("U"),
      markedFields: [],
    });
  });

  it("lets a policy that states no U refuse the fully parsed U shape", () => {
    const query = asNextSearchParams(serialiseRoomInput(inputFor("U")));

    expect(parseRoomUrlState(query, policyWithoutU())).toMatchObject({
      substate: "1C",
      issues: [{ field: "shape", code: "SHAPE_NOT_BUILDABLE" }],
      markedFields: ["shape"],
    });
  });

  // 7J S5: the round trip a straight kitchen now completes, ADR 0108 Amendment G's own bounds.
  it("lets the domain accept the fully parsed linear shape", () => {
    const query = asNextSearchParams(serialiseRoomInput(inputFor("linear")));

    expect(parseRoomUrlState(query)).toMatchObject({
      substate: "1D",
      input: inputFor("linear"),
      markedFields: [],
    });
  });

  it("publishes public domain issues without replacing them at the web boundary", () => {
    expect(
      parseRoomUrlState({
        shape: "L",
        wallA: "0.9",
        wallB: "2.16",
        height: "2.2",
        direction: "right",
      }),
    ).toMatchObject({
      substate: "1C",
      issues: [{ field: "shape", code: "ROOM_TOO_SMALL_FOR_KITCHEN" }],
      markedFields: ["shape"],
    });
  });

  it("returns the typed input and DesignRoom for a valid L", () => {
    expect(
      parseRoomUrlState({
        shape: "L",
        wallA: "3,6",
        wallB: "2.4",
        height: "2.5",
        direction: "right",
      }),
    ).toStrictEqual({
      substate: "1D",
      input: {
        shape: "L",
        wallAMm: 3600,
        wallBMm: 2400,
        heightMm: 2500,
        cornerDirection: "right",
      },
      // ADR 0129 D2/D3 (M7 wave 7I S1): validateRoomInput now carries cornerDirection onto the
      // room it returns, written only for right.
      room: {
        shape: "L",
        widthMm: 3600,
        depthMm: 2400,
        heightMm: 2500,
        cornerDirection: "right",
      },
      markedFields: [],
    });
  });

  it.each([
    [900, 2200, 2200],
    [2100, 1000, 3900],
    [1500, 1600, 2500],
    // The approved corner: 6000 mm per wall since M7 7A3 (ADR 0120 Amendment B2).
    [6000, 6000, 3900],
  ])(
    "accepts the exact L boundary %d × %d × %d",
    (wallAMm, wallBMm, heightMm) => {
      const state = parseRoomUrlState(
        asNextSearchParams(
          serialiseRoomInput({
            shape: "L",
            wallAMm,
            wallBMm,
            heightMm,
            cornerDirection: "left",
          }),
        ),
      );

      expect(state).toMatchObject({
        substate: "1D",
        room: {
          shape: "L",
          widthMm: wallAMm,
          depthMm: wallBMm,
          heightMm,
        },
        markedFields: [],
      });
    },
  );

  it.each([
    [900, 2199],
    [2099, 1000],
    [1499, 1600],
    [1500, 1599],
  ])(
    "refuses the exact minimum-kitchen boundary %d × %d",
    (wallAMm, wallBMm) => {
      const state = parseRoomUrlState(
        asNextSearchParams(
          serialiseRoomInput({
            shape: "L",
            wallAMm,
            wallBMm,
            heightMm: 2500,
            cornerDirection: "right",
          }),
        ),
      );

      expect(state).toStrictEqual({
        substate: "1C",
        input: {
          shape: "L",
          wallAMm,
          wallBMm,
          heightMm: 2500,
          cornerDirection: "right",
        },
        issues: [{ field: "shape", code: "ROOM_TOO_SMALL_FOR_KITCHEN" }],
        markedFields: ["shape"],
      });
    },
  );

  it("preserves all domain issues in field order after a complete parse", () => {
    expect(
      parseRoomUrlState({
        shape: "L",
        wallA: "0.899",
        wallB: "6.001",
        height: "2.199",
        direction: "left",
      }),
    ).toStrictEqual({
      substate: "1C",
      input: {
        shape: "L",
        wallAMm: 899,
        wallBMm: 6001,
        heightMm: 2199,
        cornerDirection: "left",
      },
      issues: [
        { field: "wallA", code: "WALL_TOO_SHORT" },
        { field: "wallB", code: "WALL_TOO_LONG" },
        { field: "height", code: "HEIGHT_TOO_LOW" },
      ],
      markedFields: ["wallA", "wallB", "height"],
    });
  });
});

function inputFor(shape: RoomShape): ParsedRoomInput {
  if (shape === "linear") {
    return { shape, wallAMm: 3600, heightMm: 2500 };
  }
  if (shape === "L") {
    return {
      shape,
      wallAMm: 3600,
      wallBMm: 2400,
      heightMm: 2500,
      cornerDirection: "left",
    };
  }
  return {
    shape,
    wallAMm: 3600,
    wallBMm: 2400,
    wallCMm: 3000,
    heightMm: 2500,
    cornerDirection: "left",
  };
}
