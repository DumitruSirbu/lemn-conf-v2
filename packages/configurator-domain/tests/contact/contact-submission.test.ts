import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  CONSENT_TEXT_VERSIONS,
  CONTACT_INTENTS,
  validateContactSubmission as validateAgainstLocales,
  type ContactFields,
  type ContactSubmissionRequest,
  type SubmissionIssue,
} from "../../src/contact/index.js";

const SERVED_LOCALES = ["ro", "ru"];

function validateContactSubmission(input: unknown) {
  return validateAgainstLocales(input, SERVED_LOCALES);
}

const DESIGN_ID = "abcdefghijklmnopqrstu";
const REQUEST_ID = "0123456789abcdef";

const CONTACT = {
  name: "Andrei Munteanu",
  phone: "079 123 456",
  locality: "Calarasi",
  channel: "phone",
  consent: true,
  consentTextVersion: CONSENT_TEXT_VERSIONS[0],
};

const DESIGN_REQUEST = {
  contact: CONTACT,
  design: { id: DESIGN_ID, revision: "7" },
  clientRequestId: REQUEST_ID,
  locale: "ro",
  honeypot: "",
  elapsedMs: 12_000,
};

const INTENT_REQUEST = {
  contact: CONTACT,
  intent: "callback",
  clientRequestId: REQUEST_ID,
  locale: "ru",
  elapsedMs: 12_000,
};

function without(
  request: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(request).filter(([name]) => name !== key),
  );
}

function issuesOf(input: unknown): readonly SubmissionIssue[] {
  const result = validateContactSubmission(input);
  return result.ok ? [] : result.issues;
}

