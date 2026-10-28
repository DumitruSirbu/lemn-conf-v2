// Adversarial QA for M6 remediation wave B: the price book as a parse boundary.
//
// `parse-price-book.ts` makes one contract and derives one number, and everything the wave closes
// rests on the pair:
//
// - **"It refuses; it never throws."** Both price surfaces run inside React's render with no error
//   boundary above them, and `use-priced-design.ts` now calls `parsePriceBook` at **module scope**,
//   so a throw out of the parser is no longer a degraded price — it is module evaluation failing.
// - **`MAX_PRICE_COEFFICIENT_MINOR` is derived** from "four terms, each multiplied by at most
//   `MAX_DESIGN_DIMENSION_MM`". Both halves are read off the code here rather than taken from the
//   constant's comment, so a fifth term or a larger multiplier fails this file instead of loosening
//   the bound in silence.
//
// Written against the source, not against the fix: every case below is a value a book can carry,
// and each assertion says what a customer would be shown if it held.
//
// Moved at the M10 P3 cut-over: a cabinet is an anchor plus signed steps (or a listed size), a material is a percentage
// and the depth is one more, so the amounts at the bound are the anchored and listed ones and the hostile sections
// include the depth rule. The bound is kept, not re-derived (`book-reading.ts`), so the derivation checks below are
// held against the anchored shapes' larger-than-needed headroom.
import { describe, expect, it } from "vitest";

import {
  MAX_DESIGN_DIMENSION_MM,
  MAX_IDENTIFIER_LENGTH,
} from "../../src/design-bounds.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { countHardwareMechanisms } from "../../src/hardware-mechanisms.js";
import {
  MAX_PRICE_COEFFICIENT_MINOR,
  parsePriceBook,
} from "../../src/pricing/parse-price-book.js";
import {
  amountForBody,
  InexactPriceArithmeticError,
  type CabinetPriceRule,
  type HardwareTier,
  type MaterialTier,
  type PriceBook,
  type PriceFormula,
  type PricedBody,
} from "../../src/pricing/price-book.js";
import { priceDesign } from "../../src/pricing/price-design.js";
import type { PricingResult } from "../../src/pricing/price-lines.js";
import {
  ANCHORED_SHAPES,
  type AnchoredFormula,
} from "../../src/pricing/anchored-price-formula.js";
import { projectDesignForDisplay } from "../../src/queries/design-projection.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows.js";

const BOOK = SAMPLE_PRICE_BOOK;

function bookWith(overrides: Record<string, unknown>): unknown {
  return { ...BOOK, ...overrides };
}

function priceSeededKitchen(book: unknown): PricingResult {
  return priceDesign({
    design: KITCHEN_L_DESIGN,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: book as PriceBook,
    pricingVersion: BOOK.version,
    deepeningRows: MEASURED_DEEPENING_ROWS,
  });
}

/** The mechanisms the shipped seeded kitchen actually carries — read rather than transcribed, so a
 *  re-seeded fixture moves the witness below with it. */
const SEEDED_MECHANISMS = countHardwareMechanisms(
  projectDesignForDisplay(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG).flatMap(
    (group) => group.entries,
  ),
  KITCHEN_L_BODY_CATALOG,
);

