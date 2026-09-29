// **Adversarial QA — wave 7F2 slice S2, the red wall (marking only), criterion 7.**
//
// `plan-preview-model-marking.test.ts` proves the claims over the rooms the issue model produces, on
// L plans that always draw A before B. Two sabotages the plan names are invisible there, because in
// every such plan a wall's array index, its id and its side agree: **marking by index** is caught
// only by a plan that does not draw wall A (cut from a complete drawing: since S5 no draft draws
// one), and **marking by screen side** only by a plan with two walls running down the screen — a U —
// mirrored. Both are built here directly.
//
// The expected marks are taken from `validateRoomInput` called **directly on the millimetres**, never
// from the issue model the component will be handed, and the sweep reaches below 100 mm because,
// since ADR 0126, every prefix of a wall being typed (`3`, `36`, `360`) is a room the domain refuses.
//
// The last block holds a marked label to the geometry claims `plan-preview-model.test.ts` makes for
// the unmarked one, at the width the marked text was **measured** at rather than the 60 px assumed
// for a length.
import { fc } from "@fast-check/vitest";
import {
  APPROVED_ROOM_POLICY,
  validateRoomInput,
  type CornerDirection,
  type RoomInput,
  type RoomIssue,
  type RoomShape,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  PLAN_LABEL_LINE_PX,
  derivePlanPreview,
  markPlanWalls,
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
  type RoomDraft,
  type RoomLengthField,
} from "@/room/room-draft";
import {
  deriveRoomIssueView,
  type MarkedPlanWall,
  type PlanWallIssueLabelKey,
} from "@/room/room-issue-model";
import { canonicalRoomQuery, queryEntriesOf } from "@/room/room-query-sync";
import { parseRoomUrlState } from "@/room/room-url-state";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { translatorFor, type Catalogue } from "../support/catalogues";

const SAMPLES_PER_ARM = 200;

/** The box `plan-preview.tsx` hands the model: frame 1B's 320 x 104, less its hairline border. */
const FRAME_PREVIEW_BOX: PlanBox = { widthPx: 318, heightPx: 102 };

const DIRECTIONS: readonly CornerDirection[] = ["left", "right"];
const SHAPES: readonly RoomShape[] = ["linear", "L", "U"];
const WALL_IDS: readonly PlanWallId[] = ["A", "B", "C"];

const TOO_SHORT: PlanWallIssueLabelKey = "room.planWallIssue.tooShort";
const TOO_LONG: PlanWallIssueLabelKey = "room.planWallIssue.tooLong";
const LABEL_KEYS: readonly PlanWallIssueLabelKey[] = [TOO_SHORT, TOO_LONG];

/** Every whole millimetre a wall can hold on its way to a room: from the first digit typed, past the
 *  widest approved wall. The low end is where a partly typed wall is refused as too short. */
const TYPED_WALL_MM = { min: 1, max: 7000 } as const;
const TYPED_CEILING_MM = { min: 1000, max: 5000 } as const;

/** The domain's codes that name a wall's own length — the only two a plan label is written for. */
const LABEL_KEY_OF_CODE: Readonly<Record<string, PlanWallIssueLabelKey>> = {
  WALL_TOO_SHORT: TOO_SHORT,
  WALL_TOO_LONG: TOO_LONG,
};

const WALL_OF_FIELD: Readonly<Record<string, PlanWallId>> = {
  wallA: "A",
  wallB: "B",
  wallC: "C",
};

/**
 * **The marked label as Chromium sets it**, measured with `canvas.measureText` under the screen's own
 * `700 11px Helvetica, Arial, sans-serif` (`globals.css:50`, `room.module.css:357`) on 2026-09-22:
 * *"B слишком короткая"* 116.6 px, *"B слишком длинная"* 111.8, *"B prea scurt"* 64.2, *"B prea
 * lung"* 60.5. The Russian reason is nearly twice the 60 px `plan-preview-model.test.ts` assumes for
 * a length, so a placement proven at 60 is not proven for it. Rounded up.
 */
const WIDEST_MARKED_LABEL_PX = 117;

/** Room for a double's rounding after a scale and a centring division, and nothing more. */
const FLOAT_TOLERANCE_PX = 1e-9;

// ---------------------------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------------------------

type TypedLengths = Partial<Record<RoomLengthField, number>>;

function draftTyped(
  shape: RoomShape,
  lengths: TypedLengths,
  direction: CornerDirection,
): RoomDraft {
  const typed = Object.entries(lengths).reduce(
    (draft, [field, millimetres]) =>
      withEnteredText(draft, {
        field: field as RoomLengthField,
        text: String(millimetres),
      }),
    createRoomDraft(shape),
  );
  return withCornerDirection(typed, direction);
}

