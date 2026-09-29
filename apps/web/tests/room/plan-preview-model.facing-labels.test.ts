// M7B U5 S1, acceptance criterion 4 (backlog 72): the labels of a U's two facing walls never meet.
//
// A wide U at the phone's own box (4000 x 2400 x 2400 in 318 x 102 px) drew *"B · 2400 mm"* and
// *"C · 2400 mm"* on the same pixels, and the customer read *"B · 24002400 mm"*. That string is what
// two boxes on one row look like, so "it is unreachable" is the same claim as "the two label boxes
// never intersect", and this file sweeps that claim over U lengths across the owner's Q-U1 range
// and the engine's, at the phone's metric set and the desktop panel's.
//
// **The label boxes are measured, not modelled.** Widths come from `tests/support/plan-label-width.ts`
// (Chromium, `700 11px Helvetica`, 2026-09-22), never from the bound `plan-preview-model.ts` places
// labels by, so a bound that turned out too narrow fails here instead of agreeing with itself.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_PLAN_PREVIEW_METRICS,
  derivePlanPreview,
  markPlanWalls,
  PLAN_LABEL_REASON_MAX_CHARACTERS,
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

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import {
  measuredLabelWidthPx,
  measuredMarkedLabelWidthPx,
  type MarkedLabelLocale,
  type MarkedLabelReason,
} from "../support/plan-label-width";

/** The phone's own plan box: 390 px less the screen's and the card's padding at the frame's height,
 *  less the hairline border spent out of both axes (`plan-preview.tsx`, `PAINTED_PLAN_BOX`). */
const PHONE_BOX: PlanBox = { widthPx: 318, heightPx: 102 };

/** D1B's own set (`Desktop.dc.html:183, 185`), restated as `metrics-sweep.test.ts` does. */
const DESKTOP_METRICS: PlanPreviewMetrics = {
  wallThicknessPx: 26,
  labelLinePx: 14,
  labelGapPx: 20,
};

/** ADR 0108 H4 (Q-U1, answered 2026-09-29): wall A 2700–6000, walls B and C 1000–6000. */
const APPROVED_U = {
  wallA: { min: 2700, max: 6000 },
  side: { min: 1000, max: 6000 },
} as const;

/** The engine's own U range (1800 for the two X-legs, 880 for the narrowest corner reach, 6300). */
const ENGINE_U = {
  wallA: { min: 1800, max: 6300 },
  side: { min: 880, max: 6300 },
} as const;

/** The plan panel is the viewport less a 520 px form column, a 56 px gap, the body's 40 px insets and
 *  the card's 26 px padding, so a 1280 px window gives a 570 px box and 1440 gives 730
 *  (`room.module.css`'s desktop block). Down to the 900 px line it is 190 px, which is the narrow arm. */
const DESKTOP_BOX = {
  wide: {
    widthPx: { min: 570, max: 900 },
    heightPx: { min: 300, max: 700 },
  },
  narrow: {
    widthPx: { min: 190, max: 569 },
    heightPx: { min: 300, max: 700 },
  },
} as const;

const SAMPLES = 600;
/** The floor per arm: a sweep that only ever met the arrangement nobody changed certifies nothing. */
const FLOOR_PER_ARRANGEMENT = 8;

interface RectPx {
  readonly leftPx: number;
  readonly topPx: number;
  readonly rightPx: number;
  readonly bottomPx: number;
}

function uDraft(walls: {
  readonly wallA: number;
  readonly wallB: number;
  readonly wallC: number;
}): RoomDraft {
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

function drawn(
  walls: Parameters<typeof uDraft>[0],
  box: PlanBox,
  metrics: PlanPreviewMetrics,
): DrawnPlanPreview {
  const plan = derivePlanPreview(uDraft(walls), box, metrics);
  if (plan.kind !== "drawn") throw new Error("a complete U draws");
  return plan;
}

function labelRectPx(wall: PlanWallRect, metrics: PlanPreviewMetrics): RectPx {
  const widthPx = measuredLabelWidthPx(wall.lengthMm, metrics.labelLinePx);
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
    bottomPx: topPx + metrics.labelLinePx,
  };
}

