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
  PLAN_LABEL_REASON_MAX_EM,
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

import { REASON_GLYPH_ADVANCE_EM } from "../support/plan-reason-glyphs";
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

describe("the placement's reason bound is guarded by width, not by length of string", () => {
  const REASONS = [
    ["ro", roMessages],
    ["ru", ruMessages],
  ] as const;

  /** What a browser draws for `text`, from the measured glyph table; a letter it has not measured is
   *  an error, so a new reason cannot ship before it has been. */
  function summedAdvanceEm(text: string): number {
    let sum = 0;
    for (const letter of text) {
      const advance = REASON_GLYPH_ADVANCE_EM[letter];
      if (advance === undefined) {
        throw new Error(`no measured advance for ${JSON.stringify(letter)}`);
      }
      sum += advance;
    }
    return sum;
  }

  function everyReasonAsDrawn(): readonly (readonly [string, string])[] {
    return REASONS.flatMap(([locale, messages]) =>
      Object.values(messages.room.planWallIssue).flatMap((reason) =>
        (["A", "B", "C"] as const).map(
          (wall) => [locale, reason.replace("{wall}", wall)] as const,
        ),
      ),
    );
  }

  it("has a measured advance for every letter either catalogue spells a reason with", () => {
    expect(everyReasonAsDrawn().length).toBeGreaterThan(0);
    for (const [, text] of everyReasonAsDrawn()) {
      expect(() => summedAdvanceEm(text), text).not.toThrow();
    }
  });

  it("holds every reason, in both locales and for every wall letter, within PLAN_LABEL_REASON_MAX_EM", () => {
    for (const [locale, text] of everyReasonAsDrawn()) {
      expect(summedAdvanceEm(text), `${locale}: ${text}`).toBeLessThanOrEqual(
        PLAN_LABEL_REASON_MAX_EM,
      );
    }
  });

  it("is not slack: the widest reason reaches within 15% of the bound", () => {
    const widest = Math.max(
      ...everyReasonAsDrawn().map(([, text]) => summedAdvanceEm(text)),
    );

    expect(widest).toBeGreaterThan(PLAN_LABEL_REASON_MAX_EM * 0.85);
  });

  it("agrees with QA's whole-string measurement of the widest reason, to a hundredth of an em", () => {
    const measuredWholeEm = 116.59 / 11;

    expect(summedAdvanceEm("B слишком короткая")).toBeGreaterThanOrEqual(
      measuredWholeEm,
    );
    expect(summedAdvanceEm("B слишком короткая")).toBeLessThan(
      measuredWholeEm + 0.02,
    );
  });

  it("would catch what a character count let through: as many letters, spelled wide", () => {
    const eighteenCharacters = `B ${"ш".repeat(16)}`;

    expect(eighteenCharacters.length).toBe(18);
    expect(summedAdvanceEm(eighteenCharacters)).toBeGreaterThan(
      PLAN_LABEL_REASON_MAX_EM,
    );
  });
});

describe("a facing wall's whole label stays in the box, marked or not", () => {
  /** A wall's length is what makes it marked: below Q-U1's 1000 it reads *too short*, above its 6000
   *  *too long*, and in between it reads its length. The pairing is what a room can be, so the sweep
   *  asks for a label to stay in the box only where 1C would really have written it. */
  function lengthThatReads(text: LabelText): fc.Arbitrary<number> {
    if (text === "length") return fc.integer({ min: 1000, max: 6000 });
    if (text === "tooShort") return fc.integer({ min: 300, max: 999 });
    return fc.integer({ min: 6001, max: 9000 });
  }

  /** **Both walls marked too short**: the class the visual review found (ru, 900 px window,
   *  3000 x 300 x 200). Short bars leave rows beneath them, which is where the placement puts a label
   *  no bar-side room can hold. Not swept, and named as limits rather than passed over: two walls both
   *  too *long* draw a sliver with no room beneath it, so a 148 px reason has nowhere in a 190 px box;
   *  and an unmarked pair at a 283 px box with one deep wall is as cramped. Unmarked labels in the box
   *  are `qa-7f2-s2-red-wall`'s property, at the phone. The slice's report records both limits. */
  const anyRoomAndTexts = fc
    .constantFrom<LabelText>("tooShort")
    .map((text) => ({
      B: text,
      C: text,
    }))
    .chain((texts) =>
      fc
        .record({
          wallA: fc.integer(APPROVED_U.wallA),
          wallB: lengthThatReads(texts.B),
          wallC: lengthThatReads(texts.C),
        })
        .map((walls) => ({ texts, walls })),
    );

  it.each(ARMS)("keeps B's and C's labels inside the box — $name", (arm) => {
    fc.assert(
      fc.property(
        anyRoomAndTexts,
        ANY_LOCALE,
        arm.box,
        ({ texts, walls }, locale, box) => {
          const plan = markedU(walls, texts, box, arm.metrics);

          for (const id of ["B", "C"] as const) {
            const rect = markedLabelRectPx(
              wallOf(plan, id),
              texts[id],
              locale,
              arm.metrics,
            );
            expect(
              rect.leftPx,
              `${id} ${locale} ${JSON.stringify(texts)} ${JSON.stringify(walls)} in ${JSON.stringify(box)}: ${JSON.stringify(rect)}`,
            ).toBeGreaterThanOrEqual(-1e-9);
            expect(
              rect.rightPx,
              `${id} in ${JSON.stringify(box)}`,
            ).toBeLessThanOrEqual(box.widthPx + 1e-9);
          }
        },
      ),
      { numRuns: SAMPLES },
    );
  });

  it("keeps ru's two reasons inside a 190 px box, at the 900 px window's 3000 x 300 x 200", () => {
    const metrics = DESKTOP_METRICS;
    const box = { widthPx: 190, heightPx: 239 };
    const plan = markedU(
      { wallA: 3000, wallB: 300, wallC: 200 },
      { B: "tooShort", C: "tooShort" },
      box,
      metrics,
    );

    const b = markedLabelRectPx(wallOf(plan, "B"), "tooShort", "ru", metrics);
    const c = markedLabelRectPx(wallOf(plan, "C"), "tooShort", "ru", metrics);

    expect(intersect(b, c)).toBe(false);
    for (const rect of [b, c]) {
      expect(rect.leftPx).toBeGreaterThanOrEqual(0);
      expect(rect.rightPx).toBeLessThanOrEqual(box.widthPx);
    }
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
