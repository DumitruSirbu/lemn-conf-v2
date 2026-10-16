import { createHash } from "node:crypto";
import { inspect } from "node:util";

import {
  validateContactFields,
  type ContactFields,
} from "@lemnaria/configurator-domain";
import type { ContactSubmissionToRecord } from "@lemnaria/persistence";
import { fc } from "@fast-check/vitest";
import { createTransport } from "nodemailer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildGmailMessage,
  buildGmailTransportOptions,
  createGmailMailSender,
  DEFAULT_MAKE_TRANSPORT,
  MAIL_REQUEST_TIMEOUT_MS,
  UnusableMailAddressError,
  type GmailMessageOptions,
  type GmailTransportOptions,
  type MailTransport,
  type MakeMailTransport,
} from "@/lib/server/mail/gmail-mail-sender";
import { composeLeadNotice } from "@/lib/server/mail/lead-notification";
import type { MailConfiguration } from "@/lib/server/mail/mail-configuration";
import {
  MAIL_FAILURE_KINDS,
  type MailMessage,
  type MailOutcome,
} from "@/lib/server/mail/mail-sender";

import { ro } from "../../../support/romanian-content";
import {
  consoleCallsOf,
  forbidFetch,
  forbidNetwork,
  NOT_ONE_PLAIN_MAILBOX,
  PROCESS_ENV_OR_BUILD_MODE,
  readMailModuleSource,
  releaseFetch,
  releaseNetwork,
  spyOnEveryConsoleMethod,
} from "./mail-test-support";

const APP_PASSWORD_MARKER = "AppPasswordMarker0123456789";
const CONFIGURATION: MailConfiguration = {
  senderAddress: "sender.account@example.com",
  appPassword: APP_PASSWORD_MARKER,
  notificationAddress: "shop.inbox@example.org",
};
const MESSAGE: MailMessage = {
  key: "lead-notification/req-1",
  subject: "Cerere din configurator LM-ABCD2345",
  text: "Nume: Test\nTelefon: +37300000000\n",
};
const ACCEPTED_ANSWER = {
  accepted: [CONFIGURATION.notificationAddress],
  rejected: [],
};

beforeEach(() => {
  forbidFetch();
  forbidNetwork();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  releaseFetch();
  releaseNetwork();
});

