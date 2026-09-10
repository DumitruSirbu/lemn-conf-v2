// Adversarial QA for wave 6C's formatter: the boundaries the example tests step over, the whole
// safe-integer domain rather than a decade of it, and the two halves of "one function formats every
// figure" that the shipped structural guard does not close.
//
// **Why the guard is re-stated here rather than trusted.** `starting-price.test.ts`'s guard was
// mutation-tested during this pass. It catches a *new* module that names a priced amount, and it
// catches a rounding site written on the same line as the amount. It does **not** catch either of
// the two shapes a real drift takes:
//
//   const exactAmount = priced.totalMinor;                     // named here, no arithmetic
//   const roundedMdl = Math.ceil(exactAmount / 100000) * 1000;  // arithmetic here, no name
//
// and a module that re-formats the *composed* figure — `figure.amountText.replace(...)` — which
// names no priced amount at all and is therefore invisible to it. Both were written into the tree
// and both left the shipped guard green. The two blocks at the end of this file close them from the
// test side: the set of modules allowed near a price is closed by name, and the rounding verbs are
// refused outright in every one of them but the formatter.
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  PRICE_BOOK_CURRENCY,
  priceDesign,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
} from "@lemnaria/configurator-domain";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ro } from "../support/romanian-content";
import roMessages from "../../src/messages/ro.json";
import {
  authoredLiterals,
  authoredLiteralsIn,
} from "../support/icu-authored-literals";

import {
  CATALOGUES,
  catalogueLeaves,
  requireLeafAt,
} from "../support/catalogues";
import {
  RULED_CURRENCY_CODE,
  RULED_TO_CARRY_THE_CURRENCY,
  RULED_TO_CONTAIN_A_SUM_WORD,
  SUM_CLAIM_PATTERN,
} from "../support/ruled-price-copy";
import {
  describeStartingPrice,
  roundUpToThousandMdl,
} from "@/price/starting-price";

// The sum-claim pattern and the two owner-ruled sentences excluded from it by identity live in
// `tests/support/ruled-price-copy.ts`, with the whole reason recorded there. One list and one
// pattern, read by every guard that asserts this rule — including the one over rendered output in
// `price-breakdown-copy.test.ts`, which asks the same question of a surface that a string sweep
// cannot see.

/** Re-derived rather than imported, so an agreement here is not an agreement with itself. */
const BANI_PER_MDL = 100;
const ROUNDING_STEP_MDL = 1000;
const BANI_PER_STEP = BANI_PER_MDL * ROUNDING_STEP_MDL;

function amountTextFor(totalMinor: number): string {
  return describeStartingPrice({ totalMinor, copy: ro.price }).amountText;
}

const SEEDED = priceDesign({
  design: KITCHEN_L_DESIGN,
  catalog: KITCHEN_L_BODY_CATALOG,
  book: SAMPLE_PRICE_BOOK,
  pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
});

/** The seeded kitchen's top row: nine placements, sixteen door leaves, every bar hidden by the slot
 *  (ADR 0092 Amendment C). A count, so it is pinned; the rate it multiplies is drafted, so it is
 *  not. */
const SEEDED_PUSH_TO_OPEN = 16;

/** ADR 0070 decision 4's flat sink column — one aluminium cover and one drying rack, the owner's own
 *  figures, identical in all three tier columns. A literal, unlike the push term, because that is
 *  what it reconciles against. */
const SINK_EXTRAS_MINOR = 60_000;

const DEFAULT_PUSH_RATE_MINOR = (() => {
  const tier = SAMPLE_PRICE_BOOK.hardware.tiers.find(
    (candidate) =>
      candidate.tierId === SAMPLE_PRICE_BOOK.hardware.defaultTierId,
  );
  if (!tier) throw new Error("the sample book holds no default hardware tier");
  return tier.perPushToOpenMinor;
})();

/** Every authored literal in the three catalogue sections that carry price copy. ICU arguments and
 * pound signs are deliberately absent: they are runtime data, not amounts authored into copy. */
const EVERY_PRICE_STRING = [
  ...authoredLiteralsIn(roMessages.price),
  ...authoredLiteralsIn(roMessages.priceBreakdown),
  ...authoredLiteralsIn(roMessages.globalSettings),
];

