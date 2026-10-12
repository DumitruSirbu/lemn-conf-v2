import {
  CONTACT_EMAIL_MAX_LENGTH,
  CONTACT_LOCALITY_MAX_LENGTH,
  CONTACT_NAME_MAX_LENGTH,
  CONTACT_PHONE_MAX_LENGTH,
  validateContactFields,
  type ContactFieldCode,
  type SubmissionTarget,
} from "@lemnaria/configurator-domain";
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  CONTACT_FORM_FIELDS,
  firstInvalidField,
  INITIAL_CONTACT_FORM,
  judgeFormField,
  measureElapsedMs,
  prepareSubmission,
  reduceContactForm,
  type ContactFormEvent,
  type ContactFormField,
  type ContactFormState,
  type ContactFormValues,
  type SubmissionInput,
} from "@/contact/contact-form-model";
import { routing } from "@/i18n/routing";

const VALID_VALUES: ContactFormValues = {
  name: "Ana Popescu",
  phone: "+37369123456",
  locality: "Chisinau",
  channel: "email",
  email: "ana@example.com",
  consent: true,
  honeypot: "",
};

/** One invalid value per field, each refused by the domain for a different reason than REQUIRED where it can be. */
const INVALID_VALUES: Pick<
  ContactFormValues,
  "name" | "phone" | "locality" | "email" | "consent"
> = {
  name: "",
  phone: "06912",
  locality: "x".repeat(CONTACT_LOCALITY_MAX_LENGTH + 1),
  email: "not-an-address",
  consent: false,
};

const DESIGN_TARGET: SubmissionTarget = {
  kind: "design",
  design: { id: "design0123456789abcde", revision: "7" },
};

const SUBMISSION: SubmissionInput = {
  values: VALID_VALUES,
  target: DESIGN_TARGET,
  locale: "ro",
  clientRequestId: "request-id-0123456789",
  elapsedMs: 4000,
};

const ASTRAL_CHARACTERS = ["😀", "🪵", "🚪", "🧊"];

function stateWith(values: Partial<ContactFormValues>): ContactFormState {
  return { ...INITIAL_CONTACT_FORM, values: { ...VALID_VALUES, ...values } };
}

function apply(
  state: ContactFormState,
  ...events: readonly ContactFormEvent[]
): ContactFormState {
  return events.reduce(reduceContactForm, state);
}

function valuesWithInvalid(
  invalid: Readonly<Record<ContactFormField, boolean>>,
): ContactFormValues {
  return {
    ...VALID_VALUES,
    name: invalid.name ? INVALID_VALUES.name : VALID_VALUES.name,
    phone: invalid.phone ? INVALID_VALUES.phone : VALID_VALUES.phone,
    locality: invalid.locality
      ? INVALID_VALUES.locality
      : VALID_VALUES.locality,
    email: invalid.email ? INVALID_VALUES.email : VALID_VALUES.email,
    consent: !invalid.consent,
  };
}

function leastInvalidIndex(
  invalid: Readonly<Record<ContactFormField, boolean>>,
): number {
  return CONTACT_FORM_FIELDS.findIndex((field) => invalid[field]);
}

const everyInvalidAssignment = fc.record({
  name: fc.boolean(),
  phone: fc.boolean(),
  locality: fc.boolean(),
  email: fc.boolean(),
  consent: fc.boolean(),
});

