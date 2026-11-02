import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  VERSION_LABEL_MAX_LENGTH,
  VERSION_NOTE_MAX_LENGTH,
  judgeVersionLabel,
  judgeVersionNote,
  type VersionTextJudgement,
} from "../../src/price-dashboard/index.js";

// Swept: every forbidden class at every position, every format character the rule must be blind to, the NFC count both
// ways round, and the fixed point a stored value must be (reading a stored value gives that value again).

const BIDI_CONTROLS = [
  "؜",
  "‎",
  "‏",
  "‪",
  "‫",
  "‬",
  "‭",
  "‮",
  "⁦",
  "⁧",
  "⁨",
  "⁩",
] as const;

const OTHER_REFUSED = [
  "\t",
  "\n",
  "\r",
  "\u0000",
  "\u001F",
  "\u007F",
  "\u0085",
  "\u009B",
  " ",
  " ",
  "\uD800",
  "\uDBFF",
  "\uDC00",
  "\uDFFF",
] as const;

const REFUSED_CHARACTERS = [...BIDI_CONTROLS, ...OTHER_REFUSED];

/** Every format character the rule strips: all of `\p{Cf}` but the direction controls it refuses. */
const STRIPPED_FORMAT_CHARACTERS: readonly string[] = (() => {
  const found: string[] = [];
  for (let codePoint = 0; codePoint <= 0x10ffff; codePoint += 1) {
    const character = String.fromCodePoint(codePoint);
    if (
      /\p{Cf}/u.test(character) &&
      !(BIDI_CONTROLS as readonly string[]).includes(character)
    ) {
      found.push(character);
    }
  }
  return found;
})();

const JUDGEMENTS: readonly [
  string,
  (raw: unknown) => VersionTextJudgement,
  number,
][] = [
  ["label", judgeVersionLabel, VERSION_LABEL_MAX_LENGTH],
  ["note", judgeVersionNote, VERSION_NOTE_MAX_LENGTH],
];

const SAFE_BASE = fc
  .stringMatching(/^[A-Za-z0-9 \u20AC.,\u00E9\u0219-]{1,40}$/u)
  .filter((text) => text.trim() !== "");

function insertedAt(base: string, inserted: string, index: number): string {
  const characters = Array.from(base);
  const at = index % (characters.length + 1);
  return [...characters.slice(0, at), inserted, ...characters.slice(at)].join(
    "",
  );
}

function codePoints(text: string): number {
  return Array.from(text).length;
}

describe("a refused character anywhere in a label or a note", () => {
  it.each(JUDGEMENTS)(
    "is FORBIDDEN_CHARACTER in a %s, at any position of any ordinary text",
    (_name, judge) => {
      fc.assert(
        fc.property(
          SAFE_BASE,
          fc.constantFrom(...REFUSED_CHARACTERS),
          fc.nat(200),
          (base, refused, index) => {
            const judged = judge(insertedAt(base, refused, index));

            expect(judged).toEqual({ ok: false, code: "FORBIDDEN_CHARACTER" });
          },
        ),
        { numRuns: 400 },
      );
    },
  );

  it.each(JUDGEMENTS)(
    "is FORBIDDEN_CHARACTER in a %s even beside characters the rule strips, and even when the text is far too long",
    (_name, judge, max) => {
      const padding = "​".repeat(50);

      expect(judge(`ok${padding}‮${padding}`)).toEqual({
        ok: false,
        code: "FORBIDDEN_CHARACTER",
      });
      expect(judge(`${"a".repeat(max + 5)}⁦`)).toEqual({
        ok: false,
        code: "FORBIDDEN_CHARACTER",
      });
    },
  );

  it("refuses a lone surrogate a stripped format character would have joined to its partner", () => {
    expect(judgeVersionLabel("\uD83C​\uDF73")).toEqual({
      ok: false,
      code: "FORBIDDEN_CHARACTER",
    });
  });
});

describe("a format character the rule strips", () => {
  it("is found in the Unicode tables, so the sweep below is not empty", () => {
    expect(STRIPPED_FORMAT_CHARACTERS.length).toBeGreaterThan(100);
  });

  it.each(JUDGEMENTS)(
    "changes neither the outcome nor the count of a %s wherever it stands",
    (_name, judge) => {
      fc.assert(
        fc.property(
          SAFE_BASE,
          fc.constantFrom(...STRIPPED_FORMAT_CHARACTERS),
          fc.nat(200),
          (base, format, index) => {
            expect(judge(insertedAt(base, format, index))).toEqual(judge(base));
          },
        ),
        { numRuns: 500 },
      );
    },
  );

  it("is a label of nothing once all are gone: REQUIRED, never an empty stored label", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...STRIPPED_FORMAT_CHARACTERS, " ", " "), {
          maxLength: 20,
        }),
        (characters) => {
          expect(judgeVersionLabel(characters.join(""))).toEqual({
            ok: false,
            code: "REQUIRED",
          });
        },
      ),
    );
  });
});

