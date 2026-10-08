import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  CONSENT_TEXT_VERSION_MAX_LENGTH,
  CONTACT_CHANNELS,
  CONTACT_EMAIL_MAX_LENGTH,
  CONTACT_LOCALITY_MAX_LENGTH,
  CONTACT_NAME_MAX_LENGTH,
  CONTACT_PHONE_MAX_LENGTH,
  validateContactFields,
  type ContactField,
  type ContactFieldCode,
  type ContactFieldsInput,
  type ContactIssue,
} from "../../src/contact/index.js";

const VALID_INPUT: ContactFieldsInput = {
  name: "Andrei Munteanu",
  phone: "079 123 456",
  locality: "Calarasi",
  channel: "phone",
  consent: true,
  consentTextVersion: "2026-10-08",
};

const VALID_EMAIL_INPUT: ContactFieldsInput = {
  ...VALID_INPUT,
  channel: "email",
  email: "andrei@example.md",
};

const EMAIL_DOMAIN = "@example.md";

function issuesOf(input: ContactFieldsInput): readonly ContactIssue[] {
  const result = validateContactFields(input);
  return result.ok ? [] : result.issues;
}

function codeOf(
  field: ContactField,
  input: ContactFieldsInput,
): ContactFieldCode | undefined {
  return issuesOf(input).find((issue) => issue.field === field)?.code;
}