describe("the first invalid field, in the form's order", () => {
  it("is the least index of an invalid field, for every assignment of the five fields", () => {
    fc.assert(
      fc.property(everyInvalidAssignment, (invalid) => {
        const first = firstInvalidField(valuesWithInvalid(invalid));

        const index = leastInvalidIndex(invalid);
        expect(first).toBe(
          index === -1 ? undefined : CONTACT_FORM_FIELDS[index],
        );
      }),
      { numRuns: 300 },
    );
  });

  it("is found in each of the 32 assignments, none left to chance", () => {
    for (let mask = 0; mask < 32; mask += 1) {
      const invalid = Object.fromEntries(
        CONTACT_FORM_FIELDS.map((field, bit) => [
          field,
          (mask >> bit) % 2 === 1,
        ]),
      ) as Record<ContactFormField, boolean>;

      const first = firstInvalidField(valuesWithInvalid(invalid));

      const index = leastInvalidIndex(invalid);
      expect(first).toBe(index === -1 ? undefined : CONTACT_FORM_FIELDS[index]);
    }
  });

  it("does not judge an e-mail the chosen channel does not use", () => {
    const values = {
      ...VALID_VALUES,
      channel: "phone",
      email: "not-an-address",
    } as const;

    expect(firstInvalidField(values)).toBeUndefined();
  });

  it("takes each field's code from the domain, not from a list of its own", () => {
    const values = valuesWithInvalid({
      name: true,
      phone: true,
      locality: true,
      email: true,
      consent: true,
    });

    const domainIssues = issuesOfDomain(values);

    expect(domainIssues.map(({ field }) => field)).toEqual([
      ...CONTACT_FORM_FIELDS,
    ]);
    for (const { field, code } of domainIssues) {
      expect(judgeFormField(values, field as ContactFormField)).toBe(code);
    }
  });
});

function issuesOfDomain(
  values: ContactFormValues,
): readonly { field: string; code: ContactFieldCode }[] {
  const validation = validateContactFields({
    name: values.name,
    phone: values.phone,
    locality: values.locality,
    channel: values.channel,
    email: values.email,
    consent: values.consent,
    consentTextVersion: "placeholder",
  });
  return validation.ok ? [] : validation.issues;
}

describe("when an error shows (frame 4B's note)", () => {
  it("shows no error for a field typed into and never left, however invalid", () => {
    const state = apply(INITIAL_CONTACT_FORM, {
      type: "text-changed",
      field: "phone",
      text: "06912",
    });

    expect(state.errors).toEqual({});
  });

  it("shows the field's own code when an invalid field is left, and no other field's", () => {
    const typed = apply(
      INITIAL_CONTACT_FORM,
      { type: "text-changed", field: "phone", text: "06912" },
      { type: "text-changed", field: "name", text: "" },
    );

    const left = apply(typed, { type: "field-left", field: "phone" });

    expect(left.errors).toEqual({ phone: "PHONE_MOLDOVAN_INCOMPLETE" });
  });

  it("clears a showing error the moment the value turns valid, while the field keeps focus", () => {
    const refused = apply(stateWith({ phone: "06912" }), {
      type: "field-left",
      field: "phone",
    });

    const corrected = apply(refused, {
      type: "text-changed",
      field: "phone",
      text: "+37369123456",
    });

    expect(corrected.errors).toEqual({});
  });

  it("leaves a showing error as it is while the value stays invalid, even for another code", () => {
    const refused = apply(stateWith({ phone: "06912" }), {
      type: "field-left",
      field: "phone",
    });
    expect(refused.errors.phone).toBe("PHONE_MOLDOVAN_INCOMPLETE");

    const edited = apply(refused, {
      type: "text-changed",
      field: "phone",
      text: "+12",
    });

    expect(edited.errors).toEqual(refused.errors);
  });

  it("judges a field again each time it is left", () => {
    const refused = apply(stateWith({ phone: "06912" }), {
      type: "field-left",
      field: "phone",
    });

    const editedAndLeft = apply(
      refused,
      { type: "text-changed", field: "phone", text: "+12" },
      { type: "field-left", field: "phone" },
    );

    expect(editedAndLeft.errors.phone).toBe("PHONE_INTERNATIONAL_INCOMPLETE");
  });

  it("clears a field's error when it is left valid", () => {
    const refused = apply(stateWith({ name: "" }), {
      type: "field-left",
      field: "name",
    });
    expect(refused.errors.name).toBe("REQUIRED");

    const valid = reduceContactForm(
      { ...refused, values: { ...refused.values, name: "Ana" } },
      { type: "field-left", field: "name" },
    );

    expect(valid.errors).toEqual({});
  });

  it("shows the consent error on leaving consent unticked", () => {
    const state = apply(stateWith({ consent: false }), {
      type: "field-left",
      field: "consent",
    });

    expect(state.errors).toEqual({ consent: "CONSENT_NOT_GIVEN" });
  });

  it("drops a showing e-mail error when another channel is chosen, and keeps what was typed", () => {
    const refused = apply(stateWith({ email: "nope" }), {
      type: "field-left",
      field: "email",
    });
    expect(refused.errors.email).toBe("MALFORMED");

    const switched = apply(refused, {
      type: "channel-chosen",
      channel: "phone",
    });

    expect(switched.errors).toEqual({});
    expect(switched.values.email).toBe("nope");
  });

  it("changes nothing for a submit that is valid", () => {
    const state = stateWith({});

    expect(apply(state, { type: "submit-pressed" })).toBe(state);
  });

  it("shows the first invalid field's error and the consent's after a refused submit, and no other field's", () => {
    const state = stateWith({ name: "", phone: "06912", consent: false });

    const refused = apply(state, { type: "submit-pressed" });

    expect(refused.errors).toEqual({
      name: "REQUIRED",
      consent: "CONSENT_NOT_GIVEN",
    });
  });

  it("keeps the errors of fields already left when a submit is refused", () => {
    const state = apply(
      stateWith({ name: "", phone: "06912", consent: true }),
      {
        type: "field-left",
        field: "phone",
      },
    );

    const refused = apply(state, { type: "submit-pressed" });

    expect(refused.errors).toEqual({
      name: "REQUIRED",
      phone: "PHONE_MOLDOVAN_INCOMPLETE",
    });
  });
});

