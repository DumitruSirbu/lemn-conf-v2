// Wave 7L slice S2, acceptance criterion 7's property arm: "≥ 100 samples per arm (L left, L right,
// linear, U with walls missing), boxes from the set's minimum to 900 x 700, both sets: one px/mm for
// every drawn wall (±1 px over the longest wall); every bar and label inside the box; no label over a
// bar." `plan-preview-model.test.ts` already proves these claims for the phone's own metric set; this
// file is the same claims, generalised over `PlanPreviewMetrics` so the desktop panel's 26 / 14 / 20 px
// set (D1B, D6b) is provably no less sound than the phone's — one model, never two.
import { fc } from "@fast-check/vitest";
import {
  APPROVED_ROOM_POLICY,
  type CornerDirection,
  type MillimetreBounds,
  type RoomShape,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_PLAN_PREVIEW_METRICS,
  derivePlanPreview,
  planPreviewMinimumBoxPx,
  type PlanBox,
  type PlanPreviewMetrics,
  type PlanWallLabelPx,
  type PlanWallRect,
} from "@/room/plan-preview-model";
import {
  createRoomDraft,
  withCornerDirection,
  withStoredLength,
  type RoomDraft,
  type RoomLengthField,
} from "@/room/room-draft";

/** ≥ 100 samples per arm, criterion 7's own floor. */
const SAMPLES_PER_ARM = 120;

/** A pixel budget for arithmetic that has been through a scale and a centring division — the same
 *  tolerance `plan-preview-model.test.ts` sweeps the phone's own set at. */
const FLOAT_TOLERANCE_PX = 1e-9;

/** D1B's own set (`Desktop.dc.html:183, 185`; 7L D6b), restated here rather than imported from
 *  `plan-preview.tsx` — a component-level constant, and this file proves the model over metric sets
 *  in the abstract rather than trusting one particular component's choice of them. */
const DESKTOP_METRICS: PlanPreviewMetrics = {
  wallThicknessPx: 26,
  labelLinePx: 14,
  labelGapPx: 20,
};

const EVERY_METRIC_SET: readonly (readonly [string, PlanPreviewMetrics])[] = [
  ["the phone's default set", DEFAULT_PLAN_PREVIEW_METRICS],
  ["the desktop panel's set", DESKTOP_METRICS],
];

/** Criterion 7's own ceiling: "boxes from the set's minimum to 900 x 700". */
const MAXIMUM_SWEPT_BOX: PlanBox = { widthPx: 900, heightPx: 700 };

