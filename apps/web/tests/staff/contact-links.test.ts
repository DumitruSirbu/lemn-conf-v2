// The only builder of a staff `tel:` or `mailto:` target. Accepted values are generated from their parts, so the expected
// target is written down independently of the normaliser and the judge under test; refused values are a valid one with a
// single hostile character put in, so every refusal has a known cause.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { mailLinkOf, phoneLinkOf } from "@/staff/contact-links";

const SEED = 20261115;
const RUNS = 400;

const DIGIT = fc.constantFrom(...Array.from("0123456789"));
const NON_ZERO_DIGIT = fc.constantFrom(...Array.from("123456789"));
const ALPHANUMERIC = fc.constantFrom(
  ...Array.from(
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  ),
);
const LETTER = fc.constantFrom(
  ...Array.from("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"),
);

/** What people group a number with: spaces, a no-break space, hyphens, an en dash, round brackets. */
const SEPARATORS = [" ", "\u00A0", "-", "\u2013", "(", ")", ""] as const;

const HOSTILE_IN_A_PHONE = [
  "a",
  "Z",
  ";",
  ",",
  "?",
  "#",
  "*",
  "%",
  ":",
  "/",
  ".",
  "\n",
  "\r",
  "\t",
  "\u0000",
  "\u0661",
  "\u00E9",
  "\u202E",
  "\u200F",
  "\u2066",
  "\u200B",
  "\u00AD",
  "\u05BE",
  "\u{10D6E}",
  "\u{10EAD}",
  "\u2212",
] as const;

const HOSTILE_IN_AN_ADDRESS = [
  "?",
  "%",
  "&",
  "=",
  ",",
  ";",
  ":",
  "/",
  "\\",
  "#",
  "!",
  "<",
  ">",
  '"',
  "(",
  ")",
  " ",
  "\n",
  "\r",
  "\t",
  "@",
  "\u0000",
  "\u00E9",
  "\u0430",
  "\u202E",
] as const;

function digits(count: number): fc.Arbitrary<string> {
  return fc.array(DIGIT, { minLength: count, maxLength: count }).map(join);
}

function join(parts: readonly string[]): string {
  return parts.join("");
}

/** The characters of `plain`, each followed by a separator the normaliser ignores. */
function typedWithSeparators(plain: string): fc.Arbitrary<string> {
  return fc
    .array(fc.constantFrom(...SEPARATORS), {
      minLength: plain.length,
      maxLength: plain.length,
    })
    .map((separators) =>
      Array.from(plain)
        .map((char, at) => `${char}${separators[at] ?? ""}`)
        .join(""),
    );
}

interface TypedPhone {
  readonly typed: string;
  readonly normalForm: string;
}

const MOLDOVAN_SUBSCRIBER = fc
  .tuple(NON_ZERO_DIGIT, digits(7))
  .map(([first, rest]) => `${first}${rest}`);

const MOLDOVAN_TRUNK: fc.Arbitrary<TypedPhone> = MOLDOVAN_SUBSCRIBER.chain(
  (subscriber) =>
    typedWithSeparators(`0${subscriber}`).map((typed) => ({
      typed,
      normalForm: `+373${subscriber}`,
    })),
);

const MOLDOVAN_INTERNATIONAL: fc.Arbitrary<TypedPhone> =
  MOLDOVAN_SUBSCRIBER.chain((subscriber) =>
    typedWithSeparators(`+373${subscriber}`).map((typed) => ({
      typed,
      normalForm: `+373${subscriber}`,
    })),
  );

/** Seven to fifteen digits, calling code included, that do not begin with the Moldovan code. */
const OTHER_INTERNATIONAL: fc.Arbitrary<TypedPhone> = fc
  .tuple(NON_ZERO_DIGIT, fc.integer({ min: 6, max: 14 }))
  .chain(([first, restCount]) =>
    digits(restCount).map((rest) => `${first}${rest}`),
  )
  .filter((callingDigits) => !callingDigits.startsWith("373"))
  .chain((callingDigits) =>
    typedWithSeparators(`+${callingDigits}`).map((typed) => ({
      typed,
      normalForm: `+${callingDigits}`,
    })),
  );

