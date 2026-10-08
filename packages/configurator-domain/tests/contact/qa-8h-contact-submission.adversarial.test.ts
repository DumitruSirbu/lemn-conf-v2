// Wave 8H, criteria 5, 12 and 13, and ADR 0095 for every refusal: unknown fields at all three levels as a
// JSON body carries them, a design reference or an intent in every combination, the locale list as a
// parameter, the elapsed time at its edges, and no refusal that holds a value the sender chose.
import { runInNewContext } from "node:vm";

import { fc, test as propertyTest } from "@fast-check/vitest";
import { afterEach, describe, expect, it } from "vitest";

import {
  CONSENT_TEXT_VERSIONS,
  CONTACT_INTENTS,
  validateContactSubmission,
  type ContactSubmissionValidation,
  type SubmissionIssue,
} from "../../src/contact/index.js";

const SERVED_LOCALES = ["ro", "ru"] as const;
const DESIGN_ID = "abcdefghijklmnopqrstu";
const REQUEST_ID = "0123456789abcdef";
const MARKER = "ZZQA8H";

type Json = Readonly<Record<string, unknown>>;

const CONTACT: Json = {
  name: "Andrei Munteanu",
  phone: "079 123 456",
  locality: "Orhei",
  channel: "phone",
  consent: true,
  consentTextVersion: CONSENT_TEXT_VERSIONS[0],
};

const DESIGN_REFERENCE: Json = { id: DESIGN_ID, revision: "7" };

const WITHOUT_TARGET: Json = {
  contact: CONTACT,
  clientRequestId: REQUEST_ID,
  locale: "ro",
  honeypot: "",
  elapsedMs: 12_000,
};

const DESIGN_REQUEST: Json = { ...WITHOUT_TARGET, design: DESIGN_REFERENCE };

/** Every field a refusal may name and every code it may give, written out: a refusal outside these holds
 *  something that was not decided here. */
const KNOWN_FIELDS = [
  "request",
  "contact",
  "contact.name",
  "contact.phone",
  "contact.locality",
  "contact.channel",
  "contact.email",
  "contact.consent",
  "contact.consentTextVersion",
  "design",
  "design.id",
  "design.revision",
  "intent",
  "clientRequestId",
  "locale",
  "honeypot",
  "elapsedMs",
];

const KNOWN_CODES = [
  "REQUIRED",
  "NOT_TEXT",
  "TOO_LONG",
  "FORBIDDEN_CHARACTER",
  "MALFORMED",
  "PHONE_MOLDOVAN_INCOMPLETE",
  "PHONE_MOLDOVAN_TOO_MANY_DIGITS",
  "PHONE_INTERNATIONAL_INCOMPLETE",
  "PHONE_INTERNATIONAL_TOO_MANY_DIGITS",
  "PHONE_FORMAT_UNRECOGNISED",
  "UNKNOWN_CHANNEL",
  "CONSENT_NOT_GIVEN",
  "UNKNOWN_CONSENT_TEXT_VERSION",
  "NOT_AN_OBJECT",
  "UNKNOWN_FIELD",
  "DESIGN_AND_INTENT_BOTH",
  "DESIGN_OR_INTENT_MISSING",
  "UNKNOWN_INTENT",
  "UNKNOWN_LOCALE",
];

function validate(input: unknown): ContactSubmissionValidation {
  return validateContactSubmission(input, SERVED_LOCALES);
}

function issuesOf(input: unknown): readonly SubmissionIssue[] {
  const result = validate(input);
  return result.ok ? [] : result.issues;
}

function codesOf(input: unknown): readonly string[] {
  const result = validate(input);
  return result.ok
    ? ["accepted"]
    : result.issues.map(({ field, code }) => `${field}: ${code}`);
}

function omitting(record: Json, ...keys: readonly string[]): Json {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !keys.includes(key)),
  );
}

/** As a server reads a body: text, parsed. */
function asReceived(body: string): unknown {
  return JSON.parse(body) as unknown;
}

