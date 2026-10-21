// Wave L3-S2 adversarial QA, criterion K-8 and plan P-L3-5. `note-text.test.ts` pins the listed examples; this
// file adds what a plausible mutant would survive: every one of the 1,114,112 code points judged in a note,
// composition that GROWS a string (so a count taken before NFC under-counts), the uncomposed-length ceiling
// against real decompositions, and an independent oracle over structured text.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  NOTE_TEXT_MAX_LENGTH,
  judgeNoteText,
} from "../../src/staff/note-text.js";

const LAST_CODE_POINT = 0x10ffff;
const FIRST_SURROGATE = 0xd800;
const LAST_SURROGATE = 0xdfff;
const LINE_FEED = 0x0a;
const UNCOMPOSED_UNITS_CEILING = NOTE_TEXT_MAX_LENGTH * 8;

const LITERAL_REORDERING_CONTROLS = new Set([
  0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069,
]);
const LITERAL_LINE_AND_PARAGRAPH_SEPARATORS = new Set([0x2028, 0x2029]);
const UNICODE_FORMAT_CHARACTER = /^\p{Cf}$/u;
const UNICODE_BIDI_CONTROL = /^\p{Bidi_Control}$/u;
const MARKS_THAT_ONLY_MARK_DIRECTION = new Set([0x061c, 0x200e, 0x200f]);
const JAVASCRIPT_WHITESPACE = /^\s$/u;

type Expectation =
  | { readonly kind: "refused"; readonly code: string }
  | { readonly kind: "accepted"; readonly text: string };

function isControlOtherThanLineFeed(codePoint: number): boolean {
  const isC0 = codePoint <= 0x1f;
  const isDeleteOrC1 = codePoint >= 0x7f && codePoint <= 0x9f;
  return codePoint !== LINE_FEED && (isC0 || isDeleteOrC1);
}

function isSurrogate(codePoint: number): boolean {
  return codePoint >= FIRST_SURROGATE && codePoint <= LAST_SURROGATE;
}

function isForbiddenInANote(codePoint: number): boolean {
  return (
    isControlOtherThanLineFeed(codePoint) ||
    isSurrogate(codePoint) ||
    LITERAL_LINE_AND_PARAGRAPH_SEPARATORS.has(codePoint) ||
    LITERAL_REORDERING_CONTROLS.has(codePoint)
  );
}

function expectedBetweenLetters(codePoint: number): Expectation {
  if (isForbiddenInANote(codePoint)) {
    return { kind: "refused", code: "FORBIDDEN_CHARACTER" };
  }
  const character = String.fromCodePoint(codePoint);
  const text = UNICODE_FORMAT_CHARACTER.test(character)
    ? "ab"
    : `a${character}b`.normalize("NFC");
  return { kind: "accepted", text };
}

