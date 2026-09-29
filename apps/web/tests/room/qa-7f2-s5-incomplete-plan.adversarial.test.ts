// **Adversarial QA — wave 7F2 slice S5, the incomplete plan (criterion 8, Q-7F2-3 = a).**
//
// The plan now draws nothing until every wall of the chosen shape reads as a length. "Reads as a
// length" is decided in two places that must agree: the plan asks the draft (`parseMillimetres` of
// the field's text), and every 1C surface asks the URL parser (`parseRoomUrlState` of the draft's
// canonical query, in metres). If they disagreed, a wall could be drawn while the parser still calls
// it missing — or a 1C reason could stand beside an empty plan. This file holds the two together:
//
// - over hostile field texts, and over raw query strings a deep link can arrive with;
// - over the millimetre ↔ metre wire the agreement rests on, across every safe integer;
// - over every 1C surface, typing or not: a reason, a red wall or the note implies a drawn plan;
// - over chip switches with values present.
import { fc } from "@fast-check/vitest";
import {
  APPROVED_ROOM_POLICY,
  type CornerDirection,
  type RoomShape,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { metresTextForUrl } from "@/room/metres-text";
import { presentOneC, draftStateOf, NOT_TYPING } from "@/room/one-c-surfaces";
import { parseMetresToMillimetres } from "@/room/parse-metres";
import { parseMillimetres } from "@/room/parse-millimetres";
import {
  derivePlanPreview,
  type PlanBox,
  type PlanPreview,
  type PlanWallId,
} from "@/room/plan-preview-model";
import {
  createRoomDraft,
  withCornerDirection,
  withEnteredText,
  withRoomShape,
  type RoomDraft,
  type RoomLengthField,
} from "@/room/room-draft";
import { roomDraftFromQuery } from "@/room/room-query-sync";
import {
  parseRoomUrlState,
  requiredFieldsFor,
  type RoomSearchParams,
} from "@/room/room-url-state";

const SAMPLES = 1000;

/** The box `plan-preview.tsx` hands the model: frame 1B's 320 x 104, less its hairline border. */
const FRAME_PREVIEW_BOX: PlanBox = { widthPx: 318, heightPx: 102 };

const SHAPES: readonly RoomShape[] = ["linear", "L", "U"];
const DIRECTIONS: readonly CornerDirection[] = ["left", "right"];
const LENGTH_FIELDS: readonly RoomLengthField[] = [
  "wallA",
  "wallB",
  "wallC",
  "height",
];
const WALL_FIELDS: readonly RoomLengthField[] = ["wallA", "wallB", "wallC"];

const WALL_OF_FIELD: Readonly<Record<string, PlanWallId>> = {
  wallA: "A",
  wallB: "B",
  wallC: "C",
};

/** The texts a field is most likely to be wrong about, each with whether it is a length. */
const FIELD_EDGE_TEXTS: readonly (readonly [string, boolean])[] = [
  ["", false],
  [" ", false],
  ["0", false],
  ["000", false],
  ["00000000000000000", false],
  ["0003600", true],
  ["03", true],
  [" 3600 ", true],
  ["\t3600\n", true],
  [" 3600", true],
  ["3,6", false],
  ["3.6", false],
  ["3600mm", false],
  ["3600 mm", false],
  ["+3600", false],
  ["-3600", false],
  ["3e3", false],
  ["3 600", false],
  ["３６００", false],
  ["٣٦٠٠", false],
  ["1", true],
  ["9007199254740991", true],
  ["9007199254740992", false],
  ["12345678901234567", false],
  ["99999999999999999999", false],
];

/** Wire texts a deep link can carry for a wall, including the metre habits the URL still reads. */
const URL_EDGE_VALUES: readonly (string | string[] | undefined)[] = [
  undefined,
  "",
  "3.6",
  "3,6",
  "3.6005",
  "3.6000",
  "0",
  "000",
  "0.0004",
  "0.001",
  "abc",
  "3600mm",
  " 3.6 ",
  "12345678901234567",
  "9007199254740.991",
  "9007199254740.992",
  "-1",
  ["3.6", "4.2"],
  ["3.6"],
];

// ---------------------------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------------------------

function planOf(draft: RoomDraft): PlanPreview {
  return derivePlanPreview(draft, FRAME_PREVIEW_BOX);
}

function drawnWallIds(plan: PlanPreview): readonly PlanWallId[] {
  return plan.kind === "drawn" ? plan.walls.map((wall) => wall.wall) : [];
}

function wallIdOf(field: RoomLengthField): PlanWallId {
  const wallId = WALL_OF_FIELD[field];
  if (wallId === undefined) throw new Error(`${field} is not a wall`);
  return wallId;
}

function wallsOf(shape: RoomShape): readonly PlanWallId[] {
  return requiredFieldsFor(shape)
    .filter((field) => WALL_FIELDS.includes(field))
    .map(wallIdOf);
}

function draftWithTexts(
  shape: RoomShape,
  texts: Partial<Record<RoomLengthField, string>>,
  direction: CornerDirection = "left",
): RoomDraft {
  const typed = Object.entries(texts).reduce(
    (draft, [field, text]) =>
      withEnteredText(draft, { field: field as RoomLengthField, text }),
    createRoomDraft(shape),
  );
  return withCornerDirection(typed, direction);
}

/** The walls the URL parser calls missing or unreadable for this draft — the 1B question, asked the
 *  way every 1C surface asks it. At 1C and 1D it calls none. */
function wallsTheParserMisses(draft: RoomDraft): readonly RoomLengthField[] {
  const state = draftStateOf(draft, APPROVED_ROOM_POLICY);
  if (state.substate !== "1B") return [];
  return state.markedFields.filter((field): field is RoomLengthField =>
    WALL_FIELDS.includes(field as RoomLengthField),
  );
}

const anyFieldText: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(...FIELD_EDGE_TEXTS.map(([text]) => text)),
  fc.string({ maxLength: 20 }),
  fc.stringMatching(/^[0-9]{1,20}$/),
  fc.integer({ min: 1, max: 7000 }).map(String),
);

