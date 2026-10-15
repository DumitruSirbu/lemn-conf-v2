// Proves a customer's field or a hostile key never adds a header, a recipient or a body line: the notice refuses the
// value by name, or the library's own composer writes a clean message.
import { createHash } from "node:crypto";
import { domainToASCII } from "node:url";

import { fc } from "@fast-check/vitest";
import type { ContactFields } from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildGmailMessage,
  createGmailMailSender,
} from "@/lib/server/mail/gmail-mail-sender";
import { NoticeLineError } from "@/lib/server/mail/lead-notification";
import {
  readMailConfiguration,
  type MailConfiguration,
} from "@/lib/server/mail/mail-configuration";
import type { MailMessage } from "@/lib/server/mail/mail-sender";

import { ro } from "../../../support/romanian-content";
import { forbidNetwork, releaseNetwork } from "./mail-test-support";
import {
  acceptedContact,
  designRequest,
  noticeOf,
  thrownBy,
} from "./qa-8j-notice-support";
import { FAKE_APP_PASSWORD, QA_CONFIGURATION } from "./qa-8j-support";
import {
  ALLOWED_HEADER_NAMES,
  composeRaw,
  decodedBodyOf,
  type RawMessage,
} from "./qa-8n-compose-support";

beforeEach(() => {
  forbidNetwork();
});
afterEach(() => {
  vi.restoreAllMocks();
  releaseNetwork();
});

const OTHER_RECIPIENT = "x@y.example";

/** What the plan lists, and the shapes a header or SMTP smuggler reaches for beside them. */
const BREAKERS = [
  "\r",
  "\n",
  "\r\n",
  "\u0085",
  " ",
  " ",
  `\r\nBcc: ${OTHER_RECIPIENT}`,
  `\nReply-To: ${OTHER_RECIPIENT}`,
  "\n.\n",
  "\r.\r",
  "\r\n.\r\n",
  "\n.",
  ".\r\n",
  "\0",
  `\r\n\r\nBcc: ${OTHER_RECIPIENT}`,
  "\u000b",
  "\u000c",
  "\u001c",
];

function placementsOf(breaker: string): string[] {
  return [`before${breaker}`, `be${breaker}fore`, `${breaker}after`, breaker];
}

interface Attackable {
  readonly field: string;
  readonly member: keyof ContactFields;
}

const ATTACKABLE: readonly Attackable[] = [
  { field: "name", member: "name" },
  { field: "phone", member: "phoneNormalForm" },
  { field: "locality", member: "locality" },
  { field: "email", member: "email" },
];

function noticeWith(member: keyof ContactFields, value: string): MailMessage {
  return noticeOf(
    designRequest({ contact: { ...acceptedContact(), [member]: value } }),
  );
}

async function composeNotice(message: MailMessage): Promise<RawMessage> {
  return composeRaw(buildGmailMessage(message, QA_CONFIGURATION));
}

const LONE_SURROGATE =
  /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

function withLoneSurrogatesReplaced(text: string): string {
  return text.replace(LONE_SURROGATE, "\ufffd");
}

function expectCleanComposition(
  composed: RawMessage,
  message: MailMessage,
): void {
  expect([...composed.headerNames].sort()).toEqual(ALLOWED_HEADER_NAMES);
  expect(composed.envelopeRecipients).toEqual([
    QA_CONFIGURATION.notificationAddress,
  ]);
  expect(composed.headers.get("content-type")).toMatch(
    /^text\/plain\b(?!.*boundary)/,
  );
  expect(composed.headerBlock).not.toContain(OTHER_RECIPIENT);
  // A lone surrogate cannot be written in UTF-8: the wire holds U+FFFD for it, and nothing else changes.
  expect(decodedBodyOf(composed).replace(/\n$/, "")).toBe(
    withLoneSurrogatesReplaced(message.text),
  );
  expect(decodedBodyOf(composed).split("\n")).not.toContain(".");
}