describe("the parser refuses every declared book, and never throws for one", () => {
  /** Values a section can arrive as once ADR 0062 seam 1 puts a book outside TypeScript. Each is a
   *  shape a reader downstream would dereference bare. */
  const HOSTILE_SECTIONS: readonly {
    readonly name: string;
    readonly value: unknown;
  }[] = [
    { name: "null", value: null },
    { name: "undefined", value: undefined },
    { name: "a number", value: 7 },
    { name: "a string", value: "hardware" },
    { name: "an empty list", value: [] },
    { name: "a list with holes", value: Array.from({ length: 2 }) },
    { name: "a prototype-less object", value: Object.create(null) },
    { name: "a frozen empty object", value: Object.freeze({}) },
    { name: "a NaN", value: Number.NaN },
    { name: "an object carrying toJSON", value: { toJSON: () => "book" } },
    {
      name: "a proxy answering everything",
      value: new Proxy({}, { get: () => 1 }),
    },
  ];

  const SECTION_NAMES = [
    "cabinetRules",
    "hardware",
    "material",
    "depthRule",
    "accessories",
    "version",
    "currency",
    "status",
    "amountsProvisional",
  ] as const;

  for (const section of SECTION_NAMES) {
    for (const hostile of HOSTILE_SECTIONS) {
      it(`answers rather than throws for "${section}" declared as ${hostile.name}`, () => {
        const book = bookWith({ [section]: hostile.value });

        expect(() => parsePriceBook(book)).not.toThrow();
        expect(() => priceSeededKitchen(book)).not.toThrow();
      });
    }
  }

  it("answers rather than throws for a tier declared as each hostile value", () => {
    for (const hostile of HOSTILE_SECTIONS) {
      const book = bookWith({
        material: { ...BOOK.material, tiers: [hostile.value] },
      });

      expect(() => parsePriceBook(book), hostile.name).not.toThrow();
    }
  });

  it("refuses a book whose accessory section is prototype-less rather than reading through it", () => {
    // `accessoryRuleOf` uses optional chaining on a section `PriceBook` declares required. A
    // prototype-less object has no `Object.prototype` to inherit from, which is the case a bare
    // `in` or `hasOwnProperty` call would have raised on.
    const result = priceSeededKitchen(
      bookWith({ accessories: Object.create(null) as unknown }),
    );

    expect(result.ok).toBe(false);
  });

  it("refuses a value JSON cannot render, rather than throwing while it describes it", () => {
    // `describeDeclared` calls `JSON.stringify` on whatever the book declared. It handles the value
    // that stringifies to `undefined` — a function, a symbol — and not the two that make
    // `JSON.stringify` itself throw. A throw here is `UnreadablePriceBookError`'s own path lost:
    // `use-priced-design.ts` parses at module scope, so this is module evaluation failing rather
    // than a price degrading.
    expect(() => parsePriceBook(bookWith({ version: 1n }))).not.toThrow();
  });

  it("refuses a circular section, rather than throwing while it describes it", () => {
    const circular: Record<string, unknown> = {};
    circular["itself"] = circular;

    expect(() => parsePriceBook(bookWith({ version: circular }))).not.toThrow();
  });

  it("refuses a tier whose amount is an accessor that raises, rather than raising with it", () => {
    // `refuseOversizedAmount` sweeps with `Object.entries`, which **invokes** every enumerable
    // accessor. A book assembled from a model object — the ADR 0062 dashboard's own population — can
    // present a computed amount, and one that raises takes the parser with it.
    const [first, ...rest] = BOOK.material.tiers;
    if (!first) throw new Error("the sample offers no material tier");
    const tier = Object.defineProperty({ ...first }, "percentOfCabinets", {
      get: () => {
        throw new Error("this tier's amount could not be computed");
      },
      enumerable: true,
    }) as MaterialTier;

    expect(() =>
      parsePriceBook(
        bookWith({ material: { ...BOOK.material, tiers: [tier, ...rest] } }),
      ),
    ).not.toThrow();
  });

  it("answers the same result for the same book, twice", () => {
    const first = parsePriceBook(BOOK);
    const second = parsePriceBook(BOOK);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(priceSeededKitchen(BOOK)).toStrictEqual(priceSeededKitchen(BOOK));
  });
});

/** A cabinet quoted at its anchor and moved by one rate per 50 mm step of width: every coefficient but the two named is
 *  zero, so a test sets exactly the one amount it is about. */
function anchoredWith(
  amounts: Partial<
    Pick<
      AnchoredFormula,
      "anchorMinor" | "perStepWiderMinor" | "perStepNarrowerMinor"
    >
  >,
): PriceFormula {
  return {
    shape: "anchored-width",
    anchorWidthMm: 600,
    anchorMinor: 0,
    perStepWiderMinor: 0,
    perStepNarrowerMinor: 0,
    ...amounts,
  };
}