function bodyWith(extraMember: string, at: "request" | "contact" | "design") {
  const contact = JSON.stringify(CONTACT);
  const design = JSON.stringify(DESIGN_REFERENCE);
  const withExtra = (object: string) =>
    `${object.slice(0, -1)},${extraMember}}`;
  const rest = `"clientRequestId":"${REQUEST_ID}","locale":"ro","honeypot":"","elapsedMs":12000`;
  const request = `{"contact":${at === "contact" ? withExtra(contact) : contact},"design":${
    at === "design" ? withExtra(design) : design
  },${rest}}`;
  return at === "request" ? withExtra(request) : request;
}

describe("8H criterion 5: an unknown field is refused at every level, as a JSON body carries it", () => {
  const EXTRA_MEMBERS = [
    '"totalMinor":1',
    '"total":"1 MDL"',
    '"lines":[]',
    '"pricingVersion":"sample"',
    '"price":{"totalMinor":1}',
    '"__proto__":{"consent":true}',
    '"constructor":{"prototype":{}}',
    '"toString":"x"',
    '"hasOwnProperty":1',
    '"":0',
    '" contact":{}',
    '"Contact":{}',
    '"design\\u200b":{}',
    '"0":0',
  ];
  const LEVELS = ["request", "contact", "design"] as const;

  it("accepts the body the extras are added to", () => {
    expect(codesOf(asReceived(bodyWith('"honeypot":""', "request")))).toEqual([
      "accepted",
    ]);
  });

  describe.each(LEVELS)("at the %s level", (level) => {
    it.each(EXTRA_MEMBERS)(
      "refuses %s, naming the level and nothing else",
      (extra) => {
        expect(issuesOf(asReceived(bodyWith(extra, level)))).toEqual([
          { field: level, code: "UNKNOWN_FIELD" },
        ]);
      },
    );
  });

  it("reports one refusal for a level however many unknown fields it holds", () => {
    const body = bodyWith('"a":1,"b":2,"c":3', "contact");

    expect(issuesOf(asReceived(body))).toEqual([
      { field: "contact", code: "UNKNOWN_FIELD" },
    ]);
  });

  it("reports all three levels at once, outermost first", () => {
    const request = {
      ...DESIGN_REQUEST,
      total: 1,
      contact: { ...CONTACT, total: 1 },
      design: { ...DESIGN_REFERENCE, total: 1 },
    };

    expect(codesOf(request)).toEqual([
      "request: UNKNOWN_FIELD",
      "contact: UNKNOWN_FIELD",
      "design: UNKNOWN_FIELD",
    ]);
  });

  it("returns only what it judged: an accepted request holds no key the type does not declare", () => {
    const result = validate({
      ...DESIGN_REQUEST,
      contact: { ...CONTACT, email: MARKER },
    });

    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain(MARKER);
  });

  // QA finding 7, as built: a key no JSON body can carry is not seen. Unreachable from a parsed body; it
  // matters only to a caller that builds the request object itself.
  it("as built: does not see a symbol key or a non-enumerable one", () => {
    const withSymbol = { ...DESIGN_REQUEST, [Symbol("totalMinor")]: 1 };
    const withHidden = Object.defineProperty(
      { ...DESIGN_REQUEST },
      "totalMinor",
      {
        value: 1,
        enumerable: false,
      },
    );

    expect(codesOf(withSymbol)).toEqual(["accepted"]);
    expect(codesOf(withHidden)).toEqual(["accepted"]);
  });
});

