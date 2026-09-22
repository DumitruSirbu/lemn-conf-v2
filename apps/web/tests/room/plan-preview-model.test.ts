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
  type CornerDirection,
  type MillimetreBounds,
  type RoomShape,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  PLAN_LABEL_LINE_PX,
  PLAN_MINIMUM_BOX_HEIGHT_PX,
  PLAN_WALL_THICKNESS_PX,
  derivePlanPreview,
  reflectPlanPreview,
  type DrawnPlanPreview,
  type PlanBox,
  type PlanPreview,
  type PlanWallId,
  type PlanWallLabelPx,
  type PlanWallRect,
} from "@/room/plan-preview-model";
import {
  createRoomDraft,
  withCornerDirection,
  withEnteredText,
  withStoredLength,
  type RoomDraft,
  type RoomLengthField,
} from "@/room/room-draft";

const SWEEP_RUNS = 500;

/** A pixel budget for arithmetic that has been through a scale and a centring division. It is far
 *  below the half device pixel criterion 12 allows, and well above a double's rounding. */
const FLOAT_TOLERANCE_PX = 1e-9;

/** The preview box frame 1B draws inside its card, **as it is painted in**: 390 px less the screen's
 *  and the card's padding at the frame's 104 px height, less the hairline border that is spent out of
 *  both under `border-box`. `plan-preview.tsx` works the same two pixels off each axis before it
 *  hands the box over, and `plan-preview.dom.test.ts` pins that it does. The box is an argument, so
 *  this is the shipped example — the swept boxes below are what the containment claim rests on. */
const FRAME_PREVIEW_BOX: PlanBox = { widthPx: 318, heightPx: 102 };

/** The widest a wall label was measured at in the browser, at the screen's own `700 11px Helvetica`
 *  in Chromium (7F2 S2 QA, 2026-09-22): the millimetre label *"A · 3600 mm"* is 64,2 px, and frame
 *  1C's Russian reason *"B слишком короткая"* is 116,6 px — the widest text a wall's label can hold.
 *  (The 60 px this replaced was measured on the metre label *"C · 1,20 m"*, 51,4 px, before ADR 0126
 *  and before a label could carry a reason.) It is an observation about type rather than a layout
 *  input — the model measures no text and is handed none — and it lives here so that a drawing which
 *  stops leaving room for a label fails before a customer meets one. */
const WIDEST_WALL_LABEL_PX = 117;

interface RectPx {
  readonly leftPx: number;
  readonly topPx: number;
  readonly rightPx: number;
  readonly bottomPx: number;
}

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

/** Every box a card could hand the plan, down to the smallest one it accepts — a wall's thickness and
 *  the lanes its labels are written in. The degenerate end is where an unguarded scale turns negative
 *  and the drawing leaves the box. */