const anyTexts: fc.Arbitrary<Record<RoomLengthField, string>> = fc.record({
  wallA: anyFieldText,
  wallB: anyFieldText,
  wallC: anyFieldText,
  height: anyFieldText,
});

const anyDraft: fc.Arbitrary<RoomDraft> = fc
  .record({
    shape: fc.constantFrom(...SHAPES),
    direction: fc.constantFrom(...DIRECTIONS),
    texts: anyTexts,
  })
  .map(({ shape, direction, texts }) =>
    draftWithTexts(shape, texts, direction),
  );

// ---------------------------------------------------------------------------------------------
// 1. The plan and the parser mean the same thing by a missing wall
// ---------------------------------------------------------------------------------------------

describe("the plan is empty exactly when the parser calls a required wall missing", () => {
  it.each(FIELD_EDGE_TEXTS)(
    "treats wall B typed %j as present = %s in a U, in the plan and in the parser alike",
    (text, isALength) => {
      const draft = draftWithTexts("U", {
        wallA: "3600",
        wallB: text,
        wallC: "1200",
        height: "2600",
      });

      expect(parseMillimetres(text).ok).toBe(isALength);
      expect(planOf(draft).kind).toBe(isALength ? "drawn" : "empty");
      expect(wallsTheParserMisses(draft)).toEqual(isALength ? [] : ["wallB"]);
    },
  );

  it("agrees for any shape and any text in any field, the height and stale walls included", () => {
    fc.assert(
      fc.property(anyDraft, (draft) => {
        const isEmpty = planOf(draft).kind === "empty";

        expect(isEmpty).toBe(wallsTheParserMisses(draft).length > 0);
      }),
      { numRuns: SAMPLES * 5 },
    );
  });

  it("draws, when it draws, exactly the walls the shape asks for — never a stale wall of another shape", () => {
    fc.assert(
      fc.property(anyDraft, (draft) => {
        const plan = planOf(draft);
        if (plan.kind === "empty") return;

        expect(drawnWallIds(plan)).toEqual(wallsOf(draft.shape));
      }),
      { numRuns: SAMPLES * 5 },
    );
  });

  it("carries every length a field reads across the metre wire and back unchanged, up to 2^53 - 1", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ min: 1, max: 100_000 }),
          fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
          fc.constantFrom(1, 999, 1000, 1001, Number.MAX_SAFE_INTEGER),
        ),
        (millimetres) => {
          const wire = parseMetresToMillimetres(metresTextForUrl(millimetres));

          expect(wire).toEqual({ ok: true, mm: millimetres });
        },
      ),
      { numRuns: SAMPLES * 5 },
    );
  });
});

