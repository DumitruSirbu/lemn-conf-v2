// M7B U5 adversarial QA, acceptance criterion 4 (backlog 72), **marked walls**: when frame 1C writes a
// side wall's reason in place of its length, B's and C's labels must still never meet. RED in ru: the
// model places labels for the length's width, and the ru reason is 52 px wider at the phone.
//
// `plan-preview-model.facing-labels.test.ts` sweeps the desktop panel only at heights of 300–700 px.
// The panel's height is the window's, not a constant: a 900–1180 px window that is also short hands
// the plan a box well under 300 px. This file sweeps the widths those windows give (190–470 px, the
// viewport less the 710 px of column, gap, insets and padding that test itself derives) across every
// height from the plan's own minimum up to 300, and the approved U's lengths across Q-U1's range.
//
// **The label boxes are measured, not modelled**, with the same browser-measured widths the
// implementer's test reads (`tests/support/plan-label-width.ts`).
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_PLAN_PREVIEW_METRICS,
  derivePlanPreview,
  markPlanWalls,
  type DrawnPlanPreview,
  type PlanBox,
  type PlanWallRect,
} from "@/room/plan-preview-model";
import {
  createRoomDraft,
  withStoredLength,
  type RoomDraft,
  type RoomLengthField,
} from "@/room/room-draft";

/** ADR 0108 H4 (Q-U1, answered 2026-09-29): wall A 2700–6000, walls B and C 1000–6000. */
const APPROVED_U = {
  wallA: { min: 2700, max: 6000 },
  side: { min: 1000, max: 6000 },
} as const;

const SAMPLES = 2000;

/** The phone's own plan box (`plan-preview.tsx`, `PLAN_BOX`). */
const PHONE_BOX: PlanBox = { widthPx: 318, heightPx: 102 };

/**
 * **Frame 1C's marked label, in place of the length** (`markPlanWalls`): *"B prea scurt"*, or in ru
 * *"B слишком короткая"* — which is 52 px wider than the *"B · 2400 mm"* the model places labels for.
 * Measured by QA on 2026-09-30 in Chromium with `measureText` at the label's computed font,
 * `700 11px Helvetica, Arial, sans-serif` with tabular digits (`room-plan-label-B` at 390 × 844): the
 * length label measured 64.20 px there, the same figure `plan-label-width.ts` holds, which is what
 * ties these widths to that file's.
 */
const MARKED_LABEL_WIDTH_AT_PHONE_PX = {
  ro: { tooShort: 64.19, tooLong: 60.51 },
  ru: { tooShort: 116.59, tooLong: 111.84 },
} as const;

/** A side wall is marked below Q-U1's 1000 or above its 6000 (ADR 0108 H4); the sweep reaches both. */
const MARKED_SIDE_MM = {
  tooShort: { min: 300, max: 999 },
  tooLong: { min: 6001, max: 9000 },
} as const;

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

describe("facing labels when 1C marks both side walls, at the phone (criterion 4, marked walls)", () => {
  it.each(["ro", "ru"] as const)(
    "never intersect in %s, whichever reason each wall is marked for",
    (locale) => {
      fc.assert(
        fc.property(
          fc.integer(APPROVED_U.wallA),
          anyMarkedSide(),
          anyMarkedSide(),
          (wallA, markedB, markedC) => {
            const plan = markedPhoneU({ wallA, markedB, markedC });

            const b = markedLabelRectPx(
              wallOf(plan, "B"),
              markedB.reason,
              locale,
            );
            const c = markedLabelRectPx(
              wallOf(plan, "C"),
              markedC.reason,
              locale,
            );

            expect(
              intersects(b, c),
              `${locale}: B ${JSON.stringify(b)} against C ${JSON.stringify(c)} for A ${String(wallA)}, ` +
                `B ${JSON.stringify(markedB)}, C ${JSON.stringify(markedC)}`,
            ).toBe(false);
          },
        ),
        { numRuns: SAMPLES },
      );
    },
  );
});

describe("a ru room that puts both marked labels on one row", () => {
  it("keeps B's and C's reasons apart at the phone, for 2700 x 850 x 850", () => {
    const tooShort: MarkedSide = { reason: "tooShort", lengthMm: 850 };
    const plan = markedPhoneU({
      wallA: 2700,
      markedB: tooShort,
      markedC: tooShort,
    });

    const b = markedLabelRectPx(wallOf(plan, "B"), "tooShort", "ru");
    const c = markedLabelRectPx(wallOf(plan, "C"), "tooShort", "ru");

    expect(
      intersects(b, c),
      `B ${JSON.stringify(b)} against C ${JSON.stringify(c)}`,
    ).toBe(false);
  });
});

type MarkReason = "tooShort" | "tooLong";

interface MarkedSide {
  readonly reason: MarkReason;
  readonly lengthMm: number;
}

function anyMarkedSide(): fc.Arbitrary<MarkedSide> {
  return fc.oneof(
    fc.record({
      reason: fc.constant<MarkReason>("tooShort"),
      lengthMm: fc.integer(MARKED_SIDE_MM.tooShort),
    }),
    fc.record({
      reason: fc.constant<MarkReason>("tooLong"),
      lengthMm: fc.integer(MARKED_SIDE_MM.tooLong),
    }),
  );
}

function markedPhoneU(room: {
  readonly wallA: number;
  readonly markedB: MarkedSide;
  readonly markedC: MarkedSide;
}): DrawnPlanPreview {
  const drawn = derivePlanPreview(
    uDraft({
      wallA: room.wallA,
      wallB: room.markedB.lengthMm,
      wallC: room.markedC.lengthMm,
    }),
    PHONE_BOX,
    DEFAULT_PLAN_PREVIEW_METRICS,
  );
  const marked = markPlanWalls(drawn, [
    { wall: "B", labelKey: `room.planWallIssue.${room.markedB.reason}` },
    { wall: "C", labelKey: `room.planWallIssue.${room.markedC.reason}` },
  ]);
  if (marked.kind !== "drawn") throw new Error("a complete U draws");
  return marked;
}

function markedLabelRectPx(
  wall: PlanWallRect,
  reason: MarkReason,
  locale: keyof typeof MARKED_LABEL_WIDTH_AT_PHONE_PX,
): RectPx {
  return rectAt(
    wall,
    MARKED_LABEL_WIDTH_AT_PHONE_PX[locale][reason],
    DEFAULT_PLAN_PREVIEW_METRICS.labelLinePx,
  );
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
