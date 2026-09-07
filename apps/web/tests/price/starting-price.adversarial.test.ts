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
  priceDesign,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
} from "@lemnaria/configurator-domain";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ro } from "@/content/ro";

import {
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
  return describeStartingPrice({ label: ro.price.startingPrefix, totalMinor })
    .amountText;
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

/**
 * **Every string the price surfaces state**, from every section of `ro` that carries price copy —
 * `price` (the bar, §9's footer, the flagged total) and `priceBreakdown` (frames 2D / D2D).
 *
 * Flattened rather than read with `Object.values`, and both halves of that matter. A section is a
 * nested object now — `priceBreakdown` groups its band words and its category words — so a flat
 * read would hand `toMatch` an object and fail for the wrong reason, and would leave the leaves
 * underneath it never swept at all. **The shape of the data must not decide the shape of the rule.**
 *
 * A composing template contributes its **body**: the parameter list and the arrow are stripped, so
 * `` (wall, band) => `Perete ${wall} · ${band}` `` is swept as the words it would put on a screen.
 * Without that, a claim written into a template — `` `Total: ${amount}` `` — would sit in price copy
 * unswept, and `=>` alone would trip the `=` the sweep refuses.
 */
const EVERY_PRICE_STRING = [
  ...priceCopyLeaves(ro.price),
  ...priceCopyLeaves(ro.priceBreakdown),
  // Wave 6G's settings sheet, swept here rather than exempted: it carries a *delta* badge, which is
  // price copy by every rule this block enforces. Its `appliesTo` and `tierDelta` templates
  // contribute their bodies like any other, so a digit or an equality claim written into either is
  // refused the same way one in the breakdown's own templates would be.
  ...priceCopyLeaves(ro.globalSettings),
];

/** Every leaf string under a copy section, with a composing template contributing its body. */
function priceCopyLeaves(section: unknown): string[] {
  if (typeof section === "string") return [section];
  if (typeof section === "function")
    return [templateBodyOf(section as (...args: never[]) => string)];
  if (typeof section !== "object" || section === null) return [];
  return Object.values(section).flatMap(priceCopyLeaves);
}

/** An arrow function's body as source text — everything past its first `=>`. Typed on the shape a
 *  copy template has, rather than on `Function`: a section composes strings from what a surface
 *  hands it, and nothing else belongs here. */
function templateBodyOf(composer: (...args: never[]) => string): string {
  return String(composer).replace(/^[^=]*=>/, "");
}

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

  it("still holds both excluded sentences to the exact wording that was ruled", () => {
    // The exceptions are by identity, so neither can widen: re-word either sentence and it stops
    // being this string, the sweep above judges it again, and this assertion says which line to
    // update. Asserting each is still *in* the swept set is the other half — an exception nothing
    // reaches is an exception nobody notices has gone stale.
    expect([ro.priceBreakdown.disclaimer, ro.priceBreakdown.note]).toEqual(
      RULED_TO_CONTAIN_A_SUM_WORD,
    );
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

describe("the owner's flagged-total sentence, against the decision that ruled it", () => {
  const ADR_0065 = resolve(
    import.meta.dirname,
    "../../../../docs/decisions/0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md",
  );

  /** Decision 7b's block quote, which is where the owner's phrasing was recorded. Read from the
   *  decision rather than restated, because a literal in a test proves only that the test and the
   *  code agree — not that either agrees with what was ruled. */
  function ruledFlaggedTotal(): string {
    const ruled = /^> \*\*(Prețul[^*\n]+)\*\*$/m.exec(
      readFileSync(ADR_0065, "utf8"),
    );
    if (!ruled)
      throw new Error(
        "ADR 0065 decision 7b no longer carries the flagged total as a bolded block quote",
      );
    return ruled[1] ?? "";
  }

  it("is byte-identical to ADR 0065 decision 7b, diacritics and punctuation included", () => {
    expect(ro.price.overflowingTotalWarning).toBe(ruledFlaggedTotal());
  });

  it("carries comma-below diacritics, not the cedillas that render identically", () => {
    // The one difference a reviewer cannot see: U+0219/U+021B (Romanian ș/ț) against U+015F/U+0163
    // (Turkish ş/ţ). A copy-paste through a legacy tool silently swaps them, and every visual check
    // and every `toBe` written from that paste would still pass.
    const warning = ro.price.overflowingTotalWarning;

    expect(warning).toContain("\u0219");
    expect(warning).toContain("\u021b");
    expect(warning).toContain("\u0103");
    expect(warning).not.toContain("\u015f");
    expect(warning).not.toContain("\u0163");
  });

  it("is untidied — no closing period, and no wording the wave harmonised on its own", () => {
    expect(ro.price.overflowingTotalWarning).toBe(
      "Prețul include și dulapuri ce depășesc mărimea peretelui și necesită ajustări",
    );
    expect(ro.price.overflowingTotalWarning.endsWith(".")).toBe(false);
    expect(ro.price.overflowingTotalWarning).toContain("dulapuri");
    expect(ro.price.overflowingTotalWarning).not.toContain("corpuri");
  });
});

describe("the unchanged label, against the ruling that replaced both mockup spellings", () => {
  const M6_PLAN = resolve(
    import.meta.dirname,
    "../../../../docs/milestones/M6-price-and-global-settings.md",
  );
  /** The plan's ruled-strings table, which is the only place this ruling is recorded — a literal in
   *  a test would agree with the code and
   *  with nothing else. */
  function ruledUnchangedLabel(): string {
    const ruled =
      /^\| \*"(De la[^"]*)"\* — the price label while an edit is refused \|/m.exec(
        readFileSync(M6_PLAN, "utf8"),
      );
    if (!ruled)
      throw new Error(
        "the M6 plan's ruled-strings table no longer carries a row for the unchanged price label",
      );
    return ruled[1] ?? "";
  }

  it("is byte-identical to the string the M6 plan records the owner as ruling", () => {
    expect(ro.price.startingPrefixUnchanged).toBe(ruledUnchangedLabel());
    expect(ro.price.startingPrefixUnchanged).toBe("De la neschimbat");
  });

  it("carries no separator at all, not merely neither of the two it replaced", () => {
    // The ruling is *no separator*, so the pin is that general fact rather than a list of the two
    // spellings that happened to lose. Both mockups still draw one, which is why a copy pass reading
    // a frame is the live risk — but so is a third separator nobody has drawn yet, and a pair of
    // `not.toBe` checks would let that one through.
    const label = ro.price.startingPrefixUnchanged;

    expect(label).toMatch(/^\p{L}+ \p{L}+ \p{L}+$/u);
    expect(label.split(" ")).toEqual(["De", "la", "neschimbat"]);
    for (const superseded of ["De la · neschimbat", "De la, neschimbat"]) {
      expect(label).not.toBe(superseded);
    }
  });

  it("superseded two spellings the plan records, so the ruling is a real change", () => {
    // The counterfactual for the row in the plan's table: if the frames had already said
    // *"De la neschimbat"*, there would have been nothing to reconcile and no ruling to record.
    //
    // **The witness is the plan's row, not the mockup HTML, and that changed on 2026-09-07.** The
    // row used to say the frames were "the record of what was drawn and was not edited", and this
    // test read them directly. Then the owner re-exported the reference for the top-bar wave, the
    // export dropped `De la · neschimbat` from D2C, and a test asserting a *historical* fact went
    // red because a *living* file had legitimately moved on. A mockup the owner re-exports cannot
    // witness what a mockup once drew. The plan's row names both superseded spellings itself and is
    // append-only, so it can.
    const row =
      /^\| \*"De la[^"]*"\* — the price label while an edit is refused \|(.*)$/m.exec(
        readFileSync(M6_PLAN, "utf8"),
      )?.[1];
    if (!row)
      throw new Error(
        "the M6 plan's ruled-strings table no longer carries a row for the unchanged price label",
      );

    const superseded = ["De la · neschimbat", "De la, neschimbat"];

    for (const spelling of superseded) expect(row).toContain(spelling);
    // Each is a real supersession rather than the ruled label written twice.
    for (const spelling of superseded)
      expect(spelling).not.toBe(ro.price.startingPrefixUnchanged);
  });

  it("keeps the bare prefix a prefix of it, so the two cannot drift apart in wording", () => {
    expect(ro.price.startingPrefix).toBe("De la");
    expect(
      ro.price.startingPrefixUnchanged.startsWith(ro.price.startingPrefix),
    ).toBe(true);
  });

  it("cannot have a separator put back by a stylesheet on either surface that renders it", () => {
    // The shipped layout gate holds `price-bar.module.css` to declaring no `content`. The same label
    // renders in §9's footer from `editor-panel.module.css`, and a `::after { content: " ·" }` there
    // would be right in `ro.ts` and wrong on screen — the exact failure the bar's rule guards.
    const stylesheets = [
      resolve(import.meta.dirname, "../../src/price/price-bar.module.css"),
      resolve(import.meta.dirname, "../../src/panel/editor-panel.module.css"),
      resolve(
        import.meta.dirname,
        "../../src/app/configurator/configure/configure.module.css",
      ),
    ];

    for (const stylesheet of stylesheets) {
      const declarations = readFileSync(stylesheet, "utf8").replace(
        /\/\*[\s\S]*?\*\//g,
        "",
      );
      expect(declarations, stylesheet).not.toMatch(/[^-]content:/);
    }
  });
});

// **The closed set, which is the half a line-scoped guard cannot express.** Both blocks below were
// written against live mutants: a module that re-formats `figure.amountText`, and a rounding site
// split across two lines inside a module that is already allowed near a price. The shipped guard
// stayed green for both.
describe("only these modules may go near a price, and only one of them may round", () => {
  const SOURCE_ROOT = resolve(import.meta.dirname, "../../src");
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

  it("keeps the currency, and therefore the composed figure, inside the formatter", () => {
    const namesTheCurrency = [...sourceByPath]
      .filter(([, source]) =>
        /PRICE_BOOK_CURRENCY|["'`][^"'`]*MDL/.test(source),
      )
      .map(([path]) => path)
      .sort();

    expect(namesTheCurrency).toEqual([THE_FORMATTER]);
  });
});
