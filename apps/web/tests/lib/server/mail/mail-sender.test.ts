import { describe, expect, expectTypeOf, it } from "vitest";

import {
  isRetryableMailFailure,
  isSendableMailMessage,
  MAIL_ACCEPTED,
  MAIL_FAILURE_KINDS,
  MAIL_REFUSED_UNSENT,
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

describe("MAIL_REFUSED_UNSENT", () => {
  it("is a refusal of ours with no status, since no request was made", () => {
    expect(MAIL_REFUSED_UNSENT).toEqual({ ok: false, kind: "refused" });
    expect(Object.isFrozen(MAIL_REFUSED_UNSENT)).toBe(true);
  });
});

const SENDABLE: MailMessage = {
  key: "lead-notification/req-1",
  subject: "Cerere din configurator LM-ABCD2345",
  text: "line one\nline two\n",
};

function messageWith(change: Partial<MailMessage>): MailMessage {
  return { ...SENDABLE, ...change };
}

describe("isSendableMailMessage", () => {
  it("accepts a key, a one-line subject and a multi-line text", () => {
    expect(isSendableMailMessage(SENDABLE)).toBe(true);
  });

  it.each([
    ["a key of 1 character", "k"],
    ["a key of 256 characters", "k".repeat(256)],
    ["the lowest visible ASCII", "!"],
    ["the highest visible ASCII", "~"],
  ])("accepts %s", (_label, key) => {
    expect(isSendableMailMessage(messageWith({ key }))).toBe(true);
  });

  it.each([
    ["an empty key", ""],
    ["a key of 257 characters", "k".repeat(257)],
    ["a space", "a b"],
    ["a line feed", "a\nb"],
    ["a carriage return", "a\rb"],
    ["a tab", "a\tb"],
    ["a NUL", "a\u0000b"],
    ["DEL", "a\u007fb"],
    ["a non-ASCII letter", "kéy"],
    ["a line separator", "a\u2028b"],
  ])("refuses %s in the key", (_label, key) => {
    expect(isSendableMailMessage(messageWith({ key }))).toBe(false);
  });

  it.each([
    ["empty", ""],
    ["a line feed", "a\nb"],
    ["a carriage return", "a\rb"],
    ["a tab", "a\tb"],
    ["a NUL", "a\u0000b"],
    ["a C1 control", "a\u0085b"],
    ["a line separator", "a\u2028b"],
    ["a paragraph separator", "a\u2029b"],
  ])("refuses a subject that is %s", (_label, subject) => {
    expect(isSendableMailMessage(messageWith({ subject }))).toBe(false);
  });

  it("refuses an empty text, and accepts a text of one character", () => {
    expect(isSendableMailMessage(messageWith({ text: "" }))).toBe(false);
    expect(isSendableMailMessage(messageWith({ text: "t" }))).toBe(true);
  });

  it("accepts a subject with non-ASCII letters", () => {
    expect(isSendableMailMessage(messageWith({ subject: "Cerere ж" }))).toBe(
      true,
    );
  });

  it("refuses members that are not text, without throwing", () => {
    for (const member of ["key", "subject", "text"]) {
      const message = { ...SENDABLE, [member]: 42 } as unknown as MailMessage;

      expect(isSendableMailMessage(message)).toBe(false);
    }
  });

  it("decides the key's every character across the 16-bit range", () => {
    const wronglyDecided: number[] = [];
    for (let code = 0; code <= 0xffff; code += 1) {
      const key = `k${String.fromCharCode(code)}k`;
      const isVisibleAscii = code >= 0x21 && code <= 0x7e;
      if (isSendableMailMessage(messageWith({ key })) !== isVisibleAscii) {
        wronglyDecided.push(code);
      }
    }

    expect(wronglyDecided).toEqual([]);
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
