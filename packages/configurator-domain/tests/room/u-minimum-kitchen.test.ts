// M7B U3b S3 — ADR 0108 Amendment H3, the U's minimum kitchen. Under the approved policy (the owner's
// U bounds with the rule switched on; since U6 `APPROVED_ROOM_POLICY` states them), a room is
// refused with `ROOM_TOO_SMALL_FOR_KITCHEN` on the room-level field and no number (RQ8) exactly when
// wall A's free run takes neither the sink and the hob together nor the sink while the far side wall's
// takes the hob. And the gate agrees with the generator, which places a sink and a hob exactly then.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { APPROVED_ROOM_POLICY, type DesignRoom } from "../../src/index.js";
import { generateU } from "../support/generated-u.js";
import { engineUWallBounds } from "../support/room-input.js";
import { uRoom } from "../support/u-plan-fixtures.js";
import { gateVerdictFor } from "../support/u-gate-verdict.js";

const APPROVED_HEIGHTS_MM = [2200, 2600, 3900] as const;

/** Whether generation placed a sink and a hob: a composed kitchen with both steps placed. */
function generatorPlacesASinkAndAHob(room: DesignRoom): boolean {
  const result = generateU(room);
  return (
    result.ok &&
    ["sink", "hob"].every((role) =>
      result.log.steps.some(
        (step) => step.id === role && step.status === "placed",
      ),
    )
  );
}

function isAdmitted(room: DesignRoom): boolean {
  return gateVerdictFor(room).ok;
}

// H3's boundary pairs themselves, and the refusal's exact shape, are asserted under the approved policy
// in qa-m7b-u6-switch.adversarial.test.ts; 2999 / 1000 / 1000 is the first of them, refused there.
describe("validateRoomInput's U gate is the policy's to switch (U3b AC2)", () => {
  it("applies only where the policy requires it: the engine's own U leaves the rule off", () => {
    const engineOnly = {
      ...APPROVED_ROOM_POLICY,
      buildableShapes: {
        U: {
          ...engineUWallBounds(),
        },
      },
    };

    expect(gateVerdictFor(uRoom(2999, 1000, 1000), engineOnly).ok).toBe(true);
  });
});

describe("the approved grid's gate (U3b AC2, ADR 0108 H3)", () => {
  it("refuses 1 728 of the 88 434 rooms on the step-100 grid", () => {
    let refused = 0;
    let total = 0;
    for (let wallAMm = 2700; wallAMm <= 6000; wallAMm += 100) {
      for (let depthMm = 1000; depthMm <= 6000; depthMm += 100) {
        for (let wallCMm = 1000; wallCMm <= 6000; wallCMm += 100) {
          total += 1;
          if (!isAdmitted(uRoom(wallAMm, depthMm, wallCMm))) refused += 1;
        }
      }
    }

    expect(total).toBe(88_434);
    expect(refused).toBe(1_728);
  });
});

describe("the gate passes exactly when generateKitchen places a sink and a hob (U3b AC2)", () => {
  it("over 300 samples of the approved-shaped range at the approved heights", () => {
    const outcomes = { admitted: 0, refused: 0 };
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 2700, max: 6000 }),
          fc.integer({ min: 1000, max: 6000 }),
          fc.integer({ min: 1000, max: 6000 }),
          fc.constantFrom(...APPROVED_HEIGHTS_MM),
        ),
        ([widthMm, depthMm, wallCMm, heightMm]) => {
          const room = uRoom(widthMm, depthMm, wallCMm, heightMm);
          const admitted = isAdmitted(room);
          outcomes[admitted ? "admitted" : "refused"] += 1;

          expect(generatorPlacesASinkAndAHob(room), JSON.stringify(room)).toBe(
            admitted,
          );
        },
      ),
      { numRuns: 300 },
    );

    expect(outcomes.admitted).toBeGreaterThan(0);
  });

  it("biased to the boundary, where a side wall is 1599-1601 mm or wall A is 2999-3001 mm", () => {
    let refused = 0;
    fc.assert(
      fc.property(
        fc.tuple(
          fc.oneof(
            fc.integer({ min: 2999, max: 3001 }),
            fc.integer({ min: 2700, max: 6000 }),
          ),
          fc.oneof(
            fc.integer({ min: 1599, max: 1601 }),
            fc.integer({ min: 1000, max: 6000 }),
          ),
          fc.oneof(
            fc.integer({ min: 1599, max: 1601 }),
            fc.integer({ min: 1000, max: 6000 }),
          ),
        ),
        ([widthMm, depthMm, wallCMm]) => {
          const room = uRoom(widthMm, depthMm, wallCMm);
          const admitted = isAdmitted(room);
          if (!admitted) refused += 1;

          expect(generatorPlacesASinkAndAHob(room), JSON.stringify(room)).toBe(
            admitted,
          );
        },
      ),
      { numRuns: 300 },
    );

    expect(refused).toBeGreaterThan(0);
  });

  it.each([
    uRoom(2999, 1000, 1000),
    uRoom(3000, 1000, 1000),
    uRoom(2999, 1599, 1599),
    uRoom(3000, 1599, 1599),
    uRoom(2999, 6000, 1599),
    uRoom(2999, 6000, 1600),
    uRoom(2700, 6000, 1599),
    uRoom(2700, 6000, 1600),
  ])("H3's pair %j: the gate and the generator agree", (room) => {
    expect(generatorPlacesASinkAndAHob(room)).toBe(isAdmitted(room));
  });
});
