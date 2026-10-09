// What the port's predicate accepts is driven through what then receives it: the built request, the
// platform's own header and request constructors, and the fake. The developer's tests decide each
// character of a key; these ask whether an accepted message can still break, widen or change a request.
import { fc } from "@fast-check/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeMailSender } from "@/lib/server/mail/fake-mail-sender";
import {
  isSendableMailMessage,
  type MailMessage,
} from "@/lib/server/mail/mail-sender";
import {
  buildResendRequest,
  createResendMailSender,
  MAIL_USER_AGENT,
  RESEND_SEND_URL,
} from "@/lib/server/mail/resend-mail-sender";

import { forbidFetch, releaseFetch } from "./mail-test-support";
import {
  FAKE_API_KEY,
  FAKE_INBOX,
  FAKE_SENDER,
  QA_CONFIGURATION,
  QA_MESSAGE,
  stubFetchAnswering,
  textAnswer,
} from "./qa-8j-support";

const VISIBLE_ASCII = Array.from(
  { length: 0x7e - 0x21 + 1 },
  (_unused, index) => String.fromCharCode(0x21 + index),
);

const sendableKey = fc
  .array(fc.constantFrom(...VISIBLE_ASCII), { minLength: 1, maxLength: 256 })
  .map((characters) => characters.join(""));

const LINE_BREAKING = /[\p{Cc}\u2028\u2029]/u;

/** Any text, half surrogates and format characters included, with no control character or line separator. */
const sendableSubject = fc
  .string({ unit: "binary", minLength: 1, maxLength: 80 })
  .filter((subject) => !LINE_BREAKING.test(subject));

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
  "key\u2028",
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
      "separated\u2028here",
      "paragraph\u2029here",
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

function acceptingFetch() {
  return stubFetchAnswering(() => textAnswer(200, '{"id":"msg_1"}'));
}

function initOf(fetchSpy: ReturnType<typeof acceptingFetch>): RequestInit {
  const init = fetchSpy.mock.calls[0]?.[1];
  if (init === undefined) throw new Error("no request was made");
  return init;
}

beforeEach(forbidFetch);
afterEach(() => {
  vi.restoreAllMocks();
  releaseFetch();
});

describe("a message the predicate accepts, through everything that then receives it", () => {
  it("builds a request the platform's own constructor takes, whose four headers read back unchanged", () => {
    fc.assert(
      fc.property(sendableMessage, (message) => {
        const built = buildResendRequest(message, QA_CONFIGURATION);

        const request = new Request(built.url, built.init);

        expect(isSendableMailMessage(message)).toBe(true);
        expect(Object.fromEntries(request.headers)).toEqual({
          authorization: `Bearer ${FAKE_API_KEY}`,
          "content-type": "application/json",
          "user-agent": MAIL_USER_AGENT,
          "idempotency-key": message.key,
        });
      }),
    );
  });

  it("carries the subject and the text through the body unchanged, with the one configured recipient", () => {
    fc.assert(
      fc.property(sendableMessage, (message) => {
        const { body } = buildResendRequest(message, QA_CONFIGURATION).init;

        expect(JSON.parse(body)).toStrictEqual({
          from: FAKE_SENDER,
          to: [FAKE_INBOX],
          subject: message.subject,
          text: message.text,
        });
      }),
    );
  });

  it("writes a body that is plain ASCII-safe JSON even for half surrogates, so no encoder can alter it", () => {
    const message = { ...QA_MESSAGE, text: "before \ud800 after \udc00 end" };

    const { body } = buildResendRequest(message, QA_CONFIGURATION).init;

    expect(isSendableMailMessage(message)).toBe(true);
    expect(new TextDecoder().decode(new TextEncoder().encode(body))).toBe(body);
    expect((JSON.parse(body) as { text: string }).text).toBe(message.text);
  });

  it("is sent by the adapter and recorded by the fake alike", async () => {
    await fc.assert(
      fc.asyncProperty(sendableMessage, async (message) => {
        const fetchSpy = acceptingFetch();
        const fake = createFakeMailSender();

        const fromAdapter =
          await createResendMailSender(QA_CONFIGURATION).send(message);
        const fromFake = await fake.send(message);

        expect(fromAdapter).toEqual({ ok: true });
        expect(fromFake).toEqual({ ok: true });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(fake.sent).toEqual([message]);
      }),
    );
  });
});

