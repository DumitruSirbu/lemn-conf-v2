// Wave 8H, criteria 1 and 9, and the Zs and Cf rulings: the phone rule over swept digit counts, every space
// separator and every format character Unicode names, digits of other scripts, and the shapes that are
// neither form.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  normalisePhoneNumber,
  type PhoneNumberResult,
} from "../../src/contact/index.js";

const LAST_CODE_POINT = 0x10ffff;
const FIRST_ASTRAL_CODE_POINT = 0x10000;
const MOLDOVAN_SUBSCRIBER_DIGITS = 8;
const INTERNATIONAL_MIN_DIGITS = 7;
const INTERNATIONAL_MAX_DIGITS = 15;
const DIGITS = Array.from("0123456789");
const SWEPT_DIGIT_COUNTS = Array.from({ length: 31 }, (_, count) => count);

const MOLDOVAN_NATIONAL = "069123456";
const MOLDOVAN_INTERNATIONAL = "+37369123456";
const FOREIGN = "+40722123456";
const NORMAL_FORM = "+37369123456";

function codePointsMatching(category: RegExp): readonly string[] {
  const found: string[] = [];
  for (let codePoint = 0; codePoint <= LAST_CODE_POINT; codePoint += 1) {
    const character = String.fromCodePoint(codePoint);
    if (category.test(character)) found.push(character);
  }
  return found;
}

const SPACE_SEPARATORS = codePointsMatching(/^\p{Zs}$/u);
const FORMAT_CHARACTERS = codePointsMatching(/^\p{Cf}$/u);
const DASHES = codePointsMatching(/^\p{Pd}$/u);
const FOREIGN_SCRIPT_DIGITS = codePointsMatching(/^\p{Nd}$/u).filter(
  (digit) => !/^[0-9]$/.test(digit),
);

function insertedAtEveryPosition(
  text: string,
  inserted: string,
): readonly string[] {
  return Array.from(
    { length: text.length + 1 },
    (_, at) => `${text.slice(0, at)}${inserted}${text.slice(at)}`,
  );
}

/** Digits 1 to 9 in turn, so no run begins with 0 and none is all one digit. */
function digitRun(length: number): string {
  return Array.from({ length }, (_, index) => String((index % 9) + 1)).join("");
}

function codeOf(result: PhoneNumberResult): string {
  return result.ok ? "accepted" : result.code;
}

function expectedMoldovanOutcome(subscriberDigits: number): string {
  if (subscriberDigits < MOLDOVAN_SUBSCRIBER_DIGITS) {
    return "PHONE_MOLDOVAN_INCOMPLETE";
  }
  return subscriberDigits > MOLDOVAN_SUBSCRIBER_DIGITS
    ? "PHONE_MOLDOVAN_TOO_MANY_DIGITS"
    : "accepted";
}

function expectedInternationalOutcome(digits: number): string {
  if (digits < INTERNATIONAL_MIN_DIGITS) {
    return "PHONE_INTERNATIONAL_INCOMPLETE";
  }
  return digits > INTERNATIONAL_MAX_DIGITS
    ? "PHONE_INTERNATIONAL_TOO_MANY_DIGITS"
    : "accepted";
}

describe("8H criterion 1: the sweeps reach what they claim to", () => {
  it("finds Unicode's space separators, its format characters and other scripts' digits", () => {
    expect(SPACE_SEPARATORS.length).toBeGreaterThanOrEqual(17);
    expect(FORMAT_CHARACTERS.length).toBeGreaterThanOrEqual(150);
    expect(FOREIGN_SCRIPT_DIGITS.length).toBeGreaterThanOrEqual(600);
  });

  it("holds format characters outside the BMP, which a UTF-16 unit walk would miss", () => {
    const astral = FORMAT_CHARACTERS.filter(
      (character) => (character.codePointAt(0) ?? 0) >= FIRST_ASTRAL_CODE_POINT,
    );

    expect(astral.length).toBeGreaterThanOrEqual(100);
  });
});

