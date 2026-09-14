// Wave 7F1 slice 3: the plan's geometry, proved as values before any component draws it —
// criterion 12 (one isotropic scale, containment, a wall thickness that does not scale, and the
// adopted +X/+Z anchor), criterion 13's property arm (mirroring is a reflection and nothing else)
// and criterion 11's purity arm.
//
// The scale and the containment claims are swept rather than sampled because both are set by
// whichever axis runs out first, and a hand-picked room only ever exercises one of the two.
import { fc } from "@fast-check/vitest";
import {
  APPROVED_ROOM_POLICY,
  type MillimetreBounds,
  type RoomShape,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  PLAN_WALL_THICKNESS_PX,
  derivePlanPreview,
  reflectPlanPreview,
  type DrawnPlanPreview,
  type PlanBox,
  type PlanPreview,
  type PlanWallId,
  type PlanWallRect,
} from "@/room/plan-preview-model";
import {
  createRoomDraft,
  withCornerDirection,
  withStoredLength,
  type RoomDraft,
  type RoomLengthField,
} from "@/room/room-draft";

const SWEEP_RUNS = 500;

const A_PRODUCT_LOCALE = "ro";

/** A pixel budget for arithmetic that has been through a scale and a centring division. It is far
 *  below the half device pixel criterion 12 allows, and well above a double's rounding. */
const FLOAT_TOLERANCE_PX = 1e-9;

/** Roughly the preview box frame 1B draws inside its card: 390 px less the screen's and the card's
 *  padding, at the frame's 104 px height. The box is an argument, so this is an example and not a
 *  contract — the swept boxes below are what the containment claim actually rests on. */
const FRAME_PREVIEW_BOX: PlanBox = { widthPx: 320, heightPx: 104 };

interface ApprovedRoomMm {
  readonly wallAMm: number;
  readonly wallBMm: number;
}

function approvedLWalls() {
  const walls = APPROVED_ROOM_POLICY.buildableShapes.L;
  if (walls === undefined) {
    throw new Error("the approved policy states no L walls to sweep");
  }
  return walls;
}

function everyMillimetreIn(bounds: MillimetreBounds): fc.Arbitrary<number> {
  return fc.integer({ min: bounds.minMm, max: bounds.maxMm });
}

function everyApprovedLRoom(): fc.Arbitrary<ApprovedRoomMm> {
  const walls = approvedLWalls();
  return fc.record({
    wallAMm: everyMillimetreIn(walls.wallA),
    wallBMm: everyMillimetreIn(walls.wallB),
  });
}

/** Every box a card could hand the plan, down to one that barely holds a wall: the degenerate end is
 *  where an unguarded scale turns negative and the drawing leaves the box. */
function everyPreviewBox(): fc.Arbitrary<PlanBox> {
  return fc.record({
    widthPx: fc.integer({ min: PLAN_WALL_THICKNESS_PX, max: 600 }),
    heightPx: fc.integer({ min: PLAN_WALL_THICKNESS_PX + 1, max: 400 }),
  });
}

function smallestApprovedRoom(): ApprovedRoomMm {
  const walls = approvedLWalls();
  return { wallAMm: walls.wallA.minMm, wallBMm: walls.wallB.minMm };
}

function largestApprovedRoom(): ApprovedRoomMm {
  const walls = approvedLWalls();
  return { wallAMm: walls.wallA.maxMm, wallBMm: walls.wallB.maxMm };
}

function draftWith(
  shape: RoomShape,
  lengths: readonly (readonly [RoomLengthField, number])[],
): RoomDraft {
  return lengths.reduce<RoomDraft>(
    (draft, [field, millimetres]) =>
      withStoredLength(draft, { field, millimetres, locale: A_PRODUCT_LOCALE }),
    createRoomDraft(shape),
  );
}

function lDraftFor(room: ApprovedRoomMm): RoomDraft {
  return draftWith("L", [
    ["wallA", room.wallAMm],
    ["wallB", room.wallBMm],
    ["height", APPROVED_ROOM_POLICY.heightBounds.minMm],
  ]);
}

function uDraftFor(room: ApprovedRoomMm): RoomDraft {
  return draftWith("U", [
    ["wallA", room.wallAMm],
    ["wallB", room.wallBMm],
    ["wallC", room.wallBMm],
    ["height", APPROVED_ROOM_POLICY.heightBounds.minMm],
  ]);
}

function asDrawn(plan: PlanPreview): DrawnPlanPreview {
  if (plan.kind !== "drawn") {
    throw new Error("the draft under test was expected to draw a plan");
  }
  return plan;
}

function drawnPlan(draft: RoomDraft, box: PlanBox): DrawnPlanPreview {
  return asDrawn(derivePlanPreview(draft, box));
}