describe("the rules of the errors, over any sequence of events", () => {
  const textFieldArb = fc.constantFrom("name", "phone", "locality", "email");
  const textArb = fc.constantFrom(
    "",
    "Ana",
    "06912",
    "+37369123456",
    "+12",
    "ana@example.com",
    "nope",
    "x".repeat(CONTACT_LOCALITY_MAX_LENGTH + 1),
  );
  const eventArb: fc.Arbitrary<ContactFormEvent> = fc.oneof(
    fc.record({
      type: fc.constant("text-changed" as const),
      field: textFieldArb,
      text: textArb,
    }),
    fc.record({
      type: fc.constant("consent-changed" as const),
      isGiven: fc.boolean(),
    }),
    fc.record({
      type: fc.constant("channel-chosen" as const),
      channel: fc.constantFrom("phone", "whatsapp", "email"),
    }),
    fc.record({
      type: fc.constant("field-left" as const),
      field: fc.constantFrom(...CONTACT_FORM_FIELDS),
    }),
    fc.constant({ type: "submit-pressed" as const }),
  );

  function domainCodeOf(
    values: ContactFormValues,
    field: ContactFormField,
  ): ContactFieldCode | undefined {
    return issuesOfDomain(values).find((issue) => issue.field === field)?.code;
  }

  it("never makes an error appear or change on an edit, and clears one only when the value turns valid", () => {
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 25 }), (events) => {
        let state = INITIAL_CONTACT_FORM;
        for (const event of events) {
          const next = reduceContactForm(state, event);
          if (event.type === "text-changed") {
            const before = state.errors[event.field];
            const after = next.errors[event.field];
            const isValid =
              domainCodeOf(next.values, event.field) === undefined;
            expect(after).toBe(isValid ? undefined : before);
            expect(next.errors).toEqual(
              after === undefined
                ? withoutKey(state.errors, event.field)
                : state.errors,
            );
          }
          state = next;
        }
      }),
      { numRuns: 400 },
    );
  });

  it("sets a field's error to the domain's judgement exactly when the field is left", () => {
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 25 }), (events) => {
        let state = INITIAL_CONTACT_FORM;
        for (const event of events) {
          const next = reduceContactForm(state, event);
          if (event.type === "field-left") {
            expect(next.errors[event.field]).toBe(
              domainCodeOf(state.values, event.field),
            );
          }
          state = next;
        }
      }),
      { numRuns: 400 },
    );
  });

  it("adds at most the first invalid field's error and the consent's on a submit, and never an error for the e-mail of another channel", () => {
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 25 }), (events) => {
        let state = INITIAL_CONTACT_FORM;
        for (const event of events) {
          const next = reduceContactForm(state, event);
          if (event.type === "submit-pressed") {
            const first = firstInvalidField(state.values);
            const added = Object.keys(next.errors).filter(
              (field) => !(field in state.errors),
            );
            expect(
              added.every((field) => field === first || field === "consent"),
            ).toBe(true);
            if (first !== undefined) {
              expect(next.errors[first]).toBeDefined();
            }
          }
          if (next.values.channel !== "email") {
            expect(next.errors.email).toBeUndefined();
          }
          state = next;
        }
      }),
      { numRuns: 400 },
    );
  });
});

