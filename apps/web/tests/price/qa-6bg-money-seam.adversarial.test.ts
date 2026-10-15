// Adversarial QA for wave 6B-g. The wave moved a **join** into the catalogue and swore the
// arithmetic beside it did not move. Three claims are re-asked here in a form the wave's own tests
// do not take:
//
//   1. **The figure is differential, not self-consistent.** `starting-price.adversarial.test.ts`
//      asserts the rounding rule's *properties* — on the step, at or above the exact price. A
//      mutant that rounded to the next thousand *below* satisfies "on the step" and fails only the
//      inequality; one that changed `DIGITS_PER_GROUP` satisfies every one of them. The sweep below
//      compares against an independently spelled reference (integer ceiling by addition rather than
//      `Math.ceil` on a quotient, grouping by string surgery rather than by loop), over the whole
//      range the plan names.
//   2. **The wave's one non-vacuity arm varied the currency's *position* only.** A formatter that
//      read the leaf, parsed out where `{amount}` sits and then appended a hard-coded `MDL` would
//      pass it. What is asserted here varies the currency's *word*, its *count*, and its *absence*,
//      so it subsumes that arm — which `amount-with-currency-seam.test.ts` therefore no longer
//      carries. This file is now the only place the leaf is proved to be *consulted*.
//   3. **Locale-independence is asserted on the bar's figure alone.** The breakdown sheet renders a
//      figure and a rounded amount per row from the same module; those are re-asked across locales
//      too, because "no figure a customer sees changed" is a claim about every surface.
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type PricingResult,
} from "@lemnaria/configurator-domain";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import { resolveContent } from "@/i18n/content";
import { describePriceBar } from "@/price/price-bar-model";
import { describePriceBreakdown } from "@/price/price-breakdown-model";
import {
  describeAddedAmount,
  describeRoundedAmount,
  describeStartingPrice,
} from "@/price/starting-price";

import {
  CATALOGUES,
  catalogueJoining,
  contentFor,
  type Catalogue,
} from "../support/catalogues";

/** The plan's own reachable ceiling: ten billion bani, a hundred million MDL. Swept rather than
 *  sampled, because the transitions that matter are the multiples of the step and a fixed table is
 *  what the plan names as having let two earlier defects through. */
const REACHABLE_CEILING_MINOR = 10_000_000_000;

const BANI_PER_MDL = 100;
const ROUNDING_STEP_MDL = 1_000;
const MINOR_UNITS_PER_STEP = BANI_PER_MDL * ROUNDING_STEP_MDL;

/**
 * The rounding rule spelled a second, different way: an integer ceiling by addition, so it shares no
 * expression with `Math.ceil(totalMinor / MINOR_UNITS_PER_ROUNDING_STEP)`. A reference that read the
 * same way would agree with production by construction.
 */
function referenceRoundedMdl(totalMinor: number): number {
  return (
    Math.floor((totalMinor + MINOR_UNITS_PER_STEP - 1) / MINOR_UNITS_PER_STEP) *
    ROUNDING_STEP_MDL
  );
}

/** Grouping spelled a second way too — a right-anchored regular expression rather than a slicing
 *  loop — so a changed `DIGITS_PER_GROUP` is a disagreement rather than a shared assumption. */
function referenceGrouped(amountMdl: number): string {
  return String(amountMdl).replace(/\B(?=(\d{3})+$)/g, " ");
}

const SEEDED = (() => {
  const result = priceDesign({
    design: KITCHEN_L_DESIGN,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
  });
  if (!result.ok) throw new Error("the seeded kitchen did not price");
  return result.priced;
})();

const SEEDED_GROUPS = projectDesignForDisplay(
  KITCHEN_L_DESIGN,
  KITCHEN_L_BODY_CATALOG,
);

function pricingAt(totalMinor: number): PricingResult {
  return { ok: true, priced: { ...SEEDED, totalMinor } };
}

/** The digits and the ASCII spaces between them, with every translated word set aside — what a
 *  price is once the copy around it is taken away. */
function digitsOnly(amountText: string): string {
  return amountText.replace(/[^\d ]/gu, "").trim();
}

function amountTextUnder(messages: Catalogue, pricing: PricingResult): string {
  const content = resolveContent(createTranslator({ locale: "ro", messages }));
  const bar = describePriceBar({ content, pricing });
  if (bar.kind !== "priced") throw new Error(`the bar rendered ${bar.kind}`);
  return bar.figure.amountText;
}