describe("8H criterion 1: every space separator and every format character is unseen", () => {
  it.each([MOLDOVAN_NATIONAL, MOLDOVAN_INTERNATIONAL])(
    "gives %s one normal form with any of them at any position",
    (typed) => {
      const otherForms = [...SPACE_SEPARATORS, ...FORMAT_CHARACTERS]
        .flatMap((character) => insertedAtEveryPosition(typed, character))
        .map((spelt) => normalisePhoneNumber(spelt))
        .filter((result) => !result.ok || result.normalForm !== NORMAL_FORM);

      expect(otherForms).toEqual([]);
    },
  );

  it("is unmoved by a run of them, as a pasted number carries", () => {
    const otherForms = [...SPACE_SEPARATORS, ...FORMAT_CHARACTERS]
      .flatMap((character) =>
        insertedAtEveryPosition(MOLDOVAN_NATIONAL, character.repeat(3)),
      )
      .map((spelt) => normalisePhoneNumber(spelt))
      .filter((result) => !result.ok || result.normalForm !== NORMAL_FORM);

    expect(otherForms).toEqual([]);
  });

  it("leaves a foreign number's digits alone", () => {
    const otherForms = FORMAT_CHARACTERS.flatMap((character) =>
      insertedAtEveryPosition(FOREIGN, character),
    )
      .map((spelt) => normalisePhoneNumber(spelt))
      .filter((result) => !result.ok || result.normalForm !== FOREIGN);

    expect(otherForms).toEqual([]);
  });
});

describe("8H criteria 1 and 9: each digit count gets the code of the form it was written in", () => {
  it.each(["0", "+373"])(
    "judges %s and a swept count of digits as a Moldovan number",
    (prefix) => {
      const outcomes = SWEPT_DIGIT_COUNTS.map((count) =>
        codeOf(normalisePhoneNumber(`${prefix}${digitRun(count)}`)),
      );

      expect(outcomes).toEqual(SWEPT_DIGIT_COUNTS.map(expectedMoldovanOutcome));
    },
  );

  it("judges + and a swept count of digits as an international number", () => {
    const counts = SWEPT_DIGIT_COUNTS.filter((count) => count > 0);

    const outcomes = counts.map((count) =>
      codeOf(normalisePhoneNumber(`+${digitRun(count)}`)),
    );

    expect(outcomes).toEqual(counts.map(expectedInternationalOutcome));
  });

  it("reads +37 as an unfinished international number and +373 as an unfinished Moldovan one", () => {
    expect(codeOf(normalisePhoneNumber("+3"))).toBe(
      "PHONE_INTERNATIONAL_INCOMPLETE",
    );
    expect(codeOf(normalisePhoneNumber("+37"))).toBe(
      "PHONE_INTERNATIONAL_INCOMPLETE",
    );
    expect(codeOf(normalisePhoneNumber("+373"))).toBe(
      "PHONE_MOLDOVAN_INCOMPLETE",
    );
  });

  it("carries a code and nothing else: no digit count and no typed value", () => {
    const refusals = ["0691234", "0691234567", "+3912", `+${digitRun(16)}`, "x"]
      .map((typed) => normalisePhoneNumber(typed))
      .map((result) => Object.keys(result).sort());

    expect(refusals).toEqual(refusals.map(() => ["code", "ok"]));
  });
});

describe("8H criterion 1: normalising is idempotent and yields E.164", () => {
  const grouping = fc.constantFrom("", " ", "-", "(", ")", "\u00a0", "\u200e");
  const phoneLike = fc
    .tuple(
      fc.constantFrom("0", "+373", "+", "+40", "00", ""),
      fc.array(fc.tuple(fc.constantFrom(...DIGITS), grouping), {
        minLength: 5,
        maxLength: 16,
      }),
    )
    .map(([prefix, digits]) => `${prefix}${digits.flat().join("")}`);

  it("generates numbers of both forms that are accepted, so the property below is not vacuous", () => {
    const accepted = fc
      .sample(phoneLike, { numRuns: 400, seed: 8 })
      .map((typed) => normalisePhoneNumber(typed))
      .flatMap((result) => (result.ok ? [result.normalForm] : []));

    expect(
      accepted.filter((form) => form.startsWith("+373")).length,
    ).toBeGreaterThan(5);
    expect(
      accepted.filter((form) => !form.startsWith("+373")).length,
    ).toBeGreaterThan(5);
  });

  propertyTest.prop([phoneLike])(
    "an accepted normal form is its own normal form, + and seven to fifteen digits",
    (typed) => {
      const first = normalisePhoneNumber(typed);
      if (!first.ok) return;

      expect(first.normalForm).toMatch(/^\+[1-9][0-9]{6,14}$/);
      expect(normalisePhoneNumber(first.normalForm)).toEqual(first);
    },
  );

  propertyTest.prop([
    fc.string({
      unit: fc.constantFrom(...DIGITS),
      minLength: MOLDOVAN_SUBSCRIBER_DIGITS,
      maxLength: MOLDOVAN_SUBSCRIBER_DIGITS,
    }),
  ])("0 and +373 before the same eight digits are one number", (subscriber) => {
    expect(normalisePhoneNumber(`0${subscriber}`)).toEqual(
      normalisePhoneNumber(`+373${subscriber}`),
    );
  });
});

