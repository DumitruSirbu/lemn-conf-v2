// What the port's predicate accepts, driven through everything that then receives it: the options the Gmail adapter
// builds, the library's own composer, and the fake. Whether an accepted message can still break, widen or change a
// message on the wire, and whether what a sender judged is what it sends and records. The transport is scripted and
// the composer builds without sending; the network guard stands under every test.
import { createHash } from "node:crypto";

import { fc } from "@fast-check/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeMailSender } from "@/lib/server/mail/fake-mail-sender";
import {
  buildGmailMessage,
  buildGmailTransportOptions,
  createGmailMailSender,
} from "@/lib/server/mail/gmail-mail-sender";
import {
  isSendableMailMessage,
  LINE_BREAKING_CHARACTER,
  type MailMessage,
} from "@/lib/server/mail/mail-sender";

import {
  forbidFetch,
  forbidNetwork,
  releaseFetch,
  releaseNetwork,
} from "./mail-test-support";
import {
  ACCEPTED_ONE_RECIPIENT,
  expectNoMarkerIn,
  FAKE_APP_PASSWORD,
  FAKE_INBOX,
  FAKE_SENDER,
  QA_CONFIGURATION,
  QA_MESSAGE,
  transportsAnswering,
} from "./qa-8j-support";
import { ALLOWED_HEADER_NAMES, composeRaw } from "./qa-8n-compose-support";

const VISIBLE_ASCII = Array.from(
  { length: 0x7e - 0x21 + 1 },
  (_unused, index) => String.fromCharCode(0x21 + index),
);

const WELL_FORMED_MESSAGE_ID = /^<[0-9a-f]{64}@[a-z0-9.-]+>$/;

const sendableKey = fc
  .array(fc.constantFrom(...VISIBLE_ASCII), { minLength: 1, maxLength: 256 })
  .map((characters) => characters.join(""));

/** Any text, half surrogates and format characters included, with no control character or line separator. */
const sendableSubject = fc
  .string({ unit: "binary", minLength: 1, maxLength: 80 })
  .filter((subject) => !LINE_BREAKING_CHARACTER.test(subject));

const sendableText = fc.string({
  unit: "binary",
  minLength: 1,
  maxLength: 400,
});

const sendableMessage = fc.record({
  key: sendableKey,
  subject: sendableSubject,
  text: sendableText,
});

const UNSENDABLE_KEYS = [
  "",
  " ",
  "k".repeat(257),
  "key with space",
  "key\r\nBcc: second@example.com",
  "key\u0000",
  "key\u007f",
  "ключ",
  "key ",
];

const unsendableMessage = fc.oneof(
  fc.record({
    key: fc.constantFrom(...UNSENDABLE_KEYS),
    subject: sendableSubject,
    text: sendableText,
  }),
  fc.record({
    key: sendableKey,
    subject: fc.constantFrom(
      "",
      "two\nlines",
      "two\r\nlines",
      "tab\there",
      "separated here",
      "paragraph here",
      "next\u0085line",
    ),
    text: sendableText,
  }),
  fc.record({
    key: sendableKey,
    subject: sendableSubject,
    text: fc.constant(""),
  }),
);

function acceptingTransports() {
  return transportsAnswering(() => ACCEPTED_ONE_RECIPIENT);
}

beforeEach(() => {
  forbidFetch();
  forbidNetwork();
});
afterEach(() => {
  vi.restoreAllMocks();
  releaseFetch();
  releaseNetwork();
});

describe("a message the predicate accepts, through everything that then receives it", () => {
  it("is composed by the library, whatever it holds, into the clean header set and the one recipient", async () => {
    await fc.assert(
      fc.asyncProperty(sendableMessage, async (message) => {
        const options = buildGmailMessage(message, QA_CONFIGURATION);

        const composed = await composeRaw(options);

        expect(isSendableMailMessage(message)).toBe(true);
        expect([...composed.headerNames].sort()).toEqual(ALLOWED_HEADER_NAMES);
        expect(composed.headers.get("message-id")).toMatch(
          WELL_FORMED_MESSAGE_ID,
        );
        expect(composed.headers.get("content-type")).toMatch(/^text\/plain\b/);
        expect(composed.envelopeRecipients).toEqual([FAKE_INBOX]);
        expect(composed.envelopeSender).toBe(FAKE_SENDER);
      }),
      { numRuns: 150 },
    );
  });

  it("hands the transport exactly the five members, the configured addresses and the message's own subject and text", async () => {
    await fc.assert(
      fc.asyncProperty(sendableMessage, async (message) => {
        const transports = acceptingTransports();

        const outcome = await createGmailMailSender(
          QA_CONFIGURATION,
          transports.make,
        ).send(message);

        expect(outcome).toEqual({ ok: true });
        const [options] = transports.sentOptions;
        expect(Object.keys(options ?? {})).toEqual([
          "from",
          "to",
          "subject",
          "text",
          "messageId",
        ]);
        expect(options).toMatchObject({
          from: FAKE_SENDER,
          to: FAKE_INBOX,
          subject: message.subject,
          text: message.text,
        });
        expect(options?.messageId).toBe(
          `<${createHash("sha256").update(message.key, "utf8").digest("hex")}@mail.example.com>`,
        );
      }),
    );
  });

  it("is sent by the adapter and recorded by the fake alike", async () => {
    await fc.assert(
      fc.asyncProperty(sendableMessage, async (message) => {
        const transports = acceptingTransports();
        const fake = createFakeMailSender();

        const fromAdapter = await createGmailMailSender(
          QA_CONFIGURATION,
          transports.make,
        ).send(message);
        const fromFake = await fake.send(message);

        expect(fromAdapter).toEqual({ ok: true });
        expect(fromFake).toEqual({ ok: true });
        expect(transports.sentOptions).toHaveLength(1);
        expect(fake.sent).toEqual([message]);
      }),
    );
  });
});