describe("8H criterion 5: only an object a body parses to is a request", () => {
  class Request {
    readonly contact = CONTACT;
    readonly design = DESIGN_REFERENCE;
    readonly clientRequestId = REQUEST_ID;
    readonly locale = "ro";
    readonly elapsedMs = 1;
  }

  it.each([
    ["an array holding a request", [DESIGN_REQUEST]],
    ["a class instance with every field", new Request()],
    [
      "an object inheriting every field",
      Object.create(DESIGN_REQUEST) as unknown,
    ],
    ["a map", new Map(Object.entries(DESIGN_REQUEST))],
    ["a function", () => DESIGN_REQUEST],
    ["the body's text, unparsed", JSON.stringify(DESIGN_REQUEST)],
    ["null", null],
    ["nothing", undefined],
  ])("refuses %s", (_name, input) => {
    expect(codesOf(input)).toEqual(["request: NOT_AN_OBJECT"]);
  });

  it.each([
    ["an array", [CONTACT]],
    ["an object inheriting every field", Object.create(CONTACT) as unknown],
    ["null", null],
    ["text", JSON.stringify(CONTACT)],
  ])("refuses contact fields that are %s", (_name, contact) => {
    expect(codesOf({ ...DESIGN_REQUEST, contact })).toEqual([
      "contact: NOT_AN_OBJECT",
    ]);
  });

  it.each([
    ["an array", [DESIGN_ID, "7"]],
    [
      "an object inheriting both parts",
      Object.create(DESIGN_REFERENCE) as unknown,
    ],
    ["null", null],
    ["the id alone, as text", DESIGN_ID],
  ])("refuses a design reference that is %s", (_name, design) => {
    expect(codesOf({ ...WITHOUT_TARGET, design })).toEqual([
      "design: NOT_AN_OBJECT",
    ]);
  });

  it("accepts objects with no prototype at every level", () => {
    const bare = (fields: Json): unknown =>
      Object.assign(Object.create(null) as object, fields);

    expect(
      codesOf(
        bare({
          ...WITHOUT_TARGET,
          contact: bare(CONTACT),
          design: bare(DESIGN_REFERENCE),
        }),
      ),
    ).toEqual(["accepted"]);
  });

  // QA finding 8, as built, for 8K: "plain" is judged by this realm's `Object.prototype`, so a body parsed
  // in another realm is refused whole though it is the same data.
  it("as built: refuses the same body parsed in another realm", () => {
    const parsedElsewhere: unknown = runInNewContext(
      `JSON.parse(${JSON.stringify(JSON.stringify(DESIGN_REQUEST))})`,
    );

    expect(JSON.stringify(parsedElsewhere)).toBe(
      JSON.stringify(DESIGN_REQUEST),
    );
    expect(codesOf(parsedElsewhere)).toEqual(["request: NOT_AN_OBJECT"]);
  });
});

// QA finding 2. `judgeContact` checks that the contact is a plain object and then hands it to
// `validateContactFields`, which reads `input.consent`, `input.name` and the rest by plain property access.
// A property on `Object.prototype` is therefore read as one the sender wrote, which `isPlainObject`'s own
// comment says never happens. With a polluted prototype a body with no consent in it is accepted.
describe("8H criteria 4 and 5: an inherited property is never read as one the sender wrote", () => {
  const PLANTED = ["consent", "channel", "locality"] as const;

  function plant(name: (typeof PLANTED)[number], value: unknown): void {
    Object.defineProperty(Object.prototype, name, {
      value,
      configurable: true,
      enumerable: true,
      writable: true,
    });
  }

  afterEach(() => {
    for (const name of PLANTED) Reflect.deleteProperty(Object.prototype, name);
  });

  it("refuses a body with no consent in it though Object.prototype carries one", () => {
    const body = JSON.stringify({
      ...DESIGN_REQUEST,
      contact: omitting(CONTACT, "consent"),
    });
    plant("consent", true);

    expect(codesOf(asReceived(body))).toEqual([
      "contact.consent: CONSENT_NOT_GIVEN",
    ]);
  });

  it("stores no locality the sender did not write", () => {
    const body = JSON.stringify({
      ...DESIGN_REQUEST,
      contact: omitting(CONTACT, "locality"),
    });
    plant("locality", MARKER);

    expect(JSON.stringify(validate(asReceived(body)))).not.toContain(MARKER);
  });

  it("requires a channel the sender did not write", () => {
    const body = JSON.stringify({
      ...DESIGN_REQUEST,
      contact: omitting(CONTACT, "channel"),
    });
    plant("channel", "phone");

    expect(codesOf(asReceived(body))).toEqual([
      "contact.channel: UNKNOWN_CHANNEL",
    ]);
  });
});

