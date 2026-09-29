// M7B U5 S1, acceptance criteria 1, 2 and 8: Step 1 carries a U, proved under a policy that states one.
//
// **The witness policy** (`policyStatingU`, ADR 0116) is a new value, so `isShapeBuildable("U",
// APPROVED_ROOM_POLICY)` stays false and the U card stays refused until U6 enters the owner's bounds;
// the approved policy is touched by nothing here. A U has one hand (ADR 0132 decision 8, Q-U4 (b)),
// so nothing below reads, writes or mirrors a direction for one.
import { fc } from "@fast-check/vitest";
import {
  APPROVED_ROOM_POLICY,
  isShapeBuildable,
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

import {
  approvedUWallBoundsStandIn,
  policyStatingU,
} from "../support/fabricated-u-policy";

const WITNESS = policyStatingU();
const BOUNDS = approvedUWallBoundsStandIn();
const HEIGHT = APPROVED_ROOM_POLICY.heightBounds;
const RUNS = 500;

function within(bounds: { readonly minMm: number; readonly maxMm: number }) {
  return fc.integer({ min: bounds.minMm, max: bounds.maxMm });
}

/** A U every wall of which the witness policy accepts. */
const anyValidU = fc.record({
  shape: fc.constant<"U">("U"),
  wallAMm: within(BOUNDS.wallA),
  wallBMm: within(BOUNDS.wallB),
  wallCMm: within(BOUNDS.wallC),
  heightMm: within(HEIGHT),
  cornerDirection: fc.constant<"left">("left"),
});

function paramsOf(input: ParsedRoomInput): RoomSearchParams {
  return Object.fromEntries(serialiseRoomInput(input).entries());
}

function queryOf(href: string): RoomSearchParams {
  return Object.fromEntries(
    new URL(href, "https://lemnaria.test").searchParams.entries(),
  );
}

function reached1D(query: RoomSearchParams) {
  const state = parseRoomUrlState(query, WITNESS);
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
    const state = parseRoomUrlState({ shape: "U", wallA: "4.5" }, WITNESS);

    expect(state).toEqual({
      substate: "1B",
      shape: "U",
      markedFields: ["wallB", "wallC", "height"],
    });
  });

  it("is still refused by shape under the approved policy, whose bounds this test never touches", () => {
    const state = parseRoomUrlState({
      shape: "U",
      wallA: "4.5",
      wallB: "3",
      wallC: "3.6",
      height: "2.6",
    });

    expect(isShapeBuildable("U", APPROVED_ROOM_POLICY)).toBe(false);
    expect(state).toMatchObject({
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