describe("the boundaries around a thousand", () => {
  it("never charges a further thousand for an amount already on the step", () => {
    // The failure this guards is the classic off-by-one in a ceiling: `floor(x / step) + 1`, which
    // is right everywhere except exactly on the step, where it silently adds 1 000 MDL.
    for (const stepCount of [1, 2, 43, 94, 100, 1_000, 999_999]) {
      expect(
        roundUpToThousandMdl(stepCount * BANI_PER_STEP),
        `${String(stepCount)} exact steps gained a thousand`,
      ).toBe(stepCount * ROUNDING_STEP_MDL);
    }
  });

  it("moves one whole thousand across each side of a step, and no more", () => {
    for (const stepCount of [1, 43, 94, 5_000]) {
      const onStep = stepCount * BANI_PER_STEP;
      expect(roundUpToThousandMdl(onStep - 1)).toBe(
        stepCount * ROUNDING_STEP_MDL,
      );
      expect(roundUpToThousandMdl(onStep)).toBe(stepCount * ROUNDING_STEP_MDL);
      expect(roundUpToThousandMdl(onStep + 1)).toBe(
        (stepCount + 1) * ROUNDING_STEP_MDL,
      );
    }
  });

  it("rounds one ban up to a whole thousand", () => {
    expect(roundUpToThousandMdl(1)).toBe(1_000);
    expect(amountTextFor(1)).toBe("1 000 MDL");
  });

  it("holds at the largest amount the type admits at all", () => {
    // `assertExactMinorAmount` accepts every safe integer, so this is the real ceiling of the
    // function rather than of the catalogue. It is here because the product of the ceiling and the
    // step is where a naive implementation leaves the safe range and starts returning approximate
    // thousands.
    const rounded = roundUpToThousandMdl(Number.MAX_SAFE_INTEGER);

    expect(Number.isSafeInteger(rounded)).toBe(true);
    expect(rounded % ROUNDING_STEP_MDL).toBe(0);
    expect(rounded * BANI_PER_MDL).toBeGreaterThanOrEqual(
      Number.MAX_SAFE_INTEGER,
    );
    expect(amountTextFor(Number.MAX_SAFE_INTEGER)).toBe(
      "90 071 992 548 000 MDL",
    );
  });

  it("never falls back to exponential notation, which would render as a broken price", () => {
    // `groupThousands` is `String(amount)`, and `String` switches to exponential at 1e21. The safe
    // integer ceiling is what keeps it out of that range; this is the assertion that says so.
    for (const totalMinor of [
      Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER - 1,
      9_007_199_254_740_000,
    ]) {
      expect(amountTextFor(totalMinor)).not.toMatch(/e[+-]/i);
    }
  });
});