describe("a breaking character in a customer's field, through the notice and the composer", () => {
  const CASES = ATTACKABLE.flatMap(({ field, member }) =>
    BREAKERS.flatMap((breaker) =>
      placementsOf(breaker).map((value) => [field, member, value] as const),
    ),
  );

  it("holds the whole plan list at every position in every field: the sweep is not empty", () => {
    expect(CASES.length).toBe(ATTACKABLE.length * BREAKERS.length * 4);
    expect(new Set(CASES.map(([, , value]) => value)).size).toBeGreaterThan(
      BREAKERS.length,
    );
  });

  // Adds, beyond the notice tests: every breaker at every position in every field (the developer suite kills the same line-break mutants).
  it("is refused by the notice, by the line's name, and the error holds no value, whatever the field and the position", () => {
    const wrong: string[] = [];
    for (const [field, member, value] of CASES) {
      const thrown = thrownBy(() => noticeWith(member, value));
      const isRefusedByName =
        thrown instanceof NoticeLineError &&
        (thrown as { field?: string }).field === field;
      const holdsTheValue = String(thrown).includes(value.slice(0, 6));
      if (!isRefusedByName || holdsTheValue)
        wrong.push(`${field}: ${JSON.stringify(value)}`);
    }

    expect(wrong).toEqual([]);
  });
});

describe("a hostile value that holds no breaking character, in every printed field", () => {
  const HOSTILE_VALUES = [
    `Ion, Bcc: ${OTHER_RECIPIENT}`,
    `Ion <${OTHER_RECIPIENT}>`,
    `Ion"; Bcc: ${OTHER_RECIPIENT}`,
    "=?utf-8?B?QmNjOiB4QHkuZXhhbXBsZQ==?=",
    "--boundary-QA",
    "Content-Type: multipart/mixed; boundary=QA",
    ".",
    "..",
    " . ",
    "‮RTL override‬",
    "​zero‍width﻿",
    "x".repeat(5_000),
    "é".repeat(300),
    "😀 emoji",
    "lone \ud800 surrogate",
    "=3D=0D=0A",
    "From: spoof",
  ];

  // Adds: the library's own composer on hostile values with no line break, which the developer suite never composes.
  it.each(ATTACKABLE)(
    "composes to a clean header set, one recipient and the notice's own text, for $field",
    async ({ member }) => {
      for (const value of HOSTILE_VALUES) {
        const notice = noticeWith(member, value);

        const composed = await composeNotice(notice);

        expectCleanComposition(composed, notice);
        expect(notice.text).toContain(value === "" ? "x" : value.slice(0, 20));
      }
    },
  );
});

describe("there is no notes field for a customer to write into", () => {
  it("is a contact of exactly the validated members, and a notice whose labels name none of a note", () => {
    const contact = acceptedContact();

    expect(Object.keys(contact).sort()).toEqual(
      [
        "channel",
        "consentTextVersion",
        "email",
        "locality",
        "name",
        "phone",
        "phoneNormalForm",
      ].sort(),
    );
    const labelWords = Object.values(ro.leadNotice.labels).join(" ");
    expect(labelWords).not.toMatch(/note|observa|mesaj|comment|detal/i);
    expect(Object.keys(ro.leadNotice.labels).sort()).toEqual(
      [
        "channel",
        "email",
        "locale",
        "locality",
        "name",
        "phone",
        "price",
        "reference",
        "room",
      ].sort(),
    );
  });
});

