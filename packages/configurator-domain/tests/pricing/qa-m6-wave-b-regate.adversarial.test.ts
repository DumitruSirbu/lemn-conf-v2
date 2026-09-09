// Adversarial QA for M6 remediation wave B, second pass: the five findings the wave closed, and what
// the closing changed.
//
// The fixes are structural rather than local — one exported `exactAmountOfTerms` for both amounts, a
// `for…in` sweep in place of `Object.entries`, an `UNREADABLE` symbol, and `refuseAnythingRaised`
// around the whole parse — so this file attacks the structure rather than re-running the five. Read
// with `qa-m6-wave-b-parse-boundary.adversarial.test.ts`, which still holds the five themselves and
// is unchanged.
//
// Two claims are load-bearing and are asserted here rather than taken:
//
// - **The backstop is not doing the work.** `refuseAnythingRaised`'s own doc says a refusal wearing
//   its message is a defect in the parser rather than a fact about the book, so which refusals wear
//   it is a property worth measuring.
// - **`exactAmountOfTerms` refuses on the first step to leave the safe range**, which makes its
//   refusal order-dependent. The disclosure says only the message moves. It is more than that, and
//   what keeps it harmless is the magnitude bound rather than the arithmetic.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { MAX_DESIGN_DIMENSION_MM } from "../../src/design-bounds.js";
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
  exactAmountOfTerms,
  InexactPriceArithmeticError,
  pricedByWidth,
  pricedByWidthAndDoorLeaves,
  pricedByWidthAndHeight,
  pricedByWidthHeightAndDoorLeaves,
  type HardwareTier,
  type MaterialTier,
  type PriceBook,
  type PricedBody,
  type PriceFormula,
  type PricedTerm,
} from "../../src/pricing/price-book.js";
import { priceDesign } from "../../src/pricing/price-design.js";
import type { PricingResult } from "../../src/pricing/price-lines.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import { projectDesignForDisplay } from "../../src/queries/design-projection.js";

const BOOK = SAMPLE_PRICE_BOOK;

/** One seed for every sweep in this file, so a CI failure is reproducible from the file alone. */
const PROPERTY_SEED = 20_260_907;

/** The sentence `refuseAnythingRaised` answers with. Its own doc calls a refusal wearing it a defect
 *  in the parser, so it is quoted here rather than described. */
const BACKSTOP_DETAIL = "Reading the price book raised";

function bookWith(overrides: Record<string, unknown>): unknown {
  return { ...BOOK, ...overrides };
}

function priceSeededKitchen(book: unknown): PricingResult {
  return priceDesign({
    design: KITCHEN_L_DESIGN,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: book as PriceBook,
    pricingVersion: BOOK.version,
  });
}

/** How a refusal reads, or `"accepted"` where there was none. One spelling, so every case below
 *  compares the same thing. */
function refusalDetailOf(book: unknown): string {
  const result = priceSeededKitchen(book);
  return result.ok ? "accepted" : result.failure.detail;
}

/** A copy of `host` whose `field` raises when it is read — the accessor population the wave accepted
 *  as real when it fixed the tier-amount case. */
function raisingOn<THost extends object>(host: THost, field: string): THost {
  return Object.defineProperty({ ...host }, field, {
    get: () => {
      throw new Error("this field raised when it was read");
    },
    enumerable: true,
    configurable: true,
  });
}

const SEEDED_MECHANISMS = countHardwareMechanisms(
  projectDesignForDisplay(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG).flatMap(
    (group) => group.entries,
  ),
  KITCHEN_L_BODY_CATALOG,
);