// QA finding 1. A Moldovan subscriber number is let begin with 0, so the two spellings the wave refuses
// (`00` for `+`, and the 0 kept after `+373`; reading 3 and Q33, "refused today") are accepted at one
// length each, and a number nobody can dial is stored: "003731234" becomes "+37303731234".
describe("8H reading 3: a spelling the rule refuses is refused at every length", () => {
  it.each([
    ["00 for +", "00"],
    ["the 0 kept after +373", "+3730"],
  ])("refuses %s whatever follows", (_name, prefix) => {
    const accepted = SWEPT_DIGIT_COUNTS.map(
      (count) => `${prefix}${digitRun(count)}`,
    ).filter((typed) => normalisePhoneNumber(typed).ok);

    expect(accepted).toEqual([]);
  });
});

describe("8H criterion 1: what is neither form", () => {
  it.each([
    ["nothing", ""],
    ["only grouping", "( ) - \u00a0"],
    ["only format characters", "\u200e\u200f\u00ad"],
    ["a lone +", "+"],
    ["a calling code of 0", "+069123456"],
    ["two +", "++37369123456"],
    ["a + in the middle", "+373+69123456"],
    ["a + at the end", "37369123456+"],
    ["no prefix", "69123456"],
    ["a dot", "069.123.456"],
    ["a slash", "069/123456"],
    ["a tab", "069\t123456"],
    ["a line feed at the end", "069123456\n"],
    ["a minus sign", "069\u2212123456"],
    ["a hyphen bullet", "069\u2043123456"],
    ["a modifier minus", "069\u02d7123456"],
    ["an underscore", "069_123456"],
    ["a letter", "0691234S6"],
    ["an extension", "069123456x12"],
  ])("refuses %s as an unrecognised format", (_name, typed) => {
    expect(normalisePhoneNumber(typed)).toEqual({
      ok: false,
      code: "PHONE_FORMAT_UNRECOGNISED",
    });
  });

  it("refuses a digit of any other script in place of an ASCII one", () => {
    const accepted = FOREIGN_SCRIPT_DIGITS.flatMap((digit) => [
      `06912345${digit}`,
      `${digit}69123456`,
      `+3736912345${digit}`,
      digit.repeat(9),
    ]).filter((typed) => normalisePhoneNumber(typed).ok);

    expect(accepted).toEqual([]);
  });

  it("answers for a million characters without stalling", () => {
    const LONG = 1_000_000;

    expect(codeOf(normalisePhoneNumber(`0${"7".repeat(LONG)}`))).toBe(
      "PHONE_MOLDOVAN_TOO_MANY_DIGITS",
    );
    expect(codeOf(normalisePhoneNumber("0".repeat(LONG)))).toBe(
      "PHONE_MOLDOVAN_SECOND_ZERO",
    );
    expect(codeOf(normalisePhoneNumber(" ".repeat(LONG)))).toBe(
      "PHONE_FORMAT_UNRECOGNISED",
    );
    expect(
      normalisePhoneNumber(`0${"\u200b-(".repeat(LONG / 4)}69123456`),
    ).toEqual({
      ok: true,
      normalForm: NORMAL_FORM,
    });
  });
});