describe("a key built to break the Message-ID", () => {
  const sha256Hex = (text: string) =>
    createHash("sha256").update(text, "utf8").digest("hex");

  const HOSTILE_KEYS = [
    '<>@"()[];:,\\',
    '<>@"()[];:,\\'.repeat(19).slice(0, 256),
    "x".repeat(256),
    "k".repeat(255) + ">",
    '">@evil.example',
    "<a@b>",
    "a@b",
    "$(reboot)",
    "=?utf-8?q?x?=",
    "%0d%0aBcc:",
    "\\r\\nBcc:",
  ];

  // Adds: hostile keys through the library's composer, with the header count and the key absent from every header.
  it.each(HOSTILE_KEYS)(
    "composes one well-formed Message-ID, the digest of %j, and the key in no header",
    async (key) => {
      const message: MailMessage = { key, subject: "S", text: "T" };

      const composed = await composeRaw(
        buildGmailMessage(message, QA_CONFIGURATION),
      );

      expect(composed.headers.get("message-id")).toBe(
        `<${sha256Hex(key)}@mail.example.com>`,
      );
      expect(composed.headerBlock.match(/^message-id:/gim)).toHaveLength(1);
      expect(composed.headerBlock.toLowerCase()).not.toContain(
        key.slice(0, 12).toLowerCase(),
      );
      expect([...composed.headerNames].sort()).toEqual(ALLOWED_HEADER_NAMES);
    },
  );

  // Adds: the Message-ID is injective in the key, which no example in the developer suite pins.
  it("is the same Message-ID across any two builds of one message, and a different one for any two keys", () => {
    fc.assert(
      fc.property(
        fc.string({
          minLength: 1,
          maxLength: 256,
          unit: fc.constantFrom(...Array.from('ab<>@"()[];:,\\/-_09')),
        }),
        fc.string({
          minLength: 1,
          maxLength: 256,
          unit: fc.constantFrom(...Array.from('ab<>@"()[];:,\\/-_09')),
        }),
        (first, second) => {
          const idOf = (key: string) =>
            buildGmailMessage(
              { key, subject: "S", text: "T" },
              QA_CONFIGURATION,
            ).messageId;

          expect(idOf(first)).toBe(idOf(first));
          expect(idOf(first) === idOf(second)).toBe(first === second);
          expect(idOf(first)).toMatch(/^<[0-9a-f]{64}@[a-z0-9.-]+>$/);
        },
      ),
    );
  });
});