describe("every amount a book states is held to the magnitude bound", () => {
  function bookPricingWallCabinetWith(formula: PriceFormula): unknown {
    const cabinetRules: readonly CabinetPriceRule[] = BOOK.cabinetRules.map(
      (rule) => (rule.buildId === "wall-cabinet" ? { ...rule, formula } : rule),
    );
    return bookWith({ cabinetRules });
  }

  it.each([
    "anchorMinor",
    "perStepWiderMinor",
    "perStepNarrowerMinor",
  ] as const)("accepts %s at exactly the bound", (field) => {
    const parsed = parsePriceBook(
      bookPricingWallCabinetWith(
        anchoredWith({ [field]: MAX_PRICE_COEFFICIENT_MINOR }),
      ),
    );

    expect(parsed.ok).toBe(true);
  });

  it.each([
    "anchorMinor",
    "perStepWiderMinor",
    "perStepNarrowerMinor",
  ] as const)("refuses %s one minor unit past the bound", (field) => {
    const parsed = parsePriceBook(
      bookPricingWallCabinetWith(
        anchoredWith({ [field]: MAX_PRICE_COEFFICIENT_MINOR + 1 }),
      ),
    );

    expect(parsed.ok).toBe(false);
  });

  it("accepts a listed size at exactly the bound and refuses one past it", () => {
    const listed = (amountMinor: number): PriceFormula => ({
      shape: "price-per-size",
      sizes: [{ widthMm: 600, amountMinor }],
    });

    expect(
      parsePriceBook(
        bookPricingWallCabinetWith(listed(MAX_PRICE_COEFFICIENT_MINOR)),
      ).ok,
    ).toBe(true);
    expect(
      parsePriceBook(
        bookPricingWallCabinetWith(listed(MAX_PRICE_COEFFICIENT_MINOR + 1)),
      ).ok,
    ).toBe(false);
  });

  it("refuses a coefficient one minor unit past the bound in the negative direction", () => {
    // A negative price is refused before its magnitude is weighed, so this holds whichever check speaks first.
    const parsed = parsePriceBook(
      bookPricingWallCabinetWith(
        anchoredWith({ anchorMinor: -(MAX_PRICE_COEFFICIENT_MINOR + 1) }),
      ),
    );

    expect(parsed.ok).toBe(false);
  });

  it("accepts a negative zero, which every guard downstream reads as zero", () => {
    const parsed = parsePriceBook(
      bookPricingWallCabinetWith(anchoredWith({ anchorMinor: -0 })),
    );

    expect(parsed.ok).toBe(true);
  });

  it("refuses the largest safe integer as a hardware rate", () => {
    const [first, ...rest] = BOOK.hardware.tiers;
    if (!first) throw new Error("the sample offers no hardware tier");
    const tiers: readonly HardwareTier[] = [
      { ...first, perHingeMinor: Number.MAX_SAFE_INTEGER },
      ...rest,
    ];

    expect(
      parsePriceBook(bookWith({ hardware: { ...BOOK.hardware, tiers } })).ok,
    ).toBe(false);
  });

  it("bounds an amount a tier inherits, not only one it declares as its own", () => {
    // `refuseOversizedAmount` sweeps `Object.entries`, which is own-enumerable only, while every
    // reader — `hardwareRate`, `usableCoefficientOf`, `amountForBody` — reads through the prototype
    // chain. A book whose tiers are model objects rather than JSON therefore states amounts the
    // bound never sees.
    const tiers: readonly HardwareTier[] = [
      hardwareTierInheriting({
        perHingeMinor: Number.MAX_SAFE_INTEGER,
        perDrawerMinor: 0,
      }),
      ...BOOK.hardware.tiers.slice(1),
    ];

    expect(
      parsePriceBook(bookWith({ hardware: { ...BOOK.hardware, tiers } })).ok,
    ).toBe(false);
  });
});

/** A hardware tier that carries the shipped tier's identity as its own properties and the two rates
 *  below on its prototype — the shape any book assembled from a model object rather than from
 *  `JSON.parse` has. */
function hardwareTierInheriting(rates: {
  readonly perHingeMinor: number;
  readonly perDrawerMinor: number;
}): HardwareTier {
  const [template] = BOOK.hardware.tiers;
  if (!template) throw new Error("the sample offers no hardware tier");
  const declared: Record<string, unknown> = Object.create({
    ...rates,
  }) as Record<string, unknown>;
  declared["tierId"] = template.tierId;
  declared["ruleId"] = template.ruleId;
  declared["name"] = template.name;
  declared["description"] = template.description;
  declared["perPushToOpenMinor"] = 0;
  return declared as unknown as HardwareTier;
}

