// Wave 7A adversarial QA — the form-boundary metres parser (ADR 0108 decision 4) against what a phone
// keyboard, a paste and a locale actually produce. Every expectation below is computed by an oracle
// that works in `BigInt`, so it cannot share a float shortcut with the parser, and the property runs
// over the whole safe-integer range rather than the five digits the round-trip sweep covers — a
// float-multiplying parser that rounds is exact below 2^53 / 1000 only by luck of the digits.
import { fc } from "@fast-check/vitest";
import { describe, expect, it, vi } from "vitest";

import {
  parseMetresToMillimetres,
  type MetresParse,
  type MetresRefusal,
} from "@/room/parse-metres";

const RUNS = 2000;

const MILLIMETRE_DECIMALS = 3;
const MILLIMETRES_PER_METRE = 1000n;
const LARGEST_SAFE_MM = BigInt(Number.MAX_SAFE_INTEGER);

/** Whitespace a phone keyboard, a paste from a document or a locale formatter can put around a value.
 *  `\u00A0` and `\u202F` are what `Intl` itself emits for `ro-RO` grouping. */
const NAMED_WHITESPACE = [
  ["a space", " "],
  ["a tab", "\t"],
  ["a line feed", "\n"],
  ["a CR LF", "\r\n"],
  ["a no-break space (U+00A0)", "\u00A0"],
  ["a narrow no-break space (U+202F)", "\u202F"],
  ["a thin space (U+2009)", "\u2009"],
  ["an ideographic space (U+3000)", "\u3000"],
  ["a byte-order mark (U+FEFF)", "\uFEFF"],
] as const;

const SURROUNDING_WHITESPACE = NAMED_WHITESPACE.map(([, space]) => space);

const ASCII_DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

function refusal(reason: MetresRefusal): MetresParse {
  return { ok: false, reason };
}

/** The punch list's rule in integers: whole metres times a thousand plus the first three decimals;
 *  a non-zero digit past the third is a fraction of a millimetre; zero is not positive. */
function expectedParse(text: string): MetresParse {
  const trimmed = text.trim();
  if (trimmed === "") return refusal("empty");
  const match = /^([0-9]+)(?:[.,]([0-9]+))?$/.exec(trimmed);
  if (match === null) return refusal("notANumber");
  const [, wholeMetres = "", decimals = ""] = match;
  if (/[1-9]/.test(decimals.slice(MILLIMETRE_DECIMALS))) {
    return refusal("notWholeMillimetres");
  }
  const mm =
    BigInt(wholeMetres) * MILLIMETRES_PER_METRE +
    BigInt(
      decimals.slice(0, MILLIMETRE_DECIMALS).padEnd(MILLIMETRE_DECIMALS, "0"),
    );
  if (mm === 0n) return refusal("notPositive");
  if (mm > LARGEST_SAFE_MM) return refusal("notANumber");
  return { ok: true, mm: Number(mm) };
}

/** `mm` as metres, in integers: 4100n → `4,100`. */
function metresText(mm: bigint, separator: "," | "."): string {
  const wholeMetres = mm / MILLIMETRES_PER_METRE;
  const decimals = String(mm % MILLIMETRES_PER_METRE).padStart(
    MILLIMETRE_DECIMALS,
    "0",
  );
  return `${String(wholeMetres)}${separator}${decimals}`;
}

function expectRefusedOrExactly(text: string, mm: number): void {
  const parsed = parseMetresToMillimetres(text);
  if (parsed.ok) expect(parsed.mm).toBe(mm);
}

// -------------------------------------------------------------------------------------------------
// Generators.
// -------------------------------------------------------------------------------------------------

const digits = (maxLength: number) =>
  fc.string({
    unit: fc.constantFrom(...ASCII_DIGITS),
    minLength: 1,
    maxLength,
  });

const whitespace = fc
  .array(fc.constantFrom(...SURROUNDING_WHITESPACE), { maxLength: 3 })
  .map((parts) => parts.join(""));

/** Well-formed metres with leading zeros, long decimals and surrounding whitespace. */
const metresLike: fc.Arbitrary<string> = fc
  .tuple(
    whitespace,
    digits(25),
    fc.option(fc.tuple(fc.constantFrom(",", "."), digits(25)), {
      nil: undefined,
    }),
    whitespace,
  )
  .map(
    ([before, whole, fraction, after]) =>
      `${before}${whole}${fraction === undefined ? "" : fraction.join("")}${after}`,
  );

/** Near-miss input: the characters a malformed length is made of. */
const nearMiss: fc.Arbitrary<string> = fc.string({
  unit: fc.constantFrom(
    ...ASCII_DIGITS,
    ...[",", ".", " ", "-", "+", "e", "E", "_", "m", "x"],
    "\u00A0",
    "\u202F",
    "\u2212",
    "\u0663",
    "\uFF13",
    "\u0969",
  ),
  maxLength: 12,
});

