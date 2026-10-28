// M10 P4b-c, adversarial: the parser's reading of the accessories the dashboard created (ADR 0177 A-19, A-21) and of
// the blank-name ruling that binds every row naming no catalogue key. The character rules of a created row's words and
// the rule that a link names a row the book prices are the parser's (coordinator ruling after the P4b QA round); a case
// that pins what the parser still accepts outside those rulings says "today".
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { MAX_PRICE_COEFFICIENT_MINOR } from "../../src/pricing/book-reading.js";
import {
  MAX_BOOK_NAME_LENGTH,
  parsePriceBook,
} from "../../src/pricing/parse-price-book.js";
import type { PriceBook } from "../../src/pricing/price-book.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import {
  bookWithLinked,
  linkedRule,
  SUPPLIED_ROW_IDS,
} from "../support/linked-accessory-books.js";

const MAX_DESCRIPTION_LENGTH = 240;

function refusalOf(book: unknown) {
  const parsed = parsePriceBook(book);
  if (parsed.ok) throw new Error("expected the book to be refused");
  return parsed.failure;
}

function withRow(amendment: Record<string, unknown>): unknown {
  return bookWithLinked([{ ...linkedRule("plinth-light"), ...amendment }]);
}

describe("the blank-name ruling binds every row that names no catalogue key", () => {
  type Mutation = (book: PriceBook, name: string | undefined) => unknown;

  const WITHOUT_KEY = { nameKey: undefined };
  const everyUnkeyedRow: readonly (readonly [string, Mutation])[] = [
    [
      "a hardware tier",
      (book, name) => ({
        ...book,
        hardware: {
          ...book.hardware,
          tiers: book.hardware.tiers.map((tier, index) =>
            index === 0 ? { ...tier, ...WITHOUT_KEY, name } : tier,
          ),
        },
      }),
    ],
    [
      "a material tier",
      (book, name) => ({
        ...book,
        material: {
          ...book.material,
          tiers: book.material.tiers.map((tier, index) =>
            index === 0 ? { ...tier, ...WITHOUT_KEY, name } : tier,
          ),
        },
      }),
    ],
    [
      "the sink protective cover",
      (book, name) => ({
        ...book,
        accessories: {
          ...book.accessories,
          sinkProtectiveCover: {
            ...book.accessories.sinkProtectiveCover,
            ...WITHOUT_KEY,
            name,
          },
        },
      }),
    ],
    [
      "the dish drying rack",
      (book, name) => ({
        ...book,
        accessories: {
          ...book.accessories,
          dishDryingRack: {
            ...book.accessories.dishDryingRack,
            ...WITHOUT_KEY,
            name,
          },
        },
      }),
    ],
  ];

  describe.each(everyUnkeyedRow)("%s", (_, mutate) => {
    it.each(["", " ", "   ", "\t", "\n", "\u00a0", "\ufeff", " \t\n "])(
      "refuses the blank name %j once its key is gone",
      (name) => {
        expect(refusalOf(mutate(SAMPLE_PRICE_BOOK, name)).code).toBe(
          "INVALID_PRICE_BOOK",
        );
      },
    );

    it("accepts a name that says something, with no key", () => {
      expect(parsePriceBook(mutate(SAMPLE_PRICE_BOOK, "Hettich")).ok).toBe(
        true,
      );
    });
  });

  it("still refuses a blank name on a row whose key is the empty string, as it always did", () => {
    const book = {
      ...SAMPLE_PRICE_BOOK,
      accessories: {
        ...SAMPLE_PRICE_BOOK.accessories,
        dishDryingRack: {
          ...SAMPLE_PRICE_BOOK.accessories.dishDryingRack,
          nameKey: "",
          name: "",
        },
      },
    };

    expect(parsePriceBook(book).ok).toBe(false);
  });

  it("keeps a keyed row with a blank authored name valid: its word is only the fallback", () => {
    const book = {
      ...SAMPLE_PRICE_BOOK,
      accessories: {
        ...SAMPLE_PRICE_BOOK.accessories,
        dishDryingRack: {
          ...SAMPLE_PRICE_BOOK.accessories.dishDryingRack,
          name: "",
        },
      },
    };

    expect(parsePriceBook(book).ok).toBe(true);
  });

  it("returns the sample book unchanged (a keyed shipped row is unchanged)", () => {
    const parsed = parsePriceBook(SAMPLE_PRICE_BOOK);

    expect(parsed.ok && parsed.book).toEqual(SAMPLE_PRICE_BOOK);
  });
});