function wall(plan: DrawnPlanPreview, wallId: PlanWallId): PlanWallRect {
  const found = plan.walls.find((candidate) => candidate.wall === wallId);
  if (found === undefined) {
    throw new Error(`the plan under test draws no wall ${wallId}`);
  }
  return found;
}

function wallIdsIn(plan: PlanPreview): readonly PlanWallId[] {
  return plan.kind === "drawn" ? plan.walls.map((drawn) => drawn.wall) : [];
}

describe("derivePlanPreview — one isotropic scale for both axes", () => {
  it("draws both walls at the same scale, so the plan keeps the room's proportions", () => {
    fc.assert(
      fc.property(everyApprovedLRoom(), everyPreviewBox(), (room, box) => {
        const plan = drawnPlan(lDraftFor(room), box);

        expect(wall(plan, "A").widthPx).toBeCloseTo(
          room.wallAMm * plan.scalePxPerMm,
          9,
        );
        expect(wall(plan, "B").heightPx).toBeCloseTo(
          room.wallBMm * plan.scalePxPerMm,
          9,
        );
      }),
      { numRuns: SWEEP_RUNS },
    );
  });

  it("keeps the drawn ratio within half a device pixel of the entered ratio", () => {
    fc.assert(
      fc.property(everyApprovedLRoom(), everyPreviewBox(), (room, box) => {
        const plan = drawnPlan(lDraftFor(room), box);
        const enteredRatio = room.wallAMm / room.wallBMm;

        expect(
          Math.abs(
            wall(plan, "A").widthPx - enteredRatio * wall(plan, "B").heightPx,
          ),
        ).toBeLessThanOrEqual(0.5);
      }),
      { numRuns: SWEEP_RUNS },
    );
  });

  // The failure this names: an axis-independent normalisation fills the box on both axes and draws
  // every room as the same rectangle — which is what the frame's two example scales look like.
  it("draws a long shallow room long and shallow, and not as a square", () => {
    const walls = approvedLWalls();
    const plan = drawnPlan(
      lDraftFor({ wallAMm: walls.wallA.maxMm, wallBMm: walls.wallB.minMm }),
      FRAME_PREVIEW_BOX,
    );

    expect(wall(plan, "A").widthPx).toBeGreaterThan(
      wall(plan, "B").heightPx * 2,
    );
  });
});

describe("derivePlanPreview — the drawing never leaves the box", () => {
  it("keeps every wall inside the box, for any approved room in any box", () => {
    fc.assert(
      fc.property(everyApprovedLRoom(), everyPreviewBox(), (room, box) => {
        const plan = drawnPlan(lDraftFor(room), box);

        for (const drawn of plan.walls) {
          expect(drawn.xPx).toBeGreaterThanOrEqual(-FLOAT_TOLERANCE_PX);
          expect(drawn.yPx).toBeGreaterThanOrEqual(-FLOAT_TOLERANCE_PX);
          expect(drawn.xPx + drawn.widthPx).toBeLessThanOrEqual(
            box.widthPx + FLOAT_TOLERANCE_PX,
          );
          expect(drawn.yPx + drawn.heightPx).toBeLessThanOrEqual(
            box.heightPx + FLOAT_TOLERANCE_PX,
          );
        }
      }),
      { numRuns: SWEEP_RUNS },
    );
  });

  it.each([
    ["the smallest", smallestApprovedRoom()],
    ["the largest", largestApprovedRoom()],
  ] as const)("fits %s approved room in the frame's box", (_name, room) => {
    const plan = drawnPlan(lDraftFor(room), FRAME_PREVIEW_BOX);

    expect(plan.contentPx.widthPx).toBeLessThanOrEqual(
      FRAME_PREVIEW_BOX.widthPx + FLOAT_TOLERANCE_PX,
    );
    expect(plan.contentPx.heightPx).toBeLessThanOrEqual(
      FRAME_PREVIEW_BOX.heightPx + FLOAT_TOLERANCE_PX,
    );
  });
});

describe("derivePlanPreview — the wall thickness is a drawing constant", () => {
  it("draws every wall the same thickness whatever the room measures", () => {
    fc.assert(
      fc.property(everyApprovedLRoom(), everyPreviewBox(), (room, box) => {
        const plan = drawnPlan(lDraftFor(room), box);

        expect(wall(plan, "A").heightPx).toBe(PLAN_WALL_THICKNESS_PX);
        expect(wall(plan, "B").widthPx).toBe(PLAN_WALL_THICKNESS_PX);
      }),
      { numRuns: SWEEP_RUNS },
    );
  });

  it("draws the smallest and the largest approved room with identical walls", () => {
    const smallest = drawnPlan(
      lDraftFor(smallestApprovedRoom()),
      FRAME_PREVIEW_BOX,
    );
    const largest = drawnPlan(
      lDraftFor(largestApprovedRoom()),
      FRAME_PREVIEW_BOX,
    );

    expect(wall(largest, "A").heightPx).toBe(wall(smallest, "A").heightPx);
    expect(wall(largest, "B").widthPx).toBe(wall(smallest, "B").widthPx);
  });
});