function mismatchesOf(
  judgeCase: (character: string, codePoint: number) => Expectation | null,
  actualOf: (character: string) => Expectation,
): string[] {
  const mismatches: string[] = [];
  for (let codePoint = 0; codePoint <= LAST_CODE_POINT; codePoint += 1) {
    const character = String.fromCodePoint(codePoint);
    const expected = judgeCase(character, codePoint);
    if (expected === null) continue;
    const actual = actualOf(character);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      mismatches.push(
        `U+${codePoint.toString(16).toUpperCase()}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
      );
    }
  }
  return mismatches;
}

function judgementOf(raw: string): Expectation {
  const judgement = judgeNoteText(raw);
  return judgement.ok
    ? { kind: "accepted", text: judgement.text }
    : { kind: "refused", code: judgement.code };
}

function codePointCount(text: string): number {
  return Array.from(text).length;
}

describe("every code point, judged between two letters", () => {
  it("accepts or refuses each as the Unicode category says, with no code point left to a listed example", () => {
    const mismatches = mismatchesOf(
      (_character, codePoint) => expectedBetweenLetters(codePoint),
      (character) => judgementOf(`a${character}b`),
    );

    expect(mismatches.slice(0, 10)).toEqual([]);
  });

  it("control: agrees with the engine's own Bidi_Control property: the nine reordering controls are exactly it minus the three direction marks", () => {
    const engineReorderingControls = new Set<number>();
    for (let codePoint = 0; codePoint <= LAST_CODE_POINT; codePoint += 1) {
      const isBidiControl = UNICODE_BIDI_CONTROL.test(
        String.fromCodePoint(codePoint),
      );
      if (isBidiControl && !MARKS_THAT_ONLY_MARK_DIRECTION.has(codePoint)) {
        engineReorderingControls.add(codePoint);
      }
    }

    expect([...engineReorderingControls].sort()).toEqual(
      [...LITERAL_REORDERING_CONTROLS].sort(),
    );
  });

  it("removes the Arabic letter mark and every tag character, which no example lists", () => {
    expect(judgementOf("a\u061Cb")).toEqual({ kind: "accepted", text: "ab" });
    expect(judgementOf("a\u{E0001}\u{E0041}\u{E007F}b")).toEqual({
      kind: "accepted",
      text: "ab",
    });
  });
});

describe("every code point, alone, is REQUIRED, refused or one stored character", () => {
  it("reads a single code point as the category says", () => {
    const mismatches = mismatchesOf(
      (character, codePoint) => {
        if (isForbiddenInANote(codePoint)) {
          return { kind: "refused", code: "FORBIDDEN_CHARACTER" };
        }
        const isNothingToStore =
          UNICODE_FORMAT_CHARACTER.test(character) ||
          JAVASCRIPT_WHITESPACE.test(character);
        return isNothingToStore
          ? { kind: "refused", code: "REQUIRED" }
          : { kind: "accepted", text: character.normalize("NFC") };
      },
      (character) => judgementOf(character),
    );

    expect(mismatches.slice(0, 10)).toEqual([]);
  });
});

describe("composition that grows a string is counted in the stored form", () => {
  function codePointsWhoseCompositionGrows(): number[] {
    const growing: number[] = [];
    for (let codePoint = 0; codePoint <= LAST_CODE_POINT; codePoint += 1) {
      const character = String.fromCodePoint(codePoint);
      const isRefusedOrRemoved =
        isForbiddenInANote(codePoint) ||
        UNICODE_FORMAT_CHARACTER.test(character);
      if (!isRefusedOrRemoved && codePointCount(character.normalize("NFC")) > 1)
        growing.push(codePoint);
    }
    return growing;
  }

  const growing = codePointsWhoseCompositionGrows();

  it("finds characters that grow, so the sweep below is not vacuous", () => {
    expect(growing.length).toBeGreaterThan(10);
    expect("\u0958".normalize("NFC")).toBe("\u0915\u093C");
    expect("\uFB2C".normalize("NFC").length).toBe(3);
  });

  it("accepts a note whose stored form is exactly 2000 characters and refuses one more, for every growing character", () => {
    const wrong: string[] = [];
    for (const codePoint of growing) {
      const character = String.fromCodePoint(codePoint);
      const growthPerCharacter = codePointCount(character.normalize("NFC"));
      const repeats = Math.floor(NOTE_TEXT_MAX_LENGTH / growthPerCharacter);
      const head = character.repeat(repeats);
      const filler =
        NOTE_TEXT_MAX_LENGTH - codePointCount(head.normalize("NFC"));
      const atTheBound = `${head}${"a".repeat(filler)}`;
      const storedLength = codePointCount(atTheBound.normalize("NFC"));
      const rawLength = codePointCount(atTheBound);
      if (storedLength !== NOTE_TEXT_MAX_LENGTH || rawLength >= storedLength) {
        wrong.push(`U+${codePoint.toString(16)}: premise broken`);
        continue;
      }
      const atBound = judgementOf(atTheBound);
      const pastBound = judgementOf(`${atTheBound}a`);
      if (atBound.kind !== "accepted")
        wrong.push(`U+${codePoint.toString(16)}: 2000 refused`);
      if (pastBound.kind !== "refused")
        wrong.push(`U+${codePoint.toString(16)}: 2001 accepted`);
    }

    expect(wrong.slice(0, 10)).toEqual([]);
  });

  it("refuses 1001 of U+0958 (1001 characters as typed, 2002 stored) and accepts 1000", () => {
    expect(judgementOf("\u0958".repeat(1000)).kind).toBe("accepted");
    expect(judgementOf("\u0958".repeat(1001))).toEqual({
      kind: "refused",
      code: "TOO_LONG",
    });
  });

  it("refuses 667 of U+FB2C (3 stored characters each) and accepts 666", () => {
    expect(judgementOf("\uFB2C".repeat(666)).kind).toBe("accepted");
    expect(judgementOf("\uFB2C".repeat(667))).toEqual({
      kind: "refused",
      code: "TOO_LONG",
    });
  });
});

describe("the uncomposed ceiling never refuses a note that fits once composed", () => {
  it("control: no single character is written in more than 8 UTF-16 units once decomposed, so 2000 stored characters never pass 16000 units", () => {
    let longest = 0;
    for (let codePoint = 0; codePoint <= LAST_CODE_POINT; codePoint += 1) {
      const decomposed = String.fromCodePoint(codePoint).normalize("NFD");
      longest = Math.max(longest, decomposed.length);
    }

    expect(longest * NOTE_TEXT_MAX_LENGTH).toBeLessThanOrEqual(
      UNCOMPOSED_UNITS_CEILING,
    );
  });

  it("accepts 2000 of the character that decomposes longest, written decomposed", () => {
    let longestCodePoint = 0;
    let longest = 0;
    for (let codePoint = 0; codePoint <= LAST_CODE_POINT; codePoint += 1) {
      const character = String.fromCodePoint(codePoint);
      const isComposable = character.normalize("NFC") === character;
      const length = character.normalize("NFD").length;
      if (isComposable && length > longest) {
        longest = length;
        longestCodePoint = codePoint;
      }
    }
    const character = String.fromCodePoint(longestCodePoint);

    const judgement = judgementOf(
      character.normalize("NFD").repeat(NOTE_TEXT_MAX_LENGTH),
    );

    expect(judgement).toEqual({
      kind: "accepted",
      text: character.repeat(NOTE_TEXT_MAX_LENGTH),
    });
  });
});

describe("structured text against an independent oracle", () => {
  const PIECES = [
    "a",
    "z",
    "e",
    "\u0301",
    "\u0308",
    "\u00E9",
    "\u0958",
    "\u1100\u1161\u11A8",
    "\uAC01",
    "\u{1F373}",
    "\u{1F468}\u200D\u{1F469}",
    "\n",
    " ",
    "  ",
    "\u00A0",
    "\u3000",
    "\u200B",
    "\u200E",
    "\u200F",
    "\uFEFF",
    "\u00AD",
    "\u061C",
    "\u2060",
  ] as const;
  const structuredText = fc
    .array(fc.constantFrom(...PIECES), { maxLength: 40 })
    .map((pieces) => pieces.join(""));

  function oracleOf(raw: string): Expectation {
    const withoutFormat = raw.replace(/\p{Cf}/gu, "");
    const text = withoutFormat.normalize("NFC").trim();
    if (text === "") return { kind: "refused", code: "REQUIRED" };
    return codePointCount(text) > NOTE_TEXT_MAX_LENGTH
      ? { kind: "refused", code: "TOO_LONG" }
      : { kind: "accepted", text };
  }

  propertyTest.prop([structuredText], { numRuns: 3000 })(
    "judges as strip-format, compose, trim, count",
    (raw) => {
      expect(judgementOf(raw)).toEqual(oracleOf(raw));
    },
  );

  propertyTest.prop([structuredText], { numRuns: 3000 })(
    "gives the same answer when any format character is inserted at the start, the end or between any two pieces",
    (raw) => {
      const insertions = ["\u200B", "\u200D", "\u200E", "\u2060", "\uFEFF"];
      for (const format of insertions) {
        expect(judgementOf(`${format}${raw}`)).toEqual(judgementOf(raw));
        expect(judgementOf(`${raw}${format}`)).toEqual(judgementOf(raw));
      }
    },
  );

  propertyTest.prop(
    [structuredText, fc.nat(), fc.constantFrom(...LITERAL_REORDERING_CONTROLS)],
    { numRuns: 3000 },
  )(
    "refuses a reordering control wherever it sits, even in a note that is otherwise accepted or empty",
    (raw, position, control) => {
      const at = position % (raw.length + 1);
      const poisoned = `${raw.slice(0, at)}${String.fromCodePoint(control)}${raw.slice(at)}`;

      expect(judgementOf(poisoned)).toEqual({
        kind: "refused",
        code: "FORBIDDEN_CHARACTER",
      });
    },
  );

  propertyTest.prop([structuredText], { numRuns: 3000 })(
    "stores a form that reads back unchanged, and never one with an edge space or a half pair",
    (raw) => {
      const first = judgementOf(raw);
      fc.pre(first.kind === "accepted");

      expect(judgementOf(first.text)).toEqual(first);
      expect(first.text).toBe(first.text.trim());
      expect(first.text).not.toMatch(/\p{Cs}/u);
    },
  );
});

describe("lone surrogate halves in the other order, and at the edges", () => {
  it.each([
    ["a low half before a high half", "x\uDC00\uD800y"],
    ["a high half at the very end", "note\uD83C"],
    ["a low half at the very start", "\uDF73note"],
    ["a high half before a format character before a letter", "\uD83C\u200Bx"],
    ["a pair split by a line feed", "\uD83C\n\uDF73"],
    ["a pair split by a bidi control", "\uD83C\u202E\uDF73"],
  ])("refuses %s", (_label, raw) => {
    expect(judgementOf(raw)).toEqual({
      kind: "refused",
      code: "FORBIDDEN_CHARACTER",
    });
  });
});

describe("a value that only looks like text", () => {
  it.each([
    [
      "an object whose toString gives a note",
      { toString: (): string => "nota" },
    ],
    ["an object whose valueOf gives a note", { valueOf: (): string => "nota" }],
    ["a function", () => "nota"],
    ["a symbol", Symbol("nota")],
    ["a bigint", 12n],
    ["an array of characters", ["n", "o", "t", "a"]],
  ])("%s is NOT_TEXT", (_label, raw) => {
    expect(judgementOf(raw as string)).toEqual({
      kind: "refused",
      code: "NOT_TEXT",
    });
  });

  it("is refused without calling toString or valueOf on it", () => {
    let wasCoerced = false;
    const spy = {
      toString: () => {
        wasCoerced = true;
        return "nota";
      },
    };

    judgeNoteText(spy);

    expect(wasCoerced).toBe(false);
  });

  it("answers any value at all without throwing, with a verdict of the stated shape", () => {
    fc.assert(
      fc.property(
        fc.anything({ withNullPrototype: true, withBigInt: true }),
        (raw) => {
          const judgement = judgeNoteText(raw);

          expect(Object.keys(judgement).sort()).toEqual(
            judgement.ok ? ["ok", "text"] : ["code", "ok"],
          );
        },
      ),
    );
  });
});
