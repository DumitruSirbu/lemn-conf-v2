// Lot 2 criterion 7 (duplicate) and the plan's S6b note: "the client composes the full '{name} (copie)' and truncates by
// code points, the server never truncates". The server refuses a name past KITCHEN_NAME_MAX_LENGTH code points of the NFC
// form, so a copy name this module returns must never be refused for length, whatever the source's name holds.
import { fc } from "@fast-check/vitest";
import {
  judgeKitchenName,
  KITCHEN_NAME_MAX_LENGTH,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { copyNameOf } from "@/account/kitchens/kitchen-copy-name";
import { resolveAccountKitchensCopy } from "@/i18n/content";

import { CATALOGUES, translatorFor } from "../support/catalogues";

const codePointCount = (text: string): number => Array.from(text).length;

/** The catalogue's own pattern in each locale: where the name stands in the sentence is the language's to say. */
const PATTERNS = CATALOGUES.map(([locale, messages]) => ({
  locale,
  composeCopyName: resolveAccountKitchensCopy(translatorFor(locale, messages))
    .duplicate.nameOf,
}));

const FAMILY_EMOJI = "\u{1F469}\u200d\u{1F469}\u200d\u{1F467}\u200d\u{1F466}";
const COMBINING_ACUTE = "́";
const LATIN_E_WITH_COMBINING_ACUTE = `e${COMBINING_ACUTE}`;
const COMPOSED_E_ACUTE = "é";

const unrestrictedText = fc.oneof(
  fc.string({ unit: "binary", maxLength: 400 }),
  fc.string({ unit: "grapheme", maxLength: 200 }),
  fc
    .array(
      fc.constantFrom(
        FAMILY_EMOJI,
        LATIN_E_WITH_COMBINING_ACUTE,
        "\u{1F600}",
        "\u{20BB7}",
        "a",
        " ",
      ),
      { maxLength: 150 },
    )
    .map((pieces) => pieces.join("")),
);

describe.each(PATTERNS)(
  "the name of a copy, in $locale",
  ({ composeCopyName }) => {
    const patternLength = codePointCount(composeCopyName("").normalize("NFC"));

    it("gives the pattern around the whole name when it fits", () => {
      expect(copyNameOf({ sourceName: "Bucatarie", composeCopyName })).toBe(
        composeCopyName("Bucatarie"),
      );
    });

    it("never exceeds the server's bound, for any text at all", () => {
      fc.assert(
        fc.property(unrestrictedText, (sourceName) => {
          const copyName = copyNameOf({ sourceName, composeCopyName });
          expect(codePointCount(copyName)).toBeLessThanOrEqual(
            KITCHEN_NAME_MAX_LENGTH,
          );
        }),
        { numRuns: 400 },
      );
    });

    it("is never refused for its length by the server's own judge", () => {
      fc.assert(
        fc.property(unrestrictedText, (sourceName) => {
          const judgement = judgeKitchenName(
            copyNameOf({ sourceName, composeCopyName }),
          );
          expect(judgement.ok || judgement.code !== "TOO_LONG").toBe(true);
          if (judgement.ok) {
            expect(codePointCount(judgement.name)).toBeLessThanOrEqual(
              KITCHEN_NAME_MAX_LENGTH,
            );
          }
        }),
        { numRuns: 400 },
      );
    });

    it("is accepted by the judge for every name the judge itself accepts", () => {
      fc.assert(
        fc.property(unrestrictedText, (typed) => {
          const stored = judgeKitchenName(typed);
          if (!stored.ok) return;
          const copy = judgeKitchenName(
            copyNameOf({ sourceName: stored.name, composeCopyName }),
          );
          expect(copy.ok).toBe(true);
        }),
        { numRuns: 400 },
      );
    });

    it("returns the NFC form", () => {
      const decomposed = `${LATIN_E_WITH_COMBINING_ACUTE}${LATIN_E_WITH_COMBINING_ACUTE}`;
      const copyName = copyNameOf({ sourceName: decomposed, composeCopyName });
      expect(copyName).toBe(copyName.normalize("NFC"));
      expect(copyName).toBe(
        composeCopyName(`${COMPOSED_E_ACUTE}${COMPOSED_E_ACUTE}`),
      );
    });

    it("counts the bound in code points, not UTF-16 units: an astral name of 112 letters fits whole", () => {
      const astral = "\u{1F600}".repeat(
        KITCHEN_NAME_MAX_LENGTH - patternLength,
      );
      const copyName = copyNameOf({ sourceName: astral, composeCopyName });
      expect(copyName).toBe(composeCopyName(astral));
      expect(codePointCount(copyName)).toBe(KITCHEN_NAME_MAX_LENGTH);
      expect(copyName.length).toBeGreaterThan(KITCHEN_NAME_MAX_LENGTH);
    });

    it("cuts an over-long astral name at a code point and never leaves half of a surrogate pair", () => {
      const astral = "\u{1F600}".repeat(KITCHEN_NAME_MAX_LENGTH + 30);
      const copyName = copyNameOf({ sourceName: astral, composeCopyName });
      expect(codePointCount(copyName)).toBe(KITCHEN_NAME_MAX_LENGTH);
      expect(/\p{Cs}/u.test(copyName)).toBe(false);
      expect(copyName).toBe(
        composeCopyName(
          "\u{1F600}".repeat(KITCHEN_NAME_MAX_LENGTH - patternLength),
        ),
      );
    });

    it("gives way to the pattern, not the other way round: the pattern's words always survive a long name", () => {
      const longName = "x".repeat(500);
      const copyName = copyNameOf({ sourceName: longName, composeCopyName });
      const wordsAroundTheName = composeCopyName("");
      expect(copyName.endsWith(wordsAroundTheName.trimStart())).toBe(true);
      expect(codePointCount(copyName)).toBe(KITCHEN_NAME_MAX_LENGTH);
    });

    it("drops the trailing space a cut leaves before the pattern", () => {
      const cutAfterASpace = `${"y".repeat(KITCHEN_NAME_MAX_LENGTH - patternLength - 1)} z${"z".repeat(50)}`;
      const copyName = copyNameOf({
        sourceName: cutAfterASpace,
        composeCopyName,
      });
      expect(copyName).toBe(
        composeCopyName(
          "y".repeat(KITCHEN_NAME_MAX_LENGTH - patternLength - 1),
        ),
      );
    });

    it("keeps a ZWJ emoji sequence whole when it fits and counts each of its code points", () => {
      const family = FAMILY_EMOJI;
      expect(codePointCount(family)).toBe(7);
      const copyName = copyNameOf({ sourceName: family, composeCopyName });
      expect(copyName).toBe(composeCopyName(family));
    });

    it("cuts a ZWJ sequence only at a code point and stays inside the bound", () => {
      const families = FAMILY_EMOJI.repeat(30);
      const copyName = copyNameOf({ sourceName: families, composeCopyName });
      expect(codePointCount(copyName)).toBeLessThanOrEqual(
        KITCHEN_NAME_MAX_LENGTH,
      );
      expect(/\p{Cs}/u.test(copyName)).toBe(false);
    });

    it("answers the pattern alone for an empty name, which the judge then trims and keeps", () => {
      const copyName = copyNameOf({ sourceName: "", composeCopyName });
      expect(copyName).toBe(composeCopyName(""));
      expect(judgeKitchenName(copyName).ok).toBe(true);
    });
  },
);

describe("a pattern that leaves no room for the name", () => {
  const wideWords = "w".repeat(KITCHEN_NAME_MAX_LENGTH);
  const compose = (name: string): string => `${name}${wideWords}`;

  it("answers the pattern alone and drops the name, never a negative cut", () => {
    expect(copyNameOf({ sourceName: "kept?", composeCopyName: compose })).toBe(
      wideWords,
    );
  });

  it("is then at the bound exactly, which the judge accepts", () => {
    const copyName = copyNameOf({
      sourceName: "kept?",
      composeCopyName: compose,
    });
    expect(codePointCount(copyName)).toBe(KITCHEN_NAME_MAX_LENGTH);
    expect(judgeKitchenName(copyName).ok).toBe(true);
  });

  it("is one past the bound for a pattern one code point too wide, which the judge refuses: the caller tells it as a failed copy", () => {
    const tooWide = (name: string): string => `${name}${wideWords}!`;
    const copyName = copyNameOf({
      sourceName: "kept?",
      composeCopyName: tooWide,
    });
    expect(copyName).toBe(tooWide(""));
    const judgement = judgeKitchenName(copyName);
    expect(judgement.ok).toBe(false);
  });
});

describe("the room the pattern leaves is measured on the pattern's NFC form", () => {
  it("counts a pattern whose decomposed spelling is longer as its composed length", () => {
    const decomposedPattern = (name: string): string =>
      `${name} (cop${LATIN_E_WITH_COMBINING_ACUTE})`;
    const composedLength = codePointCount(
      decomposedPattern("").normalize("NFC"),
    );
    const sourceName = "n".repeat(KITCHEN_NAME_MAX_LENGTH);
    const copyName = copyNameOf({
      sourceName,
      composeCopyName: decomposedPattern,
    });
    expect(codePointCount(copyName)).toBe(KITCHEN_NAME_MAX_LENGTH);
    expect(codePointCount(copyName) - composedLength).toBe(
      KITCHEN_NAME_MAX_LENGTH - composedLength,
    );
  });
});
