// **One function formats every figure**, which is wave 6C's criterion rather than "the figures are
// formatted correctly". The last block below is the half that makes it falsifiable repository-wide:
// a module that reaches for a priced amount and rounds it itself fails the moment it is written.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ro } from "@/content/ro";
import {
  describeStartingPrice,
  roundUpToThousandMdl,
} from "@/price/starting-price";

/** Derived independently of the production module on purpose: two numbers that agree because one
 *  imported the other agree by construction, not by being right. */
const BANI_PER_MDL = 100;
const ROUNDING_STEP_MDL = 1000;
const BANI_PER_ROUNDING_STEP = BANI_PER_MDL * ROUNDING_STEP_MDL;

function amountTextFor(totalMinor: number): string {
  return describeStartingPrice({ label: ro.price.startingPrefix, totalMinor })
    .amountText;
}

describe("the De la prefix", () => {
  it("is the string the owner ruled, and the figure carries it unchanged", () => {
    // Both halves, per the M6 copy rule: the surface composes from the shared constant, and the
    // literal sits beside it so the coupling is loud. A composed assertion alone would hold for any
    // wording — which is the defect wave 6A4 shipped and this criterion exists to stop.
    expect(ro.price.startingPrefix).toBe("De la");
    expect(
      describeStartingPrice({
        label: ro.price.startingPrefix,
        totalMinor: 4_300_000,
      }),
    ).toEqual({ label: "De la", amountText: "43 000 MDL" });
  });

  it("is passed through rather than reinterpreted, so the ruled label survives verbatim", () => {
    expect(ro.price.startingPrefixUnchanged).toBe("De la neschimbat");
    expect(
      describeStartingPrice({
        label: ro.price.startingPrefixUnchanged,
        totalMinor: 4_300_000,
      }).label,
    ).toBe("De la neschimbat");
  });

  it("is one string for both shells, with neither mockup separator surviving", () => {
    // Owner, 2026-09-03. Frames D2C and 2C spell this two ways — a middle dot and a comma — and the
    // ruling replaced both. A second constant is how the two spellings would come back, so the
    // single one is asserted here rather than left to a reviewer to notice.
    const unchangedLabels = Object.entries(ro.price).filter(([, value]) =>
      value.includes("neschimbat"),
    );
    expect(unchangedLabels).toEqual([
      ["startingPrefixUnchanged", "De la neschimbat"],
    ]);
    // The general form, not an enumeration: adversarial QA slipped an em dash past a version that
    // listed the middle dot and the comma. Three words, single spaces, no punctuation of any kind.
    expect(ro.price.startingPrefixUnchanged).toMatch(/^\p{L}+ \p{L}+ \p{L}+$/u);
  });
});

describe("rounding up to the thousand MDL", () => {
  it("leaves an amount already on the step alone", () => {
    expect(amountTextFor(43 * BANI_PER_ROUNDING_STEP)).toBe("43 000 MDL");
  });

  it("rounds a single ban over the step up to the next thousand", () => {
    expect(amountTextFor(43 * BANI_PER_ROUNDING_STEP + 1)).toBe("44 000 MDL");
  });

  it("rounds any non-zero amount below the step up to one thousand", () => {
    expect(amountTextFor(1)).toBe("1 000 MDL");
    expect(amountTextFor(BANI_PER_ROUNDING_STEP - 1)).toBe("1 000 MDL");
  });

  it("renders an exact zero as zero rather than as the first step", () => {
    expect(amountTextFor(0)).toBe("0 MDL");
  });

  it("groups every third digit with a space, as the mockups do", () => {
    expect(amountTextFor(1_000_000 * BANI_PER_ROUNDING_STEP)).toBe(
      "1 000 000 000 MDL",
    );
  });

  it("refuses an amount that is not a whole non-negative count of minor units", () => {
    expect(() => amountTextFor(-1)).toThrow(RangeError);
    expect(() => amountTextFor(0.5)).toThrow(RangeError);
    expect(() => amountTextFor(Number.NaN)).toThrow(RangeError);
  });
});

describe("the rounding rule, swept", () => {
  const anyExactAmount = fc.integer({ min: 0, max: 9_007_199_254 });

  propertyTest.prop([anyExactAmount])(
    "lands on the step, never below the exact price, and never a step too high",
    (totalMinor) => {
      const roundedMdl = roundUpToThousandMdl(totalMinor);

      expect(roundedMdl % ROUNDING_STEP_MDL).toBe(0);
      expect(roundedMdl * BANI_PER_MDL).toBeGreaterThanOrEqual(totalMinor);
      expect((roundedMdl - ROUNDING_STEP_MDL) * BANI_PER_MDL).toBeLessThan(
        totalMinor === 0 ? 1 : totalMinor,
      );
    },
  );

  propertyTest.prop([anyExactAmount, anyExactAmount])(
    "never makes a larger kitchen cheaper than a smaller one",
    (first, second) => {
      const [smaller, larger] =
        first <= second ? [first, second] : [second, first];
      expect(roundUpToThousandMdl(smaller)).toBeLessThanOrEqual(
        roundUpToThousandMdl(larger),
      );
    },
  );
});

// **The structural half of "one function" lives next door.** This file kept two guards of its own —
// a closed list of the modules naming `totalMinor`/`amountMinor`, and a line-scoped ban on
// arithmetic in them. Adversarial QA wrote live mutants past both: a rounding site split over two
// lines inside an already-allowed module (`const exactAmount = priced.totalMinor;` then the
// arithmetic on the next line, naming no amount), and a module re-formatting `figure.amountText`,
// which names no amount at all. Both left this file fully green.
//
// They are **replaced, not supplemented**, by `starting-price.adversarial.test.ts`'s closed set:
// nine identifiers wide, and `Math.ceil|floor|round|trunc` plus the step constant refused outright
// in every module but the formatter, wherever in the module they are written. Two guards over one
// rule is how the weaker one ends up being the one somebody trusts.
//
// What stays here is the part that guard does not cover: the ruled prefix is one literal, in the
// one copy module.
describe("the ruled prefix exists once, where copy lives", () => {
  const SOURCE_ROOT = resolve(import.meta.dirname, "../../src");

  /** Crude but sufficient for a guard: it can only ever make the search *less* likely to fire, and
   *  a comment quoting the string is exactly what would otherwise produce a false positive. */
  function withoutComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  }

  function listSourceFiles(directory: string, prefix = ""): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = `${prefix}${entry.name}`;
      if (entry.isDirectory())
        return listSourceFiles(resolve(directory, entry.name), `${path}/`);
      return /\.tsx?$/.test(entry.name) ? [path] : [];
    });
  }

  const sourceByPath = new Map(
    listSourceFiles(SOURCE_ROOT).map((path) => [
      path,
      withoutComments(readFileSync(resolve(SOURCE_ROOT, path), "utf8")),
    ]),
  );

  it("is a single literal in the copy module, and nowhere else", () => {
    const namesThePrefix = [...sourceByPath]
      .filter(([, source]) => source.includes('"De la'))
      .map(([path]) => path)
      .sort();

    expect(namesThePrefix).toEqual(["content/ro.ts"]);
  });
});