/** `setImmediate` stays real, so a test can let the event loop turn while the bound is held. */
function useFakeBoundTimers(): void {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

const MAX_LABEL = "a".repeat(63);
/** Three 63-character labels and a last one: 253 characters in all when the last is 61 long. */
const domainWithLastLabelOf = (length: number): string =>
  [MAX_LABEL, MAX_LABEL, MAX_LABEL, "d".repeat(length)].join(".");
/** Fifty-seven of these write as a 63-character ASCII label, fifty-eight as 64. */
const UNICODE_LABEL_AT_THE_LIMIT = "ü".repeat(57);

const ADDRESSES_AT_A_LENGTH_LIMIT: readonly (readonly [string, string])[] = [
  ["a 64-character local part", `${"a".repeat(64)}@example.com`],
  ["a 63-character label", `shop@${MAX_LABEL}.example`],
  ["a 253-character domain", `shop@${domainWithLastLabelOf(61)}`],
  [
    "a label that writes as 63 ASCII characters",
    `shop@${UNICODE_LABEL_AT_THE_LIMIT}.example`,
  ],
];

const ADDRESSES_PAST_A_LENGTH_LIMIT: readonly (readonly [string, string])[] = [
  ["a 65-character local part", `${"a".repeat(65)}@example.com`],
  ["a 64-character label", `shop@${"a".repeat(64)}.example`],
  ["a 254-character domain", `shop@${domainWithLastLabelOf(62)}`],
  [
    "a label that writes as 64 ASCII characters",
    `shop@${UNICODE_LABEL_AT_THE_LIMIT}ü.example`,
  ],
];

describe("buildGmailMessage", () => {
  const options = buildGmailMessage(MESSAGE, CONFIGURATION);

  it("hands over exactly from, to, subject, text and messageId, the configured addresses and the message", () => {
    expect(Object.keys(options)).toEqual([
      "from",
      "to",
      "subject",
      "text",
      "messageId",
    ]);
    expect(options.from).toBe(CONFIGURATION.senderAddress);
    expect(options.to).toBe(CONFIGURATION.notificationAddress);
    expect(options.subject).toBe(MESSAGE.subject);
    expect(options.text).toBe(MESSAGE.text);
  });

  it("builds from named members: extra members on a message reach no option", () => {
    const customerAddress = "customer.marker@example.net";
    const withExtras = {
      ...MESSAGE,
      to: customerAddress,
      cc: customerAddress,
      bcc: customerAddress,
      replyTo: customerAddress,
      headers: { "X-Injected": customerAddress },
      attachments: [{ path: "/etc/hostname" }],
      envelope: { to: customerAddress },
    } as MailMessage;

    const built = buildGmailMessage(withExtras, CONFIGURATION);

    expect(Object.keys(built)).toEqual(Object.keys(options));
    expect(JSON.stringify(built)).not.toContain(customerAddress);
  });

  it("derives the Message-ID from a SHA-256 digest of the key and the sender's domain, the same on every build", () => {
    const expected = `<${sha256Hex(MESSAGE.key)}@example.com>`;

    expect(options.messageId).toBe(expected);
    expect(buildGmailMessage(MESSAGE, CONFIGURATION).messageId).toBe(expected);
    expect(
      buildGmailMessage(
        { ...MESSAGE, key: "lead-notification/req-2" },
        CONFIGURATION,
      ).messageId,
    ).not.toBe(expected);
  });

  it("keeps the client's key out of the Message-ID, even a key made of every character a msg-id cannot hold", () => {
    const hostileKey = '<>@"()[];:,\\'.repeat(19).slice(0, 256);

    const { messageId } = buildGmailMessage(
      { ...MESSAGE, key: hostileKey },
      CONFIGURATION,
    );

    expect(messageId).toMatch(/^<[0-9a-f]{64}@example\.com>$/);
  });

  it("writes an internationalised sender domain in its ASCII form", () => {
    const { messageId } = buildGmailMessage(MESSAGE, {
      ...CONFIGURATION,
      senderAddress: "shop@bücher.example",
    });

    expect(messageId).toBe(`<${sha256Hex(MESSAGE.key)}@xn--bcher-kva.example>`);
  });

  it.each(NOT_ONE_PLAIN_MAILBOX)(
    "refuses %j as either address, naming the setting and holding nothing of the value",
    (address) => {
      const asSender = () =>
        buildGmailMessage(MESSAGE, {
          ...CONFIGURATION,
          senderAddress: address,
        });
      const asRecipient = () =>
        buildGmailMessage(MESSAGE, {
          ...CONFIGURATION,
          notificationAddress: address,
        });

      expect(asSender).toThrow(UnusableMailAddressError);
      expect(asRecipient).toThrow(UnusableMailAddressError);
      expect(thrownBy(asSender)).toMatchObject({ setting: "senderAddress" });
      expect(thrownBy(asRecipient)).toMatchObject({
        setting: "notificationAddress",
      });
      if (address.length >= 4) {
        expect(String(thrownBy(asRecipient))).not.toContain(address);
      }
    },
  );

  describe.each(["senderAddress", "notificationAddress"] as const)(
    "for the %s, at the RFC 5321 length limits",
    (setting) => {
      const buildWith = (address: string) => () =>
        buildGmailMessage(MESSAGE, { ...CONFIGURATION, [setting]: address });

      it.each(ADDRESSES_AT_A_LENGTH_LIMIT)(
        "builds a message for %s",
        (_label, address) => {
          expect(buildWith(address)).not.toThrow();
        },
      );

      it.each(ADDRESSES_PAST_A_LENGTH_LIMIT)(
        "refuses %s, naming the setting",
        (_label, address) => {
          expect(thrownBy(buildWith(address))).toBeInstanceOf(
            UnusableMailAddressError,
          );
          expect(thrownBy(buildWith(address))).toMatchObject({ setting });
        },
      );
    },
  );
});

describe("the composed message", () => {
  const ALLOWED_HEADERS = [
    "content-transfer-encoding",
    "content-type",
    "date",
    "from",
    "message-id",
    "mime-version",
    "subject",
    "to",
  ];

  /** A `multipart/alternative` message names its encoding in each part, not at the top. */
  const ALLOWED_HEADERS_OF_AN_ALTERNATIVE = ALLOWED_HEADERS.filter(
    (name) => name !== "content-transfer-encoding",
  );

  it("has one recipient, the configured one, and no reply-to, copy, markup or attachment", async () => {
    const composed = await compose(buildGmailMessage(MESSAGE, CONFIGURATION));

    expect(composed.envelopeRecipients).toEqual([
      CONFIGURATION.notificationAddress,
    ]);
    expect(composed.envelopeSender).toBe(CONFIGURATION.senderAddress);
    expect(composed.headerNames).toEqual(ALLOWED_HEADERS);
    expect(composed.headers.get("content-type")).toMatch(/^text\/plain\b/);
    expect(composed.headers.get("message-id")).toBe(
      buildGmailMessage(MESSAGE, CONFIGURATION).messageId,
    );
  });

  it("folds a line break smuggled into a header value instead of starting a header, whatever the library does beneath the refusals", async () => {
    const smuggled = {
      ...buildGmailMessage(MESSAGE, CONFIGURATION),
      subject: "S\r\nBcc: a@b.example",
    };

    const composed = await compose(smuggled);

    expect(composed.headerNames).toEqual(ALLOWED_HEADERS);
    expect(composed.envelopeRecipients).toEqual([
      CONFIGURATION.notificationAddress,
    ]);
  });

  describe.each(["phone", "whatsapp", "email"] as const)(
    "for a customer who chose %s",
    (channel) => {
      const RUNS_PER_CHANNEL = 40;

      it("carries no customer value, and no request id, in any header or in the envelope", async () => {
        await fc.assert(
          fc.asyncProperty(
            customerArbitrary,
            requestIdArbitrary,
            async (customer, requestId) => {
              const notice = composeLeadNotice({
                reference: "LM-ABCD2345",
                submission: submissionOf(
                  contactOf(customer, channel),
                  requestId,
                ),
                content: ro,
                kitchenLink: { kind: "unavailable" },
              });
              const options = buildGmailMessage(notice, CONFIGURATION);

              const composed = await compose(options);

              const inHeadersOrEnvelope = [
                composed.headerText,
                ...composed.envelopeRecipients,
                composed.envelopeSender,
              ];
              const customerValues = [
                customer.name,
                customer.locality,
                customer.phoneNormalForm,
                customer.email,
                requestId,
              ];
              for (const value of customerValues) {
                for (const place of inHeadersOrEnvelope)
                  expect(place).not.toContain(value);
              }
              expect(composed.envelopeRecipients).toEqual([
                CONFIGURATION.notificationAddress,
              ]);
              expect(composed.headers.get("message-id")).toBe(
                options.messageId,
              );
              expect(composed.headerNames).toEqual(
                ALLOWED_HEADERS_OF_AN_ALTERNATIVE,
              );
              expect(composed.headers.get("content-type")).toMatch(
                /^multipart\/alternative\b/,
              );
              expect(options.text).toContain(customer.name);
              if (channel === "email")
                expect(options.text).toContain(customer.email);
            },
          ),
          { numRuns: RUNS_PER_CHANNEL },
        );
      });
    },
  );

  it("composes exactly one recipient equal to the configured address for any two plain mailboxes", async () => {
    await fc.assert(
      fc.asyncProperty(
        mailboxArbitrary,
        mailboxArbitrary,
        keyArbitrary,
        async (sender, recipient, key) => {
          const options = buildGmailMessage(
            { ...MESSAGE, key },
            {
              ...CONFIGURATION,
              senderAddress: sender,
              notificationAddress: recipient,
            },
          );

          const composed = await compose(options);

          expect(Object.keys(options)).toEqual([
            "from",
            "to",
            "subject",
            "text",
            "messageId",
          ]);
          expect(options.to).toBe(recipient);
          expect(options.from).toBe(sender);
          expect(composed.envelopeRecipients).toEqual([recipient]);
          expect(composed.envelopeSender).toBe(sender);
          expect(composed.headerNames).toEqual(ALLOWED_HEADERS);
          expect(composed.headers.get("message-id")).toBe(options.messageId);
        },
      ),
      { numRuns: 150 },
    );
  });
});

describe("buildGmailTransportOptions", () => {
  it("answers implicit TLS to Gmail, no pool, no logging, no file or URL reads, four timeouts and nothing else", () => {
    expect(buildGmailTransportOptions(CONFIGURATION)).toEqual({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: CONFIGURATION.senderAddress, pass: APP_PASSWORD_MARKER },
      pool: false,
      logger: false,
      debug: false,
      disableFileAccess: true,
      disableUrlAccess: true,
      dnsTimeout: 2_000,
      connectionTimeout: 4_000,
      greetingTimeout: 3_000,
      socketTimeout: 6_000,
    });
  });

  it("has no tls override and no service shortcut", () => {
    const names = Object.keys(buildGmailTransportOptions(CONFIGURATION));

    expect(names).not.toContain("tls");
    expect(names).not.toContain("service");
  });

  it("waits for nothing longer than the one bound, and for something: each timeout is a positive integer below it", () => {
    const options = buildGmailTransportOptions(CONFIGURATION);
    const timeouts = [
      options.dnsTimeout,
      options.connectionTimeout,
      options.greetingTimeout,
      options.socketTimeout,
    ];

    expect(MAIL_REQUEST_TIMEOUT_MS).toBe(10_000);
    for (const timeout of timeouts) {
      expect(Number.isInteger(timeout)).toBe(true);
      expect(timeout).toBeGreaterThan(0);
      expect(timeout).toBeLessThan(MAIL_REQUEST_TIMEOUT_MS);
    }
  });

  it("is the library's own createTransport that is used when none is injected", () => {
    expect(DEFAULT_MAKE_TRANSPORT).toBe(createTransport);
  });
});

