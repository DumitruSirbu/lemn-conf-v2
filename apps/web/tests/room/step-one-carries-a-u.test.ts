// M7B U5 S1, acceptance criteria 1, 2 and 8: Step 1 carries a U.
//
// Until U6 this ran under a witness policy (ADR 0116), because the approved policy stated no U. Since
// M7B U6 S1 (census W39) it runs under `APPROVED_ROOM_POLICY` itself, and the witness is retired. A U
// has one hand (ADR 0132 decision 8, Q-U4 (b)), so nothing below reads, writes or mirrors a direction
// for one.
import { fc } from "@fast-check/vitest";
import {
  APPROVED_ROOM_POLICY,
  isShapeBuildable,
  validateRoomInput,
  type DesignRoom,
} from "@lemnaria/configurator-domain";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  parseRoomUrlState,
  roomHrefFromDesignRoom,
  serialiseRoomInput,
  type ParsedRoomInput,
  type RoomSearchParams,
} from "@/room/room-url-state";

import { policyWithoutU } from "../support/policy-without-u";

const APPROVED_U = APPROVED_ROOM_POLICY.buildableShapes.U;
if (APPROVED_U === undefined) {
  throw new Error("the approved policy states no U to draw rooms from");
}
const BOUNDS = APPROVED_U;
const HEIGHT = APPROVED_ROOM_POLICY.heightBounds;
const RUNS = 500;

function within(bounds: { readonly minMm: number; readonly maxMm: number }) {
  return fc.integer({ min: bounds.minMm, max: bounds.maxMm });
}

/** A U the approved policy accepts: every wall inside its bounds, and the room clear of the minimum
 *  kitchen's refusal (about 2 % of the rectangle, ADR 0108 H3), which the domain itself answers. */
const anyValidU = fc
  .record({
    shape: fc.constant<"U">("U"),
    wallAMm: within(BOUNDS.wallA),
    wallBMm: within(BOUNDS.wallB),
    wallCMm: within(BOUNDS.wallC),
    heightMm: within(HEIGHT),
    cornerDirection: fc.constant<"left">("left"),
  })
  .filter((input) => validateRoomInput(input, APPROVED_ROOM_POLICY).ok);

function paramsOf(input: ParsedRoomInput): RoomSearchParams {
  return Object.fromEntries(serialiseRoomInput(input).entries());
}

function queryOf(href: string): RoomSearchParams {
  return Object.fromEntries(
    new URL(href, "https://lemnaria.test").searchParams.entries(),
  );
}

function reached1D(query: RoomSearchParams) {
  const state = parseRoomUrlState(query, APPROVED_ROOM_POLICY);
  if (state.substate !== "1D") {
    throw new Error(`expected 1D, got ${state.substate}`);
  }
  return state;
}

describe("a valid U reaches 1D and comes back out of a URL unchanged (criteria 1 and 2)", () => {
  it("reaches 1D without throwing, whatever it measures inside the policy's bounds", () => {
    fc.assert(
      fc.property(anyValidU, (input) => {
        const state = reached1D(paramsOf(input));

        expect(state.room).toEqual({
          shape: "U",
          widthMm: input.wallAMm,
          depthMm: input.wallBMm,
          wallCMm: input.wallCMm,
          heightMm: input.heightMm,
        });
      }),
      { numRuns: RUNS },
    );
  });

  it("round-trips: room, URL, parse, the same room", () => {
    fc.assert(
      fc.property(anyValidU, (input) => {
        const state = reached1D(paramsOf(input));

        expect(state.input).toEqual(input);
        const again = reached1D(queryOf(roomHrefFromDesignRoom(state.room)));
        expect(again.room).toEqual(state.room);
        expect(again.input).toEqual(input);
      }),
      { numRuns: RUNS },
    );
  });

  it("reopens a stored U through roomHrefFromDesignRoom with wall C and no direction", () => {
    const room: DesignRoom = {
      shape: "U",
      widthMm: 4500,
      depthMm: 3000,
      wallCMm: 3600,
      heightMm: 2600,
    };

    expect(roomHrefFromDesignRoom(room)).toBe(
      "/configurator/room?shape=U&wallA=4.5&wallB=3&wallC=3.6&height=2.6",
    );
  });

  it("ignores a direction a U's URL carries: the same left U, whichever it says", () => {
    fc.assert(
      fc.property(
        anyValidU,
        fc.constantFrom("left", "right", "sideways", ""),
        (input, direction) => {
          const bare = reached1D(paramsOf(input));
          const withDirection = reached1D({ ...paramsOf(input), direction });

          expect(withDirection).toEqual(bare);
          expect(withDirection.input).toMatchObject({
            cornerDirection: "left",
          });
          expect(withDirection.room).not.toHaveProperty("cornerDirection");
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("does not mark a missing direction on a U, and marks exactly the missing walls", () => {
    const state = parseRoomUrlState(
      { shape: "U", wallA: "4.5" },
      APPROVED_ROOM_POLICY,
    );

    expect(state).toEqual({
      substate: "1B",
      shape: "U",
      markedFields: ["wallB", "wallC", "height"],
    });
  });

  // Restated at M7B U6 S1 (census W39): the approved policy builds the U, so the same URL reaches 1D
  // under it, and is refused by shape only under a policy that states no U (ADR 0116).
  it("reaches 1D under the approved policy, and is refused by shape under one that states no U", () => {
    const query = {
      shape: "U",
      wallA: "4.5",
      wallB: "3",
      wallC: "3.6",
      height: "2.6",
    };

    expect(isShapeBuildable("U", APPROVED_ROOM_POLICY)).toBe(true);
    expect(parseRoomUrlState(query)).toMatchObject({ substate: "1D" });
    expect(parseRoomUrlState(query, policyWithoutU())).toMatchObject({
      substate: "1C",
      issues: [{ field: "shape", code: "SHAPE_NOT_BUILDABLE" }],
    });
  });
});

describe("no component under apps/web/src/room compares a shape to a U (criterion 8)", () => {
  const directory = resolve(import.meta.dirname, "../../src/room");
  const sources = readdirSync(directory)
    .filter((entry) => entry.endsWith(".ts") || entry.endsWith(".tsx"))
    .map(
      (entry) =>
        [entry, readFileSync(resolve(directory, entry), "utf8")] as const,
    );
  const COMPARES_TO_U = /[!=]==?\s*"U"|"U"\s*[!=]==?|case\s+"U"\s*:/;

  it("reads every module, so the claim below is not about an empty directory", () => {
    expect(sources.length).toBeGreaterThan(10);
    expect(sources.map(([name]) => name)).toContain("room-url-state.ts");
    expect(sources.map(([name]) => name)).toContain("plan-preview-model.ts");
  });

  it.each(sources)("%s asks the domain instead", (name, source) => {
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    expect(code, `${name} spells a comparison to "U"`).not.toMatch(
      COMPARES_TO_U,
    );
  });

  it("would notice a comparison if one were added", () => {
    expect('if (shape === "U") return;').toMatch(COMPARES_TO_U);
    expect('return "U" !== shape;').toMatch(COMPARES_TO_U);
    expect('case "U":').toMatch(COMPARES_TO_U);
  });
});
