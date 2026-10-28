// Adversarial QA for P3 on the sample dashboard: the book a build that shows samples presents as the active version.
//
// The active version is the root sample as it stands. A-7 (amended by P3-Q4) keeps the six structural corner rules
// `price-per-size`, "not anchored. An anchored formula on a non-insertable row is refused by M2", so a sample dashboard
// that anchored any of them would show a book the publish judgement refuses. Sabotage check: rewriting one corner rule to
// an anchored formula in `publish-sample.ts` turns exactly that rule's test red.
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

describe("the sample dashboard's active version is the root sample's fixed-size rows, all of them", () => {
  const ROOT_FIXED_SIZE_RULES = SAMPLE_PRICE_BOOK.cabinetRules
    .filter((rule) => rule.formula.shape === "price-per-size")
    .map((rule) => rule.ruleId);

  it("has at least the six structural corners among the rules it sweeps", () => {
    expect(ROOT_FIXED_SIZE_RULES.length).toBeGreaterThanOrEqual(
      STRUCTURAL_CORNER_RULES.length,
    );
    for (const ruleId of STRUCTURAL_CORNER_RULES)
      expect(ROOT_FIXED_SIZE_RULES).toContain(ruleId);
  });

  it("keeps every one of them price-per-size with the listed widths", () => {
    for (const ruleId of ROOT_FIXED_SIZE_RULES) {
      expect(fixedSizeReadingOf(SAMPLE_ACTIVE, ruleId), ruleId).toEqual(
        fixedSizeReadingOf(SAMPLE_PRICE_BOOK, ruleId),
      );
    }
  });
});