describe("createGmailMailSender: bound, life of the transport, and one call", () => {
  it("answers acceptance after one transport, one sendMail with the built options, and one close after it", async () => {
    const harness = harnessAnswering(() => Promise.resolve(ACCEPTED_ANSWER));

    const outcome = await createGmailMailSender(
      CONFIGURATION,
      harness.make,
    ).send(MESSAGE);

    expect(outcome).toEqual({ ok: true });
    expect(harness.transportOptions).toEqual([
      buildGmailTransportOptions(CONFIGURATION),
    ]);
    expect(harness.sentOptions).toEqual([
      buildGmailMessage(MESSAGE, CONFIGURATION),
    ]);
    expect(harness.events).toEqual(["make", "sendMail", "settled", "close"]);
  });

  it("does not compare the accepted entry with the configured address: a spelling the library normalised is still acceptance", async () => {
    const harness = harnessAnswering(() =>
      Promise.resolve({ accepted: ['"shop.inbox"@example.org'], rejected: [] }),
    );

    await expect(
      createGmailMailSender(CONFIGURATION, harness.make).send(MESSAGE),
    ).resolves.toEqual({ ok: true });
  });

  it("answers timed out at the bound, not before, with the transport closed once and no rejection", async () => {
    useFakeBoundTimers();
    const harness = harnessAnswering(() => new Promise<never>(() => undefined));
    const answers: MailOutcome[] = [];
    const rejections: unknown[] = [];

    createGmailMailSender(CONFIGURATION, harness.make)
      .send(MESSAGE)
      .then(
        (outcome) => answers.push(outcome),
        (reason: unknown) => rejections.push(reason),
      );
    await vi.advanceTimersByTimeAsync(MAIL_REQUEST_TIMEOUT_MS - 1);

    expect(answers).toEqual([]);
    expect(harness.closeCalls()).toBe(0);

    await vi.advanceTimersByTimeAsync(1);

    expect(answers).toEqual([{ ok: false, kind: "timed-out" }]);
    expect(rejections).toEqual([]);
    expect(harness.closeCalls()).toBe(1);
  });

  it("ignores a sendMail that rejects, or accepts, after the bound has passed, and leaves no unhandled rejection", async () => {
    useFakeBoundTimers();
    const unhandled: unknown[] = [];
    const record = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", record);
    try {
      const lateRejection = lateAnswer(() =>
        Promise.reject(new Error(APP_PASSWORD_MARKER)),
      );
      const lateAcceptance = lateAnswer(() => Promise.resolve(ACCEPTED_ANSWER));
      const answers: MailOutcome[] = [];

      for (const late of [lateRejection, lateAcceptance]) {
        void createGmailMailSender(CONFIGURATION, late.harness.make)
          .send(MESSAGE)
          .then((outcome) => answers.push(outcome));
      }
      await vi.advanceTimersByTimeAsync(MAIL_REQUEST_TIMEOUT_MS);
      lateRejection.release();
      lateAcceptance.release();
      await vi.advanceTimersByTimeAsync(0);
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(answers).toEqual([
        { ok: false, kind: "timed-out" },
        { ok: false, kind: "timed-out" },
      ]);
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", record);
    }
  });

  const WAYS_A_SEND_ENDS: readonly (readonly [
    string,
    () => unknown,
    MailOutcome["ok"],
  ])[] = [
    [
      "resolves with one accepted recipient",
      () => Promise.resolve(ACCEPTED_ANSWER),
      true,
    ],
    ["resolves with nothing readable", () => Promise.resolve(undefined), false],
    [
      "rejects",
      () =>
        Promise.reject(Object.assign(new Error("x"), { code: "ECONNECTION" })),
      false,
    ],
    [
      "throws before returning a promise",
      () => {
        throw Object.assign(new Error("x"), { code: "EAUTH" });
      },
      false,
    ],
  ];

  it.each(WAYS_A_SEND_ENDS)(
    "calls sendMail once and closes the transport once when it %s",
    async (_way, answer, isAccepted) => {
      const harness = harnessAnswering(answer);

      const outcome = await createGmailMailSender(
        CONFIGURATION,
        harness.make,
      ).send(MESSAGE);

      expect(outcome.ok).toBe(isAccepted);
      expect(harness.sentOptions).toHaveLength(1);
      expect(harness.closeCalls()).toBe(1);
      expect(harness.events.at(-1)).toBe("close");
    },
  );

  it("makes a transport for each send and closes each one once, whether the sends resolve or reject", async () => {
    const harness = harnessAnswering((_options, callNumber) =>
      callNumber === 0
        ? Promise.resolve(ACCEPTED_ANSWER)
        : Promise.reject(new Error("x")),
    );
    const sender = createGmailMailSender(CONFIGURATION, harness.make);

    await sender.send(MESSAGE);
    await sender.send(MESSAGE);

    expect(harness.made).toBe(2);
    expect(harness.closeCallsByTransport()).toEqual([1, 1]);
  });

  it("makes no transport for a message that may not be sent, and answers refused with no status", async () => {
    const harness = harnessAnswering(() => Promise.resolve(ACCEPTED_ANSWER));
    const sender = createGmailMailSender(CONFIGURATION, harness.make);
    const throwingMessage = {
      key: "k",
      subject: "s",
      get text(): string {
        throw new Error(APP_PASSWORD_MARKER);
      },
    } as MailMessage;
    const unsendable: MailMessage[] = [
      { ...MESSAGE, key: "has a space" },
      { ...MESSAGE, key: "" },
      { ...MESSAGE, key: "k".repeat(257) },
      { ...MESSAGE, subject: "one\r\nBcc: a@b.example" },
      { ...MESSAGE, subject: "" },
      { ...MESSAGE, text: "" },
      throwingMessage,
    ];

    for (const message of unsendable) {
      await expect(sender.send(message)).resolves.toEqual({
        ok: false,
        kind: "refused",
      });
    }

    expect(harness.made).toBe(0);
  });

  it("reads each member of a message once, so what was judged is what is sent", async () => {
    const harness = harnessAnswering(() => Promise.resolve(ACCEPTED_ANSWER));
    const reads = { key: 0, subject: 0, text: 0 };
    const changesAfterFirstRead = {
      get key(): string {
        reads.key += 1;
        return reads.key === 1 ? MESSAGE.key : "has a space";
      },
      get subject(): string {
        reads.subject += 1;
        return reads.subject === 1
          ? MESSAGE.subject
          : "one\r\nBcc: a@b.example";
      },
      get text(): string {
        reads.text += 1;
        return reads.text === 1 ? MESSAGE.text : "";
      },
    };

    const outcome = await createGmailMailSender(
      CONFIGURATION,
      harness.make,
    ).send(changesAfterFirstRead);

    expect(outcome).toEqual({ ok: true });
    expect(reads).toEqual({ key: 1, subject: 1, text: 1 });
    expect(harness.sentOptions).toEqual([
      buildGmailMessage(MESSAGE, CONFIGURATION),
    ]);
  });

  it.each([
    [
      "a revoked proxy",
      (): MailMessage => {
        const { proxy, revoke } = Proxy.revocable(MESSAGE, {});
        revoke();
        return proxy;
      },
    ],
    [
      "a proxy whose every read throws",
      (): MailMessage =>
        new Proxy(MESSAGE, {
          get(): never {
            throw new Error(APP_PASSWORD_MARKER);
          },
        }),
    ],
  ])(
    "answers refused, unsent and without rejecting, for a message that cannot be read at all: %s",
    async (_label, makeUnreadable) => {
      const harness = harnessAnswering(() => Promise.resolve(ACCEPTED_ANSWER));

      const outcome = await createGmailMailSender(
        CONFIGURATION,
        harness.make,
      ).send(makeUnreadable());

      expect(outcome).toEqual({ ok: false, kind: "refused" });
      expect(harness.made).toBe(0);
    },
  );

  it("makes no transport, and answers refused, when a configured address is not one plain mailbox", async () => {
    const harness = harnessAnswering(() => Promise.resolve(ACCEPTED_ANSWER));
    const badAddresses = [
      "a@b.example, c@d.example",
      "a@b.example\r\nBcc: c@d.example",
      'a@b"c.example',
    ];

    for (const address of badAddresses) {
      for (const setting of ["senderAddress", "notificationAddress"] as const) {
        const sender = createGmailMailSender(
          { ...CONFIGURATION, [setting]: address },
          harness.make,
        );

        await expect(sender.send(MESSAGE)).resolves.toEqual({
          ok: false,
          kind: "refused",
        });
      }
    }

    expect(harness.made).toBe(0);
  });

  it("answers from the mapping, and never rejects, when the transport cannot be made", async () => {
    const throwing =
      (code: string): MakeMailTransport =>
      () => {
        throw Object.assign(new Error(APP_PASSWORD_MARKER), { code });
      };

    await expect(
      createGmailMailSender(CONFIGURATION, throwing("ECONFIG")).send(MESSAGE),
    ).resolves.toEqual({ ok: false, kind: "refused" });
    await expect(
      createGmailMailSender(CONFIGURATION, throwing("ESOMETHING")).send(
        MESSAGE,
      ),
    ).resolves.toEqual({ ok: false, kind: "unreachable" });
  });

  it("keeps the send's own answer when close throws", async () => {
    const harness = harnessAnswering(() => Promise.resolve(ACCEPTED_ANSWER), {
      closeThrows: true,
    });

    await expect(
      createGmailMailSender(CONFIGURATION, harness.make).send(MESSAGE),
    ).resolves.toEqual({ ok: true });
    expect(harness.closeCalls()).toBe(1);
  });
});

