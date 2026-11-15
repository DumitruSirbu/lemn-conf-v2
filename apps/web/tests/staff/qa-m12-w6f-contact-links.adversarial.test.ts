// Adversarial QA of M12 W6f's link builders (ADR 0185 decision 7, S3). The implementer's `contact-links.test.ts` inserts one
// hostile ASCII/BMP character into a valid value; this file attacks what that cannot reach: the length boundary of an
// address, every non-ASCII look-alike swapped for a valid character, the digit boundaries of a phone, hostile typing of
// the `tel:` form (extension, `00` prefix, `+` alone), and the builders' own guarantees on huge or malformed text.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { mailLinkOf, phoneLinkOf } from "@/staff/contact-links";

const SEED = 20261115;

const CHARACTERS_THAT_LOOK_LIKE_A_DIGIT = [
  "٠", // Arabic-Indic zero
  "۷", // Extended Arabic-Indic seven
  "१", // Devanagari one
  "７", // fullwidth seven
  "\u{1D7D5}", // mathematical double-struck nine
  "①", // circled digit one
  "²", // superscript two
] as const;

const CHARACTERS_THAT_LOOK_LIKE_AN_ADDRESS_PART = [
  "а", // Cyrillic a
  "ａ", // fullwidth a
  "＠", // fullwidth @
  "﹫", // small commercial at
  "。", // ideographic full stop: a URL parser reads it as a dot
  "．", // fullwidth full stop
  "﹒", // small full stop
  "․", // one dot leader
  "K", // Kelvin sign (folds to k)
  "ſ", // long s (folds to s)
  "∕", // division slash
  "／", // fullwidth solidus
  "？", // fullwidth question mark
  "％", // fullwidth percent
  "\u200B", // zero-width space
  "\u202E", // right-to-left override
  "\u0000",
] as const;

const VALID_MAIL = "ana.popescu@mail.md";
const VALID_PHONE_TYPED = "+373 69 123 456";

function withCharacterAt(
  value: string,
  at: number,
  replacement: string,
): string {
  return `${value.slice(0, at)}${replacement}${value.slice(at + 1)}`;
}

function digitPositionsOf(value: string): number[] {
  return Array.from(value).flatMap((char, at) =>
    /[0-9]/.test(char) ? [at] : [],
  );
}

const DIGIT = fc.constantFrom(...Array.from("0123456789"));
const NON_ZERO_DIGIT = fc.constantFrom(...Array.from("123456789"));
const ALPHANUMERIC = fc.constantFrom(
  ...Array.from(
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  ),
);
// What a person types between digits: a space, a no-break space, a hyphen, a general-punctuation dash, round brackets.
const PHONE_SEPARATORS = [
  "",
  " ",
  "\u00A0",
  "-",
  "\u2010",
  "\u2013",
  "\u2015",
  "(",
  ")",
] as const;

function joined(parts: readonly string[]): string {
  return parts.join("");
}

/** A number the builder dials, typed with separators between its digits: the population the generator below never hits. */
const DIALLABLE_TYPING = fc
  .tuple(
    fc.constantFrom("+", "0"),
    NON_ZERO_DIGIT,
    fc.array(DIGIT, { minLength: 7, maxLength: 13 }),
    fc.array(fc.constantFrom(...PHONE_SEPARATORS), {
      minLength: 21,
      maxLength: 21,
    }),
  )
  .map(([lead, first, rest, separators]) => {
    const digitsTyped = [
      first,
      ...rest.slice(0, lead === "0" ? 7 : rest.length),
    ];
    const typed = digitsTyped.map(
      (digit, at) => `${digit}${separators[at] ?? ""}`,
    );
    return `${lead}${joined(typed)}`;
  });

/** An address of letters, digits and dots that the builder links as stored. */
const LINKABLE_ADDRESS_TYPING = fc
  .tuple(
    fc.array(ALPHANUMERIC, { minLength: 1, maxLength: 8 }),
    fc.array(ALPHANUMERIC, { minLength: 1, maxLength: 8 }),
    fc.array(fc.constantFrom(...Array.from("abcdefghijklmnopqrstuvwxyz")), {
      minLength: 2,
      maxLength: 6,
    }),
  )
  .map(
    ([local, label, topLevel]) =>
      `${joined(local)}@${joined(label)}.${joined(topLevel)}`,
  );

