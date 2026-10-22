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

// The sum-claim pattern and the two owner-ruled sentences it excludes live in `tests/support/ruled-price-copy.ts`:
// one list and one pattern, read by every guard that asserts this rule.

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

/** The seeded kitchen's top row: nine placements, sixteen door leaves, every bar hidden by the slot (ADR 0092
 *  Amendment C). The count is pinned; the rate it multiplies is a drafted placeholder, so it is not. */
const SEEDED_PUSH_TO_OPEN = 16;

/** ADR 0070 decision 4's flat sink column (one aluminium cover, one drying rack): a literal, because the owner's
 *  own figures are what it reconciles against. */
const SINK_EXTRAS_MINOR = 60_000;

const DEFAULT_PUSH_RATE_MINOR = (() => {
  const tier = SAMPLE_PRICE_BOOK.hardware.tiers.find(
    (candidate) =>
      candidate.tierId === SAMPLE_PRICE_BOOK.hardware.defaultTierId,
  );
  if (!tier) throw new Error("the sample book holds no default hardware tier");
  return tier.perPushToOpenMinor;
})();

/** Every authored literal in the three catalogue sections that carry price copy; ICU arguments are runtime data. */
const EVERY_PRICE_STRING = [
  ...authoredLiteralsIn(roMessages.price),
  ...authoredLiteralsIn(roMessages.priceBreakdown),
  ...authoredLiteralsIn(roMessages.globalSettings),
];

describe("the boundaries around a thousand", () => {
  it("holds at the largest amount the type admits at all", () => {
    // `assertExactMinorAmount` accepts every safe integer, so this is the function's real ceiling: a naive
    // implementation leaves the safe range at the product of the ceiling and the step.
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
    // `groupThousands` is `String(amount)`, which switches to exponential at 1e21; the safe-integer ceiling keeps it
    // out of that range.
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

    // Pinned rather than recomputed, so a sample-book change that moves the customer's figure shows in a diff.
    // The push-to-open term is read from the book because its rates are drafted placeholders (ADR 0092 Amendment C);
    // the sink extras are a literal, the owner's flat column (ADR 0070 decision 4). Appliance rows are drawn and not
    // sold, so they add no amount (ADR 0107).
    expect(SEEDED.priced.totalMinor).toBe(
      7_937_500 +
        450_240 +
        SINK_EXTRAS_MINOR +
        SEEDED_PUSH_TO_OPEN * DEFAULT_PUSH_RATE_MINOR,
    );
  });

  /** What the customer reads is the thousand at or above that total, asserted as the rounding rule and not as a
   *  string: the string follows the drafted push rate, and ADR 0092 Amendment C refuses to pin a placeholder. */
  it("renders it as the thousand at or above the exact figure", () => {
    if (!SEEDED.ok) throw new Error("expected the seeded design to price");

    const renderedMdl = roundUpToThousandMdl(SEEDED.priced.totalMinor);

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
    // `Number.isSafeInteger(-0)` and `-0 >= 0` are both true, so this is the one signed value that passes; it
    // renders unsigned, never as "-0 MDL".
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
      // Bounded a hundredfold below the safe ceiling: the round trip multiplies back into bani, and above that the
      // round trip, not the rounding, leaves the safe range, which the formatter correctly refuses.
      const onceMdl = roundUpToThousandMdl(totalMinor);
      expect(roundUpToThousandMdl(onceMdl * BANI_PER_MDL)).toBe(onceMdl);
    },
  );

  propertyTest.prop([anySafeAmount])(
    "groups with a single space and nothing else, at every magnitude",
    (totalMinor) => {
      const amountText = amountTextFor(totalMinor);

      // The separator is the mockups' own; a locale-aware formatter would vary it by runtime. Asserted by code
      // point so a U+00A0 that looks identical in a diff cannot pass.
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

    // Larger by more than one step, so a customer adding the lines up reaches a different number.
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
    // Every price string, not one section: a sum claim added to any label is as wrong as one on the total's.
    expect(EVERY_PRICE_STRING.length).toBeGreaterThan(0);
    for (const copy of EVERY_PRICE_STRING) {
      if (RULED_TO_CONTAIN_A_SUM_WORD.includes(copy)) continue;
      expect(copy, copy).not.toMatch(SUM_CLAIM_PATTERN);
    }
  });

  it("holds the one excluded sentence to the exact wording accepted at Gate O1", () => {
    // The exception is by identity, so re-wording the sentence makes the sweep judge it again.
    expect([ro.priceBreakdown.disclaimer]).toEqual(RULED_TO_CONTAIN_A_SUM_WORD);
    for (const ruled of RULED_TO_CONTAIN_A_SUM_WORD)
      expect(EVERY_PRICE_STRING, ruled).toContain(ruled);
  });

  it("keeps the price sections free of amounts altogether, as their own doc comments claim", () => {
    // ADR 0062's third prohibition: a digit here is copy that agrees with a price rather than a price rendered.
    // No exception: neither excluded sentence states an amount.
    for (const copy of EVERY_PRICE_STRING) {
      expect(copy, copy).not.toMatch(/\d/);
    }
  });
});

