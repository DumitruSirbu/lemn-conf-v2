// The port's optional HTML alternative, from the predicate through the copy and the adapter to the composed MIME.
import { fc } from "@fast-check/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeMailSender } from "@/lib/server/mail/fake-mail-sender";
import {
  buildGmailMessage,
  createGmailMailSender,
} from "@/lib/server/mail/gmail-mail-sender";
import { composeLeadNotice } from "@/lib/server/mail/lead-notification";
import {
  HTML_MAX_LENGTH,
  isSendableMailMessage,
  sendableCopyOf,
  type MailMessage,
} from "@/lib/server/mail/mail-sender";

import { fixtureNamed } from "./lead-notice-fixtures";
import { forbidNetwork, releaseNetwork } from "./mail-test-support";
import { alternativePartsOf } from "./mime-alternative-support";
import { composeRaw } from "./qa-8n-compose-support";
import {
  ACCEPTED_ONE_RECIPIENT,
  QA_CONFIGURATION,
  QA_MESSAGE,
  transportsAnswering,
} from "./qa-8j-support";

beforeEach(() => {
  forbidNetwork();
});
afterEach(() => {
  vi.restoreAllMocks();
  releaseNetwork();
});

const HTML = "<p>notice</p>";

function withHtml(html: unknown): MailMessage {
  return { ...QA_MESSAGE, html } as MailMessage;
}

describe("the predicate on an html alternative", () => {
  it("accepts a message with no html, as before", () => {
    expect(isSendableMailMessage(QA_MESSAGE)).toBe(true);
  });

  it.each([
    ["one character", "x"],
    ["exactly the bound", "x".repeat(HTML_MAX_LENGTH)],
  ])("accepts an html of %s", (_label, html) => {
    expect(isSendableMailMessage(withHtml(html))).toBe(true);
  });

  it.each([
    ["empty", ""],
    ["one past the bound", "x".repeat(HTML_MAX_LENGTH + 1)],
    ["a number", 42],
    ["null", null],
    ["an object", { toString: () => HTML }],
  ])("refuses an html that is %s, without throwing", (_label, html) => {
    expect(isSendableMailMessage(withHtml(html))).toBe(false);
  });

  it("bounds the html at 262 144 code units", () => {
    expect(HTML_MAX_LENGTH).toBe(262_144);
  });
});

describe("sendableCopyOf with an html alternative", () => {
  it("answers a frozen copy of the four members", () => {
    const copy = sendableCopyOf({
      ...withHtml(HTML),
      to: "a@example.com",
    } as MailMessage);

    expect(Object.keys(copy ?? {})).toEqual(["key", "subject", "text", "html"]);
    expect(copy?.html).toBe(HTML);
    expect(Object.isFrozen(copy)).toBe(true);
  });

  it("adds no html member to a message that had none", () => {
    const copy = sendableCopyOf(QA_MESSAGE);

    expect(copy !== undefined && Object.hasOwn(copy, "html")).toBe(false);
  });

  it("reads the html once and sends what that one reading answered", () => {
    let reads = 0;
    const message = {
      ...QA_MESSAGE,
      get html() {
        reads += 1;
        return reads === 1 ? HTML : "";
      },
    };

    const copy = sendableCopyOf(message);

    expect(reads).toBe(1);
    expect(copy?.html).toBe(HTML);
  });

  it("answers nothing for a message whose html cannot be read", () => {
    const unreadable = {
      ...QA_MESSAGE,
      get html(): string {
        throw new Error("no html");
      },
    };

    expect(sendableCopyOf(unreadable)).toBeUndefined();
  });
});

const visibleText = fc.string({
  minLength: 1,
  maxLength: 40,
  unit: "grapheme",
});
const anyHtml = fc.oneof(
  fc.constant(undefined),
  fc.constant(""),
  visibleText,
  fc.integer(),
);
const generatedMessage = fc.record({
  key: fc.oneof(fc.constant(QA_MESSAGE.key), fc.constant("has a space")),
  subject: fc.oneof(fc.constant(QA_MESSAGE.subject), fc.constant("")),
  text: fc.oneof(fc.constant(QA_MESSAGE.text), fc.constant("")),
  html: anyHtml,
});

describe("the fake and the adapter", () => {
  it("send the same messages, with the same html, over generated messages", async () => {
    await fc.assert(
      fc.asyncProperty(generatedMessage, async (generated) => {
        const message = generated as unknown as MailMessage;
        const fake = createFakeMailSender();
        const transports = transportsAnswering(() => ACCEPTED_ONE_RECIPIENT);

        await fake.send(message);
        await createGmailMailSender(QA_CONFIGURATION, transports.make).send(
          message,
        );

        expect(transports.sentOptions.length).toBe(fake.sent.length);
        expect(transports.sentOptions[0]?.html).toBe(fake.sent[0]?.html);
        expect(fake.sent.length).toBe(isSendableMailMessage(message) ? 1 : 0);
      }),
      { numRuns: 200 },
    );
  });
});

describe("buildGmailMessage with an html alternative", () => {
  it("adds html to the five named options exactly when the copy has one, over generated copies", () => {
    fc.assert(
      fc.property(fc.option(visibleText, { nil: undefined }), (html) => {
        const copy = sendableCopyOf(
          html === undefined ? QA_MESSAGE : withHtml(html),
        );
        if (copy === undefined) throw new Error("the copy was refused");

        const options = buildGmailMessage(copy, QA_CONFIGURATION);

        expect(Object.keys(options)).toEqual([
          "from",
          "to",
          "subject",
          "text",
          "messageId",
          ...(html === undefined ? [] : ["html"]),
        ]);
        expect(options.html).toBe(html);
      }),
      { numRuns: 100 },
    );
  });
});

describe("the composed notice, through the library's own stream transport", () => {
  const notice = composeLeadNotice(fixtureNamed("design-with-link"));

  it("is one multipart/alternative of a UTF-8 text part and then a UTF-8 html part, nothing else", async () => {
    const composed = await composeRaw(
      buildGmailMessage(notice, QA_CONFIGURATION),
    );

    const parts = alternativePartsOf(composed);

    expect(parts.map(({ headers }) => headers.get("content-type"))).toEqual([
      "text/plain; charset=utf-8",
      "text/html; charset=utf-8",
    ]);
    expect(parts.map(({ decoded }) => decoded)).toEqual([
      notice.text,
      notice.html,
    ]);
    expect(composed.raw).not.toMatch(/content-disposition|attachment/i);
  });

  it("has one To, no Reply-To, Cc or Bcc, and the subject the notice was given", async () => {
    const composed = await composeRaw(
      buildGmailMessage(notice, QA_CONFIGURATION),
    );

    expect(composed.headerNames.filter((name) => name === "to")).toHaveLength(
      1,
    );
    expect(composed.envelopeRecipients).toEqual([
      QA_CONFIGURATION.notificationAddress,
    ]);
    expect(composed.headerNames).not.toContain("reply-to");
    expect(composed.headerNames).not.toContain("cc");
    expect(composed.headerNames).not.toContain("bcc");
    expect(composed.headers.get("subject")).toBe(notice.subject);
  });

  it("stays a single text/plain part for a message with no html", async () => {
    const composed = await composeRaw(
      buildGmailMessage(QA_MESSAGE, QA_CONFIGURATION),
    );

    expect(composed.headers.get("content-type")).toMatch(/^text\/plain\b/);
    expect(composed.raw).not.toContain("multipart");
  });
});
