import { fc, test as propertyTest } from "@fast-check/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CONSENT_TEXT_VERSIONS,
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

const KNOWN_CONSENT_TEXT_VERSION = CONSENT_TEXT_VERSIONS[0];

const VALID_INPUT: ContactFieldsInput = {
  name: "Andrei Munteanu",
  phone: "079 123 456",
  locality: "Calarasi",
  channel: "phone",
  consent: true,
  consentTextVersion: KNOWN_CONSENT_TEXT_VERSION,
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
type TextFieldName =
  | "name"
  | "phone"
  | "locality"
  | "email"
  | "consentTextVersion";

const TEXT_FIELDS: readonly {
  readonly field: TextFieldName;
  readonly baseline: ContactFieldsInput;
  readonly validValue: string;
}[] = [
  { field: "name", baseline: VALID_INPUT, validValue: "Ana" },
  { field: "phone", baseline: VALID_INPUT, validValue: "079123456" },
  { field: "locality", baseline: VALID_INPUT, validValue: "Orhei" },
  { field: "email", baseline: VALID_EMAIL_INPUT, validValue: "ana@example.md" },
  {
    field: "consentTextVersion",
    baseline: VALID_INPUT,
    validValue: KNOWN_CONSENT_TEXT_VERSION,
  },
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
      consentTextVersion: KNOWN_CONSENT_TEXT_VERSION,
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
    ["a line separator", "\u2028"],
    ["a paragraph separator", "\u2029"],
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

describe("validateContactFields: format characters are removed", () => {
  const FORMAT_CHARACTERS = [
    ["a left-to-right mark", "\u200e"],
    ["a right-to-left mark", "\u200f"],
    ["a right-to-left override", "\u202e"],
    ["a zero-width space", "\u200b"],
    ["a zero-width joiner", "\u200d"],
    ["a soft hyphen", "\u00ad"],
    ["a byte order mark", "\ufeff"],
  ] as const;

  // The consent text version is a closed set, matched exactly: nothing is stripped to make it match.
  describe.each(
    TEXT_FIELDS.filter((row) => row.field !== "consentTextVersion"),
  )("in $field", (row) => {
    const stored = (input: ContactFieldsInput): string | undefined =>
      contactOf(input)[row.field];

    propertyTest.prop([
      fc.array(
        fc.tuple(
          fc.constantFrom(
            ...FORMAT_CHARACTERS.map(([, character]) => character),
          ),
          fc.nat({ max: row.validValue.length }),
        ),
        { minLength: 1, maxLength: 5 },
      ),
    ])("stores the same value however many are inserted", (insertions) => {
      const dirty = insertions.reduce(
        (value, [character, position]) =>
          value.slice(0, position) + character + value.slice(position),
        row.validValue,
      );

      expect(stored(withValue(row.baseline, row.field, dirty))).toBe(
        stored(withValue(row.baseline, row.field, row.validValue)),
      );
    });

    it("reads a value of nothing but format characters as empty", () => {
      const allFormat = FORMAT_CHARACTERS.map(
        ([, character]) => character,
      ).join("");
      const code = codeOf(
        row.field,
        withValue(row.baseline, row.field, allFormat),
      );

      expect(code).toBe(row.field === "locality" ? undefined : "REQUIRED");
    });
  });

  it("does not change a phone's normal form", () => {
    const clean = contactOf({ ...VALID_INPUT, phone: "+373 79 123 456" });
    const dirty = contactOf({
      ...VALID_INPUT,
      phone: "\u200e+373\u200f 79\u202e 123 \u00ad456\ufeff",
    });

    expect(dirty.phoneNormalForm).toBe(clean.phoneNormalForm);
    expect(dirty.phone).toBe("+373 79 123 456");
  });

  it("counts the length of what is stored, not of what was pasted", () => {
    const pasted = "a\u200b".repeat(CONTACT_NAME_MAX_LENGTH);

    expect(contactOf({ ...VALID_INPUT, name: pasted }).name).toHaveLength(
      CONTACT_NAME_MAX_LENGTH,
    );
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
    ["0791", "PHONE_MOLDOVAN_INCOMPLETE"],
    ["+373 79 12", "PHONE_MOLDOVAN_INCOMPLETE"],
    ["0791234567", "PHONE_MOLDOVAN_TOO_MANY_DIGITS"],
    ["+39 12", "PHONE_INTERNATIONAL_INCOMPLETE"],
    ["+1234567890123456", "PHONE_INTERNATIONAL_TOO_MANY_DIGITS"],
    ["79123456", "PHONE_FORMAT_UNRECOGNISED"],
  ] as const)(
    "surfaces the phone rule's refusal of %j as %s",
    (phone, code) => {
      expect(codeOf("phone", { ...VALID_INPUT, phone })).toBe(code);
    },
  );

  it("accepts a no-break space as grouping", () => {
    expect(
      contactOf({ ...VALID_INPUT, phone: "079\u00a0123\u00a0456" }),
    ).toMatchObject({
      phoneNormalForm: "+37379123456",
    });
  });
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

  it.each(["v 1", "placeholder-2", "PLACEHOLDER", "2026-10-08"])(
    "refuses the text version %j, which is not in the closed set, with its own code",
    (consentTextVersion) => {
      expect(issuesOf({ ...VALID_INPUT, consentTextVersion })).toEqual([
        { field: "consentTextVersion", code: "UNKNOWN_CONSENT_TEXT_VERSION" },
      ]);
    },
  );

  it.each(CONSENT_TEXT_VERSIONS)("accepts the text version %s", (version) => {
    expect(
      contactOf({ ...VALID_INPUT, consentTextVersion: version }),
    ).toMatchObject({
      consentTextVersion: version,
    });
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

const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b);
const COMBINING_ACUTE = String.fromCodePoint(0x0301);
const COMBINING_GRAVE_BELOW = String.fromCodePoint(0x0316);
const LEFT_TO_RIGHT_MARK = String.fromCodePoint(0x200e);

describe("validateContactFields: one stored form for one name (NFC)", () => {
  const COMPOSED_E_ACUTE = "\u00e9";
  const DECOMPOSED_E_ACUTE = `e${COMBINING_ACUTE}`;

  it("stores a decomposed letter in its composed form", () => {
    expect(
      contactOf({ ...VALID_INPUT, name: `Ren${DECOMPOSED_E_ACUTE}` }).name,
    ).toBe(`Ren${COMPOSED_E_ACUTE}`);
  });

  it("stores the composed and the decomposed spelling as one value", () => {
    const composed = contactOf({ ...VALID_INPUT, locality: COMPOSED_E_ACUTE });
    const decomposed = contactOf({
      ...VALID_INPUT,
      locality: DECOMPOSED_E_ACUTE,
    });

    expect(decomposed.locality).toBe(composed.locality);
  });

  it("counts a hundred letters as a hundred however the keyboard built them", () => {
    const composed = COMPOSED_E_ACUTE.repeat(CONTACT_NAME_MAX_LENGTH);
    const decomposed = DECOMPOSED_E_ACUTE.repeat(CONTACT_NAME_MAX_LENGTH);

    expect(codeOf("name", { ...VALID_INPUT, name: composed })).toBeUndefined();
    expect(
      codeOf("name", { ...VALID_INPUT, name: decomposed }),
    ).toBeUndefined();
    expect(
      codeOf("name", {
        ...VALID_INPUT,
        name: `${decomposed}${DECOMPOSED_E_ACUTE}`,
      }),
    ).toBe("TOO_LONG");
  });

  it("composes across a format character that was in the way, because those go first", () => {
    const name = "e" + ZERO_WIDTH_SPACE + COMBINING_ACUTE;

    expect(contactOf({ ...VALID_INPUT, name }).name).toBe(COMPOSED_E_ACUTE);
  });

  it("does not apply the compatibility form, which would change letters the customer chose", () => {
    const ligature = "\ufb01";
    const fullWidth = "\uff21";

    expect(contactOf({ ...VALID_INPUT, name: ligature }).name).toBe(ligature);
    expect(contactOf({ ...VALID_INPUT, name: fullWidth }).name).toBe(fullWidth);
  });
});

describe("validateContactFields: the consent text version is matched exactly, as a channel is", () => {
  const MEMBER = KNOWN_CONSENT_TEXT_VERSION;

  it.each([
    ["trailing space", `${MEMBER} `],
    ["leading space", ` ${MEMBER}`],
    ["a format character inside", "place" + ZERO_WIDTH_SPACE + "holder"],
    ["a left-to-right mark in front", `${LEFT_TO_RIGHT_MARK}${MEMBER}`],
    ["another case", MEMBER.toUpperCase()],
  ])("refuses %s as an unknown version", (_name, consentTextVersion) => {
    expect(
      codeOf("consentTextVersion", { ...VALID_INPUT, consentTextVersion }),
    ).toBe("UNKNOWN_CONSENT_TEXT_VERSION");
  });

  it.each([
    ["nothing", ""],
    ["no value at all", undefined],
  ])("still requires one: %s", (_name, consentTextVersion) => {
    expect(
      codeOf("consentTextVersion", { ...VALID_INPUT, consentTextVersion }),
    ).toBe("REQUIRED");
  });

  it("accepts the member as it is", () => {
    expect(contactOf(VALID_INPUT).consentTextVersion).toBe(MEMBER);
  });
});

describe("validateContactFields: only what the sender's object holds itself is read", () => {
  const PLANTED = {
    name: "Planted Name",
    phone: "069 123 456",
    locality: "Planted",
    channel: "phone",
    consent: true,
    consentTextVersion: KNOWN_CONSENT_TEXT_VERSION,
    email: "planted@example.md",
  } as const;

  afterEach(() => {
    for (const field of Object.keys(PLANTED)) {
      Reflect.deleteProperty(Object.prototype, field);
    }
  });

  function plant(field: keyof typeof PLANTED): void {
    Object.defineProperty(Object.prototype, field, {
      value: PLANTED[field],
      configurable: true,
      enumerable: true,
      writable: true,
    });
  }

  const REQUIRED_FIELDS = [
    "name",
    "phone",
    "channel",
    "consent",
    "consentTextVersion",
  ] as const;

  it.each(REQUIRED_FIELDS)("reads no %s from Object.prototype", (field) => {
    const own = Object.fromEntries(
      Object.entries(VALID_INPUT).filter(([name]) => name !== field),
    );
    plant(field);

    expect(issuesOf(own).map((issue) => issue.field)).toEqual([field]);
  });

  it("carries no planted locality, which is optional and so is refused by nothing", () => {
    const own = Object.fromEntries(
      Object.entries(VALID_INPUT).filter(([name]) => name !== "locality"),
    );
    plant("locality");

    expect(contactOf(own).locality).toBe("");
  });

  it("reads the e-mail only from the sender's own object", () => {
    const own = { ...VALID_INPUT, channel: "email" };
    plant("email");

    expect(codeOf("email", own)).toBe("REQUIRED");
  });
});

describe("validateContactFields: text is judged in the order that keeps it well-formed and cheap", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const HIGH_HALF = "\udb40";
  const LOW_HALF = "\udc01";
  const TYPED_TEXT_FIELDS: readonly {
    readonly field: TextFieldName;
    readonly baseline: ContactFieldsInput;
    readonly wrap: (text: string) => string;
  }[] = [
    { field: "name", baseline: VALID_INPUT, wrap: (text) => text },
    { field: "locality", baseline: VALID_INPUT, wrap: (text) => text },
    {
      field: "phone",
      baseline: VALID_INPUT,
      wrap: (text) => `079${text}123456`,
    },
    {
      field: "email",
      baseline: VALID_EMAIL_INPUT,
      wrap: (text) => `a${text}@example.md`,
    },
  ];

  describe.each(TYPED_TEXT_FIELDS)("in $field", (row) => {
    const codeFor = (text: string) =>
      codeOf(row.field, withValue(row.baseline, row.field, row.wrap(text)));

    it("refuses halves of an astral character split by a format character, which would join when it is removed", () => {
      const split = `Ion${HIGH_HALF}${ZERO_WIDTH_SPACE}${LOW_HALF}x`;

      expect(codeFor(split)).toBe("FORBIDDEN_CHARACTER");
    });

    it.each([
      ["a high half alone", HIGH_HALF],
      ["a low half alone", LOW_HALF],
      ["a low half before a high half", `${LOW_HALF}${HIGH_HALF}`],
      ["a half at the very end", `x${HIGH_HALF}`],
    ])("refuses %s", (_name, text) => {
      expect(codeFor(text)).toBe("FORBIDDEN_CHARACTER");
    });
  });

  it.each(["name", "locality"] as const)(
    "accepts two halves that are a pair in %s",
    (field) => {
      expect(
        codeOf(field, withValue(VALID_INPUT, field, "\ud83d\ude00")),
      ).toBeUndefined();
    },
  );

  it("stores no astral format character, which a joined pair would have left invisible", () => {
    const result = validateContactFields({
      ...VALID_INPUT,
      name: `Ion${String.fromCodePoint(0xe0001)}x`,
    });

    expect(result.ok && result.contact.name).toBe("Ionx");
  });

  it("answers a long run of combining marks with TOO_LONG, and does not compose it first", () => {
    const run = `a${(COMBINING_GRAVE_BELOW + COMBINING_ACUTE).repeat(100_000)}`;
    const composed: string[] = [];
    const normalize = Object.getOwnPropertyDescriptor(
      String.prototype,
      "normalize",
    )?.value as (this: string, form?: string) => string;
    vi.spyOn(String.prototype, "normalize").mockImplementation(function (
      this: string,
      form?: string,
    ) {
      composed.push(this);
      return normalize.call(this, form);
    });

    const code = codeOf("name", { ...VALID_INPUT, name: run });

    // Composing is what costs the length squared, so the behaviour is that the long value never reaches it.
    expect(code).toBe("TOO_LONG");
    expect(composed.every((text) => text.length < run.length)).toBe(true);
  });

  it("removes format characters before it counts, so padding with them is not too long", () => {
    const padded = `a${ZERO_WIDTH_SPACE.repeat(100_000)}`;

    expect(contactOf({ ...VALID_INPUT, name: padded }).name).toBe("a");
  });

  it("reads the phone as typed through the same order", () => {
    const longPhone = `079${COMBINING_GRAVE_BELOW.repeat(100_000)}123456`;

    expect(codeOf("phone", { ...VALID_INPUT, phone: longPhone })).toBe(
      "TOO_LONG",
    );
  });
});

describe("validateContactFields: what is stored is stored again unchanged", () => {
  const NOTABLE_UNITS = [
    0x0020, 0x00a0, 0x00ad, 0x0301, 0x0316, 0x200b, 0x200d, 0x200e, 0x202e,
    0x2028, 0xfeff, 0xd800, 0xdbff, 0xdc00, 0xdfff, 0x0065, 0x00e9, 0x0130,
    0x1100, 0x1161, 0x11a8, 0xfb01, 0x0009, 0x000a,
  ];

  const anyUnit = fc.oneof(
    fc.constantFrom(...NOTABLE_UNITS),
    fc.integer({ min: 0, max: 0xffff }),
  );

  const unitSequence = fc
    .array(anyUnit, { maxLength: 24 })
    .map((units) => String.fromCharCode(...units));

  /** Whole code points only: never half of a pair, whatever the plane. */
  const wellFormedText = fc
    .array(
      fc.oneof(
        fc.constantFrom(...NOTABLE_UNITS.filter((unit) => unit < 0xd800)),
        fc.integer({ min: 0x20, max: 0x2fff }),
        fc.integer({ min: 0x10000, max: 0x10ffff }),
        fc.constantFrom(0xe0001, 0xe0041, 0x1d173),
      ),
      { maxLength: 24 },
    )
    .map((points) => String.fromCodePoint(...points));

  /** An oracle written on purpose apart from the source: it restates the classes a stored value may not
   *  hold, so a change to the source's own classes cannot move what this checks. */
  const FORBIDDEN_OR_FORMAT = /[\p{Cc}\p{Cs}\p{Zl}\p{Zp}\p{Cf}]/u;

  function nameOf(text: string) {
    return validateContactFields({ ...VALID_INPUT, name: text });
  }

  function assertStoredAgain(text: string): boolean {
    const first = nameOf(text);
    if (!first.ok) return false;
    const stored = first.contact.name;
    expect(FORBIDDEN_OR_FORMAT.test(stored)).toBe(false);
    expect(stored.normalize("NFC")).toBe(stored);
    expect(stored).toBe(stored.trim());
    const again = nameOf(stored);
    expect(again.ok && again.contact.name).toBe(stored);
    return true;
  }

  it("holds over arbitrary sequences of UTF-16 units, halves of pairs included", () => {
    let storedCount = 0;
    let refusedCount = 0;
    fc.assert(
      fc.property(unitSequence, (text) => {
        if (assertStoredAgain(text)) storedCount += 1;
        else refusedCount += 1;
      }),
      { numRuns: 3000 },
    );

    expect(storedCount).toBeGreaterThan(100);
    expect(refusedCount).toBeGreaterThan(100);
  });

  it("holds over whole code points, format characters and combining marks among them", () => {
    let storedCount = 0;
    fc.assert(
      fc.property(wellFormedText, (text) => {
        if (assertStoredAgain(text)) storedCount += 1;
      }),
      { numRuns: 3000 },
    );

    expect(storedCount).toBeGreaterThan(1000);
  });

  propertyTest.prop([unitSequence])(
    "refuses a value with a half of a pair, or stores one without any",
    (text) => {
      const result = nameOf(text);
      const hasHalf = /\p{Cs}/u.test(text);

      expect(!hasHalf || !result.ok).toBe(true);
    },
  );
});