const anyText: fc.Arbitrary<string> = fc.oneof(
  metresLike,
  nearMiss,
  fc.string({ unit: "binary", maxLength: 12 }),
);

// =================================================================================================
// The oracle, everywhere.
// =================================================================================================

describe("parseMetresToMillimetres agrees with an integer-only reading of the rule", () => {
  it("over well-formed, near-miss and arbitrary Unicode text", () => {
    fc.assert(
      fc.property(anyText, (text) => {
        expect(parseMetresToMillimetres(text)).toStrictEqual(
          expectedParse(text),
        );
      }),
      { numRuns: RUNS * 5 },
    );
  });

  it("accepts only a safe positive integer, from ASCII digits and at most one separator", () => {
    let acceptedCount = 0;
    fc.assert(
      fc.property(anyText, (text) => {
        const parsed = parseMetresToMillimetres(text);
        if (!parsed.ok) return;
        acceptedCount += 1;

        expect(Number.isSafeInteger(parsed.mm)).toBe(true);
        expect(parsed.mm).toBeGreaterThan(0);
        expect(Object.is(parsed.mm, -0)).toBe(false);
        expect(text.trim()).toMatch(/^[0-9]+(?:[.,][0-9]+)?$/);
      }),
      { numRuns: RUNS * 5 },
    );

    // A third of the draws are well-formed metres, most of them inside the safe range.
    expect(acceptedCount).toBeGreaterThan(RUNS / 2);
  });
});

// =================================================================================================
// The round trip, past five digits.
// =================================================================================================

