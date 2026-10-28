// M10 P4b-c, adversarial sweep: the words of a created accessory against the character classes the shop's one-line
// notice cannot carry (control, line and paragraph separators, bidi embeddings, overrides and isolates), mixed into
// visible text at every position, and against safe Unicode that must keep working. The classes are enumerated from the
// Unicode ranges here, not from the parser's pattern.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { parsePriceBook } from "../../src/pricing/parse-price-book.js";
import {
  bookWithLinked,
  linkedRule,
} from "../support/linked-accessory-books.js";

function range(from: number, to: number): string[] {
  return Array.from({ length: to - from + 1 }, (_, offset) =>
    String.fromCodePoint(from + offset),
  );
}

const FORBIDDEN_CLASSES: readonly (readonly [string, readonly string[]])[] = [
  ["C0 controls", range(0x00, 0x1f)],
  ["DEL", range(0x7f, 0x7f)],
  ["C1 controls", range(0x80, 0x9f)],
  ["line and paragraph separators", range(0x2028, 0x2029)],
  ["bidi embeddings and overrides", range(0x202a, 0x202e)],
  ["bidi isolates", range(0x2066, 0x2069)],
];
const EVERY_FORBIDDEN = FORBIDDEN_CLASSES.flatMap(
  ([, characters]) => characters,
);

/** Built from code points: the Romanian diacritics, each of which a name may carry. */
function romanianLetters(): string {
  return String.fromCodePoint(
    0x103,
    0xe2,
    0xee,
    0x219,
    0x21b,
    0x20,
    0x102,
    0xc2,
    0xce,
    0x218,
    0x21a,
  );
}

const VISIBLE_SAFE_PIECES = [
  "Organizator",
  romanianLetters(),
  "Органайзер",
  "Ünïcödé façade",
  "\u{1F642}",
  "\u{1F468}\u200d\u{1F469}\u200d\u{1F467}",
  "1/2\u00a0inch",
  "a\u00a0b",
  "ş",
  `Lumin${String.fromCodePoint(0x103)} 12 V`,
];

const aSafeText = fc
  .array(
    fc.oneof(
      fc.constantFrom(...VISIBLE_SAFE_PIECES),
      fc.constantFrom(" ", "\u00a0", "\u200b", "\u200d", "-", ".", ","),
    ),
    { minLength: 1, maxLength: 6 },
  )
  .map((pieces) => pieces.join(""))
  .filter((text) => /[^\s\u200b-\u200d\ufeff]/u.test(text));

function parsed(amendment: Record<string, unknown>) {
  return parsePriceBook(
    bookWithLinked([{ ...linkedRule("plinth-light"), ...amendment }]),
  );
}

describe("each forbidden class, mixed into visible text, refuses the row", () => {
  it.each(FORBIDDEN_CLASSES)(
    "%s: every character of the class, in a name and in a description",
    (_, characters) => {
      for (const character of characters) {
        const code = character.codePointAt(0)?.toString(16);
        expect(
          parsed({ name: `Org${character}anizator` }).ok,
          `name U+${String(code)}`,
        ).toBe(false);
        expect(
          parsed({ description: `Unu${character}doi.` }).ok,
          `description U+${String(code)}`,
        ).toBe(false);
      }
    },
  );

  it("refuses wherever the character sits: first, last, between, or doubled", () => {
    fc.assert(
      fc.property(
        aSafeText,
        aSafeText,
        fc.constantFrom(...EVERY_FORBIDDEN),
        fc.constantFrom("name", "description"),
        fc.constantFrom("front", "back", "middle", "twice"),
        (before, after, forbidden, field, where) => {
          const text = {
            front: `${forbidden}${before}`,
            back: `${before}${forbidden}`,
            middle: `${before}${forbidden}${after}`,
            twice: `${forbidden}${before}${forbidden}`,
          }[where];

          expect(parsed({ [field]: text }).ok).toBe(false);
        },
      ),
      { numRuns: 1_000 },
    );
  });

  it("refuses a forbidden character in an otherwise arbitrary string, whatever surrounds it", () => {
    fc.assert(
      fc.property(
        fc.string({ unit: "binary", maxLength: 30 }),
        fc.constantFrom(...EVERY_FORBIDDEN),
        fc.string({ unit: "binary", maxLength: 30 }),
        (left, forbidden, right) => {
          expect(parsed({ name: `x${left}${forbidden}${right}` }).ok).toBe(
            false,
          );
          expect(
            parsed({ description: `${left}${forbidden}${right}` }).ok,
          ).toBe(false);
        },
      ),
      { numRuns: 1_000 },
    );
  });
});

describe("safe Unicode keeps working", () => {
  it("accepts accents, Cyrillic, emoji with joiners, no-break spaces and combining marks inside visible text", () => {
    fc.assert(
      fc.property(aSafeText, aSafeText, (name, description) => {
        fc.pre(name.length <= 80 && description.length <= 240);

        expect(parsed({ name, description }).ok).toBe(true);
      }),
      { numRuns: 1_000 },
    );
  });

  it.each(VISIBLE_SAFE_PIECES)(
    "accepts %j as a name and as a description",
    (piece) => {
      expect(parsed({ name: piece, description: piece }).ok).toBe(true);
    },
  );

  it("accepts a description of nothing visible, since only a name must show something", () => {
    expect(parsed({ description: "\u200b" }).ok).toBe(true);
    expect(parsed({ description: "" }).ok).toBe(true);
  });

  it("accepts ordinary spaces around visible text", () => {
    expect(parsed({ name: "  Organizator  " }).ok).toBe(true);
  });
});

describe("what parses is a single printable line by the notice's own class", () => {
  const LINE_BREAKING = /[\p{Cc}\p{Zl}\p{Zp}]/u;
  const BIDI_CONTROL = /[\u202a-\u202e\u2066-\u2069]/u;

  function expectSingleLine(text: string): void {
    expect(LINE_BREAKING.test(text)).toBe(false);
    expect(LINE_BREAKING.test(text.normalize("NFC"))).toBe(false);
    expect(BIDI_CONTROL.test(text)).toBe(false);
  }

  it("holds for every arbitrary string the parser lets through, as stored and in its NFC form", () => {
    fc.assert(
      fc.property(
        fc.string({ unit: "binary", maxLength: 60 }),
        fc.string({ unit: "binary", maxLength: 60 }),
        (name, description) => {
          const result = parsed({ name, description });
          if (!result.ok) return;
          const row = result.book.linkedAccessories[0];

          expectSingleLine(row?.name ?? "");
          expectSingleLine(row?.description ?? "");
        },
      ),
      { numRuns: 3_000 },
    );
  });

  it("holds over strings drawn from the sensitive code points only", () => {
    const sensitive = [
      ...EVERY_FORBIDDEN,
      "\u200b",
      "‎",
      "⁠",
      "\u00a0",
      "a",
      "́",
      "\ud800",
    ];
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...sensitive), { maxLength: 8 }),
        (characters) => {
          const result = parsed({ name: `n${characters.join("")}` });
          if (!result.ok) return;

          expectSingleLine(result.book.linkedAccessories[0]?.name ?? "");
        },
      ),
      { numRuns: 3_000 },
    );
  });
});