// Criteria 16 and 22 (QA finding 1 and the logic review, ruled): the digits after the prefix do not begin
// with 0, and a number that does is refused by a code of its own, judged before the count at any length,
// since nothing completes it and it is not a number with too many digits.
describe("8H criteria 16 and 22: a second 0 has its own code, at any length", () => {
  const PREFIXES = ["0", "+373"] as const;
  const COUNTS_FROM_ONE = SWEPT_DIGIT_COUNTS.filter((count) => count > 0);

  describe.each(PREFIXES)("after %s", (prefix) => {
    it("accepts eight digits beginning with each of 1 to 9 and refuses a second 0 by its own code", () => {
      const outcomes = DIGITS.map((first) =>
        codeOf(normalisePhoneNumber(`${prefix}${first}9123456`)),
      );

      expect(outcomes).toEqual([
        "PHONE_MOLDOVAN_SECOND_ZERO",
        ...Array.from({ length: 9 }, () => "accepted"),
      ]);
    });

    it("stores the eight digits after +373 for each first digit it accepts", () => {
      const forms = DIGITS.slice(1).map((first) =>
        normalisePhoneNumber(`${prefix}${first}9123456`),
      );

      expect(forms).toEqual(
        DIGITS.slice(1).map((first) => ({
          ok: true,
          normalForm: `+373${first}9123456`,
        })),
      );
    });

    it("gives a second 0 its code at every digit count: the 0 is judged before the count", () => {
      const outcomes = COUNTS_FROM_ONE.map((count) =>
        codeOf(normalisePhoneNumber(`${prefix}0${digitRun(count - 1)}`)),
      );

      expect(outcomes).toEqual(
        COUNTS_FROM_ONE.map(() => "PHONE_MOLDOVAN_SECOND_ZERO"),
      );
    });

    it("gives any run of zeros the same code", () => {
      const outcomes = COUNTS_FROM_ONE.map((count) =>
        codeOf(normalisePhoneNumber(`${prefix}${"0".repeat(count)}`)),
      );

      expect(outcomes).toEqual(
        COUNTS_FROM_ONE.map(() => "PHONE_MOLDOVAN_SECOND_ZERO"),
      );
    });

    it("is not talked round by grouping or format characters about the second 0, at any length", () => {
      const spelt = [
        `${prefix} (0)`,
        `${prefix} (0) 69`,
        `${prefix} (0) 69 123 45`,
        `${prefix} (0) 69 123 456`,
        `${prefix}-0-6912345678`,
        `${prefix}\u200b0\u200e6912345`,
        `${prefix}\u00a00 6912345`,
        `${prefix}\u20130\u2014 69 123 456`,
      ];

      expect(spelt.map((typed) => codeOf(normalisePhoneNumber(typed)))).toEqual(
        spelt.map(() => "PHONE_MOLDOVAN_SECOND_ZERO"),
      );
    });

    it("sees the second 0 through every space separator, dash and format character", () => {
      const missed = [...SPACE_SEPARATORS, ...DASHES, ...FORMAT_CHARACTERS]
        .flatMap((character) => [
          `${prefix}${character}0${character}6912345`,
          `${prefix}${character}0`,
        ])
        .filter(
          (typed) =>
            codeOf(normalisePhoneNumber(typed)) !==
            "PHONE_MOLDOVAN_SECOND_ZERO",
        );

      expect(missed).toEqual([]);
    });
  });

  it.each([
    ["00 for +", "00373 69 123 456"],
    ["00 for +, unfinished", "0037"],
    ["the 0 kept after the calling code", "+373 (0)69 123 456"],
    ["a Romanian number typed as at home after 0", "0 0722 123 456"],
  ])(
    "gives the spelling with %s the code that says what to change",
    (_name, typed) => {
      expect(normalisePhoneNumber(typed)).toEqual({
        ok: false,
        code: "PHONE_MOLDOVAN_SECOND_ZERO",
      });
    },
  );

  const anyDigits = fc.string({
    unit: fc.constantFrom(...DIGITS),
    maxLength: 18,
  });

  propertyTest.prop([
    fc.constantFrom("0", "+373", "00", "+3730", "00373", "+"),
    anyDigits,
  ])(
    "no accepted number, however it was written, is stored with a 0 after +373",
    (prefix, digits) => {
      const result = normalisePhoneNumber(`${prefix}${digits}`);
      if (!result.ok) return;

      expect(result.normalForm.startsWith("+3730")).toBe(false);
      expect(normalisePhoneNumber(result.normalForm)).toEqual(result);
    },
  );

  it("leaves a foreign number free to hold a 0 anywhere after its first digit", () => {
    expect(normalisePhoneNumber("+40 0722 123 456")).toEqual({
      ok: true,
      normalForm: "+400722123456",
    });
  });

  it("reads +373 as Moldova's however the digits are grouped: spacing makes no other country of it", () => {
    expect(normalisePhoneNumber("+3 730 6912345")).toEqual({
      ok: false,
      code: "PHONE_MOLDOVAN_SECOND_ZERO",
    });
  });

  it("does not call a calling code of 0 a second 0: that is neither form", () => {
    expect(codeOf(normalisePhoneNumber("+0069123456"))).toBe(
      "PHONE_FORMAT_UNRECOGNISED",
    );
  });
});