describe("what a send leaves behind", () => {
  const DISCLOSURE_FAILURES: readonly (readonly [string, unknown])[] = [
    [
      "a library error quoting every field",
      libraryError({
        message: APP_PASSWORD_MARKER,
        response: `550 5.7.1 ${APP_PASSWORD_MARKER}`,
        command: APP_PASSWORD_MARKER,
        responseCode: 550,
      }),
    ],
    [
      "a quota reply",
      libraryError({
        message: APP_PASSWORD_MARKER,
        response: `550-5.4.5 ${APP_PASSWORD_MARKER}`,
        responseCode: 550,
      }),
    ],
    [
      "a timeout",
      libraryError({ code: "ETIMEDOUT", message: APP_PASSWORD_MARKER }),
    ],
    [
      "an authentication failure",
      libraryError({
        code: "EAUTH",
        message: APP_PASSWORD_MARKER,
        response: APP_PASSWORD_MARKER,
        command: "AUTH",
      }),
    ],
    ["a thrown string", APP_PASSWORD_MARKER],
  ];

  it.each(DISCLOSURE_FAILURES)(
    "holds no password in the outcome, a log line or the message options after %s",
    async (_name, thrown) => {
      const consoleSpies = spyOnEveryConsoleMethod();
      const harness = harnessAnswering(() => Promise.reject(thrown as Error));

      const outcome = await createGmailMailSender(
        CONFIGURATION,
        harness.make,
      ).send(MESSAGE);

      expect(outcome.ok).toBe(false);
      expectNoPasswordIn(outcome);
      expectNoPasswordIn(consoleCallsOf(consoleSpies));
      expectNoPasswordIn(harness.sentOptions);
      expect(MAIL_FAILURE_KINDS).toContain(outcome.ok ? "" : outcome.kind);
    },
  );

  it("hands the password to the transport options alone", async () => {
    const harness = harnessAnswering(() => Promise.resolve(ACCEPTED_ANSWER));

    await createGmailMailSender(CONFIGURATION, harness.make).send(MESSAGE);

    const [transportOptions] = harness.transportOptions;
    expect(transportOptions?.auth.pass).toBe(APP_PASSWORD_MARKER);
    expect(
      JSON.stringify({ ...transportOptions, auth: undefined }),
    ).not.toContain(APP_PASSWORD_MARKER);
  });

  it("names no value when it refuses an address, though the address holds the password", () => {
    const hostile = `${APP_PASSWORD_MARKER}@b"c.example`;

    const error = thrownBy(() =>
      buildGmailMessage(MESSAGE, { ...CONFIGURATION, senderAddress: hostile }),
    );

    expect(error).toBeInstanceOf(UnusableMailAddressError);
    expectNoPasswordIn([String(error), (error as Error).stack ?? ""]);
  });

  it.each(["gmail-mail-sender.ts", "smtp-answer.ts"])(
    "reads source: %s writes no log line and reads no environment",
    (name) => {
      expect(readMailModuleSource(name)).not.toMatch(/\bconsole\b/);
      expect(readMailModuleSource(name)).not.toMatch(PROCESS_ENV_OR_BUILD_MODE);
    },
  );
});