describe("whatever is accepted", () => {
  it.each(JUDGEMENTS)(
    "is, for a %s, a stored form: composed, trimmed, bounded, free of every refused or stripped class, and read again as itself",
    (_name, judge, max) => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string({ unit: "binary", maxLength: 300 }),
            fc.string({ unit: "grapheme", maxLength: 300 }),
            fc
              .array(
                fc.constantFrom("a", "e", " ", "\u0301", "\u0308", "\u0958"),
                { maxLength: 300 },
              )
              .map((characters) => characters.join("")),
          ),
          (raw) => {
            const judged = judge(raw);
            if (!judged.ok) return;

            const { text } = judged;
            expect(text.normalize("NFC")).toBe(text);
            expect(text).toBe(text.trim());
            expect(codePoints(text)).toBeLessThanOrEqual(max);
            expect(text).not.toMatch(/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u);
            expect(judge(text)).toEqual({ ok: true, text });
          },
        ),
        { numRuns: 1500 },
      );
    },
  );

  it("is, for a label, never empty", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary", maxLength: 40 }), (raw) => {
        const judged = judgeVersionLabel(raw);
        if (judged.ok) expect(judged.text).not.toBe("");
      }),
      { numRuns: 1500 },
    );
  });
});

describe("the bound, counted on the composed form in code points", () => {
  it.each(JUDGEMENTS)(
    "accepts exactly the maximum and refuses one more, for a %s of astral characters",
    (_name, judge, max) => {
      expect(judge("\u{1F373}".repeat(max)).ok).toBe(true);
      expect(judge("\u{1F373}".repeat(max + 1))).toEqual({
        ok: false,
        code: "TOO_LONG",
      });
    },
  );

  it.each(JUDGEMENTS)(
    "counts a character that NFC expands (U+0958 becomes two code points) at its expanded length, for a %s",
    (_name, judge, max) => {
      const half = max / 2;

      const atBound = judge("क़".repeat(half));
      const pastBound = judge("क़".repeat(half + 1));

      expect(atBound.ok && codePoints(atBound.text)).toBe(max);
      expect(pastBound).toEqual({ ok: false, code: "TOO_LONG" });
    },
  );

  it.each(JUDGEMENTS)(
    "counts a %s after composition shrinks it, so a decomposed text of 2 × max units fits",
    (_name, judge, max) => {
      const decomposed = "é".repeat(max);

      const judged = judge(decomposed);

      expect(judged.ok && judged.text).toBe("é".repeat(max));
      expect(judge("é".repeat(max + 1)).ok).toBe(false);
    },
  );

  it.each(JUDGEMENTS)(
    "does not count what trimming or stripping removes, for a %s at the bound",
    (_name, judge, max) => {
      const full = "a".repeat(max);

      expect(judge(`  ${full}\u200B  `)).toEqual({ ok: true, text: full });
      expect(judge(`${full} `)).toEqual({ ok: true, text: full });
      expect(judge(`${full}b`).ok).toBe(false);
    },
  );

  it.each(JUDGEMENTS)(
    "counts the same at every length across the bound, for a %s",
    (_name, judge, max) => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: max + 20 }), (length) => {
          const judged = judge("q".repeat(length));

          expect(judged.ok).toBe(length <= max);
        }),
      );
    },
  );

  it("takes a longer note than label, and an absent or empty note as the empty one", () => {
    expect(judgeVersionNote("a".repeat(VERSION_LABEL_MAX_LENGTH + 1)).ok).toBe(
      true,
    );
    expect(judgeVersionNote(undefined)).toEqual({ ok: true, text: "" });
    expect(judgeVersionNote("")).toEqual({ ok: true, text: "" });
    expect(judgeVersionNote("   ")).toEqual({ ok: true, text: "" });
  });

  it("refuses a value that is not text, whatever its type", () => {
    for (const raw of [null, 0, 1, true, {}, [], ["a"], Symbol.iterator]) {
      expect(judgeVersionLabel(raw)).toEqual({
        ok: false,
        code: "NOT_TEXT",
      });
      expect(judgeVersionNote(raw)).toEqual({ ok: false, code: "NOT_TEXT" });
    }
    expect(judgeVersionLabel(undefined)).toEqual({
      ok: false,
      code: "REQUIRED",
    });
  });
});