function contactOf(input: ContactFieldsInput) {
  const result = validateContactFields(input);
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.issues)}`);
  return result.contact;
}

/** The five fields whose value is typed text that reaches an e-mail, each with a baseline that is
 *  valid for it and a way to place a value in it. */
const TEXT_FIELDS: readonly {
  readonly field: ContactField;
  readonly baseline: ContactFieldsInput;
  readonly validValue: string;
}[] = [
  { field: "name", baseline: VALID_INPUT, validValue: "Ana" },
  { field: "phone", baseline: VALID_INPUT, validValue: "079123456" },
  { field: "locality", baseline: VALID_INPUT, validValue: "Orhei" },
  { field: "email", baseline: VALID_EMAIL_INPUT, validValue: "ana@example.md" },
  { field: "consentTextVersion", baseline: VALID_INPUT, validValue: "v1" },
];

function withValue(
  baseline: ContactFieldsInput,
  field: ContactField,
  value: unknown,
): ContactFieldsInput {
  return { ...baseline, [field]: value };
}

describe("validateContactFields: a valid submission", () => {
  it("carries trimmed values and the phone's normal form", () => {
    const contact = contactOf({
      ...VALID_INPUT,
      name: "  Andrei Munteanu  ",
      locality: " Calarasi ",
    });

    expect(contact).toEqual({
      name: "Andrei Munteanu",
      phone: "079 123 456",
      phoneNormalForm: "+37379123456",
      locality: "Calarasi",
      channel: "phone",
      email: undefined,
      consentTextVersion: "2026-10-08",
    });
  });

  it.each(CONTACT_CHANNELS)("accepts the %s channel", (channel) => {
    const input = { ...VALID_EMAIL_INPUT, channel };

    expect(contactOf(input).channel).toBe(channel);
  });

  it("accepts an international number and stores it in E.164", () => {
    const contact = contactOf({ ...VALID_INPUT, phone: "+40 721 234 567" });

    expect(contact.phoneNormalForm).toBe("+40721234567");
  });
});

describe("validateContactFields: required fields", () => {
  it.each([
    ["name", ""],
    ["name", "   "],
    ["name", undefined],
    ["phone", ""],
    ["phone", undefined],
    ["consentTextVersion", ""],
    ["consentTextVersion", undefined],
  ] as const)("refuses %s given %j as REQUIRED", (field, value) => {
    expect(codeOf(field, withValue(VALID_INPUT, field, value))).toBe(
      "REQUIRED",
    );
  });

  it.each(TEXT_FIELDS)(
    "refuses a $field that is not text as NOT_TEXT",
    (row) => {
      for (const value of [5, null, true, ["a"], { a: 1 }]) {
        expect(
          codeOf(row.field, withValue(row.baseline, row.field, value)),
        ).toBe("NOT_TEXT");
      }
    },
  );
});

describe("validateContactFields: locality may be empty", () => {
  it.each([
    ["", ""],
    ["   ", ""],
    [undefined, ""],
  ])("accepts %j and carries %j", (locality, carried) => {
    expect(contactOf({ ...VALID_INPUT, locality }).locality).toBe(carried);
  });
});

describe("validateContactFields: control characters", () => {
  const FORBIDDEN_CHARACTERS = [
    ["a carriage return", "\r"],
    ["a line feed", "\n"],
    ["a tab", "\t"],
    ["NUL", "\u0000"],
    ["escape", "\u001b"],
    ["delete", "\u007f"],
    ["a C1 control (next line)", "\u0085"],
    ["a line separator", " "],
    ["a paragraph separator", " "],
    ["a right-to-left override", "‮"],
    ["a zero-width space", "​"],
    ["an unpaired surrogate", "\ud800"],
  ] as const;

  describe.each(TEXT_FIELDS)("in $field", (row) => {
    it.each(FORBIDDEN_CHARACTERS)(
      "refuses %s inside the value",
      (_name, character) => {
        const value = `${row.validValue.slice(0, 1)}${character}${row.validValue.slice(1)}`;

        expect(
          codeOf(row.field, withValue(row.baseline, row.field, value)),
        ).toBe("FORBIDDEN_CHARACTER");
      },
    );

    it.each(FORBIDDEN_CHARACTERS)(
      "refuses %s at either end, which trimming must not hide",
      (_name, character) => {
        for (const value of [
          row.validValue + character,
          character + row.validValue,
        ]) {
          expect(
            codeOf(row.field, withValue(row.baseline, row.field, value)),
          ).toBe("FORBIDDEN_CHARACTER");
        }
      },
    );

    propertyTest.prop([
      fc.constantFrom(
        ...FORBIDDEN_CHARACTERS.map(([, character]) => character),
      ),
      fc.nat({ max: row.validValue.length }),
    ])(
      "refuses a forbidden character at any position",
      (character, position) => {
        const value =
          row.validValue.slice(0, position) +
          character +
          row.validValue.slice(position);

        expect(
          codeOf(row.field, withValue(row.baseline, row.field, value)),
        ).toBe("FORBIDDEN_CHARACTER");
      },
    );
  });

  it("accepts ordinary spaces and Romanian letters", () => {
    // eslint-disable-next-line no-restricted-syntax -- a customer's real name: the claim is that diacritics pass the character screen
    const name = "Ștefan Țurcanu-Șoimu";

    expect(contactOf({ ...VALID_INPUT, name }).name).toBe(name);
  });
});

describe("validateContactFields: maximum lengths", () => {
  /** Valid for its field at exactly `length` characters once trimmed. */
  const FIELDS_AT_LENGTH: readonly {
    readonly field: ContactField;
    readonly baseline: ContactFieldsInput;
    readonly maxLength: number;
    readonly valueOfLength: (length: number) => string;
  }[] = [
    {
      field: "name",
      baseline: VALID_INPUT,
      maxLength: CONTACT_NAME_MAX_LENGTH,
      valueOfLength: (length) => "a".repeat(length),
    },
    {
      field: "locality",
      baseline: VALID_INPUT,
      maxLength: CONTACT_LOCALITY_MAX_LENGTH,
      valueOfLength: (length) => "a".repeat(length),
    },
    {
      field: "email",
      baseline: VALID_EMAIL_INPUT,
      maxLength: CONTACT_EMAIL_MAX_LENGTH,
      valueOfLength: (length) =>
        "a".repeat(length - EMAIL_DOMAIN.length) + EMAIL_DOMAIN,
    },
    {
      field: "phone",
      baseline: VALID_INPUT,
      maxLength: CONTACT_PHONE_MAX_LENGTH,
      valueOfLength: (length) => `+373${" ".repeat(length - 12)}79123456`,
    },
    {
      field: "consentTextVersion",
      baseline: VALID_INPUT,
      maxLength: CONSENT_TEXT_VERSION_MAX_LENGTH,
      valueOfLength: (length) => "v".repeat(length),
    },
  ];

  describe.each(FIELDS_AT_LENGTH)("$field", (row) => {
    it("accepts exactly the maximum", () => {
      const input = withValue(
        row.baseline,
        row.field,
        row.valueOfLength(row.maxLength),
      );

      expect(codeOf(row.field, input)).toBeUndefined();
    });

    it("refuses one character past the maximum", () => {
      const input = withValue(
        row.baseline,
        row.field,
        row.valueOfLength(row.maxLength + 1),
      );

      expect(codeOf(row.field, input)).toBe("TOO_LONG");
    });
  });

  it("counts a character outside the BMP once, not as two UTF-16 units", () => {
    const atMaximum = "\u{1F600}".repeat(CONTACT_NAME_MAX_LENGTH);

    expect(codeOf("name", { ...VALID_INPUT, name: atMaximum })).toBeUndefined();
    expect(
      codeOf("name", { ...VALID_INPUT, name: `${atMaximum}\u{1F600}` }),
    ).toBe("TOO_LONG");
  });

  it("measures the trimmed value, which is what is stored", () => {
    const padded = ` ${"a".repeat(CONTACT_NAME_MAX_LENGTH)} `;

    expect(contactOf({ ...VALID_INPUT, name: padded }).name).toHaveLength(
      CONTACT_NAME_MAX_LENGTH,
    );
  });
});

describe("validateContactFields: the phone", () => {
  it.each([
    ["0791", "PHONE_INCOMPLETE"],
    ["0791234567", "PHONE_TOO_MANY_DIGITS"],
    ["79123456", "PHONE_FORMAT_UNRECOGNISED"],
  ] as const)(
    "surfaces the phone rule's refusal of %j as %s",
    (phone, code) => {
      expect(codeOf("phone", { ...VALID_INPUT, phone })).toBe(code);
    },
  );
});

describe("validateContactFields: the e-mail follows the channel", () => {
  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["blank", "   "],
  ])(
    "requires an e-mail for the e-mail channel when it is %s",
    (_name, email) => {
      expect(codeOf("email", { ...VALID_EMAIL_INPUT, email })).toBe("REQUIRED");
    },
  );

  it.each([
    "not-an-email",
    "a@b",
    "a b@example.md",
    "@example.md",
    "a@@example.md",
  ])("refuses %j as MALFORMED for the e-mail channel", (email) => {
    expect(codeOf("email", { ...VALID_EMAIL_INPUT, email })).toBe("MALFORMED");
  });

  it("carries a valid e-mail, trimmed, for the e-mail channel", () => {
    const contact = contactOf({
      ...VALID_EMAIL_INPUT,
      email: "  andrei@example.md ",
    });

    expect(contact.email).toBe("andrei@example.md");
  });

  it.each(["phone", "whatsapp"] as const)(
    "does not require an e-mail for the %s channel",
    (channel) => {
      expect(contactOf({ ...VALID_INPUT, channel }).email).toBeUndefined();
    },
  );

  it.each(["phone", "whatsapp"] as const)(
    "does not carry or judge an e-mail typed before switching to the %s channel",
    (channel) => {
      const contact = contactOf({
        ...VALID_INPUT,
        channel,
        email: "not an e-mail\r\n",
      });

      expect(contact.email).toBeUndefined();
    },
  );
});

describe("validateContactFields: the channel", () => {
  it.each(["sms", "", "Phone", " phone", 5, null, undefined])(
    "refuses %j as UNKNOWN_CHANNEL",
    (channel) => {
      expect(codeOf("channel", { ...VALID_INPUT, channel })).toBe(
        "UNKNOWN_CHANNEL",
      );
    },
  );
});

describe("validateContactFields: consent", () => {
  it.each([false, "true", "on", 1, null, undefined])(
    "refuses %j with its own code",
    (consent) => {
      expect(issuesOf({ ...VALID_INPUT, consent })).toEqual([
        { field: "consent", code: "CONSENT_NOT_GIVEN" },
      ]);
    },
  );

  it("refuses a text version that is not an identifier", () => {
    expect(
      codeOf("consentTextVersion", {
        ...VALID_INPUT,
        consentTextVersion: "v 1",
      }),
    ).toBe("MALFORMED");
  });
});

describe("validateContactFields: every issue, in field order", () => {
  it("names each failing field once, with no value in the refusal", () => {
    const secret = "5551234\r\nBcc: someone@example.org";

    expect(
      issuesOf({ name: "", phone: secret, channel: "sms", consent: false }),
    ).toEqual([
      { field: "name", code: "REQUIRED" },
      { field: "phone", code: "FORBIDDEN_CHARACTER" },
      { field: "channel", code: "UNKNOWN_CHANNEL" },
      { field: "consent", code: "CONSENT_NOT_GIVEN" },
      { field: "consentTextVersion", code: "REQUIRED" },
    ]);
  });
});
