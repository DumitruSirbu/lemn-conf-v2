import { fc } from "@fast-check/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  KITCHEN_NAME_MAX_LENGTH,
  judgeKitchenName,
} from "../../src/account/index.js";

const ASTRAL_CHARACTER = "\u{1F373}";
const LONE_HIGH_SURROGATE = "\uD800";
const LONE_LOW_SURROGATE = "\uDC00";
const COMBINING_ACUTE = "\u0301";
const PRECOMPOSED_E_ACUTE = "é";

function acceptedNameOf(raw: unknown): string {
  const judgement = judgeKitchenName(raw);
  if (!judgement.ok) {
    throw new Error(`expected an accepted name, refused as ${judgement.code}`);
  }
  return judgement.name;
}

function refusalCodeOf(raw: unknown): string | undefined {
  const judgement = judgeKitchenName(raw);
  return judgement.ok ? undefined : judgement.code;
}

describe("judgeKitchenName: what a kitchen needs to be named", () => {
  it("allows 120 characters, as the database's `designs_name_length` does", () => {
    expect(KITCHEN_NAME_MAX_LENGTH).toBe(120);
  });

  it("accepts an ordinary name unchanged", () => {
    expect(acceptedNameOf("Küche für Müller")).toBe("Küche für Müller");
  });

  it("keeps interior spaces and trims the ends", () => {
    expect(acceptedNameOf("  Casa   mare  ")).toBe("Casa   mare");
  });

  describe("an empty name is REQUIRED, never accepted as an empty string", () => {
    it.each([
      ["undefined", undefined],
      ["the empty string", ""],
      ["spaces", "   "],
      ["a no-break space", "\u00A0"],
      ["a zero-width space alone", "\u200B"],
      ["format characters and spaces only", " \u200B\u202E\uFEFF \u00AD"],
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
      ["an array of one string", ["Casa"]],
      ["an object", { name: "Casa" }],
      ["a String object", new String("Casa")],
      ["a symbol-keyed object", { [Symbol("name")]: "Casa" }],
    ])("%s", (_label, raw) => {
      expect(refusalCodeOf(raw)).toBe("NOT_TEXT");
    });
  });

  describe("the length bound counts code points of the NFC form", () => {
    it("accepts exactly 120 characters and refuses 121", () => {
      expect(acceptedNameOf("a".repeat(120))).toBe("a".repeat(120));
      expect(refusalCodeOf("a".repeat(121))).toBe("TOO_LONG");
    });

    it("counts an astral character once, so 120 of them (240 UTF-16 units) fit and 121 do not", () => {
      const fits = ASTRAL_CHARACTER.repeat(120);

      expect(fits.length).toBe(240);
      expect(acceptedNameOf(fits)).toBe(fits);
      expect(refusalCodeOf(ASTRAL_CHARACTER.repeat(121))).toBe("TOO_LONG");
    });

    it("counts the composed form: 120 decomposed letters are 120 characters, 121 are not", () => {
      const decomposed = (count: number) => `e${COMBINING_ACUTE}`.repeat(count);

      expect(acceptedNameOf(decomposed(120))).toBe(
        PRECOMPOSED_E_ACUTE.repeat(120),
      );
      expect(refusalCodeOf(decomposed(121))).toBe("TOO_LONG");
    });

    it("measures after trimming, so 120 characters with spaces around them fit", () => {
      expect(acceptedNameOf(` ${"a".repeat(120)} `)).toBe("a".repeat(120));
    });

    it("measures after the format characters go, so they do not spend the bound", () => {
      const padded = `${"a".repeat(120)}${"\u200B".repeat(50)}`;

      expect(acceptedNameOf(padded)).toBe("a".repeat(120));
    });

    it("refuses a value far past the bound without composing it", () => {
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

      judgeKitchenName(`e${COMBINING_ACUTE.repeat(100_000)}`);

      expect(Math.max(0, ...normalisedLengths)).toBeLessThanOrEqual(
        KITCHEN_NAME_MAX_LENGTH * 8,
      );
    });
  });

  describe("the stored form is NFC, and not the compatibility form", () => {
    it("composes a decomposed letter", () => {
      expect(acceptedNameOf(`e${COMBINING_ACUTE}`)).toBe(PRECOMPOSED_E_ACUTE);
    });

    it("leaves a compatibility character alone (NFKC would turn the ligature into two letters)", () => {
      expect(acceptedNameOf("ﬁrst")).toBe("ﬁrst");
      expect(acceptedNameOf("ＡBC")).toBe("ＡBC");
    });
  });

  describe("format characters are removed, not refused", () => {
    it.each([
      ["a zero-width space", "Ca\u200Bsa", "Casa"],
      ["a zero-width joiner", "Ca\u200Dsa", "Casa"],
      ["a soft hyphen", "Ca\u00ADsa", "Casa"],
      ["a byte order mark", "\uFEFFCasa", "Casa"],
      ["a right-to-left override", "Ca\u202Esa", "Casa"],
      ["a left-to-right isolate", "\u2066Casa\u2069", "Casa"],
      ["a word joiner", "Ca\u2060sa", "Casa"],
      ["a tag character", "Ca\u{E0041}sa", "Casa"],
    ])("%s", (_label, raw, expected) => {
      expect(acceptedNameOf(raw)).toBe(expected);
    });
  });

  describe("a character that cannot be shown on one line is FORBIDDEN_CHARACTER", () => {
    it.each([
      ["a line feed inside", "Ca\nsa"],
      ["a trailing line feed", "Casa\n"],
      ["a carriage return", "Ca\rsa"],
      ["a tab", "Ca\tsa"],
      ["a NUL", "Ca\u0000sa"],
      ["an escape", "Ca\u001Bsa"],
      ["a C1 control (NEL)", "Ca\u0085sa"],
      ["a line separator", "Ca\u2028sa"],
      ["a paragraph separator", "Ca\u2029sa"],
      ["a lone high surrogate", `Ca${LONE_HIGH_SURROGATE}sa`],
      ["a lone low surrogate", `Ca${LONE_LOW_SURROGATE}sa`],
    ])("%s", (_label, raw) => {
      expect(refusalCodeOf(raw)).toBe("FORBIDDEN_CHARACTER");
    });

    it("does not let a format character join two lone halves into a valid-looking pair", () => {
      const halvesApart = `${LONE_HIGH_SURROGATE}\u200B${LONE_LOW_SURROGATE}`;

      expect(refusalCodeOf(`Ca${halvesApart}sa`)).toBe("FORBIDDEN_CHARACTER");
    });

    it("accepts a well-formed surrogate pair", () => {
      expect(acceptedNameOf(`Ca${ASTRAL_CHARACTER}sa`)).toBe(
        `Ca${ASTRAL_CHARACTER}sa`,
      );
    });
  });

  describe("when more than one rule fails, the order is fixed", () => {
    it("reports an ill-formed value as forbidden before it reports the length", () => {
      expect(refusalCodeOf(`${"a".repeat(130)}${LONE_HIGH_SURROGATE}`)).toBe(
        "FORBIDDEN_CHARACTER",
      );
    });

    it("reports a control character before a 121-character length", () => {
      expect(refusalCodeOf(`${"a".repeat(121)}\n`)).toBe("FORBIDDEN_CHARACTER");
    });

    it("reports a value of the wrong type before anything else", () => {
      expect(refusalCodeOf(42)).toBe("NOT_TEXT");
    });
  });

  it("answers with a code and never the value", () => {
    const secret = "secret-kitchen-\nname";
    const judgement = judgeKitchenName(secret);

    expect(JSON.stringify(judgement)).not.toContain("secret");
    expect(Object.keys(judgement).sort()).toEqual(["code", "ok"]);
  });

  describe("properties over arbitrary text", () => {
    const anyText = fc.string({ unit: "binary", maxLength: 300 });

    it("is deterministic", () => {
      fc.assert(
        fc.property(anyText, (raw) => {
          expect(judgeKitchenName(raw)).toEqual(judgeKitchenName(raw));
        }),
      );
    });

    it("reads a stored name back as itself, so a rename of the shown name changes nothing", () => {
      fc.assert(
        fc.property(anyText, (raw) => {
          const judgement = judgeKitchenName(raw);
          fc.pre(judgement.ok);

          expect(judgeKitchenName(judgement.name)).toEqual(judgement);
        }),
        { numRuns: 2000 },
      );
    });

    it("accepts only a name of 1 to 120 characters that holds no control, format, separator or half-pair character", () => {
      fc.assert(
        fc.property(anyText, (raw) => {
          const judgement = judgeKitchenName(raw);
          fc.pre(judgement.ok);

          expect(Array.from(judgement.name).length).toBeGreaterThanOrEqual(1);
          expect(Array.from(judgement.name).length).toBeLessThanOrEqual(
            KITCHEN_NAME_MAX_LENGTH,
          );
          expect(judgement.name).toBe(judgement.name.normalize("NFC"));
          expect(judgement.name).toBe(judgement.name.trim());
          expect(judgement.name).not.toMatch(
            /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u,
          );
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
          const judgement = judgeKitchenName(raw);

          expect(judgement.ok || codes.has(judgement.code)).toBe(true);
        }),
      );
    });
  });
});