// `room-transforms.ts:29-49`: wall A's tangent is +X and wall B's is +Z, out of the corner where
// they meet at (0,0,0). A view from above looks *down*, so +Z runs down the screen. An inverted plan
// would pass every other test in this file, which is why these are asserted by name.
describe("derivePlanPreview — the anchor: +X to the right, +Z down the screen", () => {
  it("runs wall A right from the corner, along the top", () => {
    const plan = drawnPlan(
      lDraftFor(smallestApprovedRoom()),
      FRAME_PREVIEW_BOX,
    );

    expect(wall(plan, "A").xPx).toBe(plan.cornerPx.xPx);
    expect(wall(plan, "A").yPx).toBe(plan.cornerPx.yPx);
    expect(wall(plan, "A").widthPx).toBeGreaterThan(0);
  });

  it("runs wall B down the screen from the same corner, never up it", () => {
    const plan = drawnPlan(
      lDraftFor(smallestApprovedRoom()),
      FRAME_PREVIEW_BOX,
    );

    expect(wall(plan, "B").yPx).toBeGreaterThan(wall(plan, "A").yPx);
    expect(wall(plan, "B").yPx).toBe(
      plan.cornerPx.yPx + PLAN_WALL_THICKNESS_PX,
    );
    expect(wall(plan, "B").yPx + wall(plan, "B").heightPx).toBeGreaterThan(
      plan.cornerPx.yPx,
    );
  });

  it("puts the corner at the top of the drawing, not the bottom", () => {
    const plan = drawnPlan(lDraftFor(largestApprovedRoom()), FRAME_PREVIEW_BOX);

    const topmostPx = Math.min(...plan.walls.map((drawn) => drawn.yPx));
    expect(topmostPx).toBe(plan.cornerPx.yPx);
  });

  // A tall, narrow box on purpose: it leaves wall A as the axis that sets the scale, so a deeper
  // room is drawn deeper instead of being re-scaled to the same saturated height.
  it("reaches further down the screen the deeper the room is", () => {
    const tallBox: PlanBox = { widthPx: 100, heightPx: 400 };
    const walls = approvedLWalls();
    const bottomOf = (plan: DrawnPlanPreview) =>
      wall(plan, "B").yPx + wall(plan, "B").heightPx;

    const shallow = drawnPlan(
      lDraftFor({ wallAMm: walls.wallA.maxMm, wallBMm: walls.wallB.minMm }),
      tallBox,
    );
    const deep = drawnPlan(
      lDraftFor({ wallAMm: walls.wallA.maxMm, wallBMm: walls.wallB.maxMm }),
      tallBox,
    );

    expect(bottomOf(deep)).toBeGreaterThan(bottomOf(shallow));
  });
});

describe("reflectPlanPreview — mirroring reflects the drawing and nothing else", () => {
  it("draws a right-turning corner as the reflection of the left-turning one", () => {
    fc.assert(
      fc.property(everyApprovedLRoom(), everyPreviewBox(), (room, box) => {
        const left = lDraftFor(room);
        const right = withCornerDirection(left, "right");

        expect(reflectPlanPreview(derivePlanPreview(left, box))).toEqual(
          derivePlanPreview(right, box),
        );
      }),
      { numRuns: SWEEP_RUNS },
    );
  });

  it("hangs the room off the other side of the corner once mirrored", () => {
    const room = lDraftFor(smallestApprovedRoom());
    const left = drawnPlan(room, FRAME_PREVIEW_BOX);
    const right = drawnPlan(
      withCornerDirection(room, "right"),
      FRAME_PREVIEW_BOX,
    );

    expect(right.cornerPx.xPx).toBeGreaterThan(left.cornerPx.xPx);
    expect(wall(right, "A").xPx).toBeLessThan(right.cornerPx.xPx);
    expect(wall(right, "A").xPx + wall(right, "A").widthPx).toBeCloseTo(
      right.cornerPx.xPx,
      9,
    );
  });

  it("moves no wall onto the other's length and changes no measurement", () => {
    const room = lDraftFor(smallestApprovedRoom());
    const left = drawnPlan(room, FRAME_PREVIEW_BOX);
    const right = drawnPlan(
      withCornerDirection(room, "right"),
      FRAME_PREVIEW_BOX,
    );

    expect(right.scalePxPerMm).toBe(left.scalePxPerMm);
    expect(right.walls.map((drawn) => [drawn.wall, drawn.lengthMm])).toEqual(
      left.walls.map((drawn) => [drawn.wall, drawn.lengthMm]),
    );
    expect(wall(right, "A").widthPx).toBe(wall(left, "A").widthPx);
    expect(wall(right, "B").heightPx).toBe(wall(left, "B").heightPx);
  });

  it("returns the drawing it started from when applied twice", () => {
    fc.assert(
      fc.property(everyApprovedLRoom(), everyPreviewBox(), (room, box) => {
        const once = drawnPlan(lDraftFor(room), box);
        const twice = asDrawn(reflectPlanPreview(reflectPlanPreview(once)));

        expect(wallIdsIn(twice)).toEqual(wallIdsIn(once));
        for (const drawn of once.walls) {
          expect(wall(twice, drawn.wall).xPx).toBeCloseTo(drawn.xPx, 9);
          expect(wall(twice, drawn.wall).yPx).toBe(drawn.yPx);
        }
      }),
      { numRuns: SWEEP_RUNS },
    );
  });
});

