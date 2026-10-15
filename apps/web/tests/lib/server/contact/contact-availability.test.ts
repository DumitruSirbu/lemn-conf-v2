import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isContactSendable } from "@/lib/server/contact/contact-availability";
import {
  DIGEST_SECRET_VARIABLE,
  readDigester,
  type ServerEnvironment,
} from "@/lib/server/digest/digest-secret";
import { createMailSender } from "@/lib/server/mail/create-mail-sender";
import {
  FAKE_MAIL_FLAG,
  FAKE_MAIL_FLAG_ENABLED,
} from "@/lib/server/mail/select-mail-sender";

import { readSource } from "../server-source-support";
import { forbidNetwork, releaseNetwork } from "../mail/mail-test-support";

const FAKE_PASSWORD = "ZxQ8vK3pWmRt5Yn2";
const FAKE_SENDER = "orders@mail.example.com";
const RETIRED_VALUE = "a-retired-name-still-set";
const FAKE_INBOX = "inbox@example.com";
const FAKE_SECRET =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

const PROVIDER_VARIABLES = {
  GOOGLE_EMAIL: FAKE_SENDER,
  GOOGLE_APP_PASSWORD: FAKE_PASSWORD,
  LEAD_NOTIFICATION_ADDRESS: FAKE_INBOX,
} as const;

/** A variable as the environment can hold it: absent, present and refused by its rule, or usable. */
function variableArbitrary(
  usable: string,
  unusable: readonly (string | undefined)[],
): fc.Arbitrary<string | undefined> {
  return fc.oneof(
    fc.constant(undefined),
    fc.constantFrom(...unusable),
    fc.constant(usable),
  );
}

const environmentArbitrary: fc.Arbitrary<ServerEnvironment> = fc
  .record({
    GOOGLE_EMAIL: variableArbitrary(FAKE_SENDER, [
      "",
      "no-at-sign",
      "a@b@c",
      "a@b.123",
    ]),
    GOOGLE_APP_PASSWORD: variableArbitrary(FAKE_PASSWORD, [
      "",
      "has a space",
      "é",
    ]),
    // The previous provider's names configure nothing, and the flag beside one is still refused.
    RESEND_API_KEY: variableArbitrary(RETIRED_VALUE, [""]),
    MAIL_FROM_ADDRESS: variableArbitrary(RETIRED_VALUE, [""]),
    LEAD_NOTIFICATION_ADDRESS: variableArbitrary(FAKE_INBOX, [
      "",
      "two@example.com,three@example.com",
      "<angle@example.com>",
    ]),
    [FAKE_MAIL_FLAG]: variableArbitrary(FAKE_MAIL_FLAG_ENABLED, [
      "true",
      "01",
      " 1",
      "",
    ]),
    [DIGEST_SECRET_VARIABLE]: variableArbitrary(FAKE_SECRET, [
      "",
      "00",
      FAKE_SECRET.toUpperCase().slice(0, 63),
      `${FAKE_SECRET}0`,
      "z".repeat(64),
    ]),
  })
  .map((variables) =>
    Object.fromEntries(
      Object.entries(variables).filter(([, value]) => value !== undefined),
    ),
  );

/** What the route decides before it stores anything: it can build a sender and it can use a digest secret. */
function theRoutesAnswer(environment: ServerEnvironment): boolean {
  return (
    createMailSender(environment).kind === "sender" &&
    readDigester(environment).status === "usable"
  );
}

// The factory builds the real adapter for a usable environment: a sender is built here and never asked to send, and the
// guard shows that building one opens nothing.
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  forbidNetwork();
});

afterEach(() => {
  vi.restoreAllMocks();
  releaseNetwork();
});

describe("isContactSendable", () => {
  it("equals the route's answer for every environment of the mail variables, the fake flag and the digest secret", () => {
    const answers = { sendable: 0, unavailable: 0 };

    fc.assert(
      fc.property(environmentArbitrary, (environment) => {
        const answer = isContactSendable(environment);
        expect(answer).toBe(theRoutesAnswer(environment));
        answers[answer ? "sendable" : "unavailable"] += 1;
      }),
      { numRuns: 1000 },
    );

    expect(answers.sendable).toBeGreaterThan(0);
    expect(answers.unavailable).toBeGreaterThan(0);
  });

  it("is true for the provider's three variables and a usable secret", () => {
    expect(
      isContactSendable({
        ...PROVIDER_VARIABLES,
        [DIGEST_SECRET_VARIABLE]: FAKE_SECRET,
      }),
    ).toBe(true);
  });

  it("is true for the fake flag alone with a usable secret", () => {
    expect(
      isContactSendable({
        [FAKE_MAIL_FLAG]: FAKE_MAIL_FLAG_ENABLED,
        [DIGEST_SECRET_VARIABLE]: FAKE_SECRET,
      }),
    ).toBe(true);
  });

  it.each(Object.keys(PROVIDER_VARIABLES))(
    "is false when %s is the only thing missing",
    (missing) => {
      const rest = Object.entries({
        ...PROVIDER_VARIABLES,
        [DIGEST_SECRET_VARIABLE]: FAKE_SECRET,
      }).filter(([name]) => name !== missing);

      expect(isContactSendable(Object.fromEntries(rest))).toBe(false);
    },
  );

  it("is false when the digest secret is the only thing missing", () => {
    expect(isContactSendable(PROVIDER_VARIABLES)).toBe(false);
  });

  it("is false for the fake flag beside a mail variable, which is a misconfiguration and never a fake", () => {
    expect(
      isContactSendable({
        [FAKE_MAIL_FLAG]: FAKE_MAIL_FLAG_ENABLED,
        GOOGLE_EMAIL: FAKE_SENDER,
        [DIGEST_SECRET_VARIABLE]: FAKE_SECRET,
      }),
    ).toBe(false);
  });

  it("is false for an empty environment", () => {
    expect(isContactSendable({})).toBe(false);
  });

  it("answers a boolean for every environment, and logs and builds nothing", () => {
    fc.assert(
      fc.property(environmentArbitrary, (environment) => {
        expect(typeof isContactSendable(environment)).toBe("boolean");
      }),
      { numRuns: 200 },
    );
    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe("what the module may read", () => {
  it("reads source: takes the environment it is handed and never names process.env", () => {
    expect(
      readSource("lib/server/contact/contact-availability.ts"),
    ).not.toMatch(/process\.env/);
  });
});
