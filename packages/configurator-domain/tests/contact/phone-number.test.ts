import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  normalisePhoneNumber,
  type PhoneNumberResult,
} from "../../src/contact/phone-number.js";

/** Grouping characters, a no-break space, and format characters (direction marks, a soft hyphen). */
const IGNORED_CHARACTERS = [
  " ",
  "-",
  "(",
  ")",
  "\u00a0",
  "\u202f",
  "\u2007",
  "\u3000",
  "\u200e",
  "\u202e",
  "\u00ad",
] as const;

function digitString(length: number): fc.Arbitrary<string> {
  return fc
    .array(fc.integer({ min: 0, max: 9 }), {
      minLength: length,
      maxLength: length,
    })
    .map((digits) => digits.join(""));
}

const moldovanNational = (subscriberDigits: number) =>
  digitString(subscriberDigits).map((digits) => `0${digits}`);

const moldovanInternational = (subscriberDigits: number) =>
  digitString(subscriberDigits).map((digits) => `+373${digits}`);

/** A calling code that is not Moldova's, then enough digits to make `totalDigits` in all. */
const otherInternational = (totalDigits: number) =>
  fc
    .tuple(fc.integer({ min: 1, max: 9 }), digitString(totalDigits - 1))
    .map(([first, rest]) => `+${String(first)}${rest}`)
    .filter((number) => !number.startsWith("+373"));

/** `plain` with a run of grouping characters (possibly none) before, between and after every
 *  character. */
function withGrouping(plain: string): fc.Arbitrary<string> {
  const gap = fc
    .array(fc.constantFrom(...IGNORED_CHARACTERS), { maxLength: 2 })
    .map((characters) => characters.join(""));
  return fc
    .array(gap, { minLength: plain.length + 1, maxLength: plain.length + 1 })
    .map((gaps) =>
      gaps.reduce(
        (grouped, between, index) => grouped + between + (plain[index] ?? ""),
        "",
      ),
    );
}

function groupedAndPlain(
  plain: fc.Arbitrary<string>,
): fc.Arbitrary<[string, string]> {
  return plain.chain((text) =>
    withGrouping(text).map((grouped): [string, string] => [text, grouped]),
  );
}

function accepted(result: PhoneNumberResult): string {
  if (!result.ok) throw new Error(`refused with ${result.code}`);
  return result.normalForm;
}

function refusedCode(result: PhoneNumberResult): string {
  if (result.ok) throw new Error(`accepted as ${result.normalForm}`);
  return result.code;
}

describe("normalisePhoneNumber: accepted shapes", () => {
  it.each([
    ["079123456", "+37379123456"],
    ["079 123 456", "+37379123456"],
    ["+37379123456", "+37379123456"],
    ["+373 79 123 456", "+37379123456"],
    ["(079) 123-456", "+37379123456"],
    ["  079123456  ", "+37379123456"],
    ["+40 721 234 567", "+40721234567"],
    ["+1 (212) 555-0100", "+12125550100"],
    ["079\u00a0123\u00a0456", "+37379123456"],
    ["079\u202f123\u202f456", "+37379123456"],
    ["079\u2007123\u2007456", "+37379123456"],
    ["+373\u3000 79\u1680123456", "+37379123456"],
    ["\u200e+373 79 123 456\u200f", "+37379123456"],
    ["+40\u00ad721 234 567", "+40721234567"],
  ])("reads %j as %s", (entered, normalForm) => {
    expect(accepted(normalisePhoneNumber(entered))).toBe(normalForm);
  });

  it.each([
    ["the shortest international number, seven digits", "+1234567", true],
    ["six digits, one short of the shortest", "+123456", false],
    [
      "the longest international number, fifteen digits",
      "+123456789012345",
      true,
    ],
    ["sixteen digits, one past the longest", "+1234567890123456", false],
  ])("%s", (_name, entered, isAccepted) => {
    expect(normalisePhoneNumber(entered).ok).toBe(isAccepted);
  });

  it("tells an international number that is too short from one that is too long", () => {
    expect(refusedCode(normalisePhoneNumber("+123456"))).toBe(
      "PHONE_INTERNATIONAL_INCOMPLETE",
    );
    expect(refusedCode(normalisePhoneNumber("+1234567890123456"))).toBe(
      "PHONE_INTERNATIONAL_TOO_MANY_DIGITS",
    );
  });

  it("tells the Moldovan form from the international one, which frame 4B's sentence needs", () => {
    expect(refusedCode(normalisePhoneNumber("+39 12"))).toBe(
      "PHONE_INTERNATIONAL_INCOMPLETE",
    );
    expect(refusedCode(normalisePhoneNumber("+373 12"))).toBe(
      "PHONE_MOLDOVAN_INCOMPLETE",
    );
    expect(refusedCode(normalisePhoneNumber("0791"))).toBe(
      "PHONE_MOLDOVAN_INCOMPLETE",
    );
  });
});

function codePointLabel(character: string): string {
  return `U+${(character.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`;
}

