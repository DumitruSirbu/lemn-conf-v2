// What `insertBody` is allowed to believe about `BodyProbe` (ADR 0011 Gap B).
//
// The probe is the one input to this command that is not a pure value: Wave 3B implements it with
// Three.js, against real geometry. `Box3.setFromObject` on a group with no renderable child
// returns an EMPTY box — `+Infinity` mins and `-Infinity` maxes — so a builder that produced
// nothing hands the domain non-finite numbers rather than an exception. This file asks what the
// command does with a measurement that is not a measurement.
//
// The failure mode this project has shipped twice is "reported success while doing nothing", so
// nothing here checks for the absence of a throw: every success is checked against the document it
// claims to have written.
import { describe, expect, it } from "vitest";

import type { BodyMeasurement, BodyProbe } from "../../src/body-probe.js";
import { DesignSchema } from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { clearBodies, insertInto } from "../support/commands.js";
import { createFakeProbe } from "../support/fake-probe.js";
import { createWorld, voidAt } from "../support/kitchen-world.js";

const FRIDGE_COLUMN = "B|2.45";

/** The seeded kitchen with the fridge column cleared: one 2600 mm opening, three level slots. */
function clearedFridgeColumn() {
  return clearBodies(createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG), [
    "p7",
    "p24",
  ]);
}

function probeReturning(measurement: BodyMeasurement): BodyProbe {
  return { measure: () => measurement };
}

const HONEST_MEASUREMENT: BodyMeasurement = {
  carcassWidthM: 0.7,
  carcassHeightM: 0.86,
  fullHeightM: 0.86,
  seatOffsetM: 0.29,
};

describe("insertBody — a probe that measured nothing", () => {
  const world = clearedFridgeColumn();
  const baseSlot = () =>
    ({ kind: "void", id: voidAt(world, FRIDGE_COLUMN, 0).id }) as const;

  it.each([
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["-Infinity", -Infinity],
  ])(
    "refuses, rather than throwing, when the probe reports a %s seat offset",
    (_label, seatOffsetM) => {
      // `insertBody` returns a `CommandResult`. A store calling it has no catch: an exception here
      // is an unhandled error in a click handler, which is the outcome ADR 0011 Gap E rejected for
      // the sibling case.
      const run = () =>
        insertInto(
          world,
          baseSlot(),
          "base-2door",
          probeReturning({ ...HONEST_MEASUREMENT, seatOffsetM }),
        );
      expect(run).not.toThrow();

      const result = run();
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.code).toBe("MEASUREMENT_UNUSABLE");
      expect(result.reason.message.trim().length).toBeGreaterThan(0);
      expect(result.design).toBe(world.design);
    },
  );

  it("writes a document that validates when the probe answers honestly", () => {
    // The success side of the same contract: whatever `seatDepthMm` the probe drives, what lands
    // in the design must still be a `Design`. Without this, the refusal tests above prove only
    // that nothing was written.
    const result = insertInto(
      world,
      baseSlot(),
      "base-2door",
      probeReturning(HONEST_MEASUREMENT),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(DesignSchema.safeParse(result.design).success).toBe(true);
    const placed = result.design.placements.find(
      (placement) => placement.id === result.effect.placementId,
    );
    expect(placed?.body.seatDepthMm).toBe(580);
  });

  it.each([
    ["NaN", NaN],
    ["Infinity", Infinity],
  ])(
    "refuses a built-size re-check the probe answered with %s",
    (_label, carcassWidthM) => {
      // §5.2's re-check exists to catch a body that did not build to the size it was asked for.
      // `Math.abs(built - required) > TOL` is false for NaN, so the finiteness test has to come
      // first or "the builder returned nothing" sails through the gate written for it.
      const result = insertInto(
        world,
        baseSlot(),
        "base-2door",
        probeReturning({ ...HONEST_MEASUREMENT, carcassWidthM }),
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.code).toBe("BUILT_SIZE_MISMATCH");
    },
  );
});

describe("insertBody — what it asks the probe for", () => {
  // Named for the column's depth until the swap defect was found: `column.d` is §3.2's MAX over
  // the whole vertical run, and reading the build depth from there is what made a replacement wall
  // cabinet as deep as the base cabinet under it. The number is the same on this void — a void
  // carries its own column's depth (§3.3) — but the *rule* is the opening's, so it is read from
  // the opening here. `insert-depth.test.ts` holds the case where the two differ.
  it("measures at the plan's own numbers and the opening's own depth", () => {
    const world = clearedFridgeColumn();
    const probe = createFakeProbe();
    const opening = voidAt(world, FRIDGE_COLUMN, 0);
    const result = insertInto(
      world,
      { kind: "void", id: opening.id },
      "base-2door",
      probe,
    );
    expect(result.ok).toBe(true);
    expect(probe.requests).toEqual([
      {
        buildId: "base-2door",
        widthM: 0.7,
        heightM: 0.86,
        depthM: opening.d,
      },
    ]);
  });

  it("persists 2x the measured seat offset and nothing else derived from the measurement", () => {
    const world = clearedFridgeColumn();
    const result = insertInto(
      world,
      { kind: "void", id: voidAt(world, FRIDGE_COLUMN, 0).id },
      "base-2door",
      createFakeProbe({ seatOffsetM: 0.2895 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const placed = result.design.placements.find(
      (placement) => placement.id === result.effect.placementId,
    );
    expect(placed?.body.seatDepthMm).toBe(579);
  });

  it("is called exactly once per successful insert", () => {
    const world = clearedFridgeColumn();
    const probe = createFakeProbe();
    insertInto(
      world,
      { kind: "void", id: voidAt(world, FRIDGE_COLUMN, 0).id },
      "base-2door",
      probe,
    );
    expect(probe.requests).toHaveLength(1);
  });

  it("is never called for an insert refused before anything is built", () => {
    const world = clearedFridgeColumn();
    const probe = createFakeProbe();
    const result = insertInto(
      world,
      { kind: "void", id: voidAt(world, FRIDGE_COLUMN, 2.2).id },
      "base-2door",
      probe,
    );
    expect(result.ok).toBe(false);
    expect(probe.requests).toEqual([]);
  });
});