describe("the arithmetic beside the moved join, checked against a second spelling of it", () => {
  propertyTest.prop([fc.integer({ min: 0, max: REACHABLE_CEILING_MINOR })])(
    "rounds every amount in the reachable range to the same thousand an independent rule does",
    (totalMinor) => {
      expect(describeRoundedAmount(totalMinor)).toBe(
        referenceGrouped(referenceRoundedMdl(totalMinor)),
      );
    },
  );

  propertyTest.prop([fc.integer({ min: 0, max: REACHABLE_CEILING_MINOR })])(
    "writes a rounded amount out of digits and the ASCII space alone",
    (totalMinor) => {
      // By code point, and over the whole alphabet rather than by matching a shape: a period, a
      // comma, a U+00A0 or a U+202F — every separator CLDR would reach for — is refused by name.
      for (const character of describeRoundedAmount(totalMinor)) {
        const codePoint = character.codePointAt(0) ?? -1;
        const isDigit = codePoint >= 0x30 && codePoint <= 0x39;
        expect(
          isDigit || codePoint === 0x20,
          `U+${codePoint.toString(16)}`,
        ).toBe(true);
      }
    },
  );

  it("moves the thousand exactly at the step, on both sides and on the step itself", () => {
    // The transitions a swept integer arbitrary reaches only by luck, stated so the failure names
    // the boundary rather than a seed.
    const boundaries = [
      [0, "0"],
      [1, "1 000"],
      [MINOR_UNITS_PER_STEP - 1, "1 000"],
      [MINOR_UNITS_PER_STEP, "1 000"],
      [MINOR_UNITS_PER_STEP + 1, "2 000"],
      [4_299_999, "43 000"],
      [4_300_000, "43 000"],
      [4_300_001, "44 000"],
      [REACHABLE_CEILING_MINOR, "100 000 000"],
    ] as const;

    for (const [totalMinor, expected] of boundaries) {
      expect(describeRoundedAmount(totalMinor), String(totalMinor)).toBe(
        expected,
      );
    }
  });

  propertyTest.prop([fc.integer({ min: 0, max: REACHABLE_CEILING_MINOR })])(
    "keeps the added-amount sign in the module and off the catalogue",
    (amountMinor) => {
      const added = describeAddedAmount(amountMinor);

      expect(added).toBe(`+${describeRoundedAmount(amountMinor)}`);
      expect(added).not.toContain("MDL");
    },
  );

  it("refuses a price that is not a whole non-negative count of minor units, on every entry point", () => {
    const [, romanian] = CATALOGUES[0];
    const copy = contentFor("ro", romanian).price;

    for (const refused of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const label = String(refused);
      expect(() => describeRoundedAmount(refused), label).toThrow(RangeError);
      expect(() => describeAddedAmount(refused), label).toThrow(RangeError);
      expect(
        () => describeStartingPrice({ totalMinor: refused, copy }),
        label,
      ).toThrow(RangeError);
    }
  });
});

describe("the leaf is substituted into, not appended after", () => {
  // **The seam's whole non-vacuity claim, in its strongest form.** The wave's own arm moved the
  // currency's position only, and a formatter that read the leaf, found where `{amount}` sits and
  // then wrote its own `MDL` beside the digits would have satisfied it. It fails every row here,
  // which is why that arm was deleted rather than kept beside this one.
  const JOINS = [
    ["a different currency word", "{amount} лей", "43 000 лей"],
    ["the currency in front", "MDL {amount}", "MDL 43 000"],
    ["no currency at all", "{amount}", "43 000"],
    ["the amount twice", "{amount} MDL ({amount})", "43 000 MDL (43 000)"],
    ["punctuation around the amount", "«{amount}» MDL", "«43 000» MDL"],
  ] as const;

  it.each(JOINS)(
    "renders %s exactly as the catalogue authors it",
    (description, template, expected) => {
      expect(
        amountTextUnder(catalogueJoining(template), pricingAt(4_300_000)),
        description,
      ).toBe(expected);
    },
  );

  it("leaves the digits alone whatever the join does with them", () => {
    // The half the ruling protects: the leaf owns the word order and the currency's name, and can
    // reach nothing inside `{amount}`. Whatever a translator writes, the digits are the formatter's.
    for (const [, template] of JOINS) {
      const rendered = amountTextUnder(
        catalogueJoining(template),
        pricingAt(4_300_000),
      );
      expect(digitsOnly(rendered), template).toContain("43 000");
      // The separator inside `{amount}` stays U+0020 whatever the leaf is: the catalogue cannot
      // reach inside the argument, so no join can substitute a non-breaking space into a figure.
      expect(rendered, template).not.toContain("\u00a0");
    }
  });
});

describe("every price surface, not only the bar, reads the same digits in both locales", () => {
  const TOTALS = [0, 1, 4_300_000, 999_999_999, REACHABLE_CEILING_MINOR];

  it("renders the same digits on the bar's figure under ro and ru, at every magnitude", () => {
    const [romanian, russian] = CATALOGUES;

    for (const totalMinor of TOTALS) {
      const expected = describeRoundedAmount(totalMinor);
      for (const [, messages] of [romanian, russian]) {
        const rendered = amountTextUnder(messages, pricingAt(totalMinor));
        expect(digitsOnly(rendered), String(totalMinor)).toBe(expected);
      }
    }
  });

  it("renders the breakdown sheet's amounts with the same digits in both locales", () => {
    // The sheet is the other surface `starting-price.ts` formats for, and the wave asserted nothing
    // about it. Compared by digits rather than byte for byte on purpose: a zero-amount row reads
    // *inclus*, which is a translated word and **should** differ — the figures beside it must not.
    const amountsPerLocale = CATALOGUES.map(([locale, messages]) => {
      const view = describePriceBreakdown({
        content: contentFor(locale, messages),
        pricing: { ok: true, priced: SEEDED },
        groups: SEEDED_GROUPS,
      });
      if (view.kind !== "available")
        throw new Error(`the ${locale} sheet rendered ${view.kind}`);
      const rows = [
        ...view.groups.flatMap((group) => group.rows),
        ...view.wholeKitchenRows,
      ];
      return {
        rowDigits: rows.map((row) => digitsOnly(row.amountText)),
        figureDigits: digitsOnly(view.figure.amountText),
      };
    });

    const [romanian, russian] = amountsPerLocale;
    expect(romanian?.rowDigits.length).toBeGreaterThan(0);
    expect(russian).toEqual(romanian);
    expect(romanian?.figureDigits).toBe(
      describeRoundedAmount(SEEDED.totalMinor),
    );
  });
});