describe("normalisePhoneNumber: every space separator is grouping", () => {
  const SPACE_SEPARATORS = Array.from(
    { length: 0x10000 },
    (_unused, codePoint) => String.fromCodePoint(codePoint),
  ).filter((character) => /^\p{Zs}$/u.test(character));

  it("finds the Unicode space separators the test sweeps", () => {
    expect(SPACE_SEPARATORS.length).toBeGreaterThanOrEqual(17);
  });

  it.each(
    SPACE_SEPARATORS.map(
      (character) => [codePointLabel(character), character] as const,
    ),
  )("reads %s between digits as grouping", (_label, character) => {
    expect(
      accepted(normalisePhoneNumber(`079${character}123${character}456`)),
    ).toBe("+37379123456");
  });
});

describe("normalisePhoneNumber: refused shapes", () => {
  it.each([
    ["nothing", ""],
    ["a plus alone", "+"],
    ["digits with no prefix", "79123456"],
    ["a calling code that starts with 0", "+0123456789"],
    ["a letter among the digits", "07912345a"],
    ["a plus that is not first", "079+123456"],
    ["two pluses", "++37379123456"],
    ["a dot as a grouping character", "079.123.456"],
    ["a non-ASCII digit", "+٣٧٣٧٩١٢٣٤٥٦"],
    ["a tab", "079\t123456"],
  ])("refuses %s as unrecognised", (_name, entered) => {
    expect(refusedCode(normalisePhoneNumber(entered))).toBe(
      "PHONE_FORMAT_UNRECOGNISED",
    );
  });

  it("refuses the 00 international prefix, which is not written with +", () => {
    expect(normalisePhoneNumber("00373 79 123 456").ok).toBe(false);
    expect(normalisePhoneNumber("0037379123456").ok).toBe(false);
  });

  it("refuses the national prefix alone as incomplete", () => {
    expect(refusedCode(normalisePhoneNumber("0"))).toBe(
      "PHONE_MOLDOVAN_INCOMPLETE",
    );
  });
});

describe("normalisePhoneNumber: properties", () => {
  const acceptedNumbers = [
    moldovanNational(8),
    moldovanInternational(8),
    otherInternational(7),
    otherInternational(11),
    otherInternational(15),
  ];

  describe.each(
    acceptedNumbers.map((arbitrary, arm) => [arm, arbitrary] as const),
  )("over accepted arm %i", (_arm, plain) => {
    propertyTest.prop([plain])(
      "normalising a normal form changes nothing",
      (entered) => {
        const normalForm = accepted(normalisePhoneNumber(entered));

        expect(accepted(normalisePhoneNumber(normalForm))).toBe(normalForm);
      },
    );

    propertyTest.prop([groupedAndPlain(plain)])(
      "grouping characters do not change the answer",
      ([unGrouped, grouped]) => {
        expect(normalisePhoneNumber(grouped)).toEqual(
          normalisePhoneNumber(unGrouped),
        );
      },
    );
  });

  propertyTest.prop([
    digitString(8),
    fc.constantFrom("0", "+373"),
    fc.constantFrom("0", "+373"),
  ])(
    "every Moldovan form of one subscriber yields the same normal form",
    (subscriberDigits, firstPrefix, secondPrefix) => {
      const first = accepted(
        normalisePhoneNumber(firstPrefix + subscriberDigits),
      );
      const second = accepted(
        normalisePhoneNumber(secondPrefix + subscriberDigits),
      );

      expect(first).toBe(`+373${subscriberDigits}`);
      expect(second).toBe(first);
    },
  );

  propertyTest.prop([fc.constantFrom("0", "+373"), digitString(7)])(
    "seven digits after a Moldovan prefix are refused as a Moldovan number that is incomplete",
    (prefix, subscriberDigits) => {
      expect(refusedCode(normalisePhoneNumber(prefix + subscriberDigits))).toBe(
        "PHONE_MOLDOVAN_INCOMPLETE",
      );
    },
  );

  propertyTest.prop([fc.constantFrom("0", "+373"), digitString(9)])(
    "nine digits after a Moldovan prefix are refused as a Moldovan number with too many",
    (prefix, subscriberDigits) => {
      expect(refusedCode(normalisePhoneNumber(prefix + subscriberDigits))).toBe(
        "PHONE_MOLDOVAN_TOO_MANY_DIGITS",
      );
    },
  );

  propertyTest.prop([otherInternational(6)])(
    "six digits of another country are refused as an international number that is incomplete",
    (entered) => {
      expect(refusedCode(normalisePhoneNumber(entered))).toBe(
        "PHONE_INTERNATIONAL_INCOMPLETE",
      );
    },
  );

  propertyTest.prop([otherInternational(16)])(
    "sixteen digits of another country are refused as an international number with too many",
    (entered) => {
      expect(refusedCode(normalisePhoneNumber(entered))).toBe(
        "PHONE_INTERNATIONAL_TOO_MANY_DIGITS",
      );
    },
  );

  const refusedNumbers = [
    moldovanNational(7),
    moldovanNational(9),
    moldovanInternational(7),
    moldovanInternational(9),
    otherInternational(6),
    otherInternational(16),
  ];

  describe.each(
    refusedNumbers.map((arbitrary, arm) => [arm, arbitrary] as const),
  )("over refused arm %i", (_arm, plain) => {
    propertyTest.prop([groupedAndPlain(plain)])(
      "grouping characters do not make a refused number acceptable",
      ([unGrouped, grouped]) => {
        const refusal = refusedCode(normalisePhoneNumber(unGrouped));

        expect(refusedCode(normalisePhoneNumber(grouped))).toBe(refusal);
      },
    );
  });
});