describe("8H criterion 22: incomplete means something completes it", () => {
  const LONGEST_COMPLETION = 15;

  function isCompletable(typed: string): boolean {
    return Array.from(
      { length: LONGEST_COMPLETION },
      (_, index) => index + 1,
    ).some((more) => normalisePhoneNumber(`${typed}${"1".repeat(more)}`).ok);
  }

  /** Every run of up to three digits, the empty one included. */
  const SHORT_RUNS = ["", ...DIGITS].flatMap((first) =>
    first === ""
      ? [""]
      : ["", ...DIGITS].flatMap((second) =>
          second === ""
            ? [first]
            : ["", ...DIGITS].map((third) => `${first}${second}${third}`),
        ),
  );

  const STARTS = ["0", "+373", "+"].flatMap((prefix) =>
    SHORT_RUNS.map((digits) => `${prefix}${digits}`),
  );

  it("sweeps every start of a number up to three digits long, in all three ways of writing one", () => {
    expect(SHORT_RUNS).toHaveLength(1 + 10 + 100 + 1000);
    expect(
      new Set(STARTS.map((typed) => codeOf(normalisePhoneNumber(typed)))),
    ).toEqual(
      new Set([
        "PHONE_MOLDOVAN_INCOMPLETE",
        "PHONE_MOLDOVAN_SECOND_ZERO",
        "PHONE_INTERNATIONAL_INCOMPLETE",
        "PHONE_FORMAT_UNRECOGNISED",
      ]),
    );
  });

  // The one start that can be completed and is not called incomplete is a lone "+", which is neither form
  // until a digit follows; the plan gives 8L the silence while it is typed.
  it("calls a start incomplete exactly when more digits make it a number, a lone + apart", () => {
    const INCOMPLETE = [
      "PHONE_MOLDOVAN_INCOMPLETE",
      "PHONE_INTERNATIONAL_INCOMPLETE",
    ];

    const misjudged = STARTS.filter(
      (typed) =>
        INCOMPLETE.includes(codeOf(normalisePhoneNumber(typed))) !==
        isCompletable(typed),
    );

    expect(misjudged).toEqual(["+"]);
  });

  const digitsOfAnyLength = fc.string({
    unit: fc.constantFrom(...DIGITS),
    maxLength: 16,
  });

  propertyTest.prop([
    fc.constantFrom("0", "+373", "+", "00", "+3730"),
    digitsOfAnyLength,
  ])(
    "at any length: an incomplete number can be completed, and a second 0 or too many digits cannot",
    (prefix, digits) => {
      const typed = `${prefix}${digits}`;
      const code = codeOf(normalisePhoneNumber(typed));
      fc.pre(code !== "accepted" && code !== "PHONE_FORMAT_UNRECOGNISED");

      expect(isCompletable(typed)).toBe(code.endsWith("_INCOMPLETE"));
    },
  );
});

// Ruling L-R1.4: the owner said "dashes" and named a kind. Any dash, Unicode's Pd, is grouping; a minus sign
// is not a dash.
describe("8H ruling on dashes: any dash is grouping, and a minus sign is not one", () => {
  it("finds Unicode's dashes, the keyboard's hyphen and the ones a pasted number carries among them", () => {
    expect(DASHES.length).toBeGreaterThanOrEqual(20);
    expect(DASHES).toEqual(
      expect.arrayContaining([
        "-",
        "\u2010",
        "\u2011",
        "\u2012",
        "\u2013",
        "\u2014",
        "\uff0d",
      ]),
    );
    expect(DASHES).not.toContain("\u2212");
  });

  it.each([MOLDOVAN_NATIONAL, MOLDOVAN_INTERNATIONAL])(
    "gives %s one normal form with any dash at any position",
    (typed) => {
      const otherForms = DASHES.flatMap((dash) =>
        insertedAtEveryPosition(typed, dash),
      )
        .map((spelt) => normalisePhoneNumber(spelt))
        .filter((result) => !result.ok || result.normalForm !== NORMAL_FORM);

      expect(otherForms).toEqual([]);
    },
  );

  it("refuses a minus sign at every position of a number that is otherwise right", () => {
    const accepted = [MOLDOVAN_NATIONAL, MOLDOVAN_INTERNATIONAL, FOREIGN]
      .flatMap((typed) => insertedAtEveryPosition(typed, "\u2212"))
      .filter((spelt) => normalisePhoneNumber(spelt).ok);

    expect(accepted).toEqual([]);
  });

  it("does not let a dash stand for the + of an international number", () => {
    const accepted = DASHES.map((dash) => `${dash}37369123456`).filter(
      (spelt) => normalisePhoneNumber(spelt).ok,
    );

    expect(accepted).toEqual([]);
  });
});
