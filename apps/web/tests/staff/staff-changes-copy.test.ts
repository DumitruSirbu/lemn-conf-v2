import { describe, expect, it } from "vitest";

import { resolveStaffChangesCopy } from "@/i18n/content";

import { CATALOGUES, translatorFor } from "../support/catalogues";

// What staff are told when the kitchen as it stands cannot be priced: every pricing code has a sentence in each language,
// none of them is a figure, and a price-store outage (which reaches the page as INVALID_PRICE_BOOK) is not blamed on the
// price book.

describe.each(CATALOGUES)("the estimate refusals in %s", (locale, messages) => {
  const { refusals } = resolveStaffChangesCopy(
    translatorFor(locale, messages),
  ).estimate;
  const codes = Object.keys(refusals);

  it("words all twelve pricing codes", () => {
    expect(codes.sort()).toEqual(
      [
        "INVALID_AMOUNT",
        "INVALID_PRICE_BOOK",
        "NO_PRICE_FOR_SIZE",
        "NO_RULE_FOR_BODY",
        "PRICING_VERSION_MISMATCH",
        "REPLACEMENT_REQUIRED",
        "UNBUILDABLE_DOOR_BAND",
        "UNDECLARED_FRONT_POPULATION",
        "UNDECLARED_HANDLE_COUNT",
        "UNKNOWN_BODY",
        "UNKNOWN_FORMULA_SHAPE",
        "UNKNOWN_TIER",
      ].sort(),
    );
  });

  it.each(codes)("%s is a sentence with no digit and no currency", (code) => {
    const sentence = refusals[code as keyof typeof refusals];

    expect(sentence.trim()).not.toBe("");
    expect(sentence).not.toMatch(/\d/u);
    expect(sentence).not.toMatch(/MDL/u);
  });

  it("tells an outage, a kitchen that cannot be read, a part with no price and an option taken away apart", () => {
    expect(
      new Set([
        refusals.INVALID_PRICE_BOOK,
        refusals.UNKNOWN_BODY,
        refusals.NO_RULE_FOR_BODY,
        refusals.REPLACEMENT_REQUIRED,
      ]).size,
    ).toBe(4);
  });
});