describe("the catalogue's own totals, priced and shown", () => {
  it("prices the seeded kitchen and renders the thousand above it", () => {
    if (!SEEDED.ok) throw new Error("expected the seeded design to price");

    // Pinned rather than recomputed: a change to the sample book that moved the figure a customer
    // reads should be visible in a diff, not absorbed by an expression that follows it.
    //
    // **It moved in wave 6T, and this is that diff.** It was 9 427 500 / *95 000 MDL* while the
    // default hardware tier cost nothing. ADR 0070 decision 1 prices hardware per mechanism, and
    // ADR 0092 decision 15 ships the absolute model as its interim, so the Standard tier now bills
    // the seeded kitchen's 74 hinges and 5 drawers at 450 240 minor and the whole design is that
    // much dearer. Nothing else in the total moved.
    //
    // **It moved again in wave 6T-a, and that term is read from the book rather than typed.** The
    // seeded kitchen's top row carries 16 push-to-open fronts (ADR 0092 Amendment C) and the three
    // push rates are drafted placeholders with no supplier source, so a literal here would make one
    // load-bearing on the one figure the whole product's landing page shows.
    //
    // **And once more at wave 6T2**, which added ADR 0070 decision 4's two sink extras: the seeded
    // kitchen holds one sink under one wall cabinet, so it earns one cover and one rack. That term
    // *is* a literal, because it is the owner's own flat *"Sink extras 600"* column being
    // reconciled against — the same standing the hinge and drawer literals have.
    expect(SEEDED.priced.totalMinor).toBe(
      9_427_500 +
        450_240 +
        SINK_EXTRAS_MINOR +
        SEEDED_PUSH_TO_OPEN * DEFAULT_PUSH_RATE_MINOR,
    );
  });

  /** **What the customer reads is the thousand at or above that total**, asserted as the rounding
   *  rule rather than as a string. The string itself follows the drafted push rate — it is
   *  *100 000 MDL* today and would be another thousand at another rate — and ADR 0092 Amendment C
   *  refuses to pin an expectation to a placeholder's magnitude. The formatter's own examples,
   *  pinned as strings throughout this file, are what hold the rendering. */
  it("renders it as the thousand at or above the exact figure", () => {
    if (!SEEDED.ok) throw new Error("expected the seeded design to price");

    const renderedMdl = roundUpToThousandMdl(SEEDED.priced.totalMinor);

    // The exact figure and the thousand it rounds to render as the same sentence, which is the
    // customer-visible half of the rule and needs no separator typed out here.
    expect(amountTextFor(SEEDED.priced.totalMinor)).toBe(
      amountTextFor(renderedMdl * BANI_PER_MDL),
    );
    expect(renderedMdl % ROUNDING_STEP_MDL).toBe(0);
    expect(renderedMdl * BANI_PER_MDL).toBeGreaterThanOrEqual(
      SEEDED.priced.totalMinor,
    );
    expect((renderedMdl - ROUNDING_STEP_MDL) * BANI_PER_MDL).toBeLessThan(
      SEEDED.priced.totalMinor,
    );
  });

  it("rounds every line the catalogue can produce without leaving the step", () => {
    if (!SEEDED.ok) throw new Error("expected the seeded design to price");

    for (const line of SEEDED.priced.lines) {
      const roundedMdl = roundUpToThousandMdl(line.amountMinor);
      expect(roundedMdl % ROUNDING_STEP_MDL).toBe(0);
      expect(roundedMdl * BANI_PER_MDL).toBeGreaterThanOrEqual(
        line.amountMinor,
      );
    }
  });

  it("renders an included tier's zero as a bare zero, which wave 6D must not ship as an amount", () => {
    // Characterisation, not approval. Two `0` lines exist in the seeded price — the default hardware
    // and material tiers — and this formatter turns each into `"0 MDL"`. Frame 2E rules *inclus*
    // for a zero-amount tier, so 6D's lines cannot come through here unguarded. 6C shows no line, so
    // nothing is wrong on this wave's surface; the assertion exists so 6D cannot inherit the shape
    // silently.
    if (!SEEDED.ok) throw new Error("expected the seeded design to price");

    const zeroLines = SEEDED.priced.lines.filter(
      (line) => line.amountMinor === 0,
    );
    expect(zeroLines.length).toBeGreaterThan(0);
    expect(amountTextFor(0)).toBe("0 MDL");
    expect(ro.price).not.toHaveProperty("included");
  });
});

describe("what the formatter refuses rather than renders", () => {
  it("refuses every amount that is not a whole non-negative count of minor units", () => {
    const refused = [
      -1,
      -0.5,
      -Number.MIN_VALUE,
      0.5,
      1.000_000_1,
      Number.EPSILON,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
      Number.MAX_VALUE,
      1e21,
    ];

    for (const totalMinor of refused) {
      expect(
        () => amountTextFor(totalMinor),
        `${String(totalMinor)} was rendered rather than refused`,
      ).toThrow(RangeError);
    }
  });

  it("accepts negative zero, because it is a whole zero count of bani", () => {
    // Named rather than left to be discovered: `Number.isSafeInteger(-0)` is true and `-0 >= 0` is
    // true, so this is the one signed value that passes. It renders as the unsigned figure, which is
    // the only outcome that would not put a "-0 MDL" in front of a customer.
    expect(amountTextFor(-0)).toBe("0 MDL");
  });
});