function everySweptBox(metrics: PlanPreviewMetrics): fc.Arbitrary<PlanBox> {
  const minimum = planPreviewMinimumBoxPx(metrics);
  return fc.record({
    widthPx: fc.integer({
      min: minimum.widthPx,
      max: MAXIMUM_SWEPT_BOX.widthPx,
    }),
    heightPx: fc.integer({
      min: minimum.heightPx,
      max: MAXIMUM_SWEPT_BOX.heightPx,
    }),
  });
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

function draftWith(
  shape: RoomShape,
  lengths: readonly (readonly [RoomLengthField, number])[],
  direction: CornerDirection,
): RoomDraft {
  const typed = lengths.reduce<RoomDraft>(
    (draft, [field, millimetres]) =>
      withStoredLength(draft, { field, millimetres }),
    createRoomDraft(shape),
  );
  return withCornerDirection(typed, direction);
}

/** L, turning one way only — criterion 7 names "L left" and "L right" as separate arms. */
function anyLDraft(direction: CornerDirection): fc.Arbitrary<RoomDraft> {
  return fc
    .record({
      wallAMm: everyMillimetreIn(approvedLWalls().wallA),
      wallBMm: everyMillimetreIn(approvedLWalls().wallB),
    })
    .map(({ wallAMm, wallBMm }) =>
      draftWith(
        "L",
        [
          ["wallA", wallAMm],
          ["wallB", wallBMm],
          ["height", APPROVED_ROOM_POLICY.heightBounds.minMm],
        ],
        direction,
      ),
    );
}

const anyLinearDraft: fc.Arbitrary<RoomDraft> = fc
  .record({
    wallAMm: everyMillimetreIn(approvedLWalls().wallA),
    direction: fc.constantFrom<CornerDirection>("left", "right"),
  })
  .map(({ wallAMm, direction }) =>
    draftWith(
      "linear",
      [
        ["wallA", wallAMm],
        ["height", APPROVED_ROOM_POLICY.heightBounds.minMm],
      ],
      direction,
    ),
  );

/** "U with walls missing": a U typed from its first digit rather than only inside the approved
 *  policy's own bounds (7F2 S2 QA finding 1's population), so a wall drawn thinner than the metric
 *  set's own label line is swept in as readily as an ordinary kitchen. */
const anyThinlyTypedUDraft: fc.Arbitrary<RoomDraft> = fc
  .record({
    wallAMm: fc.integer({ min: 1, max: 7000 }),
    wallBMm: fc.integer({ min: 1, max: 7000 }),
    wallCMm: fc.integer({ min: 1, max: 7000 }),
    direction: fc.constantFrom<CornerDirection>("left", "right"),
  })
  .map(({ wallAMm, wallBMm, wallCMm, direction }) =>
    draftWith(
      "U",
      [
        ["wallA", wallAMm],
        ["wallB", wallBMm],
        ["wallC", wallCMm],
        ["height", APPROVED_ROOM_POLICY.heightBounds.minMm],
      ],
      direction,
    ),
  );

const ARMS: readonly (readonly [string, fc.Arbitrary<RoomDraft>])[] = [
  ["an L turning left", anyLDraft("left")],
  ["an L turning right", anyLDraft("right")],
  ["a linear room", anyLinearDraft],
  ["a thinly typed U", anyThinlyTypedUDraft],
];

interface RectPx {
  readonly leftPx: number;
  readonly topPx: number;
  readonly rightPx: number;
  readonly bottomPx: number;
}

function barRectPx(bar: PlanWallRect): RectPx {
  return {
    leftPx: bar.xPx,
    topPx: bar.yPx,
    rightPx: bar.xPx + bar.widthPx,
    bottomPx: bar.yPx + bar.heightPx,
  };
}

/** The widest a wall label was measured at in the browser (`plan-preview-model.test.ts`'s own
 *  figure) — an observation about type, not a model input, restated here for the same reason. */
const WIDEST_WALL_LABEL_PX = 117;

function labelRectPx(
  label: PlanWallLabelPx,
  metrics: PlanPreviewMetrics,
): RectPx {
  const leftPx = {
    centred: label.xPx - WIDEST_WALL_LABEL_PX / 2,
    leftAligned: label.xPx,
    rightAligned: label.xPx - WIDEST_WALL_LABEL_PX,
  }[label.alignment];

  return {
    leftPx,
    topPx: label.topPx,
    rightPx: leftPx + WIDEST_WALL_LABEL_PX,
    bottomPx: label.topPx + metrics.labelLinePx,
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

describe.each(EVERY_METRIC_SET)(
  "derivePlanPreview — %s, swept from its own minimum box to 900 x 700 (criterion 7)",
  (_setName, metrics) => {
    // A box down at the set's own minimum cannot stand the widest label *beside* a wall — the same
    // ceiling `plan-preview-model.test.ts` names for the phone's own set — so across the full swept
    // range the claim is the weaker one that still holds at every size: the anchor, and the line it is
    // written on, never leave the box.
    it.each(ARMS)(
      "keeps every bar inside the box, and every label's anchor and line inside it, for %s",
      (_armName, anyDraft) => {
        fc.assert(
          fc.property(anyDraft, everySweptBox(metrics), (draft, box) => {
            const plan = derivePlanPreview(draft, box, metrics);
            if (plan.kind !== "drawn") return;

            for (const bar of plan.walls) {
              expect(isInside(barRectPx(bar), box)).toBe(true);
            }
            for (const labelled of plan.walls) {
              const { xPx, topPx } = labelled.labelPx;
              expect(xPx).toBeGreaterThanOrEqual(-FLOAT_TOLERANCE_PX);
              expect(xPx).toBeLessThanOrEqual(box.widthPx + FLOAT_TOLERANCE_PX);
              expect(topPx).toBeGreaterThanOrEqual(-FLOAT_TOLERANCE_PX);
              expect(topPx + metrics.labelLinePx).toBeLessThanOrEqual(
                box.heightPx + FLOAT_TOLERANCE_PX,
              );
            }
          }),
          { numRuns: SAMPLES_PER_ARM },
        );
      },
    );

    // The full-width claim — a label never printed over a bar — needs a box able to stand the widest
    // label beside a wall in the first place (the sweep's own ceiling), which is why it is checked
    // there rather than at the minimum: at the minimum, no shell ever draws the panel that small.
    it.each(ARMS)(
      "paints no label over a bar, at the sweep's own ceiling, for %s",
      (_armName, anyDraft) => {
        fc.assert(
          fc.property(anyDraft, (draft) => {
            const plan = derivePlanPreview(draft, MAXIMUM_SWEPT_BOX, metrics);
            if (plan.kind !== "drawn") return;

            for (const labelled of plan.walls) {
              const collisions = plan.walls.filter((bar) =>
                overlaps(
                  labelRectPx(labelled.labelPx, metrics),
                  barRectPx(bar),
                ),
              );
              expect(collisions).toEqual([]);
            }
          }),
          { numRuns: SAMPLES_PER_ARM },
        );
      },
    );

    // The isotropic scale (7F1 R4) is the largest that still fits both axes in the region (the box
    // less the label lane, `isotropicScalePxPerMm`'s own contract) — so at least one axis is drawn to
    // within a pixel of the room it left, and the model is not quietly choosing a smaller, safer
    // scale than the box actually allows.
    it.each(ARMS)(
      "reaches the region less the set's lanes on at least one axis, within a pixel, for %s",
      (_armName, anyDraft) => {
        fc.assert(
          fc.property(anyDraft, everySweptBox(metrics), (draft, box) => {
            const plan = derivePlanPreview(draft, box, metrics);
            if (plan.kind !== "drawn") return;

            const wallA = plan.walls.find((wall) => wall.wall === "A");
            const deepestWallMm = Math.max(
              0,
              ...plan.walls
                .filter((wall) => wall.wall !== "A")
                .map((wall) => wall.lengthMm),
            );
            const labelLanePx = metrics.labelLinePx + metrics.labelGapPx;
            const regionWidthPx = box.widthPx;
            const usableDepthPx =
              box.heightPx - labelLanePx - metrics.wallThicknessPx;

            const widthSlackPx =
              wallA === undefined
                ? undefined
                : regionWidthPx - wallA.lengthMm * plan.scalePxPerMm;
            const depthSlackPx =
              deepestWallMm === 0
                ? undefined
                : usableDepthPx - deepestWallMm * plan.scalePxPerMm;
            const slacksPx = [widthSlackPx, depthSlackPx].filter(
              (slackPx): slackPx is number => slackPx !== undefined,
            );

            expect(slacksPx.length).toBeGreaterThan(0);
            expect(Math.min(...slacksPx)).toBeLessThanOrEqual(1);
          }),
          { numRuns: SAMPLES_PER_ARM },
        );
      },
    );
  },
);