function withoutKey(record: object, key: string): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([name]) => name !== key),
  );
}

describe("the limits are the domain's, in code points (8L.15)", () => {
  const astralOrLetterArb = fc.constantFrom(
    "a",
    "Ž",
    "ü",
    ...ASTRAL_CHARACTERS,
  );

  function textOfLength(length: number) {
    return fc
      .array(astralOrLetterArb, { minLength: length, maxLength: length })
      .map((characters) => characters.join(""));
  }

  it.each([
    ["name", CONTACT_NAME_MAX_LENGTH],
    ["locality", CONTACT_LOCALITY_MAX_LENGTH],
  ] as const)(
    "accepts a %s of exactly its length, astral characters included, and refuses one more as too long",
    (field, maxLength) => {
      fc.assert(
        fc.property(textOfLength(maxLength + 1), (overlong) => {
          const atLimit = Array.from(overlong).slice(0, maxLength).join("");

          expect(
            judgeFormField({ ...VALID_VALUES, [field]: atLimit }, field),
          ).toBeUndefined();
          expect(
            judgeFormField({ ...VALID_VALUES, [field]: overlong }, field),
          ).toBe("TOO_LONG");
        }),
      );
    },
  );

  it("accepts an e-mail of exactly its length and refuses one more as too long", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...Array.from("abcdefghij0123456789")), {
          minLength: CONTACT_EMAIL_MAX_LENGTH,
          maxLength: CONTACT_EMAIL_MAX_LENGTH,
        }),
        (filler) => {
          const domain = "@example.com";
          const local = filler.join("");
          const atLimit =
            local.slice(0, CONTACT_EMAIL_MAX_LENGTH - domain.length) + domain;
          const overlong = `a${atLimit}`;

          expect(Array.from(atLimit)).toHaveLength(CONTACT_EMAIL_MAX_LENGTH);
          expect(
            judgeFormField({ ...VALID_VALUES, email: atLimit }, "email"),
          ).toBeUndefined();
          expect(
            judgeFormField({ ...VALID_VALUES, email: overlong }, "email"),
          ).toBe("TOO_LONG");
        },
      ),
    );
  });

  it("accepts a phone typed in exactly its length and refuses one more as too long", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 11 }),
        fc.array(fc.integer({ min: 0, max: 9 }), {
          minLength: 7,
          maxLength: 7,
        }),
        (gap, digits) => {
          const characters = ["+", "3", "7", "3", "6", ...digits.map(String)];
          const typedWith = (spaces: number) =>
            characters
              .map((character, index) =>
                index === gap ? " ".repeat(spaces) + character : character,
              )
              .join("");

          const atLimit = typedWith(
            CONTACT_PHONE_MAX_LENGTH - characters.length,
          );
          const overlong = typedWith(
            CONTACT_PHONE_MAX_LENGTH - characters.length + 1,
          );

          expect(Array.from(atLimit)).toHaveLength(CONTACT_PHONE_MAX_LENGTH);
          expect(
            judgeFormField({ ...VALID_VALUES, phone: atLimit }, "phone"),
          ).toBeUndefined();
          expect(
            judgeFormField({ ...VALID_VALUES, phone: overlong }, "phone"),
          ).toBe("TOO_LONG");
        },
      ),
    );
  });
});

