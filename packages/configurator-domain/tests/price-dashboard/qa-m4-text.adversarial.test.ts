// M10 M4-b, M4-d adversarial QA: the authored-text judgement. Written from the milestone's M4 row, the coordinator's
// ruling (an amount is a number beside a money unit, or a percent sign or word; `Blum 2000` and a bare number pass)
// and ADR 0106 Amendment A, not from the module's own tests. Every non-ASCII character is written as an escape, so the
// file carries no Romanian literal and no invisible character.
//
// The red tests below each name one text that states an amount, a percentage or an inclusion and is accepted. The
// green ones sweep the matrix of forms the judgement is built to refuse, and the plain words it must let through.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import type { CreatedRowTextField } from "../../src/price-dashboard/book-field-address.js";
import { judgeCreatedRowText } from "../../src/price-dashboard/created-row-text.js";
import {
  MAX_BOOK_DESCRIPTION_LENGTH,
  MAX_BOOK_NAME_LENGTH,
} from "../../src/pricing/book-reading.js";
import { parsePriceBook } from "../../src/pricing/parse-price-book.js";
import type { PriceBook } from "../../src/pricing/price-book.js";
import {
  bookWithLinked,
  linkedRule,
} from "../support/linked-accessory-books.js";

import { BASE } from "./qa-m4-support.js";

const FIELDS: readonly CreatedRowTextField[] = ["name", "description"];
const AMOUNT_CODE = "TEXT_STATES_AN_AMOUNT";
const RUNS = 300;
const SEED = 20261102;

// Letters of Romanian as escapes: a-breve, a-circumflex, s-comma, t-comma, i-circumflex.
// eslint-disable-next-line no-restricted-syntax -- the judgement is about Romanian wording: this input must pass or be refused
const A_BREVE = "\u0103";
// eslint-disable-next-line no-restricted-syntax -- the judgement is about Romanian wording: this input must pass or be refused
const A_CIRCUMFLEX = "\u00e2";
// eslint-disable-next-line no-restricted-syntax -- the judgement is about Romanian wording: this input must pass or be refused
const S_COMMA = "\u0219";
// eslint-disable-next-line no-restricted-syntax -- the judgement is about Romanian wording: this input must pass or be refused
const T_COMMA = "\u021b";
const NBSP = "\u00a0";
const NARROW_NBSP = "\u202f";
const ZERO_WIDTH_SPACE = "\u200b";
const WORD_JOINER = "\u2060";
const SOFT_HYPHEN = "\u00ad";

function codeOf(raw: unknown, field: CreatedRowTextField = "name"): string {
  const judged = judgeCreatedRowText(raw, field);
  return judged.ok ? "ok" : judged.code;
}

/** The text with every character past ASCII written as an escape, so a failure message shows what was judged. */
function shown(text: string): string {
  return Array.from(text, (character) =>
    (character.codePointAt(0) ?? 0) < 128
      ? character
      : `\\u${(character.codePointAt(0) ?? 0).toString(16).padStart(4, "0")}`,
  ).join("");
}

function parses(book: PriceBook): boolean {
  return parsePriceBook(book).ok;
}