function intersect(one: RectPx, other: RectPx): boolean {
  return (
    one.leftPx < other.rightPx &&
    other.leftPx < one.rightPx &&
    one.topPx < other.bottomPx &&
    other.topPx < one.bottomPx
  );
}

function wallOf(plan: DrawnPlanPreview, id: "B" | "C"): PlanWallRect {
  const found = plan.walls.find((wall) => wall.wall === id);
  if (found === undefined) throw new Error(`a U draws wall ${id}`);
  return found;
}

type Arrangement = "inside" | "outside" | "stacked" | "mixed";

/** Read off the drawing, never off the model's own choice: which way each label grows, and whether
 *  the two lines share a pixel row at all. */
function arrangementOf(
  plan: DrawnPlanPreview,
  metrics: PlanPreviewMetrics,
): Arrangement {
  const b = wallOf(plan, "B").labelPx;
  const c = wallOf(plan, "C").labelPx;
  if (Math.abs(b.topPx - c.topPx) >= metrics.labelLinePx) return "stacked";
  if (b.alignment === "leftAligned" && c.alignment === "rightAligned") {
    return "inside";
  }
  if (b.alignment === "rightAligned" && c.alignment === "leftAligned") {
    return "outside";
  }
  return "mixed";
}

interface UWallRanges {
  readonly wallA: { readonly min: number; readonly max: number };
  readonly side: { readonly min: number; readonly max: number };
}

function anyLengths(range: UWallRanges) {
  const within = (bounds: { min: number; max: number }) =>
    fc.integer({ min: bounds.min, max: bounds.max });
  return fc.record({
    wallA: within(range.wallA),
    wallB: within(range.side),
    wallC: within(range.side),
  });
}

function anyBox(range: {
  readonly widthPx: { readonly min: number; readonly max: number };
  readonly heightPx: { readonly min: number; readonly max: number };
}): fc.Arbitrary<PlanBox> {
  return fc.record({
    widthPx: fc.integer(range.widthPx),
    heightPx: fc.integer(range.heightPx),
  });
}

interface Arm {
  readonly name: string;
  readonly metrics: PlanPreviewMetrics;
  readonly box: fc.Arbitrary<PlanBox>;
  /** Arrangements the arm must meet at least `FLOOR_PER_ARRANGEMENT` times. */
  readonly mustMeet: readonly Arrangement[];
}

const ARMS: readonly Arm[] = [
  {
    name: "the phone's box and metric set",
    metrics: DEFAULT_PLAN_PREVIEW_METRICS,
    box: fc.constant(PHONE_BOX),
    mustMeet: ["inside", "outside"],
  },
  {
    name: "a desktop panel at 1280 px and wider",
    metrics: DESKTOP_METRICS,
    box: anyBox(DESKTOP_BOX.wide),
    mustMeet: ["inside", "outside"],
  },
  {
    name: "a desktop panel between the 900 px line and 1280 px",
    metrics: DESKTOP_METRICS,
    box: anyBox(DESKTOP_BOX.narrow),
    mustMeet: ["stacked"],
  },
];

const RANGES = [
  ["the approved U (Q-U1)", APPROVED_U],
  ["the engine's U", ENGINE_U],
] as const;

