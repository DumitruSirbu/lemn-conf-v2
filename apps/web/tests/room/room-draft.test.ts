// Wave 7F1 slice 3: the draft the customer types into, as a value. The claims worth a test are the
// ones a later slice would otherwise re-decide in a component — that a field shows exactly what was
// typed, that its millimetres are always what that text reads as, and that every update returns a
// new draft rather than editing the one it was handed.
import { fc } from "@fast-check/vitest";
import {
  APPROVED_ROOM_POLICY,
  type MillimetreBounds,
  type RoomShape,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { formatMetresForDisplay } from "@/room/metres-text";
import { parseMetresToMillimetres } from "@/room/parse-metres";
import {
  carriesCornerDirection,
  createRoomDraft,
  missingLengthFields,
  withCornerDirection,
  withEnteredText,
  withRoomShape,
  withStoredLength,
  type RoomDraft,
} from "@/room/room-draft";
import { requiredFieldsFor } from "@/room/room-url-state";

const SWEEP_RUNS = 500;

const ROOM_SHAPES: readonly RoomShape[] = ["linear", "L", "U"];

/** The product's source locale, used here only because a stored length has to be shown in some
 *  locale; `metres-text.test.ts` owns the claim about the separator itself. */
const A_PRODUCT_LOCALE = "ro";

function approvedWallBounds(): MillimetreBounds {
  const walls = APPROVED_ROOM_POLICY.buildableShapes.L;
  if (walls === undefined) {
    throw new Error("the approved policy states no L walls to sweep");
  }
  return walls.wallA;
}

function everyApprovedWallLength(): fc.Arbitrary<number> {
  const bounds = approvedWallBounds();
  return fc.integer({ min: bounds.minMm, max: bounds.maxMm });
}

function deepFrozen(draft: RoomDraft): RoomDraft {
  Object.values(draft.lengths).forEach((length) => Object.freeze(length));
  Object.freeze(draft.lengths);
  return Object.freeze(draft);
}

describe("createRoomDraft", () => {
  it.each(ROOM_SHAPES)("starts %s with every field empty", (shape) => {
    const draft = createRoomDraft(shape);

    for (const field of requiredFieldsFor(shape)) {
      expect(draft.lengths[field]).toEqual({
        text: "",
        millimetres: undefined,
      });
    }
  });

  it.each(ROOM_SHAPES)(
    "reports every field %s asks for as still to be filled",
    (shape) => {
      expect(missingLengthFields(createRoomDraft(shape))).toEqual(
        requiredFieldsFor(shape),
      );
    },
  );

  it("starts the corner turning left, as frame 1B draws it pre-selected", () => {
    expect(createRoomDraft("L").cornerDirection).toBe("left");
  });
});

describe("withEnteredText", () => {
  it("keeps a half-typed value exactly as it was typed, and reads it as no length", () => {
    const draft = withEnteredText(createRoomDraft("L"), {
      field: "wallA",
      text: "3,",
    });

    expect(draft.lengths.wallA).toEqual({ text: "3,", millimetres: undefined });
  });

  it("reads a readable value to the exact millimetre", () => {
    const draft = withEnteredText(createRoomDraft("L"), {
      field: "wallA",
      text: "3,56",
    });

    expect(draft.lengths.wallA).toEqual({ text: "3,56", millimetres: 3560 });
  });

  it("changes one field and leaves the others where they were", () => {
    const typed = withEnteredText(
      withEnteredText(createRoomDraft("L"), { field: "wallA", text: "3,56" }),
      { field: "wallB", text: "2,92" },
    );

    expect(typed.lengths.wallA.millimetres).toBe(3560);
    expect(typed.lengths.wallB.millimetres).toBe(2920);
    expect(typed.lengths.height).toEqual({ text: "", millimetres: undefined });
  });

  it("agrees with the parser about every text a field can hold", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const parsed = parseMetresToMillimetres(text);
        const length = withEnteredText(createRoomDraft("L"), {
          field: "wallA",
          text,
        }).lengths.wallA;

        expect(length.text).toBe(text);
        expect(length.millimetres).toBe(parsed.ok ? parsed.mm : undefined);
      }),
      { numRuns: SWEEP_RUNS },
    );
  });

  it("returns a new draft and edits nothing in the one it was given", () => {
    const before = deepFrozen(createRoomDraft("L"));

    const after = withEnteredText(before, { field: "wallA", text: "3,56" });

    expect(after).not.toBe(before);
    expect(before.lengths.wallA).toEqual({ text: "", millimetres: undefined });
  });
});

describe("withStoredLength", () => {
  it("puts a stored length in the field to the millimetre, over the approved range", () => {
    fc.assert(
      fc.property(everyApprovedWallLength(), (millimetres) => {
        const length = withStoredLength(createRoomDraft("L"), {
          field: "wallA",
          millimetres,
          locale: A_PRODUCT_LOCALE,
        }).lengths.wallA;

        expect(length.millimetres).toBe(millimetres);
        expect(parseMetresToMillimetres(length.text)).toEqual({
          ok: true,
          mm: millimetres,
        });
      }),
      { numRuns: SWEEP_RUNS },
    );
  });

  it("shows it in the customer's own notation rather than the wire's", () => {
    const length = withStoredLength(createRoomDraft("L"), {
      field: "wallA",
      millimetres: 3560,
      locale: A_PRODUCT_LOCALE,
    }).lengths.wallA;

    expect(length.text).toBe(formatMetresForDisplay(3560, A_PRODUCT_LOCALE));
  });

  it("leaves the draft it was given untouched", () => {
    const before = deepFrozen(createRoomDraft("L"));

    withStoredLength(before, {
      field: "wallA",
      millimetres: 3560,
      locale: A_PRODUCT_LOCALE,
    });

    expect(before.lengths.wallA.text).toBe("");
  });
});

describe("withRoomShape", () => {
  it("keeps what the customer already typed when they change the card", () => {
    const typed = withEnteredText(createRoomDraft("L"), {
      field: "wallA",
      text: "3,56",
    });

    const relinearised = withRoomShape(typed, "linear");

    expect(relinearised.shape).toBe("linear");
    expect(relinearised.lengths.wallA.millimetres).toBe(3560);
  });

  it("asks only for the fields the new shape needs", () => {
    const draft = withRoomShape(createRoomDraft("U"), "linear");

    expect(missingLengthFields(draft)).toEqual(requiredFieldsFor("linear"));
  });
});

describe("withCornerDirection", () => {
  it("turns the corner without touching a length", () => {
    const typed = withEnteredText(createRoomDraft("L"), {
      field: "wallA",
      text: "3,56",
    });

    const turned = withCornerDirection(typed, "right");

    expect(turned.cornerDirection).toBe("right");
    expect(turned.lengths).toEqual(typed.lengths);
  });
});

describe("carriesCornerDirection", () => {
  it.each([
    ["linear", false],
    ["L", true],
    ["U", true],
  ] as const)("says %s turns a corner: %s", (shape, carries) => {
    expect(carriesCornerDirection(shape)).toBe(carries);
  });
});