describe("the body", () => {
  it("carries the fields, the design reference, the locale, the honeypot's text and the time, and no price", () => {
    const prepared = prepareSubmission({
      ...SUBMISSION,
      values: { ...VALID_VALUES, honeypot: "bot text" },
    });

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.body).toEqual({
      contact: {
        name: "Ana Popescu",
        phone: "+37369123456",
        locality: "Chisinau",
        channel: "email",
        email: "ana@example.com",
        consent: true,
        consentTextVersion: "placeholder",
      },
      design: { id: "design0123456789abcde", revision: "7" },
      clientRequestId: "request-id-0123456789",
      locale: "ro",
      honeypot: "bot text",
      elapsedMs: 4000,
    });
  });

  it("carries the intent and no design for a request with no design", () => {
    const prepared = prepareSubmission({
      ...SUBMISSION,
      target: { kind: "intent", intent: "callback" },
    });

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.body.intent).toBe("callback");
    expect(Object.hasOwn(prepared.body, "design")).toBe(false);
    expect(prepared.request.target).toEqual({
      kind: "intent",
      intent: "callback",
    });
  });

  it("hands on the request the domain read from the body, not the body's own text", () => {
    const prepared = prepareSubmission({
      ...SUBMISSION,
      values: { ...VALID_VALUES, name: "  Ana  ", phone: "+373 69 123 456" },
    });

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.request.contact.name).toBe("Ana");
    expect(prepared.request.contact.phoneNormalForm).toBe("+37369123456");
  });

  it.each(["phone", "whatsapp"] as const)(
    "does not carry the typed e-mail when the channel is %s",
    (channel) => {
      const typedEmail = "left-behind@example.com";

      const prepared = prepareSubmission({
        ...SUBMISSION,
        values: { ...VALID_VALUES, channel, email: typedEmail },
      });

      expect(prepared.ok).toBe(true);
      if (!prepared.ok) return;
      expect(Object.hasOwn(prepared.body.contact, "email")).toBe(false);
      expect(JSON.stringify(prepared.body)).not.toContain(typedEmail);
      expect(prepared.request.contact.email).toBeUndefined();
    },
  );

  it("carries the e-mail for the e-mail channel", () => {
    const prepared = prepareSubmission(SUBMISSION);

    expect(prepared.ok && prepared.body.contact.email).toBe("ana@example.com");
  });

  it("is refused, and nothing is handed on to send, while consent is not given", () => {
    const prepared = prepareSubmission({
      ...SUBMISSION,
      values: { ...VALID_VALUES, consent: false },
    });

    expect(prepared).toEqual({
      ok: false,
      issues: [{ field: "contact.consent", code: "CONSENT_NOT_GIVEN" }],
    });
  });

  it("is judged as a whole: a locale the application does not serve is refused", () => {
    const unservedLocale = "xx";
    expect(routing.locales).not.toContain(unservedLocale);

    const prepared = prepareSubmission({
      ...SUBMISSION,
      locale: unservedLocale as never,
    });

    expect(prepared).toEqual({
      ok: false,
      issues: [{ field: "locale", code: "UNKNOWN_LOCALE" }],
    });
  });

  it.each(routing.locales)("is accepted for the served locale %s", (locale) => {
    expect(prepareSubmission({ ...SUBMISSION, locale }).ok).toBe(true);
  });
});

describe("the elapsed time", () => {
  it("is the whole milliseconds from the first render to the clock's reading", () => {
    expect(measureElapsedMs(1000, () => 3500.9)).toBe(2500);
  });

  it("is read again at every send, from the same first render", () => {
    let nowMs = 1000;
    const clock = () => nowMs;

    nowMs = 2500;
    const first = measureElapsedMs(1000, clock);
    nowMs = 9000;
    const retry = measureElapsedMs(1000, clock);

    expect([first, retry]).toEqual([1500, 8000]);
  });

  it("is never negative", () => {
    expect(measureElapsedMs(5000, () => 4000)).toBe(0);
  });

  it("is refused when the clock reads no number, since the request would carry none", () => {
    expect(() => measureElapsedMs(0, () => Number.NaN)).toThrow(RangeError);
  });
});