describe.each(ARMS)("facing labels — $name", (arm) => {
  it.each(RANGES)(
    "never intersect, over lengths across %s",
    (_rangeName, range) => {
      const met = new Map<Arrangement, number>();

      fc.assert(
        fc.property(anyLengths(range), arm.box, (walls, box) => {
          const plan = drawn(walls, box, arm.metrics);

          const arrangement = arrangementOf(plan, arm.metrics);
          met.set(arrangement, (met.get(arrangement) ?? 0) + 1);
          const b = labelRectPx(wallOf(plan, "B"), arm.metrics);
          const c = labelRectPx(wallOf(plan, "C"), arm.metrics);

          expect(
            intersect(b, c),
            `${arrangement}: B ${JSON.stringify(b)} against C ${JSON.stringify(c)} in ${JSON.stringify(box)}`,
          ).toBe(false);
        }),
        { numRuns: SAMPLES },
      );

      for (const arrangement of arm.mustMeet) {
        expect(
          met.get(arrangement) ?? 0,
          `${arrangement} was reached`,
        ).toBeGreaterThanOrEqual(FLOOR_PER_ARRANGEMENT);
      }
    },
  );
});

describe("the room backlog 72 was found in", () => {
  it("draws 4000 x 2400 x 2400 at the phone with B's and C's labels apart, not as one string", () => {
    const plan = drawn(
      { wallA: 4000, wallB: 2400, wallC: 2400 },
      PHONE_BOX,
      DEFAULT_PLAN_PREVIEW_METRICS,
    );
    const b = labelRectPx(wallOf(plan, "B"), DEFAULT_PLAN_PREVIEW_METRICS);
    const c = labelRectPx(wallOf(plan, "C"), DEFAULT_PLAN_PREVIEW_METRICS);

    expect(intersect(b, c)).toBe(false);
    // Apart on the page by columns or by rows: since U5 a label is placed for the wider text it may
    // read, a 4000 x 2400 x 2400 U at the phone stacks them, and a stacked pair is not side by side.
    const isBesideEachOther = b.rightPx <= c.leftPx || c.rightPx <= b.leftPx;
    const isOnSeparateRows = b.bottomPx <= c.topPx || c.bottomPx <= b.topPx;
    expect(isBesideEachOther || isOnSeparateRows).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// Frame 1C marks a wall by writing its reason where its length was (`markPlanWalls`), keeping the
// geometry it is handed — so the labels have to be placed for the wider of the two texts.
// ---------------------------------------------------------------------------------------------

/** What a facing wall's label reads: its length, or the reason frame 1C wrote in its place. */
type LabelText = "length" | MarkedLabelReason;

const ANY_LABEL_TEXT = fc.constantFrom<LabelText>(
  "length",
  "tooShort",
  "tooLong",
);
const ANY_LOCALE = fc.constantFrom<MarkedLabelLocale>("ro", "ru");

/** A wall is refused below Q-U1's 1000 and above its 6000 (ADR 0108 H4), so a marked wall can measure
 *  what an unmarked one cannot; the sweep reaches both, whichever text the wall is given. */
const REFUSED_SIDE_MM = { min: 300, max: 9000 } as const;

function markedLabelRectPx(
  wall: PlanWallRect,
  text: LabelText,
  locale: MarkedLabelLocale,
  metrics: PlanPreviewMetrics,
): RectPx {
  const widthPx =
    text === "length"
      ? measuredLabelWidthPx(wall.lengthMm, metrics.labelLinePx)
      : measuredMarkedLabelWidthPx(locale, text, metrics.labelLinePx);
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
    bottomPx: topPx + metrics.labelLinePx,
  };
}

function markedU(
  walls: Parameters<typeof uDraft>[0],
  texts: { readonly B: LabelText; readonly C: LabelText },
  box: PlanBox,
  metrics: PlanPreviewMetrics,
): DrawnPlanPreview {
  const plan = drawn(walls, box, metrics);
  const marks = (["B", "C"] as const).flatMap((wall) =>
    texts[wall] === "length"
      ? []
      : [{ wall, labelKey: `room.planWallIssue.${texts[wall]}` as const }],
  );
  const marked = markPlanWalls(plan, marks);
  if (marked.kind !== "drawn") throw new Error("a marked plan is still drawn");
  return marked;
}

describe.each(ARMS)("facing labels when 1C marks walls — $name", (arm) => {
  it.each(RANGES)(
    "never intersect, in ro and ru, whichever text each side wall reads, over %s and the lengths 1C refuses",
    (_rangeName, range) => {
      fc.assert(
        fc.property(
          fc.record({
            wallA: fc.integer(range.wallA),
            wallB: fc.integer({
              min: Math.min(REFUSED_SIDE_MM.min, range.side.min),
              max: Math.max(REFUSED_SIDE_MM.max, range.side.max),
            }),
            wallC: fc.integer({
              min: Math.min(REFUSED_SIDE_MM.min, range.side.min),
              max: Math.max(REFUSED_SIDE_MM.max, range.side.max),
            }),
          }),
          fc.record({ B: ANY_LABEL_TEXT, C: ANY_LABEL_TEXT }),
          ANY_LOCALE,
          arm.box,
          (walls, texts, locale, box) => {
            const plan = markedU(walls, texts, box, arm.metrics);

            const b = markedLabelRectPx(
              wallOf(plan, "B"),
              texts.B,
              locale,
              arm.metrics,
            );
            const c = markedLabelRectPx(
              wallOf(plan, "C"),
              texts.C,
              locale,
              arm.metrics,
            );

            expect(
              intersect(b, c),
              `${locale} ${JSON.stringify(texts)}: B ${JSON.stringify(b)} against C ${JSON.stringify(c)} ` +
                `for ${JSON.stringify(walls)} in ${JSON.stringify(box)}`,
            ).toBe(false);
          },
        ),
        { numRuns: SAMPLES },
      );
    },
  );
});

describe("the placement's reason bound is a fact about the copy", () => {
  it.each([
    ["ro", roMessages],
    ["ru", ruMessages],
  ] as const)(
    "holds every %s reason within PLAN_LABEL_REASON_MAX_CHARACTERS, wall letter included",
    (_locale, messages) => {
      const reasons = Object.values(messages.room.planWallIssue);

      expect(reasons.length).toBeGreaterThan(0);
      for (const reason of reasons) {
        expect(
          reason.replace("{wall}", "B").length,
          reason,
        ).toBeLessThanOrEqual(PLAN_LABEL_REASON_MAX_CHARACTERS);
      }
    },
  );

  it("is not slack: the longest reason in the catalogues reaches it", () => {
    const longest = Math.max(
      ...[roMessages, ruMessages].flatMap((messages) =>
        Object.values(messages.room.planWallIssue).map(
          (reason) => reason.replace("{wall}", "B").length,
        ),
      ),
    );

    expect(longest).toBe(PLAN_LABEL_REASON_MAX_CHARACTERS);
  });
});

describe("the rooms QA found the marked labels meeting in", () => {
  it.each([
    [
      "the phone, 2700 x 850 x 850, ru, both side walls too short",
      { wallA: 2700, wallB: 850, wallC: 850 },
      PHONE_BOX,
      DEFAULT_PLAN_PREVIEW_METRICS,
    ],
    [
      "a 1020 x 600 desktop window (a 310 x 251 box), 2700 x 300 x 300, ru, both too short",
      { wallA: 2700, wallB: 300, wallC: 300 },
      { widthPx: 310, heightPx: 251 },
      DESKTOP_METRICS,
    ],
  ] as const)(
    "keeps B's and C's reasons apart at %s",
    (_name, walls, box, metrics) => {
      const plan = markedU(
        walls,
        { B: "tooShort", C: "tooShort" },
        box,
        metrics,
      );

      const b = markedLabelRectPx(wallOf(plan, "B"), "tooShort", "ru", metrics);
      const c = markedLabelRectPx(wallOf(plan, "C"), "tooShort", "ru", metrics);

      expect(
        intersect(b, c),
        `${JSON.stringify(b)} against ${JSON.stringify(c)}`,
      ).toBe(false);
    },
  );
});