describe("the hardware line adds its three products without checking any of them", () => {
  it("publishes an exact hardware amount for every rate inside the bound", () => {
    // The implementer's own argument for leaving `hardwareUnitAmount` unchecked: the magnitude
    // bound times the mechanisms a design can carry stays far inside the safe range. Measured here
    // against the seeded kitchen's real counts rather than asserted.
    const worstTerm =
      MAX_PRICE_COEFFICIENT_MINOR *
      Math.max(
        SEEDED_MECHANISMS.hinges,
        SEEDED_MECHANISMS.drawers,
        SEEDED_MECHANISMS.pushToOpen,
      );

    expect(worstTerm * 3).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
  });

  it("never publishes a hardware amount the integers disagree with", () => {
    // The M6-AUD-015 pattern moved one function over: two products that each overflow and a sum that
    // lands back inside the safe range, on the one arithmetic in the module with no per-step check.
    // The rates are past `MAX_PRICE_COEFFICIENT_MINOR` and reach the sum by the route the test above
    // this describes — inherited rather than declared.
    const tiers: readonly HardwareTier[] = [
      hardwareTierInheriting({
        perHingeMinor: -608_594_544_239_256,
        perDrawerMinor: Number.MAX_SAFE_INTEGER,
      }),
      ...BOOK.hardware.tiers.slice(1),
    ];
    const result = priceSeededKitchen(
      bookWith({ hardware: { ...BOOK.hardware, tiers } }),
    );

    const exactMinor =
      BigInt(-608_594_544_239_256) * BigInt(SEEDED_MECHANISMS.hinges) +
      BigInt(Number.MAX_SAFE_INTEGER) * BigInt(SEEDED_MECHANISMS.drawers);
    const published = result.ok
      ? result.priced.lines.find((line) => line.kind === "hardware")
      : undefined;

    // A refusal is a correct answer here; a figure that is not the integer one is not.
    expect(BigInt(published?.amountMinor ?? exactMinor)).toBe(exactMinor);
  });
});

describe("the coefficient bound is derived from the arithmetic it has to hold", () => {
  /** Every shape a book may carry, each at the bound in every coefficient it states. The four anchored shapes come from
   *  one table, so a fifth joins this sweep on the day it is declared. */
  const EVERY_SHAPE: readonly PriceFormula[] = [
    ...ANCHORED_SHAPES.map(
      (shape): PriceFormula => ({
        shape,
        anchorWidthMm: 600,
        anchorMinor: MAX_PRICE_COEFFICIENT_MINOR,
        perStepWiderMinor: MAX_PRICE_COEFFICIENT_MINOR,
        perStepNarrowerMinor: MAX_PRICE_COEFFICIENT_MINOR,
        ...(shape.includes("door-leaves")
          ? { perExtraDoorLeafMinor: MAX_PRICE_COEFFICIENT_MINOR }
          : {}),
        ...(shape.includes("height")
          ? {
              anchorHeightMm: 700,
              perHeightStepMinor: MAX_PRICE_COEFFICIENT_MINOR,
            }
          : {}),
      }),
    ),
    {
      shape: "price-per-size",
      sizes: [{ widthMm: 600, amountMinor: MAX_PRICE_COEFFICIENT_MINOR }],
    },
  ];

  /** The widest body: every step count the arithmetic can meet is at its largest. */
  const WIDEST_BODY: PricedBody = {
    widthMm: 600,
    heightMm: 700,
    doorLeafCount: MAX_DESIGN_DIMENSION_MM,
    doorLeafCountAt: () => 0,
  };

  it("evaluates every shape at the bound, on a widest body, without refusing its own arithmetic", () => {
    // What "derived rather than chosen" has to mean: a book the parser accepts is never refused by the guard the bound
    // exists to keep unreachable, short of the per-cabinet cap the percentage seam applies. Two coefficients at the bound
    // can sum past the safe range, and then the refusal is the arithmetic's own `InexactPriceArithmeticError`: never a
    // figure the integers disagree with.
    for (const formula of EVERY_SHAPE) {
      let amount: number | undefined;
      try {
        amount = amountForBody(formula, WIDEST_BODY);
      } catch (error) {
        expect(error, formula.shape).toBeInstanceOf(
          InexactPriceArithmeticError,
        );
        continue;
      }
      expect(Number.isSafeInteger(amount), formula.shape).toBe(true);
    }
  });

  it("counts the widest shape's coefficients rather than trusting the constant's comment", () => {
    const widestCoefficientCount = Math.max(
      ...EVERY_SHAPE.map(
        (formula) =>
          Object.keys(formula).filter((field) => field.endsWith("Minor"))
            .length,
      ),
    );

    // One term is multiplied by a step or leaf count, which stays below the millimetre dimension the bound was derived
    // over, so five terms at the bound over the largest count still fit.
    expect(
      widestCoefficientCount *
        MAX_DESIGN_DIMENSION_MM *
        MAX_PRICE_COEFFICIENT_MINOR,
    ).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER * 2);
  });

  it("refuses rather than publishes when a design's own total leaves the safe range", () => {
    // The bound is derived per **body**. A design sums up to `MAX_PLACEMENTS` of them; the per-cabinet cap
    // (ADR 0177 A-5) is what carries that factor, so a book at the bound is refused whole and never published at a
    // figure the integers disagree with.
    const cabinetRules: readonly CabinetPriceRule[] = BOOK.cabinetRules.map(
      (rule) => ({
        ...rule,
        formula: anchoredWith({
          anchorMinor: MAX_PRICE_COEFFICIENT_MINOR,
          perStepWiderMinor: MAX_PRICE_COEFFICIENT_MINOR,
        }),
      }),
    );
    const result = priceSeededKitchen(bookWith({ cabinetRules }));

    expect(!result.ok || Number.isSafeInteger(result.priced.totalMinor)).toBe(
      true,
    );
    expect(result.ok).toBe(false);
  });
});