describe("a message the predicate refuses", () => {
  it("makes no transport through the adapter and leaves no record in the fake, and both answer the same", async () => {
    await fc.assert(
      fc.asyncProperty(unsendableMessage, async (message) => {
        const transports = acceptingTransports();
        const fake = createFakeMailSender([{ ok: false, kind: "busy" }]);

        const fromAdapter = await createGmailMailSender(
          QA_CONFIGURATION,
          transports.make,
        ).send(message);
        const fromFake = await fake.send(message);

        expect(isSendableMailMessage(message)).toBe(false);
        expect(fromAdapter).toEqual({ ok: false, kind: "refused" });
        expect(fromFake).toEqual(fromAdapter);
        expect(transports.made()).toBe(0);
        expect(fake.sent).toEqual([]);
      }),
    );
  });

  it.each([
    ["a text object that prints as a valid key", { key: new String("k/1") }],
    ["a list holding a valid key", { key: ["k/1"] }],
    ["a subject object that prints as one line", { subject: new String("s") }],
    ["a text that is a list of lines", { text: ["line"] }],
    ["a missing text", { text: undefined }],
  ])(
    "refuses %s rather than letting it be coerced into a message",
    async (_label, member) => {
      const transports = acceptingTransports();
      const message = { ...QA_MESSAGE, ...member } as unknown as MailMessage;

      const outcome = await createGmailMailSender(
        QA_CONFIGURATION,
        transports.make,
      ).send(message);

      expect(outcome).toEqual({ ok: false, kind: "refused" });
      expect(transports.made()).toBe(0);
    },
  );
});

describe("what a message can add to the options beyond its three fields", () => {
  class MessageWithInheritedExtras implements MailMessage {
    readonly key = QA_MESSAGE.key;
    readonly subject = QA_MESSAGE.subject;
    readonly text = QA_MESSAGE.text;

    get to(): string {
      return `inherited-${this.key.length.toString()}@example.com`;
    }

    get html(): string {
      return `<b>${this.subject}</b>`;
    }

    toJSON(): object {
      return {
        to: ["hook-recipient@example.com"],
        bcc: "hook-recipient@example.com",
        attachments: [{ filename: "x" }],
        replyTo: "hook-recipient@example.com",
        headers: { Bcc: "hook-recipient@example.com" },
      };
    }
  }

  const HOSTILE_MESSAGES: readonly [string, MailMessage][] = [
    [
      "a subclass with inherited accessors and its own serialisation hook",
      new MessageWithInheritedExtras(),
    ],
    [
      "a message whose members are accessors beside own extras",
      Object.defineProperties(
        {
          replyTo: "own-recipient@example.com",
          cc: ["own-recipient@example.com"],
          bcc: "own-recipient@example.com",
          headers: { Bcc: "own-recipient@example.com" },
          attachments: [],
          envelope: { to: "own-recipient@example.com" },
          list: { unsubscribe: "own-recipient@example.com" },
        },
        {
          key: { get: () => QA_MESSAGE.key, enumerable: true },
          subject: { get: () => QA_MESSAGE.subject, enumerable: true },
          text: { get: () => QA_MESSAGE.text, enumerable: true },
        },
      ) as unknown as MailMessage,
    ],
    [
      "a proxy that answers any member asked of it",
      new Proxy(QA_MESSAGE, {
        get: (target, member) =>
          member in target
            ? target[member as keyof MailMessage]
            : "proxied-recipient@example.com",
        has: () => true,
        ownKeys: () => ["key", "subject", "text", "to", "bcc", "html"],
        getOwnPropertyDescriptor: (target, member) => ({
          value:
            member in target
              ? target[member as keyof MailMessage]
              : "proxied-recipient@example.com",
          enumerable: true,
          configurable: true,
        }),
      }),
    ],
  ];

  it.each(HOSTILE_MESSAGES)(
    "hands the transport exactly the plain message's options, and composes to the plain message's headers, for %s",
    async (_label, message) => {
      const plain = acceptingTransports();
      await createGmailMailSender(QA_CONFIGURATION, plain.make).send(
        QA_MESSAGE,
      );
      const hostile = acceptingTransports();

      await createGmailMailSender(QA_CONFIGURATION, hostile.make).send(message);

      expect(hostile.sentOptions).toStrictEqual(plain.sentOptions);
      const [options] = hostile.sentOptions;
      if (options === undefined) throw new Error("nothing was sent");
      const composed = await composeRaw(options);
      expect([...composed.headerNames].sort()).toEqual(ALLOWED_HEADER_NAMES);
      expect(composed.envelopeRecipients).toEqual([FAKE_INBOX]);
      expect(composed.raw).not.toContain("recipient@example.com");
    },
  );

  it("adds nothing a configuration carries beyond its three values: the options and the transport's are the same", async () => {
    const widened = {
      ...QA_CONFIGURATION,
      cc: "configured-extra@example.com",
      bcc: "configured-extra@example.com",
      replyTo: "configured-extra@example.com",
      headers: { "X-Extra": "1" },
      tls: { rejectUnauthorized: false },
      service: "other",
      host: "other.example.com",
    };
    const plain = acceptingTransports();
    const wide = acceptingTransports();

    await createGmailMailSender(QA_CONFIGURATION, plain.make).send(QA_MESSAGE);
    await createGmailMailSender(widened, wide.make).send(QA_MESSAGE);

    expect(wide.sentOptions).toStrictEqual(plain.sentOptions);
    expect(wide.transportOptions).toStrictEqual(plain.transportOptions);
    expect(buildGmailTransportOptions(widened)).toStrictEqual(
      buildGmailTransportOptions(QA_CONFIGURATION),
    );
  });
});

