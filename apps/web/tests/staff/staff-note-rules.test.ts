// What a staff note is made of on the screen (Lot 3 wave L3-U4): the counter counts as the server counts, and the list takes
// a stored note in front without growing past what a read carries. The domain's own judgement of a note is the oracle of the
// counter, so the counter and the refusal cannot drift apart unseen.
import { fc } from "@fast-check/vitest";
import {
  judgeNoteText,
  NOTE_TEXT_MAX_LENGTH,
  NOTES_SHOWN_AT_MOST,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  noteLengthOf,
  withNoteAdded,
  withoutRepeatedNotes,
} from "@/staff/staff-note-rules";
import type {
  StaffKitchenNoteWire,
  StaffKitchenWire,
} from "@/staff/staff-kitchens-wire-contract";

import { wireKitchen } from "../support/staff-kitchen-wire";
import { staffKitchenFrom } from "@/staff/use-staff-kitchen";

/** Each piece is one letter to the eye; they differ in what they cost before and after composing. */
const DECOMPOSED_HANGUL = "한";
const PIECES = [
  "a",
  " ",
  "\n",
  "é",
  "é",
  DECOMPOSED_HANGUL,
  "한",
  "\u{1F600}",
  "​",
  "­",
  "‎",
  "́",
] as const;

const LETTER_PIECES = PIECES.filter((piece) => piece !== " " && piece !== "\n");