describe("each closed finding is refused by its own guard, not by the backstop", () => {
  it("names the field for a value JSON cannot render", () => {
    const failure = parsePriceBook(bookWith({ version: 1n }));

    expect(failure.ok).toBe(false);
    if (failure.ok) return;
    expect(failure.failure.code).toBe("INVALID_PRICE_BOOK");
    expect(failure.failure.detail).toContain('Book declares no "version"');
    expect(failure.failure.detail).not.toContain(BACKSTOP_DETAIL);
  });

  it("names the field for a circular member", () => {
    const circular: Record<string, unknown> = {};
    circular["itself"] = circular;
    const failure = parsePriceBook(bookWith({ version: circular }));

    expect(failure.ok).toBe(false);
    if (failure.ok) return;
    expect(failure.failure.detail).toContain('Book declares no "version"');
    expect(failure.failure.detail).not.toContain(BACKSTOP_DETAIL);
  });

  it("names the tier and the amount for an accessor that raises", () => {
    const [first, ...rest] = BOOK.material.tiers;
    if (!first) throw new Error("the sample offers no material tier");
    const tiers = [raisingOn(first, "wholeKitchenMinor"), ...rest];

    const detail = refusalDetailOf(
      bookWith({ material: { ...BOOK.material, tiers } }),
    );

    expect(detail).toContain(`material tier "${first.tierId}"`);
    expect(detail).toContain('"wholeKitchenMinor"');
    expect(detail).not.toContain(BACKSTOP_DETAIL);
  });

  it("names the tier and the rate for an inherited amount past the bound", () => {
    const tiers = [
      hardwareTierInheriting({
        perHingeMinor: Number.MAX_SAFE_INTEGER,
        perDrawerMinor: 0,
      }),
      ...BOOK.hardware.tiers.slice(1),
    ];

    const detail = refusalDetailOf(
      bookWith({ hardware: { ...BOOK.hardware, tiers } }),
    );

    expect(detail).toContain('"perHingeMinor"');
    expect(detail).toContain(String(MAX_PRICE_COEFFICIENT_MINOR));
    expect(detail).not.toContain(BACKSTOP_DETAIL);
  });

  it("names the rate and the count for an arithmetic that cannot be done exactly", () => {
    // The wrong-money witness, delivered past the magnitude bound by the one route the sweep still
    // does not reach (below). What must never happen again is a figure; a named refusal is the
    // answer, and `exactAmountOfTerms` is the layer that gives it.
    const detail = refusalDetailOf(
      bookWith({
        hardware: {
          ...BOOK.hardware,
          tiers: [
            hardwareTierHiding({
              perHingeMinor: -608_594_544_239_256,
              perDrawerMinor: Number.MAX_SAFE_INTEGER,
            }),
            ...BOOK.hardware.tiers.slice(1),
          ],
        },
      }),
    );

    expect(detail).toContain('"perHingeMinor"');
    expect(detail).toContain(String(SEEDED_MECHANISMS.hinges));
    expect(detail).not.toContain(BACKSTOP_DETAIL);
  });
});

/** A hardware tier carrying the shipped tier's identity as its own properties and the two rates on
 *  its **prototype** — the shape a book assembled from a model object has, and the route the
 *  `for…in` sweep now reaches. */
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

/** The same tier with the two rates as **non-enumerable own** properties. `for…in` does not list
 *  them and `tier[field]` resolves them, so this is the amount a reader sees that the sweep does
 *  not. */
function hardwareTierHiding(rates: {
  readonly perHingeMinor: number;
  readonly perDrawerMinor: number;
}): HardwareTier {
  const [template] = BOOK.hardware.tiers;
  if (!template) throw new Error("the sample offers no hardware tier");
  const declared: Record<string, unknown> = {
    tierId: template.tierId,
    ruleId: template.ruleId,
    name: template.name,
    description: template.description,
    perPushToOpenMinor: 0,
  };
  for (const [field, minor] of Object.entries(rates)) {
    Object.defineProperty(declared, field, { value: minor, enumerable: false });
  }
  return declared as unknown as HardwareTier;
}

