// Wave 8H, criteria 2, 3, 4, 10 and 11: every text field against every control, surrogate, line and paragraph
// separator and every format character Unicode names, the length bounds in code points, the e-mail's tie to
// the channel, and consent that is anything but `true`.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  CONSENT_TEXT_VERSIONS,
  CONTACT_CHANNELS,
  CONTACT_EMAIL_MAX_LENGTH,
  CONTACT_LOCALITY_MAX_LENGTH,
  CONTACT_NAME_MAX_LENGTH,
  CONTACT_PHONE_MAX_LENGTH,
  validateContactFields,
  type ContactField,
  type ContactFields,
  type ContactFieldsInput,
} from "../../src/contact/index.js";

const LAST_CODE_POINT = 0x10ffff;

const VALID: ContactFieldsInput = {
  name: "Andrei Munteanu",
  phone: "079 123 456",
  locality: "Orhei",
  channel: "phone",
  consent: true,
  consentTextVersion: CONSENT_TEXT_VERSIONS[0],
};

const VALID_BY_EMAIL: ContactFieldsInput = {
  ...VALID,
  channel: "email",
  email: "andrei@example.md",
};

interface TextField {
  readonly field: ContactField;
  readonly baseline: ContactFieldsInput;
  readonly validValue: string;
  readonly isRequired: boolean;
}

const TEXT_FIELDS: readonly TextField[] = [
  { field: "name", baseline: VALID, validValue: "Ana", isRequired: true },
  {
    field: "phone",
    baseline: VALID,
    validValue: "079123456",
    isRequired: true,
  },
  {
    field: "locality",
    baseline: VALID,
    validValue: "Orhei",
    isRequired: false,
  },
  {
    field: "email",
    baseline: VALID_BY_EMAIL,
    validValue: "ana@example.md",
    isRequired: true,
  },
  {
    field: "consentTextVersion",
    baseline: VALID,
    validValue: CONSENT_TEXT_VERSIONS[0],
    isRequired: true,
  },
];

function codePointsMatching(category: RegExp): readonly string[] {
  const found: string[] = [];
  for (let codePoint = 0; codePoint <= LAST_CODE_POINT; codePoint += 1) {
    const character = String.fromCodePoint(codePoint);
    if (category.test(character)) found.push(character);
  }
  return found;
}

const CONTROL_CHARACTERS = codePointsMatching(/^\p{Cc}$/u);
const FORMAT_CHARACTERS = codePointsMatching(/^\p{Cf}$/u);
const LONE_SURROGATES = ["\ud800", "\udbff", "\udc00", "\udfff"];
const LINE_AND_PARAGRAPH_SEPARATORS = ["\u2028", "\u2029"];
const FORBIDDEN_CHARACTERS = [
  ...CONTROL_CHARACTERS,
  ...LONE_SURROGATES,
  ...LINE_AND_PARAGRAPH_SEPARATORS,
];

const UNSTORABLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;

function placedAtStartMiddleAndEnd(
  text: string,
  placed: string,
): readonly string[] {
  const middle = Math.floor(text.length / 2);
  return [
    `${placed}${text}`,
    `${text.slice(0, middle)}${placed}${text.slice(middle)}`,
    `${text}${placed}`,
  ];
}

function withValue(
  baseline: ContactFieldsInput,
  field: ContactField,
  value: unknown,
): ContactFieldsInput {
  return { ...baseline, [field]: value };
}

function codeOf(field: ContactField, input: ContactFieldsInput): string {
  const result = validateContactFields(input);
  if (result.ok) return "accepted";
  return result.issues.find((issue) => issue.field === field)?.code ?? "none";
}

