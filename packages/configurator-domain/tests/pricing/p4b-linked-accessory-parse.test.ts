// M10 P4b-c: the parser reads the accessories the dashboard created (ADR 0177 A-19, A-21). The list is required and
// bounded; a row states authored Romanian and nothing else; an id may not be taken twice; a row the customer supplies
// carries no accessory; and a row from before the list existed is unchanged.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { MAX_PRICE_COEFFICIENT_MINOR } from "../../src/pricing/book-reading.js";
import { MAX_LINKED_ACCESSORIES } from "../../src/pricing/parse-linked-accessories.js";
import {
  MAX_BOOK_NAME_LENGTH,
  parsePriceBook,
} from "../../src/pricing/parse-price-book.js";
import {
  ACCESSORY_IDS,
  listAccessoryIds,
  listRuleIds,
} from "../../src/pricing/price-book.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import {
  bookWithLinked,
  CUSTOMER_ROW_IDS,
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

describe("the list of linked accessories is a required, bounded section", () => {
  it("accepts the sample book, whose list is empty", () => {
    expect(SAMPLE_PRICE_BOOK.linkedAccessories).toEqual([]);
    expect(parsePriceBook(SAMPLE_PRICE_BOOK).ok).toBe(true);
  });

  it("accepts a well-formed row, with and without a description", () => {
    const book = bookWithLinked([
      linkedRule("plinth-light"),
      linkedRule("organiser", { description: "Pentru un sertar." }),
    ]);

    expect(parsePriceBook(book).ok).toBe(true);
  });

  it.each([
    ["absent", undefined],
    ["null", null],
    ["an object", {}],
    ["a string", "none"],
  ])(
    "refuses a book whose list is %s, never reading it as empty",
    (_, list) => {
      const { linkedAccessories, ...withoutList } = SAMPLE_PRICE_BOOK;
      void linkedAccessories;
      const book =
        list === undefined
          ? withoutList
          : { ...withoutList, linkedAccessories: list };

      const failure = refusalOf(book);

      expect(failure.code).toBe("INVALID_PRICE_BOOK");
      expect(failure.detail).toContain("linkedAccessories");
    },
  );

  it("holds the list to its bound at the boundary", () => {
    const rows = (count: number) =>
      Array.from({ length: count }, (_, index) =>
        linkedRule(`extra-${String(index)}`),
      );

    expect(
      parsePriceBook(bookWithLinked(rows(MAX_LINKED_ACCESSORIES))).ok,
    ).toBe(true);
    expect(
      refusalOf(bookWithLinked(rows(MAX_LINKED_ACCESSORIES + 1))).detail,
    ).toContain("linkedAccessories");
  });

  it("refuses a row that is not an object", () => {
    expect(refusalOf(bookWithLinked(["plinth-light" as never])).code).toBe(
      "INVALID_PRICE_BOOK",
    );
  });
});