describe("the parse boundary names what it refused, whatever raised while reading it", () => {
  /** Every read the parser makes on a value the book supplies. The module's header says each one is
   *  guarded where it runs the foreign value; this is that claim, position by position. */
  const RAISING_READS: readonly {
    readonly name: string;
    readonly book: unknown;
  }[] = (() => {
    const [rule, ...rules] = BOOK.cabinetRules;
    const [tier, ...tiers] = BOOK.material.tiers;
    if (!rule || !tier) throw new Error("the sample is empty");
    const cover = BOOK.accessories.sinkProtectiveCover;
    return [
      ...["version", "currency", "status", "amountsProvisional"].map(
        (field) => ({ name: `book.${field}`, book: raisingOn(BOOK, field) }),
      ),
      ...["cabinetRules", "hardware", "material", "accessories"].map(
        (field) => ({ name: `book.${field}`, book: raisingOn(BOOK, field) }),
      ),
      ...["ruleId", "buildId", "formula"].map((field) => ({
        name: `cabinetRule.${field}`,
        book: bookWith({ cabinetRules: [raisingOn(rule, field), ...rules] }),
      })),
      ...["tierId", "ruleId", "name", "description"].map((field) => ({
        name: `materialTier.${field}`,
        book: bookWith({
          material: {
            ...BOOK.material,
            tiers: [raisingOn(tier, field), ...tiers],
          },
        }),
      })),
      ...["defaultTierId", "tiers"].map((field) => ({
        name: `material.${field}`,
        book: bookWith({ material: raisingOn(BOOK.material, field) }),
      })),
      ...["ruleId", "name", "description"].map((field) => ({
        name: `accessory.${field}`,
        book: bookWith({
          accessories: {
            ...BOOK.accessories,
            sinkProtectiveCover: raisingOn(cover, field),
          },
        }),
      })),
    ];
  })();

  for (const read of RAISING_READS) {
    it(`refuses without raising when ${read.name} raises`, () => {
      expect(() => parsePriceBook(read.book)).not.toThrow();
      expect(parsePriceBook(read.book).ok).toBe(false);
    });
  }

  it("names the field rather than falling to the backstop, at every one of those reads", () => {
    // `refuseAnythingRaised` exists for the value nobody predicted, and its own doc says a refusal
    // wearing its message is a parser defect. The amount sweep guards its reads through
    // `readDeclared`; every identifier, every rendered string and every section is still read bare,
    // so the book's author is told only that "none of it can be trusted".
    const backstopped = RAISING_READS.filter((read) =>
      refusalDetailOf(read.book).includes(BACKSTOP_DETAIL),
    ).map((read) => read.name);

    expect(backstopped).toEqual([]);
  });
});

describe("the amount sweep reaches what a reader reaches", () => {
  it("misses a rate declared as a non-enumerable own property", () => {
    // `for…in` matches a property read's reach through the **prototype chain** and not through
    // enumerability. `tier.perHingeMinor` resolves this; the sweep does not list it.
    const tiers = [
      hardwareTierHiding({
        perHingeMinor: Number.MAX_SAFE_INTEGER,
        perDrawerMinor: 0,
      }),
      ...BOOK.hardware.tiers.slice(1),
    ];

    expect(
      parsePriceBook(bookWith({ hardware: { ...BOOK.hardware, tiers } })).ok,
    ).toBe(true);
  });

  it("still publishes no figure for the rate it missed, because the arithmetic checks it", () => {
    // The second layer, reached exactly where the first cannot. This is what makes the miss above a
    // gap in the diagnosis rather than in the money.
    const result = priceSeededKitchen(
      bookWith({
        hardware: {
          ...BOOK.hardware,
          tiers: [
            hardwareTierHiding({
              perHingeMinor: -608_594_544_239_256,
              perDrawerMinor: Number.MAX_SAFE_INTEGER,
            }),
            ...BOOK.hardware.tiers.slice(1),
          ],
        },
      }),
    );

    const exactMinor =
      BigInt(-608_594_544_239_256) * BigInt(SEEDED_MECHANISMS.hinges) +
      BigInt(Number.MAX_SAFE_INTEGER) * BigInt(SEEDED_MECHANISMS.drawers);
    const published = result.ok
      ? result.priced.lines.find((line) => line.kind === "hardware")
      : undefined;

    expect(BigInt(published?.amountMinor ?? exactMinor)).toBe(exactMinor);
  });

  it("prices the shipped book even where something has polluted Object.prototype", () => {
    // The other half of the reach change: `for…in` walks the prototype chain, and the sweep is by
    // **kind** rather than by name — any number past the bound refuses the book, including one no
    // reader of a book ever reads. A polluted global therefore takes the price off every surface for
    // a book that is entirely well formed. `Object.entries` could not reach this.
    const objectPrototype = Object.prototype as unknown as Record<
      string,
      unknown
    >;
    let detail = "accepted";
    try {
      objectPrototype["injectedAmountMinor"] = Number.MAX_SAFE_INTEGER;
      detail = refusalDetailOf(BOOK);
    } finally {
      delete objectPrototype["injectedAmountMinor"];
    }

    expect(detail).toBe("accepted");
  });
});

