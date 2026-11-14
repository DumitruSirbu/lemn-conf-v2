import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  INITIAL_CONTACT_FORM,
  isProfileFillWanted,
  reduceContactForm,
  type ContactFormEvent,
  type ContactFormState,
  type ContactFormValues,
  type ContactTextField,
  type ProfileBlanks,
  type ProfileOffer,
} from "@/contact/contact-form-model";

const OFFER: ProfileOffer = {
  name: "Ana Popescu",
  phone: "069 123 456",
  locality: "Chisinau",
};

const NO_BLANKS: ProfileBlanks = { name: false, phone: false, locality: false };

function applyAll(
  events: readonly ContactFormEvent[],
  from: ContactFormState = INITIAL_CONTACT_FORM,
): ContactFormState {
  return events.reduce(reduceContactForm, from);
}

function typed(field: ContactTextField, text: string): ContactFormEvent {
  return { type: "text-changed", field, text };
}

function arrived(offer: ProfileOffer = OFFER): ContactFormEvent {
  return { type: "profile-arrived", offer };
}

describe("a profile arriving in the form", () => {
  it("fills name, phone and locality of an untouched form, and nothing else", () => {
    const state = applyAll([arrived()]);

    expect(state.values).toEqual({
      ...INITIAL_CONTACT_FORM.values,
      name: OFFER.name,
      phone: OFFER.phone,
      locality: OFFER.locality,
    });
  });

  it("leaves the channel, the e-mail and the consent as they were", () => {
    const before = applyAll([
      { type: "channel-chosen", channel: "whatsapp" },
      typed("email", "ana@example.com"),
      { type: "consent-changed", isGiven: true },
    ]);

    const after = reduceContactForm(before, arrived());

    expect(after.values.channel).toBe("whatsapp");
    expect(after.values.email).toBe("ana@example.com");
    expect(after.values.consent).toBe(true);
  });

  it("keeps a value the customer typed", () => {
    const state = applyAll([typed("name", "Ion"), arrived()]);

    expect(state.values.name).toBe("Ion");
    expect(state.values.phone).toBe(OFFER.phone);
  });

  it("keeps a field the customer typed in and emptied again: empty is the customer's choice", () => {
    const state = applyAll([
      typed("phone", "0"),
      typed("phone", ""),
      arrived(),
    ]);

    expect(state.values.phone).toBe("");
  });

  it("does not put a whitespace-only detail into a field", () => {
    const state = applyAll([arrived({ ...OFFER, name: "   " })]);

    expect(state.values.name).toBe("");
  });

  it("keeps a value that is already in the field, whoever put it there", () => {
    const held: ContactFormState = {
      ...INITIAL_CONTACT_FORM,
      values: { ...INITIAL_CONTACT_FORM.values, name: "Ion" },
    };

    expect(reduceContactForm(held, arrived()).values.name).toBe("Ion");
  });

  it("keeps a field the customer left without typing", () => {
    const state = applyAll([
      { type: "field-left", field: "locality" },
      arrived(),
    ]);

    expect(state.values.locality).toBe("");
    expect(state.values.name).toBe(OFFER.name);
  });

  it("skips a detail the profile does not hold", () => {
    const state = applyAll([arrived({ ...OFFER, phone: "" })]);

    expect(state.values.phone).toBe("");
    expect(state.values.name).toBe(OFFER.name);
  });

  it("shows no error for a value the domain would refuse, until the field is left", () => {
    const refusedPhone = "06912";

    const arrivedState = applyAll([arrived({ ...OFFER, phone: refusedPhone })]);
    const leftState = reduceContactForm(arrivedState, {
      type: "field-left",
      field: "phone",
    });

    expect(arrivedState.values.phone).toBe(refusedPhone);
    expect(arrivedState.errors).toEqual({});
    expect(leftState.errors.phone).toBeDefined();
  });

  it("takes away the error a refused press showed on a field it now fills with a valid value", () => {
    const refused = applyAll([{ type: "submit-pressed" }]);
    expect(refused.errors.name).toBeDefined();

    const filled = reduceContactForm(refused, arrived());

    expect(filled.errors.name).toBeUndefined();
  });
});