// The wording is pinned by the copy lock (`tests/support/approved-romanian-messages.ts`); only properties are
// asserted here: the codepoints, the closing period and the ruled noun.
describe("the flagged-total sentence accepted at Gate O1", () => {
  it("carries comma-below diacritics, not the cedillas that render identically", () => {
    // U+0219/U+021B (ș/ț) against U+015F/U+0163 (ş/ţ) look identical; a legacy-tool paste swaps them silently.
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
  /** The owner removed the `De la neschimbat` prefix label (ADR 0024's frame-2C requirement), so its cases are
   *  deleted and the removal itself is asserted. */
  it("has no second prefix left anywhere in the price copy", () => {
    // Swept over the catalogue section, not resolved content: a sweep that skipped non-strings would quietly
    // stop covering a leaf that resolves to a function.
    for (const [key, value] of Object.entries(roMessages.price)) {
      expect(value, key).not.toContain("neschimbat");
    }
    expect(Object.keys(roMessages.price)).not.toContain(
      "startingPrefixUnchanged",
    );
  });

  it("keeps the ruled word single, with the casing in the stylesheet and not in a second string", () => {
    // The price line is drawn lowercase by the stylesheet (frame D2A); a lowercase copy in `ro.json` would be a
    // second spelling of the ruled word.
    const bar = readFileSync(
      resolve(SOURCE_ROOT, "price/price-bar.module.css"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");

    expect(ro.price.startingPrefix).toBe("De la");
    expect(bar).toContain("text-transform: lowercase;");
    expect(bar).not.toContain("text-transform: uppercase;");
  });

  it("cannot have a separator put back by a stylesheet on either surface that renders it", () => {
    // The bar's no-`content` rule also holds for the footer's and the top bar's stylesheets: a `::after { content:
    // " ·" }` would put a separator back. Only `content: ""` (frame D2A's empty divider boxes) is allowed by name.
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

// The closed set, which a line-scoped guard cannot express: a module re-formatting `figure.amountText`, or a
// rounding site split across two lines inside a module already allowed near a price.
describe("only these modules may go near a price, and only one of them may round", () => {
  const THE_FORMATTER = "price/starting-price.ts";

  /** Anything naming an exact amount, a composed figure or the query that produces one; wider than the shipped
   *  guard because a second formatter only has to reach the string. */
  const REACHES_A_PRICE =
    /totalMinor|amountMinor|amountText|PriceFigure|describeStartingPrice|describeAddedAmount|roundUpToThousandMdl|usePricedDesign|PricingResult|priceDesign|describeFlaggedTotalWarning|totalIsFlagged|PricedDesign/;

  /** The rounding verbs, refused in every module but the formatter and not only on the line naming the amount. */
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
      // The kitchen card prints the price line `describeKitchenPrice` makes; it derives and rounds nothing. The age
      // arithmetic that does round is in `relative-age.ts`, which reaches no price and is not listed.
      "account/kitchens/kitchen-card.tsx",
      "account/kitchens/kitchen-summary.ts",
      // The review screen and its two helpers render the model's figure and rows; they derive and round nothing.
      "app/d/[id]/review/review-screen.tsx",
      // Frame 4A's card prints the review's own figure (`review.figure.amountText`) beside its room line, so the
      // card shows the figure the press sends and derives nothing; it rounds nothing (8L, criterion 5).
      "contact/contact-design-card.tsx",
      // Reads the book's version through `usePricedDesign` and nothing else of the price: the digest covers
      // `bookVersion` (ADR 0157 d2), and the browser root is the one place that names the book (ADR 0157 d8). It
      // uses no amount; the same hook still has to pass the rounding and step assertions below.
      "contact/use-contact-submission.ts",
      // The shop's notice prints a stored review's figure and rows and derives nothing; it rounds nothing.
      "lib/server/mail/lead-notification.ts",
      "panel/editor-panel.tsx",
      "panel/panel-model.ts",
      "panel/use-panel-view.ts",
      // ADR 0104 decision 8b: the flagged total's sentence is on the scene, a fourth surface; listed, not exempted.
      "price/flagged-total-warning.tsx",
      "price/price-bar-model.ts",
      "price/price-bar.tsx",
      // The browser's price-book root: the one module that names the book (ADR 0157 d8); it prices and rounds nothing.
      "price/price-book-root.ts",
      // Listed rather than exempted: a new module that can reach a priced amount is a recorded addition, and it
      // still has to pass the three assertions below.
      "price/price-breakdown-model.ts",
      "price/price-breakdown.tsx",
      THE_FORMATTER,
      "price/use-priced-design.ts",
      // `whole-kitchen-tiers.ts` prices the design six times over to measure a delta; listed, not exempted.
      "price/whole-kitchen-tiers.ts",
      "review/review-groups.tsx",
      "review/review-model.ts",
      "review/use-review.ts",
      "settings/global-settings-model.ts",
      "settings/global-settings.tsx",
      // The staff kitchen's summary card prints the price line `describeKitchenPrice` makes, as the kitchen card does,
      // and names the book's two tiers from the same priced design; it derives and rounds nothing.
      "staff/staff-kitchen-view.tsx",
    ]);
  });

  it("lets none of them round, wherever in the module the arithmetic is written", () => {
    for (const path of pricingModules) {
      if (path === THE_FORMATTER) continue;
      expect(sourceByPath.get(path) ?? "", path).not.toMatch(ROUNDS);
    }
  });

  it("lets none of them carry the step the formatter rounds to", () => {
    // The constant: `Math.ceil` can be spelled around, a hundred thousand bani cannot.
    for (const path of pricingModules) {
      if (path === THE_FORMATTER) continue;
      expect(sourceByPath.get(path) ?? "", path).not.toMatch(
        /100_?000|1_?000_?00\b/,
      );
    }
  });

  /** `ro.json` restated as a type; a freshness gate keeps it equal to the catalogue, and it cannot write anything. */
  const THE_GENERATED_DECLARATION = "messages/ro.d.json.ts";

  function modulesByPath(): ReadonlyMap<string, string> {
    const modules = new Map(sourceByPath);
    expect(modules.delete(THE_GENERATED_DECLARATION)).toBe(true);
    return modules;
  }

  it("refuses the price-book currency import, and the currency inside a single-line string literal", () => {
    // The join lives in `price.amountWithCurrency` (ADR 0095 Amendment C), so a `"MDL"` literal in a module is a
    // second, untranslatable spelling. Line-scoped on purpose: spanning newlines, `[^"'`]*` reaches from any string
    // to an identifier like `MINOR_UNITS_PER_MDL` and passes for the wrong reason. Known holes, not closed: a bare
    // JSX text node (`{row.amountText} MDL`) and a stylesheet `content: " MDL"`, which `listSourceFiles` skips.
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
    // Exactly one module may resolve the leaf that joins an amount to a currency; a second composes its own figure.
    const leafKey = RULED_TO_CARRY_THE_CURRENCY.split(".").at(-1) ?? "";
    expect(leafKey).not.toBe("");

    const resolvesTheJoin = [...modulesByPath()]
      .filter(([, source]) => source.includes(leafKey))
      .map(([path]) => path)
      .sort();

    expect(resolvesTheJoin).toEqual([THE_FORMATTER, "i18n/content.ts"].sort());
  });

  it("reaches for no Intl formatter anywhere under price/", () => {
    // ADR 0095 Amendment C. Comments are stripped on purpose: the formatter's head comment names `Intl.NumberFormat`
    // to record measured output, and what is refused is the identifier in code.
    const priceModules = [...modulesByPath()].filter(([path]) =>
      path.startsWith("price/"),
    );

    expect(priceModules.length).toBeGreaterThan(5);
    for (const [path, source] of priceModules) {
      expect(source, path).not.toMatch(/\bIntl\b/);
    }
  });

  it("puts the currency in exactly one catalogue leaf, in both shipped locales", () => {
    // Where the currency went: "not in a module" alone is satisfied by deleting it from the product.
    for (const [locale, messages] of CATALOGUES) {
      const carryTheCurrency = catalogueLeaves(messages)
        .filter(([, value]) => value.includes(RULED_CURRENCY_CODE))
        .map(([key]) => key);

      expect(carryTheCurrency, locale).toEqual([RULED_TO_CARRY_THE_CURRENCY]);
    }
  });

  it("spells that leaf with the currency the price book declares, in both shipped locales", () => {
    // The one assertion that couples the catalogue to the book: every other case passes over a EUR book with MDL
    // catalogues. It imports `PRICE_BOOK_CURRENCY` where the sweep re-spells the code; see
    // `tests/support/ruled-price-copy.ts`.
    for (const [locale, messages] of CATALOGUES) {
      expect(
        requireLeafAt(messages, RULED_TO_CARRY_THE_CURRENCY),
        locale,
      ).toContain(PRICE_BOOK_CURRENCY);
    }
  });
});