/** Linked and refused values mixed, so that a property's assertion is reached by both kinds. */
const ANY_PHONE_TYPING = fc.oneof(
  { weight: 1, arbitrary: DIALLABLE_TYPING },
  { weight: 1, arbitrary: fc.string({ unit: "binary", maxLength: 40 }) },
);
const ANY_ADDRESS_TYPING = fc.oneof(
  { weight: 1, arbitrary: LINKABLE_ADDRESS_TYPING },
  { weight: 1, arbitrary: fc.string({ unit: "binary", maxLength: 40 }) },
);

const MIN_LINKED_RUNS = 100;
const MIN_REFUSED_RUNS = 100;
const RUNS_PER_PROPERTY = 4000;

/**
 * Asks `answerOf` for every value of a list, then again for the whole list reversed and for each value on its own
 * between the others, and returns each value's answers: a builder that carries state from one call to the next (a global
 * regex's `lastIndex`) answers one value differently the second time.
 */
function answersAcrossInterleavedCalls<Answer>(
  values: readonly string[],
  answerOf: (value: string) => Answer,
): Answer[][] {
  const answersByValue = new Map<string, Answer[]>();
  const record = (value: string): void => {
    const answers = answersByValue.get(value) ?? [];
    answers.push(answerOf(value));
    answersByValue.set(value, answers);
  };
  values.forEach(record);
  [...values].reverse().forEach(record);
  values.forEach((value) => {
    record(value);
    record(value);
  });
  return values.map((value) => answersByValue.get(value) ?? []);
}