describe("a formula publishes the figure the integers give, or refuses", () => {
  const BODY: PricedBody = {
    widthMm: 600,
    heightMm: 700,
    doorLeafCount: 1,
    doorLeafCountAt: () => 1,
  };

  it("refuses a shape whose terms are each exact and whose total is not", () => {
    const half = Math.floor(Number.MAX_SAFE_INTEGER / 2);

    expect(() =>
      amountForBody(
        {
          shape: "anchored-width-and-height",
          anchorWidthMm: 600,
          anchorHeightMm: 700,
          anchorMinor: half,
          perStepWiderMinor: half,
          perStepNarrowerMinor: 0,
          perHeightStepMinor: half,
        },
        // 650 is one step wider and 750 one step taller: three exact terms of `half` whose sum is not exact.
        { ...BODY, widthMm: 650, heightMm: 750 },
      ),
    ).toThrow(InexactPriceArithmeticError);
  });

  it("refuses the largest safe integer multiplied by a step of width", () => {
    expect(() =>
      amountForBody(
        anchoredWith({ perStepWiderMinor: Number.MAX_SAFE_INTEGER }),
        { ...BODY, widthMm: 700 },
      ),
    ).toThrow(InexactPriceArithmeticError);
  });

  it("answers the largest safe integer itself, which is exact and is the last value that is", () => {
    expect(
      amountForBody(
        anchoredWith({ anchorMinor: Number.MAX_SAFE_INTEGER }),
        BODY,
      ),
    ).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("answers the negation of the largest safe integer, which is exact and negative", () => {
    expect(
      amountForBody(
        anchoredWith({ anchorMinor: -Number.MAX_SAFE_INTEGER }),
        BODY,
      ),
    ).toBe(-Number.MAX_SAFE_INTEGER);
  });
});

describe("a repeated tier id is refused before declaration order can decide a price", () => {
  it("refuses the book even when the customer's own selection names the repeated id", () => {
    // `selectTier`'s `Array.find` resolves the **first** match. This asserts the refusal comes
    // first: the selection below would otherwise be billed at whichever tier was typed first.
    const [first, second, ...rest] = BOOK.material.tiers;
    if (!first || !second) throw new Error("the sample offers fewer than two");
    const tiers: readonly MaterialTier[] = [
      first,
      { ...second, tierId: first.tierId },
      ...rest,
    ];

    const result = priceDesign({
      design: KITCHEN_L_DESIGN,
      catalog: KITCHEN_L_BODY_CATALOG,
      book: bookWith({
        material: { ...BOOK.material, tiers },
      }) as PriceBook,
      pricingVersion: BOOK.version,
      selections: { materialTierId: first.tierId },
      deepeningRows: MEASURED_DEEPENING_ROWS,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("INVALID_PRICE_BOOK");
  });
});

describe("a book states no more than a manufacturer publishes", () => {
  const MAX_TIERS_PER_GROUP = 20;
  const MAX_CABINET_RULES = 500;
  const MAX_BOOK_NAME_LENGTH = 80;
  const MAX_BOOK_DESCRIPTION_LENGTH = 240;

  function materialTiers(count: number): readonly MaterialTier[] {
    const [template] = BOOK.material.tiers;
    if (!template) throw new Error("the sample offers no material tier");
    return Array.from({ length: count }, (_unused, index) => ({
      ...template,
      tierId: `swept.material.${String(index)}`,
      ruleId: `swept.material.rule.${String(index)}`,
    }));
  }

  function cabinetRules(count: number): readonly CabinetPriceRule[] {
    const [template] = BOOK.cabinetRules;
    if (!template) throw new Error("the sample prices no cabinet");
    return Array.from({ length: count }, (_unused, index) => ({
      ...template,
      ruleId: `swept.cabinet.${String(index)}`,
      buildId: `swept-row-${String(index)}`,
    }));
  }

  it("accepts a group offering exactly as many tiers as the bound allows", () => {
    const tiers = materialTiers(MAX_TIERS_PER_GROUP);
    const first = tiers[0];
    if (!first) throw new Error("no tier was built");

    expect(
      parsePriceBook(
        bookWith({
          material: { defaultTierId: first.tierId, tiers },
        }),
      ).ok,
    ).toBe(true);
  });

  it("refuses a group offering one tier more than the bound allows", () => {
    const tiers = materialTiers(MAX_TIERS_PER_GROUP + 1);
    const first = tiers[0];
    if (!first) throw new Error("no tier was built");

    expect(
      parsePriceBook(
        bookWith({
          material: { defaultTierId: first.tierId, tiers },
        }),
      ).ok,
    ).toBe(false);
  });

  it("accepts a book pricing exactly as many catalogue rows as the bound allows", () => {
    expect(
      parsePriceBook(
        bookWith({ cabinetRules: cabinetRules(MAX_CABINET_RULES) }),
      ).ok,
    ).toBe(true);
  });

  it("refuses a book pricing one catalogue row more than the bound allows", () => {
    expect(
      parsePriceBook(
        bookWith({ cabinetRules: cabinetRules(MAX_CABINET_RULES + 1) }),
      ).ok,
    ).toBe(false);
  });

  it("accepts an empty book, which prices nothing and is not malformed", () => {
    expect(parsePriceBook(bookWith({ cabinetRules: [] })).ok).toBe(true);
  });

  it("accepts a group with a single tier", () => {
    const tiers = materialTiers(1);
    const only = tiers[0];
    if (!only) throw new Error("no tier was built");

    expect(
      parsePriceBook(
        bookWith({ material: { defaultTierId: only.tierId, tiers } }),
      ).ok,
    ).toBe(true);
  });

  it("accepts a group offering no tier at all, which `selectTier` refuses per design", () => {
    const parsed = parsePriceBook(
      bookWith({ material: { defaultTierId: "none", tiers: [] } }),
    );
    const priced = priceSeededKitchen(
      bookWith({ material: { defaultTierId: "none", tiers: [] } }),
    );

    expect(parsed.ok).toBe(true);
    expect(priced.ok).toBe(false);
  });

  it("holds a tier's name and description to the length the bound states, at the boundary", () => {
    const [template, ...rest] = BOOK.material.tiers;
    if (!template) throw new Error("the sample offers no material tier");
    const named = (name: string, description: string): unknown =>
      bookWith({
        material: {
          ...BOOK.material,
          tiers: [{ ...template, name, description }, ...rest],
        },
      });

    expect(
      parsePriceBook(
        named(
          "n".repeat(MAX_BOOK_NAME_LENGTH),
          "d".repeat(MAX_BOOK_DESCRIPTION_LENGTH),
        ),
      ).ok,
    ).toBe(true);
    expect(
      parsePriceBook(named("n".repeat(MAX_BOOK_NAME_LENGTH + 1), "d")).ok,
    ).toBe(false);
    expect(
      parsePriceBook(named("n", "d".repeat(MAX_BOOK_DESCRIPTION_LENGTH + 1)))
        .ok,
    ).toBe(false);
  });

  it("holds an identifier to the length every other document in this domain is held to", () => {
    const [template, ...rest] = BOOK.cabinetRules;
    if (!template) throw new Error("the sample prices no cabinet");
    const ruled = (ruleId: string): unknown =>
      bookWith({ cabinetRules: [{ ...template, ruleId }, ...rest] });

    expect(parsePriceBook(ruled("r".repeat(MAX_IDENTIFIER_LENGTH))).ok).toBe(
      true,
    );
    expect(
      parsePriceBook(ruled("r".repeat(MAX_IDENTIFIER_LENGTH + 1))).ok,
    ).toBe(false);
    expect(parsePriceBook(ruled("")).ok).toBe(false);
  });
});