describe("an amount that could not be read stays apart from one that was never declared", () => {
  it("refuses an absent tier amount as a malformed amount, naming nothing raised", () => {
    const [first, ...rest] = BOOK.material.tiers;
    if (!first) throw new Error("the sample offers no material tier");
    const withoutAmount: Record<string, unknown> = { ...first };
    delete withoutAmount["wholeKitchenMinor"];
    const tiers = [withoutAmount as unknown as MaterialTier, ...rest];

    const result = priceSeededKitchen(
      bookWith({ material: { ...BOOK.material, tiers } }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("INVALID_AMOUNT");
    expect(result.failure.detail).toContain("Found: nothing");
    expect(result.failure.detail).not.toContain("raised");
  });

  it("refuses an unreadable tier amount as a malformed book, naming that it raised", () => {
    const [first, ...rest] = BOOK.material.tiers;
    if (!first) throw new Error("the sample offers no material tier");
    const tiers = [raisingOn(first, "wholeKitchenMinor"), ...rest];

    const result = priceSeededKitchen(
      bookWith({ material: { ...BOOK.material, tiers } }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("INVALID_PRICE_BOOK");
    expect(result.failure.detail).toContain("raised when it was read");
  });

  it("never lets the unreadable marker itself reach a message", () => {
    // A symbol renders as `Symbol(unreadable book amount)` the moment anything interpolates it, and
    // a `PricingFailure` is logged and rendered.
    const [first, ...rest] = BOOK.material.tiers;
    if (!first) throw new Error("the sample offers no material tier");
    const details = ["wholeKitchenMinor", "name", "tierId"].map((field) =>
      refusalDetailOf(
        bookWith({
          material: {
            ...BOOK.material,
            tiers: [raisingOn(first, field), ...rest],
          },
        }),
      ),
    );

    for (const detail of details) expect(detail).not.toContain("Symbol(");
  });
});

describe("the base is charged exactly once, in every shape", () => {
  const BASE_MINOR = 123_456;
  const BODY: PricedBody = { widthMm: 600, heightMm: 700, doorLeafCount: 2 };

  const BASE_ONLY_SHAPES: readonly PriceFormula[] = [
    pricedByWidth({ baseMinor: BASE_MINOR, perWidthMillimetreMinor: 0 }),
    pricedByWidthAndDoorLeaves({
      baseMinor: BASE_MINOR,
      perWidthMillimetreMinor: 0,
      perDoorLeafMinor: 0,
    }),
    pricedByWidthAndHeight({
      baseMinor: BASE_MINOR,
      perWidthMillimetreMinor: 0,
      perHeightMillimetreMinor: 0,
    }),
    pricedByWidthHeightAndDoorLeaves({
      baseMinor: BASE_MINOR,
      perWidthMillimetreMinor: 0,
      perHeightMillimetreMinor: 0,
      perDoorLeafMinor: 0,
    }),
  ];

  it("prices a body at the base alone, neither twice nor not at all", () => {
    for (const formula of BASE_ONLY_SHAPES) {
      expect(amountForBody(formula, BODY), formula.shape).toBe(BASE_MINOR);
    }
  });

  it("drops the base entirely when a book states it as zero", () => {
    expect(
      amountForBody(
        pricedByWidth({ baseMinor: 0, perWidthMillimetreMinor: 100 }),
        BODY,
      ),
    ).toBe(100 * BODY.widthMm);
  });

  const coefficient = fc.integer({
    min: -MAX_PRICE_COEFFICIENT_MINOR,
    max: MAX_PRICE_COEFFICIENT_MINOR,
  });
  const millimetres = fc.integer({ min: 0, max: MAX_DESIGN_DIMENSION_MM });

  propertyTest.prop(
    {
      baseMinor: coefficient,
      perWidthMillimetreMinor: coefficient,
      perHeightMillimetreMinor: coefficient,
      perDoorLeafMinor: coefficient,
      widthMm: millimetres,
      heightMm: millimetres,
      doorLeafCount: fc.integer({ min: 0, max: 8 }),
    },
    { seed: PROPERTY_SEED, numRuns: 1_000 },
  )(
    "gives every shape the integer sum of its own terms, over a swept range of coefficients",
    (swept) => {
      const body: PricedBody = {
        widthMm: swept.widthMm,
        heightMm: swept.heightMm,
        doorLeafCount: swept.doorLeafCount,
      };
      const base = BigInt(swept.baseMinor);
      const width =
        BigInt(swept.perWidthMillimetreMinor) * BigInt(body.widthMm);
      const height =
        BigInt(swept.perHeightMillimetreMinor) * BigInt(body.heightMm);
      const leaves =
        BigInt(swept.perDoorLeafMinor) * BigInt(body.doorLeafCount);

      expect(BigInt(amountForBody(pricedByWidth(swept), body) ?? 0)).toBe(
        base + width,
      );
      expect(
        BigInt(amountForBody(pricedByWidthAndDoorLeaves(swept), body) ?? 0),
      ).toBe(base + width + leaves);
      expect(
        BigInt(amountForBody(pricedByWidthAndHeight(swept), body) ?? 0),
      ).toBe(base + width + height);
      expect(
        BigInt(
          amountForBody(pricedByWidthHeightAndDoorLeaves(swept), body) ?? 0,
        ),
      ).toBe(base + width + height + leaves);
    },
  );
});

describe("the checked arithmetic refuses by order, and no accepted book can reach the difference", () => {
  function outcomeOf(terms: readonly PricedTerm[]): string {
    try {
      return `answered ${String(exactAmountOfTerms(terms))}`;
    } catch (error) {
      if (error instanceof InexactPriceArithmeticError) return "refused";
      throw error;
    }
  }

  it("accepts one ordering of the same terms and refuses another", () => {
    // The disclosure says a reordered term list refuses at a different term with a different
    // message. It does more than that: it decides whether there is a refusal at all. Recorded so the
    // argument that keeps it harmless is the magnitude bound below, and is not mistaken for the
    // arithmetic's own property.
    const half = 5_000_000_000_000_000;
    const rise: PricedTerm = {
      coefficientMinor: half,
      count: 1,
      field: "baseMinor",
    };
    const fall: PricedTerm = {
      coefficientMinor: -half,
      count: 1,
      field: "perWidthMillimetreMinor",
    };
    const again: PricedTerm = {
      coefficientMinor: half,
      count: 1,
      field: "perHeightMillimetreMinor",
    };

    expect(outcomeOf([rise, fall, again])).toBe(`answered ${String(half)}`);
    expect(outcomeOf([rise, again, fall])).toBe("refused");
  });

  const coefficient = fc.integer({
    min: -MAX_PRICE_COEFFICIENT_MINOR,
    max: MAX_PRICE_COEFFICIENT_MINOR,
  });
  const millimetres = fc.integer({ min: 0, max: MAX_DESIGN_DIMENSION_MM });

  propertyTest.prop(
    {
      baseMinor: coefficient,
      perWidthMillimetreMinor: coefficient,
      perHeightMillimetreMinor: coefficient,
      perDoorLeafMinor: coefficient,
      widthMm: millimetres,
      heightMm: millimetres,
      doorLeafCount: fc.integer({ min: 0, max: 8 }),
    },
    { seed: PROPERTY_SEED, numRuns: 500 },
  )(
    "answers alike under every ordering of a term list the parser would accept",
    (swept) => {
      const terms: readonly PricedTerm[] = [
        {
          coefficientMinor: swept.baseMinor,
          count: 1,
          field: "baseMinor",
        },
        {
          coefficientMinor: swept.perWidthMillimetreMinor,
          count: swept.widthMm,
          field: "perWidthMillimetreMinor",
        },
        {
          coefficientMinor: swept.perHeightMillimetreMinor,
          count: swept.heightMm,
          field: "perHeightMillimetreMinor",
        },
        {
          coefficientMinor: swept.perDoorLeafMinor,
          count: swept.doorLeafCount,
          field: "perDoorLeafMinor",
        },
      ];

      const answers = new Set(
        permutationsOf(terms).map((ordering) => outcomeOf(ordering)),
      );

      expect([...answers]).toHaveLength(1);
    },
  );

  it("keeps every partial sum a book at the bound can form inside the exact range", () => {
    // The reason the ordering cannot matter for an accepted book, stated as the arithmetic rather
    // than as a comment: four terms, each a coefficient at the bound over the largest multiplier the
    // bound's derivation names, never leaves the safe range whichever order they arrive in.
    expect(
      4 * MAX_PRICE_COEFFICIENT_MINOR * MAX_DESIGN_DIMENSION_MM,
    ).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
  });
});

/** Every ordering of a term list. Four terms is 24 orderings, which is what a shape has at most. */
function permutationsOf(
  terms: readonly PricedTerm[],
): readonly (readonly PricedTerm[])[] {
  if (terms.length <= 1) return [terms];
  return terms.flatMap((term, index) =>
    permutationsOf([...terms.slice(0, index), ...terms.slice(index + 1)]).map(
      (rest) => [term, ...rest],
    ),
  );
}
