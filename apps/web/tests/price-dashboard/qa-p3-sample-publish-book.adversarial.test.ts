// Adversarial QA for P3 on the sample dashboard: the book a build that shows samples presents as the active version.
//
// `publish-sample.ts` restates the application's own root book (the cut-over sample) and, in doing so, rewrites every
// manufacturer cabinet to an anchored formula. A-7 (amended by P3-Q4) keeps the six structural corner rules
// `price-per-size`, "not anchored. An anchored formula on a non-insertable row is refused by M2". A sample dashboard
// whose active version anchors them shows a book the publish judgement would refuse. This test is red while it does.
import {
  SAMPLE_PRICE_BOOK,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { SAMPLE_PUBLISH_PAGE } from "@/price-dashboard/publish-sample";

const STRUCTURAL_CORNER_RULES = [
  "cabinet.base-corner-x-900",
  "cabinet.base-corner-return-320",
  "cabinet.wall-corner-return-570",
  "cabinet.wall-corner-return-570-top",
  "cabinet.wall-corner-x-900",
  "cabinet.wall-corner-x-900-top",
] as const;

const SAMPLE_ACTIVE = SAMPLE_PUBLISH_PAGE.state.active.book;

interface FixedSizeReading {
  readonly shape: string;
  readonly widthsMm: readonly number[];
}

function fixedSizeReadingOf(
  book: PriceBook,
  ruleId: string,
): FixedSizeReading | undefined {
  const formula = book.cabinetRules.find(
    (rule) => rule.ruleId === ruleId,
  )?.formula;
  if (formula === undefined) return undefined;
  const sizes = "sizes" in formula ? formula.sizes : [];
  return { shape: formula.shape, widthsMm: sizes.map((size) => size.widthMm) };
}

describe("the sample dashboard's active version keeps the structural corner rules fixed-size (A-7, P3-Q4)", () => {
  it("names corner rules the shipped sample really prices per size, so the list below is the right one", () => {
    for (const ruleId of STRUCTURAL_CORNER_RULES) {
      expect(fixedSizeReadingOf(SAMPLE_PRICE_BOOK, ruleId)?.shape, ruleId).toBe(
        "price-per-size",
      );
    }
  });

  it.each(STRUCTURAL_CORNER_RULES)(
    "does not anchor %s, and lists the sizes the shipped sample lists",
    (ruleId) => {
      expect(fixedSizeReadingOf(SAMPLE_ACTIVE, ruleId)).toEqual(
        fixedSizeReadingOf(SAMPLE_PRICE_BOOK, ruleId),
      );
    },
  );
});