describe("a deep link draws a plan exactly when its parser reading has every required wall", () => {
  const anyUrlValue = fc.constantFrom(...URL_EDGE_VALUES);

  it("agrees for any shape and any wire value in any key, repeated keys included", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SHAPES),
        fc.constantFrom<CornerDirection | undefined>(
          "left",
          "right",
          undefined,
        ),
        anyUrlValue,
        anyUrlValue,
        anyUrlValue,
        anyUrlValue,
        (shape, direction, wallA, wallB, wallC, height) => {
          const query: RoomSearchParams = {
            shape,
            ...(wallA === undefined ? {} : { wallA }),
            ...(wallB === undefined ? {} : { wallB }),
            ...(wallC === undefined ? {} : { wallC }),
            ...(height === undefined ? {} : { height }),
            ...(direction === undefined ? {} : { direction }),
          };
          const state = parseRoomUrlState(query);
          const parserMissesAWall =
            state.substate === "1B" &&
            state.markedFields.some((field) =>
              WALL_FIELDS.includes(field as RoomLengthField),
            );

          expect(planOf(roomDraftFromQuery(shape, query)).kind).toBe(
            parserMissesAWall ? "empty" : "drawn",
          );
        },
      ),
      { numRuns: SAMPLES * 3 },
    );
  });

  // A wall the URL carries for a shape that does not ask for it is present only on the wire: the
  // draft leaves it out, the parser ignores it, and neither may complete the plan with it.
  it("does not complete an L with a wall C present only in the URL, nor a linear room with B", () => {
    const lWithC: RoomSearchParams = {
      shape: "L",
      wallA: "3.6",
      wallC: "2.4",
      height: "2.6",
      direction: "left",
    };
    const linearWithB: RoomSearchParams = {
      shape: "linear",
      wallB: "2.4",
      height: "2.6",
    };

    expect(planOf(roomDraftFromQuery("L", lWithC)).kind).toBe("empty");
    expect(parseRoomUrlState(lWithC)).toMatchObject({
      substate: "1B",
      markedFields: ["wallB"],
    });
    expect(planOf(roomDraftFromQuery("linear", linearWithB)).kind).toBe(
      "empty",
    );
  });
});

// ---------------------------------------------------------------------------------------------
// 2. No 1C surface beside an empty plan
// ---------------------------------------------------------------------------------------------

function surfacesOf(
  draft: RoomDraft,
  draftBeforeTyping: RoomDraft | undefined,
) {
  return presentOneC({
    draft,
    draftState: draftStateOf(draft, APPROVED_ROOM_POLICY),
    policy: APPROVED_ROOM_POLICY,
    typing:
      draftBeforeTyping === undefined
        ? NOT_TYPING
        : { isTyping: true, draftBeforeTyping, draftInBurst: draft },
  }).surfaces;
}

function showsAnyOneCSurface(surfaces: ReturnType<typeof surfacesOf>): boolean {
  return (
    surfaces.fieldReasons.length > 0 ||
    surfaces.roomReasons.length > 0 ||
    surfaces.markedWalls.length > 0 ||
    surfaces.isNoteShown
  );
}