describe("parseMetresToMillimetres reads back every whole millimetre it could be handed", () => {
  const anySafeMm = fc.bigInt({ min: 1n, max: LARGEST_SAFE_MM });

  it.each([",", "."] as const)(
    "over the whole safe range, written with a decimal %j, with extra trailing zeros",
    (separator) => {
      fc.assert(
        fc.property(anySafeMm, fc.nat({ max: 20 }), (mm, extraZeros) => {
          const text = metresText(mm, separator) + "0".repeat(extraZeros);

          expect(parseMetresToMillimetres(text)).toStrictEqual({
            ok: true,
            mm: Number(mm),
          });
        }),
        { numRuns: RUNS },
      );
    },
  );

  it("over the whole safe range, written with leading zeros", () => {
    fc.assert(
      fc.property(
        anySafeMm,
        fc.integer({ min: 1, max: 20 }),
        (mm, leadingZeros) => {
          const text = "0".repeat(leadingZeros) + metresText(mm, ",");

          expect(parseMetresToMillimetres(text)).toStrictEqual({
            ok: true,
            mm: Number(mm),
          });
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("refuses the first value past the safe range rather than reading it as its neighbour", () => {
    expect(parseMetresToMillimetres("9007199254740,991")).toStrictEqual({
      ok: true,
      mm: Number.MAX_SAFE_INTEGER,
    });
    expect(parseMetresToMillimetres("9007199254740,992")).toStrictEqual(
      refusal("notANumber"),
    );
    expect(parseMetresToMillimetres("9007199254740,9910")).toStrictEqual({
      ok: true,
      mm: Number.MAX_SAFE_INTEGER,
    });
  });
});

// =================================================================================================
// What a keyboard, a paste and a locale produce.
// =================================================================================================

describe("parseMetresToMillimetres — digits that are not ASCII", () => {
  it.each([
    "\u0663,\u0666\u0660",
    "\uFF13,\uFF16\uFF10",
    "\u06F3",
    "\u0969",
    "\u{1D7D1}",
    "3,\uFF16",
    "\u0663",
  ])("refuses %j", (text) => {
    expect(parseMetresToMillimetres(text)).toStrictEqual(refusal("notANumber"));
  });
});

describe("parseMetresToMillimetres — whitespace around and inside", () => {
  it.each(NAMED_WHITESPACE)(
    "reads 3,60 surrounded by %s as 3600",
    (_name, space) => {
      expect(parseMetresToMillimetres(`${space}3,60${space}`)).toStrictEqual({
        ok: true,
        mm: 3600,
      });
    },
  );

  it.each([
    "3\u00A0600",
    "3\u202F600",
    "3\u2009600",
    "3 ,60",
    "3, 60",
    "3,6 0",
    "3,60 5",
  ])("refuses %j, whose whitespace is inside the value", (text) => {
    expect(parseMetresToMillimetres(text)).toStrictEqual(refusal("notANumber"));
  });
});

describe("parseMetresToMillimetres — separators", () => {
  it.each([
    ",",
    ".",
    ",,",
    "..",
    "3,,6",
    "3..6",
    "3,.6",
    "3.,6",
    "3.6.0",
    "3,6,0",
    "3,6.0",
    "1.234,5",
    "1,234.5",
  ])("refuses %j", (text) => {
    expect(parseMetresToMillimetres(text)).toStrictEqual(refusal("notANumber"));
  });

  // Not fixed by the punch list either way; whatever the parser answers, it must not be a room the
  // customer did not type.
  it.each([
    ["3,", 3000],
    ["3.", 3000],
    [",5", 500],
    [".45", 450],
  ] as const)("reads %j as nothing, or as exactly %i mm", (text, mm) => {
    expectRefusedOrExactly(text, mm);
  });
});

describe("parseMetresToMillimetres — signs, exponents, units and number syntax", () => {
  it.each([
    "-0",
    "+0",
    "\u22123",
    "3E3",
    "3e-3",
    "Infinity",
    "NaN",
    "0x10",
    "0b11",
    "1_000",
    "3,6m",
    "3,6 m",
    "3 m",
    "3,6\u00A0m",
  ])("refuses %j", (text) => {
    expect(parseMetresToMillimetres(text)).toStrictEqual(refusal("notANumber"));
  });
});

describe("parseMetresToMillimetres — zero, and the smallest lengths", () => {
  it.each(["00", "0,0", "0.000000", "000,000"])(
    "refuses %j as not positive",
    (text) => {
      expect(parseMetresToMillimetres(text)).toStrictEqual(
        refusal("notPositive"),
      );
    },
  );

  it("refuses 0,0001 as a fraction of a millimetre, and reads 0,001 as one millimetre", () => {
    expect(parseMetresToMillimetres("0,0001")).toStrictEqual(
      refusal("notWholeMillimetres"),
    );
    expect(parseMetresToMillimetres("0,001")).toStrictEqual({
      ok: true,
      mm: 1,
    });
  });

  it.each([
    ["03,60", 3600],
    ["0003", 3000],
    ["00,450", 450],
  ] as const)("reads %j, leading zeros and all, as %i mm", (text, mm) => {
    expect(parseMetresToMillimetres(text)).toStrictEqual({ ok: true, mm });
  });
});

describe("parseMetresToMillimetres — very long input", () => {
  const LONG = 10_000;

  it("reads ten thousand trailing zeros as the whole metres they follow", () => {
    expect(parseMetresToMillimetres(`3,${"0".repeat(LONG)}`)).toStrictEqual({
      ok: true,
      mm: 3000,
    });
  });

  it("refuses a non-zero digit ten thousand places past the millimetre", () => {
    expect(parseMetresToMillimetres(`3,000${"0".repeat(LONG)}1`)).toStrictEqual(
      refusal("notWholeMillimetres"),
    );
  });

  it("reads ten thousand leading zeros as nothing", () => {
    expect(parseMetresToMillimetres(`${"0".repeat(LONG)}3`)).toStrictEqual({
      ok: true,
      mm: 3000,
    });
  });

  it("refuses ten thousand ones, which no safe integer spells", () => {
    expect(parseMetresToMillimetres("1".repeat(LONG))).toStrictEqual(
      refusal("notANumber"),
    );
  });
});

// =================================================================================================
// Worked on the digit string.
// =================================================================================================

/** Metres whose millimetre count a `float × 1000` misses: `1.005 * 1000` is `1004.9999999999999`, and
 *  the two long ones sit where a double no longer holds three decimals. The last is the largest safe
 *  integer itself. */
const LENGTHS_NO_FLOAT_PRODUCT_LANDS_ON = [
  ["1,005", 1005],
  ["8765432109876,543", 8_765_432_109_876_543],
  ["9007199254740,991", Number.MAX_SAFE_INTEGER],
] as const;

describe("parse-metres.ts works on the digit string", () => {
  // Rounding a float product is exact for every value the five-digit sweep covers, so a parser
  // rewritten as `Math.round(parseFloat(text) * 1000)` would pass it. Two things tell the digit
  // string from the float, and neither is the parser's source text: the lengths below are ones a
  // float product does not land on, and the float and rounding functions are watched while they
  // are read.
  it("multiplies nothing and uses no float, rounding or locale machinery", () => {
    const watched = [
      vi.spyOn(globalThis, "parseFloat"),
      vi.spyOn(Number, "parseFloat"),
      vi.spyOn(Math, "round"),
      vi.spyOn(Math, "floor"),
      vi.spyOn(Math, "trunc"),
      vi.spyOn(Number.prototype, "toFixed"),
      vi.spyOn(Number.prototype, "toPrecision"),
      vi.spyOn(Number.prototype, "toLocaleString"),
    ];

    const parsed = LENGTHS_NO_FLOAT_PRODUCT_LANDS_ON.map(([text]) =>
      parseMetresToMillimetres(text),
    );
    const callsPerWatchedFunction = watched.map((spy) => spy.mock.calls.length);
    for (const spy of watched) spy.mockRestore();

    expect(parsed).toStrictEqual(
      LENGTHS_NO_FLOAT_PRODUCT_LANDS_ON.map(([, mm]) => ({ ok: true, mm })),
    );
    expect(callsPerWatchedFunction).toEqual(watched.map(() => 0));
  });
});