describe("a profile withdrawn from the form", () => {
  it("empties what the profile filled and keeps what the customer wrote", () => {
    const state = applyAll([
      arrived(),
      typed("name", "Ion"),
      { type: "profile-withdrawn" },
    ]);

    expect(state.values.name).toBe("Ion");
    expect(state.values.phone).toBe("");
    expect(state.values.locality).toBe("");
  });

  it("empties a filled field the customer only left, since the value is still the profile's", () => {
    const state = applyAll([
      arrived(),
      { type: "field-left", field: "phone" },
      { type: "profile-withdrawn" },
    ]);

    expect(state.values.phone).toBe("");
  });

  it("takes the error of a withdrawn value with it", () => {
    const state = applyAll([
      arrived({ ...OFFER, phone: "06912" }),
      { type: "field-left", field: "phone" },
      { type: "profile-withdrawn" },
    ]);

    expect(state.errors.phone).toBeUndefined();
  });

  it("changes nothing in a form the profile never filled", () => {
    const state = applyAll([
      typed("name", "Ion"),
      { type: "profile-withdrawn" },
    ]);

    expect(state.values.name).toBe("Ion");
  });
});

describe("whether sending would save details to the profile", () => {
  const values = (locality: string): ContactFormValues => ({
    ...INITIAL_CONTACT_FORM.values,
    locality,
  });

  it.each([
    ["a blank name", { ...NO_BLANKS, name: true }, "", true],
    ["a blank phone", { ...NO_BLANKS, phone: true }, "", true],
    [
      "a blank address and a locality given",
      { ...NO_BLANKS, locality: true },
      "Balti",
      true,
    ],
    [
      "a blank address and no locality",
      { ...NO_BLANKS, locality: true },
      "",
      false,
    ],
    [
      "a blank address and a locality of spaces",
      { ...NO_BLANKS, locality: true },
      "  ",
      false,
    ],
    ["no blank at all", NO_BLANKS, "Balti", false],
  ] as const)("answers for %s", (_title, blanks, locality, expected) => {
    expect(isProfileFillWanted(blanks, values(locality))).toBe(expected);
  });
});

const PROFILE_FIELDS = ["name", "phone", "locality"] as const;
const TEXT_FIELDS: readonly ContactTextField[] = [
  "name",
  "phone",
  "locality",
  "email",
];

const eventArb: fc.Arbitrary<ContactFormEvent> = fc.oneof(
  fc.record({
    type: fc.constant("text-changed" as const),
    field: fc.constantFrom(...TEXT_FIELDS),
    text: fc.oneof(fc.constant(""), fc.string({ maxLength: 12 })),
  }),
  fc.record({
    type: fc.constant("field-left" as const),
    field: fc.constantFrom(...TEXT_FIELDS),
  }),
);

type Arm = "typed" | "typed-then-cleared" | "left-only" | "untouched";

/** Which of the four ways a field reaches the arrival: the customer typed a value, typed and emptied it, left it
 *  without typing, or never met it. */
function armOf(
  before: readonly ContactFormEvent[],
  field: ContactTextField,
): Arm {
  const last = lastTypedText(before, field);
  if (last !== undefined) return last === "" ? "typed-then-cleared" : "typed";
  const wasLeft = before.some(
    (event) => event.type === "field-left" && event.field === field,
  );
  return wasLeft ? "left-only" : "untouched";
}

function lastTypedText(
  events: readonly ContactFormEvent[],
  field: ContactTextField,
): string | undefined {
  const last = events
    .filter((event) => event.type === "text-changed" && event.field === field)
    .at(-1);
  return last?.type === "text-changed" ? last.text : undefined;
}

describe("the customer's typing and one arriving profile, in any order", () => {
  it("ends every offered field with what the customer typed, and with the profile's value only in a field they never met", () => {
    const armsMet = {
      typed: 0,
      "typed-then-cleared": 0,
      "left-only": 0,
      untouched: 0,
    };
    fc.assert(
      fc.property(
        fc.array(eventArb, { maxLength: 14 }),
        fc.array(eventArb, { maxLength: 6 }),
        (before, after) => {
          const state = applyAll([...before, arrived(), ...after]);

          for (const field of PROFILE_FIELDS) {
            const arm = armOf(before, field);
            armsMet[arm] += 1;
            const lastTyped = lastTypedText([...before, ...after], field);
            const expected =
              lastTyped ?? (arm === "untouched" ? OFFER[field] : "");
            expect(state.values[field]).toBe(expected);
          }
        },
      ),
      { numRuns: 600 },
    );

    for (const arm of Object.values(armsMet)) expect(arm).toBeGreaterThan(30);
  });
});