describe("mailLinkOf boundaries", () => {
  it("links an address of exactly 254 characters and refuses one of 255 (the account field's bound)", () => {
    const at254 = `${"a".repeat(254 - "@mail.md".length)}@mail.md`;
    const at255 = `${"a".repeat(255 - "@mail.md".length)}@mail.md`;

    expect(at254).toHaveLength(254);
    expect(mailLinkOf(at254)?.href).toBe(`mailto:${at254}`);
    expect(mailLinkOf(at255)).toBeNull();
  });

  it.each([
    ["two at-signs", "ana@popescu@mail.md"],
    ["an at-sign in the domain after a dot", "ana@mail.md@x.md"],
    ["a percent-encoded at-sign", "ana%40evil.md@mail.md"],
    ["a percent-encoded dot in the domain", "ana@mail%2Emd"],
    ["a trailing dot after the domain", "ana@mail.md."],
    ["a trailing dot in the local part", "ana.@mail.md"],
    ["two dots in a row, local", "a..na@mail.md"],
    ["two dots in a row, domain", "ana@mail..md"],
    ["a leading dot, domain", "ana@.mail.md"],
    ["a leading hyphen, domain label", "ana@-mail.md"],
    ["an IPv4 domain", "ana@1.2.3.4"],
    ["an IPv6 literal", "ana@[::1]"],
    ["a quoted local part", '"ana popescu"@mail.md'],
    ["an Internationalised domain written in Unicode", "ana@пример.рф"],
    ["an Internationalised local part", "ана@mail.md"],
    ["an Internationalised domain with an ideographic dot", "ana@mail。md"],
    ["a display name", "Ana <ana@mail.md>"],
    ["a mailto scheme inside", "mailto:ana@mail.md"],
    ["a second recipient with a comma", "ana@mail.md,x@mail.md"],
    ["a header injection by CRLF", "ana@mail.md\r\nBcc: x@mail.md"],
    ["a header injection by encoded CRLF", "ana@mail.md%0D%0ABcc:x@mail.md"],
    ["a fragment", "ana@mail.md#x"],
    ["a null byte", "ana@mail.md\u0000.evil"],
    ["a leading byte-order mark", "﻿ana@mail.md"],
    ["only an at-sign", "@"],
    ["only spaces", "   "],
    ["a lone dot domain", "ana@."],
  ])("draws no link for %s", (_, stored) => {
    expect(mailLinkOf(stored)).toBeNull();
  });

  it("links a punycode domain as the stored ASCII string, with nothing decoded or re-encoded", () => {
    expect(mailLinkOf("ana@xn--e1afmkfd.md")).toEqual({
      href: "mailto:ana@xn--e1afmkfd.md",
      value: "ana@xn--e1afmkfd.md",
    });
  });

  it("swaps every look-alike character in for each position of a valid address and never links it", () => {
    const attempts: string[] = [];
    for (const lookAlike of CHARACTERS_THAT_LOOK_LIKE_AN_ADDRESS_PART) {
      for (let at = 0; at < VALID_MAIL.length; at += 1) {
        attempts.push(withCharacterAt(VALID_MAIL, at, lookAlike));
      }
    }

    const linked = attempts.filter((typed) => mailLinkOf(typed) !== null);

    expect(attempts.length).toBeGreaterThan(300);
    expect(linked).toEqual([]);
  });

  it("answers a 1 MB value without a link, and in well under a second", () => {
    const huge = `${"a.".repeat(500_000)}@mail.md`;
    const startedAt = performance.now();

    expect(mailLinkOf(huge)).toBeNull();
    expect(mailLinkOf("@".repeat(1_000_000))).toBeNull();
    expect(mailLinkOf("a".repeat(1_000_000))).toBeNull();
    expect(performance.now() - startedAt).toBeLessThan(1000);
  });

  it("is deterministic: the same stored string gives an equal answer every time, between calls on other strings", () => {
    let linkedValues = 0;
    let refusedValues = 0;

    fc.assert(
      fc.property(
        fc.array(ANY_ADDRESS_TYPING, { minLength: 1, maxLength: 6 }),
        (stored) => {
          const answers = answersAcrossInterleavedCalls(stored, mailLinkOf);

          stored.forEach((typed, at) => {
            const answersOfTyped = answers[at] ?? [];
            expect(answersOfTyped.length).toBeGreaterThanOrEqual(2);
            for (const answer of answersOfTyped) {
              expect(answer).toEqual(answersOfTyped[0]);
            }
            if (answersOfTyped[0] === null) refusedValues += 1;
            else linkedValues += 1;
          });
        },
      ),
      { seed: SEED, numRuns: 500 },
    );

    expect(linkedValues).toBeGreaterThanOrEqual(MIN_LINKED_RUNS);
    expect(refusedValues).toBeGreaterThanOrEqual(MIN_REFUSED_RUNS);
  });

  it("never lets a mailto: href carry a character that starts a second part of a URL, from any Unicode string", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string({ unit: "binary", maxLength: 40 }),
          fc
            .constantFrom(...CHARACTERS_THAT_LOOK_LIKE_AN_ADDRESS_PART)
            .map((lookAlike) => `ana${lookAlike}@mail.md`),
        ),
        (typed) => {
          const link = mailLinkOf(typed);
          if (link === null) {
            return;
          }
          expect(link.href.slice("mailto:".length)).toBe(typed);
          expect(link.href).not.toMatch(/[?#%&=,;:/\\\s<>"\u0080-\u{10FFFF}]/u);
          expect(link.href.indexOf("@")).toBe(link.href.lastIndexOf("@"));
        },
      ),
      { seed: SEED, numRuns: 4000 },
    );
  });
});

