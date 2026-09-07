// Wave 6-B of the M6 audit remediation: the price book as a trusted-only-after-parsing boundary.
//
// ADR 0062 seam 1 makes a book *versioned data assembled outside TypeScript*, and until this wave
// nothing held one to its declared shape at runtime. Four findings shared that root cause, and each
// one below is the audit's own reproduction rather than a case invented around the fix:
//
// - **M6-AUD-002** — `refuseUnusableBook` threw a `TypeError` from inside the function whose whole
//   job is to reject malformed books, because `listRuleIds` dereferenced three sections bare.
// - **M6-AUD-003** — two tiers sharing an id resolved on `Array.find`, so a price depended on the
//   book's declaration order.
// - **M6-AUD-010** — no bound on any list or string a book states.
// - **M6-AUD-015** — coefficients each a safe integer whose products cancel to the wrong figure, and
//   `Number.isSafeInteger(0)` accepting it.
//
// **Read with `price-design.test.ts`, which covers what a well-formed book prices.** This file
// covers what an ill-formed one does instead, and it asserts refusals rather than exceptions
// throughout: both price surfaces run inside React's render and there is no error boundary above
// them.
import { describe, expect, it } from "vitest";

import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import {
  MAX_PRICE_COEFFICIENT_MINOR,
  parsePriceBook,
} from "../../src/pricing/parse-price-book.js";
import {
  amountForBody,
  InexactPriceArithmeticError,
  pricedByWidthHeightAndDoorLeaves,
  type CabinetPriceRule,
  type HardwareTier,
  type MaterialTier,
  type PriceBook,
} from "../../src/pricing/price-book.js";
import { priceDesign } from "../../src/pricing/price-design.js";
import type { PricingFailure } from "../../src/pricing/price-lines.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";

const BOOK = SAMPLE_PRICE_BOOK;

/** The seeded kitchen, priced against whatever book is handed in. Every malformed book below is
 *  refused before a placement is read, so the design is a constant and never the variable. */
function refusalFrom(book: unknown): PricingFailure {
  const result = priceDesign({
    design: KITCHEN_L_DESIGN,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: book as PriceBook,
    pricingVersion: BOOK.version,
  });
  if (result.ok) throw new Error("the book was expected to be refused");
  return result.failure;
}

function bookWith(overrides: Partial<Record<string, unknown>>): unknown {
  return { ...BOOK, ...overrides };
}

describe("the book this build ships parses", () => {
  it("reads the sample book and hands back the very object it was given", () => {
    // Not a copy: a parser that rebuilt the book could default a field its author left out, and
    // defaulting a price is this module deciding one.
    const parsed = parsePriceBook(BOOK);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.book).toBe(BOOK);
  });
});

describe("a malformed book is refused, never thrown from (M6-AUD-002)", () => {
  /** The four reproductions the audit recorded, each of which used to reach `listRuleIds` and raise
   *  a `TypeError` naming a property rather than a book. */
  const AUDIT_REPRODUCTIONS: readonly {
    readonly name: string;
    readonly book: unknown;
  }[] = [
    { name: "hardware missing", book: bookWith({ hardware: undefined }) },
    {
      name: "hardware tiers null",
      book: bookWith({ hardware: { ...BOOK.hardware, tiers: null } }),
    },
    { name: "cabinet rules null", book: bookWith({ cabinetRules: null }) },
    {
      name: "null hardware tier",
      book: bookWith({
        hardware: { ...BOOK.hardware, tiers: [null, ...BOOK.hardware.tiers] },
      }),
    },
  ];

  for (const reproduction of AUDIT_REPRODUCTIONS) {
    it(`refuses "${reproduction.name}" with a code instead of raising`, () => {
      expect(() => refusalFrom(reproduction.book)).not.toThrow();
      expect(refusalFrom(reproduction.book).code).toBe("INVALID_PRICE_BOOK");
    });
  }

  it("refuses a book that is not an object at all", () => {
    for (const notABook of [undefined, null, "sample-2026-09", 7, []]) {
      expect(parsePriceBook(notABook).ok, JSON.stringify(notABook)).toBe(false);
    }
  });

  it("refuses a book whose every trap raises, which is what the backstop is for", () => {
    // The named guards below cover the values a book plausibly carries — a BigInt, a circular
    // member, an accessor that raises. This is the case none of them reaches: a section that raises
    // from the *enumeration* and the *read* and the ownership test alike. The claim in this module's
    // header is about every input, so it has to hold for one nobody predicted — and at module scope
    // the cost of being wrong once is the whole application failing to load.
    const hostile = new Proxy(
      {},
      {
        get: () => {
          throw new Error("nothing here may be read");
        },
        has: () => {
          throw new Error("nothing here may be asked about");
        },
        ownKeys: () => {
          throw new Error("nothing here may be listed");
        },
      },
    );

    expect(() => parsePriceBook(hostile)).not.toThrow();
    expect(parsePriceBook(hostile).ok).toBe(false);
    expect(() => parsePriceBook(bookWith({ hardware: hostile }))).not.toThrow();
  });
});