describe("a created row states authored Romanian text and no other language (A-21)", () => {
  it.each(["name", "description"])(
    "a Russian-named %s field is refused, whatever it holds",
    (field) => {
      for (const key of [
        `${field}Ru`,
        `${field}_ru`,
        `${field}RU`,
        "ru",
        "translations",
        "locales",
      ]) {
        const failure = refusalOf(withRow({ [key]: "x" }));

        expect(failure.detail).toContain('linked accessory "plinth-light"');
        expect(failure.detail).toContain(key);
        expect(failure.id).toBe("plinth-light");
      }
    },
  );

  it("refuses a key into the message files: a created row has none", () => {
    for (const key of ["nameKey", "descriptionKey"]) {
      expect(
        refusalOf(withRow({ [key]: "priceBook.accessory.x" })).detail,
      ).toContain(key);
    }
  });

  it("refuses any undeclared key on the row, naming it", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z][A-Za-z0-9]{0,24}$/),
        fc.oneof(fc.integer(), fc.string(), fc.boolean(), fc.constant(null)),
        (key, value) => {
          const failure = refusalOf(withRow({ [`stray${key}`]: value }));

          expect(failure.detail).toContain(`stray${key}`);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("treats an undeclared key holding undefined as absent", () => {
    expect(parsePriceBook(withRow({ strayField: undefined })).ok).toBe(true);
  });

  it.each(["", " ", "   ", "\t\n"])("refuses a blank name %j", (name) => {
    const failure = refusalOf(withRow({ name }));

    expect(failure.detail).toContain("name");
  });

  it("refuses a name that is not text", () => {
    for (const name of [undefined, null, 7, ["x"]]) {
      expect(refusalOf(withRow({ name })).detail).toContain("name");
    }
  });

  it("holds the name and the description to their lengths at the boundary", () => {
    const accepted = withRow({
      name: "n".repeat(MAX_BOOK_NAME_LENGTH),
      description: "d".repeat(MAX_DESCRIPTION_LENGTH),
    });

    expect(parsePriceBook(accepted).ok).toBe(true);
    expect(
      refusalOf(withRow({ name: "n".repeat(MAX_BOOK_NAME_LENGTH + 1) })).detail,
    ).toContain("name");
    expect(
      refusalOf(
        withRow({ description: "d".repeat(MAX_DESCRIPTION_LENGTH + 1) }),
      ).detail,
    ).toContain("description");
  });

  it("refuses a description that is not text", () => {
    for (const description of [null, 7, ["x"]]) {
      expect(refusalOf(withRow({ description })).detail).toContain(
        "description",
      );
    }
  });
});

describe("ids are unique across the built-ins and the linked rows", () => {
  it("refuses a rule id taken by any other rule in the book", () => {
    for (const ruleId of listRuleIds(SAMPLE_PRICE_BOOK)) {
      const failure = refusalOf(withRow({ ruleId }));

      expect(failure.detail).toContain(ruleId);
      expect(failure.id).toBe(ruleId);
    }
  });

  it("refuses an accessory id that is a built-in's field name, whether or not the book states that built-in", () => {
    for (const accessoryId of ACCESSORY_IDS) {
      const failure = refusalOf(
        withRow({ accessoryId, ruleId: "accessory.fresh" }),
      );

      expect(failure.detail).toContain(accessoryId);
      expect(failure.id).toBe(accessoryId);
    }
  });

  it("refuses an accessory id taken twice among the linked rows, and a rule id taken twice", () => {
    const sameAccessory = bookWithLinked([
      linkedRule("organiser"),
      linkedRule("organiser", { ruleId: "accessory.another" }),
    ]);
    const sameRule = bookWithLinked([
      linkedRule("organiser"),
      linkedRule("plinth-light", { ruleId: "accessory.organiser" }),
    ]);

    expect(refusalOf(sameAccessory).id).toBe("organiser");
    expect(refusalOf(sameRule).id).toBe("accessory.organiser");
  });

  it("lists every accessory id once: the two built-ins, then the linked rows in book order", () => {
    const book = bookWithLinked([
      linkedRule("b-second"),
      linkedRule("a-first"),
    ]);

    expect(listAccessoryIds(book)).toEqual([
      ...ACCESSORY_IDS,
      "b-second",
      "a-first",
    ]);
  });

  it("refuses an empty or oversized id of any of the three kinds", () => {
    for (const field of ["accessoryId", "ruleId", "linkedBuildId"]) {
      expect(refusalOf(withRow({ [field]: "" })).detail).toContain(field);
      expect(refusalOf(withRow({ [field]: "x".repeat(65) })).detail).toContain(
        field,
      );
    }
  });
});