describe("derivePlanPreview — a pure function of the draft and the box", () => {
  it("gives a byte-identical drawing for identical arguments", () => {
    fc.assert(
      fc.property(everyApprovedLRoom(), everyPreviewBox(), (room, box) => {
        const draft = lDraftFor(room);

        expect(JSON.stringify(derivePlanPreview(draft, box))).toBe(
          JSON.stringify(derivePlanPreview(draft, box)),
        );
      }),
      { numRuns: SWEEP_RUNS },
    );
  });

  it("edits neither the draft nor the box it was handed", () => {
    const draft = lDraftFor(smallestApprovedRoom());
    const draftBefore = structuredClone(draft);
    const box = { ...FRAME_PREVIEW_BOX };
    Object.values(draft.lengths).forEach((length) => Object.freeze(length));
    Object.freeze(draft.lengths);

    drawnPlan(Object.freeze(draft), Object.freeze(box));

    expect(draft).toEqual(draftBefore);
    expect(box).toEqual(FRAME_PREVIEW_BOX);
  });
});

describe("derivePlanPreview — what a shape draws", () => {
  it("draws nothing at all until a field reads as a length", () => {
    expect(derivePlanPreview(createRoomDraft("L"), FRAME_PREVIEW_BOX)).toEqual({
      kind: "empty",
      boxPx: FRAME_PREVIEW_BOX,
    });
  });

  it("draws wall A alone from the first readable keystroke", () => {
    const draft = draftWith("L", [["wallA", smallestApprovedRoom().wallAMm]]);

    expect(wallIdsIn(derivePlanPreview(draft, FRAME_PREVIEW_BOX))).toEqual([
      "A",
    ]);
  });

  it("draws only the walls the chosen shape asks about", () => {
    const room = largestApprovedRoom();

    expect(
      wallIdsIn(derivePlanPreview(lDraftFor(room), FRAME_PREVIEW_BOX)),
    ).toEqual(["A", "B"]);
    expect(
      wallIdsIn(derivePlanPreview(uDraftFor(room), FRAME_PREVIEW_BOX)),
    ).toEqual(["A", "B", "C"]);
  });

  it("leaves a wall the shape stopped asking about out of the drawing", () => {
    const room = largestApprovedRoom();
    const typedAsAnL = lDraftFor(room);

    const straightened = { ...typedAsAnL, shape: "linear" as const };

    expect(
      wallIdsIn(derivePlanPreview(straightened, FRAME_PREVIEW_BOX)),
    ).toEqual(["A"]);
  });

  it("closes a U at the far end of wall A", () => {
    const plan = drawnPlan(uDraftFor(largestApprovedRoom()), FRAME_PREVIEW_BOX);

    expect(wall(plan, "C").xPx + wall(plan, "C").widthPx).toBeCloseTo(
      wall(plan, "A").xPx + wall(plan, "A").widthPx,
      9,
    );
    expect(wall(plan, "C").yPx).toBe(wall(plan, "B").yPx);
  });
});

describe("derivePlanPreview — a box too small to draw in", () => {
  it.each([
    ["shorter than a wall is thick", { widthPx: 320, heightPx: 4 }],
    ["narrower than a wall is thick", { widthPx: 4, heightPx: 104 }],
    ["not a measurement at all", { widthPx: Number.NaN, heightPx: 104 }],
  ] as const)("refuses a box %s", (_name, box) => {
    expect(() =>
      derivePlanPreview(lDraftFor(smallestApprovedRoom()), box),
    ).toThrow(RangeError);
  });
});