const DIALLABLE_PHONE = fc.oneof(
  MOLDOVAN_TRUNK,
  MOLDOVAN_INTERNATIONAL,
  OTHER_INTERNATIONAL,
);

function withOneInserted(
  valid: string,
  hostile: readonly string[],
): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.integer({ min: 0, max: valid.length }),
      fc.constantFrom(...hostile),
    )
    .map(
      ([at, character]) =>
        `${valid.slice(0, at)}${character}${valid.slice(at)}`,
    );
}

const HOSTILE_NUMBER = DIALLABLE_PHONE.chain(({ typed }) =>
  withOneInserted(typed, HOSTILE_IN_A_PHONE),
);

describe("phoneLinkOf", () => {
  it.each([
    ["069 123 456", "tel:+37369123456"],
    ["+40 721 000 000", "tel:+40721000000"],
    ["078900555", "tel:+37378900555"],
    ["+373 78 900 555", "tel:+37378900555"],
  ])("dials %s as %s", (typed, href) => {
    expect(phoneLinkOf(typed)).toEqual({
      href,
      value: href.slice("tel:".length),
    });
  });

  it("links every typing of a number to tel: and its normal form, and nothing after it", () => {
    let linked = 0;

    fc.assert(
      fc.property(DIALLABLE_PHONE, ({ typed, normalForm }) => {
        const link = phoneLinkOf(typed);
        linked += 1;
        expect(link).toEqual({ href: `tel:${normalForm}`, value: normalForm });
      }),
      { seed: SEED, numRuns: RUNS },
    );

    expect(linked).toBe(RUNS);
  });

  it("covers the three shapes of a number: a trunk-prefix Moldovan one, a +373 one and another country's", () => {
    for (const arm of [
      MOLDOVAN_TRUNK,
      MOLDOVAN_INTERNATIONAL,
      OTHER_INTERNATIONAL,
    ]) {
      let linked = 0;

      fc.assert(
        fc.property(arm, ({ typed, normalForm }) => {
          expect(phoneLinkOf(typed)?.href).toBe(`tel:${normalForm}`);
          linked += 1;
        }),
        { seed: SEED, numRuns: 100 },
      );

      expect(linked).toBe(100);
    }
  });

  it.each([
    ["a right-to-left override", "+373\u202E78900555"],
    ["a left-to-right mark", "\u200E+373 78 900 555"],
    ["a right-to-left mark", "+373 78 900 555\u200F"],
    ["a first-strong isolate", "+373\u206678900555\u2069"],
    ["an Arabic letter mark", "+373\u061C78900555"],
    ["a zero-width space", "+373\u200B78900555"],
    ["a soft hyphen", "0789\u00AD00555"],
    ["a Hebrew maqaf", "069\u05BE123\u05BE456"],
    ["a Garay hyphen", "069\u{10D6E}123\u{10D6E}456"],
    ["an Old Hungarian hyphen", "069\u{10EAD}123\u{10EAD}456"],
    ["a minus sign", "069\u2212123456"],
    ["a figure dash outside the allowed range", "069\u2E3A123456"],
  ])(
    "draws no link for a number holding %s, which could read in another order than it dials",
    (_, typed) => {
      expect(phoneLinkOf(typed)).toBeNull();
    },
  );

  it("draws no link for a number with one hostile character put in, whatever its place", () => {
    let refused = 0;

    fc.assert(
      fc.property(HOSTILE_NUMBER, (typed) => {
        expect(phoneLinkOf(typed)).toBeNull();
        refused += 1;
      }),
      { seed: SEED, numRuns: RUNS },
    );

    expect(refused).toBe(RUNS);
  });

  it.each([
    "javascript:alert(1)",
    "tel:+37378900555",
    "+37378900555;ext=1",
    "+37378900555,1",
    "+37378900555?x=1",
    "+37378900555\nBcc: x",
    "+37378900555\r\n",
    "+373 78 900 55a",
    "\u0660\u0667\u0668\u0669\u0660\u0660\u0665\u0665\u0665",
    "0078900555",
    "+0123456789",
    "+123456",
    "+1234567890123456",
    "07890055",
    "0789005555",
    "",
    "   ",
  ])("draws no link for %j", (typed) => {
    expect(phoneLinkOf(typed)).toBeNull();
  });

  it("builds nothing but a tel: of a plus and seven to fifteen digits from any string it is given", () => {
    const phoneAlphabet = fc.oneof(
      { weight: 8, arbitrary: DIGIT },
      { weight: 3, arbitrary: fc.constantFrom("+", " ", "-", "(", ")", "0") },
      {
        weight: 1,
        arbitrary: fc.constantFrom(
          ...Array.from("a;,?#\n:/%"),
          "\u0661",
          "\u202E",
        ),
      },
    );
    const phoneish = fc
      .array(phoneAlphabet, { maxLength: 18 })
      .map((characters) => characters.join(""));
    let linked = 0;
    let refused = 0;
    const anyString = fc.oneof(
      phoneish,
      DIALLABLE_PHONE.map(({ typed }) => typed),
      HOSTILE_NUMBER,
      fc.string({ unit: "binary" }),
    );

    fc.assert(
      fc.property(anyString, (typed) => {
        const link = phoneLinkOf(typed);
        if (link === null) {
          refused += 1;
          return;
        }
        linked += 1;
        expect(link.href).toMatch(/^tel:\+[1-9][0-9]{6,14}$/);
        expect(link.href).toBe(`tel:${link.value}`);
      }),
      { seed: SEED, numRuns: 4000 },
    );

    expect(linked).toBeGreaterThanOrEqual(30);
    expect(refused).toBeGreaterThanOrEqual(30);
  });
});