function contactOf(input: ContactFieldsInput): ContactFields {
  const result = validateContactFields(input);
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.issues)}`);
  return result.contact;
}

function storedTextOf(contact: ContactFields): readonly string[] {
  return Object.values(contact).filter(
    (value): value is string => typeof value === "string",
  );
}

function countCodePoints(text: string): number {
  return Array.from(text).length;
}

describe("8H criterion 2: the sweeps reach what they claim to", () => {
  it("holds every C0 and C1 control, and format characters inside and outside the BMP", () => {
    expect(CONTROL_CHARACTERS).toHaveLength(65);
    expect(CONTROL_CHARACTERS).toContain("\r");
    expect(CONTROL_CHARACTERS).toContain("\n");
    expect(CONTROL_CHARACTERS).toContain("\u0085");
    expect(FORMAT_CHARACTERS.length).toBeGreaterThanOrEqual(150);
    expect(FORMAT_CHARACTERS).toContain("\u202e");
    expect(FORMAT_CHARACTERS).toContain("\u{e0001}");
  });
});

describe.each(TEXT_FIELDS)(
  "8H criterion 2: $field",
  ({ field, baseline, validValue }) => {
    it("refuses every control, lone surrogate, line and paragraph separator, at the start, middle and end", () => {
      const notRefused = FORBIDDEN_CHARACTERS.flatMap((character) =>
        placedAtStartMiddleAndEnd(validValue, character),
      ).filter(
        (value) =>
          codeOf(field, withValue(baseline, field, value)) !==
          "FORBIDDEN_CHARACTER",
      );

      expect(notRefused).toEqual([]);
    });

    it("refuses a value that is nothing but one of them", () => {
      const notRefused = FORBIDDEN_CHARACTERS.filter(
        (character) =>
          codeOf(field, withValue(baseline, field, character)) !==
          "FORBIDDEN_CHARACTER",
      );

      expect(notRefused).toEqual([]);
    });

    it("refuses one hidden behind a format character or padding it would otherwise be trimmed with", () => {
      const hidden = [
        `${validValue}\u200b\n`,
        `${validValue} \r\n `,
        `\u200e\u0000${validValue}`,
        `${validValue}\u2028 `,
      ];

      expect(
        hidden.map((value) => codeOf(field, withValue(baseline, field, value))),
      ).toEqual(hidden.map(() => "FORBIDDEN_CHARACTER"));
    });
  },
);

/** The consent text version is a member of a closed set a page sends, matched exactly; the rest are typed. */
const TYPED_TEXT_FIELDS = TEXT_FIELDS.filter(
  ({ field }) => field !== "consentTextVersion",
);

describe.each(TYPED_TEXT_FIELDS)(
  "8H criterion 10: $field",
  ({ field, baseline, validValue, isRequired }) => {
    it("accepts every format character at the start, middle and end, and stores none", () => {
      const withAFormatCharacter = FORMAT_CHARACTERS.flatMap((character) =>
        placedAtStartMiddleAndEnd(validValue, character),
      );

      const results = withAFormatCharacter.map((value) =>
        validateContactFields(withValue(baseline, field, value)),
      );
      const refused = results.filter((result) => !result.ok);
      const holdingOne = results.filter(
        (result) =>
          result.ok &&
          storedTextOf(result.contact).some((text) => UNSTORABLE.test(text)),
      );

      expect(refused).toEqual([]);
      expect(holdingOne).toEqual([]);
    });

    it("stores what the same value stores without them", () => {
      const plain = contactOf(withValue(baseline, field, validValue));

      const pasted = contactOf(
        withValue(
          baseline,
          field,
          `\u202e\u200b${validValue.slice(0, 2)}\u00ad\u{e0001}${validValue.slice(2)}\ufeff\u200f`,
        ),
      );

      expect(pasted).toEqual(plain);
    });

    it("reads a value of nothing but format characters and spaces as an empty one", () => {
      const emptied = withValue(baseline, field, " \u200b\u200e \ufeff\u00ad ");

      expect(codeOf(field, emptied)).toBe(isRequired ? "REQUIRED" : "accepted");
    });
  },
);

describe("8H criteria 2 and 10: whatever is typed, an accepted value can be stored and mailed", () => {
  const hostile = fc.string({
    unit: fc.constantFrom(
      "a",
      "\u00e9",
      " ",
      "\u00a0",
      "\u200b",
      "\u202e",
      "\u{e0001}",
      "\ud83d",
      "\ude00",
      "\u{1f600}",
      "\u0301",
      "\n",
      "\u2028",
      "\u0958",
      "\u1100",
      "\u1161",
      "\u212a",
      "\u0323",
    ),
    maxLength: 130,
  });

  propertyTest.prop([hostile, fc.constantFrom("name", "locality")])(
    "is composed, trimmed, within its bound and free of every refused or removed character, a lone surrogate included",
    (typed, field) => {
      const result = validateContactFields(withValue(VALID, field, typed));
      if (!result.ok) return;
      const stored = result.contact[field];

      expect(UNSTORABLE.test(stored)).toBe(false);
      expect(stored.normalize("NFC")).toBe(stored);
      expect(stored).toBe(stored.trim());
      expect(countCodePoints(stored)).toBeLessThanOrEqual(
        CONTACT_NAME_MAX_LENGTH,
      );
    },
  );
});

describe("8H criterion 3: each bound is in code points, of what is stored", () => {
  const BOUNDED: readonly {
    readonly field: ContactField;
    readonly baseline: ContactFieldsInput;
    readonly max: number;
    readonly ofLength: (length: number) => string;
  }[] = [
    {
      field: "name",
      baseline: VALID,
      max: CONTACT_NAME_MAX_LENGTH,
      ofLength: (length) => "\u{1f600}".repeat(length),
    },
    {
      field: "locality",
      baseline: VALID,
      max: CONTACT_LOCALITY_MAX_LENGTH,
      ofLength: (length) => "\u{10400}".repeat(length),
    },
    {
      field: "email",
      baseline: VALID_BY_EMAIL,
      max: CONTACT_EMAIL_MAX_LENGTH,
      ofLength: (length) => `${"a".repeat(length - 11)}@example.md`,
    },
    {
      field: "phone",
      baseline: VALID,
      max: CONTACT_PHONE_MAX_LENGTH,
      ofLength: (length) => `0${"-".repeat(length - 9)}79123456`,
    },
  ];

  it("states the four bounds this file sweeps", () => {
    expect(BOUNDED.map(({ max }) => max)).toEqual([100, 100, 254, 32]);
  });

  describe.each(BOUNDED)("$field", ({ field, baseline, max, ofLength }) => {
    it("accepts exactly the maximum and refuses one past it", () => {
      expect(countCodePoints(ofLength(max))).toBe(max);
      expect(codeOf(field, withValue(baseline, field, ofLength(max)))).toBe(
        "accepted",
      );
      expect(codeOf(field, withValue(baseline, field, ofLength(max + 1)))).toBe(
        "TOO_LONG",
      );
    });

    it("counts neither removed format characters nor trimmed padding", () => {
      const padded = `  \u200b${ofLength(max)}${"\u200e".repeat(500)}   `;

      expect(codeOf(field, withValue(baseline, field, padded))).toBe(
        "accepted",
      );
    });

    it("is not talked past its bound by format characters between the counted ones", () => {
      const interleaved = Array.from(ofLength(max + 1)).join("\u200b");

      expect(codeOf(field, withValue(baseline, field, interleaved))).toBe(
        "TOO_LONG",
      );
    });

    it("refuses a value four thousand times its bound as too long, without stalling", () => {
      const huge = ofLength(max).repeat(4000);

      expect(codeOf(field, withValue(baseline, field, huge))).toBe("TOO_LONG");
    });
  });

  it("counts a letter and the mark it composes with as the one letter that is stored", () => {
    const BASE_AND_MARK = "a\u0301";

    expect(
      codeOf("name", {
        ...VALID,
        name: BASE_AND_MARK.repeat(CONTACT_NAME_MAX_LENGTH),
      }),
    ).toBe("accepted");
    expect(
      codeOf("name", {
        ...VALID,
        name: BASE_AND_MARK.repeat(CONTACT_NAME_MAX_LENGTH + 1),
      }),
    ).toBe("TOO_LONG");
  });

  it("counts a mark that composes with nothing as a character of its own", () => {
    const BASE_AND_LONE_MARK = "q\u0301";
    const pairsAtTheBound = CONTACT_NAME_MAX_LENGTH / 2;

    expect(BASE_AND_LONE_MARK.normalize("NFC")).toBe(BASE_AND_LONE_MARK);
    expect(
      codeOf("name", {
        ...VALID,
        name: BASE_AND_LONE_MARK.repeat(pairsAtTheBound),
      }),
    ).toBe("accepted");
    expect(
      codeOf("name", {
        ...VALID,
        name: `${BASE_AND_LONE_MARK.repeat(pairsAtTheBound)}q`,
      }),
    ).toBe("TOO_LONG");
  });
});

// Criterion 19 (QA finding 4, ruled): format characters are removed, then the text is brought to NFC, then it
// is judged, trimmed and measured, so one name has one stored form.
describe("8H criterion 19: a name's composed and decomposed forms are one stored value", () => {
  const COMPOSED = "\u00c9lodie Carr\u00e9";
  const DECOMPOSED = COMPOSED.normalize("NFD");

  it("stores the composed form however the name was typed", () => {
    expect(DECOMPOSED).not.toBe(COMPOSED);
    expect(contactOf({ ...VALID, name: DECOMPOSED }).name).toBe(COMPOSED);
    expect(contactOf({ ...VALID, name: COMPOSED }).name).toBe(COMPOSED);
    expect(contactOf({ ...VALID, locality: DECOMPOSED }).locality).toBe(
      COMPOSED,
    );
  });

  it("accepts a hundred letters composed or decomposed, and stores the same hundred", () => {
    const composed = "\u00e9".repeat(CONTACT_NAME_MAX_LENGTH);

    expect(contactOf({ ...VALID, name: composed }).name).toBe(composed);
    expect(contactOf({ ...VALID, name: composed.normalize("NFD") }).name).toBe(
      composed,
    );
  });

  it("composes a letter and its mark across every format character that stands between them", () => {
    const notComposed = FORMAT_CHARACTERS.filter(
      (character) =>
        contactOf({ ...VALID, name: `e${character}\u0301` }).name !== "\u00e9",
    );

    expect(notComposed).toEqual([]);
  });

  it("composes marks typed in either order into one form", () => {
    const DOT_BELOW_THEN_ACUTE = "a\u0323\u0301";
    const ACUTE_THEN_DOT_BELOW = "a\u0301\u0323";

    expect(contactOf({ ...VALID, name: ACUTE_THEN_DOT_BELOW }).name).toBe(
      contactOf({ ...VALID, name: DOT_BELOW_THEN_ACUTE }).name,
    );
  });

  it("measures what is stored where composing makes the text longer", () => {
    const GROWS_UNDER_NFC = "\u0958";
    const half = CONTACT_NAME_MAX_LENGTH / 2;

    expect(countCodePoints(GROWS_UNDER_NFC.normalize("NFC"))).toBe(2);
    expect(
      countCodePoints(
        contactOf({ ...VALID, name: GROWS_UNDER_NFC.repeat(half) }).name,
      ),
    ).toBe(CONTACT_NAME_MAX_LENGTH);
    expect(
      codeOf("name", { ...VALID, name: GROWS_UNDER_NFC.repeat(half + 1) }),
    ).toBe("TOO_LONG");
  });

  it("stores, for every character composing changes, exactly its composed form and nothing hidden", () => {
    const FIRST_SURROGATE = 0xd800;
    const LAST_SURROGATE = 0xdfff;
    const changed = Array.from(
      { length: LAST_CODE_POINT + 1 },
      (_, codePoint) =>
        codePoint >= FIRST_SURROGATE && codePoint <= LAST_SURROGATE
          ? ""
          : String.fromCodePoint(codePoint),
    ).filter(
      (character) =>
        character !== "" && character.normalize("NFC") !== character,
    );

    const wrong = changed.filter((character) => {
      const result = validateContactFields({
        ...VALID,
        name: `a${character}b`,
      });
      return (
        !result.ok ||
        result.contact.name !== `a${character}b`.normalize("NFC") ||
        UNSTORABLE.test(result.contact.name)
      );
    });

    expect(changed.length).toBeGreaterThan(1000);
    expect(wrong).toEqual([]);
  });

  it.each([
    ["a ligature", "\ufb01"],
    ["a full-width letter", "\uff21"],
    ["a superscript digit", "\u00b2"],
    ["a circled digit", "\u2460"],
    ["a no-break space between words", "a\u00a0b"],
  ])(
    "keeps %s as typed: the compatibility form is not used",
    (_name, typed) => {
      expect(typed.normalize("NFKC")).not.toBe(typed);
      expect(contactOf({ ...VALID, name: typed }).name).toBe(typed);
    },
  );

  it("refuses full-width digits in a phone, which the compatibility form would have made a number", () => {
    const FULL_WIDTH = "\uff10\uff16\uff19\uff11\uff12\uff13\uff14\uff15\uff16";

    expect(FULL_WIDTH.normalize("NFKC")).toBe("069123456");
    expect(codeOf("phone", { ...VALID, phone: FULL_WIDTH })).toBe(
      "PHONE_FORMAT_UNRECOGNISED",
    );
  });

  // As ruled: every typed field is composed, the e-mail included. Three characters compose to an ASCII one,
  // so an address typed with the Kelvin sign is stored as the plain letter it is canonically equal to.
  it("stores an e-mail typed with the Kelvin sign as the letter K it is canonically equal to", () => {
    const KELVIN = "\u212a";

    expect(
      contactOf({ ...VALID_BY_EMAIL, email: `${KELVIN}ate@example.md` }).email,
    ).toBe("Kate@example.md");
  });

  it("still refuses an e-mail with a composed non-ASCII letter, however it was typed", () => {
    const decomposed = "e\u0301lodie@example.md";

    expect(codeOf("email", { ...VALID_BY_EMAIL, email: decomposed })).toBe(
      "MALFORMED",
    );
  });
});

// QA finding 5, a recorded limit: an invisible character that Unicode does not class as a format character is
// neither removed nor refused, so a name that shows as nothing passes for a name.
describe("8H criterion 10, a recorded limit: a blank that is not a format character is a name", () => {
  it.each([
    ["the Hangul filler", "\u3164"],
    ["the Hangul choseong filler", "\u115f"],
    ["the Braille blank", "\u2800"],
    ["a combining grapheme joiner", "\u034f"],
  ])("accepts %s alone", (_name, blank) => {
    expect(codeOf("name", { ...VALID, name: blank })).toBe("accepted");
  });
});

describe("8H criterion 4: the e-mail is judged and carried exactly when the channel is e-mail", () => {
  const EMAIL_VALUES: readonly unknown[] = [
    undefined,
    "",
    "   ",
    "not-an-address",
    "ana@example.md",
    "ana@example.md\r\nBcc: other@example.md",
    "a".repeat(CONTACT_EMAIL_MAX_LENGTH + 50),
    42,
    null,
    { address: "ana@example.md" },
    ["ana@example.md"],
  ];

  it.each(CONTACT_CHANNELS.filter((channel) => channel !== "email"))(
    "neither judges nor carries one for the %s channel, whatever it holds",
    (channel) => {
      const contacts = EMAIL_VALUES.map((email) =>
        contactOf({ ...VALID, channel, email }),
      );

      expect(contacts.map((contact) => contact.email)).toEqual(
        EMAIL_VALUES.map(() => undefined),
      );
      expect(JSON.stringify(contacts)).not.toContain("example.md");
    },
  );

  it("requires one for the e-mail channel, and judges each value", () => {
    expect(
      EMAIL_VALUES.map((email) =>
        codeOf("email", { ...VALID, channel: "email", email }),
      ),
    ).toEqual([
      "REQUIRED",
      "REQUIRED",
      "REQUIRED",
      "MALFORMED",
      "accepted",
      "FORBIDDEN_CHARACTER",
      "TOO_LONG",
      "NOT_TEXT",
      "NOT_TEXT",
      "NOT_TEXT",
      "NOT_TEXT",
    ]);
  });

  it("reports only the channel when the channel is unknown, since no rule says which the e-mail follows", () => {
    const result = validateContactFields({
      ...VALID,
      channel: "fax",
      email: "not-an-address",
    });

    expect(result).toEqual({
      ok: false,
      issues: [{ field: "channel", code: "UNKNOWN_CHANNEL" }],
    });
  });

  it.each([
    ["a second recipient", "ana@example.md,other@example.md"],
    ["a display name", "Ana <ana@example.md>"],
    ["a space inside", "ana @example.md"],
    ["a non-ASCII local part", "\u00e9lodie@example.md"],
    ["a non-ASCII domain", "ana@exempl\u00e9.md"],
    ["no top-level domain", "ana@localhost"],
    ["a quoted local part", '"ana"@example.md'],
  ])("refuses %s as malformed", (_name, email) => {
    expect(codeOf("email", { ...VALID, channel: "email", email })).toBe(
      "MALFORMED",
    );
  });

  it("accepts an empty locality and carries it as empty text", () => {
    const withoutLocality: ContactFieldsInput = {
      name: VALID.name,
      phone: VALID.phone,
      channel: VALID.channel,
      consent: VALID.consent,
      consentTextVersion: VALID.consentTextVersion,
    };

    expect(contactOf(withoutLocality).locality).toBe("");
    expect(contactOf({ ...VALID, locality: " \u200b " }).locality).toBe("");
  });
});

describe("8H criterion 4: consent is `true` or it is not given", () => {
  propertyTest.prop([fc.anything().filter((value) => value !== true)])(
    "refuses anything that is not the boolean true, with its own code",
    (consent) => {
      expect(codeOf("consent", { ...VALID, consent })).toBe(
        "CONSENT_NOT_GIVEN",
      );
    },
  );

  it.each([
    ["the text true", "true"],
    ["one", 1],
    ["a boxed true", Object(true) as unknown],
    ["an object that converts to true", { valueOf: () => true }],
    ["an array holding true", [true]],
    ["an empty object", {}],
    ["a function returning true", () => true],
    ["a big integer one", 1n],
  ])("refuses %s", (_name, consent) => {
    expect(codeOf("consent", { ...VALID, consent })).toBe("CONSENT_NOT_GIVEN");
  });

  it("does not carry consent as a value: its acceptance is the result itself", () => {
    expect(Object.keys(contactOf(VALID))).not.toContain("consent");
  });
});

describe("8H criterion 11 and reading 8c: a value from a closed set is a member or it is refused", () => {
  const NAMES_ON_EVERY_OBJECT = [
    "constructor",
    "__proto__",
    "toString",
    "hasOwnProperty",
    "length",
    "0",
  ];

  it.each(NAMES_ON_EVERY_OBJECT)(
    "refuses %s as a consent text version",
    (version) => {
      expect(
        codeOf("consentTextVersion", {
          ...VALID,
          consentTextVersion: version,
        }),
      ).toBe("UNKNOWN_CONSENT_TEXT_VERSION");
    },
  );

  it.each(NAMES_ON_EVERY_OBJECT)("refuses %s as a channel", (channel) => {
    expect(codeOf("channel", { ...VALID, channel })).toBe("UNKNOWN_CHANNEL");
  });

  it.each([
    ["an array that prints as a member", ["phone"]],
    ["a boxed member", Object("phone") as unknown],
    ["an object that prints as a member", { toString: () => "phone" }],
  ])("refuses %s as a channel", (_name, channel) => {
    expect(codeOf("channel", { ...VALID, channel })).toBe("UNKNOWN_CHANNEL");
  });

  it.each([
    ["an array holding a member", [CONSENT_TEXT_VERSIONS[0]]],
    ["a boxed member", Object(CONSENT_TEXT_VERSIONS[0]) as unknown],
    ["a number", 1],
    ["null", null],
  ])("refuses %s as a consent text version", (_name, version) => {
    expect(
      codeOf("consentTextVersion", { ...VALID, consentTextVersion: version }),
    ).toBe("NOT_TEXT");
  });

  propertyTest.prop([
    fc
      .string({ maxLength: 20 })
      .filter(
        (text) =>
          !CONSENT_TEXT_VERSIONS.some(
            (version) => version === text.replace(/\p{Cf}/gu, "").trim(),
          ),
      ),
  ])("accepts no consent text version outside the set", (version) => {
    expect(
      codeOf("consentTextVersion", { ...VALID, consentTextVersion: version }),
    ).not.toBe("accepted");
  });

  it("stores the member itself, never the text that was sent", () => {
    const stored = CONTACT_CHANNELS.map((channel) =>
      contactOf({ ...VALID_BY_EMAIL, channel }),
    ).map((contact) => contact.consentTextVersion);

    expect(new Set(stored)).toEqual(new Set(CONSENT_TEXT_VERSIONS));
  });

  // QA finding 6, ruled: the consent text version is matched exactly, as reading 8c matches a channel.
  it("matches a padded consent text version no more than a padded channel", () => {
    const padded = ` ${CONSENT_TEXT_VERSIONS[0]}\u200b`;

    expect(
      codeOf("consentTextVersion", { ...VALID, consentTextVersion: padded }),
    ).toBe("UNKNOWN_CONSENT_TEXT_VERSION");
    expect(codeOf("channel", { ...VALID, channel: " phone\u200b" })).toBe(
      "UNKNOWN_CHANNEL",
    );
  });

  it("refuses the member with any format character at its start, middle or end", () => {
    const notRefused = FORMAT_CHARACTERS.flatMap((character) =>
      placedAtStartMiddleAndEnd(CONSENT_TEXT_VERSIONS[0], character),
    ).filter(
      (version) =>
        codeOf("consentTextVersion", {
          ...VALID,
          consentTextVersion: version,
        }) !== "UNKNOWN_CONSENT_TEXT_VERSION",
    );

    expect(notRefused).toEqual([]);
  });

  it.each([
    ["a space before", ` ${CONSENT_TEXT_VERSIONS[0]}`],
    ["a space after", `${CONSENT_TEXT_VERSIONS[0]} `],
    ["a no-break space after", `${CONSENT_TEXT_VERSIONS[0]}\u00a0`],
    ["another case", CONSENT_TEXT_VERSIONS[0].toUpperCase()],
    ["a combining mark added", `${CONSENT_TEXT_VERSIONS[0]}\u0301`],
    ["nothing but spaces", "   "],
    ["nothing but format characters", "\u200b\u200e\ufeff"],
  ])("refuses the member with %s as no member", (_name, version) => {
    expect(
      codeOf("consentTextVersion", { ...VALID, consentTextVersion: version }),
    ).toBe("UNKNOWN_CONSENT_TEXT_VERSION");
  });
});

describe("8H reading 10: a refusal is a field and a code and no value", () => {
  const MARKER = "ZZQA8H";

  it("carries nothing the caller sent, with every field refused at once", () => {
    const result = validateContactFields({
      name: `${MARKER}\n`,
      phone: `${MARKER}0691`,
      locality: MARKER.repeat(40),
      channel: MARKER,
      email: `${MARKER}@`,
      consent: MARKER,
      consentTextVersion: MARKER,
    });

    expect(result).toEqual({
      ok: false,
      issues: [
        { field: "name", code: "FORBIDDEN_CHARACTER" },
        { field: "phone", code: "PHONE_FORMAT_UNRECOGNISED" },
        { field: "locality", code: "TOO_LONG" },
        { field: "channel", code: "UNKNOWN_CHANNEL" },
        { field: "consent", code: "CONSENT_NOT_GIVEN" },
        { field: "consentTextVersion", code: "UNKNOWN_CONSENT_TEXT_VERSION" },
      ],
    });
    expect(JSON.stringify(result)).not.toContain(MARKER);
  });
});

// Criterion 21 (both must-fixes of the reviews, ruled): text that is not well-formed is refused as it
// arrived; format characters are removed; what remains is bounded before it is composed; then it is composed,
// checked, trimmed and measured. The three properties are over sequences of UTF-16 units, not of whole
// characters: a half of a character is a unit a character sweep never produces.
describe("8H criterion 21: the order of the text check, over UTF-16 units", () => {
  interface TypedField {
    readonly field: "name" | "locality" | "email" | "phone";
    readonly baseline: ContactFieldsInput;
    readonly validValue: string;
    readonly max: number;
  }

  const TYPED: readonly TypedField[] = [
    {
      field: "name",
      baseline: VALID,
      validValue: "Ana Rusu",
      max: CONTACT_NAME_MAX_LENGTH,
    },
    {
      field: "locality",
      baseline: VALID,
      validValue: "Orhei",
      max: CONTACT_LOCALITY_MAX_LENGTH,
    },
    {
      field: "email",
      baseline: VALID_BY_EMAIL,
      validValue: "ana@example.md",
      max: CONTACT_EMAIL_MAX_LENGTH,
    },
    {
      field: "phone",
      baseline: VALID,
      validValue: "079 123 456",
      max: CONTACT_PHONE_MAX_LENGTH,
    },
  ];

  const UNCOMPOSED_FACTOR = 8;
  const HIGH_HALF = "\ud83d";
  const LOW_HALF = "\ude00";
  const TAG_HIGH_HALF = "\udb40";
  const TAG_LOW_HALF = "\udc01";

  /** Units a customer's text holds, and the ones that break a check written for whole characters. */
  const TELLING_UNITS = [
    0x61, 0x65, 0x20, 0x30, 0x36, 0x2b, 0x2d, 0x40, 0x2e, 0xa0, 0x200b, 0x200e,
    0x202e, 0xfeff, 0xad, 0x301, 0x316, 0x323, 0x958, 0x1100, 0x1161, 0x212a,
    0xd83d, 0xde00, 0xdb40, 0xdc01, 0xdc41, 0xd800, 0xdfff, 0x0a, 0x0d, 0x85,
    0x2028, 0x2029, 0xfb01, 0xff21,
  ];

  const anyUnit = fc.oneof(
    { weight: 3, arbitrary: fc.constantFrom(...TELLING_UNITS) },
    { weight: 1, arbitrary: fc.integer({ min: 0, max: 0xffff }) },
  );

  function unitsToText(units: readonly number[]): string {
    return String.fromCharCode(...units);
  }

  const unitText = fc.array(anyUnit, { maxLength: 40 }).map(unitsToText);

  /** A valid value with runs of arbitrary units put into it, so some are accepted and some refused. */
  function spliced(validValue: string): fc.Arbitrary<string> {
    return fc
      .array(
        fc.tuple(
          fc.nat({ max: validValue.length }),
          fc.array(anyUnit, { minLength: 1, maxLength: 3 }).map(unitsToText),
        ),
        { maxLength: 3 },
      )
      .map((insertions) =>
        insertions.reduce(
          (text, [at, run]) => `${text.slice(0, at)}${run}${text.slice(at)}`,
          validValue,
        ),
      );
  }

  function typedOf(field: TypedField): fc.Arbitrary<string> {
    return fc.oneof(spliced(field.validValue), unitText);
  }

  it.each(TYPED)(
    "generates $field values that are accepted and values that are refused",
    (field) => {
      const outcomes = fc
        .sample(typedOf(field), { numRuns: 600, seed: 21 })
        .map((typed) =>
          codeOf(field.field, withValue(field.baseline, field.field, typed)),
        );

      expect(
        outcomes.filter((code) => code === "accepted").length,
      ).toBeGreaterThan(30);
      expect(
        outcomes.filter((code) => code === "FORBIDDEN_CHARACTER").length,
      ).toBeGreaterThan(30);
    },
  );

  describe.each(TYPED)("$field", (field) => {
    const typed = typedOf(field);

    function validated(value: string) {
      return validateContactFields(
        withValue(field.baseline, field.field, value),
      );
    }

    propertyTest.prop([typed], { numRuns: 1000 })(
      "nothing stored holds a control, a format character, half a character, or a line or paragraph separator",
      (value) => {
        const result = validated(value);
        if (!result.ok) return;

        expect(
          storedTextOf(result.contact).filter((text) => UNSTORABLE.test(text)),
        ).toEqual([]);
      },
    );

    propertyTest.prop([typed], { numRuns: 1000 })(
      "what is stored is composed and trimmed",
      (value) => {
        const result = validated(value);
        if (!result.ok) return;
        const stored = result.contact[field.field] ?? "";

        expect(stored.normalize("NFC")).toBe(stored);
        expect(stored.trim()).toBe(stored);
        expect(countCodePoints(stored)).toBeLessThanOrEqual(field.max);
      },
    );

    propertyTest.prop([typed], { numRuns: 1000 })(
      "validating what was stored stores it again, unchanged",
      (value) => {
        const result = validated(value);
        if (!result.ok) return;
        const stored = result.contact[field.field] ?? "";

        expect(validated(stored)).toEqual(result);
      },
    );

    it("refuses the reviewers' value: two characters whose halves are split by a zero-width space", () => {
      const SPLIT_TAGS = `Ion${TAG_HIGH_HALF}\u200b${TAG_LOW_HALF}${TAG_HIGH_HALF}\u200b\udc41x`;

      expect(
        codeOf(field.field, withValue(field.baseline, field.field, SPLIT_TAGS)),
      ).toBe("FORBIDDEN_CHARACTER");
      expect(
        codeOf(
          field.field,
          withValue(
            field.baseline,
            field.field,
            `${field.validValue}${TAG_HIGH_HALF}\u200b${TAG_LOW_HALF}`,
          ),
        ),
      ).toBe("FORBIDDEN_CHARACTER");
    });

    it("refuses two halves split by each format character there is, the ones outside the BMP included", () => {
      const joined = FORMAT_CHARACTERS.flatMap((character) => [
        `${field.validValue}${HIGH_HALF}${character}${LOW_HALF}`,
        `${HIGH_HALF}${character}${LOW_HALF}${field.validValue}`,
        `${field.validValue}${TAG_HIGH_HALF}${character}${character}${TAG_LOW_HALF}`,
      ]).filter(
        (value) =>
          codeOf(field.field, withValue(field.baseline, field.field, value)) !==
          "FORBIDDEN_CHARACTER",
      );

      expect(joined).toEqual([]);
    });

    it.each([
      ["a hundred thousand", 100_000, 250],
      ["a million", 1_000_000, 2000],
    ])(
      "refuses %s units of combining marks as too long, in a time composing them would miss many times over",
      (_name, units, withinMs) => {
        const marks = `a${"\u0316\u0301".repeat(units / 2)}`;
        const startedAt = performance.now();

        const code = codeOf(
          field.field,
          withValue(field.baseline, field.field, marks),
        );

        expect(code).toBe("TOO_LONG");
        expect(performance.now() - startedAt).toBeLessThan(withinMs);
      },
    );

    it("answers at once for the longest run of marks it will still compose", () => {
      const longestComposed = field.max * UNCOMPOSED_FACTOR;
      const marks = `a${"\u0316\u0301".repeat((longestComposed - 1) / 2)}`;
      const startedAt = performance.now();

      const code = codeOf(
        field.field,
        withValue(field.baseline, field.field, marks),
      );

      expect(marks.length).toBe(longestComposed - 1);
      expect(code).toBe("TOO_LONG");
      expect(performance.now() - startedAt).toBeLessThan(100);
    });

    it("counts no format character toward the bound before composing", () => {
      const padded = `${field.validValue}${"\u200b".repeat(100_000)}`;

      expect(
        codeOf(field.field, withValue(field.baseline, field.field, padded)),
      ).toBe("accepted");
    });

    it("counts padding it would trim toward the bound before composing, in units", () => {
      const room = field.max * UNCOMPOSED_FACTOR - field.validValue.length;

      expect(
        codeOf(
          field.field,
          withValue(
            field.baseline,
            field.field,
            `${field.validValue}${" ".repeat(room)}`,
          ),
        ),
      ).toBe("accepted");
      expect(
        codeOf(
          field.field,
          withValue(
            field.baseline,
            field.field,
            `${field.validValue}${" ".repeat(room + 1)}`,
          ),
        ),
      ).toBe("TOO_LONG");
    });
  });

  it("refuses no name a keyboard makes: a hundred letters of three units each compose and pass", () => {
    const LETTER_WITH_TWO_MARKS = "a\u0302\u0301";
    const typed = LETTER_WITH_TWO_MARKS.repeat(CONTACT_NAME_MAX_LENGTH);

    const stored = contactOf({ ...VALID, name: typed }).name;

    expect(typed.length).toBe(3 * CONTACT_NAME_MAX_LENGTH);
    expect(countCodePoints(stored)).toBe(CONTACT_NAME_MAX_LENGTH);
  });

  it("measures the early bound in units and the limit in code points: a hundred two-unit characters pass", () => {
    const astral = String.fromCodePoint(0x1f600);

    expect(
      codeOf("name", {
        ...VALID,
        name: astral.repeat(CONTACT_NAME_MAX_LENGTH),
      }),
    ).toBe("accepted");
    expect(
      codeOf("name", {
        ...VALID,
        name: astral.repeat(CONTACT_NAME_MAX_LENGTH + 1),
      }),
    ).toBe("TOO_LONG");
    expect(
      codeOf("name", {
        ...VALID,
        name: astral.repeat(
          (CONTACT_NAME_MAX_LENGTH * UNCOMPOSED_FACTOR) / 2 + 1,
        ),
      }),
    ).toBe("TOO_LONG");
  });

  it("refuses half a character wherever it stands, before anything is removed around it", () => {
    const values = [
      `${HIGH_HALF}Ana`,
      `Ana${LOW_HALF}`,
      `A${LOW_HALF}${HIGH_HALF}na`,
      `Ana${HIGH_HALF}\u200b`,
      `\u200b${LOW_HALF}\u200bAna`,
      `Ana${HIGH_HALF}${HIGH_HALF}${LOW_HALF}`,
    ];

    expect(values.map((name) => codeOf("name", { ...VALID, name }))).toEqual(
      values.map(() => "FORBIDDEN_CHARACTER"),
    );
  });

  it("keeps a whole character beside a format character: only the format character goes", () => {
    const astral = String.fromCodePoint(0x1f600);

    expect(
      contactOf({ ...VALID, name: `Ana \u200b${astral}\u200e` }).name,
    ).toBe(`Ana ${astral}`);
  });
});
