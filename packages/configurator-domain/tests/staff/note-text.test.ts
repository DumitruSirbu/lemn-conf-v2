import { fc } from "@fast-check/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  NOTE_TEXT_MAX_LENGTH,
  judgeNoteText,
} from "../../src/staff/note-text.js";

const ASTRAL_CHARACTER = "\u{1F373}";
const LONE_HIGH_SURROGATE = "\uD800";
const LONE_LOW_SURROGATE = "\uDC00";
const COMBINING_ACUTE = "\u0301";
const PRECOMPOSED_E_ACUTE = "\u00E9";
const CONTROL_OTHER_THAN_LINE_FEED = /(?!\n)[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;
const BIDI_REORDERING_CONTROLS = [
  ["left-to-right embedding", "\u202A"],
  ["right-to-left embedding", "\u202B"],
  ["pop directional formatting", "\u202C"],
  ["left-to-right override", "\u202D"],
  ["right-to-left override", "\u202E"],
  ["left-to-right isolate", "\u2066"],
  ["right-to-left isolate", "\u2067"],
  ["first strong isolate", "\u2068"],
  ["pop directional isolate", "\u2069"],
] as const;

function acceptedTextOf(raw: unknown): string {
  const judgement = judgeNoteText(raw);
  if (!judgement.ok) {
    throw new Error(`expected an accepted note, refused as ${judgement.code}`);
  }
  return judgement.text;
}

function refusalCodeOf(raw: unknown): string | undefined {
  const judgement = judgeNoteText(raw);
  return judgement.ok ? undefined : judgement.code;
}

describe("judgeNoteText: what a staff note needs to be stored", () => {
  it("allows 2000 characters, as the `design_notes.body` length check does", () => {
    expect(NOTE_TEXT_MAX_LENGTH).toBe(2000);
  });

  it("accepts an ordinary note unchanged", () => {
    expect(acceptedTextOf("Clientul vrea blat din stejar")).toBe(
      "Clientul vrea blat din stejar",
    );
  });

  describe("an empty note is REQUIRED, never accepted as an empty string", () => {
    it.each([
      ["undefined", undefined],
      ["the empty string", ""],
      ["spaces", "   "],
      ["only line feeds", "\n\n"],
      ["spaces around a line feed", " \n "],
      ["a no-break space", "\u00A0"],
      ["an ideographic space", "\u3000"],
      ["a zero-width space alone", "\u200B"],
      ["format characters and spaces only", " \u200B\u200E\uFEFF \u00AD"],
    ])("%s", (_label, raw) => {
      expect(refusalCodeOf(raw)).toBe("REQUIRED");
    });
  });

  describe("a value that is not text is NOT_TEXT", () => {
    it.each([
      ["null", null],
      ["a number", 12],
      ["zero", 0],
      ["a boolean", false],
      ["an array of one string", ["nota"]],
      ["an object", { text: "nota" }],
      ["a String object", new String("nota")],
    ])("%s", (_label, raw) => {
      expect(refusalCodeOf(raw)).toBe("NOT_TEXT");
    });
  });

  describe("the length bound counts code points of the NFC form", () => {
    it("accepts one character", () => {
      expect(acceptedTextOf("a")).toBe("a");
    });

    it("accepts exactly 2000 characters and refuses 2001", () => {
      expect(acceptedTextOf("a".repeat(2000))).toBe("a".repeat(2000));
      expect(refusalCodeOf("a".repeat(2001))).toBe("TOO_LONG");
    });

    it("counts an astral character once, so 2000 of them (4000 UTF-16 units) fit and 2001 do not", () => {
      const fits = ASTRAL_CHARACTER.repeat(2000);

      expect(fits.length).toBe(4000);
      expect(acceptedTextOf(fits)).toBe(fits);
      expect(refusalCodeOf(ASTRAL_CHARACTER.repeat(2001))).toBe("TOO_LONG");
    });

    it("counts the composed form: 2000 decomposed letters are 2000 characters, 2001 are not", () => {
      const decomposed = (count: number) => `e${COMBINING_ACUTE}`.repeat(count);

      expect(acceptedTextOf(decomposed(2000))).toBe(
        PRECOMPOSED_E_ACUTE.repeat(2000),
      );
      expect(refusalCodeOf(decomposed(2001))).toBe("TOO_LONG");
    });

    it("counts a line feed as a character", () => {
      const halves = (extra: number) =>
        `${"a".repeat(1000)}\n${"a".repeat(999 + extra)}`;

      expect(acceptedTextOf(halves(0))).toBe(halves(0));
      expect(refusalCodeOf(halves(1))).toBe("TOO_LONG");
    });

    it("measures after trimming, so 2000 characters with whitespace around them fit", () => {
      expect(acceptedTextOf(` \n${"a".repeat(2000)}\n `)).toBe(
        "a".repeat(2000),
      );
    });

    it("measures after the format characters go, so they do not spend the bound", () => {
      const padded = `${"a".repeat(2000)}${"\u200B".repeat(500)}`;

      expect(acceptedTextOf(padded)).toBe("a".repeat(2000));
    });

    it("refuses a value far past the bound", () => {
      expect(refusalCodeOf("a".repeat(100_000))).toBe("TOO_LONG");
      expect(refusalCodeOf(`e${COMBINING_ACUTE.repeat(100_000)}`)).toBe(
        "TOO_LONG",
      );
    });
  });

  describe("no composition runs on a value far past the bound", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("never normalises text longer than eight times the maximum", () => {
      const normalisedLengths: number[] = [];
      const normalise = Reflect.get(String.prototype, "normalize") as (
        this: string,
        form?: string,
      ) => string;
      vi.spyOn(String.prototype, "normalize").mockImplementation(function (
        this: string,
        form?: string,
      ) {
        normalisedLengths.push(this.length);
        return normalise.call(this, form);
      });

      judgeNoteText(`e${COMBINING_ACUTE.repeat(100_000)}`);

      expect(Math.max(0, ...normalisedLengths)).toBeLessThanOrEqual(
        NOTE_TEXT_MAX_LENGTH * 8,
      );
    });
  });

  describe("a note spans lines: the line feed is kept", () => {
    it("keeps a line feed between two lines", () => {
      expect(acceptedTextOf("Prima linie\nA doua linie")).toBe(
        "Prima linie\nA doua linie",
      );
    });

    it("keeps a blank line and the indentation after a line feed", () => {
      expect(acceptedTextOf("a\n\n  b")).toBe("a\n\n  b");
    });

    it("trims the line feeds and spaces at the two ends only", () => {
      expect(acceptedTextOf("\n  a\nb  \n\n")).toBe("a\nb");
    });
  });

  describe("whitespace and unicode", () => {
    it("trims the no-break, ideographic and byte-order-mark whitespace at the ends", () => {
      expect(acceptedTextOf("\u00A0\u3000nota\u00A0\u3000")).toBe("nota");
    });

    it("keeps the spaces between words", () => {
      expect(acceptedTextOf("a   b")).toBe("a   b");
    });

    it("composes a decomposed letter", () => {
      expect(acceptedTextOf(`e${COMBINING_ACUTE}`)).toBe(PRECOMPOSED_E_ACUTE);
    });

    it("leaves a compatibility character alone (NFKC would turn the ligature into two letters)", () => {
      expect(acceptedTextOf("\uFB01rst")).toBe("\uFB01rst");
    });

    it("keeps Romanian, Russian and emoji text as written", () => {
      expect(acceptedTextOf("Привет — café — 日本語 🍳")).toBe(
        "Привет — café — 日本語 🍳",
      );
    });

    it("accepts a well-formed surrogate pair", () => {
      expect(acceptedTextOf(`a${ASTRAL_CHARACTER}b`)).toBe(
        `a${ASTRAL_CHARACTER}b`,
      );
    });
  });

  describe("format characters that do not reorder text are removed, not refused", () => {
    it.each([
      ["a zero-width space", "no\u200Bta", "nota"],
      ["a zero-width joiner", "no\u200Dta", "nota"],
      ["a soft hyphen", "no\u00ADta", "nota"],
      ["a byte order mark", "\uFEFFnota", "nota"],
      ["a left-to-right mark", "no\u200Eta", "nota"],
      ["a right-to-left mark", "no\u200Fta", "nota"],
      ["a word joiner", "no\u2060ta", "nota"],
    ])("%s", (_label, raw, expected) => {
      expect(acceptedTextOf(raw)).toBe(expected);
    });
  });

  describe("a character that reorders text on screen is FORBIDDEN_CHARACTER, not removed", () => {
    it.each(BIDI_REORDERING_CONTROLS)("%s", (_label, control) => {
      expect(refusalCodeOf(`Clientul ${control}nota`)).toBe(
        "FORBIDDEN_CHARACTER",
      );
    });

    it("refuses one at either end of the note", () => {
      expect(refusalCodeOf("\u202Enota")).toBe("FORBIDDEN_CHARACTER");
      expect(refusalCodeOf("nota\u2069")).toBe("FORBIDDEN_CHARACTER");
    });

    it("refuses one on a later line", () => {
      expect(refusalCodeOf("prima\nal doilea \u202E")).toBe(
        "FORBIDDEN_CHARACTER",
      );
    });
  });

  describe("any other control or separator character is FORBIDDEN_CHARACTER", () => {
    it.each([
      ["a carriage return", "no\rta"],
      ["a carriage return and line feed", "no\r\nta"],
      ["a tab", "no\tta"],
      ["a NUL", "no\u0000ta"],
      ["an escape", "no\u001Bta"],
      ["a C1 control (NEL)", "no\u0085ta"],
      ["a vertical tab", "no\u000Bta"],
      ["a form feed", "no\u000Cta"],
      ["a line separator", "no\u2028ta"],
      ["a paragraph separator", "no\u2029ta"],
      ["a lone high surrogate", `no${LONE_HIGH_SURROGATE}ta`],
      ["a lone low surrogate", `no${LONE_LOW_SURROGATE}ta`],
    ])("%s", (_label, raw) => {
      expect(refusalCodeOf(raw)).toBe("FORBIDDEN_CHARACTER");
    });

    it("refuses one on a later line, after a line feed that is itself allowed", () => {
      expect(refusalCodeOf("prima\nal doilea\ttab")).toBe(
        "FORBIDDEN_CHARACTER",
      );
    });

    it("does not let a format character join two lone halves into a valid-looking pair", () => {
      const halvesApart = `${LONE_HIGH_SURROGATE}\u200B${LONE_LOW_SURROGATE}`;

      expect(refusalCodeOf(`no${halvesApart}ta`)).toBe("FORBIDDEN_CHARACTER");
    });
  });

  describe("when more than one rule fails, the order is fixed", () => {
    it("reports a value of the wrong type before anything else", () => {
      expect(refusalCodeOf(42)).toBe("NOT_TEXT");
    });

    it("reports a forbidden character before a 2001-character length", () => {
      expect(refusalCodeOf(`${"a".repeat(2001)}\t`)).toBe(
        "FORBIDDEN_CHARACTER",
      );
      expect(refusalCodeOf(`${"a".repeat(2001)}${LONE_HIGH_SURROGATE}`)).toBe(
        "FORBIDDEN_CHARACTER",
      );
    });

    it("reports a reordering character before a length far past the bound", () => {
      expect(refusalCodeOf(`${"a".repeat(100_000)}\u202E`)).toBe(
        "FORBIDDEN_CHARACTER",
      );
    });
  });

  it("answers with a code and never the note", () => {
    const secret = "secret-note\t";
    const judgement = judgeNoteText(secret);

    expect(JSON.stringify(judgement)).not.toContain("secret");
    expect(Object.keys(judgement).sort()).toEqual(["code", "ok"]);
  });

  describe("properties over arbitrary text", () => {
    const anyText = fc.string({ unit: "binary", maxLength: 300 });

    it("reads a stored note back as itself", () => {
      fc.assert(
        fc.property(anyText, (raw) => {
          const judgement = judgeNoteText(raw);
          fc.pre(judgement.ok);

          expect(judgeNoteText(judgement.text)).toEqual(judgement);
        }),
        { numRuns: 2000 },
      );
    });

    it("accepts only a note of 1 to 2000 characters in NFC, trimmed, with no control, reordering, separator or half-pair character", () => {
      fc.assert(
        fc.property(anyText, (raw) => {
          const judgement = judgeNoteText(raw);
          fc.pre(judgement.ok);

          expect(Array.from(judgement.text).length).toBeGreaterThanOrEqual(1);
          expect(Array.from(judgement.text).length).toBeLessThanOrEqual(
            NOTE_TEXT_MAX_LENGTH,
          );
          expect(judgement.text).toBe(judgement.text.normalize("NFC"));
          expect(judgement.text).toBe(judgement.text.trim());
          expect(judgement.text).not.toMatch(CONTROL_OTHER_THAN_LINE_FEED);
        }),
        { numRuns: 2000 },
      );
    });

    it("refuses with exactly one of the four codes", () => {
      const codes = new Set([
        "REQUIRED",
        "NOT_TEXT",
        "TOO_LONG",
        "FORBIDDEN_CHARACTER",
      ]);

      fc.assert(
        fc.property(fc.anything(), (raw) => {
          const judgement = judgeNoteText(raw);

          expect(judgement.ok || codes.has(judgement.code)).toBe(true);
        }),
      );
    });
  });
});
