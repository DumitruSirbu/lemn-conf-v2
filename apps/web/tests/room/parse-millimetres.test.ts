// Wave 7F2 S1b, criterion S1b-1 (ADR 0126): Step 1's fields take whole millimetres, digits only, read
// once at the form boundary and refused rather than stripped or rounded. The oracle below works in
// `BigInt`, so it cannot share a `Number(text)` shortcut with the parser — the shortcut that would read
// `"1e3"` and `"0x10"` as lengths.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  parseMillimetres,
  type MillimetresParse,
  type MillimetresRefusal,
} from "@/room/parse-millimetres";

const RUNS = 1000;

/** Every value up to here is swept exhaustively: it covers every wall and ceiling a room can have. */
const DENSELY_SWEPT_MM = 20_000;

const LARGEST_SAFE_MM = BigInt(Number.MAX_SAFE_INTEGER);

/** The most leading zeros criterion S1b-1 prefixes a value with. */
const MOST_LEADING_ZEROS = 3;

/** Whitespace a keyboard or a paste can put around a value; `String.prototype.trim` removes each. */
const SURROUNDING_WHITESPACE = [" ", "\t", "\n", "\u00A0", "\u202F"];

const ASCII_DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** The budget for reading a 10 000-character paste: a keystroke must never stall on the parser. */
const LONG_PASTE_BUDGET_MS = 50;

const LONG_PASTE_LENGTH = 10_000;

function refusal(reason: MillimetresRefusal): MillimetresParse {
  return { ok: false, reason };
}

/** Criterion S1b-1's grammar in integers: trimmed, ASCII digits only, positive, and safe. */
function expectedParse(text: string): MillimetresParse {
  const trimmed = text.trim();
  if (trimmed === "") return refusal("empty");
  if (!/^[0-9]+$/.test(trimmed)) return refusal("notDigits");
  const mm = BigInt(trimmed);
  if (mm > LARGEST_SAFE_MM) return refusal("notSafeInteger");
  if (mm === 0n) return refusal("notPositive");
  return { ok: true, mm: Number(mm) };
}

const whitespace = fc
  .array(fc.constantFrom(...SURROUNDING_WHITESPACE), { maxLength: 3 })
  .map((parts) => parts.join(""));

const leadingZeros = fc
  .integer({ min: 0, max: MOST_LEADING_ZEROS })
  .map((count) => "0".repeat(count));

/** Text holding at least one code unit outside `[0-9]` once trimmed — the population S1b refuses. */
const textWithANonDigit: fc.Arbitrary<string> = fc
  .tuple(
    fc.string({ unit: fc.constantFrom(...ASCII_DIGITS), maxLength: 6 }),
    fc.oneof(
      fc.constantFrom(
        ",",
        ".",
        " ",
        "-",
        "+",
        "e",
        "x",
        "m",
        "\u0663",
        "\uFF13",
      ),
      fc.string({ unit: "binary", minLength: 1, maxLength: 1 }),
    ),
    fc.string({ unit: fc.constantFrom(...ASCII_DIGITS), maxLength: 6 }),
  )
  .map(([before, other, after]) => `${before}${other}${after}`)
  .filter((text) => /[^0-9]/.test(text.trim()));

describe("parseMillimetres — the lengths a customer types", () => {
  it.each([
    ["3600", 3600],
    ["2600", 2600],
    ["3", 3],
    ["03600", 3600],
    ["0001", 1],
    [" 2605 ", 2605],
    ["\u00A03600\u00A0", 3600],
    ["9007199254740991", Number.MAX_SAFE_INTEGER],
  ] as const)("reads %j as %i mm", (text, mm) => {
    expect(parseMillimetres(text)).toEqual({ ok: true, mm });
  });
});

describe("parseMillimetres — refusals, each with its reason", () => {
  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["0", "notPositive"],
    ["000", "notPositive"],
    ["3,6", "notDigits"],
    ["3.6", "notDigits"],
    ["3,", "notDigits"],
    ["3.", "notDigits"],
    [",5", "notDigits"],
    [".45", "notDigits"],
    ["3600.0", "notDigits"],
    ["3 600", "notDigits"],
    ["\u0663\u0666\u0660\u0660", "notDigits"],
    ["\uFF13\uFF16\uFF10\uFF10", "notDigits"],
    ["+3600", "notDigits"],
    ["-3600", "notDigits"],
    ["1e3", "notDigits"],
    ["0x10", "notDigits"],
    ["3600mm", "notDigits"],
    ["abc", "notDigits"],
    ["9007199254740992", "notSafeInteger"],
    ["9007199254740993", "notSafeInteger"],
  ] as const satisfies readonly (readonly [string, MillimetresRefusal])[])(
    "refuses %j as %s",
    (text, reason) => {
      expect(parseMillimetres(text)).toEqual({ ok: false, reason });
    },
  );
});

describe("parseMillimetres — the grammar, over the whole safe range", () => {
  it(`reads every value from 1 to ${String(DENSELY_SWEPT_MM)} mm, with and without leading zeros`, () => {
    const misread: string[] = [];
    for (let mm = 1; mm <= DENSELY_SWEPT_MM; mm += 1) {
      for (const text of [String(mm), `000${String(mm)}`]) {
        const parsed = parseMillimetres(text);
        if (!parsed.ok || parsed.mm !== mm) misread.push(text);
      }
    }

    expect(misread).toEqual([]);
  });

  it("reads any positive safe integer, behind up to three zeros and inside surrounding whitespace", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
        leadingZeros,
        whitespace,
        whitespace,
        (mm, zeros, before, after) => {
          const text = `${before}${zeros}${String(mm)}${after}`;

          expect(parseMillimetres(text)).toEqual({ ok: true, mm });
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("refuses every text holding a character that is not an ASCII digit, and never calls it empty", () => {
    fc.assert(
      fc.property(textWithANonDigit, (text) => {
        expect(parseMillimetres(text)).toEqual(refusal("notDigits"));
      }),
      { numRuns: RUNS },
    );
  });

  it("refuses a digit string past 2^53 without throwing or rounding", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: LARGEST_SAFE_MM + 1n, max: 10n ** 40n }),
        (mm) => {
          expect(parseMillimetres(String(mm))).toEqual(
            refusal("notSafeInteger"),
          );
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("agrees with the integer oracle about any text at all", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string({ unit: fc.constantFrom(...ASCII_DIGITS, " ", ",") }),
          fc.string(),
        ),
        (text) => {
          expect(parseMillimetres(text)).toEqual(expectedParse(text));
        },
      ),
      { numRuns: RUNS },
    );
  });

  it(`reads a ${String(LONG_PASTE_LENGTH)}-character paste inside ${String(LONG_PASTE_BUDGET_MS)} ms`, () => {
    const pastes = [
      "1".repeat(LONG_PASTE_LENGTH),
      `${"1".repeat(LONG_PASTE_LENGTH - 1)}x`,
    ];

    const startedAt = performance.now();
    const parsed = pastes.map((text) => parseMillimetres(text));
    const elapsedMs = performance.now() - startedAt;

    expect(parsed).toEqual([refusal("notSafeInteger"), refusal("notDigits")]);
    expect(elapsedMs).toBeLessThan(LONG_PASTE_BUDGET_MS);
  });
});