describe("perUnitMinor of a linked accessory", () => {
  it("accepts exactly the whole numbers from zero to the bound, and no others (sweep around each edge)", () => {
    const accepted = (perUnitMinor: unknown) =>
      parsePriceBook(withRow({ perUnitMinor })).ok;

    const acceptedValues = [
      0,
      1,
      999,
      1_000,
      1_001,
      MAX_PRICE_COEFFICIENT_MINOR,
    ];
    const refusedValues: readonly [string, unknown][] = [
      ["minus one", -1],
      ["minus ten lei", -1_000],
      ["the bound plus one", MAX_PRICE_COEFFICIENT_MINOR + 1],
      ["the largest safe integer", Number.MAX_SAFE_INTEGER],
      ["past the safe integers", Number.MAX_SAFE_INTEGER + 1],
      ["the smallest safe integer", Number.MIN_SAFE_INTEGER],
      ["a half", 0.5],
      ["a float sum", 0.1 + 0.2],
      ["1e21", 1e21],
      ["NaN", Number.NaN],
      ["infinity", Number.POSITIVE_INFINITY],
      ["minus infinity", Number.NEGATIVE_INFINITY],
      ["a numeric string", "100"],
      ["an empty string", ""],
      ["null", null],
      ["undefined", undefined],
      ["true", true],
      ["an array", []],
      ["an object", {}],
      ["a bigint", 10n],
    ];

    for (const value of acceptedValues) {
      expect(accepted(value), `accepts ${String(value)}`).toBe(true);
    }
    for (const [label, value] of refusedValues) {
      expect(accepted(value), `refuses ${label}`).toBe(false);
    }
  });

  it("refuses every fractional value and every negative whole one over generated numbers", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.double({ noNaN: false }).filter((n) => !Number.isInteger(n)),
          fc.integer({ min: -2_147_483_648, max: -1 }),
        ),
        (perUnitMinor) => !parsePriceBook(withRow({ perUnitMinor })).ok,
      ),
      { numRuns: 500 },
    );
  });
});

function aHoleyList(): unknown[] {
  const list: unknown[] = [linkedRule("a")];
  list.length = 3;
  return list;
}

describe("the list as a whole, hostile forms", () => {
  it.each([
    ["a holey array", aHoleyList()],
    ["an array-like", { length: 0 }],
    ["a function", () => []],
    ["a number", 0],
    ["a set", new Set([linkedRule("a")])],
  ])("refuses %s without throwing", (_, list) => {
    const book = { ...SAMPLE_PRICE_BOOK, linkedAccessories: list };

    expect(() => parsePriceBook(book)).not.toThrow();
    expect(parsePriceBook(book).ok).toBe(false);
  });

  it("refuses an array of many more rows than the bound without reading them all into a message", () => {
    const huge = Array.from({ length: 200_000 }, () => linkedRule("a"));

    const failure = refusalOf({
      ...SAMPLE_PRICE_BOOK,
      linkedAccessories: huge,
    });

    expect(failure.detail.length).toBeLessThan(2_000);
  });

  it("refuses a row whose member throws when read, without throwing", () => {
    const row = linkedRule("plinth-light");
    Object.defineProperty(row, "name", {
      enumerable: true,
      get() {
        throw new Error("boom");
      },
    });

    expect(() => parsePriceBook(bookWithLinked([row]))).not.toThrow();
    expect(parsePriceBook(bookWithLinked([row])).ok).toBe(false);
  });

  it("refuses a row carrying a key it inherits rather than owns", () => {
    const inherited = Object.create({ nameRu: "inherited" }) as Record<
      string,
      unknown
    >;
    Object.assign(inherited, linkedRule("plinth-light"));

    expect(parsePriceBook(bookWithLinked([inherited as never])).ok).toBe(false);
  });

  it.each([
    "nameRu",
    "descriptionRu",
    "ru",
    "nameKey",
    "descriptionKey",
    "name_ru",
  ])("refuses the stray key %s on a created row, naming it", (key) => {
    const failure = refusalOf(withRow({ [key]: "x" }));

    expect(failure.detail).toContain(key);
  });
});

