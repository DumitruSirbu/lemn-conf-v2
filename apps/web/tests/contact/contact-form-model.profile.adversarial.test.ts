// QA of M11 W2b at the model. `contact-form-model.profile.test.ts` sweeps text events before and after ONE arrival. This
// sweeps every event kind (the channel, consent, honeypot, submit, repeated arrivals and withdrawals) against the
// invariants a profile must keep: it never touches what the customer made, it never adds an error, and a withdrawal
// leaves exactly the customer's own form.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  INITIAL_CONTACT_FORM,
  PROFILE_OFFERED_FIELDS,
  reduceContactForm,
  type ContactFormEvent,
  type ContactFormState,
  type ContactTextField,
  type ProfileOffer,
} from "@/contact/contact-form-model";

const TEXT_FIELDS: readonly ContactTextField[] = [
  "name",
  "phone",
  "locality",
  "email",
];

const offerArb: fc.Arbitrary<ProfileOffer> = fc.record({
  name: fc.oneof(fc.constant(""), fc.string({ maxLength: 8 })),
  phone: fc.oneof(fc.constant(""), fc.string({ maxLength: 8 })),
  locality: fc.oneof(fc.constant(""), fc.string({ maxLength: 8 })),
});

const eventArb: fc.Arbitrary<ContactFormEvent> = fc.oneof(
  {
    weight: 4,
    arbitrary: fc.record({
      type: fc.constant("text-changed" as const),
      field: fc.constantFrom(...TEXT_FIELDS),
      text: fc.oneof(fc.constant(""), fc.string({ maxLength: 8 })),
    }),
  },
  fc.record({
    type: fc.constant("field-left" as const),
    field: fc.constantFrom(...TEXT_FIELDS, "consent" as const),
  }),
  fc.record({
    type: fc.constant("consent-changed" as const),
    isGiven: fc.boolean(),
  }),
  fc.record({
    type: fc.constant("channel-chosen" as const),
    channel: fc.constantFrom("phone" as const, "email" as const),
  }),
  fc.record({
    type: fc.constant("honeypot-filled" as const),
    text: fc.string({ maxLength: 4 }),
  }),
  fc.record({
    type: fc.constant("profile-arrived" as const),
    offer: offerArb,
  }),
  fc.constant({ type: "profile-withdrawn" as const }),
  fc.constant({ type: "submit-pressed" as const }),
);

function run(events: readonly ContactFormEvent[]): ContactFormState {
  return events.reduce(reduceContactForm, INITIAL_CONTACT_FORM);
}

function lastTyped(
  events: readonly ContactFormEvent[],
  field: ContactTextField,
): string | undefined {
  const own = events.filter(
    (event) => event.type === "text-changed" && event.field === field,
  );
  const last = own.at(-1);
  return last?.type === "text-changed" ? last.text : undefined;
}