describe("8H criterion 5: a design reference or an intent, and never both or neither", () => {
  const ABSENT = Symbol("absent");
  const INTENT = CONTACT_INTENTS[0];

  function requestWith(design: unknown, intent: unknown): Json {
    return {
      ...WITHOUT_TARGET,
      ...(design === ABSENT ? {} : { design }),
      ...(intent === ABSENT ? {} : { intent }),
    };
  }

  it.each([
    ["a reference, no intent", DESIGN_REFERENCE, ABSENT, ["accepted"]],
    ["no reference, an intent", ABSENT, INTENT, ["accepted"]],
    ["both", DESIGN_REFERENCE, INTENT, ["design: DESIGN_AND_INTENT_BOTH"]],
    ["neither", ABSENT, ABSENT, ["design: DESIGN_OR_INTENT_MISSING"]],
    [
      "a null reference, an intent",
      null,
      INTENT,
      ["design: DESIGN_AND_INTENT_BOTH"],
    ],
    [
      "a reference, a null intent",
      DESIGN_REFERENCE,
      null,
      ["design: DESIGN_AND_INTENT_BOTH"],
    ],
    ["both null", null, null, ["design: DESIGN_AND_INTENT_BOTH"]],
    ["a null reference alone", null, ABSENT, ["design: NOT_AN_OBJECT"]],
    ["a null intent alone", ABSENT, null, ["intent: UNKNOWN_INTENT"]],
    [
      "an empty reference",
      {},
      ABSENT,
      ["design.id: REQUIRED", "design.revision: REQUIRED"],
    ],
    [
      "an empty reference and an unknown intent",
      {},
      "quote",
      ["design: DESIGN_AND_INTENT_BOTH"],
    ],
    ["an unknown intent", ABSENT, "quote", ["intent: UNKNOWN_INTENT"]],
    [
      "an intent in another case",
      ABSENT,
      "Callback",
      ["intent: UNKNOWN_INTENT"],
    ],
    ["an intent in an array", ABSENT, [INTENT], ["intent: UNKNOWN_INTENT"]],
    ["an empty intent", ABSENT, "", ["intent: UNKNOWN_INTENT"]],
    ["false for both", false, false, ["design: DESIGN_AND_INTENT_BOTH"]],
  ])("%s", (_name, design, intent, expected) => {
    expect(codesOf(requestWith(design, intent))).toEqual(expected);
  });

  it.each([
    ["an undefined reference beside an intent", undefined, INTENT, "intent"],
    [
      "an undefined intent beside a reference",
      DESIGN_REFERENCE,
      undefined,
      "design",
    ],
  ])(
    "reads %s as absent, as a JSON body would have dropped it",
    (_name, design, intent, kind) => {
      const result = validate(requestWith(design, intent));

      expect(result).toMatchObject({ ok: true, request: { target: { kind } } });
    },
  );

  it("holds exactly one of the two in what it returns", () => {
    const targets = [
      requestWith(DESIGN_REFERENCE, ABSENT),
      requestWith(ABSENT, INTENT),
    ]
      .map((request) => validate(request))
      .map((result) =>
        result.ok ? Object.keys(result.request.target).sort() : [],
      );

    expect(targets).toEqual([
      ["design", "kind"],
      ["intent", "kind"],
    ]);
  });
});