function planOf(draft: RoomDraft): PlanPreview {
  return derivePlanPreview(draft, FRAME_PREVIEW_BOX);
}

function drawn(plan: PlanPreview): DrawnPlanPreview {
  if (plan.kind !== "drawn")
    throw new Error("the draft under test draws no plan");
  return plan;
}

/** A complete drawing with wall A left out, so the walls that remain no longer stand at the index
 *  their letter would suggest. */
function withoutWallA(plan: PlanPreview): DrawnPlanPreview {
  const complete = drawn(plan);
  return {
    ...complete,
    walls: complete.walls.filter((candidate) => candidate.wall !== "A"),
  };
}

function wallOf(plan: PlanPreview, wallId: PlanWallId): PlanWallRect {
  const found = drawn(plan).walls.find(
    (candidate) => candidate.wall === wallId,
  );
  if (found === undefined) throw new Error(`the plan draws no wall ${wallId}`);
  return found;
}

function marksOn(plan: PlanPreview): readonly MarkedPlanWall[] {
  if (plan.kind === "empty") return [];
  return plan.walls.flatMap((candidate) =>
    candidate.issueLabelKey === undefined
      ? []
      : [{ wall: candidate.wall, labelKey: candidate.issueLabelKey }],
  );
}

/** The marks the screen will hand the card, asked the way `room-screen.tsx` will ask them. */
function markedWallsFromTheIssueModel(
  draft: RoomDraft,
): readonly MarkedPlanWall[] {
  return deriveRoomIssueView({
    draft,
    draftState: parseRoomUrlState(
      queryEntriesOf(canonicalRoomQuery(draft).toString()),
    ),
    policy: APPROVED_ROOM_POLICY,
  }).markedWalls;
}

interface TypedRoom {
  readonly shape: RoomShape;
  readonly direction: CornerDirection;
  readonly wallA: number;
  readonly wallB: number;
  readonly wallC: number;
  readonly height: number;
}

function roomInputOf(room: TypedRoom): RoomInput {
  const { direction: cornerDirection, wallA, wallB, wallC, height } = room;
  if (room.shape === "linear") {
    return { shape: "linear", wallAMm: wallA, heightMm: height };
  }
  if (room.shape === "L") {
    return {
      shape: "L",
      wallAMm: wallA,
      wallBMm: wallB,
      heightMm: height,
      cornerDirection,
    };
  }
  return {
    shape: "U",
    wallAMm: wallA,
    wallBMm: wallB,
    wallCMm: wallC,
    heightMm: height,
    cornerDirection,
  };
}

function typedLengthsOf(room: TypedRoom): TypedLengths {
  const { wallA, wallB, wallC, height } = room;
  if (room.shape === "linear") return { wallA, height };
  if (room.shape === "L") return { wallA, wallB, height };
  return { wallA, wallB, wallC, height };
}

function draftOf(room: TypedRoom): RoomDraft {
  return draftTyped(room.shape, typedLengthsOf(room), room.direction);
}

/** Criterion 7's definition, restated from the domain's own issues: `{A,B,C}` ∩ the issue fields,
 *  in drawing order, each with the reason its code names. */
function expectedMarksFor(room: TypedRoom): readonly MarkedPlanWall[] {
  const validation = validateRoomInput(roomInputOf(room), APPROVED_ROOM_POLICY);
  const issues: readonly RoomIssue[] = validation.ok ? [] : validation.issues;
  return WALL_IDS.flatMap((wallId) => {
    const issue = issues.find(
      (candidate) => WALL_OF_FIELD[candidate.field] === wallId,
    );
    if (issue === undefined) return [];
    const labelKey = LABEL_KEY_OF_CODE[issue.code];
    if (labelKey === undefined) {
      throw new Error(
        `a wall issue ${issue.code} has no plan label to be written in`,
      );
    }
    return [{ wall: wallId, labelKey }];
  });
}

const typedWall = fc.integer(TYPED_WALL_MM);

const anyTypedRoom: fc.Arbitrary<TypedRoom> = fc.record({
  shape: fc.constantFrom(...SHAPES),
  direction: fc.constantFrom(...DIRECTIONS),
  wallA: typedWall,
  wallB: typedWall,
  wallC: typedWall,
  height: fc.integer(TYPED_CEILING_MM),
});

const anyMark: fc.Arbitrary<MarkedPlanWall> = fc.record({
  wall: fc.constantFrom(...WALL_IDS),
  labelKey: fc.constantFrom(...LABEL_KEYS),
});