describe("any sequence of events around any number of profile arrivals and withdrawals", () => {
  it("leaves every text field the customer typed in with the last text they typed", () => {
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 30 }), (events) => {
        const state = run(events);
        for (const field of TEXT_FIELDS) {
          const typed = lastTyped(events, field);
          if (typed !== undefined) expect(state.values[field]).toBe(typed);
        }
      }),
      { numRuns: 1500 },
    );
  });

  it("never lets a profile reach the e-mail, the channel, the consent or the honeypot", () => {
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 30 }), (events) => {
        const withoutProfile = run(
          events.filter(
            (event) =>
              event.type !== "profile-arrived" &&
              event.type !== "profile-withdrawn",
          ),
        );
        const state = run(events);
        expect(state.values.email).toBe(withoutProfile.values.email);
        expect(state.values.channel).toBe(withoutProfile.values.channel);
        expect(state.values.consent).toBe(withoutProfile.values.consent);
        expect(state.values.honeypot).toBe(withoutProfile.values.honeypot);
      }),
      { numRuns: 1500 },
    );
  });

  it("holds a profile's value in a field only if the customer never typed there, and marks only those as the profile's", () => {
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 30 }), (events) => {
        const state = run(events);
        for (const field of TEXT_FIELDS) {
          if (lastTyped(events, field) !== undefined) {
            expect(state.profileFilledFields).not.toContain(field);
          }
        }
        for (const field of state.profileFilledFields) {
          expect(PROFILE_OFFERED_FIELDS).toContain(field);
          expect(state.values[field]).not.toBe("");
        }
      }),
      { numRuns: 1500 },
    );
  });

  it("makes a withdrawal leave exactly what the same events leave without any profile", () => {
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 30 }), (events) => {
        const withoutProfile = run(
          events.filter(
            (event) =>
              event.type !== "profile-arrived" &&
              event.type !== "profile-withdrawn",
          ),
        );
        const afterWithdrawal = run([...events, { type: "profile-withdrawn" }]);
        for (const field of TEXT_FIELDS) {
          // A field the customer left but never typed in keeps its profile value only if the profile did not fill it.
          if (lastTyped(events, field) === undefined) {
            expect(afterWithdrawal.values[field]).toBe("");
          } else {
            expect(afterWithdrawal.values[field]).toBe(
              withoutProfile.values[field],
            );
          }
        }
        expect(afterWithdrawal.profileFilledFields).toEqual([]);
      }),
      { numRuns: 1500 },
    );
  });

  it("never shows an error on a field because of an arrival that was not there before it", () => {
    fc.assert(
      fc.property(
        fc.array(eventArb, { maxLength: 20 }),
        offerArb,
        (events, offer) => {
          const before = run(events);
          const after = reduceContactForm(before, {
            type: "profile-arrived",
            offer,
          });
          for (const field of Object.keys(after.errors)) {
            expect(Object.keys(before.errors)).toContain(field);
          }
        },
      ),
      { numRuns: 1500 },
    );
  });

  it("is idempotent: the same profile arriving twice changes nothing the second time", () => {
    fc.assert(
      fc.property(
        fc.array(eventArb, { maxLength: 20 }),
        offerArb,
        (events, offer) => {
          const once = reduceContactForm(run(events), {
            type: "profile-arrived",
            offer,
          });
          const twice = reduceContactForm(once, {
            type: "profile-arrived",
            offer,
          });
          expect(twice).toEqual(once);
        },
      ),
      { numRuns: 1500 },
    );
  });
});

describe("a profile and a submit that was refused", () => {
  it("fills a field a refused press had marked, and clears its error only when the filled value is valid", () => {
    const refused = run([{ type: "submit-pressed" }]);
    expect(refused.errors.name).toBeDefined();

    const valid = reduceContactForm(refused, {
      type: "profile-arrived",
      offer: { name: "Ana Popescu", phone: "", locality: "" },
    });
    const tooLong = reduceContactForm(refused, {
      type: "profile-arrived",
      offer: { name: "N".repeat(101), phone: "", locality: "" },
    });

    expect(valid.errors.name).toBeUndefined();
    expect(valid.values.name).toBe("Ana Popescu");
    expect(tooLong.errors.name).toBeDefined();
    expect(tooLong.values.name).toHaveLength(101);
  });
});

describe("a second profile arriving after the first", () => {
  it("replaces the values the first one filled, and never a value the customer typed", () => {
    const first = { name: "Ana", phone: "069 111 111", locality: "Balti" };
    const second = { name: "Ion", phone: "069 222 222", locality: "Orhei" };

    const state = [
      { type: "profile-arrived", offer: first },
      { type: "text-changed", field: "phone", text: "079 000 000" },
      { type: "profile-arrived", offer: second },
    ].reduce(
      (current, event) => reduceContactForm(current, event as ContactFormEvent),
      INITIAL_CONTACT_FORM,
    );

    expect(state.values.name).toBe("Ion");
    expect(state.values.locality).toBe("Orhei");
    expect(state.values.phone).toBe("079 000 000");
  });
});