describe("a message the predicate refuses", () => {
  it("makes no request through the adapter and leaves no record in the fake, and both answer the same", async () => {
    await fc.assert(
      fc.asyncProperty(unsendableMessage, async (message) => {
        const fetchSpy = acceptingFetch();
        const fake = createFakeMailSender([{ ok: false, kind: "busy" }]);

        const fromAdapter =
          await createResendMailSender(QA_CONFIGURATION).send(message);
        const fromFake = await fake.send(message);

        expect(isSendableMailMessage(message)).toBe(false);
        expect(fromAdapter).toEqual({ ok: false, kind: "refused" });
        expect(fromFake).toEqual(fromAdapter);
        expect(fetchSpy).not.toHaveBeenCalled();
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
    "refuses %s rather than letting it be coerced into a request",
    async (_label, member) => {
      const fetchSpy = acceptingFetch();
      const message = { ...QA_MESSAGE, ...member } as unknown as MailMessage;

      const outcome =
        await createResendMailSender(QA_CONFIGURATION).send(message);

      expect(outcome).toEqual({ ok: false, kind: "refused" });
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );
});

/** A message whose key reads as sendable the first time it is asked and as a header break ever after. */
function messageWhoseKeyChangesAfterTheFirstRead(): MailMessage {
  let reads = 0;
  return {
    get key() {
      reads += 1;
      return reads === 1
        ? QA_MESSAGE.key
        : "changed key\r\nBcc: second@example.com";
    },
    subject: QA_MESSAGE.subject,
    text: QA_MESSAGE.text,
  };
}

describe("a message that answers differently each time it is read", () => {
  it("never puts into a request a key the predicate did not see", async () => {
    const fetchSpy = acceptingFetch();

    await createResendMailSender(QA_CONFIGURATION).send(
      messageWhoseKeyChangesAfterTheFirstRead(),
    );

    const keysRequested = fetchSpy.mock.calls.map(
      ([, init]) =>
        (init.headers as Record<string, string>)["Idempotency-Key"] ?? "",
    );
    expect(
      keysRequested.filter(
        (key) => !isSendableMailMessage({ ...QA_MESSAGE, key }),
      ),
    ).toEqual([]);
  });

  it("never records in the fake a key the predicate did not see", async () => {
    const fake = createFakeMailSender();

    await fake.send(messageWhoseKeyChangesAfterTheFirstRead());

    expect(
      fake.sent.filter((recorded) => !isSendableMailMessage(recorded)),
    ).toEqual([]);
  });
});

describe("what a message can add to the request beyond its three fields", () => {
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
        tags: [{ name: "x", value: "y" }],
        scheduled_at: "tomorrow",
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
          reply_to: "own-recipient@example.com",
          cc: ["own-recipient@example.com"],
          headers: { Bcc: "own-recipient@example.com" },
          attachments: [],
          tags: [],
          scheduled_at: "in 1 min",
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
    "sends exactly the plain message's bytes, headers and options for %s",
    async (_label, message) => {
      const plainSpy = acceptingFetch();
      await createResendMailSender(QA_CONFIGURATION).send(QA_MESSAGE);
      const plain = initOf(plainSpy);
      const hostileSpy = acceptingFetch();

      await createResendMailSender(QA_CONFIGURATION).send(message);
      const hostile = initOf(hostileSpy);

      expect(hostile.body).toBe(plain.body);
      expect(hostile.headers).toStrictEqual(plain.headers);
      expect(Object.keys(hostile).sort()).toEqual(Object.keys(plain).sort());
    },
  );

  it("hands fetch the method, the headers, the body, the redirect rule and the signal, and no other option", async () => {
    const fetchSpy = acceptingFetch();

    await createResendMailSender(QA_CONFIGURATION).send(QA_MESSAGE);

    const init = initOf(fetchSpy);
    expect(Object.keys(init).sort()).toEqual([
      "body",
      "headers",
      "method",
      "redirect",
      "signal",
    ]);
    expect(Object.keys(init.headers as object)).toEqual([
      "Authorization",
      "Content-Type",
      "User-Agent",
      "Idempotency-Key",
    ]);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(RESEND_SEND_URL);
  });

  it("adds nothing a configuration carries beyond its three values", () => {
    const widened = {
      ...QA_CONFIGURATION,
      cc: "configured-extra@example.com",
      replyTo: "configured-extra@example.com",
      headers: { "X-Extra": "1" },
    };

    const built = buildResendRequest(QA_MESSAGE, widened);

    expect(built).toStrictEqual(
      buildResendRequest(QA_MESSAGE, QA_CONFIGURATION),
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
    const firstSpy = acceptingFetch();
    await createResendMailSender(QA_CONFIGURATION).send(QA_MESSAGE);
    const first = initOf(firstSpy).body;
    const secondSpy = acceptingFetch();

    await createResendMailSender({ ...QA_CONFIGURATION }).send(reordered);

    expect(initOf(secondSpy).body).toBe(first);
  });

  it("is the same on a later attempt from the same sender, after a failure in between", async () => {
    const sender = createResendMailSender(QA_CONFIGURATION);
    const failingSpy = stubFetchAnswering(() => textAnswer(503, "down"));
    await sender.send(QA_MESSAGE);
    const firstAttempt = initOf(failingSpy);
    const retrySpy = acceptingFetch();

    await sender.send(QA_MESSAGE);
    const retry = initOf(retrySpy);

    expect(retry.body).toBe(firstAttempt.body);
    expect(retry.headers).toStrictEqual(firstAttempt.headers);
  });
});