/** At most one mark per wall, as the issue model makes them. */
const anyMarkSet: fc.Arbitrary<readonly MarkedPlanWall[]> = fc.uniqueArray(
  anyMark,
  {
    selector: (mark) => mark.wall,
    maxLength: 3,
  },
);

const marksAndAPermutation = anyMarkSet.chain((marks) =>
  fc
    .shuffledSubarray([...marks], {
      minLength: marks.length,
      maxLength: marks.length,
    })
    .map((shuffled) => [marks, shuffled] as const),
);

function geometryJsonOf(plan: PlanPreview): string {
  return JSON.stringify(plan, (key, value: unknown) =>
    key === "issueLabelKey" ? undefined : value,
  );
}

function deepFrozen<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const nested of Object.values(value)) deepFrozen(nested);
    Object.freeze(value);
  }
  return value;
}

// ---------------------------------------------------------------------------------------------
// A mark finds its wall by id — the two sabotages the developer's plans cannot tell apart
// ---------------------------------------------------------------------------------------------

describe("a mark finds its wall by id, never by array index", () => {
  // A plan with wall A left out puts wall B at index 0. **No draft draws one** — since 7F2 S5
  // (Q-7F2-3 = a) a plan draws every wall its shape asks for or none — so it is built by taking a
  // complete drawing and dropping wall A. `markPlanWalls` is a pure step over any plan it is handed,
  // and only a plan whose index and id disagree can tell marking by id from marking by index.
  it.each(DIRECTIONS)(
    "marks wall B when it is the only wall drawn, with the corner turning %s",
    (direction) => {
      const plan = withoutWallA(
        planOf(draftTyped("L", { wallA: 3600, wallB: 2400 }, direction)),
      );

      expect(plan.walls.map((candidate) => candidate.wall)).toEqual(["B"]);
      expect(
        marksOn(markPlanWalls(plan, [{ wall: "B", labelKey: TOO_SHORT }])),
      ).toEqual([{ wall: "B", labelKey: TOO_SHORT }]);
    },
  );

  it.each(DIRECTIONS)(
    "marks nothing for wall A when wall A is not drawn, with the corner turning %s",
    (direction) => {
      const plan = withoutWallA(
        planOf(draftTyped("L", { wallA: 3600, wallB: 2400 }, direction)),
      );

      expect(plan.walls).toHaveLength(1);
      expect(markPlanWalls(plan, [{ wall: "A", labelKey: TOO_LONG }])).toEqual(
        plan,
      );
    },
  );

  it("marks a U's walls B and C by id when wall A is not drawn", () => {
    const plan = withoutWallA(
      planOf(
        draftTyped("U", { wallA: 3600, wallB: 2400, wallC: 1200 }, "left"),
      ),
    );
    const marks: readonly MarkedPlanWall[] = [
      { wall: "C", labelKey: TOO_LONG },
    ];

    expect(plan.walls.map((candidate) => candidate.wall)).toEqual(["B", "C"]);
    expect(marksOn(markPlanWalls(plan, marks))).toEqual(marks);
  });
});

describe("a mark finds its wall by id, never by the side of the screen it is drawn on", () => {
  // In a mirrored U, wall B stands at the right edge and wall C at the left. A mark placed by side
  // ("B is the left-hand wall") paints C.
  it.each(DIRECTIONS)(
    "paints a mark on B onto B's own rectangle in a U turning %s, whatever the walls measure",
    (direction) => {
      fc.assert(
        fc.property(typedWall, typedWall, typedWall, (wallA, wallB, wallC) => {
          const plan = planOf(
            draftTyped("U", { wallA, wallB, wallC }, direction),
          );
          const marked = markPlanWalls(plan, [
            { wall: "B", labelKey: TOO_SHORT },
          ]);
          const { issueLabelKey, ...redRect } = wallOf(marked, "B");

          expect(issueLabelKey).toBe(TOO_SHORT);
          expect(redRect).toEqual(wallOf(plan, "B"));
          expect(wallOf(marked, "C").issueLabelKey).toBeUndefined();
        }),
        { numRuns: SAMPLES_PER_ARM },
      );
    },
  );

  // Restated 2026-09-29 (M7B U5 S1, Q-U4 (b)): a U is never mirrored, so a `right` left on its draft
  // by an L the customer looked at first leaves B at the left and C at the right. This test drew B on
  // the right for a right-hand U while nothing had said a U has one hand. The mirror itself, and the
  // mark finding its wall by id through it, are the L's and are held by the test below.
  it("paints wall B at the left-hand edge of a U whose draft says right, and wall C at the right", () => {
    const plan = planOf(
      draftTyped("U", { wallA: 3600, wallB: 2400, wallC: 1200 }, "right"),
    );
    const marked = markPlanWalls(plan, [
      { wall: "B", labelKey: TOO_SHORT },
      { wall: "C", labelKey: TOO_LONG },
    ]);

    expect(wallOf(marked, "B").xPx).toBeLessThan(wallOf(marked, "C").xPx);
    expect(wallOf(marked, "B").issueLabelKey).toBe(TOO_SHORT);
    expect(wallOf(marked, "C").issueLabelKey).toBe(TOO_LONG);
  });

  it("commutes with the mirror for any plan and any marks, not only the issue model's", () => {
    fc.assert(
      fc.property(anyTypedRoom, anyMarkSet, (room, marks) => {
        const plan = planOf(draftOf({ ...room, direction: "left" }));

        expect(reflectPlanPreview(markPlanWalls(plan, marks))).toEqual(
          markPlanWalls(reflectPlanPreview(plan), marks),
        );
      }),
      { numRuns: SAMPLES_PER_ARM },
    );
  });
});