describe("a link to a row the customer supplies is refused when the book says so", () => {
  it("names the customer rows the sample book states", () => {
    expect(CUSTOMER_ROW_IDS.length).toBeGreaterThan(0);
  });

  it.each(CUSTOMER_ROW_IDS)("refuses a link to %s", (linkedBuildId) => {
    const failure = refusalOf(withRow({ linkedBuildId }));

    expect(failure.detail).toContain(linkedBuildId);
    expect(failure.id).toBe("plinth-light");
  });

  it("accepts a link to every row the manufacturer supplies", () => {
    const everyRow = SUPPLIED_ROW_IDS.map((linkedBuildId, index) =>
      linkedRule(`link-${String(index)}`, { linkedBuildId }),
    );

    expect(everyRow.length).toBeLessThanOrEqual(MAX_LINKED_ACCESSORIES);
    expect(parsePriceBook(bookWithLinked(everyRow)).ok).toBe(true);
  });

  it("refuses a link to a row the book has no cabinet rule for, a seeded variant's id among them", () => {
    for (const linkedBuildId of ["no-such-row", "wall-2door-600"]) {
      const failure = refusalOf(withRow({ linkedBuildId }));

      expect(failure.detail).toContain(linkedBuildId);
      expect(failure.id).toBe("plinth-light");
    }
  });
});

describe("the price per unit is an exact, non-negative count of minor units", () => {
  it("accepts every whole amount from zero to the bound", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_PRICE_COEFFICIENT_MINOR }),
        (perUnitMinor) => {
          expect(parsePriceBook(withRow({ perUnitMinor })).ok).toBe(true);
        },
      ),
    );
  });

  it("refuses an amount below zero or past the bound", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ min: Number.MIN_SAFE_INTEGER, max: -1 }),
          fc.integer({
            min: MAX_PRICE_COEFFICIENT_MINOR + 1,
            max: Number.MAX_SAFE_INTEGER,
          }),
        ),
        (perUnitMinor) => {
          expect(refusalOf(withRow({ perUnitMinor })).detail).toContain(
            "perUnitMinor",
          );
        },
      ),
    );
  });

  it("refuses an amount that is not a whole count, or not a number, or absent", () => {
    for (const perUnitMinor of [
      0.5,
      1.000_001,
      Number.NaN,
      Infinity,
      -Infinity,
      "100",
      null,
      true,
      undefined,
    ]) {
      expect(refusalOf(withRow({ perUnitMinor })).detail).toContain(
        "perUnitMinor",
      );
    }
  });
});

describe("a keyed shipped row is unchanged by the list", () => {
  it("still states its keys and parses, with a linked accessory beside it", () => {
    const book = bookWithLinked([linkedRule("plinth-light")]);

    expect(parsePriceBook(book).ok).toBe(true);
    expect(book.hardware).toBe(SAMPLE_PRICE_BOOK.hardware);
    expect(book.accessories.sinkProtectiveCover.nameKey).toBe(
      "priceBook.accessory.sink-protective-cover.name",
    );
  });

  it("still refuses a stray key on a built-in accessory with a linked one present", () => {
    const book = {
      ...bookWithLinked([linkedRule("plinth-light")]),
      accessories: {
        ...SAMPLE_PRICE_BOOK.accessories,
        dishDryingRack: {
          ...SAMPLE_PRICE_BOOK.accessories.dishDryingRack,
          nameRu: "x",
        },
      },
    };

    expect(refusalOf(book).id).toBe("dishDryingRack");
  });
});

describe("a created hardware class names itself in Romanian: a row with no key may not be blank", () => {
  const [firstTier] = SAMPLE_PRICE_BOOK.hardware.tiers;
  if (firstTier === undefined)
    throw new Error("the sample book has no hardware tier");
  const { nameKey, ...unkeyedTier } = firstTier;
  const withTier = (tier: object) => ({
    ...SAMPLE_PRICE_BOOK,
    hardware: {
      ...SAMPLE_PRICE_BOOK.hardware,
      tiers: [tier, ...SAMPLE_PRICE_BOOK.hardware.tiers.slice(1)],
    },
  });

  it.each(["", "  "])(
    "refuses a tier named %j that names no catalogue leaf",
    (name) => {
      const failure = refusalOf(withTier({ ...unkeyedTier, name }));

      expect(failure.detail).toContain("blank");
      expect(failure.detail).toContain("hardware tier");
    },
  );

  it("accepts the same name on a tier that names its leaf, whose authored word is only a fallback", () => {
    expect(nameKey).toBeDefined();

    expect(
      parsePriceBook(withTier({ ...unkeyedTier, nameKey, name: "" })).ok,
    ).toBe(true);
  });

  it("refuses a created hardware class carrying a Russian text field", () => {
    for (const key of ["nameRu", "descriptionRu", "ru"]) {
      expect(
        refusalOf(withTier({ ...unkeyedTier, [key]: "x" })).detail,
      ).toContain(key);
    }
  });
});