describe("phoneLinkOf boundaries", () => {
  it("links the 7-digit and 15-digit international limits and refuses 6 and 16", () => {
    expect(phoneLinkOf("+1234567")?.href).toBe("tel:+1234567");
    expect(phoneLinkOf("+123456789012345")?.href).toBe("tel:+123456789012345");
    expect(phoneLinkOf("+123456")).toBeNull();
    expect(phoneLinkOf("+1234567890123456")).toBeNull();
  });

  it.each([
    ["an extension word", "+37369123456 ext. 12"],
    ["an extension with x", "+37369123456x12"],
    ["an extension with a hash", "+37369123456#12"],
    ["an extension with a semicolon", "+37369123456;ext=12"],
    ["an extension with a comma pause", "+37369123456,12"],
    ["a tel parameter", "+37369123456;phone-context=x"],
    ["the scheme itself", "tel:+37369123456"],
    ["a 00 international prefix", "0037369123456"],
    ["a 00 prefix before a plus", "00+37369123456"],
    ["a plus alone", "+"],
    ["two pluses", "++37369123456"],
    ["a plus in the middle", "373+69123456"],
    ["a plus at the end", "37369123456+"],
    [
      "the trunk zero kept inside the international form",
      "+373 (0) 69 123 456",
    ],
    ["a country code beginning with zero", "+0123456789"],
    ["a star", "*37369123456"],
    ["a percent-encoded plus", "%2B37369123456"],
    ["a plus written fullwidth", "＋37369123456"],
    ["a minus sign standing for a dash", "+373−69123456"],
    ["a tab inside", "+373\t69123456"],
    ["a line separator inside", "+373 69123456"],
    ["a CRLF after", "+37369123456\r\n"],
    ["only spaces", "      "],
    ["the empty string", ""],
  ])("draws no link for %s", (_, typed) => {
    expect(phoneLinkOf(typed)).toBeNull();
  });

  it("dials +373 and eight digits for a Moldovan number typed as 0 and eight, and refuses a ninth digit or a second zero", () => {
    expect(phoneLinkOf("0 69 123 456")?.href).toBe("tel:+37369123456");
    expect(phoneLinkOf("0 69 123 4567")).toBeNull();
    expect(phoneLinkOf("0 069 123 45")).toBeNull();
    expect(phoneLinkOf("+373 069 123 45")).toBeNull();
  });

  it("swaps a look-alike digit in for each digit of a valid number and never links it", () => {
    const attempts: string[] = [];
    for (const lookAlike of CHARACTERS_THAT_LOOK_LIKE_A_DIGIT) {
      for (const at of digitPositionsOf(VALID_PHONE_TYPED)) {
        attempts.push(withCharacterAt(VALID_PHONE_TYPED, at, lookAlike));
      }
    }

    const linked = attempts.filter((typed) => phoneLinkOf(typed) !== null);

    expect(attempts.length).toBeGreaterThan(50);
    expect(linked).toEqual([]);
  });

  it("answers a 1 MB value without a link, and in well under a second", () => {
    const startedAt = performance.now();

    expect(phoneLinkOf(`+${"1".repeat(1_000_000)}`)).toBeNull();
    expect(phoneLinkOf(`${" ".repeat(1_000_000)}+37369123456x`)).toBeNull();
    expect(phoneLinkOf("١".repeat(1_000_000))).toBeNull();
    expect(performance.now() - startedAt).toBeLessThan(1000);
  });

  it("builds a tel: of ASCII digits only, whatever Unicode it is given", () => {
    let linked = 0;
    let refused = 0;

    fc.assert(
      fc.property(ANY_PHONE_TYPING, (typed) => {
        const link = phoneLinkOf(typed);
        if (link === null) {
          refused += 1;
          return;
        }
        linked += 1;
        expect(link.href).toMatch(/^tel:\+[1-9][0-9]{6,14}$/);
        expect(link.value).toBe(link.href.slice("tel:".length));
      }),
      { seed: SEED, numRuns: RUNS_PER_PROPERTY },
    );

    expect(linked).toBeGreaterThanOrEqual(MIN_LINKED_RUNS);
    expect(refused).toBeGreaterThanOrEqual(MIN_REFUSED_RUNS);
  });

  it("is deterministic: the same typed number gives an equal answer every time, between calls on other numbers", () => {
    let linkedValues = 0;
    let refusedValues = 0;

    fc.assert(
      fc.property(
        fc.array(ANY_PHONE_TYPING, { minLength: 1, maxLength: 6 }),
        (typedNumbers) => {
          const answers = answersAcrossInterleavedCalls(
            typedNumbers,
            phoneLinkOf,
          );

          typedNumbers.forEach((_typed, at) => {
            const answersOfTyped = answers[at] ?? [];
            expect(answersOfTyped.length).toBeGreaterThanOrEqual(2);
            for (const answer of answersOfTyped) {
              expect(answer).toEqual(answersOfTyped[0]);
            }
            if (answersOfTyped[0] === null) refusedValues += 1;
            else linkedValues += 1;
          });
        },
      ),
      { seed: SEED, numRuns: 500 },
    );

    expect(linkedValues).toBeGreaterThanOrEqual(MIN_LINKED_RUNS);
    expect(refusedValues).toBeGreaterThanOrEqual(MIN_REFUSED_RUNS);
  });
});
