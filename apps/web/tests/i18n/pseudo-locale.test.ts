// **The length-stress catalogue, and the two things it has to be true of to be worth running.**
//
// It has to *lengthen* — a pseudo-locale that pads by a token amount reports every surface as fine
// and is worse than none, because it is evidence that was never evidence. And it has to leave the
// messages **renderable**: the transform walks ICU syntax, and one padded argument name is a
// catalogue that throws at the first `{widthMm, number, ::group-off}`. Both claims are made over the
// whole shipped tree rather than over an example, because the leaf that breaks is by definition the
// one nobody thought to write an example for.
//
// What consumes it for layout is `price/price-bar-layout.test.ts` and
// `scene/overflow-warning-layout.test.ts` — the two surfaces the plan names.
import { parse } from "@formatjs/icu-messageformat-parser";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import {
  isPseudoLocaleEnabled,
  PSEUDO_LOCALE_EXPANSION,
  PSEUDO_LOCALE_FLAG,
  PSEUDO_LOCALE_FLAG_ENABLED,
  pseudoLocalizeCatalogue,
  pseudoLocalizeMessage,
  stressableLetterCountOf,
} from "@/i18n/pseudo-locale";

import {
  catalogueLeaves,
  CATALOGUES,
  requireLeafAt,
} from "../support/catalogues";
import { signature } from "../support/icu-signature";

/** The opening and closing marks, which are the transform's own and not part of any sentence. */
const MARK_CHARACTERS = 2;

/** The Romanian catalogue under stress, which is the tree the two layout files render against. */
const [, romanian] = CATALOGUES[0];
const stressed = pseudoLocalizeCatalogue(romanian);

describe("the stressed catalogue is still a catalogue", () => {
  it.each(CATALOGUES)(
    "keeps every ICU argument, format and branch of %s exactly as it was",
    (_locale, messages) => {
      const source = catalogueLeaves(messages);
      const padded = catalogueLeaves(pseudoLocalizeCatalogue(messages));

      expect(padded.map(([key]) => key)).toEqual(source.map(([key]) => key));
      for (let index = 0; index < source.length; index += 1) {
        const sourceEntry = source[index];
        const paddedEntry = padded[index];
        if (sourceEntry === undefined || paddedEntry === undefined)
          throw new Error(`Missing leaf at index ${String(index)}`);
        const [key, sourceMessage] = sourceEntry;
        const [, paddedMessage] = paddedEntry;
        expect(signature(parse(paddedMessage)), key).toEqual(
          signature(parse(sourceMessage)),
        );
      }
    },
  );

  // The claim above is about parsed structure; this one is about the rendered sentence, and it is
  // the half that catches a transform which produced valid ICU saying something else. Every argument
  // handed in comes back out.
  it("renders every interpolated leaf with its arguments intact", () => {
    const translate = createTranslator({
      locale: "ro",
      messages: stressed,
    });
    const rendered = translate("panel.countForBody", {
      count: 5,
      // eslint-disable-next-line no-restricted-syntax -- 6B-j allow-list: an ICU argument handed to the transform, not a rendered sentence.
      bandWord: "bază",
      widthMm: 600,
    });

    expect(rendered).toContain("5");
    expect(rendered).toContain("600");
    // eslint-disable-next-line no-restricted-syntax -- 6B-j allow-list: the same argument, read back: the claim is that the transform returned it, not that any catalogue says it.
    expect(rendered).toContain("bază");
    expect(rendered).not.toContain("{");
  });
});