describe("the counter", () => {
  it("counts code points after composing: 1000 decomposed syllables are 1000, not 3000", () => {
    const typed = DECOMPOSED_HANGUL.repeat(1000);

    expect(typed.length).toBe(3000);
    expect(noteLengthOf(typed)).toBe(1000);
    expect(judgeNoteText(typed).ok).toBe(true);
  });

  it("counts an astral character once, where a counter of UTF-16 units counts it twice", () => {
    expect(noteLengthOf("\u{1F600}".repeat(1500))).toBe(1500);
    expect(judgeNoteText("\u{1F600}".repeat(1500)).ok).toBe(true);
    expect("\u{1F600}".repeat(1500).length).toBe(3000);
  });

  it("does not count what the server removes or trims", () => {
    expect(noteLengthOf("  a​­b \n")).toBe(2);
    expect(noteLengthOf("")).toBe(0);
    expect(noteLengthOf(" \n ")).toBe(0);
  });

  it("is the limit exactly at the limit, and over it one past", () => {
    expect(noteLengthOf("a".repeat(NOTE_TEXT_MAX_LENGTH))).toBe(
      NOTE_TEXT_MAX_LENGTH,
    );
    expect(judgeNoteText("a".repeat(NOTE_TEXT_MAX_LENGTH)).ok).toBe(true);
    expect(noteLengthOf("a".repeat(NOTE_TEXT_MAX_LENGTH + 1))).toBe(
      NOTE_TEXT_MAX_LENGTH + 1,
    );
    expect(judgeNoteText("a".repeat(NOTE_TEXT_MAX_LENGTH + 1))).toEqual({
      ok: false,
      code: "TOO_LONG",
    });
  });

  it("counts a text too long to be composed as long, as the server refuses it", () => {
    const typed = `a${"́".repeat(16_100)}`;

    expect(noteLengthOf(typed)).toBeGreaterThan(NOTE_TEXT_MAX_LENGTH);
    expect(judgeNoteText(typed)).toEqual({ ok: false, code: "TOO_LONG" });
  });

  it("calls a text too long exactly when the domain refuses it as too long (property over mixed pieces near the limit)", () => {
    const nearTheLimit = fc
      .array(fc.constantFrom(...PIECES), { minLength: 1850, maxLength: 2300 })
      .map((pieces) => pieces.join(""));

    fc.assert(
      fc.property(nearTheLimit, (typed) => {
        const judgement = judgeNoteText(typed);
        if (!judgement.ok && judgement.code === "REQUIRED") return;
        const isOver = noteLengthOf(typed) > NOTE_TEXT_MAX_LENGTH;
        expect(isOver).toBe(!judgement.ok && judgement.code === "TOO_LONG");
        if (judgement.ok) {
          expect(noteLengthOf(typed)).toBe(Array.from(judgement.text).length);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("calls a text too long exactly when the domain refuses it, over runs of combining marks as long as the compose bound (property)", () => {
    const longRuns = fc
      .tuple(
        fc.constantFrom(...LETTER_PIECES),
        fc.integer({ min: 15_000, max: 17_000 }),
      )
      .map(
        ([piece, count]) => `a${piece.repeat(Math.ceil(count / piece.length))}`,
      );

    fc.assert(
      fc.property(longRuns, (typed) => {
        const judgement = judgeNoteText(typed);
        const isRefusedAsLong = !judgement.ok && judgement.code === "TOO_LONG";
        expect(noteLengthOf(typed) > NOTE_TEXT_MAX_LENGTH).toBe(
          isRefusedAsLong,
        );
      }),
      { numRuns: 60 },
    );
  });
});

function note(id: string): StaffKitchenNoteWire {
  return {
    id,
    text: `text of ${id}`,
    createdAt: "2026-10-19T11:41:00.000Z",
    author: { email: "a@lemnaria.md", name: null },
  };
}

function kitchenWithNotes(
  count: number,
  notesTruncated = false,
): StaffKitchenWire {
  const wire = wireKitchen({
    notes: Array.from({ length: count }, (_, index) =>
      note(`old-${String(index)}`),
    ),
    notesTruncated,
  });
  const kitchen = staffKitchenFrom(wire);
  if (kitchen === undefined) throw new Error("the fixture is not a kitchen");
  return kitchen;
}

describe("a note added to the kitchen", () => {
  it("stands first, with the older ones after it in their order", () => {
    const edited = withNoteAdded(kitchenWithNotes(2), note("new"));

    expect(edited.notes.map(({ id }) => id)).toEqual(["new", "old-0", "old-1"]);
    expect(edited.notesTruncated).toBe(false);
  });

  it("is not drawn twice when the kitchen already holds it", () => {
    const edited = withNoteAdded(kitchenWithNotes(2), note("old-1"));

    expect(edited.notes.map(({ id }) => id)).toEqual(["old-1", "old-0"]);
  });

  it("keeps at most what a read carries and says the rest is not shown (property over the length before)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 130 }), (before) => {
        const shownBefore = Math.min(before, NOTES_SHOWN_AT_MOST);
        const edited = withNoteAdded(
          kitchenWithNotes(shownBefore, before > NOTES_SHOWN_AT_MOST),
          note("new"),
        );

        expect(edited.notes.length).toBe(
          Math.min(shownBefore + 1, NOTES_SHOWN_AT_MOST),
        );
        expect(edited.notes[0]?.id).toBe("new");
        expect(edited.notesTruncated).toBe(
          before > NOTES_SHOWN_AT_MOST || shownBefore + 1 > NOTES_SHOWN_AT_MOST,
        );
      }),
    );
  });

  it("never turns off a truncation the read reported", () => {
    expect(
      withNoteAdded(kitchenWithNotes(3, true), note("new")).notesTruncated,
    ).toBe(true);
  });

  it("changes nothing else of the kitchen", () => {
    const before = kitchenWithNotes(1);
    const after = withNoteAdded(before, note("new"));

    expect({ ...after, notes: [], notesTruncated: false }).toEqual({
      ...before,
      notes: [],
      notesTruncated: false,
    });
  });
});

describe("a list of notes that names one twice", () => {
  it("keeps the first and drops the later", () => {
    expect(
      withoutRepeatedNotes([note("a"), note("b"), note("a")]).map(
        ({ id }) => id,
      ),
    ).toEqual(["a", "b"]);
  });
});
