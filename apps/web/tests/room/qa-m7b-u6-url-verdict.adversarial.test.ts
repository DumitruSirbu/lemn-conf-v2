// M7B U6 adversarial QA (docs/WORKFLOW.md step 3): a U's URL, under the policy the product ships,
// lands on exactly the domain's verdict. `step-one-carries-a-u.test.ts` round-trips the rooms the
// policy accepts and filters the rest out; this draws from the whole approved rectangle, the H3 band
// around its boundaries included, so the rooms the minimum kitchen refuses are asked too: each must
// be 1C with the domain's own issues, never 1D, and never a shape refusal.
import { fc } from "@fast-check/vitest";
import {
  APPROVED_ROOM_POLICY,
  validateRoomInput,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  parseRoomUrlState,
  serialiseRoomInput,
  type ParsedRoomInput,
  type RoomSearchParams,
} from "@/room/room-url-state";

const RUNS = 1000;

const anyWallA = fc.oneof(
  fc.integer({ min: 2700, max: 6000 }),
  fc.integer({ min: 2990, max: 3010 }),
);
const anySideWall = fc.oneof(
  fc.integer({ min: 1000, max: 6000 }),
  fc.integer({ min: 1590, max: 1610 }),
);

const anyApprovedU = fc.record({
  shape: fc.constant<"U">("U"),
  wallAMm: anyWallA,
  wallBMm: anySideWall,
  wallCMm: anySideWall,
  heightMm: fc.integer({ min: 2200, max: 3900 }),
  cornerDirection: fc.constant<"left">("left"),
});

function paramsOf(input: ParsedRoomInput): RoomSearchParams {
  return Object.fromEntries(serialiseRoomInput(input).entries());
}

describe("a U's URL lands on the domain's verdict under the approved policy", () => {
  it("is 1D exactly when the domain accepts the room, and 1C with its own issues otherwise", () => {
    let refusedCount = 0;
    fc.assert(
      fc.property(anyApprovedU, (input) => {
        const verdict = validateRoomInput(input, APPROVED_ROOM_POLICY);
        const state = parseRoomUrlState(paramsOf(input));

        if (verdict.ok) {
          expect(state.substate).toBe("1D");
          return;
        }
        refusedCount += 1;
        expect(state).toMatchObject({
          substate: "1C",
          issues: verdict.issues,
        });
        expect(verdict.issues).not.toContainEqual(
          expect.objectContaining({ code: "SHAPE_NOT_BUILDABLE" }),
        );
      }),
      { numRuns: RUNS },
    );

    expect(refusedCount).toBeGreaterThan(0);
  });
});