// Helpers

interface Harness {
  readonly make: MakeMailTransport;
  readonly made: number;
  readonly transportOptions: readonly GmailTransportOptions[];
  readonly sentOptions: readonly GmailMessageOptions[];
  readonly events: readonly string[];
  closeCalls(): number;
  closeCallsByTransport(): readonly number[];
}

/** A transport that answers `answer` to each `sendMail`, and records what it was asked and when it was closed. */
function harnessAnswering(
  answer: (options: GmailMessageOptions, callNumber: number) => unknown,
  behaviour: { readonly closeThrows?: boolean } = {},
): Harness {
  const transportOptions: GmailTransportOptions[] = [];
  const sentOptions: GmailMessageOptions[] = [];
  const events: string[] = [];
  const closesByTransport: number[] = [];
  const make: MakeMailTransport = (options) => {
    transportOptions.push(options);
    events.push("make");
    const index = closesByTransport.push(0) - 1;
    const transport: MailTransport = {
      sendMail(messageOptions) {
        const callNumber = sentOptions.push(messageOptions) - 1;
        events.push("sendMail");
        const result = answer(messageOptions, callNumber);
        void Promise.resolve(result).then(
          () => events.push("settled"),
          () => events.push("settled"),
        );
        return result as Promise<unknown>;
      },
      close() {
        closesByTransport[index] = (closesByTransport[index] ?? 0) + 1;
        events.push("close");
        if (behaviour.closeThrows === true)
          throw new Error(APP_PASSWORD_MARKER);
      },
    };
    return transport;
  };
  return {
    make,
    get made() {
      return transportOptions.length;
    },
    transportOptions,
    sentOptions,
    events,
    closeCalls: () => closesByTransport.reduce((sum, count) => sum + count, 0),
    closeCallsByTransport: () => closesByTransport,
  };
}