function withLinkedName(name: string, description?: string): PriceBook {
  return bookWithLinked(
    [
      linkedRule("organiser", {
        name,
        ...(description === undefined ? {} : { description }),
      }),
    ],
    BASE,
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Texts that state something and are accepted: each is a defect of the judgement

describe("a number and a money unit with words or marks between them are still an amount", () => {
  it.each([
    ["the grammatical form of a price in Romanian", "500 de lei"],
    ["the same with euro", "500 de euro"],
    ["grouped digits and the grammatical form", "1.000 de lei"],
    ["a hyphen between number and unit", "500-lei"],
    ["a slash between number and unit", "500/lei"],
    ["a unit, a colon, then the number", "lei: 500"],
    ["a unit, then the number in brackets", "lei (500)"],
  ])("refuses %s", (_label, text) => {
    expect(codeOf(text), shown(text)).toBe(AMOUNT_CODE);
  });
});

describe("a percentage said in words is a percentage", () => {
  it.each([
    ["a number and la sut" + A_BREVE, "10 la sut" + A_BREVE],
    ["a number word and la sut" + A_BREVE, "zece la sut" + A_BREVE],
    ["la suta without its breve", "zece la suta"],
    // eslint-disable-next-line no-restricted-syntax -- the judgement is about Romanian wording: this input must pass or be refused
    ["capitals", "ZECE LA SUT" + "\u0102"],
  ])("refuses %s", (_label, text) => {
    expect(codeOf(text), shown(text)).toBe(AMOUNT_CODE);
  });
});

describe("an invisible character inside the word or between the number and the unit hides what the text says", () => {
  it.each([
    ["a zero-width space between number and unit", `500${ZERO_WIDTH_SPACE}lei`],
    [
      "a zero-width space and a space between number and unit",
      `500${ZERO_WIDTH_SPACE} lei`,
    ],
    ["a word joiner between number and unit", `500${WORD_JOINER}lei`],
    ["a zero-width space inside the unit", `500 l${ZERO_WIDTH_SPACE}ei`],
    ["a zero-width space inside inclus", `inc${ZERO_WIDTH_SPACE}lus`],
    ["a soft hyphen inside inclus", `inclu${SOFT_HYPHEN}s`],
    ["a soft hyphen inside the unit", `500 le${SOFT_HYPHEN}i`],
    ["a zero-width space inside procent", `pro${ZERO_WIDTH_SPACE}cent`],
  ])("refuses %s", (_label, text) => {
    expect(codeOf(text), shown(text)).toBe(AMOUNT_CODE);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The matrix of forms that must be refused (green)

/** The digits of one script, from the ASCII ones. All are `\p{Nd}` and stable under NFC. */
const DIGIT_SCRIPT_ZEROS: readonly number[] = [
  0x30, // ASCII
  0x660, // Arabic-Indic
  0x6f0, // extended Arabic-Indic
  0x966, // Devanagari
  0xe50, // Thai
  0xff10, // fullwidth
];

function inScript(digits: string, zero: number): string {
  return Array.from(digits, (digit) =>
    String.fromCodePoint(zero + Number(digit)),
  ).join("");
}

const aNumber = fc
  .tuple(
    fc.constantFrom(...DIGIT_SCRIPT_ZEROS),
    fc.array(fc.integer({ min: 0, max: 9 }).map(String), {
      minLength: 1,
      maxLength: 4,
    }),
    fc.constantFrom("", ".", ",", " ", NBSP, NARROW_NBSP),
    fc.array(fc.integer({ min: 0, max: 9 }).map(String), {
      minLength: 1,
      maxLength: 3,
    }),
  )
  .map(
    ([zero, head, separator, tail]) =>
      inScript(head.join(""), zero) +
      separator +
      (separator === "" ? "" : inScript(tail.join(""), zero)),
  );

const MONEY_WORDS = [
  "lei",
  "leu",
  "mdl",
  "ron",
  "bani",
  "eur",
  "euro",
  "usd",
  "dolari",
] as const;
const MONEY_SYMBOLS = ["\u20ac", "$", "\u00a3", "\u20bd"] as const;

/** A unit written with a random case per letter. */
const aUnit = fc
  .tuple(
    fc.constantFrom(...MONEY_WORDS),
    fc.array(fc.boolean(), { minLength: 9, maxLength: 9 }),
  )
  .map(([word, flips]) =>
    Array.from(word, (letter, index) =>
      flips[index] === true ? letter.toUpperCase() : letter,
    ).join(""),
  );

const aSpacer = fc.constantFrom(
  "",
  " ",
  "  ",
  NBSP,
  NARROW_NBSP,
  "\u2009",
  "\u3000",
  ` ${NBSP}`,
);

const aPlainWord = fc.constantFrom(
  "Sertar",
  "Colec" + T_COMMA + "ie",
  "Blum",
  "Hettich",
  "Co" + S_COMMA,
  "Organizator",
  "cm",
  "mm",
  "4D",
);

describe("a number beside a money unit is refused, whatever the digits, grouping, spacing, case and order", () => {
  it("refuses every combination of digit script, grouping, spacer, unit and order", () => {
    fc.assert(
      fc.property(
        aNumber,
        fc.oneof(aUnit, fc.constantFrom(...MONEY_SYMBOLS)),
        aSpacer,
        fc.boolean(),
        aPlainWord,
        fc.constantFrom<CreatedRowTextField>(...FIELDS),
        (amount, unit, spacer, isUnitFirst, word, field) => {
          // "Euro 450" names a model, so "euro" states an amount only after its number.
          const isUnitBeforeNumber =
            isUnitFirst && unit.toLowerCase() !== "euro";
          const stated = isUnitBeforeNumber
            ? `${unit}${spacer}${amount}`
            : `${amount}${spacer}${unit}`;

          expect(codeOf(`${word} ${stated}`, field)).toBe(AMOUNT_CODE);
        },
      ),
      { numRuns: RUNS, seed: SEED },
    );
  });

  it("refuses the amount wherever in the text it stands", () => {
    fc.assert(
      fc.property(
        fc.array(aPlainWord, { maxLength: 4 }),
        fc.array(aPlainWord, { maxLength: 4 }),
        (before, after) => {
          const text = [...before, "1.000 lei", ...after].join(" ");

          expect(codeOf(text)).toBe(AMOUNT_CODE);
        },
      ),
      { numRuns: RUNS, seed: SEED },
    );
  });

  it.each([
    "1.000 lei",
    "1,000.50 lei",
    "1 000 lei",
    `1${NBSP}000${NBSP}lei`,
    `1${NARROW_NBSP}000${NARROW_NBSP}lei`,
    "lei500",
    "LEI500",
    "10 BANI",
    "5\u20ac",
    "\u20ac5",
    "\u20ac 5",
    "\uff15\uff10\uff10 lei",
    "500 lei.",
    "(500 lei)",
    "de la 500 lei",
    "5 0 0 lei",
  ])("refuses %j", (text) => {
    expect(codeOf(text)).toBe(AMOUNT_CODE);
  });
});

describe("a percent sign or a percent word is refused in every case and place", () => {
  const SIGNS = ["%", "\uff05", "\u066a", "\ufe6a", "\u2030", "\u2031"];

  it.each(SIGNS)("refuses the sign U+%s anywhere in a plain name", (sign) => {
    for (const text of [
      sign,
      `10${sign}`,
      `10 ${sign}`,
      `Sertar ${sign} nou`,
    ]) {
      expect(codeOf(text)).toBe(AMOUNT_CODE);
    }
  });

  it.each(["procent", "PROCENT", "Procente", "procentul", "procentelor"])(
    "refuses the word %s beside any punctuation or space",
    (word) => {
      for (const text of [
        word,
        `Un ${word}`,
        `${word}.`,
        `(${word})`,
        `x-${word}-y`,
        `10 ${word}`,
      ]) {
        expect(codeOf(text)).toBe(AMOUNT_CODE);
      }
    },
  );
});

describe("an inclusion word is refused in every case and place", () => {
  const WORDS = [
    "inclus",
    `inclus${A_BREVE}`,
    "incluse",
    "inclusa",
    "inclusiv",
    `incluz${A_CIRCUMFLEX}nd`,
    "incluzand",
  ];

  it.each(WORDS)(
    "refuses %s in any case beside punctuation, digits and hyphens",
    (word) => {
      for (const variant of [
        word,
        word.toUpperCase(),
        `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`,
      ]) {
        for (const text of [
          variant,
          `Montaj ${variant}`,
          `${variant}.`,
          `tot-${variant}`,
          `${variant}_`,
          `2${variant}`,
          `${variant}2`,
          `(${variant})`,
        ]) {
          expect(codeOf(text)).toBe(AMOUNT_CODE);
        }
      }
    },
  );
});

// ---------------------------------------------------------------------------------------------------------------------
// The plain words that must be let through (false refusals)

describe("plain words and bare numbers are not refused", () => {
  it.each([
    "Inclinat",
    "Exclus",
    "Exclusiv",
    "Reinclus",
    "Neinclus",
    "Conclus",
    "Include",
    "Procentual",
    "Procentaj",
    "Blum 2000",
    "Hettich 4D",
    "Sertar 60 cm",
    "Corp 600 mm",
    "Clasa 2",
    "2000",
    "lei",
    "bani",
    "euro",
    "$",
    "\u20ac",
  ])("lets %j through", (text) => {
    expect(codeOf(text)).toBe("ok");
    expect(codeOf(text, "description")).toBe("ok");
  });

  it("lets through any sentence of plain words, bare numbers and units without a number", () => {
    const aToken = fc.oneof(
      aPlainWord,
      fc.integer({ min: 0, max: 99_999 }).map(String),
      fc.constantFrom(
        "Inclinat",
        "Exclus",
        "Reinclus",
        "pentru",
        "sertare",
        "lei",
        "euro",
        "bani",
      ),
    );
    fc.assert(
      fc.property(
        fc.array(aToken, { minLength: 1, maxLength: 6 }),
        (tokens) => {
          const text = tokens.join(" ");
          // A number straight before or after a unit word states an amount; the sentence is only valid without that.
          const hasAmount =
            /\d\s*(?:lei|euro|bani)|(?:lei|euro|bani)\s*\d/iu.test(text);
          fc.pre(!hasAmount);

          expect(codeOf(text)).toBe("ok");
        },
      ),
      { numRuns: RUNS, seed: SEED },
    );
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The bounds, counted as the parser counts

describe("the bounds are the parser's, at every length around them", () => {
  const BOUNDS: readonly (readonly [CreatedRowTextField, number])[] = [
    ["name", MAX_BOOK_NAME_LENGTH],
    ["description", MAX_BOOK_DESCRIPTION_LENGTH],
  ];

  it.each(BOUNDS)(
    "accepts a %s of exactly the bound and refuses one unit more, as does the parser",
    (field, bound) => {
      for (const length of [bound - 1, bound, bound + 1, bound + 2]) {
        const text = "a".repeat(length);
        const judged = codeOf(text, field);
        const book =
          field === "name"
            ? withLinkedName(text)
            : withLinkedName("Nume", text);

        expect(judged === "ok").toBe(length <= bound);
        expect(parses(book)).toBe(length <= bound);
        if (length > bound) expect(judged).toBe("TEXT_TOO_LONG");
      }
    },
  );

  it.each(BOUNDS)(
    "counts a %s of astral characters as two units each, as the parser does",
    (field, bound) => {
      const astral = "\u{1F600}";
      for (const count of [bound / 2 - 1, bound / 2, bound / 2 + 1]) {
        const text = astral.repeat(count);
        const judged = codeOf(text, field);
        const book =
          field === "name"
            ? withLinkedName(text)
            : withLinkedName("Nume", text);

        expect(judged === "ok").toBe(parses(book));
        expect(judged === "ok").toBe(count * 2 <= bound);
      }
    },
  );

  it.each(BOUNDS)(
    "counts a %s after trimming, so padding does not make it too long",
    (field, bound) => {
      const padded = `   ${"a".repeat(bound)}   `;

      expect(judgeCreatedRowText(padded, field)).toEqual({
        ok: true,
        text: "a".repeat(bound),
      });
    },
  );
});

// ---------------------------------------------------------------------------------------------------------------------
// Agreement with the parsers, over arbitrary text

const SPECIAL_UNITS = [
  "\u0000",
  "\n",
  "\r",
  "\t",
  "\u0085",
  "\u2028",
  "\u2029",
  "\u202e",
  "\u2066",
  "\u200e",
  "\u061c",
  ZERO_WIDTH_SPACE,
  "\ufeff",
  SOFT_HYPHEN,
  "\u0306",
  "\u3164",
  "\ud800",
  "\udc00",
  " ",
  NBSP,
  "a",
  "b",
  "9",
  "%",
  A_BREVE,
] as const;

const anyText = fc
  .array(
    fc.oneof(
      fc.constantFrom(...SPECIAL_UNITS),
      fc.string({ unit: "grapheme-ascii", maxLength: 1 }),
      fc
        .integer({ min: 0, max: 0xffff })
        .map((code) => String.fromCharCode(code)),
    ),
    { maxLength: 24 },
  )
  .map((units) => units.join(""));

/** The parser tolerates a format character in text it holds; a judgement of new words refuses it, and refuses
 *  nothing else for its characters that the parser accepts. */
function expectForbiddenOnlyForAFormatCharacter(
  code: string,
  raw: string,
): void {
  if (code === "TEXT_FORBIDDEN_CHARACTER") expect(raw).toMatch(/\p{Cf}/u);
}

describe("what the judgement accepts, the parser accepts, and what the parser accepts the judgement does not refuse for its characters or bounds", () => {
  it.each(FIELDS)(
    "stores a judged %s that parses as a linked accessory's",
    (field) => {
      fc.assert(
        fc.property(anyText, (raw) => {
          const judged = judgeCreatedRowText(raw, field);
          fc.pre(judged.ok);

          const book =
            field === "name"
              ? withLinkedName(judged.text)
              : withLinkedName(
                  "Nume",
                  judged.text === "" ? undefined : judged.text,
                );

          expect(parses(book)).toBe(true);
        }),
        { numRuns: 600, seed: SEED },
      );
    },
  );

  it("never refuses, for its characters, composition, emptiness or length, a name the parser accepts", () => {
    fc.assert(
      fc.property(anyText, (raw) => {
        fc.pre(parses(withLinkedName(raw)));

        const code = codeOf(raw);
        expectForbiddenOnlyForAFormatCharacter(code, raw);
        expect(["TEXT_TOO_LONG", "TEXT_EMPTY"]).not.toContain(code);
      }),
      { numRuns: 600, seed: SEED },
    );
  });

  it("never refuses, for its characters, composition or length, a description the parser accepts", () => {
    fc.assert(
      fc.property(anyText, (raw) => {
        fc.pre(parses(withLinkedName("Nume", raw)));

        const code = codeOf(raw, "description");
        expectForbiddenOnlyForAFormatCharacter(code, raw);
        expect(code).not.toBe("TEXT_TOO_LONG");
      }),
      { numRuns: 600, seed: SEED },
    );
  });
});

describe("a created hardware class's words are held by the parser to the characters the judgement refuses", () => {
  function bookWithUnkeyedTier(name: string): PriceBook {
    const [first, ...rest] = BASE.hardware.tiers;
    if (first === undefined) throw new Error("no hardware tier");
    return {
      ...BASE,
      hardware: {
        ...BASE.hardware,
        tiers: [
          first,
          ...rest,
          {
            tierId: "hardware.created",
            ruleId: "hardware.created",
            name,
            description: "",
            perHingeMinor: 0,
            perDrawerMinor: 0,
            perPushToOpenMinor: 0,
            perLiftMinor: 0,
            perPushRunnerMinor: 0,
          },
        ],
      },
    };
  }

  it.each([
    ["a line feed", "Nou\nrand"],
    ["a right-to-left override", "Nou\u202eabc"],
    ["a lone surrogate", "Nou\ud800"],
    ["a decomposed letter", "Nou a\u0306"],
    ["a null", "Nou\u0000"],
  ])(
    "refuses an unkeyed tier named with %s, as it refuses a linked accessory named so",
    (_label, name) => {
      expect(codeOf(name)).toBe("TEXT_FORBIDDEN_CHARACTER");
      expect(parses(withLinkedName(name))).toBe(false);

      expect(parses(bookWithUnkeyedTier(name))).toBe(false);
    },
  );
});

// ---------------------------------------------------------------------------------------------------------------------
// Determinism and idempotence

describe("the judgement is deterministic and its stored form is a fixed point", () => {
  it.each(FIELDS)(
    "judges a %s the same twice and re-judges its stored text to itself",
    (field) => {
      fc.assert(
        fc.property(anyText, (raw) => {
          const first = judgeCreatedRowText(raw, field);
          const second = judgeCreatedRowText(raw, field);

          expect(second).toEqual(first);
          if (first.ok) {
            expect(first.text).toBe(first.text.trim());
            expect(judgeCreatedRowText(first.text, field)).toEqual(first);
          }
        }),
        { numRuns: 600, seed: SEED },
      );
    },
  );

  it("judges characters before length, and length before content", () => {
    expect(codeOf("500 lei\n")).toBe("TEXT_FORBIDDEN_CHARACTER");
    expect(codeOf(`${"a".repeat(MAX_BOOK_NAME_LENGTH)} 500 lei`)).toBe(
      "TEXT_TOO_LONG",
    );
  });
});