function requestOf(input: unknown): ContactSubmissionRequest {
  const result = validateContactSubmission(input);
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.issues)}`);
  return result.request;
}

describe("validateContactSubmission: a valid request", () => {
  it("carries a design reference as a design target", () => {
    expect(requestOf(DESIGN_REQUEST)).toMatchObject({
      contact: { phoneNormalForm: "+37379123456" },
      target: { kind: "design", design: { id: DESIGN_ID, revision: "7" } },
      clientRequestId: REQUEST_ID,
      locale: "ro",
      isHoneypotFilled: false,
      elapsedMs: 12_000,
    });
  });

  it.each(CONTACT_INTENTS)(
    "carries the %s intent as an intent target",
    (intent) => {
      expect(requestOf({ ...INTENT_REQUEST, intent }).target).toEqual({
        kind: "intent",
        intent,
      });
    },
  );

  it("runs the contact fields through the contact judges, trimming and normalising", () => {
    const request = requestOf({
      ...DESIGN_REQUEST,
      contact: { ...CONTACT, name: "  Ana  ", phone: "+373 79 123 456" },
    });

    expect(request.contact).toMatchObject({
      name: "Ana",
      phoneNormalForm: "+37379123456",
    });
  });
});

describe("validateContactSubmission: what is not a request", () => {
  class Request {
    contact = CONTACT;
  }

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a string", "contact"],
    ["a number", 5],
    ["an array", [DESIGN_REQUEST]],
    ["a class instance", new Request()],
    ["an object that inherits the request", Object.create(DESIGN_REQUEST)],
  ])("refuses %s as NOT_AN_OBJECT", (_name, input) => {
    expect(issuesOf(input)).toEqual([
      { field: "request", code: "NOT_AN_OBJECT" },
    ]);
  });

  it("accepts an object with no prototype", () => {
    const request: unknown = Object.assign(
      Object.create(null) as object,
      DESIGN_REQUEST,
    );

    expect(validateContactSubmission(request).ok).toBe(true);
  });
});

describe("validateContactSubmission: unknown fields are refused, not ignored", () => {
  const EXTRA_FIELDS = ["bookVersion", "currency", "extra"];

  it.each(EXTRA_FIELDS)("refuses a request-level %s", (key) => {
    expect(issuesOf({ ...DESIGN_REQUEST, [key]: 1 })).toEqual([
      { field: "request", code: "UNKNOWN_FIELD" },
    ]);
  });

  it.each(EXTRA_FIELDS)("refuses a %s inside the contact fields", (key) => {
    expect(
      issuesOf({ ...DESIGN_REQUEST, contact: { ...CONTACT, [key]: 1 } }),
    ).toEqual([{ field: "contact", code: "UNKNOWN_FIELD" }]);
  });

  it.each(EXTRA_FIELDS)("refuses a %s inside the design reference", (key) => {
    const design = { id: DESIGN_ID, revision: "7", [key]: 1 };

    expect(issuesOf({ ...DESIGN_REQUEST, design })).toEqual([
      { field: "design", code: "UNKNOWN_FIELD" },
    ]);
  });

  it("refuses a __proto__ key that JSON.parse made an own property", () => {
    const body = JSON.stringify({ ...DESIGN_REQUEST }).replace(
      "{",
      '{"__proto__":{"price":1},',
    );

    expect(issuesOf(JSON.parse(body))).toEqual([
      { field: "request", code: "UNKNOWN_FIELD" },
    ]);
  });

  it("refuses an unknown field when the request is otherwise invalid, and reports both", () => {
    expect(
      issuesOf({ ...DESIGN_REQUEST, price: 1, locale: "ROMANIAN" }),
    ).toEqual([
      { field: "request", code: "UNKNOWN_FIELD" },
      { field: "locale", code: "UNKNOWN_LOCALE" },
    ]);
  });

  it("does not name the unknown key or carry its value", () => {
    const refusal = JSON.stringify(
      issuesOf({ ...DESIGN_REQUEST, secretKeyName: "secret value" }),
    );

    expect(refusal).not.toContain("secretKeyName");
    expect(refusal).not.toContain("secret value");
  });

  const knownKeys = [...Object.keys(DESIGN_REQUEST), "intent"];

  propertyTest.prop([
    fc.string({ maxLength: 12 }).filter((key) => !knownKeys.includes(key)),
    fc.jsonValue(),
  ])("refuses any key the request does not declare", (key, value) => {
    const extra = Object.fromEntries([[key, value]]);

    expect(issuesOf({ ...DESIGN_REQUEST, ...extra })).toEqual([
      { field: "request", code: "UNKNOWN_FIELD" },
    ]);
  });

  propertyTest.prop([
    fc.string({ maxLength: 12 }).filter((key) => !(key in CONTACT)),
    fc.jsonValue(),
  ])("refuses any key the contact fields do not declare", (key, value) => {
    const contact = { ...CONTACT, ...Object.fromEntries([[key, value]]) };

    expect(issuesOf({ ...DESIGN_REQUEST, contact })).toEqual([
      { field: "contact", code: "UNKNOWN_FIELD" },
    ]);
  });

  it("accepts the e-mail, a known contact field, whatever the channel", () => {
    const contact = { ...CONTACT, email: "not judged, not carried" };

    expect(
      requestOf({ ...DESIGN_REQUEST, contact }).contact.email,
    ).toBeUndefined();
  });
});

describe("validateContactSubmission: a design reference or an intent, exactly one", () => {
  const withBoth = { ...DESIGN_REQUEST, intent: "callback" };
  const withNeither = without(DESIGN_REQUEST, "design");

  it("accepts a design reference alone", () => {
    expect(requestOf(DESIGN_REQUEST).target.kind).toBe("design");
  });

  it("accepts an intent alone", () => {
    expect(requestOf(INTENT_REQUEST).target.kind).toBe("intent");
  });

  it("refuses both", () => {
    expect(issuesOf(withBoth)).toEqual([
      { field: "design", code: "DESIGN_AND_INTENT_BOTH" },
    ]);
  });

  it("refuses neither", () => {
    expect(issuesOf(withNeither)).toEqual([
      { field: "design", code: "DESIGN_OR_INTENT_MISSING" },
    ]);
  });

  it.each([
    ["an unknown intent", "link"],
    ["an intent in the wrong case", "Callback"],
    ["an intent that is not text", 5],
    ["null", null],
  ])("refuses %s", (_name, intent) => {
    expect(issuesOf({ ...INTENT_REQUEST, intent })).toEqual([
      { field: "intent", code: "UNKNOWN_INTENT" },
    ]);
  });

  it.each([
    ["null", null],
    ["a string", DESIGN_ID],
    ["an array", [DESIGN_ID, "7"]],
  ])("refuses a design that is %s", (_name, design) => {
    expect(issuesOf({ ...DESIGN_REQUEST, design })).toEqual([
      { field: "design", code: "NOT_AN_OBJECT" },
    ]);
  });
});

describe("validateContactSubmission: the design reference's shapes", () => {
  const designIssues = (design: unknown) =>
    issuesOf({ ...DESIGN_REQUEST, design });

  it.each([
    ["twenty characters", "a".repeat(20)],
    ["twenty-two characters", "a".repeat(22)],
    ["a space", `${"a".repeat(20)} `],
    ["a trailing line feed", `${"a".repeat(21)}\n`],
    ["a character outside the alphabet", `${"a".repeat(20)}.`],
    ["a non-ASCII letter", `${"a".repeat(20)}é`],
    ["empty", ""],
  ])("refuses an id of %s as MALFORMED", (_name, id) => {
    expect(designIssues({ id, revision: "7" })).toEqual([
      { field: "design.id", code: "MALFORMED" },
    ]);
  });

  it("accepts every character of the id alphabet", () => {
    const id = "Az09_-Az09_-Az09_-Az0";

    expect(
      requestOf({ ...DESIGN_REQUEST, design: { id, revision: "7" } }),
    ).toBeDefined();
  });

  it.each([
    ["zero", "0"],
    ["a leading zero", "01"],
    ["an exponent", "1e3"],
    ["a space", " 1"],
    ["a trailing line feed", "1\n"],
    ["a sign", "-1"],
    ["a decimal point", "1.5"],
    ["twenty digits", "1".repeat(20)],
    ["empty", ""],
  ])("refuses a revision of %s as MALFORMED", (_name, revision) => {
    expect(designIssues({ id: DESIGN_ID, revision })).toEqual([
      { field: "design.revision", code: "MALFORMED" },
    ]);
  });

  it.each(["1", "9", "10", "1".repeat(19)])(
    "accepts the revision %s",
    (revision) => {
      expect(
        requestOf({ ...DESIGN_REQUEST, design: { id: DESIGN_ID, revision } }),
      ).toBeDefined();
    },
  );

  it("refuses a revision that is a number, which JSON cannot carry exactly", () => {
    expect(designIssues({ id: DESIGN_ID, revision: 7 })).toEqual([
      { field: "design.revision", code: "NOT_TEXT" },
    ]);
  });

  it("requires both parts and reports each", () => {
    expect(designIssues({})).toEqual([
      { field: "design.id", code: "REQUIRED" },
      { field: "design.revision", code: "REQUIRED" },
    ]);
  });
});

describe("validateContactSubmission: the client request id", () => {
  const idIssues = (clientRequestId: unknown) =>
    issuesOf({ ...DESIGN_REQUEST, clientRequestId });

  it.each([
    ["sixteen characters", "a".repeat(16)],
    ["sixty-four characters", "a".repeat(64)],
    ["a UUID", "123e4567-e89b-42d3-a456-426614174000"],
    ["a nanoid", DESIGN_ID],
  ])("accepts %s", (_name, clientRequestId) => {
    expect(idIssues(clientRequestId)).toEqual([]);
  });

  it.each([
    ["fifteen characters", "a".repeat(15)],
    ["sixty-five characters", "a".repeat(65)],
    ["a space", `${"a".repeat(16)} `],
    ["a line feed", `${"a".repeat(16)}\n`],
    ["a header-forging pair", `${"a".repeat(16)}\r\nBcc: x`],
    ["empty", ""],
  ])("refuses %s as MALFORMED", (_name, clientRequestId) => {
    expect(idIssues(clientRequestId)).toEqual([
      { field: "clientRequestId", code: "MALFORMED" },
    ]);
  });

  it("requires it", () => {
    expect(issuesOf(without(DESIGN_REQUEST, "clientRequestId"))).toEqual([
      { field: "clientRequestId", code: "REQUIRED" },
    ]);
  });

  it("refuses one that is not text", () => {
    expect(idIssues(1234567890123456)).toEqual([
      { field: "clientRequestId", code: "NOT_TEXT" },
    ]);
  });
});

describe("validateContactSubmission: the locale", () => {
  it.each(["ro", "ru"])("accepts %s", (locale) => {
    expect(issuesOf({ ...DESIGN_REQUEST, locale })).toEqual([]);
  });

  it.each(["RO", "r", "romanian", "ro\n", "ro-MD", "", " ro", "en"])(
    "refuses %j, which the application does not serve, as UNKNOWN_LOCALE",
    (locale) => {
      expect(issuesOf({ ...DESIGN_REQUEST, locale })).toEqual([
        { field: "locale", code: "UNKNOWN_LOCALE" },
      ]);
    },
  );

  it("judges against the list it is given, not a list of its own", () => {
    const request = { ...DESIGN_REQUEST, locale: "en" };

    expect(validateAgainstLocales(request, ["en"]).ok).toBe(true);
    expect(validateAgainstLocales(request, ["ro", "ru"]).ok).toBe(false);
    expect(
      validateAgainstLocales({ ...DESIGN_REQUEST, locale: "ro" }, ["en"]).ok,
    ).toBe(false);
  });

  it("has no default list: calling it without one is a type error", () => {
    // @ts-expect-error -- the list is required; a default would be a second list
    expect(() => validateAgainstLocales(DESIGN_REQUEST)).toThrow();
  });

  it("requires it, and refuses one that is not text", () => {
    expect(issuesOf(without(DESIGN_REQUEST, "locale"))).toEqual([
      { field: "locale", code: "REQUIRED" },
    ]);
    expect(issuesOf({ ...DESIGN_REQUEST, locale: 1 })).toEqual([
      { field: "locale", code: "NOT_TEXT" },
    ]);
  });
});

describe("validateContactSubmission: the honeypot is carried as a yes or no", () => {
  /** Mirrors `HONEYPOT_MAX_LENGTH` in the source, which is private. */
  const HONEYPOT_MAX = 256;

  it.each(["\u0000"])("reads %j as filled: any text at all is", (honeypot) => {
    expect(requestOf({ ...DESIGN_REQUEST, honeypot }).isHoneypotFilled).toBe(
      true,
    );
  });

  it("accepts exactly the honeypot's maximum and refuses one past it", () => {
    expect(
      issuesOf({ ...DESIGN_REQUEST, honeypot: "x".repeat(HONEYPOT_MAX) }),
    ).toEqual([]);
    expect(
      issuesOf({ ...DESIGN_REQUEST, honeypot: "x".repeat(HONEYPOT_MAX + 1) }),
    ).toEqual([{ field: "honeypot", code: "TOO_LONG" }]);
  });

  it("refuses a honeypot that is not text", () => {
    expect(issuesOf({ ...DESIGN_REQUEST, honeypot: true })).toEqual([
      { field: "honeypot", code: "NOT_TEXT" },
    ]);
  });
});

describe("validateContactSubmission: the contact fields", () => {
  it("requires them", () => {
    expect(issuesOf(without(DESIGN_REQUEST, "contact"))).toEqual([
      { field: "contact", code: "REQUIRED" },
    ]);
  });

  it.each([null, "Ana", [CONTACT], 5])(
    "refuses %j as NOT_AN_OBJECT",
    (contact) => {
      expect(issuesOf({ ...DESIGN_REQUEST, contact })).toEqual([
        { field: "contact", code: "NOT_AN_OBJECT" },
      ]);
    },
  );

  it("names each failing contact field under the contact, with the contact judge's own code", () => {
    const contact = { ...CONTACT, name: "", phone: "0791", consent: false };

    expect(issuesOf({ ...DESIGN_REQUEST, contact })).toEqual([
      { field: "contact.name", code: "REQUIRED" },
      { field: "contact.phone", code: "PHONE_MOLDOVAN_INCOMPLETE" },
      { field: "contact.consent", code: "CONSENT_NOT_GIVEN" },
    ]);
  });

  it("carries no typed value in any refusal", () => {
    const secret = "5551234\r\nBcc: someone@example.org";
    const refusal = JSON.stringify(
      issuesOf({ ...DESIGN_REQUEST, contact: { ...CONTACT, phone: secret } }),
    );

    expect(refusal).not.toContain("Bcc");
    expect(refusal).not.toContain("5551234");
  });

  it("reports every failing part of the request, in field order", () => {
    const input = {
      contact: {},
      design: { id: "short", revision: "0" },
      clientRequestId: "x",
      locale: "RO",
      honeypot: 1,
      elapsedMs: -1,
    };

    expect(issuesOf(input).map(({ field }) => field)).toEqual([
      "contact.name",
      "contact.phone",
      "contact.channel",
      "contact.consent",
      "contact.consentTextVersion",
      "design.id",
      "design.revision",
      "clientRequestId",
      "locale",
      "honeypot",
      "elapsedMs",
    ]);
  });
});

describe("validateContactSubmission: the request has no price", () => {
  type RequestKey = keyof ContactSubmissionRequest;
  type ContactKey = keyof ContactFields;

  it("declares exactly these request fields, so a price field fails to compile", () => {
    expectTypeOf<RequestKey>().toEqualTypeOf<
      | "contact"
      | "target"
      | "clientRequestId"
      | "locale"
      | "isHoneypotFilled"
      | "elapsedMs"
    >();
  });

  it("declares exactly these contact fields, so a price field fails to compile", () => {
    expectTypeOf<ContactKey>().toEqualTypeOf<
      | "name"
      | "phone"
      | "phoneNormalForm"
      | "locality"
      | "channel"
      | "email"
      | "consentTextVersion"
    >();
  });

  const PRICE_LIKE =
    /price|total|amount|cost|currency|lines|bookversion|pricingversion/i;

  function keysDeep(value: unknown): readonly string[] {
    if (typeof value !== "object" || value === null) return [];
    return Object.entries(value).flatMap(([key, nested]) => [
      key,
      ...keysDeep(nested),
    ]);
  }

  /** Fewer keys than the result's three levels hold means the walk read nothing, and "no price-like key" would
   *  be true of an empty list. */
  const MIN_KEYS_WALKED = 10;

  it.each([
    ["a design request", DESIGN_REQUEST],
    ["an intent request", INTENT_REQUEST],
  ])(
    "parses %s into a result with no price-like key at any depth",
    (_name, input) => {
      const keys = keysDeep(requestOf(input));

      expect(keys.length).toBeGreaterThan(MIN_KEYS_WALKED);
      expect(keys.filter((key) => PRICE_LIKE.test(key))).toEqual([]);
    },
  );
});