describe("the rounding rule over its whole domain", () => {
  const anySafeAmount = fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER });

  propertyTest.prop([anySafeAmount])(
    "lands on the step, at or above the exact price, and never a step too high",
    (totalMinor) => {
      const roundedMdl = roundUpToThousandMdl(totalMinor);

      expect(roundedMdl % ROUNDING_STEP_MDL).toBe(0);
      expect(roundedMdl * BANI_PER_MDL).toBeGreaterThanOrEqual(totalMinor);
      expect((roundedMdl - ROUNDING_STEP_MDL) * BANI_PER_MDL).toBeLessThan(
        Math.max(totalMinor, 1),
      );
    },
  );

  propertyTest.prop([fc.integer({ min: 0, max: 90_071_992_547 })])(
    "leaves an exact multiple of the step alone, at every magnitude",
    (stepCount) => {
      expect(roundUpToThousandMdl(stepCount * BANI_PER_STEP)).toBe(
        stepCount * ROUNDING_STEP_MDL,
      );
    },
  );

  propertyTest.prop([fc.integer({ min: 0, max: 90_071_992_547_409 })])(
    "is idempotent once expressed back in bani, so a second pass cannot inflate a figure",
    (totalMinor) => {
      // Bounded a hundredfold below the safe ceiling, because the round trip below multiplies the
      // rounded figure back into bani. Above that the round trip — not the rounding — leaves the
      // safe range, and the formatter refuses it, which is the correct answer to an amount no
      // catalogue can produce.
      const onceMdl = roundUpToThousandMdl(totalMinor);
      expect(roundUpToThousandMdl(onceMdl * BANI_PER_MDL)).toBe(onceMdl);
    },
  );

  propertyTest.prop([anySafeAmount])(
    "groups with a single space and nothing else, at every magnitude",
    (totalMinor) => {
      const amountText = amountTextFor(totalMinor);

      // The separator is the mockups' own, and a locale-aware formatter would put a comma, a period
      // or a narrow no-break space here depending on the runtime's data. Asserted by code point so
      // a U+00A0 that looks identical in a diff cannot pass.
      expect(amountText).toMatch(/^\d{1,3}(?: \d{3})* MDL$/);
      expect(amountText).not.toContain("\u00a0");
    },
  );
});

describe("rounded lines and a rounded total, and what the copy says about them", () => {
  it("differ on the design the application actually ships with", () => {
    if (!SEEDED.ok) throw new Error("expected the seeded design to price");

    const roundedLineSumMdl = SEEDED.priced.lines.reduce(
      (sum, line) => sum + roundUpToThousandMdl(line.amountMinor),
      0,
    );
    const roundedTotalMdl = roundUpToThousandMdl(SEEDED.priced.totalMinor);

    // Not merely unequal — larger, and by more than one step, which is what makes a customer adding
    // the lines up reach a different number rather than a rounding-sized one.
    expect(roundedLineSumMdl).toBeGreaterThan(
      roundedTotalMdl + ROUNDING_STEP_MDL,
    );
  });

  it("sweeps authored literals inside every ICU branch", () => {
    const appliesToLiterals = authoredLiterals(
      roMessages.globalSettings.appliesTo,
    );

    expect(appliesToLiterals.length).toBeGreaterThan(3);
    expect(appliesToLiterals.every((literal) => !/\d/.test(literal))).toBe(
      true,
    );
    expect(
      appliesToLiterals.every((literal) => !SUM_CLAIM_PATTERN.test(literal)),
    ).toBe(true);
  });

  it("kills digit and sum-claim mutations authored inside ICU branches", () => {
    const taggedIcuMutant = "<strong>Total 3 items</strong>";
    const taggedLiterals = authoredLiteralsIn({ tagged: taggedIcuMutant });
    const mutantLiterals = [
      ...authoredLiteralsIn({
        plural:
          "{count, plural, one {Total 1 item} few {2 items} other {# items}}",
      }),
      ...taggedLiterals,
    ];

    expect(mutantLiterals.some((literal) => /\d/.test(literal))).toBe(true);
    expect(
      mutantLiterals.some((literal) => SUM_CLAIM_PATTERN.test(literal)),
    ).toBe(true);
    expect(taggedLiterals).toEqual(["Total 3 items"]);
    expect(taggedLiterals[0]).toMatch(/\d/);
    expect(taggedLiterals[0]).toMatch(SUM_CLAIM_PATTERN);
  });

  it("is a gap no string in the price sections claims to close", () => {
    // Every price string in the application, not one section and not one label: the criterion is
    // that *no surface* claims the two sum, and a claim added to a fourth label would be as wrong
    // as one added to the total's.
    expect(EVERY_PRICE_STRING.length).toBeGreaterThan(0);
    for (const copy of EVERY_PRICE_STRING) {
      if (RULED_TO_CONTAIN_A_SUM_WORD.includes(copy)) continue;
      expect(copy, copy).not.toMatch(SUM_CLAIM_PATTERN);
    }
  });

  it("holds the one excluded sentence to the exact wording accepted at Gate O1", () => {
    // The exception is by identity, so re-wording it makes the sweep judge it again. The accepted
    // footnote contains no sum-family word and therefore needs no exception.
    expect([ro.priceBreakdown.disclaimer]).toEqual(RULED_TO_CONTAIN_A_SUM_WORD);
    for (const ruled of RULED_TO_CONTAIN_A_SUM_WORD)
      expect(EVERY_PRICE_STRING, ruled).toContain(ruled);
  });

  it("keeps the price sections free of amounts altogether, as their own doc comments claim", () => {
    // ADR 0062's third prohibition, made falsifiable: a digit here is copy that happens to agree
    // with a price rather than a price rendered. No exception — both excluded sentences state no
    // amount either, and a template that interpolates one (`${widthMm}`) states no digit of its own.
    for (const copy of EVERY_PRICE_STRING) {
      expect(copy, copy).not.toMatch(/\d/);
    }
  });
});

