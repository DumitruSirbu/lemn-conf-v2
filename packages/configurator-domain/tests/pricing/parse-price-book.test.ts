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
import { parsePriceBook } from "../../src/pricing/parse-price-book.js";
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
 * **A row's catalogue key, at the same boundary its words are held to** — ADR 0106 decision 1's
 * `nameKey` / `descriptionKey`.
 *
 * The key is optional and its absence is the common case, so the boundary has to tell *unstated*
 * from *stated badly*: a dashboard-authored row states neither and must parse, while a row stating a
 * number, an object or a 5 000-character string is the same free multiplier on a refusal message
 * that `MAX_IDENTIFIER_LENGTH` exists for.
 */
describe("a row's rendered text may name a catalogue leaf (ADR 0106)", () => {
  it("parses the shipped book, whose rows name fourteen of them", () => {
    // Every keyed row, accessories included: 6 tiers × 2 fields, less the two proper nouns
    // *Hettich* and *Blum* that deliberately name none, plus the two accessories' 4. Walking the
    // tiers alone would count 10 and the name of this test would be the defect.
    const keyed = [
      ...BOOK.hardware.tiers,
      ...BOOK.material.tiers,
      BOOK.accessories.sinkProtectiveCover,
      BOOK.accessories.dishDryingRack,
    ].flatMap((row) => [row.nameKey, row.descriptionKey]);

    expect(keyed.filter((key) => key !== undefined)).toHaveLength(14);
    expect(parsePriceBook(BOOK).ok).toBe(true);
  });

  it("accepts a row that names no key, which is what a dashboard writes", () => {
    // ADR 0106 decision 2: `name` stays required and a book nobody at Lemnaria authored renders its
    // own words. Absence must therefore parse, and it is asserted rather than assumed because the
    // obvious implementation of "validate the key" refuses `undefined`.
    const [first, ...rest] = BOOK.material.tiers;
    if (!first) throw new Error("the sample offers no material tier");
    const unkeyed: MaterialTier = {
      tierId: first.tierId,
      ruleId: first.ruleId,
      name: first.name,
      description: first.description,
      wholeKitchenMinor: first.wholeKitchenMinor,
    };

    expect(
      parsePriceBook(
        bookWith({ material: { ...BOOK.material, tiers: [unkeyed, ...rest] } }),
      ).ok,
    ).toBe(true);
  });

  it.each([
    ["empty", ""],
    ["unbounded", "k".repeat(5_000)],
    ["a number", 7],
    ["an object", { key: "priceBook.material.melamine.name" }],
    ["null", null],
  ])("refuses a %s key rather than resolving it later", (_named, key) => {
    const [first, ...rest] = BOOK.material.tiers;
    if (!first) throw new Error("the sample offers no material tier");
    const tiers = [{ ...first, nameKey: key }, ...rest];

    expect(
      refusalFrom(bookWith({ material: { ...BOOK.material, tiers } })).code,
    ).toBe("INVALID_PRICE_BOOK");
  });

  it("refuses an accessory's key on the same terms as a tier's", () => {
    // The accessory section reaches the same guard by a different route, so it is exercised rather
    // than reasoned about: an accessory rule is read by id and not by position in a list.
    const accessories = {
      ...BOOK.accessories,
      dishDryingRack: {
        ...BOOK.accessories.dishDryingRack,
        descriptionKey: "d".repeat(5_000),
      },
    };

    expect(refusalFrom(bookWith({ accessories })).code).toBe(
      "INVALID_PRICE_BOOK",
    );
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

/** The sentence `refuseAnythingRaised` answers with. Its own doc calls a refusal wearing it a defect
 *  in the parser, so it is quoted here rather than described. */
const BACKSTOP_DETAIL = "Reading the price book raised";

/** How far into the book the walk below looks for a list. Deep enough for a list nested inside a
 *  rule's formula, short enough that the sweep stays a sweep. */
const MAX_SAMPLE_BOOK_DEPTH = 5;

/** Every path in the sample book that carries a list, **found by walking rather than by listing**.
 *
 *  The claim that no member of a declared book is read bare has been measured wrong twice — once for
 *  20 of 22 field reads, and again for the four list positions `Array.isArray(x) && x.length` hides.
 *  A test naming those four would go green and say nothing about the fifth. This one sweeps whatever
 *  lists the book actually carries, so a list added to `price-book.ts` later is covered without this
 *  file being edited. */
function listPathsOf(declared: unknown, depth = 0, prefix = ""): string[] {
  if (depth >= MAX_SAMPLE_BOOK_DEPTH) return [];
  if (Array.isArray(declared)) {
    const nested = declared.flatMap((element, index) =>
      listPathsOf(element, depth + 1, `${prefix}.${String(index)}`),
    );
    return [prefix, ...nested];
  }
  if (typeof declared !== "object" || declared === null) return [];
  return Object.entries(declared).flatMap(([field, value]) =>
    listPathsOf(value, depth + 1, prefix === "" ? field : `${prefix}.${field}`),
  );
}

const SAMPLE_LIST_PATHS = listPathsOf(BOOK);

/** A copy of the book with one path replaced. Rebuilt along the path rather than mutated, so each
 *  case in the sweep is independent of every other. */
function bookWithValueAt(
  declared: unknown,
  path: readonly string[],
  value: unknown,
): unknown {
  const [field, ...rest] = path;
  if (field === undefined) return value;
  if (Array.isArray(declared)) {
    return (declared as readonly unknown[]).map((element, index) =>
      String(index) === field ? bookWithValueAt(element, rest, value) : element,
    );
  }
  return {
    ...(declared as Record<string, unknown>),
    [field]: bookWithValueAt(
      (declared as Record<string, unknown>)[field],
      rest,
      value,
    ),
  };
}

/** An array whose every read raises — `length`, `Symbol.iterator` and each index alike.
 *
 *  **`Array.isArray` answers `true` for this**, which is the whole point: the check it satisfies
 *  looks like a type test and is a call into the book's own code. */
function listRaisingOnEveryRead(): readonly unknown[] {
  return new Proxy([] as unknown[], {
    get() {
      throw new Error("this list raised when it was read");
    },
  });
}

/** An array that answers its length and raises on the elements, which is the `for…of` position on
 *  its own rather than the length check's. */
function listRaisingOnItsElements(length: number): readonly unknown[] {
  return new Proxy(
    Array.from({ length }, () => undefined),
    {
      get(target, property) {
        if (property === "length") return length;
        throw new Error("this element raised when it was read");
      },
    },
  );
}

/** How a refusal reads, or `"accepted"` where there was none — one spelling, so the sweep compares
 *  the same thing at every position. */
function parseDetailOf(book: unknown): string {
  const parsed = parsePriceBook(book);
  return parsed.ok ? "accepted" : parsed.failure.detail;
}

describe("a list is read through a guard, wherever the book declares one", () => {
  it("finds the lists the sample declares, so the sweep below is over something", () => {
    // Named rather than counted: a walk that silently found nothing would make every assertion in
    // this block pass without a single proxy being parsed.
    expect(SAMPLE_LIST_PATHS).toEqual(
      expect.arrayContaining([
        "cabinetRules",
        "material.tiers",
        "hardware.tiers",
      ]),
    );
  });

  it("never falls to the backstop, at any list the book carries", () => {
    // The property, not the four positions that were wrong. `refuseAnythingRaised` exists for the
    // value nobody predicted, and its own doc says a refusal wearing its message is a parser defect
    // rather than a fact about the book — so a raising proxy array reaching it is this module
    // misdiagnosing its own input.
    const backstopped = SAMPLE_LIST_PATHS.filter((path) =>
      parseDetailOf(
        bookWithValueAt(BOOK, path.split("."), listRaisingOnEveryRead()),
      ).includes(BACKSTOP_DETAIL),
    );

    expect(backstopped).toEqual([]);
  });

  it("names the section for a cabinetRules list whose reads raise", () => {
    const detail = parseDetailOf(
      bookWith({ cabinetRules: listRaisingOnEveryRead() }),
    );

    expect(detail).toContain('"cabinetRules" is a list');
    expect(detail).toContain("raised when it was read");
  });

  it("names the section for a tier list that answers its length and raises on an element", () => {
    // The `for…of` position on its own: the length check passes, so a bare loop would run the
    // book's index traps and leave through the backstop.
    const detail = parseDetailOf(
      bookWith({
        material: { ...BOOK.material, tiers: listRaisingOnItsElements(3) },
      }),
    );

    expect(detail).toContain('"material.tiers" is a list');
    expect(detail).not.toContain(BACKSTOP_DETAIL);
  });
});