describe("8H criterion 12: the served locales are a parameter", () => {
  it.each([
    ["a valid request", DESIGN_REQUEST],
    ["a request that would be refused", { ...DESIGN_REQUEST, locale: 5 }],
    ["what is not a request at all", null],
  ])("throws for an empty list, given %s", (_name, input) => {
    expect(() => validateContactSubmission(input, [])).toThrow(RangeError);
  });

  it("says nothing of the request when it throws", () => {
    const request = { ...DESIGN_REQUEST, locale: MARKER };

    expect(() => validateContactSubmission(request, [])).toThrow(
      /^validateContactSubmission: the list of served locales is empty$/,
    );
  });

  it("has no list of its own: a locale is accepted exactly when the list it is handed holds it", () => {
    const lists = [
      ["ro"],
      ["ru"],
      ["ro", "ru"],
      ["en"],
      ["ru", "ru", "ro", "ro"],
    ];
    const locales = ["ro", "ru", "en"];

    const accepted = lists.map((list) =>
      locales.filter(
        (locale) =>
          validateContactSubmission({ ...DESIGN_REQUEST, locale }, list).ok,
      ),
    );

    expect(accepted).toEqual([
      ["ro"],
      ["ru"],
      ["ro", "ru"],
      ["en"],
      ["ro", "ru"],
    ]);
  });

  it.each([
    "RO",
    "ro ",
    "ro\u200b",
    "ro-MD",
    "ro,ru",
    "constructor",
    "length",
    "0",
    "",
  ])("refuses %j with the locale's own code", (locale) => {
    expect(codesOf({ ...DESIGN_REQUEST, locale })).toEqual([
      "locale: UNKNOWN_LOCALE",
    ]);
  });

  it.each([
    ["a number", 0],
    ["an array holding a served one", ["ro"]],
    ["null", null],
    ["an object that prints as a served one", { toString: () => "ro" }],
  ])("refuses %s as not text", (_name, locale) => {
    expect(codesOf({ ...DESIGN_REQUEST, locale })).toEqual([
      "locale: NOT_TEXT",
    ]);
  });

  it("does not change the list it is handed", () => {
    const list = Object.freeze(["ro", "ru"]);

    expect(validateContactSubmission(DESIGN_REQUEST, list).ok).toBe(true);
    expect(list).toEqual(["ro", "ru"]);
  });

  // QA finding 9, as built: the list is believed. One that holds an empty entry serves the empty locale.
  it("as built: accepts the empty locale when the list holds an empty entry", () => {
    const result = validateContactSubmission(
      { ...DESIGN_REQUEST, locale: "" },
      ["ro", ""],
    );

    expect(result.ok).toBe(true);
  });
});

describe("8H criterion 13: nobody is refused for taking long", () => {
  propertyTest.prop([fc.maxSafeNat()])(
    "accepts every whole number a JSON number holds exactly, and carries it unchanged",
    (elapsedMs) => {
      expect(validate({ ...DESIGN_REQUEST, elapsedMs })).toMatchObject({
        ok: true,
        request: { elapsedMs },
      });
    },
  );

  it.each([
    ["nothing at all", 0],
    ["a day", 86_400_000],
    ["a day and a millisecond", 86_400_001],
    ["a year", 31_536_000_000],
    ["the largest exact whole number", Number.MAX_SAFE_INTEGER],
  ])("accepts %s", (_name, elapsedMs) => {
    expect(codesOf({ ...DESIGN_REQUEST, elapsedMs })).toEqual(["accepted"]);
  });

  it.each([
    ["one past the largest exact whole number", Number.MAX_SAFE_INTEGER + 1],
    ["the largest number", Number.MAX_VALUE],
    ["a negative millisecond", -1],
    ["a fraction", 0.5],
    ["a fraction just under a whole", 11_999.999],
    ["not a number", Number.NaN],
    ["infinity", Number.POSITIVE_INFINITY],
    ["negative infinity", Number.NEGATIVE_INFINITY],
    ["a number as text", "12000"],
    ["empty text", ""],
    ["a big integer", 12_000n],
    ["a boxed number", Object(12_000) as unknown],
    ["an array of one number", [12_000]],
    ["true", true],
    ["null", null],
    ["an object that converts to a number", { valueOf: () => 12_000 }],
  ])("refuses %s as malformed", (_name, elapsedMs) => {
    expect(codesOf({ ...DESIGN_REQUEST, elapsedMs })).toEqual([
      "elapsedMs: MALFORMED",
    ]);
  });

  it("requires it", () => {
    expect(codesOf(omitting(DESIGN_REQUEST, "elapsedMs"))).toEqual([
      "elapsedMs: REQUIRED",
    ]);
  });

  // QA finding 10, as built: negative zero is accepted and carried as negative zero. A JSON body can write
  // it; it serialises back as 0, and it is not less than 0, so nothing downstream reads it as negative.
  it("as built: carries negative zero as it came", () => {
    const result = validate(asReceived(bodyWith('"elapsedMs":-0', "request")));

    expect(result.ok && Object.is(result.request.elapsedMs, -0)).toBe(true);
    expect(JSON.stringify(result)).toContain('"elapsedMs":0');
  });
});