describe("the same message, the same bytes", () => {
  it("does not depend on the order a message's members were written in", async () => {
    const reordered: MailMessage = {
      text: QA_MESSAGE.text,
      subject: QA_MESSAGE.subject,
      key: QA_MESSAGE.key,
    };
    const first = acceptingTransports();
    const second = acceptingTransports();

    await createGmailMailSender(QA_CONFIGURATION, first.make).send(QA_MESSAGE);
    await createGmailMailSender({ ...QA_CONFIGURATION }, second.make).send(
      reordered,
    );

    expect(second.sentOptions).toStrictEqual(first.sentOptions);
  });

  it("is the same on a later attempt from the same sender, after a failure in between, Message-ID included", async () => {
    const answers = [
      () => Promise.reject(new Error("down")),
      () => Promise.resolve(ACCEPTED_ONE_RECIPIENT),
    ];
    const transports = transportsAnswering(() => {
      const answer = answers.shift();
      return answer === undefined ? undefined : answer();
    });
    const sender = createGmailMailSender(QA_CONFIGURATION, transports.make);

    await sender.send(QA_MESSAGE);
    await sender.send(QA_MESSAGE);

    expect(transports.sentOptions).toHaveLength(2);
    expect(transports.sentOptions[1]).toStrictEqual(transports.sentOptions[0]);
  });
});

type Member = keyof MailMessage;
const MEMBERS: readonly Member[] = ["key", "subject", "text"];

const LATER_ANSWERS: MailMessage = {
  key: "later key\r\nBcc: second@example.com",
  subject: "later\nsubject",
  text: "",
};

interface CountedMessage {
  readonly message: MailMessage;
  readonly reads: Record<Member, number>;
}

/** Answers `first` the first time each member is asked for and `later` ever after, through accessors. */
function accessorsAnswering(
  first: MailMessage,
  later: MailMessage,
): CountedMessage {
  const reads = { key: 0, subject: 0, text: 0 };
  const message = {} as MailMessage;
  for (const member of MEMBERS) {
    Object.defineProperty(message, member, {
      enumerable: true,
      get: () => {
        reads[member] += 1;
        return reads[member] === 1 ? first[member] : later[member];
      },
    });
  }
  return { message, reads };
}

/** The same, through a proxy over an empty object, so nothing can be read but through the trap. */
function proxyAnswering(
  first: MailMessage,
  later: MailMessage,
): CountedMessage {
  const reads = { key: 0, subject: 0, text: 0 };
  const message = new Proxy({} as MailMessage, {
    get(_target, name) {
      const member = MEMBERS.find((candidate) => candidate === name);
      if (member === undefined) return undefined;
      reads[member] += 1;
      return reads[member] === 1 ? first[member] : later[member];
    },
  });
  return { message, reads };
}