describe("id collisions between linked rows and everything else", () => {
  it("lets two linked rows share a linked row, each earning independently", () => {
    const book = bookWithLinked([
      linkedRule("organiser", { linkedBuildId: "base-3drawer" }),
      linkedRule("handle-pack", { linkedBuildId: "base-3drawer" }),
    ]);

    expect(parsePriceBook(book).ok).toBe(true);
  });

  it("keeps an accessory id and a rule id in different namespaces: one row's id may spell another's rule id", () => {
    const book = bookWithLinked([
      linkedRule("first", { ruleId: "shared-name" }),
      linkedRule("shared-name", { ruleId: "accessory.second" }),
    ]);

    expect(parsePriceBook(book).ok).toBe(true);
  });

  it("refuses a linked accessory id that collides with itself after any other row's insertion, wherever it sits", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 0, max: 5 }),
        (firstAt, secondAt) => {
          fc.pre(firstAt !== secondAt);
          const rows = Array.from({ length: 6 }, (_, index) =>
            linkedRule(`row-${String(index)}`),
          ).map((row, index) =>
            index === secondAt
              ? { ...row, accessoryId: `row-${String(firstAt)}` }
              : row,
          );

          return !parsePriceBook(bookWithLinked(rows)).ok;
        },
      ),
    );
  });

  it.each([
    "__proto__",
    "constructor",
    "toString",
    "hasOwnProperty",
    "valueOf",
  ])(
    "treats the id %s as an ordinary id, neither refused as special nor shared with another",
    (accessoryId) => {
      const ok = bookWithLinked([
        linkedRule(accessoryId, { ruleId: `rule.${accessoryId}` }),
      ]);
      const twice = bookWithLinked([
        linkedRule(accessoryId, { ruleId: "rule.one" }),
        linkedRule(accessoryId, { ruleId: "rule.two" }),
      ]);

      expect(parsePriceBook(ok).ok).toBe(true);
      expect(parsePriceBook(twice).ok).toBe(false);
    },
  );
});

describe("bounds at the exact edge", () => {
  it("accepts a name of 80 and 240-character description and refuses one more of each, over a sweep of lengths", () => {
    for (const length of [1, 2, 79, 80, 81, 82, 240, 241]) {
      const name = "n".repeat(length);
      const description = "d".repeat(length);

      expect(
        parsePriceBook(withRow({ name })).ok,
        `name ${String(length)}`,
      ).toBe(length <= MAX_BOOK_NAME_LENGTH);
      expect(
        parsePriceBook(withRow({ description })).ok,
        `description ${String(length)}`,
      ).toBe(length <= MAX_DESCRIPTION_LENGTH);
    }
  });

  it("accepts an empty description and refuses a null one", () => {
    expect(parsePriceBook(withRow({ description: "" })).ok).toBe(true);
    expect(parsePriceBook(withRow({ description: null })).ok).toBe(false);
  });
});