describe("created-row text is held to what a line of the lead notice can carry", () => {
  const UNSENDABLE = [
    "line feed",
    "carriage return",
    "NUL",
    "next line U+0085",
    "line separator U+2028",
    "paragraph separator U+2029",
    "right-to-left override U+202E",
    "isolate U+2066",
    "DEL",
  ];
  const CHARACTERS = [
    "\n",
    "\r",
    "\u0000",
    "\u0085",
    "\u2028",
    "\u2029",
    "\u202E",
    "\u2066",
    "\u007F",
  ];

  it.each(CHARACTERS.map((character, index) => [UNSENDABLE[index], character]))(
    "refuses a %s in the name and in the description",
    (_, character) => {
      expect(
        refusalOf(withRow({ name: `Organizator${character}x` })).detail,
      ).toContain("name");
      expect(
        refusalOf(withRow({ description: `Unu${character}doi` })).detail,
      ).toContain("description");
    },
  );

  it("refuses every bidi embedding, override and isolate, and no character just outside the ranges", () => {
    for (const code of [
      0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069,
    ]) {
      expect(
        parsePriceBook(withRow({ name: `a${String.fromCharCode(code)}b` })).ok,
      ).toBe(false);
    }
    for (const code of [0x2030, 0x202f, 0x2065, 0x206a]) {
      expect(
        parsePriceBook(withRow({ name: `a${String.fromCharCode(code)}b` })).ok,
      ).toBe(true);
    }
  });

  it("refuses a name with nothing visible in it: whitespace and zero-width characters only", () => {
    for (const name of [
      "\u200B",
      "\u200C\u200D",
      "\uFEFF",
      " \u200B \uFEFF\u00A0",
    ]) {
      expect(refusalOf(withRow({ name })).detail).toContain("blank");
    }
    expect(parsePriceBook(withRow({ name: "a\u200Bb" })).ok).toBe(true);
  });

  it("refuses text that is not already in NFC, in a name and in a description, and accepts its composed form", () => {
    const decomposed = "e\u0301";

    expect(decomposed.normalize("NFC")).not.toBe(decomposed);
    expect(refusalOf(withRow({ name: decomposed })).detail).toContain("NFC");
    expect(refusalOf(withRow({ description: decomposed })).detail).toContain(
      "NFC",
    );
    expect(parsePriceBook(withRow({ name: "\u00e9" })).ok).toBe(true);
  });

  it("measures the lengths in UTF-16 units of the declared string, as every other book row", () => {
    const emoji = "\u{1F642}";

    expect(
      parsePriceBook(withRow({ name: emoji.repeat(MAX_BOOK_NAME_LENGTH / 2) }))
        .ok,
    ).toBe(true);
    expect(
      parsePriceBook(
        withRow({ name: emoji.repeat(MAX_BOOK_NAME_LENGTH / 2 + 1) }),
      ).ok,
    ).toBe(false);
  });

  it("refuses a lone surrogate, which no database column holds, in a name and in a description", () => {
    for (const lone of ["\ud800", "\udc00", "a\ud83dz"]) {
      expect(refusalOf(withRow({ name: `n${lone}` })).detail).toContain("name");
      expect(refusalOf(withRow({ description: `d${lone}` })).detail).toContain(
        "description",
      );
    }
    expect(parsePriceBook(withRow({ name: "\u{1F642}" })).ok).toBe(true);
  });

  it("refuses a name of only format characters or blank fillers (the direction marks are refused as direction controls, before blankness)", () => {
    for (const name of [
      "\u2060",
      "\u00ad",
      "\u034f",
      "\u3164",
      "\u115f",
      "\u1160",
    ]) {
      expect(refusalOf(withRow({ name })).detail).toContain("blank");
    }
  });
});