describe("8H S2, readings 4 and 5: the client request id and the honeypot", () => {
  it.each([
    ["fifteen characters", "a".repeat(15)],
    ["sixty-five characters", "a".repeat(65)],
    ["a trailing line feed", `${"a".repeat(16)}\n`],
    ["a leading line feed", `\n${"a".repeat(16)}`],
    ["a space", `${"a".repeat(15)} a`],
    ["a format character", `${"a".repeat(16)}\u200b`],
    ["a non-ASCII letter", `${"a".repeat(15)}\u0103`],
    ["a full-width digit", `${"a".repeat(15)}\uff11`],
    ["a dot", `${"a".repeat(15)}.`],
    ["a slash", `${"a".repeat(15)}/`],
  ])("refuses a client request id with %s", (_name, clientRequestId) => {
    expect(codesOf({ ...DESIGN_REQUEST, clientRequestId })).toEqual([
      "clientRequestId: MALFORMED",
    ]);
  });

  it.each([16, 21, 36, 64])("accepts one of %i characters", (length) => {
    const clientRequestId = "aZ0_-".repeat(13).slice(0, length);

    expect(codesOf({ ...DESIGN_REQUEST, clientRequestId })).toEqual([
      "accepted",
    ]);
  });

  it("carries a filled honeypot whole and never judges what it holds", () => {
    const honeypot = `\r\nBcc: ${MARKER}\u0000\ud800\u202e`;

    expect(validate({ ...DESIGN_REQUEST, honeypot })).toMatchObject({
      ok: true,
      request: { honeypot },
    });
  });

  it("names no part of a honeypot it refuses for length", () => {
    const result = validate({ ...DESIGN_REQUEST, honeypot: MARKER.repeat(60) });

    expect(result).toEqual({
      ok: false,
      issues: [{ field: "honeypot", code: "TOO_LONG" }],
    });
  });
});

