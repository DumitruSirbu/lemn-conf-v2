// M7B U5 adversarial QA, acceptance criterion 4 (backlog 72): the labels of a U's two facing walls
// never meet — attacked where the implementer's own sweep does not reach.
//
// `plan-preview-model.facing-labels.test.ts` sweeps the desktop panel only at heights of 300–700 px.
// The panel's height is the window's, not a constant: a 900–1180 px window that is also short hands
// the plan a box under 300 px. This file sweeps the widths those windows give (190–470 px, the
// viewport less the 710 px of column, gap, insets and padding that test itself derives) across every
// height from the panel's measured floor up to 300, and the approved U's lengths across Q-U1's range.
//
// **The label boxes are measured, not modelled**, with the same browser-measured widths the
// implementer's test reads (`tests/support/plan-label-width.ts`).
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  derivePlanPreview,
  type DrawnPlanPreview,
  type PlanBox,
  type PlanPreviewMetrics,
  type PlanWallRect,
} from "@/room/plan-preview-model";
import {
  createRoomDraft,
  withStoredLength,
  type RoomDraft,
  type RoomLengthField,
} from "@/room/room-draft";

import { measuredLabelWidthPx } from "../support/plan-label-width";

/** D1B's own set (`Desktop.dc.html:183, 185`), as the implementer's sweep restates it. */
const DESKTOP_METRICS: PlanPreviewMetrics = {
  wallThicknessPx: 26,
  labelLinePx: 14,
  labelGapPx: 20,
};

/** A 900 px window gives a 190 px box and 1180 gives 470 (viewport − 710). */
const BOX_WIDTH_AT_900_TO_1180_PX = { min: 190, max: 470 };
/**
 * Everything below the implementer's 300 px floor, down to the shortest panel the page hands the plan.
 * **Measured by QA on 2026-09-30** (`room-plan-box` on a U URL, 900–1180 px wide windows 420–900 px
 * tall): 228 px at a 900 px window and 239 px from 940 px up, the same at 420 as at 500 px tall — so
 * the panel has a floor, and nothing shorter reaches the model. Below about 85 px the model *does*
 * put the two labels on one row (190 × 80 px, 4900/1000/1000), which is why the floor is stated
 * rather than the model's own minimum.
 */
const SHORT_BOX_HEIGHT_PX = { min: 228, max: 299 };

/** ADR 0108 H4 (Q-U1, answered 2026-09-29): wall A 2700–6000, walls B and C 1000–6000. */
const APPROVED_U = {
  wallA: { min: 2700, max: 6000 },
  side: { min: 1000, max: 6000 },
} as const;

const SAMPLES = 2000;

interface RectPx {
  readonly leftPx: number;
  readonly topPx: number;
  readonly rightPx: number;
  readonly bottomPx: number;
}

interface ULengths {
  readonly wallA: number;
  readonly wallB: number;
  readonly wallC: number;
}

describe("facing labels in a short desktop panel, 900–1180 px windows (criterion 4)", () => {
  it("never intersect, over the approved U's lengths", () => {
    fc.assert(
      fc.property(anyApprovedU(), anyShortDesktopBox(), (walls, box) => {
        const plan = drawnU(walls, box);

        const b = labelRectPx(wallOf(plan, "B"));
        const c = labelRectPx(wallOf(plan, "C"));

        expect(
          intersects(b, c),
          `B ${JSON.stringify(b)} against C ${JSON.stringify(c)} for ${JSON.stringify(walls)} in ${JSON.stringify(box)}`,
        ).toBe(false);
      }),
      { numRuns: SAMPLES },
    );
  });
});

function anyApprovedU(): fc.Arbitrary<ULengths> {
  const within = (bounds: { readonly min: number; readonly max: number }) =>
    fc.integer(bounds);
  return fc.record({
    wallA: within(APPROVED_U.wallA),
    wallB: within(APPROVED_U.side),
    wallC: within(APPROVED_U.side),
  });
}

function anyShortDesktopBox(): fc.Arbitrary<PlanBox> {
  return fc.record({
    widthPx: fc.integer(BOX_WIDTH_AT_900_TO_1180_PX),
    heightPx: fc.integer(SHORT_BOX_HEIGHT_PX),
  });
}

function drawnU(walls: ULengths, box: PlanBox): DrawnPlanPreview {
  const plan = derivePlanPreview(uDraft(walls), box, DESKTOP_METRICS);
  if (plan.kind !== "drawn") throw new Error("a complete U draws");
  return plan;
}

function uDraft(walls: ULengths): RoomDraft {
  const fields: readonly (readonly [RoomLengthField, number])[] = [
    ["wallA", walls.wallA],
    ["wallB", walls.wallB],
    ["wallC", walls.wallC],
    ["height", 2600],
  ];
  return fields.reduce<RoomDraft>(
    (draft, [field, millimetres]) =>
      withStoredLength(draft, { field, millimetres }),
    createRoomDraft("U"),
  );
}

function wallOf(plan: DrawnPlanPreview, id: "B" | "C"): PlanWallRect {
  const found = plan.walls.find((wall) => wall.wall === id);
  if (found === undefined) throw new Error(`a U draws wall ${id}`);
  return found;
}

function labelRectPx(wall: PlanWallRect): RectPx {
  return rectAt(
    wall,
    measuredLabelWidthPx(wall.lengthMm, DESKTOP_METRICS.labelLinePx),
    DESKTOP_METRICS.labelLinePx,
  );
}

function rectAt(wall: PlanWallRect, widthPx: number, linePx: number): RectPx {
  const { xPx, topPx, alignment } = wall.labelPx;
  const leftPx = {
    centred: xPx - widthPx / 2,
    leftAligned: xPx,
    rightAligned: xPx - widthPx,
  }[alignment];
  return {
    leftPx,
    topPx,
    rightPx: leftPx + widthPx,
    bottomPx: topPx + linePx,
  };
}

function intersects(one: RectPx, other: RectPx): boolean {
  return (
    one.leftPx < other.rightPx &&
    other.leftPx < one.rightPx &&
    one.topPx < other.bottomPx &&
    other.topPx < one.bottomPx
  );
}
