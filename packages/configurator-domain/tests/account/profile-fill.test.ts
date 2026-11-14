import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  profileFillOf,
  validateProfileText,
  type ProfileFill,
} from "../../src/account/index.js";
import {
  validateContactSubmission,
  type ContactFields,
  type ContactSubmissionRequest,
} from "../../src/contact/index.js";

const SERVED_LOCALES = ["ro", "ru"];
const ENTERED_PHONE = "079 123 456";
const NORMAL_FORM_OF_ENTERED_PHONE = "+37379123456";
const SWEEP_RUNS = 2000;
const MIN_ACCEPTED_PER_ARM = 100;

function bodyOf(contact: Record<string, unknown>): unknown {
  return {
    contact: {
      name: "Andrei Munteanu",
      phone: ENTERED_PHONE,
      locality: "Calarasi",
      channel: "phone",
      consent: true,
      consentTextVersion: "placeholder",
      ...contact,
    },
    design: { id: "abcdefghijklmnopqrstu", revision: "7" },
    clientRequestId: "0123456789abcdef",
    locale: "ro",
    honeypot: "",
    elapsedMs: 12_000,
  };
}

function acceptedContactOf(contact: Record<string, unknown>): ContactFields {
  const validation = validateContactSubmission(bodyOf(contact), SERVED_LOCALES);
  if (!validation.ok) {
    throw new Error(`refused: ${JSON.stringify(validation.issues)}`);
  }
  return validation.request.contact;
}

describe("profileFillOf: what a judged request offers an empty profile", () => {
  it("carries the name, the locality as the address, and the phone in its entered and normal forms", () => {
    const fill = profileFillOf(acceptedContactOf({ name: "  Ana  " }));

    expect(fill).toEqual({
      name: "Ana",
      address: "Calarasi",
      phone: {
        entered: ENTERED_PHONE,
        normalForm: NORMAL_FORM_OF_ENTERED_PHONE,
      },
    });
  });

  it("leaves the address absent when the locality is empty, so it can never clear or blank a profile's address", () => {
    const fill = profileFillOf(acceptedContactOf({ locality: "   " }));

    expect(fill.address).toBeUndefined();
  });

  it("leaves the address absent when the request carries no locality at all", () => {
    const fill = profileFillOf(acceptedContactOf({ locality: undefined }));

    expect(fill.address).toBeUndefined();
  });
});

describe("a request the contact domain accepts yields a fill the profile domain accepts", () => {
  const name = fc.oneof(
    fc.constantFrom(
      "Ana",
      "  Ion Popescu  ",
      // eslint-disable-next-line no-restricted-syntax -- the letters are the input under test: every one the form takes the profile takes
      "Ștefan Țurcanu",
      "Иван Петров",
      "\u{1F373}".repeat(100),
    ),
    fc.string({ unit: "grapheme", minLength: 1, maxLength: 100 }),
  );
  const locality = fc.oneof(
    fc.constantFrom(
      "",
      "   ",
      // eslint-disable-next-line no-restricted-syntax -- the letters are the input under test: every one the form takes the profile takes
      "Chișinău",
      "\u{1F373}".repeat(100),
    ),
    fc.string({ unit: "grapheme", maxLength: 100 }),
  );
  const phone = fc.constantFrom(
    ENTERED_PHONE,
    "+37379123456",
    "  069-000-111 ",
    "+1 202 555 0100",
  );

  function profileInputOf(fill: ProfileFill): Record<string, unknown> {
    return {
      name: fill.name,
      ...(fill.address === undefined ? {} : { address: fill.address }),
      phone: fill.phone.entered,
    };
  }

  it("passes validateProfileText with no issue and writes the very values the fill names, over both locality arms", () => {
    let acceptedWithLocality = 0;
    let acceptedWithoutLocality = 0;

    fc.assert(
      fc.property(
        name,
        locality,
        phone,
        (nameTyped, localityTyped, phoneTyped) => {
          const validation = validateContactSubmission(
            bodyOf({
              name: nameTyped,
              locality: localityTyped,
              phone: phoneTyped,
            }),
            SERVED_LOCALES,
          );
          fc.pre(validation.ok);
          const request: ContactSubmissionRequest = validation.request;

          const fill = profileFillOf(request.contact);
          const profile = validateProfileText(profileInputOf(fill));

          expect(profile.ok).toBe(true);
          expect(profile.ok && profile.changes).toEqual({
            name: fill.name,
            ...(fill.address === undefined ? {} : { address: fill.address }),
            phone: {
              phone: fill.phone.entered,
              phoneNormalForm: fill.phone.normalForm,
            },
          });
          if (fill.address === undefined) acceptedWithoutLocality += 1;
          else acceptedWithLocality += 1;
        },
      ),
      { numRuns: SWEEP_RUNS },
    );

    expect(acceptedWithLocality).toBeGreaterThanOrEqual(MIN_ACCEPTED_PER_ARM);
    expect(acceptedWithoutLocality).toBeGreaterThanOrEqual(
      MIN_ACCEPTED_PER_ARM,
    );
  });
});