describe("ADR 0095: no refusal, at any level, holds a value the sender chose", () => {
  /** Each field wrong in a way that carries the marker, at every level, with marker-named unknown keys. */
  const EVERYTHING_WRONG = {
    contact: {
      name: `${MARKER}\n`,
      phone: `${MARKER}069`,
      locality: MARKER.repeat(40),
      channel: MARKER,
      email: `${MARKER}@`,
      consent: MARKER,
      consentTextVersion: MARKER,
      [MARKER]: MARKER,
    },
    design: { id: MARKER, revision: MARKER, [MARKER]: MARKER },
    clientRequestId: MARKER,
    locale: MARKER,
    honeypot: MARKER.repeat(60),
    elapsedMs: MARKER,
    [MARKER]: MARKER,
  };

  it("names every failing field once, in field order, by code alone", () => {
    expect(codesOf(EVERYTHING_WRONG)).toEqual([
      "request: UNKNOWN_FIELD",
      "contact: UNKNOWN_FIELD",
      "contact.name: FORBIDDEN_CHARACTER",
      "contact.phone: PHONE_FORMAT_UNRECOGNISED",
      "contact.locality: TOO_LONG",
      "contact.channel: UNKNOWN_CHANNEL",
      "contact.consent: CONSENT_NOT_GIVEN",
      "contact.consentTextVersion: UNKNOWN_CONSENT_TEXT_VERSION",
      "design: UNKNOWN_FIELD",
      "design.id: MALFORMED",
      "design.revision: MALFORMED",
      "clientRequestId: MALFORMED",
      "locale: UNKNOWN_LOCALE",
      "honeypot: TOO_LONG",
      "elapsedMs: MALFORMED",
    ]);
    expect(JSON.stringify(validate(EVERYTHING_WRONG))).not.toContain(MARKER);
  });

  it.each([
    ["an intent the set does not hold", { ...WITHOUT_TARGET, intent: MARKER }],
    [
      "a reference and an intent together",
      { ...DESIGN_REQUEST, intent: MARKER },
    ],
    ["a reference that is text", { ...WITHOUT_TARGET, design: MARKER }],
    ["contact fields that are text", { ...DESIGN_REQUEST, contact: MARKER }],
    ["a body that is text", MARKER],
    ["a body that is an array", [MARKER]],
    [
      "a phone that is too long",
      {
        ...DESIGN_REQUEST,
        contact: { ...CONTACT, phone: `0${MARKER}`.repeat(9) },
      },
    ],
    [
      "a channel of e-mail with a malformed address",
      {
        ...DESIGN_REQUEST,
        contact: { ...CONTACT, channel: "email", email: MARKER },
      },
    ],
    [
      "a revision that is a number",
      { ...DESIGN_REQUEST, design: { id: MARKER, revision: 987_654_321 } },
    ],
  ])("for %s", (_name, input) => {
    const result = validate(input);

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/ZZQA8H|987654321/);
  });

  const leaf = fc.oneof(
    fc.constant(MARKER),
    fc.constant(`${MARKER}\n`),
    fc.constant(7_919_000_017),
    fc.constant(null),
    fc.constant(true),
    fc.constant([MARKER]),
    fc.constant({ [MARKER]: MARKER }),
  );

  function spoiled(fields: Json): fc.Arbitrary<Json> {
    return fc
      .tuple(
        fc.record(
          Object.fromEntries(Object.keys(fields).map((key) => [key, leaf])),
          {
            requiredKeys: [],
          },
        ),
        fc.subarray(Object.keys(fields)),
        fc.boolean(),
      )
      .map(([replaced, dropped, hasUnknownKey]) => ({
        ...Object.fromEntries(
          Object.entries({ ...fields, ...replaced }).filter(
            ([key]) => !dropped.includes(key),
          ),
        ),
        ...(hasUnknownKey ? { [MARKER]: MARKER } : {}),
      }));
  }

  const spoiledRequest = fc
    .tuple(
      spoiled(DESIGN_REQUEST),
      spoiled(CONTACT),
      spoiled(DESIGN_REFERENCE),
      fc.boolean(),
      fc.boolean(),
    )
    .map(([request, contact, design, keepsContact, keepsDesign]) => ({
      ...request,
      ...(keepsContact && "contact" in request ? { contact } : {}),
      ...(keepsDesign && "design" in request ? { design } : {}),
    }));

  propertyTest.prop([spoiledRequest], { numRuns: 500 })(
    "whatever is wrong with a request, each issue is one known field and one known code and nothing more",
    (request) => {
      const result = validate(request);
      if (result.ok) return;

      expect(result.issues.length).toBeGreaterThan(0);
      for (const issue of result.issues) {
        expect(Object.keys(issue).sort()).toEqual(["code", "field"]);
        expect(KNOWN_FIELDS).toContain(issue.field);
        expect(KNOWN_CODES).toContain(issue.code);
      }
      expect(Object.keys(result).sort()).toEqual(["issues", "ok"]);
      expect(JSON.stringify(result)).not.toMatch(/ZZQA8H|7919000017/);
    },
  );

  propertyTest.prop([spoiledRequest], { numRuns: 500 })(
    "names no field twice",
    (request) => {
      const fields = issuesOf(request).map((issue) => issue.field);

      expect(fields).toEqual([...new Set(fields)]);
    },
  );
});