/** A local part that begins and ends with a letter or digit and never holds two dots in a row. */
const LOCAL_PART = fc
  .array(
    fc.tuple(
      fc
        .array(ALPHANUMERIC, { minLength: 1, maxLength: 6 })
        .map((characters) => characters.join("")),
      fc.constantFrom(".", "_", "'", "+", "-"),
    ),
    { minLength: 0, maxLength: 3 },
  )
  .chain((joined) =>
    fc
      .array(ALPHANUMERIC, { minLength: 1, maxLength: 6 })
      .map(
        (last) =>
          joined.map(([part, glue]) => `${part}${glue}`).join("") +
          last.join(""),
      ),
  );

const DOMAIN = fc
  .tuple(
    fc.array(
      fc
        .array(ALPHANUMERIC, { minLength: 1, maxLength: 8 })
        .map((characters) => characters.join("")),
      { minLength: 1, maxLength: 3 },
    ),
    fc
      .array(LETTER, { minLength: 2, maxLength: 6 })
      .map((characters) => characters.join("")),
  )
  .map(([labels, topLevel]) => [...labels, topLevel].join("."));

const STORED_ADDRESS = fc
  .tuple(LOCAL_PART, DOMAIN)
  .map(([local, domain]) => `${local}@${domain}`);

const HOSTILE_ADDRESS = STORED_ADDRESS.chain((stored) =>
  withOneInserted(stored, HOSTILE_IN_AN_ADDRESS),
);