describe("no reason, red wall or 1C note stands beside an empty plan", () => {
  it("holds settled, for any shape and any texts", () => {
    fc.assert(
      fc.property(anyDraft, (draft) => {
        if (!showsAnyOneCSurface(surfacesOf(draft, undefined))) return;

        expect(planOf(draft).kind).toBe("drawn");
      }),
      { numRuns: SAMPLES * 5 },
    );
  });

  it("holds mid-burst, whatever the burst began from — a 1C room or another shape", () => {
    fc.assert(
      fc.property(anyDraft, anyDraft, (before, now) => {
        if (!showsAnyOneCSurface(surfacesOf(now, before))) return;

        expect(planOf(now).kind).toBe("drawn");
      }),
      { numRuns: SAMPLES * 5 },
    );
  });

  // The generator above rarely lands a 1C room and then clears one of its walls, so the case is
  // built: a 1C L with B too short, and B emptied in the burst.
  it.each(LENGTH_FIELDS.filter((field) => field !== "wallC"))(
    "shows nothing of 1C mid-burst once %s of a 1C L is emptied",
    (field) => {
      const refused = draftWithTexts("L", {
        wallA: "3600",
        wallB: "450",
        height: "2600",
      });
      const emptied = withEnteredText(refused, { field, text: "" });

      expect(showsAnyOneCSurface(surfacesOf(refused, undefined))).toBe(true);
      expect(showsAnyOneCSurface(surfacesOf(emptied, refused))).toBe(false);
      expect(showsAnyOneCSurface(surfacesOf(emptied, undefined))).toBe(false);
    },
  );

  // S4: a U is refused on its shape and its fields are not judged. A filled U is 1C and draws; the
  // same U with C emptied is 1B and draws nothing — and in neither does a field or a wall carry 1C.
  it("keeps a U's shape refusal alone, drawn when filled and empty when wall C is cleared", () => {
    const filledU = draftWithTexts("U", {
      wallA: "800",
      wallB: "7000",
      wallC: "50",
      height: "1500",
    });
    const uMissingC = withEnteredText(filledU, { field: "wallC", text: "" });

    for (const [draft, kind] of [
      [filledU, "drawn"],
      [uMissingC, "empty"],
    ] as const) {
      const surfaces = surfacesOf(draft, filledU);
      expect(planOf(draft).kind).toBe(kind);
      expect(surfaces.isShapeRefused).toBe(true);
      expect(surfaces.fieldReasons).toEqual([]);
      expect(surfaces.markedWalls).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 3. A chip switched with values present
// ---------------------------------------------------------------------------------------------

const TYPED = { wallA: "3600", wallB: "2400", wallC: "1200", height: "2600" };

describe("a chip switched with values present draws the new shape or nothing", () => {
  it.each(DIRECTIONS)(
    "empties an L switched to U while wall C is empty, turning %s",
    (direction) => {
      const filledL = draftWithTexts(
        "L",
        { wallA: TYPED.wallA, wallB: TYPED.wallB, height: TYPED.height },
        direction,
      );

      expect(planOf(filledL).kind).toBe("drawn");
      expect(planOf(withRoomShape(filledL, "U"))).toEqual({
        kind: "empty",
        boxPx: FRAME_PREVIEW_BOX,
      });
    },
  );

  it.each(DIRECTIONS)(
    "draws a U switched to L as the L of its A and B alone, byte for byte, turning %s",
    (direction) => {
      const filledU = draftWithTexts("U", TYPED, direction);
      const freshL = draftWithTexts(
        "L",
        { wallA: TYPED.wallA, wallB: TYPED.wallB, height: TYPED.height },
        direction,
      );

      expect(JSON.stringify(planOf(withRoomShape(filledU, "L")))).toBe(
        JSON.stringify(planOf(freshL)),
      );
    },
  );

  it("empties a linear room switched to L while wall B is empty", () => {
    const linear = draftWithTexts("linear", {
      wallA: TYPED.wallA,
      height: TYPED.height,
    });

    expect(drawnWallIds(planOf(linear))).toEqual(["A"]);
    expect(planOf(withRoomShape(linear, "L")).kind).toBe("empty");
  });

  it("draws a filled U switched to linear as wall A alone", () => {
    const filledU = draftWithTexts("U", TYPED);

    expect(drawnWallIds(planOf(withRoomShape(filledU, "linear")))).toEqual([
      "A",
    ]);
  });

  it("returns to the full U on switching back, once the U's own walls are all still typed", () => {
    const filledU = draftWithTexts("U", TYPED, "right");
    const roundTrip = withRoomShape(withRoomShape(filledU, "L"), "U");

    expect(planOf(roundTrip)).toEqual(planOf(filledU));
  });

  it("never draws a shape other than the chip's, over any sequence of switches and keystrokes", () => {
    const step = fc.oneof(
      fc.record({
        kind: fc.constant("chip" as const),
        shape: fc.constantFrom(...SHAPES),
      }),
      fc.record({
        kind: fc.constant("type" as const),
        field: fc.constantFrom(...LENGTH_FIELDS),
        text: anyFieldText,
      }),
    );
    fc.assert(
      fc.property(
        fc.constantFrom(...SHAPES),
        fc.array(step, { maxLength: 15 }),
        (start, steps) => {
          let draft = createRoomDraft(start);
          for (const next of steps) {
            draft =
              next.kind === "chip"
                ? withRoomShape(draft, next.shape)
                : withEnteredText(draft, next);
            const drawn = drawnWallIds(planOf(draft));

            expect(
              drawn.length === 0 ||
                drawn.join() === wallsOf(draft.shape).join(),
            ).toBe(true);
          }
        },
      ),
      { numRuns: SAMPLES },
    );
  });
});
