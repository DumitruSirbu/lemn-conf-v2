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

describe.each(TEXT_FIELDS)(
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
    ),
    maxLength: 130,
  });

  propertyTest.prop([hostile, fc.constantFrom("name", "locality")])(
    "is trimmed, within its bound and free of every refused or removed character, a lone surrogate included",
    (typed, field) => {
      const result = validateContactFields(withValue(VALID, field, typed));
      if (!result.ok) return;
      const stored = result.contact[field];

      expect(UNSTORABLE.test(stored)).toBe(false);
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

  it("counts a combining mark as a character of its own", () => {
    const BASE_AND_MARK = "a\u0301";
    const pairsAtTheBound = CONTACT_NAME_MAX_LENGTH / 2;

    expect(
      codeOf("name", { ...VALID, name: BASE_AND_MARK.repeat(pairsAtTheBound) }),
    ).toBe("accepted");
    expect(
      codeOf("name", {
        ...VALID,
        name: `${BASE_AND_MARK.repeat(pairsAtTheBound)}a`,
      }),
    ).toBe("TOO_LONG");
  });
});

// QA finding 4, as built: nothing normalises a name, so one name has two stored forms and its length
// depends on which the customer's keyboard or clipboard produced.
describe("8H criterion 3, as built: a name's composed and decomposed forms are two values", () => {
  const COMPOSED = "\u00c9lodie Carr\u00e9";
  const DECOMPOSED = COMPOSED.normalize("NFD");

  it("stores each as it was typed", () => {
    expect(contactOf({ ...VALID, name: DECOMPOSED }).name).not.toBe(
      contactOf({ ...VALID, name: COMPOSED }).name,
    );
  });

  it("accepts a hundred composed letters and refuses the same hundred decomposed", () => {
    const composed = "\u00e9".repeat(CONTACT_NAME_MAX_LENGTH);

    expect(codeOf("name", { ...VALID, name: composed })).toBe("accepted");
    expect(codeOf("name", { ...VALID, name: composed.normalize("NFD") })).toBe(
      "TOO_LONG",
    );
  });
});

// QA finding 5, as built: an invisible character that Unicode does not class as a format character is
// neither removed nor refused, so a name that shows as nothing passes for a name.
describe("8H criterion 10, as built: a blank that is not a format character is a name", () => {
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

  // QA finding 6, as built: reading 8c matches a channel exactly, while the consent text version, the
  // other value a page sends from a closed set, is trimmed and stripped before it is matched.
  it("as built: matches a padded consent text version that reading 8c would refuse on a channel", () => {
    const padded = ` ${CONSENT_TEXT_VERSIONS[0]}\u200b`;

    expect(
      contactOf({ ...VALID, consentTextVersion: padded }).consentTextVersion,
    ).toBe(CONSENT_TEXT_VERSIONS[0]);
    expect(codeOf("channel", { ...VALID, channel: " phone\u200b" })).toBe(
      "UNKNOWN_CHANNEL",
    );
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
