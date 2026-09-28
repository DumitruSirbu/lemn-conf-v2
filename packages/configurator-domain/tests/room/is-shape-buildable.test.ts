// ADR 0108 decision 3, and wave 7F1's module boundary: a surface may learn whether a shape is
// buildable and may never learn a bound. The predicate exists so no component spells a shape's
// letter — when a wave adds a shape's bounds to `APPROVED_ROOM_POLICY`, its card starts working with
// no edit outside this package, and the last test here is what proves the predicate reads data.
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  isShapeBuildable,
  type BuildableShapes,
  type RoomPolicy,
  type RoomShape,
} from "../../src/index.js";
import { lWallBoundsOf } from "../support/room-input.js";

const EVERY_ROOM_SHAPE: readonly RoomShape[] = ["linear", "L", "U"];

/**
 * The shapes the owner has approved bounds for — a running record, not a prohibition. `linear`
 * joined the L in wave 7J (ADR 0108 Amendment G, D11); `U` has never been put to the owner and is
 * M7B.
 *
 * **When a wave adds a shape here:** add it to this list too, and change nothing under
 * `apps/web/src/room` — an edit needed there means a caller named a shape instead of asking.
 */
const SHAPES_WITH_APPROVED_BOUNDS: readonly RoomShape[] = ["linear", "L"];

/** What a reader of the failure needs, since the expected set is meant to grow. */
const BUILDABLE_SHAPES_MOVED = [
  "APPROVED_ROOM_POLICY's buildable shapes have moved.",
  "A wave that added a shape's bounds adds it to SHAPES_WITH_APPROVED_BOUNDS above",
  "and changes nothing under apps/web/src/room.",
  "A shape that lost its bounds is a policy change the owner has to have ruled on.",
].join(" ");

/** A policy that is not the product's: it states a shape's bounds the way M7B will state the U's.
 *  7J S5 discharges this cast for `linear` — that shape's bounds are `APPROVED_ROOM_POLICY`'s own
 *  now — so the fabrication below is only ever asked to stand in for U, its last live case. */
function policyAlsoStating(shape: "U"): RoomPolicy {
  return {
    ...APPROVED_ROOM_POLICY,
    buildableShapes: {
      ...APPROVED_ROOM_POLICY.buildableShapes,
      [shape]: lWallBoundsOf(APPROVED_ROOM_POLICY),
    } as BuildableShapes,
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
  // buildable, discharging this cast (D11). Only U still needs a fabricated policy, and its own
  // wave is M7B.
  it("turns U buildable as soon as a policy states its bounds, with no change to the predicate", () => {
    expect(isShapeBuildable("U", APPROVED_ROOM_POLICY)).toBe(false);
    expect(isShapeBuildable("U", policyAlsoStating("U"))).toBe(true);
  });

  it("is already buildable for linear, under the real approved policy, with no cast", () => {
    expect(isShapeBuildable("linear", APPROVED_ROOM_POLICY)).toBe(true);
  });

  it("does not turn a shape buildable that the fabricated policy left out", () => {
    const statesOnlyU: RoomPolicy = {
      ...APPROVED_ROOM_POLICY,
      buildableShapes: {
        // U has no bounds of its own yet, hence the cast; M7B is its discharge wave.
        U: lWallBoundsOf(APPROVED_ROOM_POLICY),
      } as BuildableShapes,
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
});