// **The wording itself is not asserted here.** `price.overflowingTotalWarning` is pinned byte for
// byte by the copy lock (`tests/support/approved-romanian-messages.ts`), and the two `toBe` spellings
// this block used to carry were a second copy of it — a place an owner retranslation goes red for a
// reason that is not a defect. What is left below are *properties* of the accepted leaf that a byte
// comparison reports as an unreadable diff: the codepoints, the closing period, and the ruled noun.
describe("the flagged-total sentence accepted at Gate O1", () => {
  it("carries comma-below diacritics, not the cedillas that render identically", () => {
    // The one difference a reviewer cannot see: U+0219/U+021B (Romanian ș/ț) against U+015F/U+0163
    // (Turkish ş/ţ). A copy-paste through a legacy tool silently swaps them, and every visual check
    // and every `toBe` written from that paste would still pass.
    const warning = ro.price.overflowingTotalWarning;

    /* eslint-disable no-restricted-syntax -- 6B-j allow-list: codepoints rather than wording — U+0219/U+021B against U+015F/U+0163, the one difference a reviewer cannot see. */
    expect(warning).toContain("\u0219");
    expect(warning).toContain("\u021b");
    expect(warning).toContain("\u0103");
    expect(warning).not.toContain("\u015f");
    expect(warning).not.toContain("\u0163");
    /* eslint-enable no-restricted-syntax */
  });

  it("keeps the accepted noun and has no added closing period", () => {
    expect(ro.price.overflowingTotalWarning.endsWith(".")).toBe(false);
    expect(ro.price.overflowingTotalWarning).toContain("dulapuri");
    expect(ro.price.overflowingTotalWarning).not.toContain("corpuri");
  });
});

const SOURCE_ROOT = resolve(import.meta.dirname, "../../src");