/** A transport whose answer is produced only once the test lets it, so it can arrive after the bound. */
function lateAnswer(produce: () => Promise<unknown>): {
  readonly harness: Harness;
  release(): void;
} {
  let isReleased: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    isReleased = resolve;
  });
  const harness = harnessAnswering(() => gate.then(produce));
  return {
    harness,
    release: () => {
      isReleased();
    },
  };
}

function libraryError(members: Record<string, unknown>): Error {
  return Object.assign(new Error("library error"), members);
}

function expectNoPasswordIn(value: unknown): void {
  const readings = [
    JSON.stringify(value),
    inspect(value, { depth: null, showHidden: true }),
    String(value),
  ].join("\n");
  expect(readings).not.toContain(APP_PASSWORD_MARKER);
}

function thrownBy(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error("expected the action to throw");
}

interface ComposedMessage {
  readonly headerText: string;
  readonly headers: ReadonlyMap<string, string>;
  readonly headerNames: readonly string[];
  readonly envelopeRecipients: readonly string[];
  readonly envelopeSender: string;
}

/** The real composer, with the library's own stream transport: the message is built and nothing is sent. */
async function compose(options: GmailMessageOptions): Promise<ComposedMessage> {
  const info = await createTransport({
    streamTransport: true,
    buffer: true,
  }).sendMail(options);
  const [headerBlock = ""] = (info.message as Buffer)
    .toString("utf8")
    .split(/\r?\n\r?\n/);
  const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, " ");
  const headers = new Map(
    unfolded.split(/\r?\n/).map((line) => {
      const colon = line.indexOf(":");
      return [
        line.slice(0, colon).toLowerCase(),
        line.slice(colon + 1).trim(),
      ] as const;
    }),
  );
  return {
    headerText: unfolded,
    headers,
    headerNames: [...headers.keys()].sort(),
    envelopeRecipients: info.envelope.to,
    envelopeSender: info.envelope.from as string,
  };
}

