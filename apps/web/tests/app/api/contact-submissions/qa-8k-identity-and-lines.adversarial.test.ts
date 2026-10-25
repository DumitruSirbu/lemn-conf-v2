// The contact route with its real orchestration and only what reaches outside the process a fake: what makes two
// requests one, what makes one id a conflict, two calls at once, what a throw at each step becomes, what the lines hold
// on every branch, and what a customer's text can do to the notice the sender is handed.
import { NARROWED_ROOM_OVERFLOWING_DESIGN } from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KITCHEN_LINK_CAUSES } from "@/lib/server/contact/sent-kitchen-link";

import {
  consoleCallsOf,
  spyOnEveryConsoleMethod,
} from "../../../lib/server/mail/mail-test-support";
import {
  byEmail,
  callbackRequest,
  codeOf,
  contactRequest,
  designRequest,
  failCountersFrom,
  failTheStoreAt,
  found,
  loadRoute,
  MARKER,
  nameTheNetworkSource,
  referenceOf,
  requestIdOf,
  resetOutside,
  send,
  SUBMITTED_MARKERS,
  type Fields,
  type Outside,
  type Post,
} from "./qa-8k-support";

const outside = vi.hoisted(() => ({}) as Outside);

vi.mock("@/lib/server/contact/contact-submission-store-instance", () => ({
  getContactSubmissionStore: () => outside.store,
}));
// The sent mark's store is a fake: no database is reached, so no line about a mark that could not be made is among the
// lines under test.
vi.mock("@/lib/server/contact/sent-mark-store-instance", () =>
  import("../../../support/sent-mark-store-fake").then((fake) =>
    fake.fakeSentMarkStoreModule(),
  ),
);
vi.mock("@/lib/server/mail/create-mail-sender", () => ({
  createMailSender: () => ({ kind: "sender", sender: outside.sender }),
}));
vi.mock("@/lib/server/load-owned-design", () => ({
  loadOwnedDesign: (designId: string) => outside.load(designId),
}));

const PLACEHOLDER_REFERENCE = "LM-00000000";
const ANOTHER_DESIGN_ID = "qa8kAnotherDesign7c41";
const THROWN_TEXT = `thrown about ${MARKER.name} <${MARKER.address}> ${MARKER.phone} ${MARKER.requestId}`;
const BOUND_BYTES = 8 * 1024;
const FLOOD = 6;
/** More than every request's thirty an hour, so the limit is met and its line written. */
const PAST_EVERY_FIGURE = 40;
/** What each key of a line may hold: a word from a list written here, a number, or a reference's shape. */
const LINE_VALUES: Readonly<Record<string, RegExp>> = {
  event:
    /^(contact-(request-refused|request-unavailable|notice-not-sent|mark-failed|stored-request-refused)|sent-kitchen-link-unavailable)$/,
  refusalCode: /^CONTACT_[A-Z_]+$/,
  status: /^(400|403|409|413|415|422|429|502|503)$/,
  policy: /^contact-[a-z0-9-]+$/,
  cause: new RegExp(
    `^(${[
      "source-misconfigured",
      "policy-misconfigured",
      "digester-unusable",
      "window-unavailable",
      "store-failed",
      "deadline-passed",
      "judgement-failed",
      "sender-unusable",
      "submission-store-failed",
      "notice-unbuildable",
      "price-book-mismatch",
      "unexpected",
      ...KITCHEN_LINK_CAUSES,
    ].join("|")})$`,
  ),
  mailFailureKind:
    /^(unreadable-answer|payload-mismatch|busy|quota-spent|refused|unreachable|timed-out)$/,
  providerStatus: /^[1-5][0-9]{2}$/,
  reference: /^[0-9A-Z-]{6,32}$/,
};
const SENT_AT_ONCE = 5;
const DAY_MS = 86_400_000;
const FIRST_DAY = new Date("2026-10-10T00:20:00Z");
const NOT_SENT = { ok: false, kind: "busy" } as const;
const LINE_BREAKERS: readonly (readonly [string, number])[] = [
  ["a line feed", 0x0a],
  ["a carriage return", 0x0d],
  ["a vertical tab", 0x0b],
  ["a form feed", 0x0c],
  ["a next-line control", 0x85],
  ["a line separator", 0x2028],
  ["a paragraph separator", 0x2029],
  ["a null", 0x00],
];
const INJECTED_HEADER = "Bcc: qa8k-injected@example.invalid";
/** The notice's kitchen link writes its line as JSON text; with no public origin in this process it writes one. */
const KITCHEN_LINK_LABEL = "[sent-kitchen-link]";
const NO_ORIGIN_LINE = {
  event: "sent-kitchen-link-unavailable",
  cause: "origin-unset",
} as const;