// ---------------------------------------------------------------------------------------------
// The marked set is exactly {A,B,C} ∩ the issue fields
// ---------------------------------------------------------------------------------------------

describe("the marks are exactly the refused walls, taken from the domain directly", () => {
  it("marks exactly the walls the domain refuses, for any shape typed from its first digit", () => {
    fc.assert(
      fc.property(anyTypedRoom, (room) => {
        const draft = draftOf(room);
        const marked = markPlanWalls(
          planOf(draft),
          markedWallsFromTheIssueModel(draft),
        );

        expect(marksOn(marked)).toEqual(expectedMarksFor(room));
      }),
      { numRuns: SAMPLES_PER_ARM * 5 },
    );
  });

  // Mid-typing prefixes are the population S1b made the commonest 1C: a wall that reads "3" on its
  // way to 3600 is refused as too short, and the plan will be marked for it.
  it.each(DIRECTIONS)(
    "marks a wall being typed as too short at every prefix below the minimum, turning %s",
    (direction) => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 99 }), (prefixMm) => {
          const draft = draftTyped(
            "L",
            { wallA: 3600, wallB: prefixMm, height: 2600 },
            direction,
          );

          expect(
            marksOn(
              markPlanWalls(planOf(draft), markedWallsFromTheIssueModel(draft)),
            ),
          ).toEqual([{ wall: "B", labelKey: TOO_SHORT }]);
        }),
        { numRuns: 99 },
      );
    },
  );

  it("marks no wall of a U, which is refused on its shape before any field is judged", () => {
    fc.assert(
      fc.property(anyTypedRoom, (room) => {
        const draft = draftOf({ ...room, shape: "U" });

        expect(markedWallsFromTheIssueModel(draft)).toEqual([]);
        expect(
          marksOn(
            markPlanWalls(planOf(draft), markedWallsFromTheIssueModel(draft)),
          ),
        ).toEqual([]);
      }),
      { numRuns: SAMPLES_PER_ARM },
    );
  });

  // 7J S5: a straight kitchen is field-judged now (ADR 0108 Amendment G), so wall A marks the same
  // way an L's wall B does above — restated from "marks no wall of a linear", which held before
  // this wave.
  it("marks wall A of a linear as too short at every prefix below the minimum", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1199 }), (prefixMm) => {
        const draft = draftTyped(
          "linear",
          { wallA: prefixMm, height: 2600 },
          "left",
        );

        expect(
          marksOn(
            markPlanWalls(planOf(draft), markedWallsFromTheIssueModel(draft)),
          ),
        ).toEqual([{ wall: "A", labelKey: TOO_SHORT }]);
      }),
      { numRuns: 99 },
    );
  });

  it("marks no wall when the room is refused only as too small for the kitchen", () => {
    // 900 x 2160 x 2200: `room-screen.dom.test.ts`'s own too-small fixture, every field in range.
    const draft = draftTyped(
      "L",
      { wallA: 900, wallB: 2160, height: 2200 },
      "left",
    );
    const validation = validateRoomInput(
      {
        shape: "L",
        wallAMm: 900,
        wallBMm: 2160,
        heightMm: 2200,
        cornerDirection: "left",
      },
      APPROVED_ROOM_POLICY,
    );

    expect(
      validation.ok ? [] : validation.issues.map((issue) => issue.code),
    ).toEqual(["ROOM_TOO_SMALL_FOR_KITCHEN"]);
    expect(
      marksOn(
        markPlanWalls(planOf(draft), markedWallsFromTheIssueModel(draft)),
      ),
    ).toEqual([]);
  });

  it.each([
    ["too low", 1500],
    ["too high", 4500],
  ] as const)(
    "marks no wall when only the ceiling is %s",
    (_name, heightMm) => {
      const draft = draftTyped(
        "L",
        { wallA: 3600, wallB: 2400, height: heightMm },
        "right",
      );

      expect(
        marksOn(
          markPlanWalls(planOf(draft), markedWallsFromTheIssueModel(draft)),
        ),
      ).toEqual([]);
    },
  );

  it("never hands the card two marks for one wall", () => {
    fc.assert(
      fc.property(anyTypedRoom, (room) => {
        const walls = markedWallsFromTheIssueModel(draftOf(room)).map(
          (mark) => mark.wall,
        );

        expect(new Set(walls).size).toBe(walls.length);
      }),
      { numRuns: SAMPLES_PER_ARM * 5 },
    );
  });
});