describe("an id names one thing (M6-AUD-003)", () => {
  it("refuses a tier id repeated across the two groups, naming it", () => {
    // The witness the audit measured: a hardware tier id equal to a material one made the flattened
    // delta map answer 6 197,60 for an 18 000 MDL veneer upgrade. `selectTier`'s `Array.find` is the
    // other half — it would resolve whichever of the two was typed first.
    const collidedTierId = BOOK.material.tiers[2]?.tierId ?? "";
    const hardwareTiers: readonly HardwareTier[] = BOOK.hardware.tiers.map(
      (tier, index) =>
        index === 1 ? { ...tier, tierId: collidedTierId } : tier,
    );

    expect(
      refusalFrom(
        bookWith({ hardware: { ...BOOK.hardware, tiers: hardwareTiers } }),
      ),
    ).toMatchObject({ code: "INVALID_PRICE_BOOK", id: collidedTierId });
  });

  it("refuses a tier id repeated inside one group", () => {
    const [first, second, ...rest] = BOOK.material.tiers;
    if (!first || !second) throw new Error("the sample offers fewer than two");
    const tiers: readonly MaterialTier[] = [
      first,
      { ...second, tierId: first.tierId },
      ...rest,
    ];

    expect(
      refusalFrom(bookWith({ material: { ...BOOK.material, tiers } })),
    ).toMatchObject({ code: "INVALID_PRICE_BOOK", id: first.tierId });
  });
});

describe("a book states a commercially realistic amount of data (M6-AUD-010)", () => {
  it("refuses a group offering more tiers than a settings sheet is a list of", () => {
    // 1 000 tiers per group is ~200 ms of synchronous work and then 2 000 radios for React to
    // render, on a book nobody in the product could have authored.
    const [template] = BOOK.material.tiers;
    if (!template) throw new Error("the sample offers no material tier");
    const tiers = Array.from({ length: 1_000 }, (_, index) => ({
      ...template,
      tierId: `material.${String(index)}`,
      ruleId: `material.rule.${String(index)}`,
    }));

    expect(
      refusalFrom(bookWith({ material: { ...BOOK.material, tiers } })).code,
    ).toBe("INVALID_PRICE_BOOK");
  });

  it("refuses a book pricing more catalogue rows than a manufacturer publishes", () => {
    const [template] = BOOK.cabinetRules;
    if (!template) throw new Error("the sample prices no cabinet");
    const cabinetRules: readonly CabinetPriceRule[] = Array.from(
      { length: 1_000 },
      (_, index) => ({
        ...template,
        ruleId: `cabinet.${String(index)}`,
        buildId: `row-${String(index)}`,
      }),
    );

    expect(refusalFrom(bookWith({ cabinetRules })).code).toBe(
      "INVALID_PRICE_BOOK",
    );
  });

  it("refuses a tier whose rendered words are longer than a line", () => {
    const [first, ...rest] = BOOK.material.tiers;
    if (!first) throw new Error("the sample offers no material tier");
    const tiers = [{ ...first, description: "x".repeat(10_000) }, ...rest];

    expect(
      refusalFrom(bookWith({ material: { ...BOOK.material, tiers } })).code,
    ).toBe("INVALID_PRICE_BOOK");
  });

  it("refuses an unbounded rule id, which is a free multiplier on every refusal message", () => {
    const [first, ...rest] = BOOK.cabinetRules;
    if (!first) throw new Error("the sample prices no cabinet");

    expect(
      refusalFrom(
        bookWith({
          cabinetRules: [{ ...first, ruleId: "r".repeat(5_000) }, ...rest],
        }),
      ).code,
    ).toBe("INVALID_PRICE_BOOK");
  });
});