describe("the stressed catalogue actually stresses", () => {
  it.each(CATALOGUES)(
    "lengthens every sentence of %s by at least the declared proportion",
    (_locale, messages) => {
      let sentencesSeen = 0;
      for (const [key, message] of catalogueLeaves(messages)) {
        const letters = stressableLetterCountOf(message);
        if (letters === 0) continue;
        sentencesSeen += 1;
        // Measured in characters rather than in words: the padding is what a surface has to make
        // room for, and a word count would let a transform pass by adding one long word. The two
        // marks are excluded, so the growth claimed is the growth of the sentence itself.
        expect(
          pseudoLocalizeMessage(message).length - MARK_CHARACTERS,
          key,
        ).toBeGreaterThanOrEqual(
          message.length + Math.ceil(letters * PSEUDO_LOCALE_EXPANSION),
        );
      }
      // Non-vacuity: a walk that found no sentences would have passed every assertion above.
      expect(sentencesSeen).toBeGreaterThan(200);
    },
  );

  it("marks both ends, so a cut sentence is distinguishable from a short one", () => {
    const stressedWarning = requireLeafAt(
      stressed,
      "configure.overflowWarning",
    );

    expect(stressedWarning.startsWith("⟦")).toBe(true);
    expect(stressedWarning.endsWith("⟧")).toBe(true);
  });

  it("leaves an argument specification alone, and pads the branch body around it", () => {
    // The one worked example, spelled out because brace-depth parity is the transform's whole
    // correctness argument and a reader deserves to see it hold.
    /* eslint-disable no-restricted-syntax -- 6B-j allow-list: the worked example of brace-depth parity — the transform's input and its exact output, which a catalogue read cannot supply. */
    expect(
      pseudoLocalizeMessage("{count, plural, one {# dulap} other {# uși}}"),
    ).toBe("⟦{count, plural, one {# düläp··} other {# üșï··}}⟧");
    /* eslint-enable no-restricted-syntax */
  });
});

/** Every rich-text tag a message holds, in order: the part of it a formatter's tag handlers are keyed on. */
const RICH_TEXT_TAG = /<\/?[A-Za-z][\w-]*\/?>/g;

function tagsOf(message: string): readonly string[] {
  return message.match(RICH_TEXT_TAG) ?? [];
}

describe("the stressed catalogue keeps its rich-text tags", () => {
  it.each(CATALOGUES)(
    "carries every tag of every leaf of %s through unchanged and in order",
    (_locale, messages) => {
      let leavesWithTags = 0;
      for (const [key, message] of catalogueLeaves(messages)) {
        const expectedTags = tagsOf(message);
        if (expectedTags.length === 0) continue;
        leavesWithTags += 1;
        expect(tagsOf(pseudoLocalizeMessage(message)), key).toEqual(
          expectedTags,
        );
      }
      // Non-vacuity: the catalogue must hold markup for this to prove anything.
      expect(leavesWithTags).toBeGreaterThan(10);
    },
  );

  it("stresses the text around a tag and the text inside it, and nothing of the tag itself", () => {
    expect(pseudoLocalizeMessage("<strong>dulap</strong> nou<br/>")).toBe(
      "⟦<strong>düläp</strong> ñöü<br/>····⟧",
    );
    expect(
      pseudoLocalizeMessage("{count, plural, one {<b>#</b> dulap} other {#}}"),
    ).toBe("⟦{count, plural, one {<b>#</b> düläp··} other {#}}⟧");
  });

  it("does not count a tag's name as a word to lengthen", () => {
    expect(stressableLetterCountOf("<strong>dulap</strong>")).toBe(
      stressableLetterCountOf("dulap"),
    );
  });

  it("still lets a tag handler find the tag in the stressed sentence", () => {
    const stressedTranslate = createTranslator({
      locale: "ro",
      messages: {
        sentence: pseudoLocalizeMessage("Salut <strong>{name}</strong>!"),
      },
    });
    const handled: unknown[] = [];

    void stressedTranslate.rich("sentence", {
      name: "Ana",
      strong: (chunks) => {
        handled.push(chunks);
        return "";
      },
    });

    expect(handled).toHaveLength(1);
    expect(handled[0]).toEqual([expect.stringContaining("Ana")]);
  });

  it("leaves a lone angle bracket that is no tag as text", () => {
    expect(pseudoLocalizeMessage("a<b")).toBe("⟦ä<b·⟧");
  });
});

describe("the stressed catalogue is not a locale a customer can reach", () => {
  it("is refused in production whatever the flag says", () => {
    expect(
      isPseudoLocaleEnabled({
        NODE_ENV: "production",
        [PSEUDO_LOCALE_FLAG]: PSEUDO_LOCALE_FLAG_ENABLED,
      }),
    ).toBe(false);
  });

  it("is off by default in development, and on only for the exact opt-in value", () => {
    expect(isPseudoLocaleEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(
      isPseudoLocaleEnabled({
        NODE_ENV: "development",
        [PSEUDO_LOCALE_FLAG]: "false",
      }),
    ).toBe(false);
    expect(
      isPseudoLocaleEnabled({
        NODE_ENV: "development",
        [PSEUDO_LOCALE_FLAG]: PSEUDO_LOCALE_FLAG_ENABLED,
      }),
    ).toBe(true);
  });
});
