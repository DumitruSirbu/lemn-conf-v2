import { describe, expect, expectTypeOf, it } from "vitest";

import {
  isRetryableMailFailure,
  MAIL_ACCEPTED,
  MAIL_FAILURE_KINDS,
  type MailFailureKind,
  type MailMessage,
} from "@/lib/server/mail/mail-sender";

import {
  PROCESS_ENV_OR_BUILD_MODE,
  readMailModuleSource,
} from "./mail-test-support";

describe("the mail port's failure kinds", () => {
  it("are exactly the seven the port promises, so a caller's switch stays exhaustive", () => {
    expect([...MAIL_FAILURE_KINDS].sort()).toEqual(
      [
        "busy",
        "payload-mismatch",
        "quota-spent",
        "refused",
        "timed-out",
        "unreachable",
        "unreadable-answer",
      ].sort(),
    );
  });
});

describe("isRetryableMailFailure", () => {
  const expectedRetryability: Record<MailFailureKind, boolean> = {
    "unreadable-answer": true,
    busy: true,
    unreachable: true,
    "timed-out": true,
    "payload-mismatch": false,
    "quota-spent": false,
    refused: false,
  };

  it.each(MAIL_FAILURE_KINDS)("answers for %s as the port promises", (kind) => {
    expect(isRetryableMailFailure(kind)).toBe(expectedRetryability[kind]);
  });

  it("never retries a request the provider will refuse again, or one whose bytes changed", () => {
    expect(isRetryableMailFailure("refused")).toBe(false);
    expect(isRetryableMailFailure("payload-mismatch")).toBe(false);
  });

  it("does not retry a spent quota automatically", () => {
    expect(isRetryableMailFailure("quota-spent")).toBe(false);
  });
});

describe("MAIL_ACCEPTED", () => {
  it("is a success value that a caller cannot alter for the next reader", () => {
    expect(MAIL_ACCEPTED).toEqual({ ok: true });
    expect(Object.isFrozen(MAIL_ACCEPTED)).toBe(true);
  });
});

describe("MailMessage", () => {
  it("holds a key, a subject and a text and nothing else, so no recipient, sender or html can be set", () => {
    expectTypeOf<keyof MailMessage>().toEqualTypeOf<
      "key" | "subject" | "text"
    >();
  });

  it("rejects a recipient written into a message literal", () => {
    const message: MailMessage = {
      key: "k",
      subject: "s",
      text: "t",
      // @ts-expect-error a message names no recipient; the adapter fills the configured inbox
      to: "customer@example.com",
    };

    expect(Object.keys(message)).toContain("to");
  });
});

describe("mail-sender.ts", () => {
  it("names neither the process environment nor the build mode", () => {
    expect(readMailModuleSource("mail-sender.ts")).not.toMatch(
      PROCESS_ENV_OR_BUILD_MODE,
    );
  });

  it("names no provider", () => {
    expect(readMailModuleSource("mail-sender.ts")).not.toMatch(/resend/i);
  });
});