describe("mailLinkOf", () => {
  it.each([
    "ana.popescu@mail.md",
    "ana+kitchen@mail.md",
    "o'neil@mail.md",
    "ANA.Popescu@Mail.MD",
    "a_b@sub.mail.md",
  ])(
    "writes to %s at mailto: and the address, with nothing after it",
    (stored) => {
      expect(mailLinkOf(stored)).toEqual({
        href: `mailto:${stored}`,
        value: stored,
      });
    },
  );

  it("links every well-formed address to mailto: and the address as stored, case included", () => {
    let linked = 0;

    fc.assert(
      fc.property(STORED_ADDRESS, (stored) => {
        expect(mailLinkOf(stored)).toEqual({
          href: `mailto:${stored}`,
          value: stored,
        });
        linked += 1;
      }),
      { seed: SEED, numRuns: RUNS },
    );

    expect(linked).toBe(RUNS);
  });

  it("draws no link for an address with one hostile character put in, whatever its place", () => {
    let refused = 0;

    fc.assert(
      fc.property(HOSTILE_ADDRESS, (typed) => {
        expect(mailLinkOf(typed)).toBeNull();
        refused += 1;
      }),
      { seed: SEED, numRuns: RUNS },
    );

    expect(refused).toBe(RUNS);
  });

  it.each([
    "ana@mail.md?cc=boss@mail.md",
    "ana@mail.md?subject=x",
    "ana@mail.md%0Abcc:x@y.md",
    "ana%0A@mail.md",
    "ana@mail.md\n",
    "ana@mail.md\u200B",
    "\u00ADana@mail.md",
    "ana\u202E@mail.md",
    "ana@mail.md\nBcc: x@y.md",
    "ana @mail.md",
    " ana@mail.md",
    "ana@mail.md ",
    "an\u00E9@mail.md",
    "ana@m\u0430il.md",
    "ana@mail.md,boss@mail.md",
    "ana@mail.md;boss@mail.md",
    "mailto:ana@mail.md",
    "javascript:alert(1)//@mail.md",
    "<ana@mail.md>",
    "ana@@mail.md",
    "@mail.md",
    "ana@",
    "",
  ])("draws no link for %j", (stored) => {
    expect(mailLinkOf(stored)).toBeNull();
  });

  it.each([
    ["no dot in the domain", "ana@mail"],
    ["a leading dot in the local part", ".ana@mail.md"],
    ["two dots in a row in the local part", "an..a@mail.md"],
    ["two dots in a row in the domain", "ana@mail..md"],
    ["a one-letter top-level domain", "ana@mail.m"],
    ["a digit-only top-level domain", "ana@mail.12"],
    ["a trailing dot in the local part", "ana.@mail.md"],
    ["more than 254 characters", `${"a".repeat(250)}@mail.md`],
  ])(
    "draws no link when the allowed characters are all there but the judge refuses: %s",
    (_, stored) => {
      expect(mailLinkOf(stored)).toBeNull();
    },
  );

  it("builds nothing but mailto: and the string it was given, from any string", () => {
    const addressish = fc
      .array(
        fc.oneof(
          { weight: 8, arbitrary: ALPHANUMERIC },
          {
            weight: 3,
            arbitrary: fc.constantFrom("@", ".", "-", "_", "+", "'"),
          },
          {
            weight: 1,
            arbitrary: fc.constantFrom("?", "%", "\n", " ", "\u00E9", "A"),
          },
        ),
        { maxLength: 24 },
      )
      .map((characters) => characters.join(""));
    const anyString = fc.oneof(
      addressish,
      STORED_ADDRESS,
      HOSTILE_ADDRESS,
      fc.string({ unit: "binary" }),
    );
    let linked = 0;
    let refused = 0;

    fc.assert(
      fc.property(anyString, (typed) => {
        const link = mailLinkOf(typed);
        if (link === null) {
          refused += 1;
          return;
        }
        linked += 1;
        expect(link.href).toBe(`mailto:${typed}`);
        expect(link.value).toBe(typed);
        expect(link.href).toMatch(/^mailto:[A-Za-z0-9._'+-]+@[A-Za-z0-9.-]+$/);
      }),
      { seed: SEED, numRuns: 6000 },
    );

    expect(linked).toBeGreaterThanOrEqual(30);
    expect(refused).toBeGreaterThanOrEqual(30);
  });
});