const CHANGING_MESSAGES = [
  ["accessors", accessorsAnswering],
  ["a proxy", proxyAnswering],
] as const;

describe.each(CHANGING_MESSAGES)(
  "a message whose every member changes after its first answer, through %s",
  (_label, answering) => {
    it("is asked once for each member by the adapter, which sends the first answers", async () => {
      const transports = acceptingTransports();
      const { message, reads } = answering(QA_MESSAGE, LATER_ANSWERS);

      const outcome = await createGmailMailSender(
        QA_CONFIGURATION,
        transports.make,
      ).send(message);

      expect(outcome).toEqual({ ok: true });
      expect(reads).toEqual({ key: 1, subject: 1, text: 1 });
      expect(transports.sentOptions).toStrictEqual([
        buildGmailMessage(QA_MESSAGE, QA_CONFIGURATION),
      ]);
    });

    it("is asked once for each member by the fake, whose record of the first answers is frozen", async () => {
      const fake = createFakeMailSender();
      const { message, reads } = answering(QA_MESSAGE, LATER_ANSWERS);

      const outcome = await fake.send(message);

      expect(outcome).toEqual({ ok: true });
      expect(reads).toEqual({ key: 1, subject: 1, text: 1 });
      expect(fake.sent).toStrictEqual([QA_MESSAGE]);
      expect(fake.sent.every((recorded) => Object.isFrozen(recorded))).toBe(
        true,
      );
    });

    it.each(MEMBERS)(
      "is refused unsent and unrecorded when its first %s may not be sent, however well it answers afterwards",
      async (member) => {
        const transports = acceptingTransports();
        const fake = createFakeMailSender();
        const unsendableFirst = {
          ...QA_MESSAGE,
          [member]: LATER_ANSWERS[member],
        };

        const fromAdapter = await createGmailMailSender(
          QA_CONFIGURATION,
          transports.make,
        ).send(answering(unsendableFirst, QA_MESSAGE).message);
        const fromFake = await fake.send(
          answering(unsendableFirst, QA_MESSAGE).message,
        );

        expect(fromAdapter).toEqual({ ok: false, kind: "refused" });
        expect(fromFake).toEqual(fromAdapter);
        expect(transports.made()).toBe(0);
        expect(fake.sent).toEqual([]);
      },
    );
  },
);

function throwingWhenAskedFor(member: Member): MailMessage {
  return Object.defineProperty({ ...QA_MESSAGE }, member, {
    enumerable: true,
    get(): string {
      throw new Error(`unreadable ${FAKE_APP_PASSWORD}`);
    },
  });
}

describe("what is handed to a sender in place of a readable message", () => {
  const UNREADABLE: readonly [string, unknown][] = [
    ["a key that throws when read", throwingWhenAskedFor("key")],
    ["a subject that throws when read", throwingWhenAskedFor("subject")],
    ["a text that throws when read", throwingWhenAskedFor("text")],
    [
      "a proxy that throws whatever is asked",
      new Proxy(
        {},
        {
          get() {
            throw new Error(`unreadable ${FAKE_APP_PASSWORD}`);
          },
        },
      ),
    ],
    ["null", null],
    ["nothing", undefined],
    ["a list of the three values", Object.values(QA_MESSAGE)],
    ["text", QA_MESSAGE.key],
    ["a number", 7],
    ["a function", () => QA_MESSAGE],
  ];

  it.each(UNREADABLE)(
    "is refused without a transport by the adapter, and by the fake without a record or a spent scripted answer: %s",
    async (_label, value) => {
      const transports = acceptingTransports();
      const fake = createFakeMailSender([{ ok: false, kind: "busy" }]);
      const message = value as MailMessage;

      const fromAdapter = await createGmailMailSender(
        QA_CONFIGURATION,
        transports.make,
      ).send(message);
      const fromFake = await fake.send(message);
      const nextFromFake = await fake.send(QA_MESSAGE);

      expect(fromAdapter).toEqual({ ok: false, kind: "refused" });
      expect(fromFake).toEqual(fromAdapter);
      expect(transports.made()).toBe(0);
      expect(fake.sent).toEqual([QA_MESSAGE]);
      expect(nextFromFake).toEqual({ ok: false, kind: "busy" });
      expectNoMarkerIn([fromAdapter, fromFake], [FAKE_APP_PASSWORD]);
    },
  );

  it("refuses in the fake, as in the adapter, a key that is a text object printing as a valid key", async () => {
    const fake = createFakeMailSender();
    const message = { ...QA_MESSAGE, key: new String(QA_MESSAGE.key) };

    const outcome = await fake.send(message as unknown as MailMessage);

    expect(outcome).toEqual({ ok: false, kind: "refused" });
    expect(fake.sent).toEqual([]);
  });
});