describe("the one prefix a figure carries, and the one the owner removed", () => {
  /**
   * **Three cases were deleted here on 2026-09-09, and the deletion is the record.**
   *
   * They pinned `ro.price.startingPrefixUnchanged` — *"De la neschimbat"* — byte for byte against
   * the M6 plan's ruled-strings row, held it to carrying no separator where frames D2C and 2C draw
   * one, and kept it a superset of the bare prefix. All three were about a string that **no longer
   * exists**: the owner removed the label on 2026-09-09 — *"event to state that your change didn't
   * changed the price, I didn't request this"* — because §9's refusal banner already says the edit
   * was refused, at the place the customer was looking. An assertion about a withdrawn behaviour is
   * not a gate, so they are gone rather than weakened, and what replaces them is the removal itself.
   *
   * **ADR 0024's third frame-2C requirement was closed by that label and is left unmet again.**
   */
  it("has no second prefix left anywhere in the price copy", () => {
    // Swept over the **catalogue** section rather than resolved content: since wave 6B-g one price
    // leaf resolves to a function, and a sweep that skipped non-strings would quietly stop covering
    // it. Every leaf here is authored copy and every one is a string.
    for (const [key, value] of Object.entries(roMessages.price)) {
      expect(value, key).not.toContain("neschimbat");
    }
    expect(Object.keys(roMessages.price)).not.toContain(
      "startingPrefixUnchanged",
    );
  });

  it("offers no surface a choice of prefix to compose", () => {
    // The other half of the removal: the formatter used to take a label because there were two, and
    // three surfaces had to agree about which. There is one, this module owns it, and a refusal
    // never reaches a price model at all — asserted over the modules rather than over one call.
    const composers = [
      "price/starting-price.ts",
      "price/price-bar-model.ts",
      "price/price-breakdown-model.ts",
      "panel/panel-model.ts",
      "settings/global-settings-model.ts",
    ];

    for (const path of composers) {
      // Comments stripped: `starting-price.ts` **names** the withdrawn function in the note
      // recording why it went, which is exactly the false positive a text guard has to rule out.
      const source = readFileSync(resolve(SOURCE_ROOT, path), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(source, path).not.toContain("describeStartingLabel");
    }
  });

  it("keeps the ruled word single, with the casing in the stylesheet and not in a second string", () => {
    // **The price line is drawn inline and lowercase on both shells** (owner, 2026-09-09), which is
    // frame D2A's form. A lowercase copy of the word in `ro.json` would be the second spelling of a
    // ruled string that the withdrawn label already cost this project once; the transform is the
    // stylesheet's, and it changes case rather than words.
    const bar = readFileSync(
      resolve(SOURCE_ROOT, "price/price-bar.module.css"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");

    expect(ro.price.startingPrefix).toBe("De la");
    expect(bar).toContain("text-transform: lowercase;");
    expect(bar).not.toContain("text-transform: uppercase;");
  });

  it("cannot have a separator put back by a stylesheet on either surface that renders it", () => {
    // The shipped layout gate holds `price-bar.module.css` to declaring no `content`. The same label
    // renders in §9's footer from `editor-panel.module.css`, and a `::after { content: " ·" }` there
    // would be right in `ro.json` and wrong on screen — the exact failure the bar's rule guards.
    //
    // **What is refused is a `content` that says something**, not the property. Frame D2A's three
    // 28 px dividers are `::before` pseudo-elements on the top bar's cells and each declares
    // `content: ""` — a box with no text in it, which cannot put a separator back into a label. An
    // empty string is therefore allowed by name and every other value still fails, so a `content:
    // " ·"` added tomorrow is caught exactly as before.
    const stylesheets = [
      resolve(import.meta.dirname, "../../src/price/price-bar.module.css"),
      resolve(import.meta.dirname, "../../src/panel/editor-panel.module.css"),
      resolve(
        import.meta.dirname,
        "../../src/app/configurator/configure/configure.module.css",
      ),
    ];

    for (const stylesheet of stylesheets) {
      const declarations = readFileSync(stylesheet, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replaceAll('content: "";', "");
      expect(declarations, stylesheet).not.toMatch(/[^-]content:/);
    }
  });
});

// **The closed set, which is the half a line-scoped guard cannot express.** Both blocks below were
// written against live mutants: a module that re-formats `figure.amountText`, and a rounding site
// split across two lines inside a module that is already allowed near a price. The shipped guard
// stayed green for both.
describe("only these modules may go near a price, and only one of them may round", () => {
  const THE_FORMATTER = "price/starting-price.ts";

  /** Everything that names an exact amount, a composed figure, or the query that produces one.
   *  Wider than the shipped guard's two field names on purpose: a second formatter does not have to
   *  touch `totalMinor` to exist — it only has to reach the string. */
  const REACHES_A_PRICE =
    /totalMinor|amountMinor|amountText|PriceFigure|describeStartingPrice|describeAddedAmount|roundUpToThousandMdl|usePricedDesign|PricingResult|priceDesign|describeFlaggedTotalWarning|totalIsFlagged|PricedDesign/;

  /** The verbs a rounding rule is written with. Refused outright in every module but the formatter,
   *  rather than only on the line that names the amount — one `const` of indirection is all it takes
   *  to move the arithmetic off that line. */
  const ROUNDS = /Math\.(ceil|floor|round|trunc)/;

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

  const pricingModules = [...sourceByPath]
    .filter(([, source]) => REACHES_A_PRICE.test(source))
    .map(([path]) => path)
    .sort();

  it("names every module that can reach a priced amount or the figure built from one", () => {
    expect(pricingModules).toEqual([
      "panel/editor-panel.tsx",
      "panel/panel-model.ts",
      "panel/use-panel-view.ts",
      // ADR 0104 decision 8b, owner 2026-09-09: the flagged total's sentence left the top bar for
      // the scene, so a fourth surface reaches the priced design. Added here rather than exempted —
      // it renders `describePriceBar`'s own answer and still has to pass the three assertions below.
      "price/flagged-total-warning.tsx",
      "price/price-bar-model.ts",
      "price/price-bar.tsx",
      // Wave 6D's breakdown, added here rather than exempted: this list exists so a new module that
      // can reach a priced amount is a recorded addition, and the two below still have to pass the
      // three assertions after it — they neither round nor name the step nor name the currency.
      "price/price-breakdown-model.ts",
      "price/price-breakdown.tsx",
      THE_FORMATTER,
      "price/use-priced-design.ts",
      // Wave 6G. `whole-kitchen-tiers.ts` prices the design six times over to measure a delta, and
      // the two settings modules render the result — all three added here rather than exempted, and
      // all three still have to pass the three assertions below.
      "price/whole-kitchen-tiers.ts",
      "settings/global-settings-model.ts",
      "settings/global-settings.tsx",
    ]);
  });

  it("lets none of them round, wherever in the module the arithmetic is written", () => {
    for (const path of pricingModules) {
      if (path === THE_FORMATTER) continue;
      expect(sourceByPath.get(path) ?? "", path).not.toMatch(ROUNDS);
    }
  });

  it("lets none of them carry the step the formatter rounds to", () => {
    // The other half of a second rounding site: the constant. `Math.ceil` can be spelled around, a
    // hundred thousand bani cannot.
    for (const path of pricingModules) {
      if (path === THE_FORMATTER) continue;
      expect(sourceByPath.get(path) ?? "", path).not.toMatch(
        /100_?000|1_?000_?00\b/,
      );
    }
  });

  /** `messages/ro.d.json.ts` is `ro.json` restated as a type — next-intl generates it and a
   *  freshness gate keeps it equal to the catalogue. It is not a module and cannot write anything;
   *  sweeping it would be asking the catalogue whether the catalogue holds the currency, which the
   *  last case below asks directly. */
  const THE_GENERATED_DECLARATION = "messages/ro.d.json.ts";

  function modulesByPath(): ReadonlyMap<string, string> {
    const modules = new Map(sourceByPath);
    expect(modules.delete(THE_GENERATED_DECLARATION)).toBe(true);
    return modules;
  }

  it("refuses the price-book currency import, and the currency inside a single-line string literal", () => {
    // **Wave 6B-g moved the goalpost and this assertion with it.** The rule used to be that only the
    // formatter could name the currency, because the formatter held the template literal
    // `` `${amount} ${PRICE_BOOK_CURRENCY}` ``. ADR 0095 Amendment C moved that join into
    // `price.amountWithCurrency`, so a `"MDL"` written into a module again would be a second,
    // untranslatable spelling of a figure the catalogue owns.
    //
    // The pattern is line-scoped on purpose. Left to span newlines, `[^"'`]*` reaches from any
    // string literal in a file down to the next identifier containing `MDL` —
    // `MINOR_UNITS_PER_MDL` — and this module would go on passing for a reason unrelated to the
    // claim. It did, before the rewrite: the assertion held on an import path's closing quote.
    //
    // **Two known holes, recorded rather than closed**, because closing either needs a wider pattern
    // and the narrowing above is what makes this one mean anything. The name says exactly what is
    // swept, and these are the two ways a currency reaches a customer without passing it:
    //
    //   1. **A bare JSX text node** — `{row.amountText} MDL` — which is inside no quotes at all.
    //   2. **A stylesheet** — `content: " MDL"` — which is in no `.ts`/`.tsx` file, and
    //      `listSourceFiles` collects only those.
    //
    // Both were written into the tree during wave 6B-g's adversarial pass and this guard stayed
    // green for both; other, already-shipped tests are what failed on them — the rendered-figure
    // assertions in `amount-with-currency-seam.test.ts` for the first, and the `content:`
    // declaration guards over the price stylesheets for the second. Recorded here in the shape
    // `scene/overflow-warning-layout.test.ts` records its own destructured-read hole.
    const writesTheCurrency = [...modulesByPath()]
      .filter(([, source]) =>
        new RegExp(
          `PRICE_BOOK_CURRENCY|["'\`][^"'\`\\n]*${RULED_CURRENCY_CODE}`,
        ).test(source),
      )
      .map(([path]) => path)
      .sort();

    expect(writesTheCurrency).toEqual([]);
  });

  it("keeps the join with the currency inside the formatter, and nowhere else", () => {
    // The other half of the moved goalpost: exactly one module may resolve the leaf that joins an
    // amount to a currency. A second surface reading it would be composing a figure of its own,
    // which is what "one function formats them" has meant since wave 6C.
    const leafKey = RULED_TO_CARRY_THE_CURRENCY.split(".").at(-1) ?? "";
    expect(leafKey).not.toBe("");

    const resolvesTheJoin = [...modulesByPath()]
      .filter(([, source]) => source.includes(leafKey))
      .map(([path]) => path)
      .sort();

    expect(resolvesTheJoin).toEqual([THE_FORMATTER, "i18n/content.ts"].sort());
  });

  it("reaches for no Intl formatter anywhere under price/", () => {
    // ADR 0095 Amendment C, made falsifiable. **Comments are stripped and that is the point**: the
    // formatter's head comment names `Intl.NumberFormat` four times, on purpose — it records the
    // measured output (`"143.000"` under `ro`, `"L"` under `ro-MD`, U+00A0 under `ru`) so the next
    // reader does not re-open the question. A grep over raw source would fail on the very comment
    // the ruling asked for. What is refused is the *identifier*, in code.
    const priceModules = [...modulesByPath()].filter(([path]) =>
      path.startsWith("price/"),
    );

    expect(priceModules.length).toBeGreaterThan(5);
    for (const [path, source] of priceModules) {
      expect(source, path).not.toMatch(/\bIntl\b/);
    }
  });

  it("puts the currency in exactly one catalogue leaf, in both shipped locales", () => {
    // Where it went, asserted rather than assumed: a rule that says "not in a module" and never says
    // "in the catalogue" is satisfied by deleting the currency from the product altogether.
    for (const [locale, messages] of CATALOGUES) {
      const carryTheCurrency = catalogueLeaves(messages)
        .filter(([, value]) => value.includes(RULED_CURRENCY_CODE))
        .map(([key]) => key);

      expect(carryTheCurrency, locale).toEqual([RULED_TO_CARRY_THE_CURRENCY]);
    }
  });

  it("spells that leaf with the currency the price book declares, in both shipped locales", () => {
    // **The one assertion that couples the catalogue to the book**, and the reason it imports
    // `PRICE_BOOK_CURRENCY` where the sweep above deliberately does not. Every other case in this
    // file is satisfied by a book that says `EUR` and two catalogues that say *MDL*: the figure
    // would render `43 000 MDL` over a EUR price and nothing in the product would notice.
    //
    // The asymmetry is deliberate — the sweep re-spells the code so a changed book cannot make a
    // stale module literal pass, this one imports it so a changed book cannot leave a stale
    // catalogue leaf behind. See `tests/support/ruled-price-copy.ts` for the whole reason.
    for (const [locale, messages] of CATALOGUES) {
      expect(
        requireLeafAt(messages, RULED_TO_CARRY_THE_CURRENCY),
        locale,
      ).toContain(PRICE_BOOK_CURRENCY);
    }
  });
});