const LOWER_LETTERS = Array.from("abcdefghijklmnopqrstuvwxyz");
const ATEXT = Array.from("abcXYZ0189!#$%&'*+/=?^_`{|}~-");
const VISIBLE_ASCII = Array.from({ length: 0x7e - 0x21 + 1 }, (_, index) =>
  String.fromCharCode(0x21 + index),
);

const customerToken = fc
  .string({ unit: fc.constantFrom(...LOWER_LETTERS), minLength: 8 })
  .map((letters) => `zq${letters}`);

interface Customer {
  readonly name: string;
  readonly locality: string;
  readonly email: string;
  readonly phoneDigits: string;
  readonly phoneNormalForm: string;
}

const customerArbitrary: fc.Arbitrary<Customer> = fc
  .record({
    name: customerToken.map((token) => `Zq ${token}`),
    locality: customerToken,
    email: customerToken.map((token) => `${token}@customer.example.org`),
    phoneDigits: fc.integer({ min: 60_000_000, max: 79_999_999 }).map(String),
  })
  .map((parts) => ({ ...parts, phoneNormalForm: `+373${parts.phoneDigits}` }));

const requestIdArbitrary = fc
  .string({ unit: fc.constantFrom(...LOWER_LETTERS), minLength: 12 })
  .map((letters) => `rq${letters}`);