describe("markPlanWalls over arbitrary marks", () => {
  it("marks each drawn wall a mark names, and no other, for any plan and any marks", () => {
    fc.assert(
      fc.property(anyTypedRoom, anyMarkSet, (room, marks) => {
        const plan = planOf(draftOf(room));
        const drawnIds =
          plan.kind === "drawn"
            ? plan.walls.map((candidate) => candidate.wall)
            : [];
        const expected = drawnIds.flatMap((wallId) =>
          marks.filter((mark) => mark.wall === wallId),
        );

        expect(marksOn(markPlanWalls(plan, marks))).toEqual(expected);
      }),
      { numRuns: SAMPLES_PER_ARM },
    );
  });

  it("gives the same plan whatever order the marks arrive in", () => {
    fc.assert(
      fc.property(
        anyTypedRoom,
        marksAndAPermutation,
        (room, [marks, shuffled]) => {
          const plan = planOf(draftOf(room));

          expect(markPlanWalls(plan, shuffled)).toEqual(
            markPlanWalls(plan, marks),
          );
        },
      ),
      { numRuns: SAMPLES_PER_ARM },
    );
  });

  it("reads a mark repeated for the same wall as that one mark", () => {
    const plan = planOf(draftTyped("L", { wallA: 3600, wallB: 450 }, "left"));
    const once: readonly MarkedPlanWall[] = [
      { wall: "B", labelKey: TOO_SHORT },
    ];

    expect(markPlanWalls(plan, [...once, ...once, ...once])).toEqual(
      markPlanWalls(plan, once),
    );
  });

  it("drops a mark on wall B or C from a linear plan, which draws wall A alone", () => {
    const plan = planOf(
      draftTyped("linear", { wallA: 3600, wallB: 450, wallC: 900 }, "left"),
    );
    const marked = markPlanWalls(plan, [
      { wall: "B", labelKey: TOO_SHORT },
      { wall: "C", labelKey: TOO_LONG },
    ]);

    expect(JSON.stringify(marked)).toBe(JSON.stringify(plan));
  });

  it("marks the same way twice as once", () => {
    fc.assert(
      fc.property(anyTypedRoom, anyMarkSet, (room, marks) => {
        const once = markPlanWalls(planOf(draftOf(room)), marks);

        expect(markPlanWalls(once, marks)).toEqual(once);
      }),
      { numRuns: SAMPLES_PER_ARM },
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Marking is not geometry, and it is pure
// ---------------------------------------------------------------------------------------------

describe("marking moves no pixel, for any plan and any marks", () => {
  it("leaves every rectangle, label anchor, corner, scale and box byte-identical", () => {
    fc.assert(
      fc.property(anyTypedRoom, anyMarkSet, (room, marks) => {
        const plan = planOf(draftOf(room));

        expect(geometryJsonOf(markPlanWalls(plan, marks))).toBe(
          JSON.stringify(plan),
        );
      }),
      { numRuns: SAMPLES_PER_ARM * 5 },
    );
  });

  it("adds no key but the mark to a marked wall, and no key at all to an unmarked one", () => {
    fc.assert(
      fc.property(anyTypedRoom, anyMarkSet, (room, marks) => {
        const plan = planOf(draftOf(room));
        const marked = markPlanWalls(plan, marks);
        if (plan.kind === "empty" || marked.kind === "empty") return;

        expect(Object.keys(marked).sort()).toEqual(Object.keys(plan).sort());
        marked.walls.forEach((candidate, index) => {
          const extraKeys =
            candidate.issueLabelKey === undefined ? [] : ["issueLabelKey"];
          expect(Object.keys(candidate).sort()).toEqual(
            [...Object.keys(plan.walls[index] ?? {}), ...extraKeys].sort(),
          );
        });
      }),
      { numRuns: SAMPLES_PER_ARM },
    );
  });
});

describe("markPlanWalls is pure", () => {
  it("never writes to the plan or the marks it is handed, deep-frozen", () => {
    fc.assert(
      fc.property(anyTypedRoom, anyMarkSet, (room, marks) => {
        const plan = deepFrozen(planOf(draftOf(room)));
        const frozenMarks = deepFrozen(marks.map((mark) => ({ ...mark })));

        expect(() => markPlanWalls(plan, frozenMarks)).not.toThrow();
      }),
      { numRuns: SAMPLES_PER_ARM },
    );
  });

  it("passes an empty plan through as the same value, marks or none", () => {
    const empty = planOf(createRoomDraft("L"));

    expect(empty.kind).toBe("empty");
    expect(markPlanWalls(empty, [])).toBe(empty);
    expect(markPlanWalls(empty, [{ wall: "A", labelKey: TOO_SHORT }])).toBe(
      empty,
    );
  });

  it("returns an equal plan for equal arguments", () => {
    fc.assert(
      fc.property(anyTypedRoom, anyMarkSet, (room, marks) => {
        const plan = planOf(draftOf(room));

        expect(markPlanWalls(plan, marks)).toEqual(
          markPlanWalls(plan, [...marks]),
        );
      }),
      { numRuns: SAMPLES_PER_ARM },
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Criterion 2 on the plan's own labels
// ---------------------------------------------------------------------------------------------

const PLAN_LABEL_CATALOGUES = [
  ["ro", roMessages],
  ["ru", ruMessages as Catalogue],
] as const;

describe("a marked label carries no number, no code and no unit (criterion 2, ADR 0120 decision 3)", () => {
  const cases = PLAN_LABEL_CATALOGUES.flatMap(([locale, messages]) =>
    LABEL_KEYS.flatMap((labelKey) =>
      WALL_IDS.map((wallId) => [locale, labelKey, wallId, messages] as const),
    ),
  );

  it.each(cases)(
    "resolves %s %s for wall %s to a reason with none of them",
    (locale, labelKey, wallId, messages) => {
      const text = translatorFor(locale, messages)(labelKey, { wall: wallId });

      expect(text).not.toMatch(/\p{Nd}/u);
      expect(text).not.toMatch(/[A-Z]{2,}_[A-Z_]+/);
      expect(text).not.toMatch(/\bmm\b/);
      expect(text).not.toMatch(/мм/u);
      expect(text).not.toMatch(/[{}]/);
      expect(text.startsWith(`${wallId} `)).toBe(true);
    },
  );

  it.each(PLAN_LABEL_CATALOGUES)(
    "says too short and too long differently, in %s",
    (locale, messages) => {
      const translate = translatorFor(locale, messages);

      expect(translate(TOO_SHORT, { wall: "B" })).not.toBe(
        translate(TOO_LONG, { wall: "B" }),
      );
    },
  );

  it.each(PLAN_LABEL_CATALOGUES)(
    "names the wall it marks, so A, B and C read differently, in %s",
    (locale, messages) => {
      const translate = translatorFor(locale, messages);
      const texts = WALL_IDS.map((wallId) =>
        translate(TOO_SHORT, { wall: wallId }),
      );

      expect(new Set(texts).size).toBe(WALL_IDS.length);
    },
  );
});

// ---------------------------------------------------------------------------------------------
// The marked label, held to the unmarked label's placement claims at its own measured width
// ---------------------------------------------------------------------------------------------

interface RectPx {
  readonly leftPx: number;
  readonly topPx: number;
  readonly rightPx: number;
  readonly bottomPx: number;
}

function markedLabelRectPx(label: PlanWallLabelPx): RectPx {
  const leftPx = {
    centred: label.xPx - WIDEST_MARKED_LABEL_PX / 2,
    leftAligned: label.xPx,
    rightAligned: label.xPx - WIDEST_MARKED_LABEL_PX,
  }[label.alignment];
  return {
    leftPx,
    topPx: label.topPx,
    rightPx: leftPx + WIDEST_MARKED_LABEL_PX,
    bottomPx: label.topPx + PLAN_LABEL_LINE_PX,
  };
}

function barRectPx(bar: PlanWallRect): RectPx {
  return {
    leftPx: bar.xPx,
    topPx: bar.yPx,
    rightPx: bar.xPx + bar.widthPx,
    bottomPx: bar.yPx + bar.heightPx,
  };
}

function overlaps(one: RectPx, other: RectPx): boolean {
  return (
    one.leftPx < other.rightPx - FLOAT_TOLERANCE_PX &&
    other.leftPx < one.rightPx - FLOAT_TOLERANCE_PX &&
    one.topPx < other.bottomPx - FLOAT_TOLERANCE_PX &&
    other.topPx < one.bottomPx - FLOAT_TOLERANCE_PX
  );
}

function isInsideTheBox(rect: RectPx, box: PlanBox): boolean {
  return (
    rect.leftPx >= -FLOAT_TOLERANCE_PX &&
    rect.topPx >= -FLOAT_TOLERANCE_PX &&
    rect.rightPx <= box.widthPx + FLOAT_TOLERANCE_PX &&
    rect.bottomPx <= box.heightPx + FLOAT_TOLERANCE_PX
  );
}

/** Every L room the plan marks, typed from its first digit: the walls anywhere in 1–7000 mm. */
const anyMarkedLRoom: fc.Arbitrary<TypedRoom> = fc
  .record({
    shape: fc.constant<RoomShape>("L"),
    direction: fc.constantFrom(...DIRECTIONS),
    wallA: typedWall,
    wallB: typedWall,
    wallC: fc.constant(0),
    height: fc.constant(2600),
  })
  .filter((room) => expectedMarksFor(room).length > 0);

function markedPlanOf(room: TypedRoom): DrawnPlanPreview {
  const draft = draftOf(room);
  return drawn(
    markPlanWalls(planOf(draft), markedWallsFromTheIssueModel(draft)),
  );
}

function markedLabelsOverBars(plan: DrawnPlanPreview): readonly string[] {
  return plan.walls
    .filter((labelled) => labelled.issueLabelKey !== undefined)
    .flatMap((labelled) =>
      plan.walls
        .filter((bar) =>
          overlaps(markedLabelRectPx(labelled.labelPx), barRectPx(bar)),
        )
        .map((bar) => `${labelled.wall}'s marked label over wall ${bar.wall}`),
    );
}

describe("a marked label is placed as safely as a length is (the lane model, at the reason's width)", () => {
  it("keeps every marked label inside the box, at the Russian reason's measured width", () => {
    fc.assert(
      fc.property(anyMarkedLRoom, (room) => {
        const plan = markedPlanOf(room);

        for (const labelled of plan.walls.filter(
          (candidate) => candidate.issueLabelKey !== undefined,
        )) {
          expect(
            isInsideTheBox(markedLabelRectPx(labelled.labelPx), plan.boxPx),
          ).toBe(true);
        }
      }),
      { numRuns: SAMPLES_PER_ARM * 2 },
    );
  });

  // The QA finding S2's first round was sent back on: B's label line was centred on B's own bar, so a
  // wall B drawn under 11 px tall — typed short beside a long wall A — put the red reason over wall
  // A's bar. `lineBesideTheWallTopPx` now floors the line at the bar's top.
  it("keeps a marked wall B's label clear of wall A's bar in frame 1C's room typed with B at 100 mm", () => {
    const plan = markedPlanOf({
      shape: "L",
      direction: "left",
      wallA: 3600,
      wallB: 100,
      wallC: 0,
      height: 2600,
    });

    expect(wallOf(plan, "B").issueLabelKey).toBe(TOO_SHORT);
    expect(markedLabelsOverBars(plan)).toEqual([]);
  });

  it("keeps every marked label clear of every bar, for any L room the plan marks", () => {
    fc.assert(
      fc.property(anyMarkedLRoom, (room) => {
        expect(markedLabelsOverBars(markedPlanOf(room))).toEqual([]);
      }),
      { numRuns: SAMPLES_PER_ARM * 2 },
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Round 2: the label line's floor and the side rule, at every label's measured width
// ---------------------------------------------------------------------------------------------

/** An unmarked label, *"C · 1200 mm"*, as Chromium sets it (`700 11px Helvetica`, tabular digits),
 *  measured 2026-09-22 per digit count in ro and ru and the wider kept: 45.9 px at one digit, then
 *  6.12 px per digit — 64.2 at four, 82.6 at seven. */
const UNMARKED_LABEL_BASE_PX = 39.75;
const UNMARKED_LABEL_PX_PER_DIGIT = 6.12;

function unmarkedLabelWidthPx(millimetres: number): number {
  return Math.ceil(
    UNMARKED_LABEL_BASE_PX +
      UNMARKED_LABEL_PX_PER_DIGIT * String(millimetres).length,
  );
}

/** Criterion S1b-9's range: every whole millimetre a field can hold on the way to a room. */
const S1B_LABEL_DIGITS = { min: 1, max: 7 } as const;

/** A length of each digit count equally often, so seven-digit walls are not the whole sample. */
const anyLengthByDigits: fc.Arbitrary<number> = fc
  .integer(S1B_LABEL_DIGITS)
  .chain((digits) =>
    fc.integer({
      min: digits === 1 ? 1 : 10 ** (digits - 1),
      max: 10 ** digits - 1,
    }),
  );

function labelRectAtPx(label: PlanWallLabelPx, widthPx: number): RectPx {
  const leftPx = {
    centred: label.xPx - widthPx / 2,
    leftAligned: label.xPx,
    rightAligned: label.xPx - widthPx,
  }[label.alignment];
  return {
    leftPx,
    topPx: label.topPx,
    rightPx: leftPx + widthPx,
    bottomPx: label.topPx + PLAN_LABEL_LINE_PX,
  };
}

function unmarkedLabelProblemsIn(plan: DrawnPlanPreview): readonly string[] {
  return plan.walls.flatMap((labelled) => {
    const rect = labelRectAtPx(
      labelled.labelPx,
      unmarkedLabelWidthPx(labelled.lengthMm),
    );
    const outside = isInsideTheBox(rect, plan.boxPx)
      ? []
      : [`${labelled.wall}'s label off the box`];
    const over = plan.walls
      .filter((bar) => overlaps(rect, barRectPx(bar)))
      .map((bar) => `${labelled.wall}'s label over wall ${bar.wall}`);
    return [...outside, ...over];
  });
}

function drawnRoom(
  shape: "L" | "U",
  direction: CornerDirection,
  lengths: TypedLengths,
): DrawnPlanPreview {
  return drawn(planOf(draftTyped(shape, lengths, direction)));
}

describe("every unmarked label, at its measured width, stays in the box and off every bar", () => {
  it.each(["L", "U"] as const)(
    "holds for any %s whose walls read one to seven digits, in both directions",
    (shape) => {
      fc.assert(
        fc.property(
          fc.constantFrom(...DIRECTIONS),
          anyLengthByDigits,
          anyLengthByDigits,
          anyLengthByDigits,
          (direction, wallA, wallB, wallC) => {
            const lengths =
              shape === "U" ? { wallA, wallB, wallC } : { wallA, wallB };

            expect(
              unmarkedLabelProblemsIn(drawnRoom(shape, direction, lengths)),
            ).toEqual([]);
          },
        ),
        { numRuns: SAMPLES_PER_ARM * 10 },
      );
    },
  );

  // The U the side rule was changed for: wall A drawn narrower than two wall thicknesses, so B and C
  // overlap and HEAD sent B's label onto C's bar. Inside the approved rectangle, not a typing artefact.
  it.each(DIRECTIONS)(
    "keeps B's and C's labels off each other's bar in a 900 x 1000 x 2800 U turning %s",
    (direction) => {
      const plan = drawnRoom("U", direction, {
        wallA: 900,
        wallB: 1000,
        wallC: 2800,
      });

      expect(unmarkedLabelProblemsIn(plan)).toEqual([]);
    },
  );

  it.each(DIRECTIONS)(
    "keeps a 4 x 1 x 3 mm U's labels in the box and off its bars, turning %s",
    (direction) => {
      expect(
        unmarkedLabelProblemsIn(
          drawnRoom("U", direction, { wallA: 4, wallB: 1, wallC: 3 }),
        ),
      ).toEqual([]);
    },
  );
});

describe("the line beside a wall is floored at its bar's top, in the only box production draws in", () => {
  it("never starts a B or C label above its own bar, nor lets it leave the box's bottom", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<"L" | "U">("L", "U"),
        fc.constantFrom(...DIRECTIONS),
        anyLengthByDigits,
        anyLengthByDigits,
        anyLengthByDigits,
        (shape, direction, wallA, wallB, wallC) => {
          const plan = drawnRoom(shape, direction, { wallA, wallB, wallC });

          for (const wall of plan.walls.filter(
            (candidate) => candidate.wall !== "A",
          )) {
            expect(wall.labelPx.topPx).toBeGreaterThanOrEqual(
              wall.yPx - FLOAT_TOLERANCE_PX,
            );
            expect(wall.labelPx.topPx + PLAN_LABEL_LINE_PX).toBeLessThanOrEqual(
              plan.boxPx.heightPx + FLOAT_TOLERANCE_PX,
            );
          }
        },
      ),
      { numRuns: SAMPLES_PER_ARM * 10 },
    );
  });

  it("still centres the line on a bar tall enough to hold it, so an approved room reads as before", () => {
    const wallB = wallOf(
      planOf(draftTyped("L", { wallA: 3600, wallB: 2400 }, "left")),
      "B",
    );

    expect(wallB.labelPx.topPx).toBeCloseTo(
      wallB.yPx + wallB.heightPx / 2 - PLAN_LABEL_LINE_PX / 2,
      9,
    );
  });
});