describe("a created row's words refuse what the shop's one-line notice cannot carry (ruled: the parser's job)", () => {
  it.each([
    ["a line feed in the name", { name: "Organizator\nsertar" }],
    ["a carriage return in the name", { name: "Organizator\rsertar" }],
    ["a tab in the name", { name: "Organizator\tsertar" }],
    [
      "a right-to-left override in the name",
      { name: "Organizator\u202esertar" },
    ],
    ["a NUL in the name", { name: "Organizator\u0000" }],
    ["a next-line character in the name", { name: "Organizator\u0085sertar" }],
    ["a DEL in the name", { name: "Organizator\u007fsertar" }],
    ["a line feed in the description", { description: "Unu.\nDoi." }],
    ["a line separator in the description", { description: "Unu.\u2028Doi." }],
    ["a name of only a zero-width space", { name: "\u200b" }],
    [
      "a name of only zero-width joiners and a BOM",
      { name: "\u200c\u200d\ufeff" },
    ],
    [
      "a name of only spaces, a no-break space and a zero-width space",
      { name: " \u00a0\u200b " },
    ],
  ])("refuses %s", (_, amendment) => {
    expect(refusalOf(withRow(amendment)).code).toBe("INVALID_PRICE_BOOK");
  });

  it("accepts a decomposed name, a letter and its combining mark being one letter once composed", () => {
    expect(parsePriceBook(withRow({ name: "ş" })).ok).toBe(true);
  });

  it("measures the limits on the NFC form: eighty decomposed letters fit the name, eighty-one do not", () => {
    expect(parsePriceBook(withRow({ name: "ş".repeat(80) })).ok).toBe(true);
    expect(parsePriceBook(withRow({ name: "ş".repeat(81) })).ok).toBe(false);
    expect(parsePriceBook(withRow({ description: "ş".repeat(240) })).ok).toBe(
      true,
    );
    expect(parsePriceBook(withRow({ description: "ş".repeat(241) })).ok).toBe(
      false,
    );
  });

  it("counts an emoji as its two UTF-16 units today: forty fit the name, forty-one do not", () => {
    expect(parsePriceBook(withRow({ name: "\u{1F642}".repeat(40) })).ok).toBe(
      true,
    );
    expect(parsePriceBook(withRow({ name: "\u{1F642}".repeat(41) })).ok).toBe(
      false,
    );
  });

  it("does not name the offending text in its refusal, only the row and the field", () => {
    const failure = refusalOf(withRow({ name: "Secret-7c41\nrest" }));

    expect(failure.detail).not.toContain("Secret-7c41");
  });

  it("still refuses a forbidden character in a name that sits exactly at the limit", () => {
    expect(parsePriceBook(withRow({ name: `${"n".repeat(79)}\n` })).ok).toBe(
      false,
    );
  });
});

describe("invisible characters outside the ruled set, pinned as they stand today", () => {
  it.each([
    ["a word joiner", "⁠"],
    ["a left-to-right mark", "‎"],
    ["a soft hyphen", "­"],
    ["an Arabic letter mark", "؜"],
  ])(
    "accepts today a name of only %s, which prints as nothing (the ruled set is whitespace, U+200B-200D and U+FEFF)",
    (_, name) => {
      expect(parsePriceBook(withRow({ name })).ok).toBe(true);
    },
  );
});

describe("a link names a row the book prices (ruled: the parser's job)", () => {
  const LINKABLE = SUPPLIED_ROW_IDS[0] ?? "";

  it.each([
    ["a row the book prices nowhere", "no-such-row"],
    ["a seeded variant's id", "wall-2door-600"],
    ["a space", " "],
    ["a row's id in another case", "BASE-3DRAWER"],
    ["a row's id with a trailing space", "base-3drawer "],
  ])("refuses a link to %s, naming the accessory", (_, linkedBuildId) => {
    const failure = refusalOf(withRow({ linkedBuildId }));

    expect(failure.id).toBe("plinth-light");
    expect(failure.detail).toContain("cabinet rule");
  });

  it("refuses a link to a row once the book's own rule for it is gone, and accepts it while the rule stands", () => {
    const withoutRule = {
      ...SAMPLE_PRICE_BOOK,
      cabinetRules: SAMPLE_PRICE_BOOK.cabinetRules.filter(
        (rule) => rule.buildId !== LINKABLE,
      ),
      linkedAccessories: [
        linkedRule("plinth-light", { linkedBuildId: LINKABLE }),
      ],
    };

    expect(
      parsePriceBook(bookWithLinked(withoutRule.linkedAccessories)).ok,
    ).toBe(true);
    expect(refusalOf(withoutRule).id).toBe("plinth-light");
  });

  it("refuses the variant's id even when the book prices the row the variant resolves to", () => {
    expect(SUPPLIED_ROW_IDS).toContain("wall-cabinet");

    expect(parsePriceBook(withRow({ linkedBuildId: "wall-cabinet" })).ok).toBe(
      true,
    );
    expect(
      parsePriceBook(withRow({ linkedBuildId: "wall-2door-600" })).ok,
    ).toBe(false);
  });

  it("names the first offending accessory, wherever it sits in the list", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 9 }), (badAt) => {
        const rows = Array.from({ length: 10 }, (_, index) =>
          linkedRule(`row-${String(index)}`, {
            linkedBuildId: index === badAt ? "wall-2door-600" : LINKABLE,
          }),
        );

        expect(refusalOf(bookWithLinked(rows)).id).toBe(`row-${String(badAt)}`);
      }),
    );
  });
});