/**
 * **The arithmetic, in the two layers M6-AUD-015 asks for.**
 *
 * The coefficients below are the audit's own: on the real `wall-cabinet` rule path with a 600 × 700
 * body they cancel exactly in integer arithmetic and leave the 1-unit base, and in floating point
 * the base is lost during the addition and the cancellation yields `0` — which
 * `Number.isSafeInteger` accepts, so both the line and the total validated a wrong amount.
 */
describe("no intermediate can be inexact (M6-AUD-015)", () => {
  const CANCELLING = {
    baseMinor: 1,
    perWidthMillimetreMinor: 9_007_199_254_740_988,
    perHeightMillimetreMinor: -7_720_456_504_063_704,
    perDoorLeafMinor: 0,
  } as const;
  const BODY = { widthMm: 600, heightMm: 700, doorLeafCount: 1 };

  it("still reproduces the witness in plain JavaScript, so the fix is not guarding a phantom", () => {
    const naive =
      CANCELLING.baseMinor +
      CANCELLING.perWidthMillimetreMinor * BODY.widthMm +
      CANCELLING.perHeightMillimetreMinor * BODY.heightMm;

    expect(naive).toBe(0);
    expect(Number.isSafeInteger(naive)).toBe(true);
  });

  it("refuses the arithmetic rather than publishing the figure it cancels to", () => {
    // The second layer, exercised where the first cannot reach it: `amountForBody` takes a formula
    // and not a book, so this is what a loosened bound would still meet.
    expect(() =>
      amountForBody(pricedByWidthHeightAndDoorLeaves(CANCELLING), BODY),
    ).toThrow(InexactPriceArithmeticError);
  });

  it("refuses the book that declares them, before any arithmetic is attempted", () => {
    const cabinetRules: readonly CabinetPriceRule[] = BOOK.cabinetRules.map(
      (rule) =>
        rule.buildId === "wall-cabinet"
          ? { ...rule, formula: pricedByWidthHeightAndDoorLeaves(CANCELLING) }
          : rule,
    );

    expect(refusalFrom(bookWith({ cabinetRules })).code).toBe(
      "INVALID_PRICE_BOOK",
    );
  });

  it("bounds coefficients so that every term and every partial sum stays exact", () => {
    expect(MAX_PRICE_COEFFICIENT_MINOR * 4 * 10_000).toBeLessThanOrEqual(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it("leaves a negative coefficient inside the bound permitted, which is an unruled question", () => {
    // Whether a negative coefficient is commercially legal is an owner ruling nobody has made. The
    // parser bounds magnitude and says nothing about sign; `refuseNegativeAmount` refuses the
    // published *line*, which is where the question actually is.
    const parsed = parsePriceBook(
      bookWith({
        cabinetRules: BOOK.cabinetRules.map((rule) =>
          rule.buildId === "wall-cabinet"
            ? {
                ...rule,
                formula: pricedByWidthHeightAndDoorLeaves({
                  baseMinor: 120_000,
                  perWidthMillimetreMinor: 400,
                  perHeightMillimetreMinor: -1,
                  perDoorLeafMinor: 18_000,
                }),
              }
            : rule,
        ),
      }),
    );

    expect(parsed.ok).toBe(true);
  });
});
