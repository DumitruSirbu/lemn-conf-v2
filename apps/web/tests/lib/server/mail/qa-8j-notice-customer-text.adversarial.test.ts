// What a customer's text can do to the shop's notice: every breaking character at every position in every
// printed field, the same characters the port's predicate refuses in a subject; an inert value moves no
// line but its own; and the members of a request the notice does not read at all.
import { fc } from "@fast-check/vitest";
import type { ContactFields } from "@lemnaria/configurator-domain";
import type { ContactSubmissionToRecord } from "@lemnaria/persistence";
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveContent } from "@/i18n/content";
import {
  buildLeadNotification,
  LEAD_NOTIFICATION_KEY_PREFIX,
  NoticeLineError,
} from "@/lib/server/mail/lead-notification";
import { isSendableMailMessage } from "@/lib/server/mail/mail-sender";
import { createGmailMailSender } from "@/lib/server/mail/gmail-mail-sender";
import ruMessages from "@/messages/ru.json";

import { ro } from "../../../support/romanian-content";
import {
  forbidFetch,
  forbidNetwork,
  releaseFetch,
  releaseNetwork,
} from "./mail-test-support";
import {
  acceptedContact,
  callbackRequest,
  CUSTOMER_MARKERS,
  designRequest,
  noticeOf,
  QA_CLIENT_REQUEST_ID,
  QA_EMAIL,
  QA_REFERENCE,
  QA_SNAPSHOT,
  thrownBy,
} from "./qa-8j-notice-support";
import {
  consoleCallsOf,
  everyReadingOf,
  expectNoMarkerIn,
  QA_CONFIGURATION,
  silenceEveryConsoleMethod,
  transportsAnswering,
} from "./qa-8j-support";

const labels = ro.leadNotice.labels;

interface PrintedField {
  /** The name the notice's error gives the line. */
  readonly line: string;
  readonly label: string;
  /** Where the line stands in the body. */
  readonly index: number;
  readonly withValue: (value: string) => ContactSubmissionToRecord;
}

function contactWith(member: keyof ContactFields, value: string) {
  return designRequest({ contact: { ...acceptedContact(), [member]: value } });
}

const PRINTED_FIELDS: readonly PrintedField[] = [
  {
    line: "locale",
    label: labels.locale,
    index: 1,
    withValue: (locale) => designRequest({ locale }),
  },
  {
    line: "name",
    label: labels.name,
    index: 2,
    withValue: (value) => contactWith("name", value),
  },
  {
    line: "phone",
    label: labels.phone,
    index: 3,
    withValue: (value) => contactWith("phoneNormalForm", value),
  },
  {
    line: "locality",
    label: labels.locality,
    index: 4,
    withValue: (value) => contactWith("locality", value),
  },
  {
    line: "email",
    label: labels.email,
    index: 6,
    withValue: (value) => contactWith("email", value),
  },
];

function codePointsFrom(first: number, last: number): number[] {
  return Array.from(
    { length: last - first + 1 },
    (_unused, index) => first + index,
  );
}

const LINE_SEPARATOR = 0x2028;
const PARAGRAPH_SEPARATOR = 0x2029;

/** Every control character there is, and the two separators: all of what may never stand in a line. */
const BREAKING_CODE_POINTS = [
  ...codePointsFrom(0x00, 0x1f),
  ...codePointsFrom(0x7f, 0x9f),
  LINE_SEPARATOR,
  PARAGRAPH_SEPARATOR,
];

const HOSTILE_MARKER = "QA-HOSTILE-5d81c0";