let post: Post;
let consoleSpies: ReturnType<typeof spyOnEveryConsoleMethod>;

beforeEach(async () => {
  consoleSpies = spyOnEveryConsoleMethod();
  nameTheNetworkSource();
  resetOutside(outside);
  post = await loadRoute();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/** Every line written so far, as the structured second argument of the console call that wrote it. */
function linesWritten(): Record<string, unknown>[] {
  return consoleCallsOf(consoleSpies).map(([label, line]) =>
    lineOf(label, line),
  );
}

function lineOf(label: unknown, line: unknown): Record<string, unknown> {
  const fields: unknown =
    label === KITCHEN_LINK_LABEL ? JSON.parse(String(line)) : line;
  return (fields ?? {}) as Record<string, unknown>;
}

function eventsWritten(): unknown[] {
  return linesWritten().map(({ event }) => event);
}

/** The design's request by e-mail from the marker browser: every field a customer can fill is a marker. */
function full(overrides: Fields = {}, contact: Fields = {}): Fields {
  return designRequest(overrides, { ...byEmail(), ...contact });
}

function sendFull(fields: Fields): Promise<Response> {
  return send(post, fields, { withVisitor: true });
}

describe("one id with any stored or mailed field changed is a conflict", () => {
  const CHANGED: readonly (readonly [string, Fields, Fields])[] = [
    ["the name", {}, { name: `${MARKER.name} II` }],
    ["the phone", {}, { phone: "069 741 853" }],
    ["the same phone typed another way", {}, { phone: "069741852" }],
    ["the locality", {}, { locality: "Altundeva" }],
    ["the locality emptied", {}, { locality: "" }],
    ["the channel", {}, { channel: "whatsapp", email: undefined }],
    ["the address", {}, { email: "other.7c41@example.invalid" }],
    [
      "the address in another case",
      {},
      { email: MARKER.address.toUpperCase() },
    ],
    ["the language", { locale: "ru" }, {}],
    [
      "the design's revision",
      { design: { id: MARKER.designId, revision: "2" } },
      {},
    ],
    ["the design", { design: { id: ANOTHER_DESIGN_ID, revision: "1" } }, {}],
    ["a design made a callback", { design: undefined, intent: "callback" }, {}],
  ];

  it.each(CHANGED)(
    "refuses %s, storing and sending nothing more",
    async (_name, overrides, contact) => {
      const first = await sendFull(full());
      const stored = JSON.stringify(outside.heldStore.heldSubmissions());

      const second = await sendFull(full(overrides, contact));

      expect(first.status).toBe(200);
      expect(second.status).toBe(409);
      expect(await second.json()).toEqual({
        error: expect.any(String) as string,
        code: "CONTACT_REQUEST_CONFLICT",
      });
      expect(JSON.stringify(outside.heldStore.heldSubmissions())).toBe(stored);
      expect(outside.fakeSender.sent).toHaveLength(1);
      expect(outside.loadsAsked).toHaveLength(1);
    },
  );

  it("answers the conflict the same whether or not the stored request was notified", async () => {
    resetOutside(outside, [NOT_SENT]);
    const notNotified = [
      await sendFull(full()),
      await sendFull(full({ locale: "ru" })),
    ];
    resetOutside(outside);
    const notified = [
      await sendFull(full()),
      await sendFull(full({ locale: "ru" })),
    ];

    expect(notNotified.map(({ status }) => status)).toEqual([502, 409]);
    expect(notified.map(({ status }) => status)).toEqual([200, 409]);
    expect(await notNotified[1]?.text()).toBe(await notified[1]?.text());
    expect([...(notNotified[1]?.headers ?? [])]).toEqual([
      ...(notified[1]?.headers ?? []),
    ]);
  });
});

describe("one id with nothing stored or mailed changed is the same request", () => {
  const UNCHANGED: readonly (readonly [string, (fields: Fields) => string])[] =
    [
      [
        "a longer time on the form",
        (fields) => JSON.stringify({ ...fields, elapsedMs: 600_000 }),
      ],
      [
        "no honeypot field at all",
        (fields) =>
          JSON.stringify(
            Object.fromEntries(
              Object.entries(fields).filter(([key]) => key !== "honeypot"),
            ),
          ),
      ],
      [
        "its keys in another order",
        (fields) =>
          JSON.stringify(Object.fromEntries(Object.entries(fields).reverse())),
      ],
      [
        "white space between its tokens",
        (fields) => JSON.stringify(fields, null, 4),
      ],
      [
        "spaces round the name, which the form trims",
        (fields) =>
          JSON.stringify(fields).replace(MARKER.name, `  ${MARKER.name}  `),
      ],
    ];

  it.each(UNCHANGED)(
    "answers the first reference for %s, with one row and one notice",
    async (_name, written) => {
      const first = await sendFull(full());

      const second = await post(
        contactRequest(written(full()), { withVisitor: true }),
      );

      expect(second.status).toBe(200);
      expect(await referenceOf(second)).toBe(await referenceOf(first));
      expect(outside.heldStore.heldSubmissions()).toHaveLength(1);
      expect(outside.fakeSender.sent).toHaveLength(1);
    },
  );

  it("answers it to another browser on another network too, with no load of the design", async () => {
    const first = await sendFull(full());
    const loadsBefore = outside.loadsAsked.length;

    const second = await send(post, full(), {
      headers: { "x-forwarded-for": "198.51.77.7" },
    });

    expect(await referenceOf(second)).toBe(await referenceOf(first));
    expect(outside.loadsAsked).toHaveLength(loadsBefore);
  });
});

describe("two calls at once with one id", () => {
  it("are one row and one reference, and each notice handed over carries the one key and the same words", async () => {
    const answers = await Promise.all([sendFull(full()), sendFull(full())]);

    const references = await Promise.all(answers.map(referenceOf));
    expect(answers.map(({ status }) => status)).toEqual([200, 200]);
    expect(new Set(references).size).toBe(1);
    expect(outside.heldStore.heldSubmissions()).toHaveLength(1);
    const { sent } = outside.fakeSender;
    expect(sent.length).toBeGreaterThanOrEqual(1);
    expect(new Set(sent.map(({ key }) => key)).size).toBe(1);
    expect(new Set(sent.map(({ text }) => text)).size).toBe(1);
  });

  it("five at once are still one row, and each is answered the one reference or the one limit", async () => {
    const answers = await Promise.all(
      Array.from({ length: SENT_AT_ONCE }, () => sendFull(full())),
    );

    const statuses = answers.map(({ status }) => status);
    const references = await Promise.all(
      answers.filter(({ status }) => status === 200).map(referenceOf),
    );
    expect(
      statuses.filter((status) => status !== 200 && status !== 429),
    ).toEqual([]);
    expect(new Set(references).size).toBe(1);
    expect(outside.heldStore.heldSubmissions()).toHaveLength(1);
    expect(new Set(outside.fakeSender.sent.map(({ key }) => key)).size).toBe(1);
  });

  it("with two payloads are one row: one is sent and the other is the conflict, with one notice", async () => {
    const answers = await Promise.all([
      sendFull(full()),
      sendFull(full({ locale: "ru" })),
    ]);

    expect(answers.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(outside.heldStore.heldSubmissions()).toHaveLength(1);
    expect(outside.fakeSender.sent).toHaveLength(1);
  });
});

describe("a throw before a reference is held", () => {
  const BEFORE: readonly (readonly [string, () => void])[] = [
    [
      "the lookup",
      () => {
        failTheStoreAt(outside, "lookUp", new Error(THROWN_TEXT));
      },
    ],
    [
      "the design's load",
      () => {
        outside.load = () => Promise.reject(new Error(THROWN_TEXT));
      },
    ],
    [
      "the counters of a new request",
      () => {
        failCountersFrom(2);
      },
    ],
    [
      "the record",
      () => {
        failTheStoreAt(outside, "record", new Error(THROWN_TEXT));
      },
    ],
  ];

  it.each(BEFORE)(
    "at %s is unavailable: no row, nothing sent, and no reference anywhere",
    async (_name, arrange) => {
      arrange();

      const answer = await sendFull(full());

      expect(answer.status).toBe(503);
      expect(await codeOf(answer)).toBe("CONTACT_UNAVAILABLE");
      expect(outside.heldStore.heldSubmissions()).toHaveLength(0);
      expect(outside.fakeSender.sent).toHaveLength(0);
      expect(JSON.stringify(linesWritten())).not.toMatch(/reference/);
    },
  );
});

describe("a throw once a reference is held", () => {
  const AFTER: readonly (readonly [string, () => void])[] = [
    [
      "the send",
      () => {
        outside.sender = { send: () => Promise.reject(new Error(THROWN_TEXT)) };
      },
    ],
    [
      "a send that throws at once",
      () => {
        outside.sender = {
          send: () => {
            throw new Error(THROWN_TEXT);
          },
        };
      },
    ],
  ];

  it.each(AFTER)(
    "at %s is the answer a retry may follow: the row stays, and the reference is in the line alone",
    async (_name, arrange) => {
      arrange();

      const answer = await sendFull(full());

      const [held] = outside.heldStore.heldSubmissions();
      expect(answer.status).toBe(502);
      expect(await answer.json()).toEqual({
        error: expect.any(String) as string,
        code: "CONTACT_NOTICE_NOT_SENT_RETRY",
      });
      expect(outside.heldStore.heldSubmissions()).toHaveLength(1);
      expect(
        linesWritten().filter(
          ({ event }) => event === "contact-notice-not-sent",
        ),
      ).toEqual([
        expect.objectContaining({
          reference: held?.reference,
          cause: "unexpected",
        }),
      ]);
    },
  );

  it("is followed by a retry that sends and answers the stored reference, with still one row", async () => {
    outside.sender = { send: () => Promise.reject(new Error(THROWN_TEXT)) };
    await sendFull(full());
    outside.sender = outside.fakeSender;

    const retried = await sendFull(full());

    expect(retried.status).toBe(200);
    expect(await referenceOf(retried)).toBe(
      outside.heldStore.heldSubmissions()[0]?.reference,
    );
    expect(outside.heldStore.heldSubmissions()).toHaveLength(1);
    expect(outside.fakeSender.sent).toHaveLength(1);
  });

  it("at the mark, after an accepted send, is still the success, and the next call sends once more", async () => {
    failTheStoreAt(outside, "markNotified", new Error(THROWN_TEXT));

    const answer = await sendFull(full());

    expect(answer.status).toBe(200);
    expect(await referenceOf(answer)).toBe(
      outside.heldStore.heldSubmissions()[0]?.reference,
    );
    expect(eventsWritten()).toContain("contact-mark-failed");
    expect(outside.fakeSender.sent).toHaveLength(1);
    const next = await sendFull(full());
    expect(next.status).toBe(200);
    expect(outside.fakeSender.sent).toHaveLength(2);
    expect(outside.heldStore.heldSubmissions()).toHaveLength(1);
  });

  it("at the design's load of a retry is the same answer, naming the stored request in its line", async () => {
    resetOutside(outside, [NOT_SENT]);
    await sendFull(full());
    outside.load = () => Promise.reject(new Error(THROWN_TEXT));

    const retried = await sendFull(full());

    expect(retried.status).toBe(502);
    expect(await codeOf(retried)).toBe("CONTACT_NOTICE_NOT_SENT_RETRY");
    expect(linesWritten().at(-1)).toMatchObject({
      event: "contact-notice-not-sent",
      reference: outside.heldStore.heldSubmissions()[0]?.reference,
    });
  });
});

describe("the notice the sender is handed", () => {
  it("never carries the placeholder reference, on a first send or a retry", async () => {
    resetOutside(outside, [NOT_SENT]);
    await sendFull(full());
    await sendFull(full());
    await send(post, callbackRequest({ clientRequestId: requestIdOf("cb") }));

    const handed = JSON.stringify(outside.fakeSender.sent);
    expect(outside.fakeSender.sent).toHaveLength(3);
    expect(handed).not.toContain(PLACEHOLDER_REFERENCE);
  });

  it("is keyed by the request's id alone, so every try of one request is one message to the provider", async () => {
    resetOutside(outside, [NOT_SENT, NOT_SENT]);
    for (let tried = 0; tried < 3; tried += 1) await sendFull(full());

    const keys = outside.fakeSender.sent.map(({ key }) => key);
    expect(keys).toEqual(
      Array.from({ length: 3 }, () => `lead-notification/${MARKER.requestId}`),
    );
  });

  describe.each(LINE_BREAKERS)(
    "with %s in a customer's field",
    (_name, codePoint) => {
      const breaker = String.fromCodePoint(codePoint);
      const injected = `Ana${breaker}${INJECTED_HEADER}${breaker}${breaker}Body`;

      it.each([
        ["the name", { name: injected }],
        ["the locality", { locality: injected }],
        ["the phone", { phone: `069 741 852${breaker}${INJECTED_HEADER}` }],
        [
          "the address",
          { email: `ana${breaker}${INJECTED_HEADER}@example.invalid` },
        ],
      ])(
        "in %s, is refused by the schema: nothing is stored and no message is made",
        async (_field, contact) => {
          const answer = await sendFull(full({}, contact));

          expect(answer.status).toBe(400);
          expect(await codeOf(answer)).toBe("CONTACT_INVALID");
          expect(outside.heldStore.heldSubmissions()).toHaveLength(0);
          expect(outside.fakeSender.sent).toHaveLength(0);
        },
      );
    },
  );

  it("keeps a header's words a customer typed inside one line of its text, and out of its subject", async () => {
    const answer = await sendFull(
      full({}, { name: INJECTED_HEADER, locality: "Subject: qa8k-injected" }),
    );

    const [message] = outside.fakeSender.sent;
    const lines = (message?.text ?? "").split("\n");
    expect(answer.status).toBe(200);
    expect(message?.subject).not.toMatch(/[\p{Cc}\p{Zl}\p{Zp}]|injected/u);
    expect(lines.filter((line) => /^(Bcc|Subject):/.test(line))).toEqual([]);
    expect(lines.filter((line) => line.includes(INJECTED_HEADER))).toHaveLength(
      1,
    );
  });
});

describe("no line on any branch holds anything submitted or thrown", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: FIRST_DAY, toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Each branch is walked on a day of its own, so no bucket of an earlier one answers for it. */
  function aDayLater(): void {
    vi.setSystemTime(new Date(Date.now() + DAY_MS));
  }

  /** Every branch of the route once, with marker values in every field, header and thrown text. */
  async function walkEveryBranch(): Promise<void> {
    const walk = async (arrange: () => void, fields: Fields, headers = {}) => {
      aDayLater();
      resetOutside(outside);
      post = await loadRoute();
      arrange();
      await send(post, fields, { withVisitor: true, headers });
      await send(post, fields, { withVisitor: true, headers });
    };
    const fresh = (label: string, overrides: Fields = {}) =>
      full({ clientRequestId: `${MARKER.requestId}_${label}`, ...overrides });
    await walk(() => undefined, fresh("sent"));
    await walk(() => undefined, fresh("cross"), {
      "sec-fetch-site": "cross-site",
    });
    await walk(() => undefined, fresh("type"), { "content-type": MARKER.name });
    await walk(
      () => undefined,
      fresh("invalid", {
        locale: MARKER.name,
        [MARKER.locality]: MARKER.phone,
      }),
    );
    await walk(() => undefined, fresh("honeypot", { honeypot: MARKER.name }));
    await walk(() => undefined, fresh("fast", { elapsedMs: 0 }));
    await walk(() => {
      outside.load = () => Promise.resolve(found(undefined, "2"));
    }, fresh("stale"));
    await walk(() => {
      outside.load = () =>
        Promise.resolve(found(NARROWED_ROOM_OVERFLOWING_DESIGN));
    }, fresh("wall"));
    await walk(() => {
      resetOutside(outside, [
        NOT_SENT,
        { ok: false, kind: "refused", status: 422 },
      ]);
    }, fresh("mail"));
    await walk(() => {
      outside.sender = { send: () => Promise.reject(new Error(THROWN_TEXT)) };
    }, fresh("send-throws"));
    await walk(() => {
      failTheStoreAt(outside, "markNotified", new Error(THROWN_TEXT));
    }, fresh("mark-throws"));
    await walk(() => {
      failTheStoreAt(outside, "record", new Error(THROWN_TEXT));
    }, fresh("record-throws"));
    await walk(() => {
      failTheStoreAt(outside, "lookUp", new Error(THROWN_TEXT));
    }, fresh("lookup-throws"));
    await walk(() => {
      outside.load = () => Promise.reject(new Error(THROWN_TEXT));
    }, fresh("load-throws"));
    await walk(() => {
      outside.store = undefined as never;
    }, fresh("no-store"));
    await walk(() => vi.stubEnv("DIGEST_SECRET", MARKER.name), fresh("secret"));
    vi.unstubAllEnvs();
    nameTheNetworkSource();
    aDayLater();
    resetOutside(outside);
    post = await loadRoute();
    await sendFull(fresh("conflict"));
    await sendFull(fresh("conflict", { locale: "ru" }));
    for (let sent = 0; sent < PAST_EVERY_FIGURE; sent += 1)
      await sendFull(fresh(`flood-${String(sent)}`));
    await post(
      contactRequest(MARKER.name.repeat(BOUND_BYTES), { withVisitor: true }),
    );
    await walk(() => {
      failCountersFrom(1);
    }, fresh("counters"));
  }

  it("writes a line on the branches that have one, and none holds a marker", async () => {
    await walkEveryBranch();

    const written = JSON.stringify(consoleCallsOf(consoleSpies));
    expect(new Set(eventsWritten())).toEqual(
      new Set([
        "contact-request-refused",
        "contact-request-unavailable",
        "contact-notice-not-sent",
        "contact-mark-failed",
        NO_ORIGIN_LINE.event,
      ]),
    );
    for (const marker of [
      ...SUBMITTED_MARKERS,
      "thrown about",
      ANOTHER_DESIGN_ID,
    ]) {
      expect(written.includes(marker), marker).toBe(false);
    }
  });

  it("makes no request out of the process on any branch: a notice leaves by the sender handed in alone", async () => {
    const requestsOut = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("no request may leave the process"));

    await walkEveryBranch();

    expect(requestsOut).not.toHaveBeenCalled();
  });

  it("writes only a label and one flat line, each key a known one and each value of that key's own form", async () => {
    await walkEveryBranch();

    for (const [label, line, ...rest] of consoleCallsOf(consoleSpies)) {
      expect(["[contact]", KITCHEN_LINK_LABEL]).toContain(label);
      expect(rest).toEqual([]);
      for (const [key, value] of Object.entries(lineOf(label, line))) {
        expect(Object.keys(LINE_VALUES)).toContain(key);
        expect(String(value), key).toMatch(LINE_VALUES[key] ?? /^$/);
      }
    }
  });
});

describe("how often a line is written", () => {
  async function linesAfterAFloodOf(
    make: () => Promise<Response>,
  ): Promise<number> {
    for (let sent = 0; sent < FLOOD; sent += 1) await make();
    return linesWritten().length;
  }

  it.each([
    [
      "a request from another site",
      () =>
        send(post, callbackRequest(), {
          headers: { "sec-fetch-site": "cross-site" },
        }),
    ],
    [
      "a body that is not JSON by its type",
      () =>
        send(post, callbackRequest(), {
          headers: { "content-type": "text/plain" },
        }),
    ],
    [
      "a body past its bound",
      () => post(contactRequest("x".repeat(BOUND_BYTES + 1))),
    ],
    [
      "a request the schema refuses",
      () => send(post, callbackRequest({ locale: "xx" })),
    ],
    [
      "a design that is not current",
      () =>
        send(
          post,
          designRequest({ design: { id: ANOTHER_DESIGN_ID, revision: "9" } }),
        ),
    ],
  ])("is once for a process for a flood of %s", async (_name, make) => {
    outside.load = () =>
      Promise.resolve({ kind: "refused", reason: "unavailable" });

    expect(await linesAfterAFloodOf(make)).toBe(1);
  });

  it.each([
    ["a filled honeypot", { honeypot: "x" }],
    ["a form sent too fast", { elapsedMs: 1999 }],
  ])("is never for %s", async (_name, overrides) => {
    expect(
      await linesAfterAFloodOf(() => send(post, callbackRequest(overrides))),
    ).toBe(0);
  });

  it("is once for a process for a flood of conflicts on one id, with its code and status alone", async () => {
    await sendFull(full());

    for (let sent = 0; sent < FLOOD; sent += 1) {
      await sendFull(full({ locale: "ru" }));
    }

    // Gathered method by method, so the two lines' order is the console's, not the request's.
    expect(linesWritten()).toHaveLength(2);
    expect(linesWritten()).toEqual(
      expect.arrayContaining([
        NO_ORIGIN_LINE,
        {
          event: "contact-request-refused",
          refusalCode: "CONTACT_REQUEST_CONFLICT",
          status: 409,
        },
      ]),
    );
  });

  it("is once for a process and a policy for a limit, and each time for unavailable", async () => {
    for (let sent = 0; sent < PAST_EVERY_FIGURE; sent += 1) {
      await post(contactRequest("{{{"));
    }
    const limitLines = linesWritten().filter(
      ({ refusalCode }) => refusalCode === "CONTACT_LIMIT_REACHED",
    );
    failCountersFrom(1);

    for (let sent = 0; sent < FLOOD; sent += 1)
      await send(post, callbackRequest());

    expect(limitLines).toHaveLength(1);
    expect(
      linesWritten().filter(
        ({ event }) => event === "contact-request-unavailable",
      ),
    ).toHaveLength(FLOOD);
  });

  it("is each time for a stored request whose retry is refused for its design, with its reference", async () => {
    resetOutside(outside, [NOT_SENT]);
    await sendFull(full());
    outside.load = () => Promise.resolve(found(undefined, "2"));

    for (let tried = 0; tried < 3; tried += 1) await sendFull(full());

    const reference = outside.heldStore.heldSubmissions()[0]?.reference;
    expect(
      linesWritten().filter(
        ({ event }) => event === "contact-stored-request-refused",
      ),
    ).toEqual(
      Array.from({ length: 3 }, () => ({
        event: "contact-stored-request-refused",
        refusalCode: "CONTACT_DESIGN_NOT_CURRENT",
        status: 409,
        reference,
      })),
    );
  });
});