describe("the domain of an address the reader calls usable, in the Message-ID and on the wire", () => {
  const DOMAIN_LETTERS = [
    ...Array.from("abcxyz019"),
    "ü",
    "ß",
    "ж",
    "ｂ",
    "ⅿ",
    "ǆ",
    "İ",
    "ᴀ",
    "é",
    "日本",
  ];
  const LOCAL_CHARACTERS = Array.from("abcXYZ019!#$%&'*+/=?^_`{|}~-");

  const label = fc.string({
    unit: fc.constantFrom(...DOMAIN_LETTERS, "-"),
    minLength: 1,
    maxLength: 8,
  });
  const candidate = fc
    .tuple(
      fc.string({
        unit: fc.constantFrom(...LOCAL_CHARACTERS),
        minLength: 1,
        maxLength: 12,
      }),
      fc.array(label, { minLength: 1, maxLength: 3 }),
      fc.string({
        unit: fc.constantFrom(...Array.from("abcxyz")),
        minLength: 2,
        maxLength: 5,
      }),
    )
    .map(([local, labels, top]) => `${local}@${[...labels, top].join(".")}`);

  function readAsConfigured(
    sender: string,
    inbox: string,
  ): MailConfiguration | undefined {
    const read = readMailConfiguration({
      GOOGLE_EMAIL: sender,
      GOOGLE_APP_PASSWORD: FAKE_APP_PASSWORD,
      LEAD_NOTIFICATION_ADDRESS: inbox,
    });
    return read.status === "configured" ? read.configuration : undefined;
  }

  // Adds: generated internationalised addresses through the composer (kills a missing punycode step the developer suite also kills).
  it("is one well-formed msg-id, one envelope recipient, and a recipient whose domain is the one the reader judged", async () => {
    const tally = { accepted: 0, refused: 0 };

    await fc.assert(
      fc.asyncProperty(candidate, candidate, async (sender, inbox) => {
        const configuration = readAsConfigured(sender, inbox);
        if (configuration === undefined) {
          tally.refused += 1;
          return;
        }
        tally.accepted += 1;

        const options = buildGmailMessage(
          { key: "k", subject: "S", text: "T" },
          configuration,
        );
        const composed = await composeRaw(options);

        const [senderDomain = ""] = sender.split("@").slice(1);
        const [inboxLocal = "", inboxDomain = ""] = inbox.split("@");
        expect(options.messageId).toMatch(/^<[0-9a-f]{64}@[a-z0-9.-]+>$/);
        expect(
          options.messageId.endsWith(`@${domainToASCII(senderDomain)}>`),
        ).toBe(true);
        expect(composed.headers.get("message-id")).toBe(options.messageId);
        expect(composed.envelopeRecipients).toEqual([
          `${inboxLocal}@${domainToASCII(inboxDomain)}`,
        ]);
        expect([...composed.headerNames].sort()).toEqual(ALLOWED_HEADER_NAMES);
      }),
      { numRuns: 400 },
    );

    expect(tally.accepted).toBeGreaterThan(20);
    expect(tally.refused).toBeGreaterThan(20);
  });

  // Adds: every visible-ASCII local part the reader accepts is written byte for byte by the composer.
  it("is, for any local part of visible ASCII the reader accepts, the one recipient the composer writes, byte for byte", async () => {
    const VISIBLE = Array.from({ length: 0x7e - 0x21 + 1 }, (_unused, index) =>
      String.fromCharCode(0x21 + index),
    ).filter((character) => character !== "@");
    const hostileLocal = fc
      .array(fc.constantFrom(...VISIBLE, ".", "a", "b"), {
        minLength: 1,
        maxLength: 8,
      })
      .map((characters) => characters.join(""));
    const tally = { accepted: 0, refused: 0 };

    await fc.assert(
      fc.asyncProperty(hostileLocal, async (local) => {
        const address = `${local}@mail.example.org`;
        const configuration = readAsConfigured(address, address);
        if (configuration === undefined) {
          tally.refused += 1;
          return;
        }
        tally.accepted += 1;

        const composed = await composeRaw(
          buildGmailMessage(
            { key: "k", subject: "S", text: "T" },
            configuration,
          ),
        );

        expect(composed.envelopeRecipients).toEqual([address]);
        expect(composed.envelopeSender).toBe(address);
        expect([...composed.headerNames].sort()).toEqual(ALLOWED_HEADER_NAMES);
      }),
      { numRuns: 1500 },
    );

    expect(tally.accepted).toBeGreaterThan(100);
    expect(tally.refused).toBeGreaterThan(100);
  });

  // Adds, beyond the developer lists: URL-delimiter and full-width-dot domains (a mutant admitting "#" or U+3002 survives the developer suite).
  it.each([
    'a@b"c',
    "a@(x)",
    "a@[1.2.3.4]",
    "a@b\\c",
    "a@b.example/path",
    "a@b.example?x=1",
    "a@b.example#x",
    "a@b.example:25",
    "a@user:pass@b.example",
    "a@%62.example",
    "a@b..example",
    "a@b.example。x",
    "a@b．example",
    "a@b.example​",
    "a@‮b.example",
    "a@b.example\u0000",
    "a@b.example%0d%0aBcc:x@y.example",
    "a@[::1]",
    "a@1.2.3.4",
    "a@0x7f.0.0.1",
    "a@2130706433",
    "a@b.ex ample",
    "a@xn--",
    "a@-b.example",
  ])(
    "reads %j as unavailable in either address and builds no transport for it",
    (address) => {
      expect(
        readAsConfigured(address, QA_CONFIGURATION.notificationAddress),
      ).toBeUndefined();
      expect(
        readAsConfigured(QA_CONFIGURATION.senderAddress, address),
      ).toBeUndefined();
      const transportsMade: number[] = [];
      const sender = createGmailMailSender(
        { ...QA_CONFIGURATION, senderAddress: address },
        () => {
          transportsMade.push(1);
          throw new Error("a transport was made");
        },
      );
      return expect(sender.send({ key: "k", subject: "S", text: "T" }))
        .resolves.toEqual({ ok: false, kind: "refused" })
        .then(() => {
          expect(transportsMade).toEqual([]);
        });
    },
  );
});