function everyPreviewBox(): fc.Arbitrary<PlanBox> {
  return fc.record({
    widthPx: fc.integer({ min: PLAN_WALL_THICKNESS_PX, max: 600 }),
    heightPx: fc.integer({ min: PLAN_MINIMUM_BOX_HEIGHT_PX, max: 400 }),
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

/** The four corners of the approved rectangle. Each is an axis running out first — the widest room
 *  pins the drawing to the box's left and right edges, the deepest to its top and bottom — and a
 *  label's placement is decided against exactly those edges. */
const EXTREME_ROOMS: readonly ApprovedRoomMm[] = [
  smallestApprovedRoom(),
  largestApprovedRoom(),
  {
    wallAMm: approvedLWalls().wallA.maxMm,
    wallBMm: approvedLWalls().wallB.minMm,
  },
  {
    wallAMm: approvedLWalls().wallA.minMm,
    wallBMm: approvedLWalls().wallB.maxMm,
  },
];

/** Both corners, because half the customers see the mirrored drawing and a label reflects with the
 *  wall it names. */
const EVERY_CORNER = ["left", "right"] as const;

function turned(draft: RoomDraft, direction: CornerDirection): RoomDraft {
  return withCornerDirection(draft, direction);
}

function describeRoom(room: ApprovedRoomMm): string {
  return `${String(room.wallAMm)} x ${String(room.wallBMm)} mm`;
}

function draftWith(
  shape: RoomShape,
  lengths: readonly (readonly [RoomLengthField, number])[],
): RoomDraft {
  return lengths.reduce<RoomDraft>(
    (draft, [field, millimetres]) =>
      withStoredLength(draft, { field, millimetres }),
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

function barRectPx(bar: PlanWallRect): RectPx {
  return {
    leftPx: bar.xPx,
    topPx: bar.yPx,
    rightPx: bar.xPx + bar.widthPx,
    bottomPx: bar.yPx + bar.heightPx,
  };
}

/** The label as the browser paints it: the anchor the model placed, the widest text the catalogue can
 *  write on that line, and the direction the model said the text grows in. The width is supplied
 *  here because the model is handed none — which is exactly why a test has to do this arithmetic for
 *  a placement claim to mean anything. */
function labelRectPx(label: PlanWallLabelPx): RectPx {
  const leftPx = {
    centred: label.xPx - WIDEST_WALL_LABEL_PX / 2,
    leftAligned: label.xPx,
    rightAligned: label.xPx - WIDEST_WALL_LABEL_PX,
  }[label.alignment];

  return {
    leftPx,
    topPx: label.topPx,
    rightPx: leftPx + WIDEST_WALL_LABEL_PX,
    bottomPx: label.topPx + PLAN_LABEL_LINE_PX,
  };
}

function overlaps(one: RectPx, other: RectPx): boolean {
  return (
    one.leftPx < other.rightPx &&
    other.leftPx < one.rightPx &&
    one.topPx < other.bottomPx &&
    other.topPx < one.bottomPx
  );
}

function isInside(rect: RectPx, box: PlanBox): boolean {
  return (
    rect.leftPx >= -FLOAT_TOLERANCE_PX &&
    rect.topPx >= -FLOAT_TOLERANCE_PX &&
    rect.rightPx <= box.widthPx + FLOAT_TOLERANCE_PX &&
    rect.bottomPx <= box.heightPx + FLOAT_TOLERANCE_PX
  );
}

/** Every label of a plan against every bar of it, named by both so a failure says which pair. */
function labelsOverBarsIn(plan: DrawnPlanPreview): readonly string[] {
  return plan.walls.flatMap((labelled) =>
    plan.walls
      .filter((bar) => overlaps(labelRectPx(labelled.labelPx), barRectPx(bar)))
      .map((bar) => `${labelled.wall}'s label over wall ${bar.wall}`),
  );
}

function labelsOutsideTheBoxIn(
  plan: DrawnPlanPreview,
  box: PlanBox,
): readonly string[] {
  return plan.walls
    .filter((labelled) => !isInside(labelRectPx(labelled.labelPx), box))
    .map((labelled) => `${labelled.wall}'s label`);
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

// **The defect these were written for**: the model placed no label at all, and the renderer put wall
// A's under wall A — inside the band the walls running down the screen occupy. At 2,50 x 5,00 m the
// label is wider than wall A is long, so wall B's bar printed through *"A · 2,50 m"* over the whole
// height of the text, in an ordinary kitchen. A sweep cannot find that by drawing harder: it is
// found by asserting where the label went, against the bars, in the pixels it is painted in.
describe("derivePlanPreview — no bar is ever painted over a label", () => {
  it("keeps wall A's label clear of wall B's bar in a 2,50 x 5,00 m kitchen", () => {
    const plan = drawnPlan(
      lDraftFor({ wallAMm: 2500, wallBMm: 5000 }),
      FRAME_PREVIEW_BOX,
    );

    expect(labelsOverBarsIn(plan)).toEqual([]);
  });

  it("keeps every label clear of every bar, for any approved L room", () => {
    fc.assert(
      fc.property(everyApprovedLRoom(), (room) => {
        expect(
          labelsOverBarsIn(drawnPlan(lDraftFor(room), FRAME_PREVIEW_BOX)),
        ).toEqual([]);
      }),
      { numRuns: SWEEP_RUNS },
    );
  });

  // Wave 7F2 S2 QA finding 1: a wall drawn shorter than a label's line is tall — B typed at 100 mm
  // beside a 3600 mm wall A — centred its label's line up into wall A's bar. Approved rooms never
  // draw a bar that short in this box, so the population is every wall a field can hold on the way
  // to a room, from its first digit.
  it.each(EVERY_CORNER)(
    "keeps every label clear of every bar in a %s-turning L typed with any walls from 1 mm",
    (direction) => {
      const anyTypedWallMm = fc.integer({ min: 1, max: 7000 });
      fc.assert(
        fc.property(anyTypedWallMm, anyTypedWallMm, (wallAMm, wallBMm) => {
          const plan = drawnPlan(
            turned(lDraftFor({ wallAMm, wallBMm }), direction),
            FRAME_PREVIEW_BOX,
          );

          expect(labelsOverBarsIn(plan)).toEqual([]);
        }),
        { numRuns: SWEEP_RUNS, examples: [[3600, 100]] },
      );
    },
  );

  it.each(EVERY_CORNER)(
    "keeps every label clear of every bar in a %s-turning U",
    (direction) => {
      for (const room of EXTREME_ROOMS) {
        const plan = drawnPlan(
          turned(uDraftFor(room), direction),
          FRAME_PREVIEW_BOX,
        );

        expect(labelsOverBarsIn(plan), describeRoom(room)).toEqual([]);
      }
    },
  );

  // The lane is the guarantee, and it holds in any box for any room: a label written above the
  // drawing is written where the layout paints nothing, so no text width can make it collide.
  it("writes an across-the-screen wall's label above every bar, in any box", () => {
    fc.assert(
      fc.property(everyApprovedLRoom(), everyPreviewBox(), (room, box) => {
        const plan = drawnPlan(lDraftFor(room), box);
        const bottomOfTheLabelPx =
          wall(plan, "A").labelPx.topPx + PLAN_LABEL_LINE_PX;

        expect(wall(plan, "A").labelPx.topPx).toBeGreaterThanOrEqual(
          -FLOAT_TOLERANCE_PX,
        );
        for (const bar of plan.walls) {
          expect(bottomOfTheLabelPx).toBeLessThanOrEqual(
            bar.yPx + FLOAT_TOLERANCE_PX,
          );
        }
      }),
      { numRuns: SWEEP_RUNS },
    );
  });
});

// **The defect these were written for**: a wall that runs down the screen was labelled to the right
// of its bar whatever stood there. A U's far wall *is* the drawing's right edge, so at
// 6,30 x 1,20 x 1,20 m wall C's label resolved to x 325 → 376 in a box 318 wide: three walls drawn,
// two labels visible. U is not continuable yet, but the side a label goes on is the same logic for
// every wall that runs down the screen.
/** Every pair of a plan's labels whose lines overlap, at the widest label a wall can carry. */
function labelsOverLabelsIn(plan: DrawnPlanPreview): readonly string[] {
  return plan.walls.flatMap((one, index) =>
    plan.walls
      .slice(index + 1)
      .filter((other) =>
        overlaps(labelRectPx(one.labelPx), labelRectPx(other.labelPx)),
      )
      .map((other) => `${one.wall}'s label over ${other.wall}'s`),
  );
}

interface TypedUWallsMm {
  readonly wallAMm: number;
  readonly wallBMm: number;
  readonly wallCMm: number;
}

function typedUDraft(
  { wallAMm, wallBMm, wallCMm }: TypedUWallsMm,
  direction: CornerDirection,
): RoomDraft {
  const typed = (
    [
      ["wallA", wallAMm],
      ["wallB", wallBMm],
      ["wallC", wallCMm],
    ] as const
  ).reduce<RoomDraft>(
    (draft, [field, millimetres]) =>
      withEnteredText(draft, { field, text: String(millimetres) }),
    createRoomDraft("U"),
  );
  return turned(typed, direction);
}

/** B and C drawn on one bar: wall A no wider than a wall is thick, so C stands exactly where B does. */
function drawsBAndCOnOneBar(plan: DrawnPlanPreview): boolean {
  return (
    wall(plan, "B").xPx === wall(plan, "C").xPx &&
    wall(plan, "B").widthPx === wall(plan, "C").widthPx
  );
}

/** A U typed from its first digit with a wall A short enough, against B and C, to draw no wider than
 *  a wall is thick at this box's scale — the population where B and C coincide. */
const aUWithBAndCOnOneBar: fc.Arbitrary<TypedUWallsMm> = fc
  .record({
    wallAMm: fc.integer({ min: 1, max: 400 }),
    wallBMm: fc.integer({ min: 1, max: 7000 }),
    wallCMm: fc.integer({ min: 1, max: 7000 }),
  })
  .filter((walls) =>
    drawsBAndCOnOneBar(
      drawnPlan(typedUDraft(walls, "left"), FRAME_PREVIEW_BOX),
    ),
  );

// Wave 7F2 S2 review, R1.1: a U whose wall A draws no wider than a wall is thick puts C exactly on
// B's bar, neither blocked a side of the other, and both labels took one anchor. The tie is broken by
// wall id, following the anchor: B on the corner's outside, C on the far side.
describe("derivePlanPreview — two walls drawn on one bar are labelled on opposite sides", () => {
  it.each(EVERY_CORNER)(
    "keeps every label's line clear of every other label's in a %s-turning U whose B and C coincide",
    (direction) => {
      fc.assert(
        fc.property(aUWithBAndCOnOneBar, (walls) => {
          const plan = drawnPlan(
            typedUDraft(walls, direction),
            FRAME_PREVIEW_BOX,
          );

          expect(labelsOverLabelsIn(plan)).toEqual([]);
        }),
        {
          numRuns: SWEEP_RUNS,
          examples: [
            [{ wallAMm: 3, wallBMm: 2400, wallCMm: 2400 }],
            [{ wallAMm: 36, wallBMm: 2400, wallCMm: 2400 }],
            [{ wallAMm: 360, wallBMm: 2400, wallCMm: 2400 }],
            [{ wallAMm: 360, wallBMm: 2400, wallCMm: 2300 }],
          ],
        },
      );
    },
  );

  it("writes B's label on the corner's outside and C's on the far side, in the left-turning plan", () => {
    const plan = drawnPlan(
      typedUDraft({ wallAMm: 3, wallBMm: 2400, wallCMm: 2400 }, "left"),
      FRAME_PREVIEW_BOX,
    );

    expect(wall(plan, "B").labelPx.alignment).toBe("rightAligned");
    expect(wall(plan, "C").labelPx.alignment).toBe("leftAligned");
  });

  it("carries each label with its wall through the mirror", () => {
    const walls = { wallAMm: 360, wallBMm: 2400, wallCMm: 2300 };
    const left = drawnPlan(typedUDraft(walls, "left"), FRAME_PREVIEW_BOX);

    expect(drawnPlan(typedUDraft(walls, "right"), FRAME_PREVIEW_BOX)).toEqual(
      reflectPlanPreview(left),
    );
    expect(wall(asDrawn(reflectPlanPreview(left)), "B").labelPx.alignment).toBe(
      "leftAligned",
    );
  });
});

describe("derivePlanPreview — no label is ever written off the box", () => {
  it("turns a U's far-wall label into the room rather than off the right edge", () => {
    const plan = drawnPlan(
      uDraftFor({
        wallAMm: approvedLWalls().wallA.maxMm,
        wallBMm: approvedLWalls().wallB.minMm,
      }),
      FRAME_PREVIEW_BOX,
    );

    expect(wall(plan, "C").labelPx.alignment).toBe("rightAligned");
    expect(labelsOutsideTheBoxIn(plan, FRAME_PREVIEW_BOX)).toEqual([]);
  });

  it("keeps every label inside the box, for any approved L room", () => {
    fc.assert(
      fc.property(everyApprovedLRoom(), (room) => {
        expect(
          labelsOutsideTheBoxIn(
            drawnPlan(lDraftFor(room), FRAME_PREVIEW_BOX),
            FRAME_PREVIEW_BOX,
          ),
        ).toEqual([]);
      }),
      { numRuns: SWEEP_RUNS },
    );
  });

  it.each(EVERY_CORNER)(
    "keeps every label inside the box in a %s-turning U",
    (direction) => {
      for (const room of EXTREME_ROOMS) {
        const plan = drawnPlan(
          turned(uDraftFor(room), direction),
          FRAME_PREVIEW_BOX,
        );

        expect(
          labelsOutsideTheBoxIn(plan, FRAME_PREVIEW_BOX),
          describeRoom(room),
        ).toEqual([]);
      }
    },
  );

  // A box smaller than the frame's cannot hold the widest label beside a wall, so what is claimed
  // there is the weaker thing that still matters: the line a label is written on is in the box.
  it("writes every label on a line inside the box, in any box", () => {
    fc.assert(
      fc.property(everyApprovedLRoom(), everyPreviewBox(), (room, box) => {
        for (const labelled of drawnPlan(lDraftFor(room), box).walls) {
          expect(labelled.labelPx.xPx).toBeGreaterThanOrEqual(
            -FLOAT_TOLERANCE_PX,
          );
          expect(labelled.labelPx.xPx).toBeLessThanOrEqual(
            box.widthPx + FLOAT_TOLERANCE_PX,
          );
          expect(labelled.labelPx.topPx).toBeGreaterThanOrEqual(
            -FLOAT_TOLERANCE_PX,
          );
          expect(
            labelled.labelPx.topPx + PLAN_LABEL_LINE_PX,
          ).toBeLessThanOrEqual(box.heightPx + FLOAT_TOLERANCE_PX);
        }
      }),
      { numRuns: SWEEP_RUNS },
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

  it("draws the same plan from typed digits as from the same millimetres stored (ADR 0126, S1b-10)", () => {
    // S1b changes the notation a field is typed in and never the geometry: the anchor, the scale and
    // the field-to-wall dependency read the draft's millimetres only.
    fc.assert(
      fc.property(everyApprovedLRoom(), everyPreviewBox(), (room, box) => {
        const typed = (
          [
            ["wallA", room.wallAMm],
            ["wallB", room.wallBMm],
            ["height", APPROVED_ROOM_POLICY.heightBounds.minMm],
          ] as const
        ).reduce<RoomDraft>(
          (draft, [field, millimetres]) =>
            withEnteredText(draft, { field, text: String(millimetres) }),
          createRoomDraft("L"),
        );

        expect(JSON.stringify(derivePlanPreview(typed, box))).toBe(
          JSON.stringify(derivePlanPreview(lDraftFor(room), box)),
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

  // Amended in 7F2 S5 by the owner's ruling Q-7F2-3 = (a). It claimed "draws wall A alone from the
  // first readable keystroke" on an L — which drew exactly a linear room (criterion 8's L{A}).
  it("draws wall A alone only for a linear room, where wall A is the whole shape", () => {
    const wallAMm = smallestApprovedRoom().wallAMm;
    const wallAOnlyAs = (shape: RoomShape) =>
      derivePlanPreview(
        draftWith(shape, [["wallA", wallAMm]]),
        FRAME_PREVIEW_BOX,
      );

    expect(wallAOnlyAs("L").kind).toBe("empty");
    expect(wallAOnlyAs("U").kind).toBe("empty");
    expect(wallIdsIn(wallAOnlyAs("linear"))).toEqual(["A"]);
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

// Wave 7F2 criterion 8, under the owner's ruling Q-7F2-3 = (a): the plan draws nothing until every
// wall of the chosen shape reads as a length. A part of one shape is another shape's whole — U{A,B} is
// an L, U{A} and L{A} are a linear room — so a plan that drew what was readable showed a room the
// customer did not choose. Swept over every proper subset of every shape's walls, with each missing
// wall either untouched or holding text the entry parser refuses.
type WallField = Exclude<RoomLengthField, "height">;

const WALLS_OF_SHAPE: Readonly<Record<RoomShape, readonly WallField[]>> = {
  linear: ["wallA"],
  L: ["wallA", "wallB"],
  U: ["wallA", "wallB", "wallC"],
};

const EVERY_SHAPE = Object.keys(WALLS_OF_SHAPE) as readonly RoomShape[];

/** Text a customer can leave in a field that reads as no length at all (ADR 0126, C-S1b-2). */
const UNREADABLE_TEXTS = ["abc", "0", "3,6", "3600mm"] as const;

interface IncompleteDraftCase {
  readonly shape: RoomShape;
  readonly present: readonly WallField[];
  readonly missingText: readonly (string | undefined)[];
  readonly wallsMm: Readonly<Record<WallField, number>>;
  readonly direction: CornerDirection;
  readonly box: PlanBox;
}

function everyProperSubsetOf(
  fields: readonly WallField[],
): fc.Arbitrary<readonly WallField[]> {
  return fc.subarray([...fields], { maxLength: fields.length - 1 });
}

function everyIncompleteDraftCase(): fc.Arbitrary<IncompleteDraftCase> {
  const typedWallMm = fc.integer({ min: 1, max: 7000 });
  return fc.constantFrom(...EVERY_SHAPE).chain((shape) =>
    fc.record({
      shape: fc.constant(shape),
      present: everyProperSubsetOf(WALLS_OF_SHAPE[shape]),
      missingText: fc.array(
        fc.option(fc.constantFrom(...UNREADABLE_TEXTS), { nil: undefined }),
        { minLength: 3, maxLength: 3 },
      ),
      wallsMm: fc.record({
        wallA: typedWallMm,
        wallB: typedWallMm,
        wallC: typedWallMm,
      }),
      direction: fc.constantFrom(...EVERY_CORNER),
      box: everyPreviewBox(),
    }),
  );
}

/** The chosen shape with only `present` typed; every other wall untouched or left unreadable. */
function incompleteDraftOf(testCase: IncompleteDraftCase): RoomDraft {
  const typed = WALLS_OF_SHAPE[testCase.shape].reduce<RoomDraft>(
    (draft, field, index) => {
      const text = testCase.present.includes(field)
        ? String(testCase.wallsMm[field])
        : testCase.missingText[index];
      return text === undefined
        ? draft
        : withEnteredText(draft, { field, text });
    },
    createRoomDraft(testCase.shape),
  );
  return turned(typed, testCase.direction);
}

/** Another shape, every one of its walls typed at the same values. */
function completeDraftOf(
  shape: RoomShape,
  testCase: IncompleteDraftCase,
): RoomDraft {
  const typed = draftWith(
    shape,
    WALLS_OF_SHAPE[shape].map(
      (field) => [field, testCase.wallsMm[field]] as const,
    ),
  );
  return turned(typed, testCase.direction);
}

describe("derivePlanPreview — the plan never draws another shape (7F2 criterion 8, Q-7F2-3 = a)", () => {
  it("draws the empty plan while any wall the shape asks for is missing or unreadable", () => {
    fc.assert(
      fc.property(everyIncompleteDraftCase(), (testCase) => {
        expect(
          derivePlanPreview(incompleteDraftOf(testCase), testCase.box),
        ).toEqual({
          kind: "empty",
          boxPx: testCase.box,
        });
      }),
      { numRuns: SWEEP_RUNS },
    );
  });

  it("never draws an incomplete draft as another shape's complete drawing at the same values", () => {
    fc.assert(
      fc.property(everyIncompleteDraftCase(), (testCase) => {
        const incomplete = JSON.stringify(
          derivePlanPreview(incompleteDraftOf(testCase), testCase.box),
        );

        for (const other of EVERY_SHAPE.filter(
          (shape) => shape !== testCase.shape,
        )) {
          const complete = derivePlanPreview(
            completeDraftOf(other, testCase),
            testCase.box,
          );
          expect(complete.kind, `${other} complete`).toBe("drawn");
          expect(incomplete, `${testCase.shape} drawn as ${other}`).not.toBe(
            JSON.stringify(complete),
          );
        }
      }),
      { numRuns: SWEEP_RUNS },
    );
  });

  it.each([
    ["U with walls A and B", "L", "U", ["wallA", "wallB"]],
    ["U with wall A", "linear", "U", ["wallA"]],
    ["L with wall A", "linear", "L", ["wallA"]],
  ] as const)(
    "draws %s as nothing rather than as the complete %s — a measured violation (S0 measurement 3)",
    (_name, other, shape, present) => {
      const testCase: IncompleteDraftCase = {
        shape,
        present,
        missingText: [undefined, undefined, undefined],
        wallsMm: { wallA: 3600, wallB: 2400, wallC: 1200 },
        direction: "left",
        box: FRAME_PREVIEW_BOX,
      };

      expect(
        derivePlanPreview(incompleteDraftOf(testCase), FRAME_PREVIEW_BOX).kind,
      ).toBe("empty");
      expect(
        derivePlanPreview(completeDraftOf(other, testCase), FRAME_PREVIEW_BOX)
          .kind,
      ).toBe("drawn");
    },
  );

  it("draws nothing for an L whose wall A is unreadable, where it drew wall B alone (S0 measurement 3, its extra observation)", () => {
    const draft = withEnteredText(draftWith("L", [["wallB", 2400]]), {
      field: "wallA",
      text: "abc",
    });

    expect(derivePlanPreview(draft, FRAME_PREVIEW_BOX).kind).toBe("empty");
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