function placementsOf(breaker: string): string[] {
  return [
    `${breaker}${HOSTILE_MARKER}`,
    `${HOSTILE_MARKER}${breaker}Telefon: +37360000000`,
    `${HOSTILE_MARKER}${breaker}`,
  ];
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

describe("every breaking character, at every position, in every printed field", () => {
  it.each(PRINTED_FIELDS)(
    "throws the error that names the $line line and holds nothing of the value",
    ({ line, withValue }) => {
      const wrong: string[] = [];
      for (const codePoint of BREAKING_CODE_POINTS) {
        for (const value of placementsOf(String.fromCodePoint(codePoint))) {
          const thrown = thrownBy(() => noticeOf(withValue(value)));
          const isTheNamedError =
            thrown instanceof NoticeLineError && thrown.field === line;
          const holdsTheValue = everyReadingOf(thrown).includes(HOSTILE_MARKER);
          if (!isTheNamedError || holdsTheValue)
            wrong.push(`U+${codePoint.toString(16)}`);
        }
      }

      expect(wrong).toEqual([]);
    },
  );

  it("throws for a carriage return and line feed together, which a mail reads as one break", () => {
    for (const { withValue } of PRINTED_FIELDS) {
      expect(() =>
        noticeOf(withValue(`${HOSTILE_MARKER}\r\nBcc: second@example.com`)),
      ).toThrow(NoticeLineError);
    }
  });

  it("keeps the error's stack and message free of the value too", () => {
    const thrown = thrownBy(() =>
      noticeOf(contactWith("name", `${HOSTILE_MARKER}\n`)),
    ) as Error;

    expect(thrown.message).not.toContain(HOSTILE_MARKER);
    expect(thrown.stack ?? "").not.toContain(HOSTILE_MARKER);
    expect(thrown.cause).toBeUndefined();
  });

  it("throws for the reference before anything else, since the reference is in the subject", () => {
    const wrong = BREAKING_CODE_POINTS.filter((codePoint) => {
      const thrown = thrownBy(() =>
        buildLeadNotification({
          reference: `LM-${String.fromCodePoint(codePoint)}${HOSTILE_MARKER}`,
          submission: designRequest(),
          content: ro,
        }),
      );
      return !(
        thrown instanceof NoticeLineError &&
        thrown.field === "subject" &&
        !everyReadingOf(thrown).includes(HOSTILE_MARKER)
      );
    });

    expect(wrong).toEqual([]);
  });
});

const BIDI_OVERRIDE = String.fromCodePoint(0x202e);
const ZERO_WIDTH_JOINER = String.fromCodePoint(0x200d);
const SOFT_HYPHEN = String.fromCodePoint(0xad);
const BYTE_ORDER_MARK = String.fromCodePoint(0xfeff);
const EM_SPACE = String.fromCodePoint(0x2003);
const HALF_SURROGATE = String.fromCharCode(0xd83d);

const INERT_VALUES: readonly [string, string][] = [
  ["a right-to-left override", `abc${BIDI_OVERRIDE}fed`],
  ["a zero-width joiner", `a${ZERO_WIDTH_JOINER}b`],
  ["a soft hyphen", `a${SOFT_HYPHEN}b`],
  ["a byte order mark", `${BYTE_ORDER_MARK}ab`],
  ["half of a surrogate pair", `a${HALF_SURROGATE}b`],
  [
    "a wide space and then another line's label",
    `X${EM_SPACE}${labels.phone}: +37360000000`,
  ],
  ["ten thousand characters", "long ".repeat(2000)],
  ["a link", "https://example.com/pagina?x=1#y"],
  ["a formula", '=HYPERLINK("https://example.com","press")'],
  ["markup", "<script>alert(1)</script><img src=x onerror=y>"],
  ["a numbered placeholder", "{0}"],
  ["a plural form", "{name, plural, one {#} other {#}}"],
  ["a quoted brace", "'{'"],
  ["the notice's own placeholders", "{label}: {value} {reference}"],
  ["a printf placeholder", "%s %d %n"],
  ["a template literal", "${reference} `x`"],
  ["a written-out line break", "a\\nb\\r\\nc"],
  ["a subject in waiting", "Subject: alt subiect"],
  ["a single space", " "],
];

function isRefusedInASubject(character: string): boolean {
  return !isSendableMailMessage({
    key: "k",
    subject: `a${character}b`,
    text: "t",
  });
}

function isRefusedInANoticeLine(character: string): boolean {
  try {
    noticeOf(
      callbackRequest({
        contact: { ...acceptedContact(), name: `a${character}b` },
      }),
    );
    return false;
  } catch (error) {
    if (error instanceof NoticeLineError) return true;
    throw error;
  }
}

describe("the characters the notice refuses in a line and the port refuses in a subject", () => {
  const everyCodeUnit = codePointsFrom(0x0000, 0xffff).map((unit) =>
    String.fromCharCode(unit),
  );

  it("are the same characters across the whole 16-bit range, and exactly the ones listed here", () => {
    const refusedBySubject = everyCodeUnit.filter(isRefusedInASubject);
    const refusedByLine = everyCodeUnit.filter(isRefusedInANoticeLine);

    expect(refusedByLine).toEqual(refusedBySubject);
    expect(refusedByLine).toEqual(
      BREAKING_CODE_POINTS.map((codePoint) => String.fromCodePoint(codePoint)),
    );
  });
});

describe("a value that breaks no line", () => {
  const baseline = noticeOf(designRequest());
  const baselineLines = baseline.text.split("\n");

  describe.each(PRINTED_FIELDS)("in the $line line", (field) => {
    it.each(INERT_VALUES)(
      "is printed for %s exactly as stored, behind its label, and moves no other line, the subject or the key",
      (_label, value) => {
        const message = noticeOf(field.withValue(value));
        const lines = message.text.split("\n");

        expect(lines[field.index]).toBe(`${field.label}: ${value}`);
        expect(lines.filter((_line, index) => index !== field.index)).toEqual(
          baselineLines.filter((_line, index) => index !== field.index),
        );
        expect(message.subject).toBe(baseline.subject);
        expect(message.key).toBe(baseline.key);
        expect(isSendableMailMessage(message)).toBe(true);
      },
    );
  });

  it("stands at the index each field was given, so the cases above read the line they name", () => {
    for (const { label, index } of PRINTED_FIELDS) {
      expect(baselineLines[index]?.startsWith(`${label}: `)).toBe(true);
    }
  });
});

describe("what the notice does not read", () => {
  const NOT_READ_MARKER = "QA-NOT-READ-5d81c0";

  it("gives the same bytes whatever the typed phone, consent version, digest and design id and revision hold", () => {
    const baseline = noticeOf(designRequest());
    const submission = designRequest({
      payloadDigest: NOT_READ_MARKER,
      contact: {
        ...acceptedContact(),
        phone: `${NOT_READ_MARKER}\n069 111 222`,
        consentTextVersion: `${NOT_READ_MARKER}\n` as never,
      },
      target: {
        kind: "design",
        design: { id: `${NOT_READ_MARKER}\n`, revision: NOT_READ_MARKER },
      },
    });

    expect(noticeOf(submission)).toStrictEqual(baseline);
  });

  it("gives the same bytes whatever members a request and its contact carry beyond the stored ones", () => {
    const baseline = noticeOf(designRequest());
    const widened = {
      ...designRequest(),
      note: NOT_READ_MARKER,
      receivedAt: new Date(0),
      honeypot: NOT_READ_MARKER,
      contact: {
        ...acceptedContact(),
        note: NOT_READ_MARKER,
        consent: NOT_READ_MARKER,
        subject: NOT_READ_MARKER,
      },
    } as unknown as ContactSubmissionToRecord;

    expect(noticeOf(widened)).toStrictEqual(baseline);
  });

  it("prints a callback's one line whatever the intent's own text holds", () => {
    const baseline = noticeOf(callbackRequest());
    const hostile = callbackRequest({
      target: {
        kind: "intent",
        intent: `${NOT_READ_MARKER}\nTelefon: +37360000000` as never,
      },
    });

    expect(noticeOf(hostile)).toStrictEqual(baseline);
  });

  it("ignores a snapshot that came with a callback, and prints no kitchen", () => {
    const baseline = noticeOf(callbackRequest());

    expect(noticeOf(callbackRequest({ snapshot: QA_SNAPSHOT }))).toStrictEqual(
      baseline,
    );
  });

  it.each(["phone", "whatsapp"] as const)(
    "prints no e-mail address for the %s channel, even when the request holds one",
    (channel) => {
      const message = noticeOf(
        designRequest({
          contact: { ...acceptedContact(), channel, email: QA_EMAIL },
        }),
      );

      expect(everyReadingOf(message)).not.toContain(QA_EMAIL);
      expect(message.text).toContain(
        `${labels.channel}: ${ro.leadNotice.channels[channel]}`,
      );
    },
  );
});

/** Channels that are not text at all, and one a reader would recognise if an error held it. */
const UNWORDED_CHANNELS: readonly [string, unknown][] = [
  ["a number", 5],
  ["null", null],
  ["nothing", undefined],
  ["a list holding a known channel", ["phone", "email"]],
  ["text a reader would recognise", `${HOSTILE_MARKER} fax`],
];

const UNUSABLE_REQUEST_IDS: readonly [string, unknown][] = [
  ["an object that prints as an id", { toString: () => HOSTILE_MARKER }],
  ["a list of ids", [HOSTILE_MARKER]],
  ["a text object", new String(HOSTILE_MARKER)],
  ["true", true],
];

function expectTheNamedErrorWithNoValue(thrown: unknown, line: string): void {
  expect(thrown).toBeInstanceOf(NoticeLineError);
  expect((thrown as NoticeLineError).field).toBe(line);
  expect((thrown as Error).cause).toBeUndefined();
  expectNoMarkerIn(
    [thrown, (thrown as Error).message, (thrown as Error).stack],
    [HOSTILE_MARKER, ...CUSTOMER_MARKERS],
  );
}

describe("a channel the notice has no word for", () => {
  it.each(UNWORDED_CHANNELS)(
    "throws the error that names the channel line and holds no value, for %s",
    (_label, channel) => {
      const submission = designRequest({
        contact: { ...acceptedContact(), channel: channel as never },
      });

      expectTheNamedErrorWithNoValue(
        thrownBy(() => noticeOf(submission)),
        "channel",
      );
    },
  );
});

describe("a request id no key can be built from", () => {
  it.each(UNUSABLE_REQUEST_IDS)(
    "throws the error that names the key and holds no value, for %s",
    (_label, clientRequestId) => {
      const submission = designRequest({
        clientRequestId: clientRequestId as never,
      });

      expectTheNamedErrorWithNoValue(
        thrownBy(() => noticeOf(submission)),
        "key",
      );
    },
  );
});

describe("what building a notice writes", () => {
  const REFUSED_REQUESTS: readonly ContactSubmissionToRecord[] = [
    ...UNWORDED_CHANNELS.map(([, channel]) =>
      designRequest({
        contact: { ...acceptedContact(), channel: channel as never },
      }),
    ),
    ...["constructor", "__proto__", "toString", "valueOf"].map((channel) =>
      designRequest({
        contact: { ...acceptedContact(), channel: channel as never },
      }),
    ),
    ...UNUSABLE_REQUEST_IDS.map(([, clientRequestId]) =>
      designRequest({ clientRequestId: clientRequestId as never }),
    ),
    contactWith("name", `${HOSTILE_MARKER}\n`),
    designRequest({ snapshot: undefined }),
    designRequest({ snapshot: { ...QA_SNAPSHOT, document: "{" } }),
    designRequest({ snapshot: { ...QA_SNAPSHOT, priced: null as never } }),
  ];

  it("is nothing, through any console method, for every request it refuses", () => {
    const consoleSpies = silenceEveryConsoleMethod();

    const thrown = REFUSED_REQUESTS.map((submission) =>
      thrownBy(() => noticeOf(submission)),
    );

    expect(thrown.filter((error) => !(error instanceof Error))).toEqual([]);
    expect(consoleCallsOf(consoleSpies)).toEqual([]);
  });

  it("is nothing, through any console method, for a design, a callback and a notice in Russian", () => {
    const consoleSpies = silenceEveryConsoleMethod();
    const russianContent = resolveContent(
      createTranslator({ locale: "ru", messages: ruMessages }),
    );

    noticeOf(designRequest());
    noticeOf(callbackRequest());
    noticeOf(designRequest({ locale: "ru" }), russianContent);

    expect(consoleCallsOf(consoleSpies)).toEqual([]);
  });
});

describe("the customer's own language", () => {
  it("changes its own line and no other byte of the notice", () => {
    const romanian = noticeOf(designRequest({ locale: "ro" }));
    const russian = noticeOf(designRequest({ locale: "ru" }));
    const romanianLines = romanian.text.split("\n");
    const russianLines = russian.text.split("\n");

    expect(russianLines[1]).toBe(`${labels.locale}: ru`);
    expect(russianLines.filter((_line, index) => index !== 1)).toEqual(
      romanianLines.filter((_line, index) => index !== 1),
    );
    expect(russian.subject).toBe(romanian.subject);
    expect(russian.key).toBe(romanian.key);
  });

  it("can be written whole from the Russian catalogue's drafted leaves, with no key left unresolved", () => {
    const russianContent = resolveContent(
      createTranslator({ locale: "ru", messages: ruMessages }),
    );

    const russian = noticeOf(designRequest(), russianContent);

    expect(russian.text.split("\n")).toHaveLength(
      noticeOf(designRequest()).text.split("\n").length,
    );
    expect(russian.subject).toBe(`Заявка из конфигуратора ${QA_REFERENCE}`);
    expect(everyReadingOf(russian)).not.toContain("leadNotice");
    expect(isSendableMailMessage(russian)).toBe(true);
  });
});

describe("the subject and the key", () => {
  it("hold nothing of the customer whichever field the customer's text is in", () => {
    const { subject, key } = noticeOf(designRequest());

    expectNoMarkerIn([subject, key], CUSTOMER_MARKERS);
    expect(subject).toBe(ro.leadNotice.subject(QA_REFERENCE));
    expect(key).toBe(`${LEAD_NOTIFICATION_KEY_PREFIX}${QA_CLIENT_REQUEST_ID}`);
  });

  it("make a sendable key of at most 82 characters for every request id of the stored shape", () => {
    const storedShapeId = fc
      .array(
        fc.constantFrom(
          ...Array.from(
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-",
          ),
        ),
        { minLength: 16, maxLength: 64 },
      )
      .map((characters) => characters.join(""));

    fc.assert(
      fc.property(storedShapeId, (clientRequestId) => {
        const message = noticeOf(designRequest({ clientRequestId }));

        expect(message.key).toBe(`lead-notification/${clientRequestId}`);
        expect(message.key.length).toBeLessThanOrEqual(82);
        expect(isSendableMailMessage(message)).toBe(true);
      }),
    );
  });

  it.each([
    ["a header break", "qa_request\r\nBcc: second@example.com"],
    ["a space", "qa request 0000000001"],
    ["letters outside ASCII", "cerere_ключ_0000000001"],
    ["three hundred characters", "q".repeat(300)],
  ])(
    "never reach a transport when the request id holds %s: the sender refuses the notice unsent",
    async (_label, clientRequestId) => {
      const transports = transportsAnswering(() => ({
        accepted: [QA_CONFIGURATION.notificationAddress],
        rejected: [],
      }));
      const message = noticeOf(designRequest({ clientRequestId }));

      const outcome = await createGmailMailSender(
        QA_CONFIGURATION,
        transports.make,
      ).send(message);

      expect(outcome).toEqual({ ok: false, kind: "refused" });
      expect(transports.made()).toBe(0);
    },
  );
});

describe("a stored request the notice cannot describe", () => {
  const otherTotal = { ...QA_SNAPSHOT.priced, totalMinor: Number.NaN };

  const UNDESCRIBABLE: readonly [string, Partial<ContactSubmissionToRecord>][] =
    [
      ["no snapshot", { snapshot: undefined }],
      [
        "a document that is not JSON",
        { snapshot: { ...QA_SNAPSHOT, document: "{" } },
      ],
      [
        "a total that is no amount",
        { snapshot: { ...QA_SNAPSHOT, priced: otherTotal } },
      ],
      [
        "a price with no lines",
        {
          snapshot: {
            ...QA_SNAPSHOT,
            priced: { ...QA_SNAPSHOT.priced, lines: [] },
          },
        },
      ],
      [
        "a price that is nothing",
        { snapshot: { ...QA_SNAPSHOT, priced: null as never } },
      ],
    ];

  it.each(UNDESCRIBABLE)(
    "throws for %s, and nothing thrown holds a word of the customer's",
    (_label, overrides) => {
      const thrown = thrownBy(() => noticeOf(designRequest(overrides)));

      expect(thrown).toBeInstanceOf(Error);
      expectNoMarkerIn(
        [thrown, (thrown as Error).message, (thrown as Error).stack],
        CUSTOMER_MARKERS,
      );
    },
  );
});
