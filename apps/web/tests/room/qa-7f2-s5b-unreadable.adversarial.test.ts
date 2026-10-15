// **Adversarial QA — wave 7F2 slice S5b: which fields hold unreadable text, as data.**
//
// The form explains a field on its own clock (the blur), but *which* fields may be explained comes
// from `RoomIssueView.unreadableFields`, passed through `presentOneC` unheld. This file pins that
// list to its definition (C-S1b-2: non-empty text the entry parser refuses, among the fields the shape
// asks for) over arbitrary strings, and proves the typing pause never holds or hides it.
import { fc } from "@fast-check/vitest";
import {
  APPROVED_ROOM_POLICY,
  type RoomShape,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { draftStateOf, NOT_TYPING, presentOneC } from "@/room/one-c-surfaces";
import {
  createRoomDraft,
  withEnteredText,
  type RoomDraft,
  type RoomLengthField,
} from "@/room/room-draft";

const SAMPLES = 2000;
const SHAPES: readonly RoomShape[] = ["linear", "L", "U"];
const FIELDS: readonly RoomLengthField[] = [
  "wallA",
  "wallB",
  "wallC",
  "height",
];

const anyText: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(
    "",
    " ",
    "0",
    "000",
    "0003600",
    " 3600",
    "3,6",
    "+3600",
    "3e3",
    "３６００",
    "٣٦٠٠",
    "9007199254740991",
    "9007199254740992",
    "12345678901234567",
    "99999999999999999999",
    "3600",
    "450",
  ),
  fc.string({ maxLength: 12 }),
  fc.stringMatching(/^[0-9]{1,20}$/),
);

const anyDraft: fc.Arbitrary<RoomDraft> = fc
  .record({
    shape: fc.constantFrom(...SHAPES),
    texts: fc.tuple(anyText, anyText, anyText, anyText),
  })
  .map(({ shape, texts }) =>
    FIELDS.reduce(
      (draft, field, index) =>
        withEnteredText(draft, { field, text: texts[index] ?? "" }),
      createRoomDraft(shape),
    ),
  );

/** The fields each shape asks for, written out. Asked of `requiredFieldsFor`, a field dropped there would leave both
 *  sides of every comparison below together. */
const FIELDS_ASKED_FOR: Readonly<
  Record<RoomShape, readonly RoomLengthField[]>
> = {
  linear: ["wallA", "height"],
  L: ["wallA", "wallB", "height"],
  U: ["wallA", "wallB", "wallC", "height"],
};

const ASCII_DIGITS_ONLY = /^[0-9]+$/;
const LARGEST_SAFE_MM = BigInt(Number.MAX_SAFE_INTEGER);

/** ADR 0126's rule for a length, restated on `BigInt` so it shares no code with the parser it is compared against:
 *  ASCII digits only, more than zero, and no larger than a number can hold exactly. */
function readsAsAWholeMillimetreCount(text: string): boolean {
  const trimmed = text.trim();
  if (!ASCII_DIGITS_ONLY.test(trimmed)) return false;
  const millimetres = BigInt(trimmed);
  return millimetres > 0n && millimetres <= LARGEST_SAFE_MM;
}

function expectedUnreadable(draft: RoomDraft): readonly RoomLengthField[] {
  return FIELDS_ASKED_FOR[draft.shape].filter((field) => {
    const text = draft.lengths[field].text;
    return text.trim() !== "" && !readsAsAWholeMillimetreCount(text);
  });
}

function unreadableShown(
  draft: RoomDraft,
  before: RoomDraft | undefined,
): readonly RoomLengthField[] {
  return presentOneC({
    draft,
    draftState: draftStateOf(draft, APPROVED_ROOM_POLICY),
    policy: APPROVED_ROOM_POLICY,
    typing:
      before === undefined
        ? NOT_TYPING
        : { isTyping: true, draftBeforeTyping: before, draftInBurst: draft },
  }).surfaces.unreadableFields;
}

describe("the unreadable fields are the entry parser's non-empty refusals, among the fields asked for", () => {
  it("equals the definition for any shape and any texts, settled", () => {
    fc.assert(
      fc.property(anyDraft, (draft) => {
        expect(unreadableShown(draft, undefined)).toEqual(
          expectedUnreadable(draft),
        );
      }),
      { numRuns: SAMPLES },
    );
  });

  it("is passed as it is now mid-burst, whatever the burst began from", () => {
    fc.assert(
      fc.property(anyDraft, anyDraft, (before, now) => {
        expect(unreadableShown(now, before)).toEqual(expectedUnreadable(now));
      }),
      { numRuns: SAMPLES },
    );
  });

  it("never lists a field the shape does not ask for, however unreadable its kept text", () => {
    const draft = FIELDS.reduce(
      (typed, field) => withEnteredText(typed, { field, text: "abc" }),
      createRoomDraft("linear"),
    );

    expect(unreadableShown(draft, undefined)).toEqual(["wallA", "height"]);
  });

  it("keeps the room out of 1C while any field is unreadable, so no 1C reason can share a field", () => {
    fc.assert(
      fc.property(anyDraft, (draft) => {
        if (expectedUnreadable(draft).length === 0) return;

        expect(draftStateOf(draft, APPROVED_ROOM_POLICY).substate).toBe("1B");
      }),
      { numRuns: SAMPLES },
    );
  });
});