const keyArbitrary = fc.string({
  unit: fc.constantFrom(...VISIBLE_ASCII),
  minLength: 1,
  maxLength: 256,
});

const atomArbitrary = fc.string({
  unit: fc.constantFrom(...ATEXT),
  minLength: 1,
});
const labelArbitrary = fc.string({
  unit: fc.constantFrom(..."abcxyz019".split("")),
  minLength: 1,
  maxLength: 12,
});

const topLevelLabelArbitrary = fc.string({
  unit: fc.constantFrom(...LOWER_LETTERS),
  minLength: 1,
  maxLength: 8,
});

const mailboxArbitrary = fc
  .tuple(
    fc.array(atomArbitrary, { minLength: 1, maxLength: 3 }),
    fc.array(labelArbitrary, { maxLength: 2 }),
    topLevelLabelArbitrary,
  )
  .map(
    ([atoms, labels, topLevel]) =>
      `${atoms.join(".")}@${[...labels, topLevel].join(".")}`,
  );

function contactOf(
  customer: Customer,
  channel: ContactFields["channel"],
): ContactFields {
  const result = validateContactFields({
    name: customer.name,
    phone: `0${customer.phoneDigits}`,
    locality: customer.locality,
    channel,
    ...(channel === "email" ? { email: customer.email } : {}),
    consent: true,
    consentTextVersion: "placeholder",
  });
  if (!result.ok) throw new Error("the generated contact is not valid");
  return result.contact;
}

function submissionOf(
  contact: ContactFields,
  clientRequestId: string,
): ContactSubmissionToRecord {
  return {
    clientRequestId,
    payloadDigest: "d".repeat(64),
    contact,
    locale: "ro",
    target: { kind: "intent", intent: "callback" },
    snapshot: undefined,
  };
}
