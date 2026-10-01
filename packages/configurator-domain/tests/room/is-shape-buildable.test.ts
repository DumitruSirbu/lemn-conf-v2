// ADR 0108 decision 3, and wave 7F1's module boundary: a surface may learn whether a shape is
// buildable and may never learn a bound. The predicate exists so no component spells a shape's
// letter — when a wave adds a shape's bounds to `APPROVED_ROOM_POLICY`, its card starts working with
// no edit outside this package, and the last test here is what proves the predicate reads data.
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  isShapeBuildable,
  type RoomPolicy,
  type RoomShape,
} from "../../src/index.js";
import {
  engineUWallBounds,
  linearWallBoundsOf,
  lWallBoundsOf,
} from "../support/room-input.js";

const EVERY_ROOM_SHAPE: readonly RoomShape[] = ["linear", "L", "U"];

/**
 * The shapes the owner has approved bounds for — a running record, not a prohibition. `linear`
 * joined the L in wave 7J (ADR 0108 Amendment G, D11); `U` joined in M7B wave U6 (ADR 0108 H4).
 *
 * **When a wave adds a shape here:** add it to this list too, and change nothing under
 * `apps/web/src/room` — an edit needed there means a caller named a shape instead of asking.
 */
const SHAPES_WITH_APPROVED_BOUNDS: readonly RoomShape[] = ["linear", "L", "U"];

/** What a reader of the failure needs, since the expected set is meant to grow. */
const BUILDABLE_SHAPES_MOVED = [
  "APPROVED_ROOM_POLICY's buildable shapes have moved.",
  "A wave that added a shape's bounds adds it to SHAPES_WITH_APPROVED_BOUNDS above",
  "and changes nothing under apps/web/src/room.",
  "A shape that lost its bounds is a policy change the owner has to have ruled on.",
].join(" ");

/** A policy that is not the product's: the approved one with the U's bounds taken away, so a test can
 *  show the predicate answers from the policy's data (ADR 0116). The fabrication U6 discharged was the
 *  opposite one, a policy *adding* the U. */
function policyWithoutU(): RoomPolicy {
  return {
    ...APPROVED_ROOM_POLICY,
    buildableShapes: {
      L: lWallBoundsOf(APPROVED_ROOM_POLICY),
      linear: linearWallBoundsOf(APPROVED_ROOM_POLICY),
    },
  };
}

describe("isShapeBuildable — against the owner-approved policy", () => {
  it("answers yes for exactly the shapes the approved policy states bounds for", () => {
    const buildable = EVERY_ROOM_SHAPE.filter((shape) =>
      isShapeBuildable(shape, APPROVED_ROOM_POLICY),
    );

    expect(buildable, BUILDABLE_SHAPES_MOVED).toEqual(
      SHAPES_WITH_APPROVED_BOUNDS,
    );
  });

  it.each(EVERY_ROOM_SHAPE)(
    "agrees with the policy's own data for %s",
    (shape) => {
      const statedShapes: Readonly<Partial<Record<RoomShape, unknown>>> =
        APPROVED_ROOM_POLICY.buildableShapes;

      expect(isShapeBuildable(shape, APPROVED_ROOM_POLICY)).toBe(
        statedShapes[shape] !== undefined,
      );
    },
  );
});

describe("isShapeBuildable — it reads the policy rather than naming a shape", () => {
  // 7J S5: `linear` is real now — `APPROVED_ROOM_POLICY` itself is the policy that turned it
  // buildable, discharging this cast (D11). M7B U6 S1 (census D4) did the same for U: the contrast the
  // predicate needs is a policy that states no U.
  it("answers for U from the policy's own data: buildable when it states the U, not when it does not", () => {
    expect(isShapeBuildable("U", APPROVED_ROOM_POLICY)).toBe(true);
    expect(isShapeBuildable("U", policyWithoutU())).toBe(false);
  });

  it("is already buildable for linear, under the real approved policy, with no cast", () => {
    expect(isShapeBuildable("linear", APPROVED_ROOM_POLICY)).toBe(true);
  });

  it("does not turn a shape buildable that the fabricated policy left out", () => {
    const statesOnlyU: RoomPolicy = {
      ...APPROVED_ROOM_POLICY,
      buildableShapes: {
        // A policy that states only the U; the engine's real bounds stand in.
        U: engineUWallBounds(),
      },
    };

    expect(isShapeBuildable("linear", statesOnlyU)).toBe(false);
    expect(isShapeBuildable("L", statesOnlyU)).toBe(false);
  });

  it("answers no for every shape when a policy states none", () => {
    const emptyPolicy: RoomPolicy = {
      ...APPROVED_ROOM_POLICY,
      buildableShapes: {},
    };

    for (const shape of EVERY_ROOM_SHAPE) {
      expect(isShapeBuildable(shape, emptyPolicy)).toBe(false);
    }
  });

  // **R1.2 regression.** Every `BuildableShapes` object inherits these four from `Object.prototype`,
  // whatever bounds it actually states — a plain `statedShapes[shape] !== undefined` read them as
  // "buildable" no policy ever stated. `Object.hasOwn` is what tells an inherited answer from a
  // stated one.
  it.each(["toString", "__proto__", "constructor", "hasOwnProperty"])(
    "answers no for the inherited property %s, on every policy including one that states none",
    (name) => {
      const emptyPolicy: RoomPolicy = {
        ...APPROVED_ROOM_POLICY,
        buildableShapes: {},
      };
      const hostile = name as RoomShape;

      expect(isShapeBuildable(hostile, APPROVED_ROOM_POLICY)).toBe(false);
      expect(isShapeBuildable(hostile, emptyPolicy)).toBe(false);
    },
  );
});
